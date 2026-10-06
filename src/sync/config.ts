/**
 * Supabase project settings, baked in at build time (GitHub repository variables SUPABASE_URL and
 * SUPABASE_PUBLISHABLE_KEY → VITE_* env vars in the deploy workflow). The publishable / anon key is
 * meant to be public: data is protected by the user's login and the table's Row Level Security.
 * When they are not set, the app falls back to the local-only PIN lock.
 */
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
export const cloudConfigured = /^https:\/\/\S+$/.test(SUPABASE_URL) && SUPABASE_KEY.length > 0
