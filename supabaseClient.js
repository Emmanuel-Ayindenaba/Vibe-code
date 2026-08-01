// ==========================
// SUPABASE CLIENT
// ==========================
// Loaded on every page, before auth.js / side.js / app.js.
// Uses the publishable (client-safe) key — never put a secret/service key here.

const SUPABASE_URL = 'https://gjyujxlydmhwwimxrign.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_AiGnvVXrJ-IprSgelFGk3Q_pY4qRxH6';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
