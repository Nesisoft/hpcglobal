-- Make the homepage "Who we are" stats admin-controlled:
--   weeklyServices    — a number the admin sets
--   ministryStartYear — the year ministry began; the public page shows
--                       (current year − this value) as "Years in Ministry"
-- Run in the Supabase SQL editor.

ALTER TABLE "SiteSettings"
  ADD COLUMN IF NOT EXISTS "weeklyServices"    INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "ministryStartYear" INTEGER NOT NULL DEFAULT 0;
