-- ============================================================
-- Urbanyx — Transit isochrone router aggregates
-- Feeds server/transit-router.js. All three return ONE compact jsonb object so the
-- backend pulls a few hundred KB, not the ~1.5M raw aggregate rows (egress + speed).
--
-- Keyed by "<route_id>|<direction>" throughout, matching the router's direction keys.
--
-- HOW TO RUN: paste into Supabase SQL Editor → Run. Idempotent.
-- ============================================================

-- Observed in-vehicle speeds (km/h) for a time band, per route×direction×150 m bin,
-- averaged over the most recent p_weeks ISO weeks. → { "<route>|<dir>": { "<bin>": kmh } }
CREATE OR REPLACE FUNCTION transit_route_speeds(p_band text, p_weeks integer DEFAULT 4)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH recent AS (
    SELECT DISTINCT iso_week FROM transit_segment_weekly ORDER BY iso_week DESC LIMIT GREATEST(p_weeks,1)
  ),
  agg AS (
    SELECT route_id, direction, bin_idx,
           round(avg(speed_med_kmh)::numeric, 1) AS spd
      FROM transit_segment_weekly
     WHERE band = p_band
       AND iso_week IN (SELECT iso_week FROM recent)
       AND speed_med_kmh > 0
     GROUP BY route_id, direction, bin_idx
  )
  SELECT COALESCE(jsonb_object_agg(k, obj), '{}'::jsonb) FROM (
    SELECT route_id || '|' || direction AS k,
           jsonb_object_agg(bin_idx::text, spd) AS obj
      FROM agg GROUP BY route_id, direction
  ) t;
$$;
GRANT EXECUTE ON FUNCTION transit_route_speeds(text, integer) TO authenticated, service_role;

-- Reliability degradation = median(observed headway / scheduled headway) over the last
-- p_days, per route×direction. 1.0 = runs as timetabled, 1.6 = comes 60% less often than
-- planned. Multiplies the schedule's band frequency to get a real-world wait.
-- → { "<route>|<dir>": factor }
CREATE OR REPLACE FUNCTION transit_route_degradation(p_days integer DEFAULT 21)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(jsonb_object_agg(k, deg), '{}'::jsonb) FROM (
    SELECT route_id || '|' || direction AS k,
           round(percentile_cont(0.5) WITHIN GROUP (
             ORDER BY headway_med_s::numeric / NULLIF(headway_sched_s, 0)), 2) AS deg
      FROM transit_stop_daily
     WHERE date >= current_date - GREATEST(p_days,1)
       AND headway_med_s > 0 AND headway_sched_s > 0
     GROUP BY route_id, direction
  ) t WHERE deg IS NOT NULL;
$$;
GRANT EXECUTE ON FUNCTION transit_route_degradation(integer) TO authenticated, service_role;

-- Fallback observed headway (seconds) per route×direction over the last p_days — used
-- when a route has no usable schedule block. → { "<route>|<dir>": seconds }
CREATE OR REPLACE FUNCTION transit_route_headways(p_days integer DEFAULT 21)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(jsonb_object_agg(k, hw), '{}'::jsonb) FROM (
    SELECT route_id || '|' || direction AS k,
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY headway_med_s))::int AS hw
      FROM transit_stop_daily
     WHERE date >= current_date - GREATEST(p_days,1) AND headway_med_s > 0
     GROUP BY route_id, direction
  ) t;
$$;
GRANT EXECUTE ON FUNCTION transit_route_headways(integer) TO authenticated, service_role;
