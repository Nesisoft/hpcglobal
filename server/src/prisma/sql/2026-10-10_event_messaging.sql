-- Events: per-event registration requirements, shareable links,
-- and bulk email/SMS campaigns to registrants (PR #32).
-- Run in the Supabase SQL editor. Safe to run more than once.

BEGIN;

-- Each event chooses what registration insists on; shortUrl stores its share link
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "requireEmail" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "requirePhone" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "shortUrl"     TEXT;

-- Email-only events: a registration may now have no phone
ALTER TABLE "EventRsvp" ALTER COLUMN "phone" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "EventRsvp_eventId_createdAt_idx"
  ON "EventRsvp" ("eventId", "createdAt");

-- Campaign enums
DO $$ BEGIN
  CREATE TYPE "EventMessageChannel" AS ENUM ('EMAIL', 'SMS', 'BOTH');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "EventMessageAudience" AS ENUM ('ALL', 'IN_PERSON', 'ONLINE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "EventMessageStatus" AS ENUM ('SENDING', 'SENT', 'PARTIAL', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Email/SMS campaigns sent to an event's registrants
CREATE TABLE IF NOT EXISTS "EventMessage" (
  "id"          TEXT NOT NULL,
  "eventId"     TEXT NOT NULL,
  "channel"     "EventMessageChannel" NOT NULL,
  "audience"    "EventMessageAudience" NOT NULL DEFAULT 'ALL',
  "status"      "EventMessageStatus" NOT NULL DEFAULT 'SENDING',
  "subject"     TEXT,
  "bodyHtml"    TEXT,
  "bodySms"     TEXT,
  "emailTotal"  INTEGER NOT NULL DEFAULT 0,
  "emailSent"   INTEGER NOT NULL DEFAULT 0,
  "smsTotal"    INTEGER NOT NULL DEFAULT 0,
  "smsSent"     INTEGER NOT NULL DEFAULT 0,
  "emailCursor" INTEGER NOT NULL DEFAULT 0,
  "smsCursor"   INTEGER NOT NULL DEFAULT 0,
  "failures"    TEXT,
  "sentByName"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "EventMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventMessage_eventId_fkey" FOREIGN KEY ("eventId")
    REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "EventMessage_eventId_createdAt_idx"
  ON "EventMessage" ("eventId", "createdAt");

-- Keep it out of Supabase's public API (the app's own connection is unaffected)
ALTER TABLE "EventMessage" ENABLE ROW LEVEL SECURITY;

COMMIT;
