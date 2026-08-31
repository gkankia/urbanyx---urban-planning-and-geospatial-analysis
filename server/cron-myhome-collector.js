"use strict";
require("dotenv").config();
const cron = require("node-cron");
const { createClient } = require("@supabase/supabase-js");
const api = require("./myhome-api");

// ── Myhome.ge listing collector ───────────────────────────────────────────────
// Mirrors the public myhome.ge statement feed into Supabase so the map layer
// queries our own Postgres instead of a third party on every pan.
//
// TWO PHASES, because the API hands out coordinates grudgingly:
//
//   discovery   List endpoint at per_page=500. Cheap: ~700 requests covers the
//               whole ~344k corpus, and every field except lat/lng is there.
//               Sorted last_updated DESC, so an incremental pass stops as soon
//               as it crosses the previous watermark — usually 1–2 requests.
//
//   enrichment  Detail endpoint, one request per listing, for rows that still
//               have no coordinates. Coordinates don't change after publication,
//               so this is a one-off cost per listing. Budgeted per run
//               (MYHOME_ENRICH_PER_RUN) and scoped by MYHOME_FILTERS so we only
//               pay for the geography Urbanyx actually serves.
//
// Why not bulk: the list endpoint drops lat/lng entirely at per_page >= 4. That
// is a deliberate limit, not a bug — we enrich politely rather than loop the
// list at per_page=3 to defeat it.
//
//   node cron-myhome-collector.js --backfill      full discovery sweep
//   node cron-myhome-collector.js --enrich        coordinates only
//   node cron-myhome-collector.js --once          one incremental pass
//   node cron-myhome-collector.js --dry-run       fetch + normalize, no writes
//
// Nothing is ever hard-deleted: a listing that stops appearing gets
// delisted_at set, so price history and time-on-market analysis survive.

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ENABLED       = String(process.env.MYHOME_SYNC_ENABLED || "").toLowerCase() === "true";
const CRON_EXPR     = process.env.MYHOME_SYNC_CRON || "17 * * * *";       // hourly, off the hour
const ENRICH_CRON   = process.env.MYHOME_ENRICH_CRON || "*/20 * * * *";
const PER_PAGE      = Number(process.env.MYHOME_PER_PAGE || 500);
const MAX_PAGES_INC = Number(process.env.MYHOME_MAX_PAGES_INCREMENTAL || 40);
const MAX_PAGES_BF  = Number(process.env.MYHOME_MAX_PAGES_BACKFILL || 1200);
const ENRICH_PER_RUN = Number(process.env.MYHOME_ENRICH_PER_RUN || 300);
// Property types to geocode first, e.g. "4" for land plots. Everything else is
// still enriched — just after the priority queue drains — so the map fills in
// where the product needs it first instead of in last-updated order.
const ENRICH_PRIORITY = String(process.env.MYHOME_ENRICH_PRIORITY_TYPES || "")
  .split(",").map((x) => Number(x.trim())).filter(Number.isFinite);
const CHUNK         = 500;            // rows per upsert
const OVERLAP_MS    = 10 * 60 * 1000; // re-read a 10 min tail; cheap insurance
                                      // against clock skew and late edits

// Scope, as JSON, e.g. MYHOME_FILTERS='{"cities":1}' for Tbilisi only.
// Applies to discovery; enrichment inherits it through the stored city_id.
let FILTERS = {};
try { FILTERS = JSON.parse(process.env.MYHOME_FILTERS || "{}"); }
catch { console.warn("[myhome] MYHOME_FILTERS is not valid JSON — ignoring"); }

const sb = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
  : null;

if (!sb) {
  console.warn("[myhome] SUPABASE_URL / SUPABASE_SERVICE_KEY not set — collector disabled");
} else if (!ENABLED) {
  console.warn("[myhome] MYHOME_SYNC_ENABLED is not 'true' — collector idle (set it to enable the schedule)");
}

// Columns each phase owns. Kept disjoint so a discovery upsert can never null
// out coordinates that enrichment paid for — PostgREST only writes the keys
// present in the payload.
const DISCOVERY_COLUMNS = [
  "id", "uuid", "url", "title",
  "deal_type_id", "deal_type", "property_type_id", "property_type",
  "building_status_id", "building_status",
  "price_gel", "price_usd", "price_eur", "price_per_sqm_gel", "price_negotiable", "fx_gel_per_usd",
  "area", "area_unit", "yard_area", "rooms", "bedrooms", "floor", "total_floors",
  "city_id", "city", "district_id", "district", "urban_id", "urban", "street_id", "address", "metro_station_id",
  "image_url", "image_count", "has_3d", "is_vip", "seller_type",
  "updated_at", "fetched_at", "delisted_at",
];
const ENRICH_COLUMNS = [
  "id",
  "condition_id", "condition", "bathrooms", "ceiling_height", "balconies",
  "heating", "hot_water", "parking", "material", "project_type", "amenities",
  "lat", "lng", "geo_ref", "geo_offset_m", "geo_suspect", "geo_reason",
  "rs_codes", "rs_code_primary",
  "description", "views", "published_at", "detail_fetched_at",
];

const pick = (obj, cols) => Object.fromEntries(cols.filter((c) => c in obj).map((c) => [c, obj[c]]));

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
const isoOrNull = (ts) => { const d = parseTbilisi(ts); return d ? d.toISOString() : null; };

async function lastWatermark() {
  const { data, error } = await sb
    .from("myhome_sync_log")
    .select("watermark")
    .eq("ok", true).eq("mode", "incremental")
    .not("watermark", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`watermark read failed: ${error.message}`);
  return data && data.length ? new Date(data[0].watermark) : null;
}

async function openRun(mode) {
  const { data, error } = await sb.from("myhome_sync_log").insert({ mode }).select("id").single();
  if (error) throw new Error(`sync_log insert failed: ${error.message}`);
  return data.id;
}

async function closeRun(runId, patch) {
  const { error } = await sb.from("myhome_sync_log")
    .update({ finished_at: new Date().toISOString(), ...patch }).eq("id", runId);
  if (error) console.error("[myhome] sync_log update failed:", error.message);
}

async function upsertRows(rows) {
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await sb.from("myhome_listings")
      .upsert(slice, { onConflict: "id", ignoreDuplicates: false });
    if (error) throw new Error(`upsert failed at row ${i}: ${error.message}`);
    written += slice.length;
  }
  return written;
}

// ── phase 1: discovery ────────────────────────────────────────────────────────

async function discover({ mode = "incremental", dryRun = false } = {}) {
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
      const raw = await api.fetchPage({ page, perPage: PER_PAGE, filters: FILTERS });
      stats.pages++;
      if (!raw.length) break;

      const rows = [];
      let crossedCutoff = false;

      for (const r of raw) {
        const n = api.normalize(r, dicts);
        if (!n) continue;
        stats.seen++;

        const updated = parseTbilisi(n.updated_at);
        if (updated && (!watermark || updated > watermark)) watermark = updated;
        // The feed is last_updated DESC, so once a row predates the cutoff
        // every row after it does too.
        if (cutoff && updated && updated <= cutoff) { crossedCutoff = true; continue; }

        rows.push(pick({ ...n, updated_at: isoOrNull(n.updated_at), delisted_at: null }, DISCOVERY_COLUMNS));
        if (dryRun && sample.length < 2) sample.push(n);
      }

      if (rows.length) stats.upserted += dryRun ? rows.length : await upsertRows(rows);
      console.log(`[myhome] discovery page ${page}: ${raw.length} rows, ${rows.length} new/changed`);

      if (crossedCutoff) { console.log("[myhome] reached watermark — stopping"); break; }
      if (raw.length < PER_PAGE) break;   // last page
    }

    if (dryRun) {
      console.log(`[myhome] DRY RUN — ${stats.seen} listings normalized, nothing written`);
      for (const s of sample) console.log(JSON.stringify(s, null, 2));
      return stats;
    }

    await closeRun(runId, { ...stats, watermark: watermark ? watermark.toISOString() : null, ok: true });
    console.log(`[myhome] ${mode} complete — ${stats.seen} seen, ${stats.upserted} upserted, watermark ${watermark ? watermark.toISOString() : "none"}`);
    return stats;
  } catch (e) {
    if (runId) await closeRun(runId, { ...stats, ok: false, notes: e.message });
    console.error(`[myhome] ${mode} failed:`, e.message);
    throw e;
  }
}

// ── phase 2: coordinate enrichment ────────────────────────────────────────────

/**
 * Fill in coordinates (and the detail-only fields) for listings that don't have
 * them yet, oldest-published first so the map fills in predictably.
 * One request per listing, throttled inside myhome-api.js.
 */
async function enrich({ limit = ENRICH_PER_RUN, dryRun = false } = {}) {
  const dicts = await api.getDictionaries();

  const queue = async (n, priorityPass) => {
    let q = sb.from("myhome_listings")
      .select("id")
      .is("detail_fetched_at", null)
      .is("delisted_at", null)
      .order("updated_at", { ascending: false })
      .limit(n);
    if (FILTERS.cities) q = q.eq("city_id", Number(String(FILTERS.cities).split(",")[0]));
    if (ENRICH_PRIORITY.length) {
      q = priorityPass
        ? q.in("property_type_id", ENRICH_PRIORITY)
        : q.not("property_type_id", "in", `(${ENRICH_PRIORITY.join(",")})`);
    }
    const { data, error } = await q;
    if (error) throw new Error(`enrich queue read failed: ${error.message}`);
    return data;
  };

  // Priority types first; only once they're exhausted does the run spend its
  // remaining budget on everything else.
  let pending = await queue(limit, true);
  if (ENRICH_PRIORITY.length && pending.length < limit) {
    pending = pending.concat(await queue(limit - pending.length, false));
  }
  if (!pending.length) { console.log("[myhome] enrichment queue empty"); return { fetched: 0, suspect: 0 }; }

  const runId = dryRun ? null : await openRun("enrich");
  const stats = { pages: 0, seen: 0, upserted: 0, suspect_geo: 0 };
  const rows = [];

  try {
    for (const { id } of pending) {
      let detail;
      try { detail = await api.fetchDetail(id); }
      catch (e) { console.warn(`[myhome] detail ${id} failed: ${e.message}`); continue; }
      const n = api.normalize(detail, dicts);
      if (!n) continue;
      stats.seen++;
      if (n.geo_suspect) stats.suspect_geo++;
      rows.push(pick({
        ...n,
        published_at: isoOrNull(n.published_at),
        detail_fetched_at: new Date().toISOString(),
      }, ENRICH_COLUMNS));
    }

    if (dryRun) {
      console.log(`[myhome] DRY RUN enrich — ${stats.seen} details fetched, ${stats.suspect_geo} suspect pins, nothing written`);
      if (rows[0]) console.log(JSON.stringify(rows[0], null, 2));
      return stats;
    }

    stats.upserted = rows.length ? await upsertRows(rows) : 0;
    await closeRun(runId, { ...stats, ok: true });
    console.log(`[myhome] enrichment — ${stats.upserted} listings geocoded, ${stats.suspect_geo} pins flagged suspect`);
    return stats;
  } catch (e) {
    if (runId) await closeRun(runId, { ...stats, ok: false, notes: e.message });
    console.error("[myhome] enrichment failed:", e.message);
    throw e;
  }
}

/**
 * Mark listings not seen for `days` as delisted. Run weekly: the feed only ever
 * shows live listings, so absence is the only signal that something sold or was
 * withdrawn. Only meaningful once a full backfill has run.
 */
async function markDelisted(days = 30) {
  if (!sb) return;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const { error, count } = await sb.from("myhome_listings")
    .update({ delisted_at: new Date().toISOString() }, { count: "exact" })
    .lt("fetched_at", cutoff).is("delisted_at", null);
  if (error) return console.error("[myhome] delist sweep failed:", error.message);
  console.log(`[myhome] delist sweep: ${count ?? 0} listings not seen in ${days} days`);
}

// ── CLI + schedule ────────────────────────────────────────────────────────────

if (require.main === module) {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  if (!sb && !dryRun) {
    console.error("[myhome] refusing to run: Supabase credentials missing (use --dry-run to test the fetch path)");
    process.exit(1);
  }
  const job = argv.includes("--enrich")
    ? enrich({ dryRun })
    : discover({ mode: argv.includes("--backfill") ? "backfill" : "incremental", dryRun });
  job.then(() => process.exit(0)).catch(() => process.exit(1));
} else if (sb && ENABLED) {
  cron.schedule(CRON_EXPR,   () => discover({ mode: "incremental" }).catch(() => {}));
  cron.schedule(ENRICH_CRON, () => enrich().catch(() => {}));
  cron.schedule("40 2 * * 1", () => markDelisted(30).catch(() => {}), { timezone: "UTC" });
  console.log(`[myhome] scheduled — discovery '${CRON_EXPR}', enrichment '${ENRICH_CRON}', delist sweep Mondays 06:40 Tbilisi`);
}

module.exports = { discover, enrich, markDelisted };
