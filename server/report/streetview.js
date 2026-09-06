"use strict";
// Street-level imagery, re-projected.
//
// Mapillary's Tbilisi coverage is mostly 360° spherical frames, with fisheye
// and plain perspective mixed in. Dropping any of those into a report as-is
// reproduces the camera: the panorama bends every straight line, the fisheye
// bulges, and both are shot from a car so the horizon is rolled and tilted.
//
// The reconstruction gives us everything needed to undo that. `computed_rotation`
// is the world→camera rotation (angle-axis, world frame is East/North/Up, camera
// +Z is the optical axis and +Y points down), and `camera_parameters` is
// [focal, k1, k2] in OpenSfM's normalised form. So for each output pixel we
// build a ray in world space — level, aimed at the site — rotate it into the
// camera, and project it through that camera's own model to find the source
// pixel. The result is rectilinear: straight lines are straight, the horizon is
// level, and the view faces the parcel rather than wherever the car was going.
//
// Resolution is protected by sampling the ORIGINAL frame (7680×3840 for a
// Mapillary pano), not a thumbnail: a 70° view off a 7680-wide equirectangular
// draws on ~1500 source pixels, so a 1400 px render is a genuine 1400 px.
const sharp = requireSharp();

function requireSharp() {
  // Optional: without it the report simply omits the imagery rather than failing.
  try {
    const s = require("sharp");
    // libvips keeps decoded tiles and a worker pool around by default. This
    // module runs beside a live Chromium on a small instance and re-projects
    // one frame at a time, so neither buys anything and both cost memory.
    s.cache(false);
    s.concurrency(1);
    return s;
  } catch (_) { return null; }
}

const OUT_W = 1400;
const ASPECT = 3 / 2;
const FOV_STEPS = [72, 64, 56, 48, 40, 33];
const FETCH_TIMEOUT_MS = 9000;
const MAX_BYTES = 24 * 1024 * 1024;
const MAX_IMAGES = 4;
const MAX_CANDIDATES = 5;
// Mapillary serves its frames from its own domain and from Meta's CDN.
const HOST_OK = /(^|\.)(mapillary\.com|fbcdn\.net)$/i;

// ── small vector helpers ───────────────────────────────────────────────────
function rodrigues(r) {
  const th = Math.hypot(r[0], r[1], r[2]);
  if (th < 1e-9) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const [x, y, z] = [r[0] / th, r[1] / th, r[2] / th];
  const c = Math.cos(th), s = Math.sin(th), t = 1 - c;
  return [
    t * x * x + c,     t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c,     t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
}

// Fallback when the reconstruction has no rotation: a level camera pointing at
// the compass angle. Rows are the camera axes expressed in world ENU.
function rotFromCompass(deg) {
  const b = (deg || 0) * Math.PI / 180, s = Math.sin(b), c = Math.cos(b);
  return [c, -s, 0, 0, 0, -1, s, c, 0];
}

// ── camera models (OpenSfM) ────────────────────────────────────────────────
// Each maps a direction in camera space to a source pixel, or null if the ray
// falls outside what that camera saw.
function projector(type, params, W, H) {
  if (type === "spherical" || type === "equirectangular") {
    return (x, y, z, out) => {
      const lon = Math.atan2(x, z);
      const lat = Math.atan2(-y, Math.hypot(x, z));
      out[0] = W * (0.5 + lon / (2 * Math.PI));
      out[1] = H * (0.5 - lat / Math.PI);
      return true;
    };
  }
  const p = params || [];
  const focal = Number(p[0]) || 0.85, k1 = Number(p[1]) || 0, k2 = Number(p[2]) || 0;
  const size = Math.max(W, H), cx = W / 2, cy = H / 2;
  if (type === "fisheye") {
    return (x, y, z, out) => {
      const r = Math.hypot(x, y);
      const theta = Math.atan2(r, z);
      if (theta > Math.PI * 0.72) return false;         // beyond the lens circle
      const td = theta * (1 + k1 * theta * theta + k2 * Math.pow(theta, 4));
      const s = r > 1e-9 ? focal * td / r : 0;
      out[0] = x * s * size + cx;
      out[1] = y * s * size + cy;
      return true;
    };
  }
  return (x, y, z, out) => {                            // perspective
    if (z <= 1e-6) return false;
    const xn = x / z, yn = y / z, r2 = xn * xn + yn * yn;
    const d = 1 + k1 * r2 + k2 * r2 * r2;
    out[0] = focal * d * xn * size + cx;
    out[1] = focal * d * yn * size + cy;
    return true;
  };
}

// ── the view ───────────────────────────────────────────────────────────────
// Builds the world-space ray for one output pixel: forward is the bearing to
// the site, up is world up, so the horizon comes out level whatever the car did.
function viewBasis(bearingDeg) {
  const b = (bearingDeg || 0) * Math.PI / 180;
  return {
    f: [Math.sin(b), Math.cos(b), 0],
    r: [Math.cos(b), -Math.sin(b), 0],
    u: [0, 0, 1],
  };
}

function mapPixels(cfg) {
  const { outW, outH, fov, basis, R, project, W, H, wrap } = cfg;
  const t = Math.tan(fov * Math.PI / 360);
  const px = new Float32Array(outW * outH), py = new Float32Array(outW * outH);
  const ok = new Uint8Array(outW * outH);
  const o = [0, 0];
  let covered = 0;
  for (let j = 0; j < outH; j++) {
    const v = -((j + 0.5) - outH / 2) / (outW / 2) * t;
    for (let i = 0; i < outW; i++) {
      const u = ((i + 0.5) - outW / 2) / (outW / 2) * t;
      let dx = basis.f[0] + u * basis.r[0] + v * basis.u[0];
      let dy = basis.f[1] + u * basis.r[1] + v * basis.u[1];
      let dz = basis.f[2] + u * basis.r[2] + v * basis.u[2];
      const n = Math.hypot(dx, dy, dz); dx /= n; dy /= n; dz /= n;
      const cx = R[0] * dx + R[1] * dy + R[2] * dz;
      const cy = R[3] * dx + R[4] * dy + R[5] * dz;
      const cz = R[6] * dx + R[7] * dy + R[8] * dz;
      const k = j * outW + i;
      if (!project(cx, cy, cz, o)) { ok[k] = 0; continue; }
      let sx = o[0];
      if (wrap) sx = ((sx % W) + W) % W;
      const sy = o[1];
      if (sy < 0 || sy > H - 1 || (!wrap && (sx < 0 || sx > W - 1))) { ok[k] = 0; continue; }
      px[k] = sx; py[k] = sy; ok[k] = 1; covered++;
    }
  }
  return { px, py, ok, coverage: covered / (outW * outH) };
}

// Aiming every frame at the site is right when the site is visible and useless
// when a wall is in the way — that view comes back as an even expanse of
// concrete. Cheap edge energy separates the two well enough to rank frames and
// to drop the ones that carry nothing.
function detailScore(rgb, w, h) {
  let grad = 0, sum = 0, sumSq = 0, n = 0;
  const lum = (k) => 0.299 * rgb[k * 3] + 0.587 * rgb[k * 3 + 1] + 0.114 * rgb[k * 3 + 2];
  for (let y = 0; y < h - 2; y += 2) {
    for (let x = 0; x < w - 2; x += 2) {
      const k = y * w + x, v = lum(k);
      grad += Math.abs(v - lum(k + 2)) + Math.abs(v - lum(k + 2 * w));
      sum += v; sumSq += v * v; n++;
    }
  }
  if (!n) return { grad: 0, sd: 0 };
  const mean = sum / n;
  return { grad: grad / (2 * n), sd: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
}

// Featureless in both measures — not "a plain building", but nothing at all.
const isBlank = (d) => !d || (d.grad < 2.0 && d.sd < 22);

/**
 * Re-project one frame to a rectilinear view aimed at `bearing`.
 * Returns { buffer, width, height, fov } or null.
 */
async function rectify(bytes, img) {
  if (!sharp) return null;
  const meta = await sharp(bytes).metadata();
  const W = meta.width, H = meta.height;
  if (!W || !H) return null;

  const type = String(img.cameraType || "perspective").toLowerCase();
  const wrap = type === "spherical" || type === "equirectangular";
  const R = Array.isArray(img.rotation) && img.rotation.length === 3
    ? rodrigues(img.rotation)
    : rotFromCompass(img.compass != null ? img.compass : img.bearing);
  const project = projector(type, img.cameraParams, W, H);
  const basis = viewBasis(img.bearing);
  const outW = OUT_W, outH = Math.round(OUT_W / ASPECT);

  // A pano always covers the full sphere; a fisheye or a phone camera does not,
  // and levelling the horizon rotates the frame, so widen only as far as the
  // source actually reaches rather than printing black wedges.
  let map = null;
  for (const fov of FOV_STEPS) {
    map = mapPixels({ outW, outH, fov, basis, R, project, W, H, wrap });
    if (map.coverage > 0.999) { map.fov = fov; break; }
    map.fov = fov;
  }
  if (!map || map.coverage < 0.97) return null;

  // Only the source region the view touches is decoded — a 70° window on a
  // 7680×3840 pano is a few megabytes, not the whole frame.
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let k = 0; k < map.ok.length; k++) {
    if (!map.ok[k]) continue;
    const a = map.px[k], b = map.py[k];
    if (a < x0) x0 = a; if (a > x1) x1 = a;
    if (b < y0) y0 = b; if (b > y1) y1 = b;
  }
  // A view straddling the panorama's seam would need two strips; take the full
  // width instead, which is still only the vertical band the view uses.
  const seam = wrap && (x1 - x0) > W * 0.75;
  const left = seam ? 0 : Math.max(0, Math.floor(x0) - 1);
  const right = seam ? W : Math.min(W, Math.ceil(x1) + 2);
  const top = Math.max(0, Math.floor(y0) - 1);
  const bottom = Math.min(H, Math.ceil(y1) + 2);
  const rw = right - left, rh = bottom - top;
  if (rw < 2 || rh < 2) return null;

  const { data } = await sharp(bytes, { sequentialRead: true })
    .extract({ left, top, width: rw, height: rh })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(outW * outH * 3);
  for (let k = 0; k < map.ok.length; k++) {
    const d = k * 3;
    if (!map.ok[k]) { out[d] = 255; out[d + 1] = 255; out[d + 2] = 255; continue; }
    const fx = map.px[k] - left, fy = map.py[k] - top;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const ix1 = seam ? (ix + 1) % rw : Math.min(ix + 1, rw - 1);
    const ix0 = seam ? ((ix % rw) + rw) % rw : Math.max(0, Math.min(ix, rw - 1));
    const iy0 = Math.max(0, Math.min(iy, rh - 1)), iy1 = Math.min(iy + 1, rh - 1);
    const a = (iy0 * rw + ix0) * 3, b = (iy0 * rw + ix1) * 3;
    const c = (iy1 * rw + ix0) * 3, e = (iy1 * rw + ix1) * 3;
    for (let ch = 0; ch < 3; ch++) {
      out[d + ch] =
        data[a + ch] * (1 - tx) * (1 - ty) + data[b + ch] * tx * (1 - ty) +
        data[c + ch] * (1 - tx) * ty + data[e + ch] * tx * ty;
    }
  }

  const jpeg = await sharp(out, { raw: { width: outW, height: outH, channels: 3 } })
    .jpeg({ quality: 86, chromaSubsampling: "4:4:4" })
    .toBuffer();
  return { buffer: jpeg, width: outW, height: outH, fov: map.fov, detail: detailScore(out, outW, outH) };
}

// Node 18+ has fetch globally; the dependency is the fallback for older runtimes.
const httpGet = typeof fetch === "function"
  ? fetch
  : (...a) => import("node-fetch").then(({ default: f }) => f(...a));

async function download(url) {
  if (!/^https:\/\//i.test(url)) return null;
  let host;
  try { host = new URL(url).hostname; } catch (_) { return null; }
  if (!HOST_OK.test(host)) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await httpGet(url, { signal: ctl.signal });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > MAX_BYTES ? null : buf;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Turn the payload's street-imagery block into printable frames.
 * Never throws and never blocks the report: anything that fails is dropped.
 */
async function prepare(block) {
  if (!sharp || !block || !Array.isArray(block.images) || !block.images.length) return null;
  const list = block.images.slice(0, MAX_CANDIDATES);
  // Fetching is I/O and runs together; re-projection is CPU and memory and runs
  // one at a time, next to a Chromium that is already holding a few hundred MB.
  const bytes = await Promise.all(list.map((i) => download(i.url).catch(() => null)));
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (!bytes[i]) continue;
    try {
      const r = await rectify(bytes[i], list[i]);
      if (!r || isBlank(r.detail)) continue;
      out.push({
        id: list[i].id,
        caption: list[i].caption || "",
        link: list[i].link || null,
        score: r.detail.grad * r.detail.sd,
        dataUrl: "data:image/jpeg;base64," + r.buffer.toString("base64"),
      });
    } catch (err) {
      console.warn("[report] street view failed:", (err && err.message) || err);
    }
    bytes[i] = null;
  }
  if (!out.length) return null;
  // More candidates arrive than the page has room for; keep the frames that
  // actually show something, in the order the client ranked them by distance.
  const keep = out.slice().sort((a, b) => b.score - a.score).slice(0, MAX_IMAGES);
  const images = out.filter((o) => keep.includes(o)).map(({ score, ...rest }) => rest);
  return { images, note: block.note || "", credit: block.credit || "" };
}

module.exports = { prepare, rectify, available: () => !!sharp };
