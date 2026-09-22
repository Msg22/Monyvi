const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const CONCURRENCY_SUITE =
  "supabase/tests/market_snapshot_publication_concurrency_test.sql";

function buildLocalAdminDatabaseUrl(databaseUrl, databaseName) {
  const url = new URL(databaseUrl);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Concurrency tests require a credentialed local database URL."
    );
  }
  if (databaseName !== undefined) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(databaseName)) {
      throw new Error("Invalid local database test name.");
    }
    url.pathname = `/${databaseName}`;
  }
  url.username = "supabase_admin";
  return url.toString();
}

function redactDatabaseOutput(output, databaseUrl) {
  const password = new URL(databaseUrl).password;
  return [databaseUrl, password, decodeURIComponent(password)].reduce(
    (text, secret) => text.split(secret).join("[REDACTED]"),
    output ?? ""
  );
}

function invokeSupabase(args) {
  return spawnSync(
    process.execPath,
    [require.resolve("supabase/dist/supabase.js"), ...args],
    {
      cwd: resolve(__dirname, ".."),
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
    }
  );
}

function runConcurrencyTest({ invoke = invokeSupabase, databaseName } = {}) {
  const status = invoke(["status", "--output", "json", "--agent=no"]);
  if (status.status !== 0)
    throw new Error("Could not inspect local Supabase test database.");
  const settings = JSON.parse(status.stdout);
  if (typeof settings.DB_URL !== "string")
    throw new Error("Missing local database URL.");
  const databaseUrl = buildLocalAdminDatabaseUrl(settings.DB_URL, databaseName);
  // Supabase's postgres role is not a superuser. Only this two-session harness
  // needs admin for passwordless in-container dblink; RLS suites stay postgres.
  const result = invoke([
    "test",
    "db",
    "--db-url",
    databaseUrl,
    "--agent=no",
    CONCURRENCY_SUITE,
  ]);
  return {
    status: result.status ?? 1,
    stdout: redactDatabaseOutput(result.stdout, databaseUrl),
    stderr: redactDatabaseOutput(
      result.stderr ||
        (result.error
          ? "Local Supabase test process failed or timed out.\n"
          : ""),
      databaseUrl
    ),
  };
}

if (require.main === module) {
  try {
    const result = runConcurrencyTest({
      databaseName: process.env.MONYVI_TEST_DATABASE,
    });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exitCode = result.status;
  } catch {
    process.stderr.write(
      "Local snapshot concurrency test runner failed before completion.\n"
    );
    process.exitCode = 1;
  }
}

module.exports = {
  buildLocalAdminDatabaseUrl,
  redactDatabaseOutput,
  runConcurrencyTest,
};
