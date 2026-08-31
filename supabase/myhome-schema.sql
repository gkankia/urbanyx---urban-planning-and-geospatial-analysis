-- ============================================================
-- Urbanyx — Myhome.ge listing mirror
-- Written by server/cron-myhome-collector.js (service key, bypasses RLS).
-- Read by the app's real-estate layer (authenticated users only).
--
-- Source is the public tnet statement API; see server/myhome-api.js.
-- Coordinates are stored as plain numerics to match the parcels table
-- (no PostGIS dependency); the bbox RPC at the bottom is what the map calls.
--
-- HOW TO RUN: paste into Supabase SQL Editor → Run. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS myhome_listings (
  id                  bigint      PRIMARY KEY,          -- myhome statement id
  uuid                uuid,
  url                 text,
  title               text,

  -- classification (id kept alongside the label so filters stay cheap and
  -- stable even if myhome relabels a category)
  deal_type_id        smallint,                          -- 1 sale · 2 rent · 3 lease · 7 daily · 10 by-leased
  deal_type           text,
  property_type_id    smallint,                          -- 1 apartment · 2 house · 3 country house · 4 plot · 5 commercial · 6 hotel
  property_type       text,
  condition_id        smallint,
  condition           text,
  building_status_id  smallint,                          -- 1 old · 2 new · 3 under construction
  building_status     text,

  -- price: myhome publishes all three currencies per listing, plus its own
  -- GEL/USD rate. Storing all three avoids a conversion service and keeps
  -- historical rows honest when the rate moves.
  price_gel           numeric,
  price_usd           numeric,
  price_eur           numeric,
  price_per_sqm_gel   numeric,
  price_negotiable    boolean     NOT NULL DEFAULT false,
  fx_gel_per_usd      numeric,

  area                numeric,
  area_unit           text        DEFAULT 'm2',          -- 'm2' everywhere except plots, which may be 'Ha'
  yard_area           numeric,
  rooms               smallint,                          -- decoded count, NOT the raw enum id
  bedrooms            smallint,
  bathrooms           smallint,
  floor               smallint,
  total_floors        smallint,
  ceiling_height      numeric,
  balconies           smallint,

  heating             text,
  hot_water           text,
  parking             text,
  material            text,
  project_type        text,
  amenities           text[]      NOT NULL DEFAULT '{}',

  city_id             integer,
  city                text,
  district_id         integer,
  district            text,
  urban_id            integer,
  urban               text,
  street_id           integer,
  address             text,
  metro_station_id    integer,

  -- Cadastral (NAPR) codes, from the detail endpoint's rs_code field and, as a
  -- fallback, the address. An array because the field is free text and a single
  -- listing can cover several adjoining parcels. ~63 % of land plots carry one;
  -- apartments essentially never do. This is the join key to the parcels table
  -- — see myhome-cadastral-link.sql.
  rs_codes            text[]      NOT NULL DEFAULT '{}',
  rs_code_primary     text,

  -- ── geometry ──
  -- Myhome pins are unreliable: a sizeable minority are geocoded to the wrong
  -- part of the country. geo_offset_m is the distance from the centroid of the
  -- listing's OWN urban/district/city, and geo_suspect marks the ones past the
  -- threshold for that level. Keep them, don't trust them — render suspect pins
  -- differently or snap them to the area centroid.
  -- lat/lng arrive from the DETAIL endpoint only: the bulk list response drops
  -- coordinates at per_page >= 4. Rows land here geo-less from discovery and are
  -- filled in by the enrichment pass; detail_fetched_at is that queue's marker.
  lat                 double precision,
  lng                 double precision,
  geo_ref             text,                              -- 'urban' | 'district' | 'city' | null
  geo_offset_m        integer,
  geo_suspect         boolean     NOT NULL DEFAULT false,
  geo_reason          text,                              -- 'missing' | 'outside_georgia' | 'far_from_centroid' | 'pending'
  detail_fetched_at   timestamptz,                       -- null ⇒ still in the enrichment queue

  image_url           text,
  image_count         smallint    NOT NULL DEFAULT 0,
  has_3d              boolean     NOT NULL DEFAULT false,

  is_vip              boolean     NOT NULL DEFAULT false,
  seller_type         text,                              -- 'broker' | 'physical' | …
  views               integer,

  description         text,
  published_at        timestamptz,
  updated_at          timestamptz,                       -- myhome's last_updated — the sync watermark
  fetched_at          timestamptz NOT NULL DEFAULT now(),
  delisted_at         timestamptz                        -- set when a listing stops appearing; never hard-deleted
);

-- Map viewport queries: bbox first, then the usual facets.
CREATE INDEX IF NOT EXISTS idx_mhl_bbox      ON myhome_listings (lat, lng) WHERE delisted_at IS NULL AND geo_suspect = false;
CREATE INDEX IF NOT EXISTS idx_mhl_deal      ON myhome_listings (deal_type_id, property_type_id, city_id) WHERE delisted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mhl_price     ON myhome_listings (deal_type_id, price_usd) WHERE delisted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mhl_updated   ON myhome_listings (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mhl_urban     ON myhome_listings (urban_id, deal_type_id) WHERE delisted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mhl_amenities ON myhome_listings USING gin (amenities);
CREATE INDEX IF NOT EXISTS idx_mhl_rs_codes  ON myhome_listings USING gin (rs_codes);
CREATE INDEX IF NOT EXISTS idx_mhl_rs_primary ON myhome_listings (rs_code_primary) WHERE rs_code_primary IS NOT NULL;
-- Drives the enrichment queue: listings still waiting on a detail fetch.
CREATE INDEX IF NOT EXISTS idx_mhl_enrich    ON myhome_listings (city_id, updated_at DESC) WHERE detail_fetched_at IS NULL AND delisted_at IS NULL;

-- Processing ledger — one row per sync run; the collector reads the newest
-- successful run's watermark to know where to stop paging.
CREATE TABLE IF NOT EXISTS myhome_sync_log (
  id            bigserial PRIMARY KEY,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  mode          text        NOT NULL,          -- 'backfill' | 'incremental' | 'enrich'
  pages         integer     NOT NULL DEFAULT 0,
  seen          integer     NOT NULL DEFAULT 0,
  upserted      integer     NOT NULL DEFAULT 0,
  suspect_geo   integer     NOT NULL DEFAULT 0,
  watermark     timestamptz,                   -- newest updated_at observed this run
  ok            boolean     NOT NULL DEFAULT false,
  notes         text
);
CREATE INDEX IF NOT EXISTS idx_mhsl_recent ON myhome_sync_log (ok, finished_at DESC);

-- ── RLS: listings are for signed-in users; all writes use the service key ──
ALTER TABLE myhome_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE myhome_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "myhome_listings: authenticated read" ON myhome_listings;
CREATE POLICY "myhome_listings: authenticated read"
  ON myhome_listings FOR SELECT TO authenticated USING (delisted_at IS NULL);

DROP POLICY IF EXISTS "myhome_sync_log: authenticated read" ON myhome_sync_log;
CREATE POLICY "myhome_sync_log: authenticated read"
  ON myhome_sync_log FOR SELECT TO authenticated USING (true);

-- ============================================================
-- Map RPC — returns a ready-made GeoJSON FeatureCollection for a viewport.
-- Doing the assembly in Postgres keeps the payload to one round trip and
-- lets the app hand the result straight to map.getSource(...).setData().
--
--   const { data } = await sb.rpc('myhome_listings_bbox', {
--     min_lng: w, min_lat: s, max_lng: e, max_lat: n,
--     p_deal_type: 1, p_property_type: 1, p_max_price_usd: 150000, p_limit: 2000
--   });
--   map.getSource('myhome').setData(data);
-- ============================================================
CREATE OR REPLACE FUNCTION myhome_listings_bbox(
  min_lng          double precision,
  min_lat          double precision,
  max_lng          double precision,
  max_lat          double precision,
  p_deal_type      smallint DEFAULT NULL,
  p_property_type  smallint DEFAULT NULL,
  p_min_price_usd  numeric  DEFAULT NULL,
  p_max_price_usd  numeric  DEFAULT NULL,
  p_min_rooms      smallint DEFAULT NULL,
  p_include_suspect boolean DEFAULT false,
  p_limit          integer  DEFAULT 2000
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER          -- RLS still applies; anon gets nothing
SET search_path = public
AS $$
  WITH hits AS (
    SELECT *
      FROM myhome_listings
     WHERE delisted_at IS NULL
       AND lat BETWEEN min_lat AND max_lat
       AND lng BETWEEN min_lng AND max_lng
       AND (p_include_suspect OR geo_suspect = false)
       AND (p_deal_type     IS NULL OR deal_type_id     = p_deal_type)
       AND (p_property_type IS NULL OR property_type_id = p_property_type)
       AND (p_min_price_usd IS NULL OR price_usd >= p_min_price_usd)
       AND (p_max_price_usd IS NULL OR price_usd <= p_max_price_usd)
       AND (p_min_rooms     IS NULL OR rooms     >= p_min_rooms)
     ORDER BY is_vip DESC, updated_at DESC
     LIMIT LEAST(GREATEST(p_limit, 1), 10000)
  )
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'id', id,
        'geometry', jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(lng, lat)),
        'properties', jsonb_build_object(
          'id', id, 'title', title, 'url', url,
          'deal_type', deal_type, 'deal_type_id', deal_type_id,
          'property_type', property_type, 'property_type_id', property_type_id,
          'price_gel', price_gel, 'price_usd', price_usd,
          'price_per_sqm_gel', price_per_sqm_gel,
          'area', area, 'rooms', rooms, 'floor', floor, 'total_floors', total_floors,
          'district', district, 'urban', urban, 'address', address,
          'image_url', image_url, 'geo_suspect', geo_suspect
        )
      )
    ), '[]'::jsonb)
  )
  FROM hits;
$$;

GRANT EXECUTE ON FUNCTION myhome_listings_bbox(
  double precision, double precision, double precision, double precision,
  smallint, smallint, numeric, numeric, smallint, boolean, integer
) TO authenticated;

-- Neighbourhood price statistics — the analytics view the platform can lean on.
CREATE OR REPLACE VIEW myhome_urban_stats AS
SELECT
  city, district, urban, urban_id,
  deal_type_id, property_type_id,
  count(*)                                                             AS n,
  round(avg(price_per_sqm_gel))                                        AS avg_sqm_gel,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY price_per_sqm_gel))AS med_sqm_gel,
  round(percentile_cont(0.1) WITHIN GROUP (ORDER BY price_per_sqm_gel))AS p10_sqm_gel,
  round(percentile_cont(0.9) WITHIN GROUP (ORDER BY price_per_sqm_gel))AS p90_sqm_gel,
  round(avg(area)::numeric, 1)                                         AS avg_area,
  max(updated_at)                                                      AS last_seen
FROM myhome_listings
WHERE delisted_at IS NULL
  AND price_per_sqm_gel IS NOT NULL
  AND price_per_sqm_gel > 0
GROUP BY city, district, urban, urban_id, deal_type_id, property_type_id;
