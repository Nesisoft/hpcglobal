/**
 * Where to go once signed in: the address that sent them to sign in, kept in
 * the router state as `{ from, at }`.
 *
 * A scanned QR code (/q/123456) is only worth going back to while its code
 * still works. Someone who signs in, waits for approval or changes a
 * temporary password and comes back later would otherwise be sent to an
 * old code, which fails and counts towards the wrong-codes limit.
 */
const QR_FRESH_MS = 90000;

export function returnTo(state) {
  const from = state?.from;
  if (!from) return '/';
  if (from.startsWith('/q/') && !(Date.now() - Number(state.at) <= QR_FRESH_MS)) return '/';
  return from;
}

/** The part of the state to pass on between the sign-in screens. */
export const keepReturn = (state) => (state?.from ? { from: state.from, at: state.at } : undefined);
