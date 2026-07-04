/**
 * Parcel Viewer — Backend Server
 * Node.js + Express
 *
 * Install deps:
 *   npm install express cors @supabase/supabase-js dotenv node-fetch
 *
 * Environment variables (create a .env file):
 *   PORT=3001
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY=eyJ...   ← service role key (never expose to client)
 *   SUPABASE_JWT_SECRET=...       ← from Supabase Dashboard → Settings → API
 *   ALLOWED_ORIGIN=https://yourdomain.com
 *
 *   # Fill these when you pick a payment provider:
 *   PAYMENT_PROVIDER=             ← 'stripe' | 'lemonsqueezy'
 *   STRIPE_SECRET_KEY=
 *   STRIPE_WEBHOOK_SECRET=
 *   STRIPE_PRO_PRICE_ID=
 *   LEMONSQUEEZY_API_KEY=
 *   LEMONSQUEEZY_WEBHOOK_SECRET=
 *   LEMONSQUEEZY_VARIANT_ID=
 */

"use strict";
require("dotenv").config();

const express   = require("express");
const cors      = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Supabase admin client (service role — server only) ───────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*", credentials: true }));

// Raw body needed for webhook signature verification — keep before json()
app.use("/webhooks", express.raw({ type: "application/json" }));
app.use(express.json());

// ── Auth middleware ───────────────────────────────────────────────────────────
// Verifies the Supabase JWT sent in Authorization: Bearer <token>
// Attaches req.user = { id, email } on success.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  const token = header.slice(7);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  req.user = data.user;
  next();
}

// Verifies the user has an active pro subscription.
async function requirePro(req, res, next) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", req.user.id)
    .single();

  if (error || !data || data.plan !== "pro" || data.status !== "active") {
    return res.status(403).json({ error: "Pro subscription required" });
  }
  next();
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get("/health", (req, res) => res.json({ ok: true }));

// ── GET /api/me ───────────────────────────────────────────────────────────────
// Returns the current user's profile + subscription plan.
// Called by the frontend on page load to restore session state.
app.get("/api/me", requireAuth, async (req, res) => {
  const [profileRes, subRes] = await Promise.all([
    supabase.from("profiles").select("email, full_name, avatar_url").eq("id", req.user.id).single(),
    supabase.from("subscriptions").select("plan, status, current_period_end, cancel_at_period_end").eq("user_id", req.user.id).single()
  ]);

  res.json({
    id:        req.user.id,
    email:     profileRes.data?.email     || req.user.email,
    name:      profileRes.data?.full_name || "",
    avatarUrl: profileRes.data?.avatar_url || null,
    plan:      subRes.data?.plan   || "free",
    status:    subRes.data?.status || "active",
    periodEnd: subRes.data?.current_period_end || null,
    cancelAtPeriodEnd: subRes.data?.cancel_at_period_end || false
  });
});

// ── POST /api/checkout ────────────────────────────────────────────────────────
// Creates a payment session and returns a checkout URL.
// Replace the body with your provider's SDK call.
app.post("/api/checkout", requireAuth, async (req, res) => {
  const provider = process.env.PAYMENT_PROVIDER;

  if (provider === "stripe") {
    return handleStripeCheckout(req, res);
  }
  if (provider === "lemonsqueezy") {
    return handleLemonSqueezyCheckout(req, res);
  }

  // No provider configured yet — return a stub URL for testing
  res.json({ url: null, message: "Payment provider not configured. Set PAYMENT_PROVIDER in .env" });
});

// ── Stripe checkout (fill in when ready) ─────────────────────────────────────
async function handleStripeCheckout(req, res) {
  try {
    const Stripe = require("stripe");
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    // Get or create Stripe customer
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("provider_customer_id")
      .eq("user_id", req.user.id)
      .single();

    let customerId = sub?.provider_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: req.user.email, metadata: { supabase_uid: req.user.id } });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer:   customerId,
      mode:       "subscription",
      line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID, quantity: 1 }],
      success_url: `${process.env.ALLOWED_ORIGIN}?upgraded=1`,
      cancel_url:  `${process.env.ALLOWED_ORIGIN}?cancelled=1`,
      metadata:   { supabase_uid: req.user.id }
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error("Stripe checkout error:", e.message);
    res.status(500).json({ error: e.message });
  }
}

// ── LemonSqueezy checkout (fill in when ready) ────────────────────────────────
async function handleLemonSqueezyCheckout(req, res) {
  try {
    const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
        "Content-Type": "application/vnd.api+json",
        "Accept": "application/vnd.api+json"
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              email: req.user.email,
              custom: { supabase_uid: req.user.id }
            }
          },
          relationships: {
            store:   { data: { type: "stores",   id: process.env.LEMONSQUEEZY_STORE_ID } },
            variant: { data: { type: "variants", id: process.env.LEMONSQUEEZY_VARIANT_ID } }
          }
        }
      })
    });
    const data = await response.json();
    const url  = data?.data?.attributes?.url;
    if (!url) throw new Error("No checkout URL in LemonSqueezy response");
    res.json({ url });
  } catch (e) {
    console.error("LemonSqueezy checkout error:", e.message);
    res.status(500).json({ error: e.message });
  }
}

// ── POST /api/portal ──────────────────────────────────────────────────────────
// Returns a billing portal URL so users can manage/cancel their subscription.
app.post("/api/portal", requireAuth, async (req, res) => {
  const provider = process.env.PAYMENT_PROVIDER;

  if (provider === "stripe") {
    try {
      const Stripe = require("stripe");
      const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("provider_customer_id")
        .eq("user_id", req.user.id)
        .single();

      if (!sub?.provider_customer_id) return res.status(400).json({ error: "No customer found" });

      const session = await stripe.billingPortal.sessions.create({
        customer:   sub.provider_customer_id,
        return_url: process.env.ALLOWED_ORIGIN
      });
      return res.json({ url: session.url });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.json({ url: null, message: "Billing portal not configured" });
});

// ── POST /webhooks/stripe ─────────────────────────────────────────────────────
// Stripe sends events here after payment / cancellation.
// Add your Stripe webhook secret to .env as STRIPE_WEBHOOK_SECRET.
app.post("/webhooks/stripe", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    const Stripe = require("stripe");
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error("Stripe webhook signature failed:", e.message);
    return res.status(400).json({ error: e.message });
  }

  await handleStripeEvent(event);
  res.json({ received: true });
});

async function handleStripeEvent(event) {
  const obj = event.data.object;
  const uid  = obj.metadata?.supabase_uid || obj.customer_details?.metadata?.supabase_uid;

  switch (event.type) {
    case "checkout.session.completed":
    case "invoice.payment_succeeded": {
      if (!uid) break;
      // Activate pro
      await supabase.from("subscriptions").upsert({
        user_id:             uid,
        plan:                "pro",
        status:              "active",
        provider:            "stripe",
        provider_customer_id: obj.customer,
        provider_sub_id:     obj.subscription,
        current_period_end:  obj.current_period_end
          ? new Date(obj.current_period_end * 1000).toISOString() : null,
        updated_at:          new Date().toISOString()
      }, { onConflict: "user_id" });
      break;
    }

    case "customer.subscription.updated": {
      const sub = obj;
      // Find user by customer ID
      const { data } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("provider_customer_id", sub.customer)
        .single();
      if (!data) break;

      await supabase.from("subscriptions").update({
        plan:                sub.status === "active" ? "pro" : "free",
        status:              sub.status,
        cancel_at_period_end: sub.cancel_at_period_end,
        current_period_end:  new Date(sub.current_period_end * 1000).toISOString(),
        updated_at:          new Date().toISOString()
      }).eq("user_id", data.user_id);
      break;
    }

    case "customer.subscription.deleted": {
      const { data } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("provider_customer_id", obj.customer)
        .single();
      if (!data) break;

      await supabase.from("subscriptions").update({
        plan:       "free",
        status:     "cancelled",
        updated_at: new Date().toISOString()
      }).eq("user_id", data.user_id);
      break;
    }
  }
}

// ── POST /webhooks/lemonsqueezy ───────────────────────────────────────────────
app.post("/webhooks/lemonsqueezy", async (req, res) => {
  const crypto   = require("crypto");
  const secret   = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  const signature = req.headers["x-signature"];
  const digest   = crypto.createHmac("sha256", secret).update(req.body).digest("hex");

  if (digest !== signature) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  const event = JSON.parse(req.body.toString());
  await handleLemonSqueezyEvent(event);
  res.json({ received: true });
});

async function handleLemonSqueezyEvent(event) {
  const meta = event.meta;
  const uid  = meta?.custom_data?.supabase_uid;
  const obj  = event.data?.attributes;

  switch (meta?.event_name) {
    case "subscription_created":
    case "subscription_payment_success":
    case "order_created": {
      if (!uid) break;
      await supabase.from("subscriptions").upsert({
        user_id:             uid,
        plan:                "pro",
        status:              "active",
        provider:            "lemonsqueezy",
        provider_customer_id: String(obj?.customer_id || ""),
        provider_sub_id:     String(obj?.id || ""),
        current_period_end:  obj?.renews_at || null,
        updated_at:          new Date().toISOString()
      }, { onConflict: "user_id" });
      break;
    }

    case "subscription_cancelled":
    case "subscription_expired": {
      if (!uid) break;
      await supabase.from("subscriptions").update({
        plan:       "free",
        status:     "cancelled",
        updated_at: new Date().toISOString()
      }).eq("user_id", uid);
      break;
    }
  }
}

// ── Existing proxy routes (from original worker) ──────────────────────────────
// If you are moving away from the Cloudflare worker, migrate these.
// For now they're stubs — keep using your worker for pdf/supabase proxying.

// GET /api/subscription-status — lightweight check used by frontend on load
app.get("/api/subscription-status", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, status, current_period_end, cancel_at_period_end")
    .eq("user_id", req.user.id)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || { plan: "free", status: "active" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Parcel Viewer server running on port ${PORT}`);
  console.log(`Payment provider: ${process.env.PAYMENT_PROVIDER || "not configured (stub mode)"}`);
});

module.exports = app;