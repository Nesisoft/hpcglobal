/**
 * Bring the workers app's tables in line with schema.prisma during a deploy.
 *
 * A copy of the website's server/src/prisma/sync.js with the same rules, kept
 * separate so neither app's deploy can affect the other's tables. It works
 * only inside the Postgres schema `workers` (every connection it makes carries
 * `?schema=workers`, which is all Prisma looks at), through the `workers_app`
 * role, which owns that schema and has no rights on `public`. The schema and
 * role are made once by hand — see ./sql/ — so a missing one stops the deploy
 * with a pointer to that file rather than putting tables anywhere else.
 *
 * This runs at the end of the Vercel production build:
 *
 *   1. Ask Prisma for the SQL that would turn the live database into
 *      schema.prisma (`prisma migrate diff`), and print it in the build log.
 *   2. With DB_SCHEMA_SYNC=apply, act on what it found:
 *      - only additions (new enums and values, tables, columns, indexes,
 *        foreign keys, loosened columns): apply them;
 *      - only removals of things schema.prisma no longer has (left behind by a
 *        revert, say): warn and apply nothing — extra columns and tables do
 *        not trouble the code, and dropping data is a person's call;
 *      - anything else (retyping or tightening a column, rebuilding an enum, a
 *        new required column on an existing table, or removals mixed with
 *        additions — which is what a rename looks like): fail the build, so
 *        the site keeps serving the previous deployment until a person deals
 *        with it, usually with a SQL file in ./sql.
 *   3. Switch row level security on for any table in `workers` that lacks it.
 *      The schema isn't exposed through Supabase's data API, but if someone
 *      ever adds it there, the tables are closed until they say otherwise.
 *   4. Add the starting departments (seed.js) the first time, when there are
 *      none — never again, so the office's own changes are kept.
 *
 * Without DB_SCHEMA_SYNC=apply it only reports, so the first run against a
 * database built partly by hand shows what it would do before it does anything.
 *
 * It needs a connection that can run DDL and that Vercel's build servers can
 * reach over IPv4: Supabase's Session pooler (port 5432) — not the Transaction
 * pooler the app uses (6543), and not db.<ref>.supabase.co, which is IPv6-only.
 * See syncUrl() for where that comes from.
 *
 * To roll back a bad deploy, prefer Vercel's Instant Rollback: it reuses the
 * old build, so nothing here runs. A revert commit also deploys — the columns
 * it leaves behind count as removals, which are reported, not blocking.
 */
const { spawnSync } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

// A developer's machine reads workers/.env; Vercel sets the environment itself.
if (process.argv.includes('--local')) require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const SCHEMA = path.join(__dirname, 'schema.prisma');
const { seedSql } = require('./seed');
const PRISMA = require.resolve('prisma/build/index.js');
const apply  = process.env.DB_SCHEMA_SYNC === 'apply';
const log    = (msg) => console.log(`[db-sync] ${msg}`);

const DB_SCHEMA = 'workers';

/** `raw` with `?schema=workers`, whatever schema it named before. */
function inWorkersSchema(raw) {
  const u = new URL(raw);
  u.searchParams.set('schema', DB_SCHEMA);
  return u.toString();
}

/**
 * The connection to change the schema through, always scoped to `workers`.
 *
 * When DATABASE_URL is Supabase's Transaction pooler (port 6543), the Session
 * pooler is the same host and login on port 5432 — so it is derived from it,
 * and the password lives in one variable instead of two. Otherwise
 * DATABASE_URL is used as it is (a local Postgres). DB_SYNC_URL overrides both.
 */
function syncUrl(env = process.env) {
  try {
    if (env.DB_SYNC_URL) return { url: inWorkersSchema(env.DB_SYNC_URL), from: 'DB_SYNC_URL' };
    if (env.DATABASE_URL) {
      const u = new URL(env.DATABASE_URL);
      if (/\.pooler\.supabase\.com$/i.test(u.hostname) && u.port === '6543') {
        u.port   = '5432';
        u.search = '';   // pgbouncer=true and friends are for transaction mode
        return { url: inWorkersSchema(u.toString()), from: 'DATABASE_URL, Session pooler port' };
      }
      return { url: inWorkersSchema(env.DATABASE_URL), from: 'DATABASE_URL' };
    }
  } catch { /* not a URL we understand */ }
  return { url: undefined, from: 'nothing' };
}

// Where a connection points, for the log — never the credentials.
function describe(raw) {
  try { const u = new URL(raw); return `${u.hostname}:${u.port || 5432}`; } catch { return 'an unreadable URL'; }
}

const { url, from } = syncUrl();

function prisma(args) {
  return spawnSync(process.execPath, [PRISMA, ...args], { encoding: 'utf8', env: process.env });
}

// AlterTable is one clause per line. Each is an addition, a removal of
// something schema.prisma doesn't have, or a change that needs a person.
function alterTableClause(line) {
  const clause = line.trim().replace(/^ALTER TABLE "[^"]+"\s+/, '');
  if (/^ADD COLUMN\s/.test(clause)) {
    // A required column with nothing to fill it with either fails on a table
    // with rows or, on an empty one, starts refusing the old code's inserts.
    // SERIAL or a function default rewrites the whole table under a lock.
    if (/\bNOT NULL\b/.test(clause) && !/\bDEFAULT\b/.test(clause)) return 'unsafe';
    if (/\b(SMALL|BIG)?SERIAL\b/i.test(clause)) return 'unsafe';
    if (/\bDEFAULT\s+(?!CURRENT_TIMESTAMP\b)[\w.]+\s*\(/i.test(clause)) return 'unsafe';
    return 'add';
  }
  if (/^ALTER COLUMN "[^"]+" (DROP NOT NULL|SET DEFAULT\s)/.test(clause)) return 'add';
  if (/^DROP COLUMN\s/.test(clause) || /^ALTER COLUMN "[^"]+" DROP DEFAULT/.test(clause)) return 'remove';
  return 'unsafe';
}

/**
 * Split Prisma's diff script into its "-- CreateTable"-style sections and say
 * what each one does. Comment lines inside a section (Prisma explains itself
 * when adding several enum values) are kept for printing but not judged.
 */
function review(script) {
  const sections = [];
  let current = null;
  for (const line of script.split(/\r?\n/)) {
    const header = line.match(/^-- (\w+)\s*$/);
    if (header) {
      current = { kind: header[1], lines: [] };
      sections.push(current);
    } else if (current && line.trim()) {
      current.lines.push(line);
    }
  }

  return sections.map(({ kind, lines }) => {
    const statements = lines.filter((l) => !/^\s*--/.test(l));
    let effect;
    switch (kind) {
      case 'CreateEnum':
      case 'CreateTable':
      case 'CreateIndex':
      case 'AddForeignKey':
        effect = 'add';
        break;
      case 'AlterEnum':
        // Adding values is additive; removing one is written as a rebuild of
        // the type, which is not.
        effect = statements.every((l) => /^ALTER TYPE "[^"]+" ADD VALUE /.test(l.trim())) ? 'add' : 'unsafe';
        break;
      case 'AlterTable': {
        const effects = new Set(statements.map(alterTableClause));
        effect = effects.has('unsafe') ? 'unsafe'
          : effects.has('remove') && effects.has('add') ? 'mixed'
          : effects.has('remove') ? 'remove' : 'add';
        break;
      }
      case 'DropTable':
      case 'DropIndex':
      case 'DropForeignKey':
      case 'DropEnum':
        effect = 'remove';
        break;
      default:
        // RenameIndex and anything Prisma adds later: a person decides.
        effect = 'unsafe';
    }
    return { kind, sql: lines.join('\n'), statements, effect };
  });
}

/** What to do with a reviewed diff: 'apply', 'report' (removals only) or 'block'. */
function decide(sections) {
  const effects = new Set(sections.map((s) => s.effect));
  if (effects.has('unsafe') || effects.has('mixed')) return 'block';
  if (effects.has('remove')) return effects.has('add') ? 'block' : 'report';
  return 'apply';
}

function diff() {
  const result = prisma([
    'migrate', 'diff',
    '--from-url', url,
    '--to-schema-datamodel', SCHEMA,
    '--script',
  ]);
  if (result.status !== 0) {
    // Prisma's message names the host and the problem, never the password.
    log('could not read the database schema:');
    console.log((result.stderr || result.stdout || '').trim());
    log(`That connection came from ${from}; it must be a Session pooler connection (port 5432, reachable over IPv4).`);
    log(SETUP_HINT);
    process.exit(apply ? 1 : 0);
  }
  // An empty diff is printed as a comment and nothing else.
  const script = result.stdout.trim();
  return /^(-- This is an empty migration\.)?$/.test(script) ? '' : script;
}

function execute(sql) {
  const file = path.join(os.tmpdir(), `db-sync-${process.pid}-${Date.now()}.sql`);
  fs.writeFileSync(file, sql);
  const run = prisma(['db', 'execute', '--url', url, '--file', file]);
  fs.rmSync(file, { force: true });
  return run;
}

// Fails the deploy with the way out when the one-off setup hasn't been done.
const SETUP_HINT = 'If it says no schema has been selected, or permission denied, the `workers` schema or the '
  + 'workers_app role has not been set up yet: run the setup SQL in workers/server/src/prisma/sql/ in the '
  + 'Supabase SQL Editor, then redeploy.';

// Row level security on every table in `workers` that this connection owns
// and that lacks it. The schema isn't exposed through Supabase's data API, but
// if it ever is, the tables are closed until someone writes a policy.
const RLS_SQL = `DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = '${DB_SCHEMA}' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
      AND pg_get_userbyid(c.relowner) = current_user
  LOOP
    EXECUTE format('ALTER TABLE ${DB_SCHEMA}.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;`;

/** Row level security and the first-time seed. Both are safe to run every deploy. */
function finish() {
  const run = execute(['BEGIN;', RLS_SQL, seedSql(DB_SCHEMA), 'COMMIT;'].join('\n'));
  if (run.status !== 0) {
    log('switching on row level security or adding the starting data failed:');
    console.log((run.stderr || run.stdout || '').trim());
    process.exit(1);
  }
}

function main() {
  // Only production builds touch the production database. Preview builds share
  // its credentials but run branches that may never be merged — and if Vercel
  // isn't exposing VERCEL_ENV we can't tell the two apart, so we stay out.
  // `--local` runs it from a developer's machine against DATABASE_URL, and
  // creates the schema there first (on Supabase that is the setup SQL's job).
  const local = process.argv.includes('--local');
  if (process.env.VERCEL_ENV !== 'production' && !local) {
    log(`skipped: not a production build (VERCEL_ENV=${process.env.VERCEL_ENV || 'unset'})`);
    process.exit(0);
  }

  if (!url) {
    if (apply) {
      log('no database connection to check against: set DATABASE_URL for this environment.');
      process.exit(1);
    }
    log('skipped: no DATABASE_URL');
    process.exit(0);
  }
  log(`checking ${describe(url)}, schema "${DB_SCHEMA}" (from ${from})`);

  if (local && apply) {
    const made = execute(`CREATE SCHEMA IF NOT EXISTS "${DB_SCHEMA}";`);
    if (made.status !== 0) {
      log('could not create the schema locally:');
      console.log((made.stderr || made.stdout || '').trim());
      process.exit(1);
    }
  }

  const script = diff();
  if (!script) {
    log('database matches schema.prisma');
    if (apply) finish();
    process.exit(0);
  }

  const sections = review(script);
  const verdict  = decide(sections);

  log(`database differs from schema.prisma — ${sections.length} change(s):`);
  console.log(`\n${script}\n`);

  if (verdict === 'report') {
    log('the database has things schema.prisma no longer does. They do not affect the code, so nothing was changed:');
    for (const s of sections) console.log(`  - ${s.kind}: ${s.statements[0] || ''}`);
    log('Drop them deliberately with a SQL file in workers/server/src/prisma/sql if they are no longer wanted.');
    if (apply) finish();
    process.exit(0);
  }

  if (verdict === 'block') {
    const flagged = sections.filter((s) => s.effect !== 'add');
    log(`${flagged.length} change(s) need a person, so nothing was applied:`);
    for (const s of flagged) console.log(`  - ${s.kind} (${s.effect}): ${s.statements[0] || ''}`);
    log('Make those changes deliberately (a SQL file in workers/server/src/prisma/sql, run in Supabase), then redeploy.');
    process.exit(apply ? 1 : 0);
  }

  if (!apply) {
    log('report only: every change above is additive and would be applied with DB_SCHEMA_SYNC=apply');
    process.exit(0);
  }

  // New enum values go first, in their own transaction: Postgres won't let a
  // value be used — as a column default, say — in the transaction that added
  // it. They are additive, so it does no harm if the next step fails.
  const enumAdds = sections.filter((s) => s.kind === 'AlterEnum').flatMap((s) => s.statements)
    .map((l) => l.replace(/ ADD VALUE '/, " ADD VALUE IF NOT EXISTS '"));
  if (enumAdds.length) {
    const run = execute(enumAdds.join('\n'));
    if (run.status !== 0) {
      log('adding enum values failed:');
      console.log((run.stderr || run.stdout || '').trim());
      process.exit(1);
    }
  }

  // Everything else in one transaction, so a failure part-way (a unique index
  // over duplicate rows, a foreign key with orphans) leaves nothing half done.
  // A short lock timeout keeps a busy table from stalling the live app; the
  // next deploy simply tries again.
  const rest = sections.filter((s) => s.kind !== 'AlterEnum').map((s) => `-- ${s.kind}\n${s.sql}`);
  const run = execute(['BEGIN;', "SET LOCAL lock_timeout = '3s';", ...rest, 'COMMIT;'].join('\n'));
  if (run.status !== 0) {
    log(`applying the changes failed, and the transaction was rolled back${enumAdds.length ? ' (new enum values were kept; they are harmless)' : ''}:`);
    console.log((run.stderr || run.stdout || '').trim());
    log(SETUP_HINT);
    process.exit(1);
  }

  if (diff()) {
    log('changes were applied, but the database still differs from schema.prisma.');
    process.exit(1);
  }
  finish();
  log('applied — database now matches schema.prisma');
}

module.exports = { review, decide, syncUrl, DB_SCHEMA };

if (require.main === module) main();
