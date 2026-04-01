import { createClient } from "@supabase/supabase-js";

const BUILTIN_SUPABASE_URL = "https://rzgdyxqtbpvstodvlnay.supabase.co";
const BUILTIN_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6Z2R5eHF0YnB2c3RvZHZsbmF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NDc2OTgsImV4cCI6MjA4NjQyMzY5OH0.Rhgv0JcrO79gnhnqh2YFlv8Dqca7ReczB1_tt9ioRjo";

// Vite exposes env vars prefixed with VITE_ via import.meta.env
const SUPABASE_URL = ((import.meta.env.VITE_SUPABASE_URL ??
  BUILTIN_SUPABASE_URL) as string).trim();
// Support both common anon key names: VITE_SUPABASE_ANON_KEY and VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  BUILTIN_SUPABASE_ANON_KEY) as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Log a helpful message in development; do not throw to avoid breaking builds.
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] VITE_SUPABASE_URL or anon key is not set. Falling back to runtime configuration or localStorage.",
  );
}

export const SUPABASE_SITE_URL = SUPABASE_URL;
export const SUPABASE_SITE_KEY = SUPABASE_ANON_KEY;

export const supabase = createClient(
  SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY ?? "",
);

export default supabase;
