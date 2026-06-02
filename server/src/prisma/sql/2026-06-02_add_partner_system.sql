-- Partner system + home page video support.
-- Run in Supabase SQL editor if Prisma migration connection fails.

-- SiteSettings new columns
ALTER TABLE "SiteSettings"
  ADD COLUMN IF NOT EXISTS "ministryVideoId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "zelleAccount"    TEXT NOT NULL DEFAULT '';

-- PartnerStatus enum
DO $$ BEGIN
  CREATE TYPE "PartnerStatus" AS ENUM ('PENDING','APPROVED','SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Partner table
CREATE TABLE IF NOT EXISTS "Partner" (
  "id"                 TEXT PRIMARY KEY,
  "firstName"          TEXT NOT NULL,
  "lastName"           TEXT NOT NULL,
  "email"              TEXT NOT NULL,
  "phone"              TEXT,
  "country"            TEXT,
  "city"               TEXT,
  "monthlyAmount"      DOUBLE PRECISION NOT NULL,
  "currency"           TEXT NOT NULL DEFAULT 'GHS',
  "motivation"         TEXT,
  "adminNotes"         TEXT,
  "status"             "PartnerStatus" NOT NULL DEFAULT 'PENDING',
  "passwordHash"       TEXT,
  "accountActivatedAt" TIMESTAMP(3),
  "lastLogin"          TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Partner_email_key" ON "Partner" ("email");

-- ZoomSchedule table
CREATE TABLE IF NOT EXISTS "ZoomSchedule" (
  "id"          TEXT PRIMARY KEY,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "zoomLink"    TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- PartnerMessage table
CREATE TABLE IF NOT EXISTS "PartnerMessage" (
  "id"          TEXT PRIMARY KEY,
  "title"       TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
