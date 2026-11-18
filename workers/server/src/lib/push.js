const webpush = require('web-push');

/**
 * Notifications to phones (Web Push). Switched on by three settings:
 * VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (a key pair made once with
 * `npx web-push generate-vapid-keys`) and, optionally, VAPID_SUBJECT (a
 * contact: the app's address by default). Without the keys the app simply
 * doesn't offer reminders.
 */

let configuredFor = null;
function configure() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  const key = `${pub}:${priv}`;
  if (configuredFor !== key) {
    const subject = process.env.VAPID_SUBJECT || (process.env.APP_URL || 'https://workers.hpcglobal.org').replace(/\/$/, '');
    webpush.setVapidDetails(subject, pub, priv);
    configuredFor = key;
  }
  return true;
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

module.exports = { configure, publicKey, endpointProblem, sendPush };
