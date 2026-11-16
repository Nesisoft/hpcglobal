# HPC Workers — workers.hpcglobal.org

The church workers' attendance app. Workers clock in and out of services,
heads of department see and report on their department's attendance, and the
church office manages workers, departments and services. It replaces the old
PHP app (`attendance-mgt-system/`, kept out of git).

## How it stays separate from the website

| | Website (`/`) | Workers app (`workers/`) |
|---|---|---|
| Code | `client/`, `server/`, `api/` | `workers/` only, with its own `package.json` |
| Vercel project | hpcglobal.org | its own project, **Root Directory = `workers`** |
| Database | Supabase, schema `public` | the same Supabase database, schema **`workers`** |
| Database login | `postgres` | **`workers_app`**, which owns `workers` and has no rights on `public` |
| Sign-in | `JWT_SECRET` (website) | its own `JWT_SECRET`; tokens are for audience `hpc-workers` only |

The two share no code — a few helpers were copied, not imported — so a change
to one can't break the other. The website's deploy-time sync only looks at
`public`, and this app's (`server/src/prisma/sync.js`) only at `workers`;
`server/test/sync.test.js` checks both directions.

## Running it locally

Needs Node 22 and a local Postgres (never the Supabase database).

```bash
cd workers
npm install
cp .env.example .env        # then point DATABASE_URL at your local Postgres
DB_SCHEMA_SYNC=apply node server/src/prisma/sync.js --local   # creates the tables and departments
npm run dev                 # API on :5100, app on http://localhost:5174
```

Without `RESEND_API_KEY`, reset-code emails are printed in the API's console.

Tests (each file gets its own throwaway database):

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm test
```

## Setting it up on Vercel (once)

1. Run `server/src/prisma/sql/2026-11-13-workers-schema-and-role.sql` in the
   Supabase SQL Editor, a step at a time — it makes the `workers` schema and
   the `workers_app` role.
2. Vercel → Add New → Project → this repository → Root Directory `workers`.
   Ignored Build Step: `git diff --quiet HEAD^ HEAD -- .`
3. Environment variables (Production):
   - `DATABASE_URL` — the Supabase Transaction pooler (port 6543) with user
     `workers_app.<project-ref>` and its password, ending
     `?pgbouncer=true&schema=workers`
   - `JWT_SECRET` — a long random string, different from the website's
   - `RESEND_API_KEY` — a key made in Resend for this app
   - `MAIL_FROM` — e.g. `HPC Workers <no-reply@hpcglobal.org>`
   - `APP_URL` — `https://workers.hpcglobal.org`
   - `DB_SCHEMA_SYNC` — `apply`
   - Optional: `EMAILS_PER_DAY` (default 40) and `EMAILS_PER_ADDRESS_PER_DAY`
     (default 10) — the most password-reset emails the app sends in a day, in
     all and from any one internet address. The Resend account is shared with
     the website, whose free plan allows 100 a day across both.
4. Domains → add `workers.hpcglobal.org`.
5. Register in the app, then run step 6 of the SQL file to make that account
   the first super administrator.

Every production deploy then brings the `workers` tables up to date with
`schema.prisma`: additions are applied, anything that could lose data stops
the deploy (same rules as the website's sync).
