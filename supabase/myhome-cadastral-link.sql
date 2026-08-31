-- ============================================================
-- Urbanyx — Link myhome listings to NAPR parcels by cadastral code
-- Depends on: myhome-schema.sql, then myhome-isochrone-rpc.sql (which declares
--             parcel_geom / geom_best), plus your existing `parcels` table
--             (cadastral text, shape_wkt text) — assumed from app.js's query.
--
-- Land-plot listings carry their cadastral code in the API's rs_code field
-- (~63 % of plots do; apartments essentially never). That code is the same key
-- your parcels table already uses, which buys three things a listing pin can't:
--
--   1. REAL GEOMETRY. A matched listing gets the parcel polygon instead of a
--      dropped pin — so isochrone containment is decided by where the land
--      actually is, and a listing whose pin we rejected as suspect becomes
--      usable again.
--   2. VERIFIED AREA. The registry's area vs the seller's claimed area. A large
--      disagreement is worth surfacing to the user.
--   3. OWNERSHIP CONTINUITY with the rest of the platform — the same parcel the
--      user clicked is the one being priced.
--
-- HOW TO RUN: paste into Supabase SQL Editor → Run. Idempotent.
-- Then run SELECT myhome_link_parcels(); periodically (or after each enrich).
-- ============================================================

-- ── link columns ──────────────────────────────────────────────────────────────
-- parcel_geom, geom_best and geom_source are declared in myhome-isochrone-rpc.sql
-- (they are spatial columns, and the RPCs there depend on them). This file adds
-- only the bookkeeping the linker needs.

ALTER TABLE myhome_listings
  ADD COLUMN IF NOT EXISTS parcel_cadastral  text,
  ADD COLUMN IF NOT EXISTS parcel_area_m2    numeric,
  ADD COLUMN IF NOT EXISTS parcel_linked_at  timestamptz;

-- ── the linker ────────────────────────────────────────────────────────────────
-- Matches on ANY code in rs_codes (a listing can cover several adjoining
-- parcels); when it covers more than one, the geometries are unioned so the
-- polygon reflects what is actually being sold.
--
-- Guarded on the parcels table existing, so this file is safe to run in a
-- project where the parcel import hasn't happened yet.

CREATE OR REPLACE FUNCTION myhome_link_parcels(p_limit integer DEFAULT 5000)
RETURNS TABLE (attempted bigint, linked bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  n_attempted bigint := 0;
  n_linked    bigint := 0;
BEGIN
  IF to_regclass('public.parcels') IS NULL THEN
    RAISE NOTICE 'parcels table not found — nothing to link against';
    RETURN QUERY SELECT 0::bigint, 0::bigint;
    RETURN;
  END IF;

  WITH candidates AS (
    SELECT id, rs_codes
      FROM myhome_listings
     WHERE parcel_linked_at IS NULL
       AND delisted_at IS NULL
       AND cardinality(rs_codes) > 0
     LIMIT GREATEST(p_limit, 1)
  ),
  matched AS (
    SELECT c.id,
           -- ST_Collect + ST_UnaryUnion is cheaper than ST_Union over many rows
           ST_UnaryUnion(ST_Collect(ST_GeomFromText(p.shape_wkt, 4326))) AS geom,
           min(p.cadastral)                                              AS cadastral,
           count(*)                                                      AS n_parcels
      FROM candidates c
      JOIN parcels p ON p.cadastral = ANY (c.rs_codes)
     WHERE p.shape_wkt IS NOT NULL
     GROUP BY c.id
  ),
  upd AS (
    UPDATE myhome_listings l
       SET parcel_cadastral = m.cadastral,
           parcel_geom      = ST_Multi(ST_MakeValid(m.geom)),
           parcel_area_m2   = round(ST_Area(ST_MakeValid(m.geom)::geography)::numeric, 1),
           parcel_linked_at = now()
      FROM matched m
     WHERE l.id = m.id
     RETURNING l.id
  ),
  -- Mark the misses too, so the next run doesn't retry them forever. They are
  -- re-tried whenever the parcel import grows: reset with
  --   UPDATE myhome_listings SET parcel_linked_at = NULL WHERE parcel_geom IS NULL;
  miss AS (
    UPDATE myhome_listings l
       SET parcel_linked_at = now()
     WHERE l.id IN (SELECT id FROM candidates)
       AND l.id NOT IN (SELECT id FROM matched)
     RETURNING l.id
  )
  SELECT (SELECT count(*) FROM candidates), (SELECT count(*) FROM upd)
    INTO n_attempted, n_linked;

  RETURN QUERY SELECT n_attempted, n_linked;
END;
$$;

REVOKE EXECUTE ON FUNCTION myhome_link_parcels(integer) FROM public, anon;

-- ── diagnostics ───────────────────────────────────────────────────────────────
-- Run this first, before wiring the link into the UI: it tells you what share of
-- coded listings your parcel import actually covers. If the match rate is low,
-- the likely cause is code shape — myhome carries both the 4-segment regional
-- form (27.15.42.174) and the 5-segment urban form (01.72.14.095.073), and an
-- import holding only one of them will silently miss the other.

CREATE OR REPLACE VIEW myhome_cadastral_coverage AS
SELECT
  property_type,
  count(*)                                                  AS listings,
  count(*) FILTER (WHERE cardinality(rs_codes) > 0)          AS with_code,
  count(*) FILTER (WHERE parcel_geom IS NOT NULL)            AS matched_parcel,
  count(*) FILTER (WHERE cardinality(rs_codes) > 1)          AS multi_parcel,
  count(*) FILTER (WHERE geo_suspect AND parcel_geom IS NOT NULL) AS bad_pins_rescued,
  round(100.0 * count(*) FILTER (WHERE parcel_geom IS NOT NULL)
        / NULLIF(count(*) FILTER (WHERE cardinality(rs_codes) > 0), 0), 1) AS match_pct
FROM myhome_listings
WHERE delisted_at IS NULL
GROUP BY property_type
ORDER BY listings DESC;

-- Listings whose registry area and advertised area disagree by more than 15 %.
-- Worth surfacing in the analysis panel; also a good smoke test that the join
-- is matching the right parcels rather than coincidental codes.
CREATE OR REPLACE VIEW myhome_area_discrepancies AS
SELECT id, url, title, rs_code_primary,
       area_m2                                    AS claimed_m2,
       parcel_area_m2                             AS registry_m2,
       round(100.0 * (area_m2 - parcel_area_m2) / NULLIF(parcel_area_m2, 0), 1) AS diff_pct
FROM myhome_listings
WHERE parcel_area_m2 > 0 AND area_m2 > 0
  AND abs(area_m2 - parcel_area_m2) / parcel_area_m2 > 0.15
ORDER BY abs(area_m2 - parcel_area_m2) / parcel_area_m2 DESC;
