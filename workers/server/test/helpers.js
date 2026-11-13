/**
 * Shared setup for the workers app's tests (`npm test` in workers/).
 *
 * Each test file gets a database of its own on the Postgres server named by
 * TEST_DATABASE_URL, with a `workers` schema built from schema.prisma — the
 * same shape as production, where the app's tables live in `workers` beside
 * the website's in `public`. Email goes to a fake Resend (fakes.js) or to a
 * closed port, so no test can ever message anyone.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm test
 *
 * Everything here runs before anything under server/src is required: the
 * Prisma client reads DATABASE_URL once, when it is created.
 */
const { spawnSync } = require('child_process');
const path   = require('path');
const bcrypt = require('bcryptjs');

const ROOT   = path.join(__dirname, '..', '..');           // workers/
const SCHEMA = path.join(ROOT, 'server/src/prisma/schema.prisma');
const PRISMA = require.resolve('prisma/build/index.js', { paths: [ROOT] });

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
    // Never the developer's .env: only what the test hands it.
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
    cwd: __dirname,
  });
  if (result.status !== 0) {
    throw new Error(`prisma ${args.slice(0, 2).join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

/** `serverUrl` pointed at another database, optionally scoped to a schema. */
function urlFor(database, schema) {
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  url.search = '';
  if (schema) url.searchParams.set('schema', schema);
  return url.toString();
}

const sql = (url, input) => prismaCli(['db', 'execute', '--url', url, '--stdin'], { input });

/** A fresh, empty database. Returns its name. */
function createDatabase(name) {
  const database = `hpcw_test_${name}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  // One statement per call: CREATE DATABASE can't run inside the implicit
  // transaction a multi-statement script gets.
  sql(serverUrl, `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  sql(serverUrl, `CREATE DATABASE "${database}"`);
  return database;
}

/** The `workers` schema, built from schema.prisma, in `database`. Returns the app's URL. */
function createWorkersSchema(database) {
  sql(urlFor(database), 'CREATE SCHEMA IF NOT EXISTS "workers"');
  const url = urlFor(database, 'workers');
  const script = prismaCli(['migrate', 'diff', '--from-empty', '--to-schema-datamodel', SCHEMA, '--script'], {
    env: { DATABASE_URL: url },
  });
  sql(url, script);
  return url;
}

// What the app reads from the environment. Email has no key, and VERCEL is
// set so a missing key is an error rather than a console print — tests that
// need email point RESEND_BASE_URL at the fake and set a key.
const TEST_ENV = {
  JWT_SECRET: 'test-jwt-secret-not-for-production-0123456789',
  APP_URL:    'https://workers.hpcglobal.org',
  MAIL_FROM:  'HPC Workers <no-reply@hpcglobal.org>',
  VERCEL:     '1',
  RESEND_BASE_URL: 'http://127.0.0.1:1',
};

/**
 * Give this test file its own database and load the app against it.
 * @returns {{ app: import('express').Express, prisma: import('@prisma/client').PrismaClient, url: string }}
 */
function loadApp(name, env = {}) {
  const url = createWorkersSchema(createDatabase(name));
  // Five connections, not the single one a Vercel instance gets: with one,
  // requests sent "at the same moment" would queue and run one after another,
  // and the tests of what happens when two really do coincide would prove
  // nothing.
  Object.assign(process.env, TEST_ENV, env, { DATABASE_URL: `${url}&connection_limit=5` });
  for (const key of ['VERCEL_ENV', 'DB_SCHEMA_SYNC', 'DB_SYNC_URL', ...(env.RESEND_API_KEY ? [] : ['RESEND_API_KEY'])]) {
    delete process.env[key];
  }
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
        'x-forwarded-for': ip || '10.0.0.1',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }

  return {
    base,
    call,
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }),
  };
}

// A password every test account can use: it meets the policy.
const PASSWORD = 'Correct-Horse-9';
let passwordHash;

let seq = 0;
// Names are letters only (lib/fields.js), so test accounts get real-looking ones.
const FIRST = ['Ama', 'Kofi', 'Akosua', 'Yaw', 'Esi', 'Kwame', 'Abena', 'Kojo', 'Efua', 'Kwesi'];
/**
 * A worker straight in the database. Defaults to an approved worker; pass
 * `status`, `role`, `isHod`, `departmentId` and so on to change that.
 */
async function makeWorker(prisma, fields = {}) {
  passwordHash ??= await bcrypt.hash(PASSWORD, 4);
  seq += 1;
  return prisma.worker.create({
    data: {
      firstName: fields.firstName ?? FIRST[seq % FIRST.length],
      lastName:  fields.lastName ?? 'Worker',
      email:     fields.email ?? `worker${seq}-${Date.now()}@example.com`,
      phone:     fields.phone ?? `23324400${String(seq).padStart(4, '0')}`,
      gender:    fields.gender ?? 'FEMALE',
      passwordHash,
      status:    fields.status ?? 'ACTIVE',
      role:      fields.role ?? 'WORKER',
      isHod:     fields.isHod ?? false,
      departmentId: fields.departmentId ?? null,
      mustChangePassword: fields.mustChangePassword ?? false,
    },
    include: { department: true },
  });
}

async function makeDepartment(prisma, name = `Dept ${++seq}`, fields = {}) {
  return prisma.department.create({ data: { name, ...fields } });
}

/** Sign in through the API and return the token. */
async function signIn(call, email, password = PASSWORD) {
  const res = await call('POST', '/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`sign-in failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

module.exports = {
  ROOT, SCHEMA, PRISMA, TEST_ENV, PASSWORD, serverUrl,
  prismaCli, sql, urlFor, createDatabase, createWorkersSchema, loadApp, startServer, makeWorker, makeDepartment, signIn,
};
