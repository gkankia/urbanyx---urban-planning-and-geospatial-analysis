-- ============================================================
-- Urbanyx — RLS Policy Remediation
-- Compared against live pg_policies snapshot (2026-07-11)
--
-- HOW TO RUN:
--   Paste this entire file into Supabase → SQL Editor → Run.
--   Safe to run as a single transaction — each DROP IF EXISTS
--   is harmless if the policy already doesn't exist.
--
-- SECTIONS:
--   0. Helper function (must run first)
--   1. Critical security fixes
--   2. Missing policies
--   3. Deduplication / cleanup
--   4. Crowd-sourced enrichment tables (parcels, owner_ids)
-- ============================================================


-- ============================================================
-- SECTION 0 — HELPER FUNCTION
-- ============================================================
--
-- is_admin() reads the profiles table with SECURITY DEFINER,
-- meaning it bypasses RLS. This breaks the infinite recursion
-- that occurs when a policy ON profiles tries to SELECT FROM
-- profiles to check is_admin — and every other table's admin
-- policy that queries profiles avoids the same chain.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- ============================================================
-- SECTION 1 — CRITICAL SECURITY FIXES
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1A  profiles — privilege escalation via UPDATE
--
-- BUG: existing "Users can update own profile" has no WITH CHECK.
-- Any authenticated user can SET is_admin = true on their own row.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING     (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ─────────────────────────────────────────────────────────────
-- 1B  search_overrides — any user can read/write all rows
--
-- BUG: "authenticated_write" has roles={authenticated}, cmd=ALL,
-- qual=true, with_check=true. Any logged-in user can modify or
-- delete every other user's monthly limit override.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_write" ON search_overrides;
DROP POLICY IF EXISTS "search_overrides: admin all" ON search_overrides;

CREATE POLICY "search_overrides: admin all"
  ON search_overrides FOR ALL
  USING     (is_admin())
  WITH CHECK (is_admin());

-- "users_read_own" (SELECT, auth.uid() = user_id) already exists — keep it.


-- ─────────────────────────────────────────────────────────────
-- 1C  search_logs — anonymous users can read all logs + mutate
--
-- BUG: "anon_all" (cmd=ALL, qual=true) lets unauthenticated users
-- read every search log (privacy breach) and delete any row.
-- "Anyone can insert logs" allows unauthenticated flood inserts.
--
-- The correct policies (users_insert_own_logs, users_read_own_logs)
-- already exist — just drop the two bad ones.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all"              ON search_logs;
DROP POLICY IF EXISTS "Anyone can insert logs" ON search_logs;


-- ─────────────────────────────────────────────────────────────
-- 1D  subscriptions — admin policies use hardcoded email string
--
-- BUG: admin policies check auth.jwt() ->> 'email' = 'giorgi@zaxis.ge'.
-- If the admin email changes these silently break.
-- Replace with is_admin() helper.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin can read all subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Admin can update subscriptions"   ON subscriptions;
DROP POLICY IF EXISTS "Users can read own subscription"  ON subscriptions;
DROP POLICY IF EXISTS "subscriptions: own read"       ON subscriptions;
DROP POLICY IF EXISTS "subscriptions: admin read all" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions: admin update"   ON subscriptions;

CREATE POLICY "subscriptions: own read"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "subscriptions: admin read all"
  ON subscriptions FOR SELECT
  USING (is_admin());

CREATE POLICY "subscriptions: admin update"
  ON subscriptions FOR UPDATE
  USING     (is_admin())
  WITH CHECK (is_admin());

-- No INSERT/DELETE for authenticated role: all subscription writes
-- go through server.js (service key) or Paddle webhooks.


-- ─────────────────────────────────────────────────────────────
-- 1E  profiles — admin read policy causes infinite recursion
--
-- BUG: "Admin can read all profiles" used a subquery on profiles
-- inside a policy ON profiles → RLS evaluates itself forever.
-- Fixed by using is_admin() (SECURITY DEFINER, bypasses RLS).
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin can read all profiles" ON profiles;
DROP POLICY IF EXISTS "profiles: admin read all"    ON profiles;

CREATE POLICY "profiles: admin read all"
  ON profiles FOR SELECT
  USING (is_admin());


-- ─────────────────────────────────────────────────────────────
-- 1F  parcels — admin read policy uses placeholder email
--
-- BUG: checks auth.jwt() ->> 'email' = 'your@email.com'.
-- (Full parcels policy also in Section 4.)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin can read all parcels" ON parcels;
DROP POLICY IF EXISTS "parcels: admin read all"    ON parcels;

CREATE POLICY "parcels: admin read all"
  ON parcels FOR SELECT
  USING (is_admin());


-- ============================================================
-- SECTION 2 — MISSING POLICIES
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 2A  feature_usage — no SELECT policy exists
--
-- The app reads feature_usage in the user dashboard.
-- Without a SELECT policy the query returns 0 rows silently,
-- so the activity section always shows empty.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "feature_usage: own read"       ON feature_usage;
DROP POLICY IF EXISTS "feature_usage: admin read all" ON feature_usage;

CREATE POLICY "feature_usage: own read"
  ON feature_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "feature_usage: admin read all"
  ON feature_usage FOR SELECT
  USING (is_admin());


-- ─────────────────────────────────────────────────────────────
-- 2B  deletion_requests — user cannot read own request;
--     admin cannot mark requests as processed (no UPDATE)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "deletion_requests: own read"     ON deletion_requests;
DROP POLICY IF EXISTS "deletion_requests: admin update" ON deletion_requests;

CREATE POLICY "deletion_requests: own read"
  ON deletion_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "deletion_requests: admin update"
  ON deletion_requests FOR UPDATE
  USING (is_admin());


-- ─────────────────────────────────────────────────────────────
-- 2C  analysis_results — trial and canceling users locked out
--
-- Existing policy only grants SELECT when status = 'active'.
-- Users on a trial or in a grace period also have Pro access.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Pro users can read analysis results" ON analysis_results;
DROP POLICY IF EXISTS "analysis_results: pro read"          ON analysis_results;

CREATE POLICY "analysis_results: pro read"
  ON analysis_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.plan    = 'pro'
        AND s.status  IN ('active', 'trialing', 'canceling')
    )
  );


-- ============================================================
-- SECTION 3 — DEDUPLICATION / CLEANUP
-- ============================================================

-- profiles: "Users can read own profile" and "read_own_profile" identical
DROP POLICY IF EXISTS "read_own_profile" ON profiles;

-- search_logs: "Users can read own logs" === "users_read_own_logs"
DROP POLICY IF EXISTS "Users can read own logs" ON search_logs;

-- subscriptions: already dropped in 1D (IF EXISTS = no-op if gone)
DROP POLICY IF EXISTS "Users can read own subscription" ON subscriptions;


-- ============================================================
-- SECTION 4 — CROWD-SOURCED ENRICHMENT TABLES
-- ============================================================
--
-- Writes go through the Cloudflare Worker proxy (service role key)
-- → bypass RLS entirely. No write policies needed.
--
-- Reads come directly from the client with the anon key
-- → need a permissive SELECT policy.
--
-- Dropping "anon_all" blocks unauthenticated users from writing
-- directly to Supabase, bypassing the proxy.
-- ─────────────────────────────────────────────────────────────

-- ── parcels ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all"             ON parcels;
DROP POLICY IF EXISTS "parcels: public read" ON parcels;
-- "parcels: admin read all" already created in 1F

CREATE POLICY "parcels: public read"
  ON parcels FOR SELECT
  USING (true);


-- ── owner_ids ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all"               ON owner_ids;
DROP POLICY IF EXISTS "owner_ids: public read" ON owner_ids;

CREATE POLICY "owner_ids: public read"
  ON owner_ids FOR SELECT
  USING (true);


-- ============================================================
-- VERIFY (uncomment and run separately after applying)
-- ============================================================
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd, policyname;
