import { createClient } from '@supabase/supabase-js';

const url     = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn('[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing — partner login/activation will not work.');
}

/**
 * Which kind of Supabase email link opened this page, if any. Read once, here,
 * before the client below parses the URL and clears the hash — after that the
 * app can no longer tell. Only the link type and Supabase's error code are
 * kept, never the tokens.
 *   type  – 'invite' | 'recovery' | null
 *   error – Supabase's error code when it rejected the link (e.g. 'otp_expired'), else null
 */
function readAuthLink() {
  const hash   = new URLSearchParams(window.location.hash.slice(1));
  const search = new URLSearchParams(window.location.search);

  // A rejected link (expired, already used) comes back with error params,
  // usually in the hash but sometimes in the query string.
  const failed = [hash, search].find((p) => p.has('error_code') || p.has('error_description'));
  const type   = hash.has('access_token') ? hash.get('type') : null;

  return {
    type:  type === 'invite' || type === 'recovery' ? type : null,
    error: failed ? (failed.get('error_code') || failed.get('error') || 'unknown') : null,
  };
}

export const authLink = readAuthLink();

export const supabase = createClient(url || 'http://localhost', anonKey || 'missing', {
  auth: {
    detectSessionInUrl: true,   // parse invite/recovery tokens from the URL hash
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'hpc_partner_supabase',
  },
});
