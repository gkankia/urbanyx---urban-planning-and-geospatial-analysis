-- ============================================================
-- Urbanyx — Transit history aggregate tables
-- Written by server/transit-derive.js (service key, bypasses RLS).
-- Read by the app's History mode (authenticated users only).
-- Raw position samples and per-arrival records live in R2, not here.
--
-- HOW TO RUN: paste into Supabase SQL Editor → Run. Idempotent.
-- ============================================================

-- Per stop × route × direction × day: reliability aggregates
CREATE TABLE IF NOT EXISTS transit_stop_daily (
  date            date        NOT NULL,
  stop_id         text        NOT NULL,
  route_id        text        NOT NULL,
  direction       smallint    NOT NULL,          -- 0 | 1 (TTC directionId)
  n_obs           integer     NOT NULL,           -- observed arrivals
  n_matched       integer     NOT NULL DEFAULT 0, -- matched to a scheduled time
  on_time         integer     NOT NULL DEFAULT 0, -- −60s … +300s window
  late            integer     NOT NULL DEFAULT 0, -- > +300s
  early           integer     NOT NULL DEFAULT 0, -- < −60s
  delay_med_s     integer,                        -- median signed delay (matched only)
  delay_p90_s     integer,
  headway_med_s   integer,                        -- observed median headway
  headway_sched_s integer,                        -- scheduled median headway
  ewt_s           integer,                        -- excess wait time (headway-based)
  PRIMARY KEY (date, stop_id, route_id, direction)
);
CREATE INDEX IF NOT EXISTS idx_tsd_stop  ON transit_stop_daily (stop_id, date);
CREATE INDEX IF NOT EXISTS idx_tsd_route ON transit_stop_daily (route_id, direction, date);

-- Per route × direction × 150 m polyline bin × time band × ISO week: speeds
CREATE TABLE IF NOT EXISTS transit_segment_weekly (
  iso_week      text     NOT NULL,               -- e.g. '2026-W28'
  route_id      text     NOT NULL,
  direction     smallint NOT NULL,
  bin_idx       integer  NOT NULL,               -- floor(distance_along_m / 150)
  band          text     NOT NULL,               -- am_peak | midday | pm_peak | evening
  n             integer  NOT NULL,               -- traversal samples
  speed_med_kmh real,
  speed_p15_kmh real,                            -- pessimistic tail
  PRIMARY KEY (iso_week, route_id, direction, bin_idx, band)
);
CREATE INDEX IF NOT EXISTS idx_tsw_route ON transit_segment_weekly (route_id, direction, iso_week);

-- Processing ledger — one row per derived service day
CREATE TABLE IF NOT EXISTS transit_derive_log (
  date         date PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now(),
  files        integer,
  samples      integer,
  arrivals     integer,
  matched      integer,
  notes        text
);

-- ── RLS: history is for signed-in users; all writes use the service key ──
ALTER TABLE transit_stop_daily     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transit_segment_weekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE transit_derive_log     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transit_stop_daily: authenticated read"     ON transit_stop_daily;
CREATE POLICY "transit_stop_daily: authenticated read"
  ON transit_stop_daily FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "transit_segment_weekly: authenticated read" ON transit_segment_weekly;
CREATE POLICY "transit_segment_weekly: authenticated read"
  ON transit_segment_weekly FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "transit_derive_log: authenticated read"     ON transit_derive_log;
CREATE POLICY "transit_derive_log: authenticated read"
  ON transit_derive_log FOR SELECT TO authenticated USING (true);
