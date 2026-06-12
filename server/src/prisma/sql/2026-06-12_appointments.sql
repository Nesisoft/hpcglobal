-- Appointment booking with the Prophet: admin-managed weekly availability,
-- configurable reasons, and user bookings.
-- Run in the Supabase SQL editor.

-- Configurable booking reasons (JSON array of strings)
ALTER TABLE "SiteSettings"
  ADD COLUMN IF NOT EXISTS "appointmentReasons" TEXT NOT NULL DEFAULT '[]';

-- Appointment status enum
DO $$ BEGIN
  CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Recurring weekly availability windows
CREATE TABLE IF NOT EXISTS "AppointmentAvailability" (
  "id"          TEXT PRIMARY KEY,
  "dayOfWeek"   INTEGER NOT NULL,
  "startTime"   TEXT NOT NULL,
  "endTime"     TEXT NOT NULL,
  "slotMinutes" INTEGER NOT NULL DEFAULT 30,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bookings
CREATE TABLE IF NOT EXISTS "Appointment" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "email"     TEXT NOT NULL,
  "phone"     TEXT NOT NULL,
  "date"      TIMESTAMP(3) NOT NULL,
  "time"      TEXT NOT NULL,
  "reason"    TEXT NOT NULL,
  "notes"     TEXT,
  "status"    "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_date_time_key"
  ON "Appointment" ("date", "time");
