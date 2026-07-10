"use strict";
require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const crypto  = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app  = express();
const PORT = process.env.PORT || 3001;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Raw body must be parsed before json() for webhook signature verification
app.use("/webhooks", express.raw({ type: "*/*" }));
app.use(express.json());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*", credentials: true }));

// ── Auth middleware ───────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing auth token" });
  const { data, error } = await supabase.auth.getUser(header.slice(7));
  if (error || !data.user) return res.status(401).json({ error: "Invalid or expired token" });
  req.user = data.user;
  next();
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true }));

// ── GET /api/me ───────────────────────────────────────────────────────────────
app.get("/api/me", requireAuth, async (req, res) => {
  const [profileRes, subRes] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", req.user.id).single(),
    supabase.from("subscriptions").select("plan, status, billing_interval, current_period_end").eq("user_id", req.user.id).single(),
  ]);

  const sub = subRes.data;
  res.json({
    id:        req.user.id,
    email:     req.user.email,
    name:      profileRes.data?.full_name || "",
    avatarUrl: profileRes.data?.avatar_url || null,
    plan:      sub?.plan   || "free",
    status:    sub?.status || "free",
    billingInterval: sub?.billing_interval || "month",
    periodEnd: sub?.current_period_end || null,
  });
});

// ── POST /webhooks/paddle ─────────────────────────────────────────────────────
app.post("/webhooks/paddle", async (req, res) => {
  const secret    = process.env.PADDLE_WEBHOOK_SECRET;
  const sigHeader = req.headers["paddle-signature"];
  if (!sigHeader || !secret) return res.status(401).json({ error: "Missing signature or secret" });

  const parts = Object.fromEntries(sigHeader.split(";").map(p => p.split("=")));
  const body  = req.body.toString();
  const computed = crypto.createHmac("sha256", secret).update(`${parts.ts}:${body}`).digest("hex");
  if (computed !== parts.h1) return res.status(401).json({ error: "Invalid signature" });

  await handlePaddleEvent(JSON.parse(body));
  res.json({ received: true });
});

async function handlePaddleEvent(event) {
  const data   = event.data;
  const userId = data?.custom_data?.user_id;

  console.log(`[paddle] event=${event.event_type} userId=${userId}`);

  if (!userId) {
    console.warn("[paddle] no user_id in custom_data — skipping");
    return;
  }

  let result;

  switch (event.event_type) {
    case "transaction.completed":
      // For subscription transactions, period_end is managed by subscription.activated/updated.
      // Only set it here for one-off (non-subscription) transactions.
      result = await supabase.from("subscriptions").upsert({
        user_id:                userId,
        plan:                   "pro",
        status:                 "active",
        paddle_subscription_id: data.subscription_id ?? data.id ?? null,
        billing_interval:       data.items?.[0]?.price?.billing_cycle?.interval ?? "month",
        ...(!data.subscription_id ? { current_period_end: data.billing_period?.ends_at ?? data.next_billed_at ?? null } : {}),
        paddle_customer_id:     data.customer_id ?? null,
        updated_at:             new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (data.custom_data?.marketing_consent !== undefined) {
        await supabase.from("profiles").update({
          marketing_consent: !!data.custom_data.marketing_consent,
        }).eq("id", userId);
      }
      break;

    case "subscription.activated": {
      // Anchor the first period end to subscription start so the trial is included
      // within the first billing cycle rather than added on top of it.
      const _startedAt = data.started_at ?? data.created_at ?? new Date().toISOString();
      const _interval  = data.items?.[0]?.price?.billing_cycle?.interval ?? "month";
      const _intervalMs = _interval === "year" ? 365 * 86400000 : 30 * 86400000;
      const _periodEndFromStart = new Date(new Date(_startedAt).getTime() + _intervalMs).toISOString();
      result = await supabase.from("subscriptions").upsert({
        user_id:                   userId,
        plan:                      "pro",
        status:                    data.status || "active",
        paddle_subscription_id:    data.id ?? null,
        billing_interval:          _interval,
        current_period_end:        _periodEndFromStart,
        paddle_customer_id:        data.customer_id ?? null,
        subscription_started_at:   _startedAt,
        updated_at:                new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (data.custom_data?.marketing_consent !== undefined) {
        await supabase.from("profiles").update({
          marketing_consent: !!data.custom_data.marketing_consent,
        }).eq("id", userId);
      }
      break;
    }

    case "subscription.updated": {
      const periodEnd = data.current_billing_period?.ends_at ?? null;
      const periodInFuture = periodEnd && new Date(periodEnd) > new Date();
      // Paddle emits status:"canceled" for subscriptions scheduled to cancel at period end.
      // Map that to "canceling" so the client still grants Pro access until expiry.
      const mappedStatus = (data.status === "canceled" && periodInFuture) ? "canceling" : data.status;

      // Guard: don't overwrite period_end while we're still inside the first billing cycle
      // (this fires when the trial ends and Paddle activates the paid period, which would
      // set ends_at = trial_end + interval instead of our start + interval).
      const { data: existingSub } = await supabase.from("subscriptions")
        .select("subscription_started_at, billing_interval")
        .eq("user_id", userId).single();
      const _startMs = existingSub?.subscription_started_at ? new Date(existingSub.subscription_started_at).getTime() : null;
      const _intMs   = (existingSub?.billing_interval === "year" ? 365 : 30) * 86400000;
      const _inFirstPeriod = _startMs && ((_startMs + _intMs) > Date.now());

      result = await supabase.from("subscriptions").update({
        status:             mappedStatus,
        ...(!_inFirstPeriod ? { current_period_end: periodEnd } : {}),
        updated_at:         new Date().toISOString(),
      }).eq("user_id", userId);
      break;
    }

    case "subscription.canceled":
      result = await supabase.from("subscriptions").update({
        status:             "canceling",
        current_period_end: data.canceled_at ?? data.current_billing_period?.ends_at ?? null,
        updated_at:         new Date().toISOString(),
      }).eq("user_id", userId);
      break;

    case "subscription.past_due":
      result = await supabase.from("subscriptions").update({
        status:     "past_due",
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);
      break;

    case "subscription.paused":
      result = await supabase.from("subscriptions").update({
        status:     "paused",
        plan:       "free",
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);
      break;

    default:
      console.log(`[paddle] unhandled event type: ${event.event_type}`);
      return;
  }

  if (result?.error) {
    console.error(`[paddle] supabase error for ${event.event_type}:`, result.error);
  } else {
    console.log(`[paddle] supabase write OK for ${event.event_type}, userId=${userId}`);
  }
}

// ── POST /api/paddle/cancel ───────────────────────────────────────────────────
// Monthly: cancels at end of current billing period.
// Yearly within 30 days of start: cancels immediately (refund eligible).
app.post("/api/paddle/cancel", requireAuth, async (req, res) => {
  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("paddle_subscription_id, billing_interval, current_period_end, status, subscription_started_at")
    .eq("user_id", req.user.id)
    .in("status", ["active", "trialing"])
    .single();

  if (error || !sub?.paddle_subscription_id) {
    return res.status(404).json({ error: "No active subscription found" });
  }

  const isTrialing   = sub.status === "trialing";
  const periodEnd    = sub.current_period_end ? new Date(sub.current_period_end) : null;
  const daysUntilEnd = periodEnd ? (periodEnd.getTime() - Date.now()) / 86_400_000 : 999;
  // Trial: always cancel immediately (no charge). Yearly within 30 days: cancel immediately (refund eligible).
  const immediateRefund = !isTrialing && sub.billing_interval === "year" && daysUntilEnd >= 335;
  const effectiveFrom   = (isTrialing || immediateRefund) ? "immediately" : "next_billing_period";

  const paddleBase = process.env.PADDLE_SANDBOX === "true"
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com";

  const paddleRes = await fetch(`${paddleBase}/subscriptions/${sub.paddle_subscription_id}/cancel`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${process.env.PADDLE_API_KEY}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ effective_from: effectiveFrom }),
  });

  if (!paddleRes.ok) {
    return res.status(paddleRes.status).json({ error: await paddleRes.text() });
  }

  await supabase.from("subscriptions").update({
    status:     immediateRefund ? "canceled" : "canceling",
    updated_at: new Date().toISOString(),
    ...(immediateRefund ? { plan: "free", paddle_subscription_id: null } : {}),
  }).eq("user_id", req.user.id);

  res.json({ effective_from: effectiveFrom, was_trial: isTrialing });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`Urbanyx server running on port ${PORT}`));

module.exports = app;
