"use strict";

// ── Myhome.ge statement API client ────────────────────────────────────────────
// Thin wrapper over the public JSON API that powers myhome.ge (tnet group).
// No auth, no scraping: the site's own Next.js frontend calls these endpoints,
// the only required header is X-Website-Key.
//
//   GET /v1/statements/count                 → {total, last_page, ...}
//   GET /v1/statements                       → paged list, ALREADY carries lat/lng
//   GET /v1/statements/{id}                  → full detail (description, owner)
//   GET /v1/statements/statement-parameters  → every enum dictionary + geo tree
//
// Three things that shape the design here:
//   1. COORDINATES ARE NOT IN BULK LIST RESPONSES. The list endpoint returns
//      lat/lng only when per_page <= 3; at per_page >= 4 the fields are dropped
//      entirely (verified — it is deterministic, not intermittent). Read that as
//      a deliberate limit on bulk coordinate harvesting and respect it: pull
//      metadata in bulk from the list endpoint, then enrich coordinates one
//      listing at a time from the detail endpoint, scoped to the area you
//      actually serve. Do not loop the list at per_page=3 to get around it.
//   2. Everything else IS in the list rows — all three prices, area, floor,
//      rooms, address, images — so change detection costs ~700 requests for the
//      whole ~344k corpus at per_page=500, and detail calls are only needed
//      once per listing (coordinates rarely change after publication).
//   3. Default sort is last_updated DESC and deep pagination works, so
//      incremental sync = walk pages until you cross the watermark, then stop.
//
// Pins are NOT trustworthy either. Some listings are geocoded to the wrong side
// of the country (a Gldani flat pinned in Old Tbilisi, 11 km out). normalize()
// measures the distance from the listing's own urban/district centroid and
// flags the outliers — see geoCheck() below.

const BASE = "https://api-statements.tnet.ge";
const HEADERS = {
  "X-Website-Key": "myhome",
  "Accept": "application/json",
  "User-Agent": "Urbanyx/1.0 (+https://urbanyx.ge)",
};

const MAX_PER_PAGE   = 500;   // server honours this; 1000 starts truncating
const GEO_PER_PAGE   = 3;     // lat/lng only present at per_page <= 3 (see above)
const MIN_INTERVAL_MS = 350;  // be a polite guest — ~3 req/s ceiling
const MAX_RETRIES     = 4;

// Geo-sanity thresholds: how far a pin may sit from its own area's centroid
// before we stop trusting it. Tuned against known-good and known-bad listings
// (a correct Didi Dighomi pin is ~490 m out; a mislabelled Gldani one, 11 km).
const GEO_LIMIT_M = { urban: 4000, district: 12000, city: 50000 };

// Georgia's bounding box — anything outside is a data-entry accident.
const GE_BBOX = { minLat: 41.0, maxLat: 43.6, minLng: 39.9, maxLng: 46.8 };

// ── request plumbing ──────────────────────────────────────────────────────────

let _lastRequestAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const wait = MIN_INTERVAL_MS - (Date.now() - _lastRequestAt);
  if (wait > 0) await sleep(wait);
  _lastRequestAt = Date.now();
}

async function apiGet(path, params = {}, { timeoutMs = 30000, locale = "ka" } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const url = `${BASE}${path}${qs.toString() ? "?" + qs : ""}`;

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { ...HEADERS, locale }, signal: ctl.signal });
      // 429 and 5xx are worth another try; 4xx otherwise is our own bug.
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${path}`), { fatal: true });
      const body = await res.json();
      if (body && body.result === false) throw Object.assign(new Error(body.message || "API returned result:false"), { fatal: true });
      return body.data;
    } catch (e) {
      lastErr = e;
      if (e.fatal || attempt === MAX_RETRIES) break;
      await sleep(Math.min(15000, 800 * 2 ** attempt) + Math.random() * 400);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// ── endpoints ─────────────────────────────────────────────────────────────────

/** Total listings matching `filters` (cheap — use it to size a backfill). */
async function fetchCount(filters = {}) {
  const d = await apiGet("/v1/statements/count", filters);
  return { total: d.total, lastPage: d.last_page, perPage: d.per_page };
}

/**
 * One page of listings: price, area, rooms, address, images — but NOT lat/lng
 * unless perPage <= GEO_PER_PAGE. Use fetchDetail() for coordinates.
 */
async function fetchPage({ page = 1, perPage = MAX_PER_PAGE, filters = {} } = {}) {
  const d = await apiGet("/v1/statements", { ...filters, page, per_page: Math.min(perPage, MAX_PER_PAGE) });
  return Array.isArray(d && d.data) ? d.data : [];
}

/** Full detail for one listing — description, owner name, nearby places. */
async function fetchDetail(id, locale = "ka") {
  const d = await apiGet(`/v1/statements/${id}`, {}, { locale });
  return d && d.statement;
}

/**
 * Every enum dictionary plus the city → district → urban tree with centroids.
 * Cached for 12 h; these change a few times a year at most.
 */
let _dicts = null;
let _dictsAt = 0;
async function getDictionaries({ locale = "en", maxAgeMs = 12 * 3600000 } = {}) {
  if (_dicts && Date.now() - _dictsAt < maxAgeMs) return _dicts;
  const raw = await apiGet("/v1/statements/statement-parameters", {}, { locale });

  // Most dictionaries arrive keyed by real_estate_type_id with the same values
  // repeated per type. Flatten to a single id → label map.
  const flatten = (key) => {
    const v = raw[key];
    if (!v) return new Map();
    const arr = Array.isArray(v) ? v : Object.values(v).flat();
    const m = new Map();
    for (const x of arr) if (x && x.id != null) m.set(x.id, x.display_name || x.key || x.title || null);
    return m;
  };

  // Geo tree: id → {name, lat, lng} at each level, for the pin sanity check.
  const cities = new Map(), districts = new Map(), urbans = new Map();
  const cityList = Array.isArray(raw.cities) ? raw.cities : Object.values(raw.cities || {}).flat();
  for (const c of cityList) {
    cities.set(c.id, { name: c.display_name, lat: c.lat, lng: c.lng });
    for (const d of c.districts || []) {
      districts.set(d.id, { name: d.display_name, lat: d.lat, lng: d.lng, cityId: c.id });
      for (const u of d.urbans || []) {
        urbans.set(u.id, { name: u.display_name, lat: u.lat, lng: u.lng, districtId: d.id, cityId: c.id });
      }
    }
  }

  const fxRate = (() => {
    const cur = Array.isArray(raw.currencies) ? raw.currencies : Object.values(raw.currencies || {}).flat();
    const usd = cur.find((c) => c.key === "dollar" || c.id === 2);
    return usd ? Number(usd.rate) : null;   // GEL per USD, as myhome itself uses
  })();

  _dicts = {
    fxRate,
    cities, districts, urbans,
    dealType:      flatten("deal_types"),
    realEstateType: flatten("real_estate_types"),
    condition:     flatten("conditions"),
    status:        flatten("statuses"),
    areaType:      flatten("area_types"),
    // room_types is NOT identity-mapped: id 7 means 6 rooms, 8 means 7, …
    roomType:      flatten("room_types"),
    bedroomType:   flatten("bedroom_types"),
    bathroomType:  flatten("bathroom_types"),
    heatingType:   flatten("heating_types"),
    hotWaterType:  flatten("hot_water_types"),
    parkingType:   flatten("parking_types"),
    materialType:  flatten("material_types"),
    projectType:   flatten("project_types"),
    storeroomType: flatten("storeroom_types"),
    buildYear:     flatten("build_years"),
    parameter:     flatten("statement_parameters"),
  };
  _dictsAt = Date.now();
  return _dicts;
}

// ── cadastral codes ───────────────────────────────────────────────────────────

// Georgian cadastral (NAPR) codes come in two legitimate shapes:
//   NN.NN.NN.NNN      regional/rural  — e.g. 27.15.42.174
//   NN.NN.NN.NNN.NNN  urban           — e.g. 01.72.14.095.073
// plus the occasional 4-digit final segment (72.16.25.1023).
//
// The field is free text, so it also carries several codes at once, separated by
// runs of spaces or slashes, and sometimes a stray leading zero (001.72.…).
// Measured on a 71-plot sample: ~63 % of land plots carry a code, apartments
// essentially never do — this is a plot-level join key.
const CADASTRAL_RE = /\b\d{2,3}(?:\.\d{2,4}){3,4}\b/g;

/**
 * Pull every cadastral code out of a listing's rs_code field and, as a fallback,
 * its address (some listings put the code where the street should go).
 * Returns a de-duplicated array in the canonical dotted form.
 */
function parseCadastralCodes(...sources) {
  const out = new Set();
  for (const src of sources) {
    if (!src) continue;
    for (const m of String(src).match(CADASTRAL_RE) || []) {
      // 001.72.… → 01.72.… ; a 3-digit lead is only ever a typo'd 2-digit one
      const parts = m.split(".");
      if (parts[0].length === 3 && parts[0].startsWith("0")) parts[0] = parts[0].slice(1);
      out.add(parts.join("."));
    }
  }
  return [...out];
}

// ── normalisation ─────────────────────────────────────────────────────────────

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * How much to trust this listing's pin.
 * Returns {ref, offsetM, suspect} where ref is the finest administrative unit
 * we could compare against. A listing whose pin sits further from its own
 * area's centroid than that level allows gets suspect:true — render those
 * differently, or fall back to the area centroid, rather than dropping them.
 */
function geoCheck(lat, lng, { urbanId, districtId, cityId }, dicts) {
  // undefined = this payload never carried coordinates (a bulk list row);
  // null/0 = the listing itself has none. Only the latter is a data problem.
  if (lat === undefined || lng === undefined) {
    return { ref: null, offsetM: null, suspect: false, reason: "pending" };
  }
  if (lat === null || lng === null || (lat === 0 && lng === 0)) {
    return { ref: null, offsetM: null, suspect: true, reason: "missing" };
  }
  if (lat < GE_BBOX.minLat || lat > GE_BBOX.maxLat || lng < GE_BBOX.minLng || lng > GE_BBOX.maxLng) {
    return { ref: null, offsetM: null, suspect: true, reason: "outside_georgia" };
  }
  const levels = [
    ["urban", dicts.urbans.get(urbanId)],
    ["district", dicts.districts.get(districtId)],
    ["city", dicts.cities.get(cityId)],
  ];
  for (const [ref, node] of levels) {
    if (!node || node.lat == null) continue;
    const offsetM = Math.round(haversineM(lat, lng, node.lat, node.lng));
    return { ref, offsetM, suspect: offsetM > GEO_LIMIT_M[ref], reason: offsetM > GEO_LIMIT_M[ref] ? "far_from_centroid" : null };
  }
  return { ref: null, offsetM: null, suspect: false, reason: null };
}

/**
 * Flatten one raw statement (from either the list or the detail endpoint)
 * into the flat row Urbanyx stores. Unknown/absent fields become null rather
 * than disappearing, so the column set is stable across both sources.
 */
function normalize(raw, dicts) {
  if (!raw || raw.id == null) return null;

  // price is keyed by currency: 1 = GEL, 2 = USD, 3 = EUR.
  const p = raw.price || {};
  const gel = p["1"] || {}, usd = p["2"] || {}, eur = p["3"] || {};

  const hasGeo = "lat" in raw;                       // list rows omit the key entirely
  const lat = hasGeo ? num(raw.lat) : undefined;
  const lng = hasGeo ? num(raw.lng) : undefined;
  const geo = geoCheck(lat, lng, {
    urbanId: raw.urban_id, districtId: raw.district_id, cityId: raw.city_id,
  }, dicts);

  const label = (map, id) => (id == null ? null : map.get(id) ?? null);
  // rooms/bedrooms are enum ids, not counts — 10+ comes back as the string "10+"
  const count = (map, id) => {
    const v = label(map, id);
    if (v == null) return null;
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
  };

  // rs_code is detail-only — bulk list rows don't carry it.
  const rsCodes = parseCadastralCodes(raw.rs_code, raw.address);

  const images = Array.isArray(raw.images) ? raw.images : [];
  const main = images.find((i) => i && i.is_main) || images[0] || null;

  return {
    id: raw.id,
    uuid: raw.uuid || null,
    // The public URL is slug + '-' + id; the slug on its own 404s.
    url: raw.dynamic_slug ? `https://www.myhome.ge/udzravi-qoneba/${raw.dynamic_slug}-${raw.id}/` : null,
    title: raw.dynamic_title || null,

    deal_type_id: raw.deal_type_id ?? null,
    deal_type: label(dicts.dealType, raw.deal_type_id),
    property_type_id: raw.real_estate_type_id ?? null,
    property_type: label(dicts.realEstateType, raw.real_estate_type_id),
    condition_id: raw.condition_id ?? null,
    condition: label(dicts.condition, raw.condition_id),
    building_status_id: raw.status_id ?? null,
    building_status: label(dicts.status, raw.status_id),

    price_gel: num(gel.price_total),
    price_usd: num(usd.price_total),
    price_eur: num(eur.price_total),
    price_per_sqm_gel: num(gel.price_square),
    price_negotiable: !!raw.price_negotiable,
    fx_gel_per_usd: dicts.fxRate,

    area: num(raw.area),
    area_unit: label(dicts.areaType, raw.area_type_id) || "m2",
    yard_area: num(raw.yard_area),
    // List rows carry plain counts (`room`, `bedroom`); detail rows carry enum
    // ids where the mapping is NOT identity — room_type_id 7 means 6 rooms.
    rooms: num(raw.room) ?? count(dicts.roomType, raw.room_type_id),
    bedrooms: num(raw.bedroom) ?? count(dicts.bedroomType, raw.bedroom_type_id),
    bathrooms: count(dicts.bathroomType, raw.bathroom_type_id),
    floor: num(raw.floor),
    total_floors: num(raw.total_floors),
    ceiling_height: num(raw.height),
    balconies: num(raw.balconies),

    heating: label(dicts.heatingType, raw.heating_type_id),
    hot_water: label(dicts.hotWaterType, raw.hot_water_type_id),
    parking: label(dicts.parkingType, raw.parking_type_id),
    material: label(dicts.materialType, raw.material_type_id),
    project_type: label(dicts.projectType, raw.project_type_id),
    amenities: Array.isArray(raw.parameters)
      ? raw.parameters.map((x) => label(dicts.parameter, x && (x.id ?? x))).filter(Boolean)
      : [],

    city_id: raw.city_id ?? null,
    city: raw.city_name || null,
    district_id: raw.district_id ?? null,
    district: raw.district_name || null,
    urban_id: raw.urban_id ?? null,
    urban: raw.urban_name || null,
    street_id: raw.street_id ?? null,
    address: raw.address ? String(raw.address).trim() : null,
    metro_station_id: raw.metro_station_id ?? null,
    rs_codes: rsCodes,
    rs_code_primary: rsCodes[0] || null,

    lat: lat === undefined ? null : lat,
    lng: lng === undefined ? null : lng,
    geo_pending: geo.reason === "pending",
    geo_ref: geo.ref,
    geo_offset_m: geo.offsetM,
    geo_suspect: geo.suspect,
    geo_reason: geo.reason,

    image_url: main ? main.large || main.thumb || null : null,
    image_count: images.length,
    has_3d: !!raw.has_3d,

    is_vip: !!(raw.is_vip || raw.is_vip_plus || raw.is_super_vip),
    seller_type: raw.user_type ? raw.user_type.type || null : null,   // 'broker' | 'physical' | …
    views: num(raw.views),

    description: raw.comment ? String(raw.comment).replace(/<br\s*\/?>/gi, "\n").trim() : null,
    published_at: raw.created_at || null,
    updated_at: raw.last_updated || null,
    fetched_at: new Date().toISOString(),
  };
}

/** GeoJSON Feature for a normalized row — what the Mapbox source consumes. */
function toFeature(row) {
  if (row.lat == null || row.lng == null) return null;
  return {
    type: "Feature",
    id: row.id,
    geometry: { type: "Point", coordinates: [row.lng, row.lat] },
    properties: {
      id: row.id, title: row.title, url: row.url,
      deal_type: row.deal_type, property_type: row.property_type,
      price_gel: row.price_gel, price_usd: row.price_usd,
      price_per_sqm_gel: row.price_per_sqm_gel,
      area: row.area, rooms: row.rooms, floor: row.floor, total_floors: row.total_floors,
      district: row.district, urban: row.urban, address: row.address,
      image_url: row.image_url, geo_suspect: row.geo_suspect,
    },
  };
}

module.exports = {
  BASE, MAX_PER_PAGE, GEO_PER_PAGE, GEO_LIMIT_M,
  fetchCount, fetchPage, fetchDetail, getDictionaries,
  normalize, toFeature, geoCheck, haversineM, parseCadastralCodes,
};
