const webpush = require('web-push');

/**
 * Notifications to phones (Web Push). Switched on by three settings:
 * VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (a key pair made once with
 * `npx web-push generate-vapid-keys`) and, optionally, VAPID_SUBJECT (a
 * contact: the app's address by default). Without the keys the app simply
 * doesn't offer reminders.
 */

const DEFAULT_SUBJECT = 'https://workers.hpcglobal.org';

/**
 * The contact the push services are given: VAPID_SUBJECT, else APP_URL —
 * but only an https: address or a mailto:, which is all they accept (a
 * local http://localhost would be refused), else the app's own address.
 */
function subjectOf(env = process.env) {
  for (const candidate of [env.VAPID_SUBJECT, env.APP_URL]) {
    const value = (candidate || '').trim().replace(/\/$/, '');
    if (/^https:\/\/[^/\s]+/i.test(value) || /^mailto:\S+@\S+$/i.test(value)) return value;
  }
  return DEFAULT_SUBJECT;
}

let configuredFor = null;
let warnedFor = null;
/**
 * Whether reminders can be sent. Never throws: a key that isn't a valid
 * VAPID key turns reminders off (with one line in the log) rather than
 * taking the app down with it.
 */
function configure() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  const key = `${pub}:${priv}:${subjectOf()}`;
  if (configuredFor === key) return true;
  try {
    webpush.setVapidDetails(subjectOf(), pub, priv);
    configuredFor = key;
    return true;
  } catch (err) {
    if (warnedFor !== key) console.error('[push] reminders are off:', err.message);
    warnedFor = key;
    configuredFor = null;
    return false;
  }
}

const publicKey = () => (configure() ? process.env.VAPID_PUBLIC_KEY : null);

// The push services phones and browsers use. A subscription naming any other
// address is refused: the server would otherwise send requests wherever a
// stranger pointed it.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,                // Chrome, Edge, Samsung Internet (Android)
  /^android\.googleapis\.com$/,
  /^(web\.push|[\w-]+\.push)\.apple\.com$/, // Safari: iPhone, iPad, Mac
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^[\w-]+\.notify\.windows\.com$/,        // Edge on Windows
];

function endpointProblem(endpoint) {
  let url;
  try { url = new URL(endpoint); } catch { return 'That isn’t a push address.'; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return 'That isn’t a push address.';
  if (!PUSH_HOSTS.some((re) => re.test(url.hostname))) return 'That push service isn’t supported.';
  return null;
}

/**
 * Send one notification. Resolves to 'sent', 'gone' (the phone has dropped
 * the subscription: remove it) or 'failed'.
 */
async function sendPush(subscription, payload) {
  if (!configure()) return 'failed';
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60, urgency: 'high', timeout: 5000 },
    );
    return 'sent';
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) return 'gone';
    console.error('[push]', err.statusCode || '', err.message);
    return 'failed';
  }
}

module.exports = { configure, publicKey, endpointProblem, sendPush, subjectOf };
