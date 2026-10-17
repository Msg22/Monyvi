const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");
const {
  RACE_SUITES,
  runAccountReviewConcurrency,
} = require("./test-account-review-concurrency");
const {
  buildLocalAdminDatabaseUrl,
  redactDatabaseOutput,
  runConcurrencyTest,
} = require("./test-market-snapshot-concurrency");

const LOCAL_DB = "postgresql://postgres:local%40only@127.0.0.1:54322/postgres";
const ADMIN_DB =
  "postgresql://supabase_admin:local%40only@127.0.0.1:54322/postgres";

function statusReply(databaseUrl = LOCAL_DB) {
  return { status: 0, stdout: JSON.stringify({ DB_URL: databaseUrl }) };
}

test("only the two pinned #395 two-session pgTAP files are eligible", () => {
  assert.deepEqual(RACE_SUITES, [
    "supabase/tests/account_owner_serialization_race.test.sql",
    "supabase/tests/account_owner_lock_order.test.sql",
  ]);
  for (const suites of [
    [],
    ["supabase/tests/review_batch_save.test.sql"],
    ["../account_owner_lock_order.test.sql"],
    [RACE_SUITES[0], RACE_SUITES[0]],
    [
      RACE_SUITES[0],
      "supabase/tests/financial_action_canonicalization_test.sql",
    ],
  ]) {
    let invoked = false;
    assert.throws(
      () =>
        runAccountReviewConcurrency({
          suites,
          invoke: () => {
            invoked = true;
            return statusReply();
          },
        }),
      /fixed.*suite|suite.*allowlist|Invalid local.*suite/
    );
    assert.equal(invoked, false, "unlisted path never reaches DB discovery");
  }
});

test("uses local supabase_admin and tests exact original SQL after committed dblink setup", () => {
  const calls = [];
  const wrappers = [];
  const original = RACE_SUITES.map((path) =>
    readFileSync(resolve(__dirname, "..", path), "utf8")
  );
  const result = runAccountReviewConcurrency({
    invoke: (args) => {
      calls.push(args);
      if (args[0] === "status") return statusReply();
      assert.deepEqual(args.slice(0, 3), ["test", "db", "--db-url"]);
      assert.equal(args[3] === ADMIN_DB, true, "exact captured local URL");
      assert.equal(new URL(args[3]).username, "supabase_admin");
      assert.equal(new URL(args[3]).hostname, "127.0.0.1");
      assert.equal(args[4], "--agent=no");
      assert.equal(args.length, 6);
      const wrapper = args[5];
      assert.match(
        wrapper,
        /^supabase\/tests\/account-review-ci-[^/]+\/.+\.test\.sql$/
      );
      const sql = readFileSync(resolve(__dirname, "..", wrapper), "utf8");
      wrappers.push({ wrapper, sql });
      return { status: 0, stdout: "ok - original pgTAP suite\n", stderr: "" };
    },
  });
  assert.equal(result.status, 0);
  assert.equal(wrappers.length, 2);
  assert.equal(calls.length, 3);
  for (let i = 0; i < wrappers.length; i++) {
    const { wrapper, sql } = wrappers[i];
    const extension = sql.indexOf(
      "CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;"
    );
    const commit = sql.indexOf("COMMIT;", extension);
    const role = sql.indexOf("rolsuper OR rolbypassrls", commit);
    const originalStart = sql.length - original[i].length;
    assert.ok(extension >= 0, "explicit local dblink prerequisite");
    assert.ok(
      commit > extension,
      "extension is committed before dblink backends connect"
    );
    assert.ok(
      role > commit && role < originalStart,
      "current role is verified"
    );
    assert.ok(originalStart > role, "original pgTAP executes only after setup");
    assert.equal(
      sql.slice(originalStart),
      original[i],
      "original body is byte-for-byte intact"
    );
    assert.equal(
      sql.includes(ADMIN_DB),
      false,
      "wrapper does not embed credentials"
    );
    assert.equal(
      existsSync(resolve(__dirname, "..", wrapper)),
      false,
      "temporary SQL removed"
    );
    assert.equal(
      existsSync(resolve(__dirname, "..", wrapper, "..")),
      false,
      "temporary directory removed"
    );
  }
});

test("bad status, invalid JSON and absent local DB URL cannot start either suite", () => {
  for (const status of [
    { status: 1, stdout: "postgresql://postgres:secret@remote.example.com/db" },
    { status: 0, stdout: "{not json" },
    { status: 0, stdout: "{}" },
    { status: null, error: new Error("ETIMEDOUT") },
  ]) {
    let calls = 0;
    assert.throws(
      () =>
        runAccountReviewConcurrency({
          invoke: () => {
            calls++;
            return status;
          },
        }),
      /local Supabase|Missing local database|inspect/
    );
    assert.equal(calls, 1);
  }
});

test("rejects remote, credentialless, query-rewritten and non-postgres targets", () => {
  for (const url of [
    "postgresql://postgres:password@remote.example.com:5432/postgres",
    "postgresql://postgres@127.0.0.1:54322/postgres",
    "postgresql://postgres:password@localhost:54322/postgres?host=remote",
    "https://postgres:password@localhost:54322/postgres",
  ]) {
    let calls = 0;
    assert.throws(
      () =>
        runAccountReviewConcurrency({
          invoke: () => {
            calls++;
            return statusReply(url);
          },
        }),
      /local database/
    );
    assert.equal(calls, 1, "no SQL/test invocation on rejected URL");
  }
  assert.throws(
    () =>
      runAccountReviewConcurrency({
        databaseName: "../remote",
        invoke: () => statusReply(),
      }),
    /Invalid local database/
  );
});

test("failure of first actual pgTAP stops the second, retains TAP, cleans wrapper", () => {
  let usedWrapper;
  let calls = 0;
  const result = runAccountReviewConcurrency({
    invoke: (args) => {
      if (args[0] === "status") return statusReply();
      calls++;
      usedWrapper = args.at(-1);
      assert.equal(existsSync(resolve(__dirname, "..", usedWrapper)), true);
      return {
        status: 1,
        stdout: "not ok 1 - genuine race regression\n",
        stderr: "",
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /not ok 1 - genuine race regression/);
  assert.equal(existsSync(resolve(__dirname, "..", usedWrapper)), false);
  assert.equal(existsSync(resolve(__dirname, "..", usedWrapper, "..")), false);
});

test("CLI timeout or process error fails closed and cleans the test-only wrapper", () => {
  let usedWrapper;
  const result = runAccountReviewConcurrency({
    invoke: (args) => {
      if (args[0] === "status") return statusReply();
      usedWrapper = args.at(-1);
      return { status: null, error: new Error("ETIMEDOUT secret=local@only") };
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /failed or timed out/);
  assert.doesNotMatch(result.stderr, /local@only|ETIMEDOUT/);
  assert.equal(existsSync(resolve(__dirname, "..", usedWrapper)), false);
});

test("runner redacts original and admin URLs plus decoded/encoded credentials in both streams", () => {
  let calls = 0;
  const result = runAccountReviewConcurrency({
    suites: [RACE_SUITES[0]],
    invoke: (args) => {
      if (args[0] === "status") return statusReply();
      calls++;
      return {
        status: 1,
        stdout: "not ok 1: " + ADMIN_DB + " secret local@only",
        stderr: LOCAL_DB + " password=local%40only password=local@only",
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /not ok 1/);
  for (const output of [result.stdout, result.stderr]) {
    assert.doesNotMatch(
      output,
      /supabase_admin:local|postgres:local|local%40only|local@only/
    );
  }
});

test("unexpected thrown test invocation never prints credentials and cleans its wrapper", () => {
  let usedWrapper;
  let thrown;
  try {
    runAccountReviewConcurrency({
      invoke: (args) => {
        if (args[0] === "status") return statusReply();
        usedWrapper = args.at(-1);
        throw new Error("failed to connect: " + ADMIN_DB);
      },
    });
  } catch (error) {
    thrown = error;
  }
  // Either a sanitized failure object or a generic sanitized exception may
  // represent a process exception; never leak the injected credential.
  if (thrown) assert.doesNotMatch(String(thrown), /local%40only/);
  assert.ok(usedWrapper);
  assert.equal(existsSync(resolve(__dirname, "..", usedWrapper)), false);
});

test("reuses unchanged market runner credential and redaction contract", () => {
  const admin = buildLocalAdminDatabaseUrl(LOCAL_DB);
  assert.equal(admin === ADMIN_DB, true);
  assert.equal(
    redactDatabaseOutput("failed " + ADMIN_DB + " local@only", admin).includes(
      "local@only"
    ),
    false
  );
  const calls = [];
  const result = runConcurrencyTest({
    invoke: (args) => {
      calls.push(args);
      return args[0] === "status"
        ? statusReply()
        : { status: 0, stdout: "ok - original market race\n", stderr: "" };
    },
  });
  assert.equal(result.status, 0);
  assert.equal(
    calls[1].at(-1),
    "supabase/tests/market_snapshot_publication_concurrency_test.sql"
  );
  assert.equal(calls[1].filter((s) => s.endsWith(".sql")).length, 1);
});
