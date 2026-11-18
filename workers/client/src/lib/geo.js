/**
 * The phone's location, for clocking in by GPS and for setting a venue.
 *
 * Always a fresh fix (maximumAge 0): a position remembered from the drive to
 * church would put someone at the venue who isn't there yet, or miss someone
 * who is.
 */

/** Why there is no position: DENIED, UNAVAILABLE, TIMEOUT, INSECURE or UNSUPPORTED. */
export class LocationError extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}

/** Resolves to `{ latitude, longitude, accuracy }` (accuracy in metres). */
export function getPosition({ timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    // Browsers share the location only with secure pages (https, or
    // localhost); over http the fix is the address, not another browser.
    if (window.isSecureContext === false) {
      reject(new LocationError('INSECURE'));
      return;
    }
    if (!('geolocation' in navigator)) {
      reject(new LocationError('UNSUPPORTED'));
      return;
    }
    // The timeout only starts once permission is given, so a permission
    // question left unanswered would otherwise spin for ever.
    let settled = false;
    const guard = setTimeout(() => finish(null, new LocationError('TIMEOUT')), timeout + 45000);
    function finish(value, error) {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      if (error) reject(error); else resolve(value);
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => finish({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
      (err) => finish(null, new LocationError(err.code === 1 ? 'DENIED' : err.code === 3 ? 'TIMEOUT' : 'UNAVAILABLE')),
      { enableHighAccuracy: true, timeout, maximumAge: 0 },
    );
  });
}

/** An iPhone or iPad (iPads say they are Macs, but Macs have no touch screen). */
export const isApple = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** What went wrong, in a sentence, and — for a refusal — how to allow it on this phone. */
export function locationProblem(kind) {
  switch (kind) {
    case 'DENIED':
      return {
        title: 'Location is blocked for this app',
        text: 'Clocking in by GPS needs your location, just for this moment.',
        // Safari's own setting for this site comes first: it is the one a
        // "Don't Allow" tap changes. The phone-wide switch is the next suspect.
        steps: isApple()
          ? 'On an iPhone: in Safari, tap aA in the address bar → Website Settings → Location → Allow (or open Settings → Apps → Safari → Location and choose Allow). If it still fails, open Settings → Privacy & Security → Location Services, make sure it is on, then tap Safari Websites (or your browser) and choose “While Using the App”. Come back here and try again.'
          : 'On Android: tap the icon beside the web address (or ⋮ → Settings → Site settings), choose Location → Allow. Check that Location is on in your phone’s quick settings too, then try again.',
      };
    case 'TIMEOUT':
      return {
        title: 'Finding your location took too long',
        text: 'Step outside or near a window, make sure Location is on, and try again.',
      };
    case 'INSECURE':
      return {
        title: 'Location needs the secure address',
        text: 'Location only works on the secure address — open https://workers.hpcglobal.org',
      };
    case 'UNSUPPORTED':
      return {
        title: 'This browser can’t share your location',
        text: 'Try opening the app in Chrome or Safari.',
      };
    default:
      return {
        title: 'Your phone couldn’t find where you are',
        text: 'Make sure Location is on, step outside or near a window, and try again.',
      };
  }
}
