const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildLocalAdminDatabaseUrl,
  redactDatabaseOutput,
  runConcurrencyTest,
} = require("./test-market-snapshot-concurrency");

test("concurrency runner uses local admin without altering URL credentials or target database", () => {
  const actual = buildLocalAdminDatabaseUrl(
    "postgresql://postgres:test%40password@127.0.0.1:54322/postgres",
    "isolated_test"
  );
  assert.equal(
    actual,
    "postgresql://supabase_admin:test%40password@127.0.0.1:54322/isolated_test"
  );
});

test("concurrency runner refuses remote, credentialless and non-Postgres database targets", () => {
  for (const url of [
    "postgresql://postgres:secret@remote.example.com:5432/postgres",
    "postgresql://postgres@localhost:54322/postgres",
    "https://postgres:secret@localhost:54322/postgres",
    "postgresql://postgres:secret@localhost:54322/postgres?host=remote.example.com",
  ])
    assert.throws(() => buildLocalAdminDatabaseUrl(url), /local database/);
});

test("concurrency runner redacts full URL and decoded credentials from CLI output", () => {
  const url =
    "postgresql://supabase_admin:test%40password@127.0.0.1:54322/postgres";
  const actual = redactDatabaseOutput(
    `failed ${url}; password=test@password test%40password`,
    url
  );
  assert.equal(actual.includes("test"), false);
});

test("concurrency runner rejects unsafe database names", () => {
  for (const databaseName of [
    "../postgres",
    "postgres?host=remote",
    "",
    "a/b",
  ]) {
    assert.throws(
      () =>
        buildLocalAdminDatabaseUrl(
          "postgresql://postgres:secret@localhost:54322/postgres",
          databaseName
        ),
      /Invalid local database/
    );
  }
});

test("concurrency runner turns process errors and timeouts into failure", () => {
  const result = runConcurrencyTest({
    invoke: (args) =>
      args[0] === "status"
        ? {
            status: 0,
            stdout: JSON.stringify({
              DB_URL:
                "postgresql://postgres:local-only@localhost:54322/postgres",
            }),
          }
        : { status: null, error: new Error("ETIMEDOUT") },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /failed or timed out/);
});

test("concurrency runner propagates failed TAP exit and never runs normal suites as admin", () => {
  const calls = [];
  const result = runConcurrencyTest({
    invoke: (args) => {
      calls.push(args);
      return args[0] === "status"
        ? {
            status: 0,
            stdout: JSON.stringify({
              DB_URL:
                "postgresql://postgres:local-only@127.0.0.1:54322/postgres",
            }),
          }
        : { status: 1, stdout: "not ok 1 - regression", stderr: "" };
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /not ok 1/);
  assert.equal(
    calls[1].at(-1),
    "supabase/tests/market_snapshot_publication_concurrency_test.sql"
  );
  assert.equal(calls[1].filter((arg) => arg.endsWith(".sql")).length, 1);
});
