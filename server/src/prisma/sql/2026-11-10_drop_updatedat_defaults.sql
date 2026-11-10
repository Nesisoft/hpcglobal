-- Bring five hand-made tables in line with schema.prisma. Their "updatedAt"
-- columns were created with DEFAULT CURRENT_TIMESTAMP, which Prisma's
-- @updatedAt doesn't have or use — the client sets the value itself. Left in
-- place, any future change to these tables would arrive bundled with dropping
-- the default, and the deploy-time sync would hold it for a person.
-- Run in the Supabase SQL editor. Safe to run more than once.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."Appointment"    ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE public."Partner"        ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE public."PartnerMessage" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE public."SermonSeries"   ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE public."ZoomSchedule"   ALTER COLUMN "updatedAt" DROP DEFAULT;

COMMIT;
