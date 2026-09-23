const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase", "migrations");
const MIGRATION_075 = "075_metals_persistence_hardening.sql";
const ASSERTIONS_FILE = path.join(
  REPO_ROOT,
  "supabase",
  "tests",
  "metals_backfill_replay_test.sql"
);
const FINGERPRINT_FILE = path.join(
  REPO_ROOT,
  "scripts",
  "backfill-replay",
  "fingerprint.sql"
);

const PROTECTED_DATABASES = new Set(["postgres", "template0", "template1"]);
// 021 was never issued; the 001-074 baseline is fixed forever because applied
// migrations are immutable.
const BASELINE_MIN = 1;
const BASELINE_MAX = 74;
const BASELINE_SKIP = new Set([21]);

const REMOTE_STAGE = "/tmp/monyvi_backfill_harness";

function buildHarnessDbName(now = Date.now(), pid = process.pid) {
  return `monyvi_backfill_${now.toString(36)}_${pid}`;
}

function validateDbName(value) {
  if (
    typeof value !== "string" ||
    !/^monyvi_backfill_[a-z0-9_]+$/.test(value) ||
    PROTECTED_DATABASES.has(value)
  ) {
    throw new Error(`Refusing unsafe disposable database name: ${value}`);
  }
  return value;
}

function migrationPrefix(file) {
  const match = /^(\d+)_/.exec(file);
  return match === null ? null : Number(match[1]);
}

// Selects only the pinned 001-074 baseline and refuses to run on drift: a
// future 076+ must never execute before 075, and a missing baseline file
// must fail loudly instead of replaying a partial schema.
function assertBaselineMigrations(files) {
  const selected = files
    .filter((file) => {
      const prefix = migrationPrefix(file);
      return (
        prefix !== null && prefix >= BASELINE_MIN && prefix <= BASELINE_MAX
      );
    })
    .sort();
  const expected = [];
  for (let prefix = BASELINE_MIN; prefix <= BASELINE_MAX; prefix++) {
    if (!BASELINE_SKIP.has(prefix)) expected.push(prefix);
  }
  const actual = selected.map((file) => migrationPrefix(file));
  assertEqual(
    actual,
    expected,
    `migration baseline drift: expected prefixes 001-074 except 021, got ${actual.join(",")}`
  );
  return selected;
}

function assertEqual(actual, expected, message) {
  const same =
    Array.isArray(actual) &&
    Array.isArray(expected) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
  if (!same) throw new Error(message);
}

function wrapMigration(sql) {
  // Harness-only transform: pg_cron can only live in the Supabase-managed
  // postgres database. Neutralize its creation; cron stubs come from shims.
  // Each file runs in its own transaction so ON COMMIT DROP temp tables
  // survive the file, matching `supabase migration up` semantics.
  const neutralized = sql.replace(
    "CREATE EXTENSION IF NOT EXISTS pg_cron;",
    "-- harness: pg_cron unavailable in the disposable database"
  );
  return `BEGIN;\n${neutralized}\nCOMMIT;\n`;
}

function parseTapOutput(output) {
  const text = output ?? "";
  const ok = (text.match(/^ ok /gm) || []).length;
  const notOk = (text.match(/not ok/g) || []).length;
  const plan = (text.match(/1\.\.(\d+)/) || [])[1];
  const errors = (text.match(/^ERROR/gm) || []).length;
  return {
    ok,
    notOk,
    plan: plan === undefined ? null : Number(plan),
    errors,
    passed: errors === 0 && notOk === 0 && plan !== undefined && ok === Number(plan),
  };
}

function parseFingerprint(output) {
  const lines = (output ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[0-9a-f]{32}$/.test(line));
  return lines.length === 1 ? lines[0] : null;
}

function docker(args, options = {}) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function discoverContainer(spawnFn = docker, env = process.env) {
  if (env.MONYVI_HARNESS_CONTAINER) return env.MONYVI_HARNESS_CONTAINER;
  const found = spawnFn(["ps", "--filter", "name=supabase_db", "--format", "{{.Names}}"]);
  if (found.status !== 0) throw new Error("Could not list Docker containers.");
  const name = (found.stdout || "").split("\n").map((s) => s.trim()).find(Boolean);
  if (!name) throw new Error("No supabase_db container is running.");
  return name;
}

function lastLines(text, count = 8) {
  return (text || "").split("\n").slice(-count).join("\n");
}

function runHarness({
  spawn = docker,
  repoRoot = REPO_ROOT,
  env = process.env,
  fsModule = fs,
  clock = Date,
} = {}) {
  const steps = [];
  const log = (message) => {
    steps.push(message);
    process.stdout.write(`[harness] ${message}\n`);
  };
  const fail = (message) => {
    throw new Error(message);
  };
  const container = discoverContainer(spawn, env);
  log(`container: ${container}`);
  // Reserved unique generated name only: never accept an arbitrary database,
  // never drop a pre-existing one.
  const db = validateDbName(buildHarnessDbName(clock.now(), process.pid));
  const keep = env.MONYVI_HARNESS_KEEP === "1";
  const stage = fsModule.mkdtempSync(path.join(os.tmpdir(), "monyvi-harness-"));
  let createdDb = false;

  const check = (result, label) => {
    if (result.status !== 0) {
      fail(`${label} failed.\n${lastLines(result.stdout)}\n${lastLines(result.stderr)}`);
    }
    log(`ok: ${label}`);
  };
  const psqlDb = (targetDb, args) =>
    spawn(["exec", container, "psql", "-U", "postgres", "-d", targetDb, "-v", "ON_ERROR_STOP=1", "-q", ...args]);
  const cleanup = () => {
    if (createdDb && !keep) {
      spawn(["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q",
        "-c", `DROP DATABASE IF EXISTS ${db};`]);
    }
    spawn(["exec", container, "rm", "-rf", REMOTE_STAGE]);
    fsModule.rmSync(stage, { recursive: true, force: true });
  };

  try {
    // Stage wrapped migrations + support files locally, then copy once.
    const stagedMigrations = assertBaselineMigrations(
      fsModule.readdirSync(path.join(repoRoot, "supabase", "migrations")).sort()
    );
    for (const file of stagedMigrations) {
      const sql = fsModule.readFileSync(
        path.join(repoRoot, "supabase", "migrations", file),
        "utf8"
      );
      fsModule.writeFileSync(path.join(stage, file), wrapMigration(sql));
    }
    for (const file of ["shims.sql", "grants.sql", "fixtures.sql", "fingerprint.sql"]) {
      fsModule.copyFileSync(
        path.join(repoRoot, "scripts", "backfill-replay", file),
        path.join(stage, file)
      );
    }
    fsModule.copyFileSync(
      path.join(repoRoot, "supabase", "migrations", MIGRATION_075),
      path.join(stage, MIGRATION_075)
    );
    fsModule.copyFileSync(
      path.join(repoRoot, "supabase", "tests", "metals_backfill_replay_test.sql"),
      path.join(stage, "assertions.sql")
    );

    const remote = (name) => `${REMOTE_STAGE}/${name}`;
    check(spawn(["exec", container, "mkdir", "-p", REMOTE_STAGE]), "stage dir");
    check(spawn(["cp", stage + path.sep + ".", `${container}:${REMOTE_STAGE}`]), "stage copy");
    const existing = spawn(["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-tAc",
      `SELECT 1 FROM pg_database WHERE datname='${db}';`]);
    if ((existing.stdout || "").trim() !== "") {
      fail(`refusing: disposable database ${db} already exists`);
    }
    check(
      spawn(["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q",
        "-c", `CREATE DATABASE ${db};`]),
      "create disposable database"
    );
    createdDb = true;
    const psqlFile = (file, label) =>
      check(psqlDb(db, ["-f", remote(file)]), label);
    psqlFile("shims.sql", "shims");
    for (const file of stagedMigrations) {
      psqlFile(file, `replay ${file}`);
    }
    log(`replayed ${stagedMigrations.length} migrations (001-074)`);
    psqlFile("grants.sql", "grants");
    psqlFile("fixtures.sql", "fixtures");

    let firstFingerprint = null;
    const runPass = (label) => {
      psqlFile(MIGRATION_075, `075 execution (${label})`);
      const assertions = spawn(["exec", container, "psql", "-U", "postgres", "-d", db,
        "-v", "ON_ERROR_STOP=0", "-q", "-f", remote("assertions.sql")]);
      const parsed = parseTapOutput(assertions.stdout);
      log(`${label}: ${parsed.ok}/${parsed.plan} pass`);
      if (!parsed.passed) {
        fail(`assertions failed (${label}).\n${lastLines(assertions.stdout, 30)}\n${lastLines(assertions.stderr)}`);
      }
      const fingerprint = spawn(["exec", container, "psql", "-U", "postgres", "-d", db,
        "-tA", "-f", remote("fingerprint.sql")]);
      const digest = parseFingerprint(fingerprint.stdout);
      if (digest === null) {
        fail(`fingerprint unreadable (${label}).\n${lastLines(fingerprint.stdout)}\n${lastLines(fingerprint.stderr)}`);
      }
      log(`${label}: fingerprint ${digest}`);
      return digest;
    };
    firstFingerprint = runPass("first 075 run");
    const secondFingerprint = runPass("second 075 run");
    if (firstFingerprint !== secondFingerprint) {
      fail(
        `second 075 run changed rows: ${firstFingerprint} became ${secondFingerprint}`
      );
    }
    log("second run identical: updated_at and all rows unchanged");
    return { status: 0, steps };
  } finally {
    cleanup();
  }
}

if (require.main === module) {
  try {
    runHarness();
    process.stdout.write("Metals backfill replay harness passed.\n");
  } catch (error) {
    process.stderr.write(`Metals backfill replay harness failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildHarnessDbName,
  validateDbName,
  assertBaselineMigrations,
  wrapMigration,
  parseTapOutput,
  parseFingerprint,
  runHarness,
};
