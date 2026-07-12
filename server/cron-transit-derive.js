"use strict";
require("dotenv").config();
const cron = require("node-cron");

// Nightly derivation of yesterday's transit archive (see transit-derive.js).
// Runs 03:10 Tbilisi (23:10 UTC) — after the 01:00 service close, before the
// 04:30 network snapshot. Re-running a day is safe (idempotent upserts).

const enabled = !!(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID &&
                   process.env.R2_SECRET_ACCESS_KEY && process.env.SUPABASE_SERVICE_KEY);

if (enabled) {
  const { deriveDay } = require("./transit-derive");
  cron.schedule("10 23 * * *", async () => {
    const y = new Date(Date.now() - 86400000 + 4 * 3600000).toISOString().slice(0, 10);
    try { await deriveDay(y); }
    catch (e) { console.error("[derive-cron] failed for", y, "—", e.message); }
  }, { timezone: "UTC" });
  console.log("[derive-cron] scheduled — nightly 03:10 Tbilisi for previous service day");
} else {
  console.warn("[derive-cron] missing R2_*/SUPABASE_SERVICE_KEY env — derivation disabled");
}
