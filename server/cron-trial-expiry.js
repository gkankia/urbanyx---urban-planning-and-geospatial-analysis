"use strict";
require("dotenv").config();
const cron    = require("node-cron");
const fetch   = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const EMAILJS_SERVICE_ID  = process.env.EMAILJS_SERVICE_ID  || "service_1qru585";
const EMAILJS_PUBLIC_KEY  = process.env.EMAILJS_PUBLIC_KEY  || "a4S8CQtZNMLh57ruh";
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID || "template_jix4m2h";
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

if (!EMAILJS_PRIVATE_KEY) {
  console.error("[trial-cron] EMAILJS_PRIVATE_KEY is not set — trial reminder emails will be skipped");
}

const EMAIL_CONTENT = {
  fourDay: {
    subject:  "Your Urbanyx Pro trial ends in 4 days",
    headline: "Your Pro trial ends in 4 days",
    body_1:   "You still have 4 days of full Pro access on Urbanyx. Make the most of it — and when you're ready, subscribe to keep everything you've been using.",
    cta_text: "Upgrade to Pro",
  },
  lastDay: {
    subject:  "Last day of your Urbanyx Pro trial",
    headline: "Today is the last day of your Pro trial",
    body_1:   "Your trial ends today. After midnight your account reverts to the free plan and you'll lose access to Pro features. Subscribe now to keep uninterrupted access.",
    cta_text: "Upgrade now",
  },
};

async function sendEmail(toEmail, content) {
  if (!EMAILJS_PRIVATE_KEY) { console.warn("[trial-cron] EMAILJS_PRIVATE_KEY not set"); return; }
  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id:      EMAILJS_SERVICE_ID,
        template_id:     EMAILJS_TEMPLATE_ID,
        user_id:         EMAILJS_PUBLIC_KEY,
        accessToken:     EMAILJS_PRIVATE_KEY,
        template_params: { to_email: toEmail, ...content },
      }),
    });
    if (!res.ok) console.error(`[trial-cron] email failed for ${toEmail}:`, await res.text());
    else         console.log(`[trial-cron] email sent (${content.subject}) → ${toEmail}`);
  } catch (e) {
    console.error(`[trial-cron] email error for ${toEmail}:`, e.message);
  }
}

async function getEmail(userId) {
  const { data: { user }, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !user?.email) { console.warn(`[trial-cron] no email for user ${userId}`); return null; }
  return user.email;
}

async function runTrialMaintenance() {
  console.log("[trial-cron] running at", new Date().toISOString());

  // 1. Expire overdue trials
  const { data: expired, error: expErr } = await supabase
    .from("subscriptions")
    .update({ plan: "free", status: "expired", trial_active: false })
    .eq("status", "trialing")
    .lt("trial_ends_at", new Date().toISOString())
    .select("user_id");

  if (expErr) console.error("[trial-cron] expire error:", expErr.message);
  else        console.log(`[trial-cron] expired ${expired?.length ?? 0} trial(s)`);

  // 2. Day-10 reminder — trial ends in ~4 days (window ±12h around 4 days out)
  const { data: d4 } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("status", "trialing")
    .gte("trial_ends_at", new Date(Date.now() + 3.5 * 86400000).toISOString())
    .lt("trial_ends_at",  new Date(Date.now() + 4.5 * 86400000).toISOString());

  await Promise.all((d4 || []).map(async row => {
    const email = await getEmail(row.user_id);
    if (email) await sendEmail(email, EMAIL_CONTENT.fourDay);
  }));
  console.log(`[trial-cron] 4-day reminders: ${d4?.length ?? 0}`);

  // 3. Day-13 reminder — trial ends in ~1 day (window ±12h around 1 day out)
  const { data: d1 } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("status", "trialing")
    .gte("trial_ends_at", new Date(Date.now() + 0.5 * 86400000).toISOString())
    .lt("trial_ends_at",  new Date(Date.now() + 1.5 * 86400000).toISOString());

  await Promise.all((d1 || []).map(async row => {
    const email = await getEmail(row.user_id);
    if (email) await sendEmail(email, EMAIL_CONTENT.lastDay);
  }));
  console.log(`[trial-cron] 1-day reminders: ${d1?.length ?? 0}`);

}

// Daily at 20:00 UTC = midnight Tbilisi (UTC+4)
cron.schedule("0 20 * * *", runTrialMaintenance, { timezone: "UTC" });
console.log("[trial-cron] scheduled — 20:00 UTC daily");

module.exports = { runTrialMaintenance };
