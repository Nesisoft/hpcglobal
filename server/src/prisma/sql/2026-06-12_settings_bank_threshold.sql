-- Add SWIFT/Bank Code to bank details and a partner minimum giving threshold.
-- Run in the Supabase SQL editor.

ALTER TABLE "SiteSettings"
  ADD COLUMN IF NOT EXISTS "bankSwift"        TEXT   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "bankCode"         TEXT   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "partnerMinAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
