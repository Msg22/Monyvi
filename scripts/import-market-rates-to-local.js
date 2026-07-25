/**
 * Copies production-like global market-rate rows from the linked remote
 * Supabase project into the local Supabase database.
 *
 * Use this after starting local Supabase when `public.market_rates` is empty
 * and the app needs realistic rates for dashboard, net-worth, and metals flows.
 * The script only touches `public.market_rates`: it deletes local rows in that
 * table and imports the linked remote rows. It does not copy user-owned data.
 */
const { spawnSync } = require("node:child_process");
const { writeFileSync, unlinkSync } = require("node:fs");
const { join, resolve } = require("node:path");

const repoRoot = resolve(__dirname, "..");
const linkedMarketRatesQuery =
  "select * from public.market_rates order by created_at asc;";

function getSupabaseSpawnArgs(args) {
  return [
    process.execPath,
    require.resolve("supabase/dist/supabase.js"),
    ...args,
  ];
}

function runSupabase(args) {
  const [command, ...commandArgs] = getSupabaseSpawnArgs(args);
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Supabase command failed: supabase ${args.join(" ")}`,
        result.stderr,
        result.stdout,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return result.stdout;
}

function getLinkedMarketRatesQueryArgs() {
  return [
    "db",
    "query",
    "--agent=no",
    "--linked",
    "-o",
    "json",
    linkedMarketRatesQuery,
  ];
}

function queryLinkedMarketRates() {
  const output = runSupabase(getLinkedMarketRatesQueryArgs());
  return parseSupabaseQueryRows(output);
}

function parseSupabaseQueryRows(output) {
  const jsonStartIndex = output.search(/[\[{]/);
  if (jsonStartIndex === -1) {
    throw new Error("Supabase query did not return JSON output.");
  }

  const jsonEndIndex = Math.max(
    output.lastIndexOf("]"),
    output.lastIndexOf("}")
  );
  const parsed = JSON.parse(output.slice(jsonStartIndex, jsonEndIndex + 1));
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (Array.isArray(parsed.rows)) {
    return parsed.rows;
  }

  throw new Error("Supabase query JSON did not include result rows.");
}

function parseImportMarketRatesArgs(argv = process.argv.slice(2)) {
  return {
    bestEffort: argv.includes("--best-effort"),
  };
}

function importLocalMarketRates(rows) {
  const serializedRows = JSON.stringify(rows).replaceAll("$copy$", "$ copy $");
  const importPath = join(repoRoot, ".tmp-market-rates-import.sql");

  writeFileSync(
    importPath,
    `with deleted as (
  delete from public.market_rates returning 1
),
deleted_count as (
  select count(*) from deleted
),
source_rows as (
  select * from jsonb_populate_recordset(
    null::public.market_rates,
    $copy$${serializedRows}$copy$::jsonb
  )
)
insert into public.market_rates
select source_rows.*
from source_rows
cross join deleted_count;
`,
    "utf8"
  );

  try {
    runSupabase(["db", "query", "--local", "-f", importPath]);
  } finally {
    unlinkSync(importPath);
  }
}

function runMarketRatesImport() {
  try {
    const rows = queryLinkedMarketRates();
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Remote market_rates returned no rows.");
    }

    importLocalMarketRates(rows);
    console.log(
      `Imported ${rows.length} market_rates rows into local Supabase.`
    );
  } catch (error) {
    const { bestEffort } = parseImportMarketRatesArgs();
    if (!bestEffort) {
      throw error;
    }

    console.warn(
      [
        "Skipped local market_rates import.",
        "Manual QA user data was seeded, but linked remote market rates were not available.",
        error instanceof Error ? error.message : String(error),
      ].join("\n")
    );
  }
}

if (require.main === module) {
  runMarketRatesImport();
}

module.exports = {
  getLinkedMarketRatesQueryArgs,
  getSupabaseSpawnArgs,
  parseImportMarketRatesArgs,
  parseSupabaseQueryRows,
};
