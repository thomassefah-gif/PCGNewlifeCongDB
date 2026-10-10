import { createClient } from '@supabase/supabase-js';

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, '');
const configuredAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/** Indicates whether both Supabase project credentials are configured. */
export const isSupabaseConfigured = Boolean(configuredUrl && configuredAnonKey);

// Keep the UI bootable before local Supabase credentials are supplied.
// Data requests must be gated on isSupabaseConfigured until .env is configured.
export const supabase = createClient(
  configuredUrl || 'http://localhost:54321',
  configuredAnonKey || 'local-anon-key-not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
