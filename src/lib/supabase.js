import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surfaced in the UI by App.jsx rather than crashing silently.
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env and fill it in.');
}

export const supabase = createClient(url ?? '', anonKey ?? '');
export const configured = Boolean(url && anonKey);
