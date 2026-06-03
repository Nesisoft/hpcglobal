const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Service-role client — used for admin operations (inviting partners,
// validating partner access tokens). NEVER expose the service role key
// to the frontend.
const url        = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn('[supabaseAdmin] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — partner auth/email features will fail.');
}

const supabaseAdmin = createClient(url || 'http://localhost', serviceKey || 'missing', {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = supabaseAdmin;
