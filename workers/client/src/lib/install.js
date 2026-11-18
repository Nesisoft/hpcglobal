import { useEffect, useState } from 'react';

/**
 * Putting the app on a phone's home screen.
 *
 * Android (Chrome, Edge, Samsung Internet) offers it through a
 * `beforeinstallprompt` event, which can come before React has drawn
 * anything — so it is caught here, as the app starts, and kept until a
 * button asks for it. An iPhone or iPad has no such event: there it is the
 * Share button, then "Add to Home Screen", so the app shows those steps.
 */

let deferred = null;
let installed = false;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();   // our own button asks instead of the browser's banner
    deferred = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
/** iPhone and iPad (which, on iPadOS, says it is a Mac with a touch screen). */
const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
/** A phone or tablet — where asking to install is worth it. */
export const isPhone = isIos || isAndroid;

// "Not now": no asking again on this phone for a week.
const SNOOZE = 'hpc_workers_install_snoozed';
const SNOOZE_DAYS = 7;
export function snoozed() {
  try {
    const at = Date.parse(localStorage.getItem(SNOOZE) || '');
    return Number.isFinite(at) && Date.now() - at < SNOOZE_DAYS * 864e5;
  } catch { return false; }
}
export function snooze() {
  try { localStorage.setItem(SNOOZE, new Date().toISOString()); } catch { /* private mode */ }
  notify();
}

/**
 * Whether the app can be put on this device's home screen, and how:
 * - `prompt`: the browser will ask — call `install()`;
 * - `ios`: show the Share → Add to Home Screen steps;
 * - `menu`: an Android browser that hasn't offered it — the browser's menu;
 * - `null`: already installed, or a computer that hasn't offered it.
 */
export function useInstall() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  let how = null;
  if (!installed && !standalone()) {
    if (deferred) how = 'prompt';
    else if (isIos) how = 'ios';
    else if (isAndroid) how = 'menu';
  }

  async function install() {
    if (!deferred) return false;
    const event = deferred;
    deferred = null;   // a prompt can be shown once
    event.prompt();
    const { outcome } = await event.userChoice.catch(() => ({ outcome: 'dismissed' }));
    if (outcome === 'accepted') installed = true;
    else snooze();   // said no to the phone's own prompt: not again this week
    notify();
    return outcome === 'accepted';
  }

  return { how, install, installed: installed || standalone() };
}
