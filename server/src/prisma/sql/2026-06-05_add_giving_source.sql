-- Distinguish partner commitment payments from regular giving.
-- Both flow through the same Paystack callback (/giving/callback); the
-- callback page + admin reports branch on "source".
-- Run in the Supabase SQL editor if the Prisma migration connection fails.

ALTER TABLE "GivingRecord"
  ADD COLUMN IF NOT EXISTS "source"    TEXT NOT NULL DEFAULT 'GIVING', -- 'GIVING' | 'PARTNER'
  ADD COLUMN IF NOT EXISTS "partnerId" TEXT;
