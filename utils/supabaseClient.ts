import { createClient } from "@supabase/supabase-js";

// Vite exposes env vars prefixed with VITE_ via import.meta.env
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "") as string;
// Support both common anon key names: VITE_SUPABASE_ANON_KEY and VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  "") as string;

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
