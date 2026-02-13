import { createClient } from "@supabase/supabase-js";

// Server-side Supabase admin client.
// WARNING: keep `SUPABASE_SERVICE_ROLE_KEY` secret and never expose it to the browser.
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // Log helpful message in server logs. Do NOT throw in production helper file.
  // Throwing can be done where appropriate in your server startup code.
  // eslint-disable-next-line no-console
  console.error(
    "[supabase-admin] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set",
  );
}

export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

export default supabaseAdmin;
