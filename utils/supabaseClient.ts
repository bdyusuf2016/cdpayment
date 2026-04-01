import { createClient } from "@supabase/supabase-js";

const BUILTIN_SUPABASE_URL = "https://rzgdyxqtbpvstodvlnay.supabase.co";
const BUILTIN_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6Z2R5eHF0YnB2c3RvZHZsbmF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NDc2OTgsImV4cCI6MjA4NjQyMzY5OH0.Rhgv0JcrO79gnhnqh2YFlv8Dqca7ReczB1_tt9ioRjo";
export const SUPABASE_SITE_URL = BUILTIN_SUPABASE_URL;
export const SUPABASE_SITE_KEY = BUILTIN_SUPABASE_ANON_KEY;

export const supabase = createClient(
  SUPABASE_SITE_URL,
  SUPABASE_SITE_KEY,
);

export default supabase;
