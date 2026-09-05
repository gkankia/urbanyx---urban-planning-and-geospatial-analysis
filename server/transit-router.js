"use strict";
require("dotenv").config();
const zlib = require("zlib");
const turf = require("@turf/turf");
const { S3Client, GetObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { createClient } = require("@supabase/supabase-js");

// ── Urbanyx transit isochrone router ──────────────────────────────────────────
// A headway-based RAPTOR over the TTC network, timed from OBSERVED data:
//   • ride time  = distance / observed segment speed (transit_segment_weekly, this band)
//   • wait time  = (band scheduled frequency) × (observed reliability degradation) / 2
// Reachable stops within the cutoff → walk-egress disks → union = the isochrone.
// Everything is cached; one request runs the RAPTOR + a polygon union in memory.

const R2_BUCKET = process.env.MYHOME_TRANSIT_BUCKET || process.env.R2_BUCKET || "urbanyx-transit";
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

const TBILISI_OFFSET_H = 4;
// tuning
const WALK_MPS          = 1.35;   // ~4.9 km/h
const ACCESS_RADIUS_M   = 800;    // origin → boarding stop
const TRANSFER_RADIUS_M = 300;    // stop → stop foot transfer
const EGRESS_CAP_M      = 1200;   // max walk from an alighting stop
const MAX_ROUNDS        = 4;      // transit legs
const BIN_M             = 150;
const WAIT_CAP_S        = 25 * 60;
const DEFAULT_SPEED_KMH = { BUS: 17, TROLLEYBUS: 15, SUBWAY: 34, GONDOLA: 12, CABLE_CAR: 12, default: 17 };
const DEFAULT_HEADWAY_S = { BUS: 720, TROLLEYBUS: 720, SUBWAY: 240, GONDOLA: 360, CABLE_CAR: 360, default: 720 };
const DEFAULT_DEGRADE   = 1.35;   // buses run ~35% less often than timetabled, on average

// ── small helpers (shared shape with transit-derive.js) ───────────────────────
function havM(lat1, lon1, lat2, lon2) {
  const R = 6371000, dLa = (lat2 - lat1) * Math.PI / 180, dLo = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
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
function bandOf(ts) {
  const h = (new Date(ts).getUTCHours() + TBILISI_OFFSET_H) % 24;
  if (h >= 7 && h < 10) return "am_peak";
  if (h >= 10 && h < 17) return "midday";
  if (h >= 17 && h < 20) return "pm_peak";
  return "evening";
}
function bandOfHour(h) {
  if (h >= 7 && h < 10) return "am_peak";
  if (h >= 10 && h < 17) return "midday";
  if (h >= 17 && h < 20) return "pm_peak";
  return "evening";
}
function gunzip(buf) { return zlib.gunzipSync(buf).toString("utf8"); }
async function r2Get(key) {
  const r = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  const chunks = []; for await (const c of r.Body) chunks.push(c);
  return Buffer.concat(chunks);
}
async function r2SnapshotDirs() {
  const r = await s3.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: "gtfs-snapshots/", Delimiter: "/" }));
  return (r.CommonPrefixes || []).map(p => p.Prefix).sort();
}

// ── network (cached) ──────────────────────────────────────────────────────────
let _net = null, _netAt = 0;
const NET_TTL = 6 * 3600e3;

// Scheduled headway (s) per band from a stop's "6:00,6:08,…" arrival list.
function schedHeadwayByBand(arrivalTimes) {
  const secs = (arrivalTimes || "").split(",").filter(Boolean).map(t => {
    const [h, m] = t.split(":").map(Number); return h * 3600 + m * 60;
  }).sort((a, b) => a - b);
  const out = {};
  for (const band of ["am_peak", "midday", "pm_peak", "evening"]) {
    const gaps = [];
    for (let i = 1; i < secs.length; i++) {
      const hPrev = Math.floor(secs[i - 1] / 3600) % 24;
      if (bandOfHour(hPrev) === band) gaps.push(secs[i] - secs[i - 1]);
    }
    if (gaps.length) { gaps.sort((a, b) => a - b); out[band] = gaps[Math.floor(gaps.length / 2)]; }
  }
  return out;
}

async function buildNetwork() {
  const dirs = await r2SnapshotDirs();
  if (!dirs.length) throw new Error("no gtfs snapshot in R2");
  const snap = dirs[dirs.length - 1];
  const stopsRaw = JSON.parse(gunzip(await r2Get(snap + "stops.json.gz")));
  const routesRaw = JSON.parse(gunzip(await r2Get(snap + "routes.json.gz")));

  const stops = new Map(); // id → {id,lat,lon,name,mode}
  for (const s of stopsRaw) {
    const lat = s.lat ?? s.latitude, lon = s.lon ?? s.lng ?? s.longitude;
    if (Number.isFinite(lat) && Number.isFinite(lon)) stops.set(s.id, { id: s.id, lat, lon, name: s.name, mode: s.vehicleMode });
  }

  const dirModels = []; // {key,routeId,dir,mode,seq,stopCum,sched}
  const dirsAtStop = new Map(); // stopId → [dirIndex,…]
  for (const r of routesRaw) {
    if (!r || !r.detail) continue;
    const mode = r.detail.mode || "BUS";
    const build = (sched, poly, dir) => {
      const ws = sched?.fwd?.weekdaySchedules ?? sched?.weekdaySchedules;
      const block = ws && (ws[0] || null);
      if (!block || !block.stops || block.stops.length < 2) return;
      const bstops = block.stops.slice().sort((a, b) => (a.position || 0) - (b.position || 0));
      const seq = bstops.map(s => s.id).filter(id => stops.has(id));
      if (seq.length < 2) return;
      const enc = poly?.fwd?.encodedValue ?? poly?.encodedValue;
      const pts = enc ? decodePolyline(enc) : null;
      let cum = null;
      if (pts && pts.length > 1) {
        cum = new Array(pts.length).fill(0);
        for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + havM(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      }
      // project each stop onto the polyline → distance-along (for speed bins)
      const stopCum = seq.map(id => {
        const st = stops.get(id);
        if (!pts) return null;
        let best = 0, bd = Infinity;
        for (let i = 0; i < pts.length; i++) {
          const d = havM(st.lat, st.lon, pts[i][0], pts[i][1]);
          if (d < bd) { bd = d; best = cum[i]; }
        }
        return best;
      });
      // fall back to straight-line cumulative distance where there's no polyline
      if (!pts) { let c = 0; stopCum[0] = 0; for (let i = 1; i < seq.length; i++) { const a = stops.get(seq[i - 1]), b = stops.get(seq[i]); c += havM(a.lat, a.lon, b.lat, b.lon); stopCum[i] = c; } }
      const schedHead = schedHeadwayByBand(bstops[0].arrivalTimes);
      const idx = dirModels.length;
      dirModels.push({ key: `${r.id}|${dir}`, routeId: r.id, dir, mode, seq, stopCum, sched: schedHead });
      for (const id of seq) { if (!dirsAtStop.has(id)) dirsAtStop.set(id, []); dirsAtStop.get(id).push(idx); }
    };
    build(r.schedule?.fwd ? { fwd: r.schedule.fwd } : r.schedule, r.polyline?.fwd ? { fwd: r.polyline.fwd } : r.polyline, 1);
    if (r.schedule?.rev) build({ fwd: r.schedule.rev }, r.polyline?.rev ? { fwd: r.polyline.rev } : null, 0);
  }

  // spatial grid over stops for fast radius queries (~250 m cells)
  const CELL = 0.0025;
  const grid = new Map();
  const cellKey = (lat, lon) => `${Math.floor(lat / CELL)},${Math.floor(lon / CELL)}`;
  for (const s of stops.values()) { const k = cellKey(s.lat, s.lon); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); }
  const near = (lat, lon, radM) => {
    const out = [], span = Math.ceil(radM / (CELL * 111000)) + 1;
    const ci = Math.floor(lat / CELL), cj = Math.floor(lon / CELL);
    for (let di = -span; di <= span; di++) for (let dj = -span; dj <= span; dj++) {
      const cell = grid.get(`${ci + di},${cj + dj}`); if (!cell) continue;
      for (const s of cell) { const d = havM(lat, lon, s.lat, s.lon); if (d <= radM) out.push({ stop: s, d }); }
    }
    return out;
  };

  // foot transfers between nearby stops (precomputed once)
  const transfers = new Map();
  for (const s of stops.values()) {
    const list = near(s.lat, s.lon, TRANSFER_RADIUS_M).filter(x => x.stop.id !== s.id)
      .map(x => ({ to: x.stop.id, sec: x.d / WALK_MPS }));
    if (list.length) transfers.set(s.id, list);
  }

  return { snap, stops, dirModels, dirsAtStop, transfers, near };
}
async function getNetwork() {
  if (_net && Date.now() - _netAt < NET_TTL) return _net;
  _net = await buildNetwork(); _netAt = Date.now();
  console.log(`[transit-router] network ${_net.snap}: ${_net.stops.size} stops, ${_net.dirModels.length} route-directions`);
  return _net;
}

// ── observed timing (cached per band) ─────────────────────────────────────────
const _obsCache = new Map(); // band → {at,speeds,degrade,headways}
const OBS_TTL = 3600e3;
async function getObserved(band) {
  const c = _obsCache.get(band);
  if (c && Date.now() - c.at < OBS_TTL) return c;
  const [sp, dg, hw] = await Promise.all([
    sb.rpc("transit_route_speeds", { p_band: band, p_weeks: 4 }),
    sb.rpc("transit_route_degradation", { p_days: 21 }),
    sb.rpc("transit_route_headways", { p_days: 21 }),
  ]);
  const obs = { at: Date.now(), speeds: sp.data || {}, degrade: dg.data || {}, headways: hw.data || {} };
  _obsCache.set(band, obs);
  return obs;
}

// cumulative ride seconds along a direction's stop sequence, from observed bin speeds
function rideCumSec(dm, obs) {
  const spd = obs.speeds[dm.key] || null;
  const defMps = (DEFAULT_SPEED_KMH[dm.mode] || DEFAULT_SPEED_KMH.default) / 3.6;
  const cum = new Array(dm.seq.length).fill(0);
  for (let i = 1; i < dm.seq.length; i++) {
    const a = dm.stopCum[i - 1], b = dm.stopCum[i];
    let t = 0;
    if (b > a) {
      const b0 = Math.floor(a / BIN_M), b1 = Math.floor((b - 0.001) / BIN_M);
      for (let bin = b0; bin <= b1; bin++) {
        const lo = Math.max(a, bin * BIN_M), hi = Math.min(b, (bin + 1) * BIN_M);
        const len = hi - lo; if (len <= 0) continue;
        const kmh = spd && spd[bin] > 0 ? spd[bin] : null;
        const mps = kmh ? kmh / 3.6 : defMps;
        t += len / mps;
      }
    } else {
      const a2 = dm.stops ? 0 : 0; t = 60; // degenerate; ~1 min hop
    }
    cum[i] = cum[i - 1] + t;
  }
  return cum;
}
// expected wait (s) to board this direction: band frequency × observed degradation, /2
function boardWait(dm, obs, band) {
  let head = dm.sched && dm.sched[band];
  if (head) {
    const deg = obs.degrade[dm.key] || DEFAULT_DEGRADE;
    head = head * deg;
  } else {
    head = obs.headways[dm.key] || DEFAULT_HEADWAY_S[dm.mode] || DEFAULT_HEADWAY_S.default;
  }
  return Math.min(head / 2, WAIT_CAP_S);
}

// ── headway-RAPTOR: earliest arrival (s from t0) at every reachable stop ───────
async function reachableStops(lng, lat, cutoffSec, band) {
  const net = await getNetwork();
  const obs = await getObserved(band);
  const label = new Map();     // stopId → earliest arrival seconds
  const rideCache = new Map(); // dirIndex → cumSec
  const setL = (id, t) => { const c = label.get(id); if (c == null || t < c) { label.set(id, t); return true; } return false; };

  // access: walk from origin to nearby stops
  let marked = new Set();
  for (const { stop, d } of net.near(lat, lng, ACCESS_RADIUS_M)) {
    const t = d / WALK_MPS; if (t <= cutoffSec && setL(stop.id, t)) marked.add(stop.id);
  }

  for (let round = 0; round < MAX_ROUNDS && marked.size; round++) {
    const improved = new Set();
    // directions touched by a marked stop
    const dirSet = new Set();
    for (const sid of marked) for (const di of (net.dirsAtStop.get(sid) || [])) dirSet.add(di);
    for (const di of dirSet) {
      const dm = net.dirModels[di];
      let cum = rideCache.get(di); if (!cum) { cum = rideCumSec(dm, obs); rideCache.set(di, cum); }
      const wait = boardWait(dm, obs, band);
      // forward scan: keep the best "on-vehicle time at the boarding stop"
      let boardIdx = -1, boardBase = Infinity;
      for (let i = 0; i < dm.seq.length; i++) {
        const sid = dm.seq[i];
        if (boardIdx >= 0) {
          const arr = boardBase + (cum[i] - cum[boardIdx]);
          if (arr <= cutoffSec && setL(sid, arr)) improved.add(sid);
        }
        const L = label.get(sid);
        if (L != null) {
          const cand = L + wait;
          if (boardIdx < 0 || cand < boardBase + (cum[i] - cum[boardIdx])) { boardIdx = i; boardBase = cand; }
        }
      }
    }
    // foot transfers
    for (const sid of Array.from(improved)) {
      const L = label.get(sid);
      for (const tr of (net.transfers.get(sid) || [])) {
        const arr = L + tr.sec; if (arr <= cutoffSec && setL(tr.to, arr)) improved.add(tr.to);
      }
    }
    marked = improved;
  }
  return { net, label };
}

// ── isochrone polygon ─────────────────────────────────────────────────────────
// origin walk-blob ∪ egress disks around every reachable stop. Rasterised to a
// ~120 m grid and merged as horizontal run-length rectangles — one turf.union of a
// few hundred axis-aligned rects, not thousands of circles (seconds → tens of ms).
const CELL_M = 80;
function buildPolygon(net, label, lng, lat, cutoffSec) {
  const lat0 = lat, lng0 = lng;
  const mPerLat = 111320, mPerLng = 111320 * Math.cos(lat0 * Math.PI / 180);
  const toXY = (la, lo) => [(lo - lng0) * mPerLng, (la - lat0) * mPerLat];
  const toLL = (x, y) => [lng0 + x / mPerLng, lat0 + y / mPerLat];

  // disks: {x,y,r} in metres — origin + one per reachable stop
  const originR = Math.min(cutoffSec * WALK_MPS, 2500);
  const disks = [{ x: 0, y: 0, r: originR }];
  for (const [sid, L] of label) {
    const rem = cutoffSec - L; if (rem <= 15) continue;
    const st = net.stops.get(sid); if (!st) continue;
    const [x, y] = toXY(st.lat, st.lon);
    disks.push({ x, y, r: Math.min(rem * WALK_MPS, EGRESS_CAP_M) });
  }
  // grid bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of disks) { minX = Math.min(minX, d.x - d.r); minY = Math.min(minY, d.y - d.r); maxX = Math.max(maxX, d.x + d.r); maxY = Math.max(maxY, d.y + d.r); }
  const nx = Math.ceil((maxX - minX) / CELL_M) + 1, ny = Math.ceil((maxY - minY) / CELL_M) + 1;
  const grid = new Uint8Array(nx * ny);
  // paint each disk
  for (const d of disks) {
    const i0 = Math.max(0, Math.floor((d.x - d.r - minX) / CELL_M)), i1 = Math.min(nx - 1, Math.ceil((d.x + d.r - minX) / CELL_M));
    const j0 = Math.max(0, Math.floor((d.y - d.r - minY) / CELL_M)), j1 = Math.min(ny - 1, Math.ceil((d.y + d.r - minY) / CELL_M));
    const r2 = d.r * d.r;
    for (let j = j0; j <= j1; j++) {
      const cy = minY + (j + 0.5) * CELL_M, dy = cy - d.y;
      for (let i = i0; i <= i1; i++) {
        const cx = minX + (i + 0.5) * CELL_M, dx = cx - d.x;
        if (dx * dx + dy * dy <= r2) grid[j * nx + i] = 1;
      }
    }
  }
  // horizontal run-length → rectangles (adjacent rects share exact edges → union merges)
  const rects = [];
  for (let j = 0; j < ny; j++) {
    let i = 0;
    while (i < nx) {
      if (!grid[j * nx + i]) { i++; continue; }
      let k = i; while (k < nx && grid[j * nx + k]) k++;
      const x0 = minX + i * CELL_M, x1 = minX + k * CELL_M, y0 = minY + j * CELL_M, y1 = minY + (j + 1) * CELL_M;
      rects.push(turf.polygon([[toLL(x0, y0), toLL(x1, y0), toLL(x1, y1), toLL(x0, y1), toLL(x0, y0)]]));
      i = k;
    }
  }
  if (!rects.length) return turf.circle([lng, lat], originR / 1000, { steps: 24, units: "kilometers" });
  let merged;
  try { merged = rects.length === 1 ? rects[0] : turf.union(turf.featureCollection(rects)); }
  catch (_) { merged = rects[0]; }
  // De-block the grid outline: round the corners, thin the vertices, then Chaikin-smooth
  // the stair-steps into curves — and merge the result back into a single feature.
  try { merged = turf.buffer(merged, CELL_M * 0.6, { units: "meters", steps: 8 }); } catch (_) {}
  try { merged = turf.simplify(merged, { tolerance: 0.0005, highQuality: true, mutate: true }); } catch (_) {}
  try {
    const sm = turf.polygonSmooth(merged, { iterations: 3 });
    const coords = [];
    turf.geomEach(sm, g => { if (g.type === "Polygon") coords.push(g.coordinates); else if (g.type === "MultiPolygon") g.coordinates.forEach(c => coords.push(c)); });
    if (coords.length) merged = coords.length === 1 ? turf.polygon(coords[0]) : turf.multiPolygon(coords);
  } catch (_) {}
  try { merged = turf.simplify(merged, { tolerance: 0.00018, highQuality: false, mutate: true }); } catch (_) {}
  return merged;
}

// ── public entry ──────────────────────────────────────────────────────────────
// { lng, lat, minutes } → GeoJSON Feature (Polygon/MultiPolygon), FeatureCollection-wrapped
async function transitIsochrone({ lng, lat, minutes }) {
  const cutoffSec = Math.max(5, Math.min(minutes || 30, 90)) * 60;
  const band = bandOf(Date.now());
  const t0 = Date.now();
  const { net, label } = await reachableStops(lng, lat, cutoffSec, band);
  const poly = buildPolygon(net, label, lng, lat, cutoffSec);
  const feat = poly && poly.type === "Feature" ? poly
    : { type: "Feature", properties: {}, geometry: (poly && poly.geometry) || poly };
  feat.properties = { contour: minutes, mode: "transit", band, stops_reached: label.size, ms: Date.now() - t0 };
  return { type: "FeatureCollection", features: [feat] };
}

module.exports = { transitIsochrone, getNetwork };
