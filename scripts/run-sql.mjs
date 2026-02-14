import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return "";
  return process.argv[i + 1] || "";
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run sql:run -- --sql \"alter table public.clients add column notes text;\"",
      "  npm run sql:run -- --file sql/query.sql",
      "",
      "Required env vars in .env:",
      "  SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
    ].join("\n"),
  );
}

function getSqlFromArgs() {
  const fileArg = getArg("--file");
  if (fileArg) {
    const abs = resolve(process.cwd(), fileArg);
    if (!existsSync(abs)) {
      throw new Error(`SQL file not found: ${abs}`);
    }
    return readFileSync(abs, "utf8");
  }

  const sqlArg = getArg("--sql");
  if (sqlArg) return sqlArg;

  const extra = process.argv.slice(2).join(" ").trim();
  if (extra) return extra;

  throw new Error(
    "No SQL provided. Use:\n  npm run sql:run -- --sql \"alter table ...\"\n  npm run sql:run -- --file sql/query.sql",
  );
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }

  loadEnvFile(resolve(process.cwd(), ".env"));

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY in environment.",
    );
  }

  const sql = getSqlFromArgs();
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.rpc("run_admin_sql", { sql });
  if (error) throw error;

  console.log("SQL executed successfully.");
}

main().catch((err) => {
  console.error("[sql:run] Failed:", err.message || err);
  process.exit(1);
});
