-- Adds the SermonSeries table (Sermon.series remains a free-text label).
-- Run this in the Supabase SQL editor if the Prisma migration connection fails.

CREATE TABLE IF NOT EXISTS "SermonSeries" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "coverImage"  TEXT,
  "order"       INTEGER NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "SermonSeries_name_key" ON "SermonSeries" ("name");
