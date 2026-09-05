const { PrismaClient } = require('@prisma/client');

/**
 * Prisma on Vercel (serverless) behind the Supabase pooler.
 *
 * Every lambda instance builds its own PrismaClient, and Prisma's default pool
 * size is `num_cpus * 2 + 1` — 3–5 connections on a Vercel function. Supavisor
 * in *session mode* hands each client its own dedicated Postgres connection and
 * caps the total at `pool_size` (15 on Supabase's default), so a handful of
 * concurrent invocations was enough to get:
 *
 *   FATAL: (EMAXCONNSESSION) max clients reached in session mode
 *
 * Three things keep us inside that ceiling:
 *   1. one client per instance, cached on globalThis in *every* environment so
 *      warm invocations reuse the same pool instead of opening another one;
 *   2. `connection_limit=1`, so an instance never holds more than a single
 *      pooler client — 15 slots then covers 15 concurrent instances, not 3;
 *   3. a generous `pool_timeout`, so queries queue for that one connection
 *      instead of failing the moment it is busy.
 */

const IS_SERVERLESS = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION
);

// Defaults applied to a pooled / serverless connection string. Anything the
// operator already set in DATABASE_URL wins.
const POOLED_DEFAULTS = {
  connection_limit: '1',
  pool_timeout:     '20',
  connect_timeout:  '15',
};

/**
 * Append query params to a connection string without re-serialising the rest of
 * it — reparsing would risk re-encoding the password in the credentials block.
 */
function withParams(raw, params) {
  const q      = raw.indexOf('?');
  const base   = q === -1 ? raw : raw.slice(0, q);
  const search = new URLSearchParams(q === -1 ? '' : raw.slice(q + 1));

  for (const [key, value] of Object.entries(params)) {
    if (!search.has(key)) search.set(key, value);
  }

  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Authority portion of a connection string, i.e. `host:port`. */
function authorityOf(raw) {
  const afterScheme = raw.replace(/^[a-z+]+:\/\//i, '');
  const afterCreds  = afterScheme.slice(afterScheme.lastIndexOf('@') + 1);
  return afterCreds.split(/[/?]/)[0];
}

/** Supavisor / PgBouncer sit in front of Postgres and multiplex connections. */
function isPooled(raw) {
  const authority = authorityOf(raw);
  return /pooler\.supabase\.com|pgbouncer|-pooler\./i.test(authority)
    || /[?&]pgbouncer=/i.test(raw);
}

function datasourceUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  const pooled = isPooled(raw);
  // A direct Postgres connection outside serverless can keep Prisma's defaults.
  if (!pooled && !IS_SERVERLESS) return raw;

  const params = { ...POOLED_DEFAULTS };

  // Transaction mode (Supavisor :6543) multiplexes one server connection across
  // many clients, which breaks named prepared statements. Session mode (:5432)
  // keeps them, so only opt out where we have to.
  if (pooled && authorityOf(raw).endsWith(':6543')) params.pgbouncer = 'true';

  return withParams(raw, params);
}

function createClient() {
  const url = datasourceUrl();
  return new PrismaClient({
    log: ['error', 'warn'],
    ...(url ? { datasourceUrl: url } : {}),
  });
}

const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma ?? createClient();

// Cache in production too: on Vercel this is what stops a warm instance from
// opening a second pool when the module graph is re-evaluated.
globalForPrisma.prisma = prisma;

module.exports = prisma;
