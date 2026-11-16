-- HPC Workers — one-off setup in the shared Supabase database.
--
-- Run each step on its own in the Supabase SQL Editor (it only shows the last
-- result). Every step is safe to run more than once.
--
-- What it makes:
--   * a login role, workers_app, used only by the workers app (its own
--     password — the website's database password is not needed);
--   * a schema, workers, owned by that role, where all the app's tables go.
-- The role gets nothing on `public`, where the website's tables live, so the
-- workers app cannot read or change website data even by mistake. The app's
-- deploys then create and update its own tables (server/src/prisma/sync.js).
--
-- Replace <WORKERS_APP_PASSWORD> with the password you were given (letters and
-- digits only, so it can sit in a connection string as it is). Never commit
-- the real password.


-- ── Step 1 · Check first (read-only) ─────────────────────────────────────────
-- Expect role_exists = false and schema_exists = false the first time.
SELECT current_user,
       EXISTS (SELECT 1 FROM pg_roles     WHERE rolname = 'workers_app') AS role_exists,
       EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'workers')     AS schema_exists;


-- ── Step 2 · The role ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workers_app') THEN
    CREATE ROLE workers_app LOGIN;
  END IF;
END $$;
-- VALID UNTIL 'infinity': the pooler refuses a role whose password has an end date.
ALTER ROLE workers_app WITH LOGIN PASSWORD '<WORKERS_APP_PASSWORD>' VALID UNTIL 'infinity';


-- ── Step 3 · The schema ──────────────────────────────────────────────────────
-- postgres becomes a member of workers_app so it can create the schema for it
-- (and read the app's tables from this editor later).
GRANT workers_app TO postgres;
CREATE SCHEMA IF NOT EXISTS workers AUTHORIZATION workers_app;
ALTER SCHEMA workers OWNER TO workers_app;


-- ── Step 4 · Check the wall (read-only) ──────────────────────────────────────
-- Expect: workers_schema_owner = workers_app, can_create_in_public = false,
-- public_table_grants = 0, can_read_website_admins = false.
SELECT (SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname = 'workers') AS workers_schema_owner,
       has_schema_privilege('workers_app', 'public', 'CREATE')                      AS can_create_in_public,
       (SELECT count(*) FROM information_schema.role_table_grants
         WHERE grantee = 'workers_app' AND table_schema = 'public')                 AS public_table_grants,
       has_table_privilege('workers_app', 'public."AdminUser"', 'SELECT')           AS can_read_website_admins;


-- ── Step 5 · After the first deploy of the workers app (read-only) ───────────
-- Expect 22 departments, and the tables listed under workers.
SELECT (SELECT count(*) FROM workers."Department") AS departments,
       (SELECT string_agg(tablename, ', ' ORDER BY tablename) FROM pg_tables WHERE schemaname = 'workers') AS tables;


-- ── Step 6 · Make your own account the first super administrator ─────────────
-- Only after YOU have registered at https://workers.hpcglobal.org/register
-- and signed in. Sign-up takes no email confirmation, so if it told you the
-- email already has an account, stop: someone else registered it first, and
-- this step would hand them the keys. Replace the email with yours.
UPDATE workers."Worker"
   SET role = 'SUPER_ADMIN', status = 'ACTIVE', "approvedAt" = now(), "approvedByName" = 'Set up in Supabase'
 WHERE email = lower('you@example.com')
RETURNING "firstName", "lastName", email, role, status;
