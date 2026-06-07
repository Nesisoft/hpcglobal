-- Give page revamp: email required, phone removed, name optional, tithe number added.
-- Run in the Supabase SQL editor.

ALTER TABLE "GivingRecord"
  ALTER COLUMN "name"  DROP NOT NULL,
  ALTER COLUMN "phone" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "titheNumber" TEXT;
