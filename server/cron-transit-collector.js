"use strict";
require("dotenv").config();
const cron = require("node-cron");
const zlib = require("zlib");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

// ── Transit position collector ────────────────────────────────────────────────
// Samples live vehicle positions for every TTC route every 2 minutes during
// service hours and archives raw NDJSON (gzipped) to Cloudflare R2. Nothing is
// derived here — delay/OTP/congestion analyses are computed later from the raw
// archive, so the stored objects are kept verbatim.
//
// Layout in the bucket:
//   positions/YYYY-MM-DD/HHMM.ndjson.gz      one object per sampling cycle
//   gtfs-snapshots/YYYY-MM-DD/stops.json.gz  daily network snapshot
//   gtfs-snapshots/YYYY-MM-DD/routes.json.gz (incl. patterns, polyline, schedule)

const R2_ENDPOINT   = process.env.R2_ENDPOINT;    // https://<account_id>.r2.cloudflarestorage.com
const R2_KEY_ID     = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET     = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET     = process.env.R2_BUCKET || "urbanyx-transit";

const TTC_API = "https://transit.ttc.com.ge/pis-gateway/api";
const TTC_HDR = {
  "Accept": "application/json",
  "x-api-key": "c0a2f304-551a-4d08-b8df-2c53ecd57f9f",
  "Referer": "https://transit.ttc.com.ge/",
  "Origin": "https://transit.ttc.com.ge",
  "User-Agent": "Mozilla/5.0",
};

const SAMPLE_MINUTES   = 2;      // sampling cadence during service hours
const CONCURRENCY      = 8;      // parallel route requests per cycle
const TBILISI_UTC_OFFSET = 4;    // Georgia has no DST

const enabled = !!(R2_ENDPOINT && R2_KEY_ID && R2_SECRET);
if (!enabled) {
  console.warn("[transit-collector] R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY not set — collector disabled");
}

const s3 = enabled ? new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_KEY_ID, secretAccessKey: R2_SECRET },
}) : null;

function tbilisiNow() {
  return new Date(Date.now() + TBILISI_UTC_OFFSET * 3600000); // read via getUTC* below
}
function inServiceHours() {
  const h = tbilisiNow().getUTCHours();
  return h >= 6 || h < 1; // 06:00–00:59 Tbilisi
}
function dateKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function ttcFetch(path, timeoutMs = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${TTC_API}${path}`, { headers: TTC_HDR, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function putGz(key, text) {
  const body = zlib.gzipSync(Buffer.from(text, "utf8"));
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: "application/x-ndjson",
    ContentEncoding: "gzip",
  }));
  return body.length;
}

async function mapPool(items, fn, size) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = await fn(items[idx], idx); }
      catch (e) { results[idx] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}

// Route list + pattern suffixes, cached and refreshed every 6 h
let _routes = null;         // [{id, shortName, mode, suffixes}]
let _routesFetchedAt = 0;

async function getRoutes() {
  if (_routes && Date.now() - _routesFetchedAt < 6 * 3600000) return _routes;
  const list = await ttcFetch("/v3/routes?modes=BUS,SUBWAY,GONDOLA&locale=ka");
  const detailed = await mapPool(list, async (r) => {
    const detail = await ttcFetch(`/v3/routes/${encodeURIComponent(r.id)}?locale=ka`);
    const suffixes = (detail.patterns || []).map(p => p.patternSuffix).filter(Boolean);
    return { id: r.id, shortName: r.shortName, mode: r.mode, suffixes };
  }, CONCURRENCY);
  _routes = detailed.filter(r => r && r.suffixes.length);
  _routesFetchedAt = Date.now();
  console.log(`[transit-collector] route catalog refreshed: ${_routes.length} routes with patterns`);
  return _routes;
}

async function collectPositions() {
  if (!enabled || !inServiceHours()) return;
  const sampledAt = new Date();
  try {
    const routes = await getRoutes();
    const lines = [];
    await mapPool(routes, async (r) => {
      const data = await ttcFetch(
        `/v3/routes/${encodeURIComponent(r.id)}/positions?patternSuffixes=${encodeURIComponent(r.suffixes.join(","))}`,
        15000
      );
      for (const [suffix, vehicles] of Object.entries(data || {})) {
        for (const v of (vehicles || [])) {
          // Vehicle object stored verbatim (v) — schema-agnostic for future analyses
          lines.push(JSON.stringify({ t: sampledAt.toISOString(), r: r.id, n: r.shortName, p: suffix, v }));
        }
      }
    }, CONCURRENCY);

    if (!lines.length) {
      console.log("[transit-collector] cycle produced 0 vehicles — skipped upload");
      return;
    }
    const local = tbilisiNow();
    const hhmm = String(local.getUTCHours()).padStart(2, "0") + String(local.getUTCMinutes()).padStart(2, "0");
    const key = `positions/${dateKey(local)}/${hhmm}.ndjson.gz`;
    const bytes = await putGz(key, lines.join("\n"));
    console.log(`[transit-collector] ${lines.length} vehicle samples → r2://${R2_BUCKET}/${key} (${(bytes / 1024).toFixed(1)} KB)`);
  } catch (e) {
    console.error("[transit-collector] cycle failed:", e.message);
  }
}

// Daily snapshot of the network (stops, routes incl. polyline + schedule).
// Needed later to compute scheduled-vs-actual delay for any historical date.
async function snapshotNetwork() {
  if (!enabled) return;
  try {
    const local = tbilisiNow();
    const day = dateKey(local);
    const stops = await ttcFetch("/v2/stops?locale=ka", 60000);
    await putGz(`gtfs-snapshots/${day}/stops.json.gz`, JSON.stringify(stops));

    const routes = await getRoutes();
    const full = await mapPool(routes, async (r) => {
      const [detail, polyline, schedule] = await Promise.all([
        ttcFetch(`/v3/routes/${encodeURIComponent(r.id)}?locale=ka`),
        ttcFetch(`/v2/routes/${encodeURIComponent(r.id)}/polyline`).catch(() => null),
        ttcFetch(`/v2/routes/${encodeURIComponent(r.id)}/schedule`).catch(() => null),
      ]);
      return { id: r.id, detail, polyline, schedule };
    }, CONCURRENCY);
    await putGz(`gtfs-snapshots/${day}/routes.json.gz`, JSON.stringify(full.filter(Boolean)));
    console.log(`[transit-collector] network snapshot saved for ${day} (${routes.length} routes)`);
  } catch (e) {
    console.error("[transit-collector] snapshot failed:", e.message);
  }
}

if (enabled) {
  cron.schedule(`*/${SAMPLE_MINUTES} * * * *`, collectPositions);
  // 04:30 Tbilisi = 00:30 UTC — outside service hours, network is static
  cron.schedule("30 0 * * *", snapshotNetwork, { timezone: "UTC" });
  console.log(`[transit-collector] scheduled — positions every ${SAMPLE_MINUTES} min (06:00–01:00 Tbilisi), snapshot daily 04:30 Tbilisi`);
}

module.exports = { collectPositions, snapshotNetwork };
