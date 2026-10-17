/**
 * #395 local-only pgTAP race runner.
 *
 * Supabase's regular postgres test connection cannot install/use dblink as a
 * privileged second-session harness. Reuse the existing market test runner's
 * loopback-only supabase_admin URL and redaction policy. Never use --linked or
 * accept an arbitrary SQL path, URL, extension grant, or remote database.
 *
 * Temporary wrappers live under supabase/tests because the Supabase CLI
 * mounts only that directory into its pg_prove container. Each wrapper
 * commits a local dblink prerequisite before executing an UNMODIFIED copy
 * of the single allowlisted SQL test. The test itself owns its independent
 * transactions, assertions, dblink session cleanup, and fixture rollback.
 */
const { spawnSync } = require("node:child_process");
const {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { join, relative, resolve, sep } = require("node:path");
const {
  buildLocalAdminDatabaseUrl,
  redactDatabaseOutput,
} = require("./test-market-snapshot-concurrency");

const ROOT = resolve(__dirname, "..");
const TESTS_DIRECTORY = resolve(ROOT, "supabase", "tests");
const RACE_SUITES = Object.freeze([
  "supabase/tests/account_owner_serialization_race.test.sql",
  "supabase/tests/account_owner_lock_order.test.sql",
]);

// dblink must be committed BEFORE either original suite opens an independent
// backend. An uncommitted extension is invisible to another PostgreSQL session.
// SQL below is a trusted, fixed prerequisite only; it contains no credentials,
// financial DML, RLS/grant changes, replacements for TAP, or altered test body.
const LOCAL_DBLINK_PREREQUISITE = [
  "-- Local #395 test-only prerequisite; never run against a hosted database.",
  "BEGIN;",
  "CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;",
  "COMMIT;",
  "DO $monyvi_395_ci_prerequisite$",
  "BEGIN",
  "  IF current_user <> 'supabase_admin' OR NOT EXISTS (",
  "    SELECT 1 FROM pg_catalog.pg_roles",
  "    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)",
  "  ) THEN",
  "    RAISE EXCEPTION 'local_395_privileged_admin_role_required';",
  "  END IF;",
  "  IF NOT EXISTS (",
  "    SELECT 1 FROM pg_catalog.pg_extension e",
  "    JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace",
  "    WHERE e.extname = 'dblink' AND n.nspname = 'extensions'",
  "  ) THEN",
  "    RAISE EXCEPTION 'local_395_extensions_dblink_required';",
  "  END IF;",
  "END;",
  "$monyvi_395_ci_prerequisite$;",
  "",
].join("\n");

function invokeSupabase(args) {
  return spawnSync(
    process.execPath,
    [require.resolve("supabase/dist/supabase.js"), ...args],
    {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 300000,
      maxBuffer: 8 * 1024 * 1024,
    }
  );
}

function verifySuiteAllowlist(suites) {
  if (
    !Array.isArray(suites) ||
    suites.length === 0 ||
    suites.length > RACE_SUITES.length ||
    new Set(suites).size !== suites.length ||
    suites.some((name) => !RACE_SUITES.includes(name))
  ) {
    throw new Error("Invalid local concurrency suite allowlist.");
  }
}

function readLocalDatabaseUrl(invoke) {
  let status;
  try {
    status = invoke(["status", "--output", "json", "--agent=no"]);
  } catch {
    throw new Error("Could not inspect local Supabase test database.");
  }
  if (!status || status.status !== 0 || typeof status.stdout !== "string") {
    throw new Error("Could not inspect local Supabase test database.");
  }
  let settings;
  try {
    settings = JSON.parse(status.stdout);
  } catch {
    // Never copy a malformed status response (which may contain credentials)
    // into an exception, workflow log, or test assertion.
    throw new Error("Could not inspect local Supabase test database.");
  }
  if (
    !settings ||
    typeof settings.DB_URL !== "string" ||
    settings.DB_URL.trim().length === 0
  ) {
    throw new Error("Missing local database URL.");
  }
  return settings.DB_URL;
}

function readTrustedOriginalSuite(suite) {
  // Suite is an exact, fixed, checked-in relative path already allowlisted.
  const contents = readFileSync(resolve(ROOT, suite), "utf8");
  if (
    !contents.includes("extensions.dblink_connect") ||
    !/^\s*BEGIN;/m.test(contents) ||
    !/ROLLBACK;\s*$/.test(contents) ||
    !contents.includes("SELECT * FROM finish();")
  ) {
    throw new Error("Invalid local concurrency suite source.");
  }
  return contents;
}

function processFailureText() {
  return "Local account review concurrency test process failed or timed out.\n";
}

function redactedOutput(value, adminUrl, originalUrl) {
  const input = typeof value === "string" ? value : "";
  return redactDatabaseOutput(
    redactDatabaseOutput(input, adminUrl),
    originalUrl
  );
}

/**
 * Run either or both fixed tests, defaulting to BOTH in the listed order.
 * Injected invoke/suites are only for the repository's Node unit tests; every
 * suite path is validated BEFORE database discovery or file creation.
 * No caller-supplied SQL source, password, connection string or root path.
 */
function runAccountReviewConcurrency({
  invoke = invokeSupabase,
  databaseName,
  suites = RACE_SUITES,
} = {}) {
  verifySuiteAllowlist(suites);
  const originalUrl = readLocalDatabaseUrl(invoke);
  const adminUrl = buildLocalAdminDatabaseUrl(originalUrl, databaseName);
  if (new URL(adminUrl).username !== "supabase_admin") {
    throw new Error("Invalid local privileged database role.");
  }

  let temporaryDirectory;
  let stdout = "";
  let stderr = "";
  try {
    temporaryDirectory = mkdtempSync(
      join(TESTS_DIRECTORY, "account-review-ci-")
    );
    // pg_prove runs inside a Supabase container and may not share the host
    // UID. SQL wrappers contain only checked-in fixture code, no secrets.
    chmodSync(temporaryDirectory, 0o755);

    for (const suite of suites) {
      const originalSql = readTrustedOriginalSuite(suite);
      const wrapperPath = join(
        temporaryDirectory,
        suite.slice(suite.lastIndexOf("/") + 1)
      );
      writeFileSync(wrapperPath, LOCAL_DBLINK_PREREQUISITE + originalSql, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o644,
      });
      const mountedPath = relative(ROOT, wrapperPath).split(sep).join("/");
      let result;
      try {
        result = invoke([
          "test",
          "db",
          "--db-url",
          adminUrl,
          "--agent=no",
          mountedPath,
        ]);
      } catch {
        // Never propagate an invocation exception: its message may include
        // argv[--db-url] or a decoded password.
        result = { status: null, error: true };
      }

      const failed = !result || result.status !== 0 || Boolean(result.error);
      stdout += redactedOutput(result?.stdout, adminUrl, originalUrl);
      stderr += redactedOutput(
        result?.stderr ||
          (failed && (result?.error || result?.status === null)
            ? processFailureText()
            : ""),
        adminUrl,
        originalUrl
      );
      if (failed) {
        // Never run the second suite following a failed prerequisite, process,
        // TAP assertion, timeout, or command exit.
        return { status: 1, stdout, stderr };
      }
    }
    return { status: 0, stdout, stderr };
  } finally {
    if (temporaryDirectory !== undefined) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

if (require.main === module) {
  try {
    const result = runAccountReviewConcurrency({
      databaseName: process.env.MONYVI_TEST_DATABASE,
    });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exitCode = result.status;
  } catch {
    // Suppress all raw error messages: child process argv, file paths and
    // connection settings may contain sensitive local DB credentials.
    process.stderr.write(
      "Local account review concurrency runner failed before completion.\n"
    );
    process.exitCode = 1;
  }
}

module.exports = {
  RACE_SUITES,
  runAccountReviewConcurrency,
};
