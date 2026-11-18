import { api, getToken } from './api';

/**
 * Clock-out reminders on this phone (Web Push). Needs the app's service
 * worker, so it works in the built app, not in development. On an iPhone it
 * works only once the app is on the home screen (iOS 16.4 and later).
 */

const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** The service worker, or null if it isn't running (development, or blocked). */
async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  const found = await navigator.serviceWorker.getRegistration().catch(() => null);
  if (!found) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 3000))]);
}

function keyBytes(base64) {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/**
 * Where reminders stand on this phone:
 * - `on` / `off`;
 * - `blocked`: notifications refused in the phone's settings;
 * - `install`: an iPhone, where the app must be on the home screen first;
 * - `unsupported`: this browser can't, or the server hasn't set them up.
 */
export async function reminderState() {
  if (!supported()) return { state: isIos && !standalone() ? 'install' : 'unsupported' };
  const { publicKey } = await api.get('/push/key').catch(() => ({ publicKey: null }));
  const reg = publicKey ? await registration() : null;
  if (!reg) return { state: 'unsupported' };
  if (Notification.permission === 'denied') return { state: 'blocked', publicKey };
  const sub = await reg.pushManager.getSubscription();
  if (!sub || Notification.permission !== 'granted') return { state: 'off', publicKey };
  const { on } = await api.post('/push/status', { endpoint: sub.endpoint }).catch(() => ({ on: false }));
  return { state: on ? 'on' : 'off', publicKey };
}

/** Ask the phone's permission (must follow a tap) and switch reminders on. Resolves to the new state. */
export async function turnOn(publicKey) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const reg = await registration();
  if (!reg) return 'unsupported';
  const key = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // One made for a different server key can't be used: start again.
  if (sub && sub.options?.applicationServerKey) {
    const old = new Uint8Array(sub.options.applicationServerKey);
    if (old.length !== key.length || old.some((b, i) => b !== key[i])) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api.post('/push/subscribe', sub.toJSON());
  return 'on';
}

export async function turnOff() {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return 'off';
  await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
  return 'off';
}

/**
 * Signing out: this phone stops getting the reminders meant for whoever
 * was signed in. Uses the token as it was, since signing out clears it.
 */
export function releaseOnSignOut() {
  const token = getToken();
  if (!token || !supported()) return;
  (async () => {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await fetch('/api/push/unsubscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  })().catch(() => {});
}
