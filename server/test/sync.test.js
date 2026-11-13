/**
 * The deploy-time schema sync, server/src/prisma/sync.js.
 *
 * Every production build runs it with DB_SCHEMA_SYNC=apply, so its rules are
 * all that stands between a merged pull request and the live database:
 * additions go in, leftovers are reported, and anything that could lose data or
 * lock a busy table stops the deploy. These tests give its review real
 * `prisma migrate diff` output, and run the script the way Vercel does against
 * databases built at an older schema.
 *
 * Nothing here loads the app, so there is no loadApp. Almost all the time goes
 * on starting Prisma, so the tests in each group run side by side.
 */

// Copied before the Prisma client is required, because the client loads the
// repo's .env into process.env. A sync run must only ever see the database the
// test hands it.
const BASE_ENV = { ...process.env };
for (const key of ['DATABASE_URL', 'DIRECT_URL', 'DB_SYNC_URL', 'DB_SCHEMA_SYNC', 'VERCEL', 'VERCEL_ENV']) delete BASE_ENV[key];

const test   = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { ROOT, SCHEMA, urlFor } = require('./helpers');

const SYNC    = path.join(ROOT, 'server/src/prisma/sync.js');
const PRISMA  = require.resolve('prisma/build/index.js');
const HELPERS = require.resolve('./helpers');
const { review, decide, syncUrl } = require(SYNC);

/** Run a Node script to the end: its exit status and everything it printed. */
function runNode(args, { env, input } = {}) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, args, { env: { ...BASE_ENV, ...env }, encoding: 'utf8' }, (error, stdout, stderr) => {
      resolve({ status: error ? error.code : 0, stdout, output: stdout + stderr });
    });
    child.stdin.end(input);
  });
}

/** The harness's prismaCli, without blocking. */
async function prisma(args, options) {
  const { status, stdout, output } = await runNode([PRISMA, ...args], options);
  assert.equal(status, 0, `prisma ${args.slice(0, 2).join(' ')} failed:\n${output}`);
  return stdout;
}

// ─── Schema variants ──────────────────────────────────────────────────────────

const CURRENT = fs.readFileSync(SCHEMA, 'utf8').replace(/\r\n/g, '\n'); // a Windows checkout may have CRLF
const TMP     = fs.mkdtempSync(path.join(os.tmpdir(), 'hpc-sync-test-'));
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// Variants are made by editing schema.prisma's text, so they follow the schema
// as it changes. Every edit insists on finding what it edits: a test that
// quietly diffed two identical schemas would pass for the wrong reason.
function block(text, header) {
  const start = text.indexOf(`${header} {\n`);
  assert.notEqual(start, -1, `schema.prisma has no ${header}`);
  return [start, text.indexOf('\n}\n', start) + 3];
}

/** Add lines at the end of a model or enum. */
function addLines(text, header, ...lines) {
  const [, end] = block(text, header);
  return text.slice(0, end - 2) + lines.map((l) => `  ${l}\n`).join('') + text.slice(end - 2);
}

/** Replace the line declaring `name` in a model or enum, or remove it. */
function setLine(text, header, name, line) {
  const [start, end] = block(text, header);
  const body    = text.slice(start, end);
  const pattern = new RegExp(`^  ${name}\\b.*\\n`, 'm');
  assert.match(body, pattern, `${header} has no ${name}`);
  return text.slice(0, start) + body.replace(pattern, line ? `  ${line}\n` : '') + text.slice(end);
}

function dropBlock(text, header) {
  const [start, end] = block(text, header);
  return text.slice(0, start) + text.slice(end);
}

let written = 0;
function schemaFile(text) {
  const file = path.join(TMP, `schema-${++written}.prisma`);
  fs.writeFileSync(file, text);
  return file;
}

// The database as it was before delivery failures were recorded: what a real
// deploy that adds a model starts from.
const BEFORE_DELIVERY_FAILURES = dropBlock(dropBlock(CURRENT, 'model DeliveryFailure'), 'enum DeliveryChannel');

// The database as it was before online tithes were matched to the register:
// what the production deploy of that change starts from.
const BEFORE_ONLINE_TITHES = [
  ...['titheMonth', 'paidAt', 'titheStatus', 'titheNote', 'titheReviewedBy', 'tithePayment', '@@index'].map((name) => ['model GivingRecord', name]),
  ['model TithePayment', 'givingRecordId'],
  ['model TithePayment', 'givingRecord'],
].reduce((text, [header, name]) => setLine(text, header, name, null), dropBlock(CURRENT, 'enum OnlineTitheStatus'));

// ─── Reviewing Prisma's diff ──────────────────────────────────────────────────

// Prisma resolves the datasource's env() even when it doesn't connect.
const NO_DATABASE = 'postgresql://u:p@localhost:5432/x';

/**
 * What the sync makes of a database built from `database` (null: an empty one)
 * when the code expects `schema` — from Prisma's real diff script.
 */
async function judge(database, schema = CURRENT) {
  const script = await prisma([
    'migrate', 'diff',
    ...(database === null ? ['--from-empty'] : ['--from-schema-datamodel', schemaFile(database)]),
    '--to-schema-datamodel', schemaFile(schema),
    '--script',
  ], { env: { DATABASE_URL: NO_DATABASE, DIRECT_URL: NO_DATABASE } });
  const sections = review(script);
  return { sections, effects: sections.map((s) => `${s.kind}:${s.effect}`), verdict: decide(sections) };
}

test.describe('reviewing Prisma\'s diff', { concurrency: true }, () => {
  test.describe('additions are applied', { concurrency: true }, () => {
    test('a new optional column', async () => {
      const { effects, verdict } = await judge(CURRENT, addLines(CURRENT, 'model Visitor', 'nickname String?'));
      assert.deepEqual(effects, ['AlterTable:add']);
      assert.equal(verdict, 'apply');
    });

    test('a new model, with its enum and index', async () => {
      const { effects, verdict } = await judge(BEFORE_DELIVERY_FAILURES);
      assert.deepEqual(effects, ['CreateEnum:add', 'CreateTable:add', 'CreateIndex:add']);
      assert.equal(verdict, 'apply');
    });

    test('a new enum value', async () => {
      const { effects, verdict } = await judge(CURRENT, addLines(CURRENT, 'enum PrayerStatus', 'ARCHIVED'));
      assert.deepEqual(effects, ['AlterEnum:add']);
      assert.equal(verdict, 'apply');
    });

    test('two new enum values at once, despite the comment Prisma writes into that section', async () => {
      // Prisma explains in comment lines that old Postgres versions can't add
      // two values in one migration. Judged as statements, those comments would
      // make every multi-value enum change block the deploy.
      const { sections, effects, verdict } = await judge(CURRENT, addLines(CURRENT, 'enum PrayerStatus', 'ARCHIVED', 'SPAM'));
      assert.deepEqual(effects, ['AlterEnum:add']);
      assert.match(sections[0].sql, /^-- This migration adds more than one value to an enum\./m);
      assert.deepEqual(sections[0].statements, [
        `ALTER TYPE "PrayerStatus" ADD VALUE 'ARCHIVED';`,
        `ALTER TYPE "PrayerStatus" ADD VALUE 'SPAM';`,
      ]);
      assert.equal(verdict, 'apply');
    });

    test('a new enum value used as a new column\'s default', async () => {
      // A NOT NULL column is safe when it has a constant to fill existing rows with.
      const schema = addLines(
        addLines(CURRENT, 'enum VisitorStatus', 'WELCOMED'),
        'model Visitor', 'stage VisitorStatus @default(WELCOMED)',
      );
      const { effects, verdict } = await judge(CURRENT, schema);
      assert.deepEqual(effects, ['AlterEnum:add', 'AlterTable:add']);
      assert.equal(verdict, 'apply');
    });

    test('online tithes: a new enum, new optional columns, their indexes and the link to the gift', async () => {
      const { sections, effects, verdict } = await judge(BEFORE_ONLINE_TITHES);
      assert.deepEqual([...new Set(effects)], ['CreateEnum:add', 'AlterTable:add', 'CreateIndex:add', 'AddForeignKey:add']);
      // Nothing that rewrites GivingRecord or TithePayment under a lock.
      assert.ok(sections.some((s) => /CREATE UNIQUE INDEX "TithePayment_givingRecordId_key"/.test(s.sql)));
      assert.ok(sections.some((s) => /ON DELETE RESTRICT/.test(s.sql)));
      assert.equal(verdict, 'apply');
    });

    test('the whole schema, on an empty database', async () => {
      const { effects, verdict } = await judge(null);
      assert.deepEqual([...new Set(effects)], ['CreateEnum:add', 'CreateTable:add', 'CreateIndex:add', 'AddForeignKey:add']);
      assert.equal(verdict, 'apply');
    });
  });

  test.describe('leftovers the schema no longer has are only reported', { concurrency: true }, () => {
    // Typically left behind by a revert. They don't trouble the code, and
    // dropping data is a person's call, so the deploy goes ahead without them.
    test('an extra column', async () => {
      const { effects, verdict } = await judge(addLines(CURRENT, 'model Visitor', 'legacyCode String?'));
      assert.deepEqual(effects, ['AlterTable:remove']);
      assert.equal(verdict, 'report');
    });

    test('an extra default', async () => {
      // How the hand-made tables' "updatedAt" columns differed, before
      // sql/2026-11-10_drop_updatedat_defaults.sql removed the defaults.
      const database = setLine(CURRENT, 'model ZoomSchedule', 'updatedAt', 'updatedAt DateTime @default(now()) @updatedAt');
      const { effects, verdict } = await judge(database);
      assert.deepEqual(effects, ['AlterTable:remove']);
      assert.equal(verdict, 'report');
    });

    test('an extra table', async () => {
      const { effects, verdict } = await judge(`${CURRENT}\nmodel Bulletin {\n  id   String @id\n  body String\n}\n`);
      assert.deepEqual(effects, ['DropTable:remove']);
      assert.equal(verdict, 'report');
    });
  });

  test.describe('changes that need a person block the deploy', { concurrency: true }, () => {
    test('retyping a column', async () => {
      // Rewrites the table under a lock, and can fail on existing values.
      const { effects, verdict } = await judge(CURRENT, setLine(CURRENT, 'model GivingRecord', 'amount', 'amount Decimal'));
      assert.deepEqual(effects, ['AlterTable:unsafe']);
      assert.equal(verdict, 'block');
    });

    test('a required column with no default, on an existing table', async () => {
      // Fails outright on a table with rows; on an empty one it starts refusing
      // the inserts of the code still serving the site.
      const { effects, verdict } = await judge(CURRENT, addLines(CURRENT, 'model Visitor', 'gender String'));
      assert.deepEqual(effects, ['AlterTable:unsafe']);
      assert.equal(verdict, 'block');
    });

    test('renaming a field, which Prisma writes as a drop and an add', async () => {
      // Applied, it would throw away the subject of every message already sent.
      const { effects, verdict } = await judge(CURRENT, setLine(CURRENT, 'model EventMessage', 'subject', 'title    String?'));
      assert.deepEqual(effects, ['AlterTable:mixed']);
      assert.equal(verdict, 'block');
    });

    test('renaming a model, which Prisma writes as a dropped table and a new one', async () => {
      // Leftovers are only harmless on their own: next to additions they look
      // exactly like a rename, and applying the additions would strand the data.
      const bulletin = '\nmodel Bulletin {\n  id   String @id\n  body String\n}\n';
      const { effects, verdict } = await judge(CURRENT + bulletin, CURRENT + bulletin.replace('Bulletin', 'Notice'));
      assert.deepEqual(effects, ['DropTable:remove', 'CreateTable:add']);
      assert.equal(verdict, 'block');
    });

    test('removing an enum value', async () => {
      // Prisma rebuilds the type, rewriting every row that uses it — and fails
      // on rows that still hold the removed value.
      const { effects, verdict } = await judge(CURRENT, setLine(CURRENT, 'enum PrayerStatus', 'CLOSED', null));
      assert.deepEqual(effects, ['AlterEnum:unsafe']);
      assert.equal(verdict, 'block');
    });

    test('adding @default(autoincrement())', async () => {
      // SERIAL fills every existing row from a sequence, rewriting the table
      // under a lock. The optional column is the case only the SERIAL rule
      // catches: it has no NOT NULL for the required-column rule to see. On an
      // existing column Prisma creates a sequence, which is no addition either.
      const cases = {
        'new required column': addLines(CURRENT, 'model Visitor', 'ticket Int @default(autoincrement())'),
        'new optional column': addLines(CURRENT, 'model Visitor', 'ticket Int? @default(autoincrement())'),
        'existing column':     setLine(CURRENT, 'model HeroSlide', 'order', 'order Int @default(autoincrement())'),
      };
      await Promise.all(Object.entries(cases).map(async ([name, schema]) => {
        const { effects, verdict } = await judge(CURRENT, schema);
        assert.deepEqual(effects, ['AlterTable:unsafe'], name);
        assert.equal(verdict, 'block', name);
      }));
    });

    test('a new column filled by a function default', async () => {
      // Like SERIAL, a function default is worked out for every existing row.
      const field = 'token String @default(dbgenerated("gen_random_uuid()"))';
      const { effects, verdict } = await judge(CURRENT, addLines(CURRENT, 'model Visitor', field));
      assert.deepEqual(effects, ['AlterTable:unsafe']);
      assert.equal(verdict, 'block');
    });
  });
});

// ─── Which connection it uses ─────────────────────────────────────────────────

test.describe('syncUrl', () => {
  const POOLER     = 'aws-0-eu-west-2.pooler.supabase.com';
  const DIRECT_URL = 'postgresql://postgres:direct-pw@db.abcdefghijklmnop.supabase.co:5432/postgres';

  test('derives the Session pooler from a Transaction pooler DATABASE_URL, ahead of DIRECT_URL', () => {
    // Vercel's build servers can't reach db.<ref>.supabase.co (IPv6 only), and
    // the Transaction pooler can't run DDL; pgbouncer=true is for that mode only.
    assert.deepEqual(syncUrl({
      DATABASE_URL: `postgresql://postgres.abcdefghijklmnop:pw@${POOLER}:6543/postgres?pgbouncer=true&connection_limit=1`,
      DIRECT_URL,
    }), {
      url:  `postgresql://postgres.abcdefghijklmnop:pw@${POOLER}:5432/postgres`,
      from: 'DATABASE_URL, Session pooler port',
    });
  });

  test('keeps a percent-encoded password byte for byte', () => {
    // Re-encoding or decoding it on the way would fail every deploy's sign-in
    // with what, to anyone reading the settings, is the right password.
    const password = 'p%40ss%2Fw%3Ard%25%23!*';
    const { url } = syncUrl({ DATABASE_URL: `postgresql://postgres.ref:${password}@${POOLER}:6543/postgres?pgbouncer=true` });
    assert.equal(url, `postgresql://postgres.ref:${password}@${POOLER}:5432/postgres`);
    assert.equal(decodeURIComponent(new URL(url).password), 'p@ss/w:rd%#!*');
  });

  test('uses DIRECT_URL when DATABASE_URL is a Session pooler or local connection', () => {
    for (const DATABASE_URL of [
      `postgresql://postgres.ref:pw@${POOLER}:5432/postgres`, // the pooler, but already session mode
      'postgresql://postgres:pw@localhost:6543/hpc',          // port 6543, but not Supabase's pooler
      'postgresql://postgres:pw@localhost:5432/hpc',
      'not a url',
    ]) {
      assert.deepEqual(syncUrl({ DATABASE_URL, DIRECT_URL }), { url: DIRECT_URL, from: 'DIRECT_URL' }, DATABASE_URL);
    }
  });

  test('lets DB_SYNC_URL override both', () => {
    const DB_SYNC_URL = 'postgresql://postgres:sync-pw@localhost:5432/hpc';
    assert.deepEqual(syncUrl({
      DB_SYNC_URL,
      DATABASE_URL: `postgresql://postgres.ref:pw@${POOLER}:6543/postgres?pgbouncer=true`,
      DIRECT_URL,
    }), { url: DB_SYNC_URL, from: 'DB_SYNC_URL' });
  });

  test('has no connection when nothing is set', () => {
    assert.equal(syncUrl({}).url, undefined);
  });
});

// ─── Running the script ───────────────────────────────────────────────────────

/**
 * The harness's createDatabase, in a process of its own so the databases these
 * tests need are built side by side rather than one after another.
 */
async function createDatabaseAt(name, schemaText) {
  const script = 'process.stdout.write(require(process.argv[1]).createDatabase(process.argv[2], { schema: process.argv[3] }))';
  const { status, stdout, output } = await runNode(['-e', script, HELPERS, name, schemaFile(schemaText)]);
  assert.equal(status, 0, output);
  return stdout;
}

/** Run `node server/src/prisma/sync.js` as the build does, with only these settings. */
const runSync = (env) => runNode([SYNC], { env });

// A production build. DATABASE_URL is not a pooler URL, so DIRECT_URL is used.
const production = (url, settings = {}) => ({ VERCEL_ENV: 'production', DATABASE_URL: url, DIRECT_URL: url, ...settings });
const APPLY = { DB_SCHEMA_SYNC: 'apply' };

/** The parts of a database the sync can change. */
async function look(url) {
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const tables = await db.$queryRaw`
      SELECT c.relname AS name, c.relrowsecurity AS secured
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      ORDER BY 1`;
    const columns = await db.$queryRaw`
      SELECT table_name || '.' || column_name AS name, column_default AS "default"
      FROM information_schema.columns WHERE table_schema = 'public'
      ORDER BY 1`;
    const indexes = await db.$queryRaw`SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1`;
    return {
      tables:   tables.map((t) => t.name),
      secured:  tables.filter((t) => t.secured).map((t) => t.name),
      columns:  columns.map((c) => c.name),
      defaults: Object.fromEntries(columns.filter((c) => c.default).map((c) => [c.name, c.default])),
      indexes:  indexes.map((i) => i.name),
    };
  } finally {
    await db.$disconnect();
  }
}

test.describe('the script', { concurrency: true }, () => {
  test('apply mode brings an older database up to schema.prisma, with row level security on every table', async () => {
    const url = await createDatabaseAt('sync_apply', BEFORE_DELIVERY_FAILURES);
    const before = await look(url);
    assert.equal(before.tables.includes('DeliveryFailure'), false);
    assert.deepEqual(before.secured, []);

    const first = await runSync(production(url, APPLY));
    assert.equal(first.status, 0, first.output);
    assert.match(first.output, /checking .* \(from DIRECT_URL\)/);
    assert.match(first.output, /applied — database now matches schema\.prisma/);

    const after = await look(url);
    assert.ok(after.tables.includes('DeliveryFailure'));
    // New tables are closed to Supabase's public API like every other, and
    // any that had slipped through are closed too.
    assert.deepEqual(after.secured, after.tables);

    const second = await runSync(production(url, APPLY));
    assert.equal(second.status, 0, second.output);
    assert.match(second.output, /database matches schema\.prisma/);
  });

  test('apply mode adds online tithes to a database that predates them', async () => {
    const url = await createDatabaseAt('sync_online_tithes', BEFORE_ONLINE_TITHES);
    assert.equal((await look(url)).columns.includes('GivingRecord.titheMonth'), false);

    const run = await runSync(production(url, APPLY));
    assert.equal(run.status, 0, run.output);
    assert.match(run.output, /applied — database now matches schema\.prisma/);
    const after = await look(url);
    for (const column of ['GivingRecord.titheMonth', 'GivingRecord.paidAt', 'GivingRecord.titheStatus', 'GivingRecord.titheNote', 'GivingRecord.titheReviewedBy', 'TithePayment.givingRecordId']) {
      assert.ok(after.columns.includes(column), column);
    }
    assert.ok(after.indexes.includes('TithePayment_givingRecordId_key'));
    assert.ok(after.indexes.includes('GivingRecord_titheStatus_idx'));
  });

  test('without DB_SCHEMA_SYNC=apply it only reports what it would do', async () => {
    // The first run against a database built partly by hand has to show its
    // plan before doing anything.
    const url = await createDatabaseAt('sync_report', BEFORE_DELIVERY_FAILURES);
    const before = await look(url);

    const run = await runSync(production(url));
    assert.equal(run.status, 0, run.output);
    assert.match(run.output, /CREATE TABLE "DeliveryFailure"/);
    assert.match(run.output, /report only/);
    assert.deepEqual(await look(url), before);
  });

  test('a column the schema no longer has is reported and kept, and the deploy goes ahead', async () => {
    const url = await createDatabaseAt('sync_leftover', addLines(CURRENT, 'model Visitor', 'legacyCode String?'));
    const before = await look(url);
    assert.ok(before.columns.includes('Visitor.legacyCode'));

    const run = await runSync(production(url, APPLY));
    assert.equal(run.status, 0, run.output);
    assert.match(run.output, /the database has things schema\.prisma no longer does/);
    assert.deepEqual(await look(url), before);
  });

  test('a rename fails the deploy and changes nothing', async () => {
    // The database has EventMessage."title" where the schema has "subject":
    // applying the diff would drop the column and everything in it.
    const url = await createDatabaseAt('sync_rename', setLine(CURRENT, 'model EventMessage', 'subject', 'title    String?'));
    const before = await look(url);
    assert.ok(before.columns.includes('EventMessage.title'));

    const run = await runSync(production(url, APPLY));
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /need a person, so nothing was applied/);
    assert.deepEqual(await look(url), before);
  });

  test('a change that fails part-way is rolled back, so nothing is left half done', async () => {
    // The database lacks Sermon."series" and the unique index on "youtubeId",
    // and holds two rows for one video. The column comes first in Prisma's
    // script and would go in; the index then fails on the duplicates.
    const older = setLine(setLine(CURRENT, 'model Sermon', 'youtubeId', 'youtubeId String'), 'model Sermon', 'series', null);
    const url = await createDatabaseAt('sync_rollback', older);
    await prisma(['db', 'execute', '--url', url, '--stdin'], {
      input: `INSERT INTO "Sermon" ("id", "title", "preacher", "youtubeId", "youtubeUrl", "thumbnailUrl", "datePracticed") VALUES
        ('sermon-1', 'Sunday service', 'Prophet', 'abc123', 'https://youtu.be/abc123', 'https://i.ytimg.com/abc123.jpg', now()),
        ('sermon-2', 'Sunday service (again)', 'Prophet', 'abc123', 'https://youtu.be/abc123', 'https://i.ytimg.com/abc123.jpg', now())`,
    });
    const before = await look(url);

    const run = await runSync(production(url, APPLY));
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /the transaction was rolled back/);
    const after = await look(url);
    assert.equal(after.columns.includes('Sermon.series'), false);
    assert.deepEqual(after, before);
  });

  test('a new enum value can be a column default in the same deploy', async () => {
    // Postgres refuses to use an enum value in the transaction that added it,
    // so the sync commits new values first. This database lacks PrayerStatus
    // NEW, which schema.prisma makes PrayerRequest's default.
    const older = setLine(
      setLine(CURRENT, 'enum PrayerStatus', 'NEW', null),
      'model PrayerRequest', 'status', 'status PrayerStatus @default(PRAYING)',
    );
    const url = await createDatabaseAt('sync_enum_default', older);

    const run = await runSync(production(url, APPLY));
    assert.equal(run.status, 0, run.output);
    assert.match(run.output, /applied — database now matches schema\.prisma/);
    assert.match((await look(url)).defaults['PrayerRequest.status'], /^'NEW'/);
  });

  test('preview builds, and builds that don\'t say which they are, never touch the database', async () => {
    // Preview builds share production's credentials but run branches that may
    // never be merged.
    const url = await createDatabaseAt('sync_preview', BEFORE_DELIVERY_FAILURES);
    const before = await look(url);

    const preview = await runSync({ VERCEL_ENV: 'preview', DATABASE_URL: url, DIRECT_URL: url, ...APPLY });
    assert.equal(preview.status, 0, preview.output);
    assert.match(preview.output, /skipped: not a production build \(VERCEL_ENV=preview\)/);

    const unset = await runSync({ DATABASE_URL: url, DIRECT_URL: url, ...APPLY });
    assert.equal(unset.status, 0, unset.output);
    assert.match(unset.output, /skipped: not a production build \(VERCEL_ENV=unset\)/);

    // On Vercel with its system variables hidden, VERCEL may be set while
    // VERCEL_ENV is not — and then a preview can't be told from production,
    // so the sync has to stay out rather than guess.
    const unexposed = await runSync({ VERCEL: '1', DATABASE_URL: url, DIRECT_URL: url, ...APPLY });
    assert.equal(unexposed.status, 0, unexposed.output);
    assert.match(unexposed.output, /skipped: not a production build \(VERCEL_ENV=unset\)/);

    for (const { output } of [preview, unset, unexposed]) assert.doesNotMatch(output, /checking/);
    assert.deepEqual(await look(url), before);
  });

  test('a production build set to apply, with no connection, fails rather than skipping quietly', async () => {
    const run = await runSync({ VERCEL_ENV: 'production', ...APPLY });
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /no database connection to check against/);
  });

  test('the database password never appears in the build log', async (t) => {
    // Build logs are read by more people than the settings are. A login of its
    // own lets the password be one nothing else in the log could contain, with
    // characters that have to be percent-encoded. Reading every column, as
    // Prisma must to diff, needs pg_read_all_data rather than ownership.
    const role     = 'hpc_test_sync_reader';
    const password = 'Zq7/sync@secret%';
    const leaked   = (output) => output.includes('Zq7');
    await prisma(['db', 'execute', '--url', urlFor('postgres'), '--stdin'], {
      input: `DROP ROLE IF EXISTS ${role}; CREATE ROLE ${role} LOGIN PASSWORD '${password}'; GRANT pg_read_all_data TO ${role};`,
    });
    t.after(() => prisma(['db', 'execute', '--url', urlFor('postgres'), '--stdin'], { input: `DROP ROLE IF EXISTS ${role}` }));

    const url = new URL(await createDatabaseAt('sync_secret', BEFORE_DELIVERY_FAILURES));
    url.username = role;
    url.password = encodeURIComponent(password);
    assert.ok(url.toString().includes('Zq7%2Fsync%40secret%25'));

    // A run that connects and prints the whole diff.
    const report = await runSync(production(url.toString()));
    assert.equal(report.status, 0, report.output);
    assert.match(report.output, /CREATE TABLE "DeliveryFailure"/);
    assert.match(report.output, /report only/);
    assert.equal(leaked(report.output), false, report.output);

    // A run that can't connect, where Prisma's own error is printed.
    url.hostname = '127.0.0.1';
    url.port     = '1';
    const failed = await runSync(production(url.toString(), APPLY));
    assert.equal(failed.status, 1, failed.output);
    assert.match(failed.output, /could not read the database schema/);
    assert.equal(leaked(failed.output), false, failed.output);
  });
});
