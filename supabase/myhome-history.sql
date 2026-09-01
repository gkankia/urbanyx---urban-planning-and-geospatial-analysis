-- ============================================================
-- Urbanyx — Myhome price history (time series for the historical overview)
-- Depends on: myhome-schema.sql, then myhome-isochrone-rpc.sql (needs area_m2).
--
-- One aggregated row per (day × neighbourhood × deal × property type), written
-- daily by the collector's archive job. This is what a "median ₾/m² over time"
-- chart reads — small and pre-computed, so no listings ever cross the wire for
-- history. The raw daily snapshot of the listings themselves is archived to R2
-- (Cloudflare) by the same job, exactly like the transit collector.
--
-- HOW TO RUN: paste into Supabase SQL Editor → Run. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS myhome_price_snapshots (
  snapshot_date     date     NOT NULL,
  urban_id          integer,
  district_id       integer,
  deal_type_id      smallint NOT NULL,
  property_type_id  smallint NOT NULL,
  n                 integer  NOT NULL,
  median_sqm_gel    numeric,
  median_sqm_usd    numeric,
  median_price_usd  numeric,
  PRIMARY KEY (snapshot_date, urban_id, deal_type_id, property_type_id)
);
CREATE INDEX IF NOT EXISTS idx_mhps_lookup
  ON myhome_price_snapshots (urban_id, deal_type_id, property_type_id, snapshot_date);

ALTER TABLE myhome_price_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "myhome_price_snapshots: authenticated read" ON myhome_price_snapshots;
CREATE POLICY "myhome_price_snapshots: authenticated read"
  ON myhome_price_snapshots FOR SELECT TO authenticated USING (true);

-- Compute + store today's aggregates. The collector calls this daily; re-running
-- for the same date overwrites it (so a mid-day re-run is safe).
CREATE OR REPLACE FUNCTION myhome_snapshot_prices(p_date date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE nrows integer;
BEGIN
  DELETE FROM myhome_price_snapshots WHERE snapshot_date = p_date;
  INSERT INTO myhome_price_snapshots
    (snapshot_date, urban_id, district_id, deal_type_id, property_type_id,
     n, median_sqm_gel, median_sqm_usd, median_price_usd)
  SELECT p_date, urban_id, district_id, deal_type_id, property_type_id,
         count(*),
         round(percentile_cont(0.5) WITHIN GROUP (
           ORDER BY CASE WHEN area_m2 > 0 AND price_gel > 0 THEN price_gel / area_m2 END)::numeric, 1),
         round(percentile_cont(0.5) WITHIN GROUP (
           ORDER BY CASE WHEN area_m2 > 0 AND price_usd > 0 THEN price_usd / area_m2 END)::numeric, 1),
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY price_usd)::numeric)
    FROM myhome_listings
   WHERE delisted_at IS NULL AND price_gel > 0 AND area_m2 > 0
     AND property_type_id IS NOT NULL AND deal_type_id IS NOT NULL
   GROUP BY urban_id, district_id, deal_type_id, property_type_id
  HAVING count(*) >= 3;               -- below 3, a daily median is noise
  GET DIAGNOSTICS nrows = ROW_COUNT;
  RETURN nrows;
END;
$$;
GRANT EXECUTE ON FUNCTION myhome_snapshot_prices(date) TO service_role;

-- Read the time series for one neighbourhood (or all) — powers a history chart.
CREATE OR REPLACE FUNCTION myhome_price_history(
  p_urban_id       integer  DEFAULT NULL,
  p_deal_type      smallint DEFAULT 1,
  p_property_type  smallint DEFAULT NULL,
  p_since          date     DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'd', snapshot_date, 'pt', property_type_id, 'n', n,
           'sqm_gel', median_sqm_gel, 'sqm_usd', median_sqm_usd, 'price_usd', median_price_usd
         ) ORDER BY snapshot_date), '[]'::jsonb)
  FROM myhome_price_snapshots
  WHERE (p_urban_id      IS NULL OR urban_id         = p_urban_id)
    AND (p_deal_type     IS NULL OR deal_type_id     = p_deal_type)
    AND (p_property_type IS NULL OR property_type_id = p_property_type)
    AND (p_since         IS NULL OR snapshot_date   >= p_since);
$$;
GRANT EXECUTE ON FUNCTION myhome_price_history(integer, smallint, smallint, date) TO authenticated;
