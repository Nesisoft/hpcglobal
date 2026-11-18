const crypto = require('crypto');
const { secret } = require('./tokens');

/**
 * The QR code shown at church, for when a phone's GPS can't place it indoors.
 *
 * A 6-digit code for each session that changes every 30 seconds: an HMAC of
 * the session and the 30-second slot, keyed with a secret derived from
 * JWT_SECRET (so there is no extra setting to forget). The screen shows the
 * code as a QR — a link to workers.hpcglobal.org/q/<code> that any phone's
 * camera opens — and as digits to type. A code is accepted in its own slot
 * and the two before it, a minute or so, long enough to scan and sign in,
 * short enough that a photo sent home is soon useless. The old app's code
 * never changed at all.
 */

const SLOT_MS = 30 * 1000;
const SLOTS_ACCEPTED = 3;

const qrKey = () => crypto.createHmac('sha256', secret()).update('hpc-workers qr codes').digest();
const slotOf = (now) => Math.floor(now.getTime() / SLOT_MS);

function codeFor(sessionId, slot) {
  const mac = crypto.createHmac('sha256', qrKey()).update(`${sessionId}:${slot}`).digest();
  return String(mac.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

/** The code to show now, and when it next changes. */
function currentCode(sessionId, now = new Date()) {
  const slot = slotOf(now);
  return { code: codeFor(sessionId, slot), refreshInMs: (slot + 1) * SLOT_MS - now.getTime() };
}

/** Which of these sessions `code` belongs to right now, or null. */
function sessionForCode(code, sessionIds, now = new Date()) {
  if (!/^\d{6}$/.test(String(code))) return null;
  const slot = slotOf(now);
  for (const id of sessionIds) {
    for (let back = 0; back < SLOTS_ACCEPTED; back += 1) {
      const expected = Buffer.from(codeFor(id, slot - back));
      if (crypto.timingSafeEqual(expected, Buffer.from(String(code)))) return id;
    }
  }
  return null;
}

module.exports = { currentCode, sessionForCode, codeFor, SLOT_MS, SLOTS_ACCEPTED };
