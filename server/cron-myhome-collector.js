"use strict";
require("dotenv").config();
const cron = require("node-cron");
const { createClient } = require("@supabase/supabase-js");
const api = require("./myhome-api");

// ── Myhome.ge listing collector ───────────────────────────────────────────────
// Mirrors the public myhome.ge statement feed into Supabase so the map layer
// queries our own Postgres instead of a third party on every pan.
//
// Two modes:
//   backfill     — walk every page once (~700 requests for the full ~344k rows
//                  at per_page=500). Run it by hand, not on a schedule.
//   incremental  — the API sorts by last_updated DESC, so a sync only has to
//                  read pages until it crosses the previous run's watermark.
//                  A quiet hour is one or two requests.
//
//   node cron-myhome-collector.js --backfill
//   node cron-myhome-collector.js --once          (one incremental pass)
//   node cron-myhome-collector.js --dry-run       (fetch + normalize, no writes)
//
// Nothing is ever hard-deleted: a listing that stops appearing gets
// delisted_at set, so price history and gone-from-market analysis survive.

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ENABLED       = String(process.env.MYHOME_SYNC_ENABLED || "").toLowerCase() === "true";
const CRON_EXPR     = process.env.MYHOME_SYNC_CRON || "17 * * * *";   // hourly, off the hour
const PER_PAGE      = Number(process.env.MYHOME_PER_PAGE || 500);
const MAX_PAGES_INC = Number(process.env.MYHOME_MAX_PAGES_INCREMENTAL || 40);
const MAX_PAGES_BF  = Number(process.env.MYHOME_MAX_PAGES_BACKFILL || 1200);
const CHUNK         = 500;            // rows per upsert
const OVERLAP_MS    = 10 * 60 * 1000; // re-read a 10 min tail; cheap insurance
                                      // against clock skew and late edits

const sb = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
  : null;

if (!sb) {
  console.warn("[myhome] SUPABASE_URL / SUPABASE_SERVICE_KEY not set — collector disabled");
} else if (!ENABLED) {
  console.warn("[myhome] MYHOME_SYNC_ENABLED is not 'true' — collector idle (set it to enable the schedule)");
}

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Myhome timestamps are wall-clock Tbilisi (UTC+4, no DST) with no zone marker.
 * Tagging them explicitly keeps the watermark comparison honest against a
 * server running in any timezone.
 */
function parseTbilisi(ts) {
  if (!ts) return null;
  const iso = String(ts).trim().replace(" ", "T");
  const d = new Date(/[Z+]|-\d{2}:\d{2}$/.test(iso) ? iso : `${iso}+04:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function lastWatermark() {
  const { data, error } = await sb
    .from("myhome_sync_log")
    .select("watermark")
    .eq("ok", true)
    .not("watermark", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`watermark read failed: ${error.message}`);
  return data && data.length ? new Date(data[0].watermark) : null;
}

async function openRun(mode) {
  const { data, error } = await sb
    .from("myhome_sync_log")
    .insert({ mode })
    .select("id")
    .single();
  if (error) throw new Error(`sync_log insert failed: ${error.message}`);
  return data.id;
}

async function closeRun(runId, patch) {
  const { error } = await sb
    .from("myhome_sync_log")
    .update({ finished_at: new Date().toISOString(), ...patch })
    .eq("id", runId);
  if (error) console.error("[myhome] sync_log update failed:", error.message);
}

async function upsertRows(rows) {
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await sb
      .from("myhome_listings")
      .upsert(slice, { onConflict: "id", ignoreDuplicates: false });
    if (error) throw new Error(`upsert failed at row ${i}: ${error.message}`);
    written += slice.length;
  }
  return written;
}

/** Row shape → DB row. Timestamps normalized, transient fields dropped. */
function toDbRow(n) {
  return {
    ...n,
    published_at: n.published_at ? parseTbilisi(n.published_at)?.toISOString() ?? null : null,
    updated_at:   n.updated_at   ? parseTbilisi(n.updated_at)?.toISOString()   ?? null : null,
    delisted_at:  null,   // seen in the feed ⇒ still listed
  };
}

// ── the sync itself ───────────────────────────────────────────────────────────

async function sync({ mode = "incremental", dryRun = false, filters = {} } = {}) {
  const backfill = mode === "backfill";
  const maxPages = backfill ? MAX_PAGES_BF : MAX_PAGES_INC;

  const dicts = await api.getDictionaries();
  const since = backfill || dryRun ? null : await lastWatermark().catch(() => null);
  const cutoff = since ? new Date(since.getTime() - OVERLAP_MS) : null;

  const runId = dryRun ? null : await openRun(mode);
  const stats = { pages: 0, seen: 0, upserted: 0, suspect_geo: 0 };
  let watermark = since;
  const sample = [];

  try {
    for (let page = 1; page <= maxPages; page++) {
      const raw = await api.fetchPage({ page, perPage: PER_PAGE, filters });
      stats.pages++;
      if (!raw.length) break;

      const rows = [];
      let crossedCutoff = false;

      for (const r of raw) {
        const n = api.normalize(r, dicts);
        if (!n) continue;
        stats.seen++;
        if (n.geo_suspect) stats.suspect_geo++;

        const updated = parseTbilisi(n.updated_at);
        if (updated && (!watermark || updated > watermark)) watermark = updated;
        // The feed is last_updated DESC, so once a row predates the cutoff
        // every row after it does too.
        if (cutoff && updated && updated <= cutoff) { crossedCutoff = true; continue; }

        rows.push(toDbRow(n));
        if (dryRun && sample.length < 3) sample.push(n);
      }

      if (rows.length && !dryRun) stats.upserted += await upsertRows(rows);
      else if (dryRun) stats.upserted += rows.length;

      console.log(`[myhome] page ${page}: ${raw.length} rows, ${rows.length} new/changed, ${stats.suspect_geo} suspect pins so far`);

      if (crossedCutoff) { console.log("[myhome] reached watermark — stopping"); break; }
      if (raw.length < PER_PAGE) break;   // last page
    }

    if (dryRun) {
      console.log(`[myhome] DRY RUN — ${stats.seen} listings normalized, nothing written`);
      for (const s of sample) console.log(JSON.stringify(s, null, 2));
      return stats;
    }

    await closeRun(runId, {
      ...stats,
      watermark: watermark ? watermark.toISOString() : null,
      ok: true,
    });
    console.log(`[myhome] ${mode} complete — ${stats.seen} seen, ${stats.upserted} upserted, ${stats.suspect_geo} flagged, watermark ${watermark ? watermark.toISOString() : "none"}`);
    return stats;
  } catch (e) {
    if (runId) await closeRun(runId, { ...stats, ok: false, notes: e.message });
    console.error(`[myhome] ${mode} failed:`, e.message);
    throw e;
  }
}

/**
 * Mark listings that have not been seen for `days` as delisted. Run weekly:
 * the feed only ever shows live listings, so absence is the only signal that
 * something sold or was withdrawn.
 */
async function markDelisted(days = 30) {
  if (!sb) return;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const { error, count } = await sb
    .from("myhome_listings")
    .update({ delisted_at: new Date().toISOString() }, { count: "exact" })
    .lt("fetched_at", cutoff)
    .is("delisted_at", null);
  if (error) return console.error("[myhome] delist sweep failed:", error.message);
  console.log(`[myhome] delist sweep: ${count ?? 0} listings not seen in ${days} days`);
}

// ── CLI + schedule ────────────────────────────────────────────────────────────

if (require.main === module) {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const mode = argv.includes("--backfill") ? "backfill" : "incremental";
  if (!sb && !dryRun) {
    console.error("[myhome] refusing to run: Supabase credentials missing (use --dry-run to test the fetch path)");
    process.exit(1);
  }
  sync({ mode, dryRun }).then(() => process.exit(0)).catch(() => process.exit(1));
} else if (sb && ENABLED) {
  cron.schedule(CRON_EXPR, () => sync({ mode: "incremental" }).catch(() => {}));
  cron.schedule("40 2 * * 1", () => markDelisted(30).catch(() => {}), { timezone: "UTC" });
  console.log(`[myhome] scheduled — incremental sync '${CRON_EXPR}', delist sweep Mondays 06:40 Tbilisi`);
}

module.exports = { sync, markDelisted };
