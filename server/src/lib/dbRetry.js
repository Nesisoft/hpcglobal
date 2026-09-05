/**
 * Bounded retry for transient Postgres pool failures.
 *
 * Behind a connection pooler a query can be rejected for reasons that have
 * nothing to do with the query itself — every pooler client is checked out
 * (`EMAXCONNSESSION`), Prisma's own pool timed out waiting for a slot (`P2024`),
 * or the pooler dropped an idle connection (`P1001`/`P1017`). Those clear in
 * milliseconds once other requests drain, so a short backoff turns what used to
 * be a 500 into a slightly slower response.
 *
 * Genuine query errors (bad enum value, unique violation, …) are rethrown on
 * the first attempt — retrying them would only waste the pool.
 */

const RETRYABLE_CODES = new Set([
  'P1001', // can't reach database server
  'P1002', // database server timed out
  'P1017', // server has closed the connection
  'P2024', // timed out fetching a connection from Prisma's pool
  'P2037', // too many database connections opened
]);

// Supavisor and PgBouncer report exhaustion as a FATAL from the connector, which
// arrives as PrismaClientUnknownRequestError with no error code — so the text is
// all we have to go on.
const RETRYABLE_MESSAGES = [
  'emaxconnsession',              // Supavisor: max clients reached in session mode
  'max clients reached',
  'too many clients',             // Postgres: sorry, too many clients already
  'too many connections',
  'too many database connections',
  'timed out fetching a new connection',
  'connection closed',
  'connection reset',
  'server has closed the connection',
];

function isRetryable(err) {
  if (!err) return false;
  if (RETRYABLE_CODES.has(err.code)) return true;

  const message = String(err.message || '').toLowerCase();
  return RETRYABLE_MESSAGES.some((m) => message.includes(m));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying transient pool errors with jittered backoff.
 * @param {() => Promise<T>} fn
 * @param {{ attempts?: number, baseDelayMs?: number, label?: string }} [options]
 * @returns {Promise<T>}
 * @template T
 */
async function withDbRetry(fn, options = {}) {
  const { attempts = 3, baseDelayMs = 150, label = 'query' } = options;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !isRetryable(err)) throw err;

      // 150ms, 450ms, … plus jitter, so concurrent requests don't retry in lockstep.
      const delay = baseDelayMs * 3 ** (attempt - 1) * (1 + Math.random() * 0.5);
      console.warn(
        `[db] ${label}: transient pool error (${err.code || 'unknown'}), ` +
        `retry ${attempt}/${attempts - 1} in ${Math.round(delay)}ms`
      );
      await sleep(delay);
    }
  }
}

module.exports = { withDbRetry, isRetryable };
