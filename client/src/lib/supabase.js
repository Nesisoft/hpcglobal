import { createClient } from '@supabase/supabase-js';

const url     = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn('[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing — partner login/activation will not work.');
}

export const supabase = createClient(url || 'http://localhost', anonKey || 'missing', {
  auth: {
    detectSessionInUrl: true,   // parse invite/recovery tokens from the URL hash
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'hpc_partner_supabase',
  },
});
