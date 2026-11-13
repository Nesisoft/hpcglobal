const { isRetryable } = require('./dbRetry');

/**
 * Answer a request whose database work failed. A busy pooler is worth trying
 * again in a moment (503); anything else is our fault (500). Either way the
 * person sees a plain sentence, never the database's own message — the old
 * PHP app sent those straight to the browser.
 */
function dbFail(res, err, label) {
  console.error(`[${label}]`, err?.code || '', err?.message || err);
  if (isRetryable(err)) {
    return res.status(503).json({ message: 'The server is busy right now. Please try again in a moment.' });
  }
  return res.status(500).json({ message: 'Something went wrong on our side. Please try again.' });
}

/** Wrap an async route so a thrown error becomes dbFail rather than a hang. */
const handle = (label, fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (!res.headersSent) dbFail(res, err, label);
  }
};

module.exports = { dbFail, handle };
