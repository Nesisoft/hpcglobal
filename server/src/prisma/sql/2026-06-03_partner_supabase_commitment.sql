-- Partner system: move to Supabase Auth + flexible commitment frequency.
-- Run in Supabase SQL editor if the Prisma migration connection fails.

-- 1. Commitment frequency enum
DO $$ BEGIN
  CREATE TYPE "CommitmentFrequency" AS ENUM ('WEEKLY','BIWEEKLY','MONTHLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Rename monthlyAmount -> commitmentAmount and make it nullable
--    (commitment is now set by the partner AFTER login, not at registration)
DO $$ BEGIN
  ALTER TABLE "Partner" RENAME COLUMN "monthlyAmount" TO "commitmentAmount";
EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE "Partner" ALTER COLUMN "commitmentAmount" DROP NOT NULL;

-- 3. New columns
ALTER TABLE "Partner"
  ADD COLUMN IF NOT EXISTS "frequency"       "CommitmentFrequency",
  ADD COLUMN IF NOT EXISTS "commitmentSetAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "supabaseUserId"  TEXT;
