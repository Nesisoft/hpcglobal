-- Close Supabase's public data API to every table in the public schema.
-- Run in the Supabase SQL editor. Safe to run more than once.
--
-- The site never reads tables through that API: the server uses Prisma as the
-- table owner, and the browser only uses Supabase for partner sign-in. So the
-- anon and authenticated roles (what the public key acts as) need no access.

BEGIN;
-- Give up rather than queue in front of the live site if a table is busy.
-- On "lock timeout" nothing is applied; just run it again.
SET LOCAL lock_timeout = '5s';

-- 1. Row level security on every table, with no policies: the public roles see
--    no rows and can change none. The owner (the app's connection) is exempt.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;

-- 2. Take the public roles' privileges away as well (this also covers views,
--    which row level security does not), now and for tables created later.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- 3. Admin password-reset tokens were readable while the tables were open.
--    Void any outstanding ones; an admin mid-reset just requests a new link.
UPDATE public."AdminUser"
SET "passwordResetToken" = NULL, "passwordResetExpiry" = NULL
WHERE "passwordResetToken" IS NOT NULL;

COMMIT;
