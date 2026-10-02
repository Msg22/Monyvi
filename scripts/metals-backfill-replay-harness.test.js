const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  buildHarnessDbName,
  validateDbName,
  assertBaselineMigrations,
  wrapMigration,
  parseTapOutput,
  parseFingerprint,
} = require("./metals-backfill-replay-harness");

test("harness database names are reserved, unique, and generated", () => {
  const first = buildHarnessDbName(1000, 11);
  const second = buildHarnessDbName(1001, 11);
  assert.match(first, /^monyvi_backfill_[a-z0-9]+_11$/);
  assert.notEqual(first, second);
  assert.equal(validateDbName(first), first);
  assert.throws(() => validateDbName("postgres"), /Refusing unsafe/);
  assert.throws(() => validateDbName("monyvi_284_scratch"), /Refusing unsafe/);
  assert.throws(() => validateDbName("monyvi_backfill_drop me"), /Refusing unsafe/);
  assert.throws(() => validateDbName("x;DROP"), /Refusing unsafe/);
});

test("baseline selector pins 001-074 and refuses drift", () => {
  const files = [];
  for (let prefix = 1; prefix <= 74; prefix++) {
    if (prefix === 21) continue;
    files.push(`${String(prefix).padStart(3, "0")}_some_change.sql`);
  }
  files.push("075_metals_persistence_hardening.sql", "076_future.sql");
  const selected = assertBaselineMigrations(files);
  assert.equal(selected.length, 73);
  assert.ok(selected.every((file) => !file.startsWith("075_") && !file.startsWith("076_")));
  assert.throws(
    () => assertBaselineMigrations(files.filter((file) => !file.startsWith("074_"))),
    /baseline drift/
  );
});

test("migration wrapping neutralizes pg_cron and scopes one transaction", () => {
  const wrapped = wrapMigration(
    "CREATE EXTENSION IF NOT EXISTS pg_cron;\nSELECT 1;"
  );
  assert.ok(wrapped.startsWith("BEGIN;\n"));
  assert.ok(wrapped.includes("-- harness: pg_cron unavailable"));
  assert.ok(!wrapped.includes("CREATE EXTENSION IF NOT EXISTS pg_cron;"));
  assert.ok(wrapped.trimEnd().endsWith("COMMIT;"));
});

test("pgTAP output parsing detects pass and failure", () => {
  const full = parseTapOutput(" 1..2\n ok 1 - a\n ok 2 - b\n");
  assert.equal(full.passed, true);
  const fail = parseTapOutput(" 1..2\n ok 1 - a\n not ok 2 - b\nERROR: boom\n");
  assert.equal(fail.notOk, 1);
  assert.equal(fail.errors, 1);
  assert.equal(fail.passed, false);
});

test("fingerprint parsing accepts exactly one md5", () => {
  assert.equal(parseFingerprint("d41d8cd98f00b204e9800998ecf8427e\n"), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(parseFingerprint("nope\n"), null);
  assert.equal(parseFingerprint("a\nb\n"), null);
});
