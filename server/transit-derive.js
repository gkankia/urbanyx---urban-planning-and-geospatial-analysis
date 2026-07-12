"use strict";
require("dotenv").config();
const zlib = require("zlib");
const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { createClient } = require("@supabase/supabase-js");

// ── Transit derivation: R2 position archive → stop arrivals + segment speeds ──
// Usage:
//   node transit-derive.js 2026-07-12          derive one service day
//   node transit-derive.js --backfill          derive every unprocessed day
//
// Method (see supabase/transit-schema.sql for outputs):
//   1. Per vehicle, order samples; a change of v.nextStopId between two samples
//      means every stop between the old and new "next stop" (per that direction's
//      schedule stop order) was passed inside that interval. Arrival times are
//      interpolated by straight-line distance between stop coordinates.
//   2. Arrivals are matched to the day's schedule (nearest timetable entry
//      within ±20 min) → signed delay. On-time window: −60 s … +300 s.
//   3. Consecutive samples also yield a traversal speed, projected onto the
//      direction's polyline and spread over the 150 m bins it covers.

const R2_BUCKET = process.env.R2_BUCKET || "urbanyx-transit";
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

const TTC_API = "https://transit.ttc.com.ge/pis-gateway/api";
const TTC_HDR = {
  "Accept": "application/json",
  "x-api-key": "c0a2f304-551a-4d08-b8df-2c53ecd57f9f",
  "Referer": "https://transit.ttc.com.ge/", "Origin": "https://transit.ttc.com.ge", "User-Agent": "Mozilla/5.0",
};

const MAX_GAP_MS      = 6 * 60000;  // ignore intervals with sampling gaps beyond this
const MAX_SPEED_KMH   = 65;         // discard implausible traversal speeds
const BIN_M           = 150;        // polyline bin size
const MATCH_WINDOW_S  = 20 * 60;    // schedule match tolerance
const ON_TIME_MIN_S   = -60, ON_TIME_MAX_S = 300;
const TBILISI_OFFSET_H = 4;

// ── small utils ───────────────────────────────────────────────────────────────
const gunzip = (buf) => zlib.gunzipSync(buf).toString("utf8");
function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function pct(a, p) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
function havM(lat1, lon1, lat2, lon2) {
  const R = 6371000, dLa = (lat2 - lat1) * Math.PI / 180, dLo = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function isoWeek(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fDay + 3);
  const wk = 1 + Math.round((d - firstThu) / (7 * 86400000));
  return `${d.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}
function bandOf(ts) { // Tbilisi local hour → time band
  const h = (new Date(ts).getUTCHours() + TBILISI_OFFSET_H) % 24;
  if (h >= 7 && h < 10) return "am_peak";
  if (h >= 10 && h < 17) return "midday";
  if (h >= 17 && h < 20) return "pm_peak";
  return "evening";
}
// Google encoded polyline → [[lat,lon],...]
function decodePolyline(str) {
  const pts = []; let lat = 0, lon = 0, i = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const delta = (result & 1) ? ~(result >> 1) : (result >> 1);
      if (which === 0) lat += delta; else lon += delta;
    }
    pts.push([lat / 1e5, lon / 1e5]);
  }
  return pts;
}

// ── R2 helpers ────────────────────────────────────────────────────────────────
async function r2Get(key) {
  const r = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  return Buffer.from(await r.Body.transformToByteArray());
}
async function r2List(prefix) {
  const keys = []; let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token }));
    (r.Contents || []).forEach(o => keys.push(o.Key));
    token = r.IsTruncated ? r.NextContinuationToken : null;
  } while (token);
  return keys;
}
async function r2PutGz(key, text) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: zlib.gzipSync(Buffer.from(text, "utf8")),
    ContentType: "application/x-ndjson", ContentEncoding: "gzip",
  }));
}

// ── Network model (stops, per-direction stop orders, schedules, polylines) ───
async function ttcFetch(path) {
  const res = await fetch(`${TTC_API}${path}`, { headers: TTC_HDR });
  if (!res.ok) throw new Error(`TTC ${res.status} ${path}`);
  return res.json();
}

// Loads from the newest gtfs snapshot ≤ date; falls back to the live API
// (with a warning — live schedules may differ from the service day's).
async function loadNetwork(dateStr) {
  const snaps = (await r2List("gtfs-snapshots/")).map(k => k.split("/")[1]).filter(Boolean);
  const usable = [...new Set(snaps)].filter(d => d <= dateStr).sort().pop();
  let stopsRaw, routesRaw, src;
  if (usable) {
    src = `snapshot ${usable}`;
    stopsRaw  = JSON.parse(gunzip(await r2Get(`gtfs-snapshots/${usable}/stops.json.gz`)));
    routesRaw = JSON.parse(gunzip(await r2Get(`gtfs-snapshots/${usable}/routes.json.gz`)));
  } else {
    src = "LIVE API (no snapshot ≤ date — schedules may not match the service day)";
    console.warn(`[derive] ${src}`);
    stopsRaw = await ttcFetch("/v2/stops?locale=ka");
    const list = await ttcFetch("/v3/routes?modes=BUS,SUBWAY,GONDOLA&locale=ka");
    routesRaw = [];
    for (let i = 0; i < list.length; i += 8) {
      routesRaw.push(...await Promise.all(list.slice(i, i + 8).map(async r => ({
        id: r.id,
        detail:   await ttcFetch(`/v3/routes/${encodeURIComponent(r.id)}?locale=ka`).catch(() => null),
        polyline: { fwd: await ttcFetch(`/v2/routes/${encodeURIComponent(r.id)}/polyline?forward=true`).catch(() => null),
                    rev: await ttcFetch(`/v2/routes/${encodeURIComponent(r.id)}/polyline?forward=false`).catch(() => null) },
        schedule: { fwd: await ttcFetch(`/v2/routes/${encodeURIComponent(r.id)}/schedule?forward=true`).catch(() => null),
                    rev: await ttcFetch(`/v2/routes/${encodeURIComponent(r.id)}/schedule?forward=false`).catch(() => null) },
      }))));
    }
  }

  const stops = new Map(stopsRaw.map(s => [s.id, s])); // id → {lat, lon, name}

  // Per route: direction models keyed by patternSuffix.
  // Older snapshots (pre both-direction fix) have schedule as a single object → treated as fwd.
  const routes = new Map();
  for (const r of routesRaw) {
    if (!r?.detail) continue;
    const schedFwd = r.schedule?.fwd ?? (r.schedule?.weekdaySchedules ? r.schedule : null);
    const schedRev = r.schedule?.rev ?? null;
    const polyFwd  = r.polyline?.fwd ?? (r.polyline?.encodedValue ? r.polyline : null);
    const polyRev  = r.polyline?.rev ?? null;

    const dirModel = (sched, poly) => {
      const ws = sched?.weekdaySchedules;
      if (!ws?.length) return null;
      // pick the weekday block covering this date if several exist
      const block = ws.find(w => (w.serviceDates || []).includes(dateStr)) || ws[0];
      const seq = (block.stops || []).map(s => s.id);
      const times = new Map((block.stops || []).map(s => [
        s.id,
        (s.arrivalTimes || "").split(",").filter(Boolean).map(t => {
          const [h, m] = t.split(":").map(Number); return h * 3600 + m * 60; // service-day seconds (Tbilisi)
        }),
      ]));
      const pts = poly?.encodedValue ? decodePolyline(poly.encodedValue) : null;
      let cum = null;
      if (pts?.length > 1) {
        cum = new Array(pts.length).fill(0);
        for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + havM(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      }
      return { seq, idx: new Map(seq.map((id, i) => [id, i])), times, pts, cum };
    };

    const fwd = dirModel(schedFwd, polyFwd);
    const rev = dirModel(schedRev, polyRev);

    // Map each patternSuffix to fwd/rev by matching the pattern's firstStop
    const bySuffix = new Map();
    for (const p of (r.detail.patterns || [])) {
      let dir = null;
      if (fwd && p.firstStop?.id === fwd.seq[0]) dir = { m: fwd, d: 1 };
      else if (rev && p.firstStop?.id === rev.seq[0]) dir = { m: rev, d: 0 };
      else if (fwd && !rev) dir = { m: fwd, d: p.directionId ?? 1 }; // legacy snapshot fallback
      if (dir) bySuffix.set(p.patternSuffix, { model: dir.m, direction: dir.d });
    }
    if (bySuffix.size) routes.set(r.id, bySuffix);
  }
  console.log(`[derive] network: ${stops.size} stops, ${routes.size} routes (${src})`);
  return { stops, routes };
}

// ── Core derivation for one service day ───────────────────────────────────────
async function deriveDay(dateStr) {
  console.log(`[derive] ▶ ${dateStr}`);
  const keys = await r2List(`positions/${dateStr}/`);
  if (!keys.length) { console.log(`[derive] no position files for ${dateStr}`); return null; }

  const net = await loadNetwork(dateStr);

  // Load all samples, grouped per vehicle within a route+pattern context
  const traces = new Map(); // `${vehicleId}|${routeId}|${suffix}` → [{ts, lat, lon, next}]
  let nSamples = 0;
  for (const key of keys) {
    const text = gunzip(await r2Get(key));
    for (const line of text.split("\n")) {
      if (!line) continue;
      let row; try { row = JSON.parse(line); } catch { continue; }
      const v = row.v || {};
      if (!v.vehicleId || v.lat == null) continue;
      nSamples++;
      const k = `${v.vehicleId}|${row.r}|${row.p}`;
      if (!traces.has(k)) traces.set(k, []);
      traces.get(k).push({ ts: Date.parse(row.t), lat: v.lat, lon: v.lon, next: v.nextStopId || null });
    }
  }
  console.log(`[derive] ${keys.length} files, ${nSamples} samples, ${traces.size} vehicle-pattern traces`);

  // Service-day seconds (Tbilisi local) for schedule matching
  const dayStartMs = Date.parse(dateStr + "T00:00:00Z") - TBILISI_OFFSET_H * 3600000;
  const svcSec = (ts) => (ts - dayStartMs) / 1000;

  const arrivals = [];              // {stop, route, dir, ts, delay|null}
  const segAgg = new Map();         // `${week}|${route}|${dir}|${bin}|${band}` → speeds[]

  for (const [k, samples] of traces) {
    const [, routeId, suffix] = k.split("|");
    const dirInfo = net.routes.get(routeId)?.get(suffix);
    if (!dirInfo) continue;
    const { model, direction } = dirInfo;
    samples.sort((a, b) => a.ts - b.ts);

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      const dt = b.ts - a.ts;
      if (dt <= 0 || dt > MAX_GAP_MS) continue;

      // — Segment speed —
      const dM = havM(a.lat, a.lon, b.lat, b.lon);
      const kmh = (dM / 1000) / (dt / 3600000);
      if (model.cum && kmh <= MAX_SPEED_KMH && dM > 15) {
        const proj = (p) => { // nearest polyline vertex → distance along
          let best = 0, bd = Infinity;
          for (let j = 0; j < model.pts.length; j++) {
            const d = (model.pts[j][0] - p.lat) ** 2 + (model.pts[j][1] - p.lon) ** 2;
            if (d < bd) { bd = d; best = j; }
          }
          return model.cum[best];
        };
        let d1 = proj(a), d2 = proj(b);
        if (d2 > d1 && d2 - d1 < 3000) { // sane forward progress only
          const band = bandOf(a.ts), week = isoWeek(dateStr);
          for (let bin = Math.floor(d1 / BIN_M); bin <= Math.floor(d2 / BIN_M); bin++) {
            const kk = `${week}|${routeId}|${direction}|${bin}|${band}`;
            if (!segAgg.has(kk)) segAgg.set(kk, []);
            segAgg.get(kk).push(kmh);
          }
        }
      }

      // — Stop arrivals from nextStopId transitions —
      if (!a.next || !b.next || a.next === b.next) continue;
      const i1 = model.idx.get(a.next), i2 = model.idx.get(b.next);
      if (i1 == null || i2 == null || i2 <= i1) continue;      // off-sequence / loop restart
      const passed = model.seq.slice(i1, i2);                   // stops passed in (a.ts, b.ts]
      // distance-weighted interpolation between the two vehicle fixes
      const legs = [];
      let prev = { lat: a.lat, lon: a.lon };
      for (const sid of passed) {
        const st = net.stops.get(sid);
        if (!st) { legs.push(1); prev = prev; continue; }
        legs.push(Math.max(20, havM(prev.lat, prev.lon, st.lat, st.lon)));
        prev = st;
      }
      const total = legs.reduce((x, y) => x + y, 0) + Math.max(20, havM(prev.lat, prev.lon, b.lat, b.lon));
      let acc = 0;
      passed.forEach((sid, j) => {
        acc += legs[j];
        const ts = a.ts + dt * (acc / total);
        // schedule match
        let delay = null;
        const sched = model.times.get(sid);
        if (sched?.length) {
          const s = svcSec(ts);
          let best = null, bd = Infinity;
          for (const t of sched) { const d = Math.abs(s - t); if (d < bd) { bd = d; best = t; } }
          if (best != null && bd <= MATCH_WINDOW_S) delay = Math.round(svcSec(ts) - best);
        }
        arrivals.push({ stop: sid, route: routeId, dir: direction, ts, delay });
      });
    }
  }
  console.log(`[derive] ${arrivals.length} stop arrivals, ${arrivals.filter(x => x.delay != null).length} schedule-matched`);

  // ── Aggregate: per stop × route × direction ────────────────────────────────
  const byStop = new Map();
  for (const ar of arrivals) {
    const kk = `${ar.stop}|${ar.route}|${ar.dir}`;
    if (!byStop.has(kk)) byStop.set(kk, []);
    byStop.get(kk).push(ar);
  }
  const stopRows = [];
  for (const [kk, list] of byStop) {
    const [stop_id, route_id, dirS] = kk.split("|");
    list.sort((a, b) => a.ts - b.ts);
    const delays = list.filter(x => x.delay != null).map(x => x.delay);
    const headways = [];
    for (let i = 1; i < list.length; i++) {
      const h = (list[i].ts - list[i - 1].ts) / 1000;
      if (h > 60 && h < 3600) headways.push(h);
    }
    // scheduled headways at this stop (from timetable)
    const model = net.routes.get(route_id)?.values().next().value?.model; // any suffix of matching dir
    let schedH = null;
    for (const info of net.routes.get(route_id)?.values() || []) {
      if (info.direction === Number(dirS)) {
        const t = info.model.times.get(stop_id);
        if (t?.length > 1) {
          const hs = []; for (let i = 1; i < t.length; i++) hs.push(t[i] - t[i - 1]);
          schedH = median(hs);
        }
      }
    }
    // EWT for high-frequency service: E[h²]/2E[h], actual − scheduled
    const ewt = (hs) => { if (hs.length < 3) return null; const m = hs.reduce((a, b) => a + b) / hs.length; return hs.reduce((a, h) => a + h * h, 0) / (2 * m * hs.length); };
    const ewtActual = ewt(headways);
    const ewtSched  = schedH != null ? schedH / 2 : null;

    stopRows.push({
      date: dateStr, stop_id, route_id, direction: Number(dirS),
      n_obs: list.length, n_matched: delays.length,
      on_time: delays.filter(d => d >= ON_TIME_MIN_S && d <= ON_TIME_MAX_S).length,
      late:  delays.filter(d => d > ON_TIME_MAX_S).length,
      early: delays.filter(d => d < ON_TIME_MIN_S).length,
      delay_med_s: delays.length ? Math.round(median(delays)) : null,
      delay_p90_s: delays.length ? Math.round(pct(delays, 0.9)) : null,
      headway_med_s: headways.length ? Math.round(median(headways)) : null,
      headway_sched_s: schedH != null ? Math.round(schedH) : null,
      ewt_s: (ewtActual != null && ewtSched != null) ? Math.round(Math.max(0, ewtActual - ewtSched)) : null,
    });
  }

  const segRows = [];
  for (const [kk, speeds] of segAgg) {
    if (speeds.length < 3) continue;
    const [iso_week, route_id, dirS, binS, band] = kk.split("|");
    segRows.push({
      iso_week, route_id, direction: Number(dirS), bin_idx: Number(binS), band,
      n: speeds.length,
      speed_med_kmh: Math.round(median(speeds) * 10) / 10,
      speed_p15_kmh: Math.round(pct(speeds, 0.15) * 10) / 10,
    });
  }

  // ── Persist ────────────────────────────────────────────────────────────────
  for (let i = 0; i < stopRows.length; i += 500) {
    const { error } = await sb.from("transit_stop_daily").upsert(stopRows.slice(i, i + 500));
    if (error) throw new Error("transit_stop_daily upsert: " + error.message);
  }
  // segment weekly rows: merge with existing week by re-upserting day-summed…
  // v1 keeps it simple: rows are recomputed per run from this day only, so for
  // mid-week reruns the week reflects the latest derived day per (key). Full
  // multi-day weekly merge happens in the weekly rollup (future work).
  for (let i = 0; i < segRows.length; i += 500) {
    const { error } = await sb.from("transit_segment_weekly").upsert(segRows.slice(i, i + 500));
    if (error) throw new Error("transit_segment_weekly upsert: " + error.message);
  }
  await r2PutGz(`derived/arrivals/${dateStr}.ndjson.gz`,
    arrivals.map(a => JSON.stringify({ ...a, ts: new Date(a.ts).toISOString() })).join("\n"));
  const { error: logErr } = await sb.from("transit_derive_log").upsert({
    date: dateStr, files: keys.length, samples: nSamples,
    arrivals: arrivals.length, matched: arrivals.filter(x => x.delay != null).length,
  });
  if (logErr) throw new Error("transit_derive_log upsert: " + logErr.message);

  console.log(`[derive] ✓ ${dateStr}: ${stopRows.length} stop-day rows, ${segRows.length} segment rows`);
  return { stopRows: stopRows.length, segRows: segRows.length, arrivals: arrivals.length };
}

// ── Backfill: derive every archived day not yet in the ledger ────────────────
async function backfill() {
  const days = [...new Set((await r2List("positions/")).map(k => k.split("/")[1]).filter(Boolean))].sort();
  const { data } = await sb.from("transit_derive_log").select("date");
  const done = new Set((data || []).map(r => r.date));
  const today = new Date(Date.now() + TBILISI_OFFSET_H * 3600000).toISOString().slice(0, 10);
  for (const d of days) {
    if (done.has(d)) { console.log(`[derive] skip ${d} (already derived)`); continue; }
    if (d >= today)  { console.log(`[derive] skip ${d} (day not finished)`);  continue; }
    await deriveDay(d);
  }
}

if (require.main === module) {
  const arg = process.argv[2];
  (arg === "--backfill" ? backfill() : deriveDay(arg || new Date(Date.now() - 86400000 + TBILISI_OFFSET_H * 3600000).toISOString().slice(0, 10)))
    .then(() => process.exit(0))
    .catch(e => { console.error("[derive] FAILED:", e.message); process.exit(1); });
}

module.exports = { deriveDay, backfill };
