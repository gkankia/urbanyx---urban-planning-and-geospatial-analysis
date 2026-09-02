-- ============================================================
-- Urbanyx — Isochrone real-estate statistics
-- Depends on: supabase/myhome-schema.sql (run that first)
--
-- The myhome API has NO geographic filter — not bbox, radius, or polygon, at
-- any spelling — and it withholds coordinates from bulk list responses. So
-- "which listings fall inside this isochrone" is a question only our own mirror
-- can answer. This file adds the spatial column and the two RPCs the analysis
-- panel calls.
--
-- HOW TO RUN: paste into Supabase SQL Editor → Run. Idempotent.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- ── spatial columns ───────────────────────────────────────────────────────────
-- Generated, so they can never drift from lat/lng.

ALTER TABLE myhome_listings
  ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326)
  GENERATED ALWAYS AS (
    CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
         THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326) END
  ) STORED;

-- Plots are sometimes listed in hectares, and myhome's own price_square follows
-- the listed unit — so a 2 ha plot reports GEL per HECTARE in the same column an
-- apartment reports GEL per m². Normalising here is what keeps a median honest.
ALTER TABLE myhome_listings
  ADD COLUMN IF NOT EXISTS area_m2 numeric
  GENERATED ALWAYS AS (
    CASE WHEN area IS NULL THEN NULL
         WHEN area_unit = 'Ha' THEN area * 10000
         ELSE area END
  ) STORED;

-- Registry parcel geometry for listings matched by cadastral code. Declared
-- here, alongside the other spatial columns, but only ever POPULATED by
-- myhome_link_parcels() in myhome-cadastral-link.sql — so this file stands on
-- its own and the analysis simply improves once the link runs.
ALTER TABLE myhome_listings
  ADD COLUMN IF NOT EXISTS parcel_geom geometry(Geometry, 4326);

-- The geometry every spatial query should use: the registry parcel's centroid
-- when we have one, the listing's own pin otherwise, and NULL when neither is
-- trustworthy. Generated, so it can never fall out of step with its inputs.
ALTER TABLE myhome_listings
  ADD COLUMN IF NOT EXISTS geom_best geometry(Point, 4326)
  GENERATED ALWAYS AS (
    COALESCE(
      ST_Centroid(parcel_geom),
      CASE WHEN lat IS NOT NULL AND lng IS NOT NULL AND NOT geo_suspect
           THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326) END
    )
  ) STORED;

ALTER TABLE myhome_listings
  ADD COLUMN IF NOT EXISTS geom_source text
  GENERATED ALWAYS AS (
    CASE WHEN parcel_geom IS NOT NULL THEN 'parcel'
         WHEN lat IS NOT NULL AND lng IS NOT NULL AND NOT geo_suspect THEN 'pin'
         ELSE NULL END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_mhl_geom
  ON myhome_listings USING gist (geom)
  WHERE delisted_at IS NULL AND geo_suspect = false;
CREATE INDEX IF NOT EXISTS idx_mhl_geom_best
  ON myhome_listings USING gist (geom_best) WHERE delisted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mhl_parcel_geom
  ON myhome_listings USING gist (parcel_geom) WHERE parcel_geom IS NOT NULL;

-- Coverage counts touch only the two small "we couldn't map this" subsets, so
-- both get their own partial index. Counting every listing in the surrounding
-- neighbourhoods instead would triple the RPC's runtime for no extra insight.
CREATE INDEX IF NOT EXISTS idx_mhl_cov_pending
  ON myhome_listings (urban_id) WHERE detail_fetched_at IS NULL AND delisted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mhl_cov_suspect
  ON myhome_listings (urban_id) WHERE geo_suspect AND delisted_at IS NULL;

-- ============================================================
-- myhome_area_stats(area_geojson, …)
--
-- Per (deal type × property type) price statistics for every listing whose pin
-- falls inside `area_geojson` — pass the isochrone straight from the routing
-- provider's response.
--
--   const { data } = await sb.rpc('myhome_area_stats', {
--     area_geojson: isochrone.features[0].geometry,
--     p_min_sample: 5
--   });
--   // data.stats     → one row per category, medians in GEL and USD per m²
--   // data.coverage  → how much of the area's inventory is actually mapped yet
--
-- Returns medians, not means: listing prices have a long right tail and a
-- handful of aspirational asks would drag an average badly.
-- ============================================================
CREATE OR REPLACE FUNCTION myhome_area_stats(
  area_geojson   jsonb,
  p_deal_type    smallint DEFAULT NULL,   -- NULL = break out every deal type
  p_property_type smallint DEFAULT NULL,
  p_min_sample   integer  DEFAULT 5,      -- below this, a median is noise
  p_max_age_days integer  DEFAULT NULL    -- e.g. 180 to ignore stale listings
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER               -- RLS still applies; anon sees nothing
SET search_path = public, extensions
AS $$
DECLARE
  poly  geometry;
  result jsonb;
BEGIN
  poly := ST_SetSRID(ST_GeomFromGeoJSON(area_geojson), 4326);
  IF poly IS NULL OR NOT ST_IsValid(poly) THEN
    poly := ST_MakeValid(poly);
  END IF;

  WITH inside AS (
    SELECT l.*
      FROM myhome_listings l
     WHERE l.delisted_at IS NULL
       AND l.geom_best IS NOT NULL            -- NULL = no trustworthy location
       AND ST_Intersects(l.geom_best, poly)   -- index-backed
       AND ST_Contains(poly, l.geom_best)     -- exact
       AND (p_deal_type     IS NULL OR l.deal_type_id     = p_deal_type)
       AND (p_property_type IS NULL OR l.property_type_id = p_property_type)
       AND (p_max_age_days  IS NULL OR l.updated_at >= now() - make_interval(days => p_max_age_days))
  ),
  priced AS (
    SELECT *,
           CASE WHEN area_m2 > 0 AND price_gel > 0 THEN price_gel / area_m2 END AS sqm_gel,
           CASE WHEN area_m2 > 0 AND price_usd > 0 THEN price_usd / area_m2 END AS sqm_usd
      FROM inside
  ),
  per_category AS (
    SELECT
      deal_type_id, deal_type, property_type_id, property_type,
      count(*)                                                           AS n,
      count(*) FILTER (WHERE sqm_gel IS NOT NULL)                        AS n_priced,
      count(*) FILTER (WHERE geom_source = 'parcel')                     AS n_from_registry,
      round(percentile_cont(0.5)  WITHIN GROUP (ORDER BY sqm_gel)::numeric, 1) AS median_sqm_gel,
      round(percentile_cont(0.5)  WITHIN GROUP (ORDER BY sqm_usd)::numeric, 1) AS median_sqm_usd,
      round(percentile_cont(0.25) WITHIN GROUP (ORDER BY sqm_gel)::numeric, 1) AS p25_sqm_gel,
      round(percentile_cont(0.75) WITHIN GROUP (ORDER BY sqm_gel)::numeric, 1) AS p75_sqm_gel,
      round(percentile_cont(0.5)  WITHIN GROUP (ORDER BY price_gel)::numeric)  AS median_price_gel,
      round(percentile_cont(0.5)  WITHIN GROUP (ORDER BY price_usd)::numeric)  AS median_price_usd,
      round(percentile_cont(0.5)  WITHIN GROUP (ORDER BY area_m2)::numeric, 1) AS median_area_m2,
      min(updated_at)                                                    AS oldest_listing,
      max(updated_at)                                                    AS newest_listing
    FROM priced
    GROUP BY deal_type_id, deal_type, property_type_id, property_type
  ),
  -- What we could NOT see: listings in the same neighbourhoods that have no
  -- coordinates yet, or whose pin we rejected. Reporting this stops the panel
  -- from quoting a confident median off a fraction of the real inventory.
  touched AS (SELECT DISTINCT urban_id FROM inside WHERE urban_id IS NOT NULL),
  coverage AS (
    SELECT
      (SELECT count(*) FROM myhome_listings
        WHERE detail_fetched_at IS NULL AND delisted_at IS NULL
          AND urban_id IN (SELECT urban_id FROM touched)) AS not_geocoded_yet,
      -- Only the genuinely lost: a rejected pin whose listing was rescued by a
      -- cadastral match is analysed from registry geometry, not dropped.
      (SELECT count(*) FROM myhome_listings
        WHERE geo_suspect AND delisted_at IS NULL AND parcel_geom IS NULL
          AND urban_id IN (SELECT urban_id FROM touched)) AS pins_rejected
  )
  SELECT jsonb_build_object(
    'area_m2',   round(ST_Area(poly::geography)),
    'total_in_area', (SELECT count(*) FROM inside),
    'stats', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object('reliable', c.n_priced >= p_min_sample)
                       ORDER BY c.n DESC)
        FROM per_category c
    ), '[]'::jsonb),
    'coverage', (SELECT to_jsonb(v) FROM coverage v)
                  || jsonb_build_object('mapped_in_area', (SELECT count(*) FROM inside))
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION myhome_area_stats(jsonb, smallint, smallint, integer, integer) TO authenticated;

-- ============================================================
-- myhome_area_listings(area_geojson, …)
-- The individual listings behind the numbers, as GeoJSON — so the user can see
-- what the median was computed from rather than trusting a bare figure.
-- ============================================================
CREATE OR REPLACE FUNCTION myhome_area_listings(
  area_geojson    jsonb,
  p_deal_type     smallint DEFAULT NULL,
  p_property_type smallint DEFAULT NULL,
  p_limit         integer  DEFAULT 1000
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH poly AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(area_geojson), 4326) AS g),
  hits AS (
    SELECT l.*, CASE WHEN l.area_m2 > 0 AND l.price_gel > 0 THEN round(l.price_gel / l.area_m2, 1) END AS sqm_gel
      FROM myhome_listings l, poly p
     WHERE l.delisted_at IS NULL
       AND l.geom_best IS NOT NULL
       AND ST_Intersects(l.geom_best, p.g)
       AND ST_Contains(p.g, l.geom_best)
       AND (p_deal_type     IS NULL OR l.deal_type_id     = p_deal_type)
       AND (p_property_type IS NULL OR l.property_type_id = p_property_type)
     ORDER BY l.updated_at DESC
     LIMIT LEAST(GREATEST(p_limit, 1), 5000)
  )
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'id', id,
        'geometry', ST_AsGeoJSON(geom_best)::jsonb,
        'properties', jsonb_build_object(
          'id', id, 'title', title, 'url', url,
          'deal_type', deal_type, 'property_type', property_type,
          'price_gel', price_gel, 'price_usd', price_usd,
          'sqm_gel', sqm_gel, 'area_m2', area_m2,
          'rooms', rooms, 'address', address, 'urban', urban,
          'image_url', image_url, 'updated_at', updated_at,
          'geom_source', geom_source, 'cadastral', rs_code_primary
        )
      )
    ), '[]'::jsonb)
  )
  FROM hits;
$$;

GRANT EXECUTE ON FUNCTION myhome_area_listings(jsonb, smallint, smallint, integer) TO authenticated;


-- ============================================================
-- myhome_area_breakdowns(area_geojson, p_deal_type, p_property_type, …)
-- Median ₾/m² inside the isochrone, split by each myhome subcategory that applies
-- to the property type — Status (building_status), Condition, Project type, Rooms —
-- grouped by the source label so it adapts to any values (e.g. land plots' status =
-- Agricultural / Non-agricultural / Investment). Pass p_property_type to scope to
-- one type. Returns { "<pt>": { status:[…], condition:[…], project:[…], rooms:[…] } }
-- where each dimension is [{k,med,n}] sorted by n.
-- ============================================================
DROP FUNCTION IF EXISTS myhome_area_breakdowns(jsonb, smallint, integer);
CREATE OR REPLACE FUNCTION myhome_area_breakdowns(
  area_geojson    jsonb,
  p_deal_type     smallint DEFAULT 1,
  p_property_type smallint DEFAULT NULL,
  p_min_n         integer  DEFAULT 3
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, extensions AS $$
DECLARE poly geometry; result jsonb;
BEGIN
  poly := ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(area_geojson), 4326));
  WITH inside AS (
    SELECT property_type_id AS pt,
           nullif(btrim(building_status),'') AS status,
           nullif(btrim(condition),'')       AS cond,
           nullif(btrim(project_type),'')     AS proj,
           nullif(btrim(seller_type),'')      AS seller,
           CASE WHEN rooms IS NULL OR rooms <= 0 THEN NULL
                WHEN rooms >= 6 THEN '6+' ELSE rooms::text END AS rmb,
           price_gel AS price,                                          -- full price (for rent)
           CASE WHEN area_m2 > 0 AND price_gel > 0 THEN price_gel / area_m2 END AS sqm
      FROM myhome_listings
     WHERE delisted_at IS NULL AND geom_best IS NOT NULL
       AND ST_Contains(poly, geom_best)
       AND (p_deal_type     IS NULL OR deal_type_id     = p_deal_type)
       AND (p_property_type IS NULL OR property_type_id = p_property_type)
       AND property_type_id IS NOT NULL AND price_gel > 0
  ),
  dim AS (                                        -- long form: (pt, dimension, bucket, sqm, price)
    SELECT pt, 'seller'    AS d, seller AS k, sqm, price FROM inside WHERE seller IS NOT NULL
    UNION ALL SELECT pt, 'status',    status, sqm, price FROM inside WHERE status IS NOT NULL
    UNION ALL SELECT pt, 'condition', cond, sqm, price FROM inside WHERE cond IS NOT NULL
    UNION ALL SELECT pt, 'project',   proj, sqm, price FROM inside WHERE proj IS NOT NULL
    UNION ALL SELECT pt, 'rooms',     rmb,  sqm, price FROM inside WHERE rmb  IS NOT NULL
  ),
  agg AS (
    SELECT pt, d, k, count(*) AS n,
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY sqm)::numeric, 1) AS med,   -- ₾/m² (sale)
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY price)::numeric)  AS medp   -- full ₾ (rent)
    FROM dim GROUP BY pt, d, k HAVING count(*) >= p_min_n
  ),
  per_dim AS (
    SELECT pt, d, jsonb_agg(jsonb_build_object('k',k,'med',med,'medp',medp,'n',n) ORDER BY n DESC) AS arr
    FROM agg GROUP BY pt, d
  ),
  per_pt AS (SELECT pt, jsonb_object_agg(d, arr) AS obj FROM per_dim GROUP BY pt)
  SELECT COALESCE(jsonb_object_agg(pt::text, obj), '{}'::jsonb) INTO result FROM per_pt;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION myhome_area_breakdowns(jsonb, smallint, smallint, integer) TO authenticated;

-- ============================================================
-- myhome_area_parcels(area_geojson, …) — land-plot listings inside the isochrone
-- that carry a cadastral code, as a SMALL array of {cadastral, price, pin}. myhome
-- has no geometry, so the app fetches each parcel POLYGON live from maps.gov.ge by
-- cadastral code and draws it, labelled with the listing price.
-- ============================================================
CREATE OR REPLACE FUNCTION myhome_area_parcels(
  area_geojson jsonb,
  p_deal_type  smallint DEFAULT 1,
  p_limit      integer  DEFAULT 80
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions AS $$
  WITH poly AS (SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(area_geojson),4326)) AS g),
  hits AS (
    SELECT l.rs_code_primary AS cadastral, l.price_gel, l.price_usd, l.area_m2, l.url,
           CASE WHEN l.area_m2 > 0 AND l.price_gel > 0 THEN round(l.price_gel/l.area_m2,1) END AS sqm_gel,
           ST_Y(l.geom_best) AS lat, ST_X(l.geom_best) AS lng
      FROM myhome_listings l, poly p
     WHERE l.delisted_at IS NULL
       AND l.property_type_id = 4
       AND l.rs_code_primary IS NOT NULL
       AND l.geom_best IS NOT NULL AND ST_Contains(p.g, l.geom_best)
       AND (p_deal_type IS NULL OR l.deal_type_id = p_deal_type)
     ORDER BY l.updated_at DESC
     LIMIT LEAST(GREATEST(p_limit,1),150)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'cadastral',cadastral,'price_gel',price_gel,'price_usd',price_usd,
           'sqm_gel',sqm_gel,'area_m2',area_m2,'lat',lat,'lng',lng,'url',url)), '[]'::jsonb)
  FROM hits;
$$;
GRANT EXECUTE ON FUNCTION myhome_area_parcels(jsonb, smallint, integer) TO authenticated;

-- ============================================================
-- myhome_area_points(area_geojson, …) — individual listing PINS inside the
-- isochrone (lean: point + ₾/m² + price), so the app can plot them coloured by
-- how each compares to the area median. Opt-in from the panel, capped payload.
-- ============================================================
CREATE OR REPLACE FUNCTION myhome_area_points(
  area_geojson    jsonb,
  p_deal_type     smallint DEFAULT 1,
  p_property_type smallint DEFAULT NULL,
  p_limit         integer  DEFAULT 1500
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions AS $$
  WITH poly AS (SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(area_geojson),4326)) AS g),
  hits AS (
    SELECT l.id, l.geom_best,
           CASE WHEN l.area_m2 > 0 AND l.price_gel > 0 THEN round(l.price_gel/l.area_m2, 1) END AS v,
           l.price_gel, l.price_usd, l.area_m2, l.rooms, l.url
      FROM myhome_listings l, poly p
     WHERE l.delisted_at IS NULL AND l.geom_best IS NOT NULL
       AND ST_Contains(p.g, l.geom_best)
       AND (p_deal_type     IS NULL OR l.deal_type_id     = p_deal_type)
       AND (p_property_type IS NULL OR l.property_type_id = p_property_type)
       AND l.price_gel > 0
     ORDER BY l.updated_at DESC
     LIMIT LEAST(GREATEST(p_limit,1), 3000)
  )
  SELECT jsonb_build_object('type','FeatureCollection','features', COALESCE(jsonb_agg(
    jsonb_build_object('type','Feature','id',id,
      'geometry', ST_AsGeoJSON(geom_best)::jsonb,
      'properties', jsonb_build_object('v',v,'price_gel',price_gel,'price_usd',price_usd,'area_m2',area_m2,'rooms',rooms,'url',url))
  ),'[]'::jsonb)) FROM hits;
$$;
GRANT EXECUTE ON FUNCTION myhome_area_points(jsonb, smallint, smallint, integer) TO authenticated;
