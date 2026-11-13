/**
 * Shared setup for the server tests (`npm test`, Node's built-in runner).
 *
 * Each test file gets a database of its own on the Postgres server named by
 * TEST_DATABASE_URL, created fresh from schema.prisma, so files can run in
 * parallel without seeing each other's rows. Email and SMS are pointed at a
 * port nothing listens on, so every send fails quickly and for real — which
 * is what the delivery-failure tests want, and means no test can ever message
 * anyone.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm test
 *
 * Everything here must run before anything under server/src is required: the
 * Prisma client reads DATABASE_URL once, when it is created.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const jwt  = require('jsonwebtoken');

const ROOT   = path.join(__dirname, '..', '..');
const SCHEMA = path.join(ROOT, 'server/src/prisma/schema.prisma');
const PRISMA = require.resolve('prisma/build/index.js');

const serverUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

// These tests drop and create databases. Pointed at Supabase by mistake — a
// copied production URL — they must refuse rather than try.
if (/(^|\.)supabase\.(co|com)$/i.test(new URL(serverUrl).hostname)) {
  throw new Error('TEST_DATABASE_URL points at Supabase. The tests need a throwaway Postgres, never the real database.');
}

/** Run the Prisma CLI; throws with its output if it fails. */
function prismaCli(args, { input, env } = {}) {
  const result = spawnSync(process.execPath, [PRISMA, ...args], {
    encoding: 'utf8',
    input,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    throw new Error(`prisma ${args.slice(0, 2).join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function urlFor(database) {
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

/**
 * A fresh, empty database, built from `schema` (schema.prisma by default) or
 * left bare with `schema: null`. Returns its connection URL.
 */
function createDatabase(name, { schema = SCHEMA } = {}) {
  const database = `hpc_test_${name}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  // One statement per call: CREATE DATABASE can't run inside the implicit
  // transaction a multi-statement script gets.
  prismaCli(['db', 'execute', '--url', serverUrl, '--stdin'], { input: `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)` });
  prismaCli(['db', 'execute', '--url', serverUrl, '--stdin'], { input: `CREATE DATABASE "${database}"` });

  const url = urlFor(database);
  if (schema) applySchema(url, schema);
  return url;
}

/** Create everything in `schema` on an empty database. */
function applySchema(url, schema = SCHEMA) {
  const sql = prismaCli(['migrate', 'diff', '--from-empty', '--to-schema-datamodel', schema, '--script'], {
    env: { DATABASE_URL: url, DIRECT_URL: url },
  });
  prismaCli(['db', 'execute', '--url', url, '--stdin'], { input: sql });
}

// What the app reads from the environment, with every provider pointed at a
// closed port. RESEND_API_KEY is removed so email goes through SMTP.
const TEST_ENV = {
  JWT_SECRET:               'test-jwt-secret-not-for-production-0001',
  JWT_REFRESH_SECRET:       'test-refresh-secret-not-for-production-1',
  SMTP_HOST:                '127.0.0.1',
  SMTP_PORT:                '1',
  SMTP_USER:                'test',
  SMTP_PASS:                'test',
  SMTP_FROM:                'noreply@hpcglobal.org',
  OFFICE_EMAIL:             'office@hpcglobal.org',
  OFFICE_PHONE:             '0302000000',
  HUBTEL_SMS_CLIENT_ID:     'test',
  HUBTEL_SMS_CLIENT_SECRET: 'test',
  HUBTEL_SMS_BASE_URL:      'http://127.0.0.1:1',
  APP_URL:                  'https://www.hpcglobal.org',
  // A test key and a closed port: no test can reach the real Paystack. The
  // giving tests point PAYSTACK_BASE_URL at a fake before loading the app.
  PAYSTACK_SECRET_KEY:      'sk_test_not_a_real_key',
  PAYSTACK_BASE_URL:        'http://127.0.0.1:1',
};

/**
 * Give this test file its own database and load the app against it.
 * @returns {{ app: import('express').Express, prisma: import('@prisma/client').PrismaClient, url: string }}
 */
function loadApp(name) {
  const url = createDatabase(name);
  Object.assign(process.env, TEST_ENV, { DATABASE_URL: url, DIRECT_URL: url });
  for (const key of ['RESEND_API_KEY', 'VERCEL', 'VERCEL_ENV', 'DB_SCHEMA_SYNC']) delete process.env[key];

  const app    = require(path.join(ROOT, 'server/src/app'));
  const prisma = require(path.join(ROOT, 'server/src/lib/prisma'));
  return { app, prisma, url };
}

/**
 * Listen on a free port and return a small client for it. `ip` sets
 * X-Forwarded-For, which the app trusts one hop of, so rate limits can be
 * exercised per visitor.
 */
async function startServer(app) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function call(method, url, body, { token, ip } = {}) {
    const response = await fetch(base + url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token && { authorization: `Bearer ${token}` }),
        ...(ip && { 'x-forwarded-for': ip }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }

  return { base, call, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** An access token for an AdminUser row, signed the way /auth/login signs one. */
function tokenFor(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until `check()` is truthy — for work the app hands to waitUntil. */
async function eventually(check, { timeout = 5000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) return value;
    await sleep(interval);
  }
}

module.exports = {
  ROOT, SCHEMA, TEST_ENV, prismaCli, createDatabase, applySchema, urlFor, loadApp, startServer, tokenFor, sleep, eventually,
};
