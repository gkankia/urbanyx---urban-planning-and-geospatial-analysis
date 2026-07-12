-- ============================================================
-- Urbanyx — History mode aggregation RPC
-- Aggregates transit_stop_daily server-side so the client gets
-- one row per stop regardless of the date range (avoids the
-- 1,000-row REST limit). Run in Supabase SQL Editor. Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION transit_history_stats(
  p_stop_ids text[],
  p_from     date,
  p_to       date
)
RETURNS TABLE (
  stop_id        text,
  n_obs          bigint,
  n_matched      bigint,
  on_time        bigint,
  late           bigint,
  early          bigint,
  delay_med_s    numeric,   -- median of daily medians
  delay_p90_s    numeric,
  ewt_s          numeric,   -- observation-weighted mean
  headway_med_s  numeric
)
LANGUAGE sql STABLE AS $$
  SELECT
    t.stop_id,
    sum(t.n_obs),
    sum(t.n_matched),
    sum(t.on_time),
    sum(t.late),
    sum(t.early),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY t.delay_med_s)
      FILTER (WHERE t.delay_med_s IS NOT NULL),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY t.delay_p90_s)
      FILTER (WHERE t.delay_p90_s IS NOT NULL),
    sum(t.ewt_s * t.n_obs) FILTER (WHERE t.ewt_s IS NOT NULL)::numeric
      / NULLIF(sum(t.n_obs) FILTER (WHERE t.ewt_s IS NOT NULL), 0),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY t.headway_med_s)
      FILTER (WHERE t.headway_med_s IS NOT NULL)
  FROM transit_stop_daily t
  WHERE t.stop_id = ANY (p_stop_ids)
    AND t.date BETWEEN p_from AND p_to
  GROUP BY t.stop_id;
$$;

-- Coverage summary for the honesty line ("archive since X · N days")
CREATE OR REPLACE FUNCTION transit_history_coverage()
RETURNS TABLE (first_date date, last_date date, days bigint)
LANGUAGE sql STABLE AS $$
  SELECT min(date), max(date), count(*) FROM transit_derive_log;
$$;
