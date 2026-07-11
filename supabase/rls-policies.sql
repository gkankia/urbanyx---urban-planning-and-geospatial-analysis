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
--   1. Critical security fixes
--   2. Missing policies
--   3. Deduplication / cleanup
--   4. Crowd-sourced enrichment tables (parcels, owner_ids)
-- ============================================================


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

-- Admin-only write (admin.html sets overrides via anon key + RLS)
CREATE POLICY "search_overrides: admin all"
  ON search_overrides FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.is_admin = true)
  );

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
DROP POLICY IF EXISTS "anon_all"             ON search_logs;
DROP POLICY IF EXISTS "Anyone can insert logs" ON search_logs;


-- ─────────────────────────────────────────────────────────────
-- 1D  subscriptions — admin policies use hardcoded email string
--
-- BUG: admin policies check auth.jwt() ->> 'email' = 'giorgi@zaxis.ge'.
-- If the admin email changes these silently break.
-- Replace with is_admin column check.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin can read all subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Admin can update subscriptions"   ON subscriptions;
DROP POLICY IF EXISTS "Users can read own subscription"  ON subscriptions;

-- User reads their own subscription
CREATE POLICY "subscriptions: own read"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Admin reads all subscriptions (dashboard stats)
CREATE POLICY "subscriptions: admin read all"
  ON subscriptions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- Admin updates subscriptions (manual plan overrides from admin.html)
CREATE POLICY "subscriptions: admin update"
  ON subscriptions FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- No INSERT/DELETE policy for authenticated role:
-- all subscription writes go through server.js (service key) or
-- Paddle webhooks — both use the service role and bypass RLS.


-- ─────────────────────────────────────────────────────────────
-- 1E  profiles — admin read policy uses placeholder email
--
-- BUG: "Admin can read all profiles" checks
--   auth.jwt() ->> 'email' = ANY (ARRAY['your@email.com'])
-- The placeholder means no admin can actually read all profiles.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin can read all profiles" ON profiles;

CREATE POLICY "profiles: admin read all"
  ON profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.is_admin = true)
  );


-- ─────────────────────────────────────────────────────────────
-- 1F  parcels — admin read policy uses placeholder email
--
-- BUG: same 'your@email.com' placeholder.
-- (Full parcels policy also in Section 4.)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin can read all parcels" ON parcels;

CREATE POLICY "parcels: admin read all"
  ON parcels FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.is_admin = true)
  );


-- ============================================================
-- SECTION 2 — MISSING POLICIES
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 2A  feature_usage — no SELECT policy exists
--
-- The app reads feature_usage in the user dashboard
-- (loadDashboardStats → sb.from("feature_usage").select(...)).
-- Without a SELECT policy the query returns 0 rows silently,
-- so the activity section always shows empty.
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "feature_usage: own read"
  ON feature_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Admin read all (admin dashboard feature usage counts via RPC)
CREATE POLICY "feature_usage: admin read all"
  ON feature_usage FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.is_admin = true)
  );


-- ─────────────────────────────────────────────────────────────
-- 2B  deletion_requests — user cannot read own request;
--     admin cannot mark requests as processed (no UPDATE)
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "deletion_requests: own read"
  ON deletion_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Admin can update (e.g. set status = 'processed' after deleting account)
CREATE POLICY "deletion_requests: admin update"
  ON deletion_requests FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.is_admin = true)
  );


-- ─────────────────────────────────────────────────────────────
-- 2C  analysis_results — trial and canceling users locked out
--
-- Existing policy only grants SELECT when status = 'active'.
-- Users on a trial (status='trialing') or in a grace period
-- (status='canceling') also have paid Pro access — they should
-- be able to read their analysis results.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Pro users can read analysis results" ON analysis_results;

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

-- ─────────────────────────────────────────────────────────────
-- 3A  profiles — duplicate SELECT policies
--
-- "Users can read own profile" and "read_own_profile" are identical.
-- Drop the older snake_case one.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "read_own_profile" ON profiles;


-- ─────────────────────────────────────────────────────────────
-- 3B  search_logs — duplicate SELECT policies
--
-- "Users can read own logs" === "users_read_own_logs" (same qual).
-- Keep the snake_case version (consistent with insert counterpart).
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can read own logs" ON search_logs;


-- ─────────────────────────────────────────────────────────────
-- 3C  subscriptions — "Users can read own subscription" leftover
--
-- Already dropped in Section 1D. IF EXISTS makes this a no-op
-- if it was already removed.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can read own subscription" ON subscriptions;


-- ============================================================
-- SECTION 4 — CROWD-SOURCED ENRICHMENT TABLES
-- ============================================================
--
-- How writes work:
--   app.js → sbFetch(PROXY) → Cloudflare Worker → Supabase REST
--   The Worker uses the service role key → bypasses RLS for writes.
--
-- How reads work:
--   app.js → fetch(SUPABASE_URL/rest/v1/..., {apikey: SUPABASE_ANON_KEY})
--   RLS applies → needs a permissive SELECT policy.
--
-- Result: public SELECT is correct; no write policies needed at the
-- RLS level (service role already gates all writes through the proxy).
-- Dropping "anon_all" prevents unauthenticated users from writing
-- directly to Supabase while bypassing the proxy.
-- ─────────────────────────────────────────────────────────────

-- ── parcels ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all"                ON parcels;
-- "parcels: admin read all" was already created in Section 1F

-- Public read (map clicks, search by owner, geometry lookups)
CREATE POLICY "parcels: public read"
  ON parcels FOR SELECT
  USING (true);

-- No INSERT / UPDATE / DELETE policies for the authenticated role.
-- All enrichment writes go through the Cloudflare proxy (service role).


-- ── owner_ids ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all" ON owner_ids;

-- Public read (owner lookups from the parcel float card)
CREATE POLICY "owner_ids: public read"
  ON owner_ids FOR SELECT
  USING (true);

-- No INSERT / DELETE policies for the authenticated role.
-- The proxy does: DELETE WHERE cadastral = X, then bulk INSERT —
-- both operations use the service role and bypass RLS.


-- ============================================================
-- VERIFY (run this after applying the script)
-- ============================================================
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd, policyname;
