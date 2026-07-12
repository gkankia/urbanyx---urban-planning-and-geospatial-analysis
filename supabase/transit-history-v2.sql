-- ============================================================
-- Urbanyx — Transit history v2: hourly grain + filterable RPCs
-- Supersedes transit-history-rpc.sql (drops/replaces those RPCs).
-- Run in Supabase SQL Editor. Idempotent.
--
-- Adds the hour dimension so the UI can filter by time band
-- (AM peak / midday / PM peak / evening) and day type
-- (weekday / sat / sun), and draw the delay-by-hour chart.
-- Existing days are re-populated by: node transit-derive.js --backfill
-- (rerun after clearing transit_derive_log, or per-date).
-- ============================================================

-- Per stop × route × direction × day × hour: delay aggregates
CREATE TABLE IF NOT EXISTS transit_stop_hourly (
  date        date     NOT NULL,
  stop_id     text     NOT NULL,
  route_id    text     NOT NULL,
  direction   smallint NOT NULL,
  hour        smallint NOT NULL,            -- 0–23 Tbilisi local
  n_obs       integer  NOT NULL,
  n_matched   integer  NOT NULL DEFAULT 0,
  on_time     integer  NOT NULL DEFAULT 0,
  late        integer  NOT NULL DEFAULT 0,
  early       integer  NOT NULL DEFAULT 0,
  delay_med_s integer,
  PRIMARY KEY (date, stop_id, route_id, direction, hour)
);
CREATE INDEX IF NOT EXISTS idx_tsh_stop ON transit_stop_hourly (stop_id, date);

ALTER TABLE transit_stop_hourly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transit_stop_hourly: authenticated read" ON transit_stop_hourly;
CREATE POLICY "transit_stop_hourly: authenticated read"
  ON transit_stop_hourly FOR SELECT TO authenticated USING (true);

-- ── helper: does a date match the day-type filter ──
CREATE OR REPLACE FUNCTION _transit_daytype_ok(d date, p_daytype text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_daytype
    WHEN 'weekday' THEN extract(isodow FROM d) BETWEEN 1 AND 5
    WHEN 'sat'     THEN extract(isodow FROM d) = 6
    WHEN 'sun'     THEN extract(isodow FROM d) = 7
    ELSE true
  END;
$$;

-- ── stats per stop, filterable by day type and time band ──
-- band 'all' reads the daily table (carries headway/EWT);
-- a specific band aggregates the hourly table (EWT not available).
DROP FUNCTION IF EXISTS transit_history_stats(text[], date, date);
DROP FUNCTION IF EXISTS transit_history_stats(text[], date, date, text, text);
CREATE FUNCTION transit_history_stats(
  p_stop_ids text[], p_from date, p_to date,
  p_daytype text DEFAULT 'all',   -- all | weekday | sat | sun
  p_band    text DEFAULT 'all'    -- all | am_peak | midday | pm_peak | evening
)
RETURNS TABLE (
  stop_id text, n_obs bigint, n_matched bigint, on_time bigint, late bigint, early bigint,
  delay_med_s numeric, delay_p90_s numeric, ewt_s numeric, headway_med_s numeric
)
LANGUAGE sql STABLE AS $$
  SELECT * FROM (
    SELECT
      t.stop_id, sum(t.n_obs), sum(t.n_matched), sum(t.on_time), sum(t.late), sum(t.early),
      percentile_cont(0.5) WITHIN GROUP (ORDER BY t.delay_med_s) FILTER (WHERE t.delay_med_s IS NOT NULL),
      percentile_cont(0.5) WITHIN GROUP (ORDER BY t.delay_p90_s) FILTER (WHERE t.delay_p90_s IS NOT NULL),
      sum(t.ewt_s * t.n_obs) FILTER (WHERE t.ewt_s IS NOT NULL)::numeric
        / NULLIF(sum(t.n_obs) FILTER (WHERE t.ewt_s IS NOT NULL), 0),
      percentile_cont(0.5) WITHIN GROUP (ORDER BY t.headway_med_s) FILTER (WHERE t.headway_med_s IS NOT NULL)
    FROM transit_stop_daily t
    WHERE p_band = 'all'
      AND t.stop_id = ANY (p_stop_ids) AND t.date BETWEEN p_from AND p_to
      AND _transit_daytype_ok(t.date, p_daytype)
    GROUP BY t.stop_id
  ) daily
  UNION ALL
  SELECT * FROM (
    SELECT
      h.stop_id, sum(h.n_obs), sum(h.n_matched), sum(h.on_time), sum(h.late), sum(h.early),
      percentile_cont(0.5) WITHIN GROUP (ORDER BY h.delay_med_s) FILTER (WHERE h.delay_med_s IS NOT NULL),
      NULL::numeric, NULL::numeric, NULL::numeric
    FROM transit_stop_hourly h
    WHERE p_band <> 'all'
      AND h.stop_id = ANY (p_stop_ids) AND h.date BETWEEN p_from AND p_to
      AND _transit_daytype_ok(h.date, p_daytype)
      AND CASE p_band
            WHEN 'am_peak' THEN h.hour BETWEEN 7 AND 9
            WHEN 'midday'  THEN h.hour BETWEEN 10 AND 16
            WHEN 'pm_peak' THEN h.hour BETWEEN 17 AND 19
            WHEN 'evening' THEN (h.hour >= 20 OR h.hour <= 6)
            ELSE true
          END
    GROUP BY h.stop_id
  ) hourly;
$$;

-- ── delay-by-hour profile over a set of stops (for the chart) ──
DROP FUNCTION IF EXISTS transit_history_hourly(text[], date, date, text);
CREATE FUNCTION transit_history_hourly(
  p_stop_ids text[], p_from date, p_to date, p_daytype text DEFAULT 'all'
)
RETURNS TABLE (hour smallint, n_matched bigint, on_time bigint, late bigint, delay_med_s numeric)
LANGUAGE sql STABLE AS $$
  SELECT h.hour, sum(h.n_matched), sum(h.on_time), sum(h.late),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY h.delay_med_s) FILTER (WHERE h.delay_med_s IS NOT NULL)
  FROM transit_stop_hourly h
  WHERE h.stop_id = ANY (p_stop_ids) AND h.date BETWEEN p_from AND p_to
    AND _transit_daytype_ok(h.date, p_daytype)
  GROUP BY h.hour ORDER BY h.hour;
$$;

-- ── coverage (unchanged shape) ──
CREATE OR REPLACE FUNCTION transit_history_coverage()
RETURNS TABLE (first_date date, last_date date, days bigint)
LANGUAGE sql STABLE AS $$
  SELECT min(date), max(date), count(*) FROM transit_derive_log;
$$;
