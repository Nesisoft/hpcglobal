-- Adds password-reset token fields to AdminUser table.
-- Run this in the Supabase SQL editor if the Prisma migration connection fails.

ALTER TABLE "AdminUser"
  ADD COLUMN IF NOT EXISTS "passwordResetToken"  TEXT,
  ADD COLUMN IF NOT EXISTS "passwordResetExpiry" TIMESTAMP(3);
