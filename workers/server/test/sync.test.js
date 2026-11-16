/**
 * The deploy-time sync (server/src/prisma/sync.js) and the wall between this
 * app and the website.
 *
 * Production has one Supabase database: the website's tables in `public`, this
 * app's in `workers`, reached through a role (`workers_app`) that owns
 * `workers` and has no rights on `public`. These tests build exactly that, run
 * the sync the way Vercel does, and check that:
 *   - the workers sync creates its tables in `workers`, switches on row level
 *     security, seeds the departments once, and never touches `public`;
 *   - without the one-off setup it stops the deploy rather than putting
 *     tables anywhere else;
 *   - the website's own sync (its `prisma migrate diff`, against `public`)
 *     sees nothing of `workers`, so the two deploys can never undo each other.
 *
 * The sync's review rules are the website's, already tested there; a few
 * cases here make sure the copy behaves the same.
 */

// Copied before anything loads dotenv: a sync run must see only what the
// test hands it, never a developer's .env.
const BASE_ENV = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };

const test   = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { ROOT, SCHEMA, PRISMA, prismaCli, sql, urlFor, createDatabase } = require('./helpers');

const SYNC = path.join(ROOT, 'server/src/prisma/sync.js');
const WEBSITE_SCHEMA = path.join(ROOT, '..', 'server/src/prisma/schema.prisma');
const { review, decide, syncUrl } = require(SYNC);
const { DEPARTMENTS } = require(path.join(ROOT, 'server/src/prisma/seed.js'));

const ROLE = 'workers_app_test';

/** Run the sync as a production build would, as `role` (or the superuser). */
function runSync(databaseUrl, extraEnv = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [SYNC], {
      env: { ...BASE_ENV, VERCEL_ENV: 'production', DB_SCHEMA_SYNC: 'apply', DATABASE_URL: databaseUrl, ...extraEnv },
      encoding: 'utf8',
      cwd: __dirname,
    }, (error, stdout, stderr) => resolve({ status: error ? error.code : 0, output: stdout + stderr }));
  });
}

const ROLE_PASSWORD = 'NotARealPassword123';

/** The URL `url` as the restricted role. */
function asRole(url) {
  const u = new URL(url);
  u.username = ROLE;
  u.password = ROLE_PASSWORD;
  return u.toString();
}

// The owner's one-off setup SQL, as they will paste it into Supabase, with
// this suite's role name and password. Steps 2 and 3 make the role and the
// schema; step 4 is the check of the wall, turned into conditions below.
const SETUP_SQL = fs.readFileSync(path.join(ROOT, 'server/src/prisma/sql/2026-11-13-workers-schema-and-role.sql'), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/workers_app/g, ROLE)
  .replace(/<WORKERS_APP_PASSWORD>/g, ROLE_PASSWORD);
const setupStep = (n) => {
  const from = SETUP_SQL.indexOf(`Step ${n} ·`);
  const to = SETUP_SQL.indexOf(`Step ${n + 1} ·`);
  assert.ok(from > 0 && to > from, `step ${n} of the setup SQL`);
  // From the end of the step's heading line to the next step's heading.
  return SETUP_SQL.slice(SETUP_SQL.indexOf('\n', from), SETUP_SQL.lastIndexOf('\n', to));
};

// Production's shape: the website's tables in public (owned by the admin
// user), and the role and schema made by the owner's setup SQL — run twice,
// since it says it is safe to run more than once.
function productionLike(name, { withWorkersSchema = true } = {}) {
  const database = createDatabase(name);
  const url = urlFor(database);
  const website = prismaCli(['migrate', 'diff', '--from-empty', '--to-schema-datamodel', WEBSITE_SCHEMA, '--script'], {
    env: { DATABASE_URL: url, DIRECT_URL: url },
  });
  sql(url, website);
  sql(url, `INSERT INTO public."AdminUser" (id, name, email, "passwordHash", role) VALUES ('site-admin', 'Site Admin', 'admin@example.com', 'x', 'SUPER_ADMIN')`);
  for (let run = 0; run < 2; run += 1) {
    sql(url, setupStep(2));
    if (withWorkersSchema) sql(url, setupStep(3));
  }
  return { database, url };
}

/** Whether `condition` (SQL) holds. `db execute` returns no rows, so the check raises when it is false. */
function check(url, condition) {
  const result = require('child_process').spawnSync(process.execPath, [PRISMA, 'db', 'execute', '--url', url, '--stdin'], {
    input: `DO $$ BEGIN IF NOT (${condition}) THEN RAISE EXCEPTION 'check failed'; END IF; END $$;`,
    encoding: 'utf8',
    env: { ...BASE_ENV },
  });
  return result.status === 0;
}

// ─── The sync, end to end ────────────────────────────────────────────────────

test('the sync builds `workers` as the restricted role, seeds once, and leaves `public` alone', async () => {
  const { url } = productionLike('sync_e2e');
  const asWorkersApp = asRole(url);

  const first = await runSync(asWorkersApp);
  assert.equal(first.status, 0, first.output);
  assert.match(first.output, /schema "workers"/);
  assert.match(first.output, /applied — database now matches schema\.prisma/);

  assert.ok(check(url, `(SELECT count(*) FROM workers."Department") = ${DEPARTMENTS.length}`), 'departments seeded');
  assert.ok(check(url, `NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('Worker', 'Department', 'AuditLog'))`),
    'nothing of ours in public');
  assert.ok(check(url, `(SELECT count(*) FROM public."AdminUser") = 1`), 'the website’s rows are untouched');
  assert.ok(check(url, `NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'workers' AND c.relkind = 'r' AND NOT c.relrowsecurity)`), 'row level security on every table');
  // Step 4 of the setup SQL: what the owner checks in Supabase.
  assert.ok(check(url, `(SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname = 'workers') = '${ROLE}'`), 'the role owns workers');
  assert.ok(check(url, `NOT has_schema_privilege('${ROLE}', 'public', 'CREATE')`), 'the role can’t create in public');
  assert.ok(check(url, `(SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = '${ROLE}' AND table_schema = 'public') = 0`),
    'no grants on the website’s tables');
  assert.ok(check(url, `NOT has_table_privilege('${ROLE}', 'public."AdminUser"', 'SELECT')`), 'the role can’t read the website’s tables');
  assert.ok(setupStep(4).includes('has_table_privilege'), 'step 4 still checks the same things');

  // An office change to the departments survives the next deploy.
  sql(url, `UPDATE workers."Department" SET name = 'Ushering' WHERE name = 'Ushers'`);
  const second = await runSync(asWorkersApp);
  assert.equal(second.status, 0, second.output);
  assert.match(second.output, /database matches schema\.prisma/);
  assert.ok(check(url, `(SELECT count(*) FROM workers."Department") = ${DEPARTMENTS.length}`), 'no second seed');
  assert.ok(check(url, `EXISTS (SELECT 1 FROM workers."Department" WHERE name = 'Ushering')`));
});

test('without the setup SQL, the deploy stops and nothing lands in `public`', async () => {
  const { url } = productionLike('sync_unset', { withWorkersSchema: false });
  const run = await runSync(asRole(url));
  assert.notEqual(run.status, 0, 'the build must fail');
  assert.match(run.output, /setup SQL in workers\/server\/src\/prisma\/sql/);
  assert.ok(check(url, `NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('Worker', 'Department', 'AuditLog'))`));
});

test('a DATABASE_URL naming another schema is still synced into `workers`', async () => {
  const { url } = productionLike('sync_schema_param');
  const wrong = new URL(asRole(url));
  wrong.searchParams.set('schema', 'public');
  const run = await runSync(wrong.toString());
  assert.equal(run.status, 0, run.output);
  assert.ok(check(url, `EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'workers' AND tablename = 'Worker')`));
});

test('preview builds and missing settings leave the database alone', async () => {
  const { url } = productionLike('sync_preview');
  const preview = await runSync(asRole(url), { VERCEL_ENV: 'preview' });
  assert.equal(preview.status, 0);
  assert.match(preview.output, /skipped: not a production build/);

  const local = await runSync(asRole(url), { VERCEL_ENV: '' });
  assert.equal(local.status, 0, 'a build that isn’t Vercel production does nothing either');
  assert.match(local.output, /skipped: not a production build/);
  assert.ok(check(url, `NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'workers')`));

  // A production build with no database to check fails, so it is noticed.
  const missing = await runSync('', { DATABASE_URL: '' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.output, /set DATABASE_URL/);
});

// ─── The website's sync can't see us ─────────────────────────────────────────

test('the website’s sync finds nothing to change when `workers` exists beside it', async () => {
  const { url } = productionLike('sync_website_view');
  const run = await runSync(asRole(url));
  assert.equal(run.status, 0, run.output);

  // Exactly what server/src/prisma/sync.js asks Prisma, against `public`.
  const websiteDiff = prismaCli(['migrate', 'diff', '--from-url', url, '--to-schema-datamodel', WEBSITE_SCHEMA, '--script'], {
    env: { DATABASE_URL: url, DIRECT_URL: url },
  }).trim();
  assert.equal(websiteDiff, '-- This is an empty migration.');
});

// ─── The copied review rules ─────────────────────────────────────────────────

test('review: additions apply, leftovers are reported, a retyped column blocks', () => {
  const add = review('-- CreateTable\nCREATE TABLE "X" ("id" TEXT NOT NULL);\n\n-- AlterTable\nALTER TABLE "Worker" ADD COLUMN "nickname" TEXT;');
  assert.equal(decide(add), 'apply');

  const leftover = review('-- DropTable\nDROP TABLE "Old";');
  assert.equal(decide(leftover), 'report');

  const retype = review('-- AlterTable\nALTER TABLE "Worker" ALTER COLUMN "phone" SET DATA TYPE INTEGER;');
  assert.equal(decide(retype), 'block');

  const required = review('-- AlterTable\nALTER TABLE "Worker" ADD COLUMN "badge" TEXT NOT NULL;');
  assert.equal(decide(required), 'block');
});

test('syncUrl: the Session pooler for Supabase, always scoped to `workers`', () => {
  const pooled = syncUrl({ DATABASE_URL: 'postgresql://workers_app.abc:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true&schema=workers' });
  const u = new URL(pooled.url);
  assert.equal(u.port, '5432');
  assert.equal(u.searchParams.get('schema'), 'workers');
  assert.equal(u.searchParams.get('pgbouncer'), null);

  const override = syncUrl({ DB_SYNC_URL: 'postgresql://x:y@localhost:5432/db?schema=public' });
  assert.equal(new URL(override.url).searchParams.get('schema'), 'workers');
  assert.equal(syncUrl({}).url, undefined);
});

test('the app’s own connection is scoped to `workers` whatever DATABASE_URL says', () => {
  const saved = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
    const { datasourceUrl } = require(path.join(ROOT, 'server/src/lib/prisma'));
    assert.equal(new URL(datasourceUrl()).searchParams.get('schema'), 'workers');
    process.env.DATABASE_URL = 'postgresql://u:p@x.pooler.supabase.com:6543/postgres?schema=public';
    const pooled = new URL(datasourceUrl());
    assert.equal(pooled.searchParams.get('schema'), 'workers');
    assert.equal(pooled.searchParams.get('pgbouncer'), 'true');
  } finally {
    process.env.DATABASE_URL = saved;
  }
});

test('the schema file this suite reads is the one the app uses', () => {
  assert.ok(fs.readFileSync(SCHEMA, 'utf8').includes('model Worker'));
  assert.ok(fs.existsSync(WEBSITE_SCHEMA), 'the website’s schema.prisma is beside this app in the repo');
});
