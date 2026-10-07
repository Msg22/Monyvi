/**
 * Owned local SQL contract probes. Run with node --test after migrations.
 * Each SQL command uses stdin and an argument array; no shell interpolation.
 */
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");

const CONTAINER = "supabase_db_monyvi-issue255-repro";
const USER = "e87f8c60-511e-4248-9793-17dd2312290c";
const OTHER = "e87f8c60-511e-4248-9793-17dd2312290d";
const RECORD = "22222222-2222-4222-8222-222222222222";
const RECORD2 = "22222222-2222-4222-8222-222222222223";
const PSQL = [
  "exec",
  "-i",
  CONTAINER,
  "psql",
  "-X",
  "-qAt",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-p",
  "5432",
  "-v",
  "ON_ERROR_STOP=1",
];

function sql(source) {
  const result = spawnSync("docker", PSQL, {
    input: source,
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || "PSQL_FAILED");
  return result.stdout.trim();
}
function authenticated(source, user = USER) {
  return sql(
    `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${user}',true); ${source}; COMMIT;`
  )
    .split("\n")
    .slice(1)
    .join("\n");
}
function watermark() {
  return JSON.parse(
    authenticated("SELECT public.pull_market_rate_snapshots_page_v2()")
  ).upperWatermark;
}
function session(name) {
  const child = spawn("docker", PSQL, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  let errors = "";
  child.stdout.on("data", (data) => {
    output += data.toString();
  });
  child.stderr.on("data", (data) => {
    errors += data.toString();
  });
  child.stdin.write(`SET application_name = '${name}';\n`);
  return { child, output: () => output, errors: () => errors };
}
async function until(predicate, code) {
  const end = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > end) throw new Error(code);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

before(() => {
  const port = spawnSync("docker", ["port", CONTAINER, "5432/tcp"], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(port.status, 0);
  assert.match(port.stdout, /:54342\b/);
});

test("seal accepts current and older M unchanged; private access and public authentication remain restricted", () => {
  const older = watermark();
  const newer = watermark();
  assert.equal(
    Date.parse(authenticated(`SELECT public.seal_sync_pull_v1('${newer}')`)),
    Date.parse(newer)
  );
  assert.equal(
    Date.parse(authenticated(`SELECT public.seal_sync_pull_v1('${older}')`)),
    Date.parse(older)
  );
  assert.equal(
    sql(
      `SELECT last_sealed_watermark = '${newer}' FROM private.sync_pull_barrier`
    ),
    "t"
  );
  assert.throws(
    () => sql(`SET ROLE anon; SELECT public.seal_sync_pull_v1('${newer}');`),
    /permission denied/
  );
  assert.throws(
    () =>
      sql(
        `SET ROLE authenticated; SELECT public.seal_sync_pull_v1('${newer}');`
      ),
    /auth/
  );
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.equal(
      sql(
        `SELECT has_table_privilege('${role}', 'private.sync_pull_barrier', 'SELECT') OR has_table_privilege('${role}', 'private.sync_snapshot_deletions', 'SELECT') OR has_function_privilege('${role}', 'private.acquire_sync_writer_fence_v1()', 'EXECUTE')`
      ),
      "f"
    );
  }
  for (const value of [
    "infinity",
    "2999-01-01T00:00:00Z",
    "2026-01-01T00:00:00.123456Z",
  ]) {
    assert.throws(
      () => authenticated(`SELECT public.seal_sync_pull_v1('${value}')`),
      /watermark/
    );
  }
  assert.equal(
    sql(
      "SELECT bool_and(proconfig @> ARRAY['search_path=\"\"']) FROM pg_proc WHERE oid IN ('public.seal_sync_pull_v1(timestamptz)'::regprocedure, 'private.sync_write_time_v1()'::regprocedure)"
    ),
    "t"
  );
});

test("writer fence blocks seal until commit; later writer publication is strictly beyond seal", async () => {
  const upper = watermark();
  const writer = session("issue255_writer");
  const reader = session("issue255_sealer");
  try {
    writer.child.stdin.write(
      "BEGIN; SELECT private.acquire_sync_writer_fence_v1(); SELECT 'WRITER_READY';\n"
    );
    await until(
      () => writer.output().includes("WRITER_READY"),
      "WRITER_NOT_READY"
    );
    reader.child.stdin.write(
      `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${USER}',true); SELECT public.seal_sync_pull_v1('${upper}'); SELECT 'SEALED'; COMMIT;\n`
    );
    await until(
      () =>
        sql(
          "SELECT count(*) FROM pg_stat_activity WHERE application_name='issue255_sealer' AND wait_event_type='Lock'"
        ) === "1",
      "SEAL_NOT_LOCK_WAITING"
    );
    assert.equal(reader.output().includes("SEALED"), false);
    writer.child.stdin.write("COMMIT;\n");
    await until(
      () => reader.output().includes("SEALED"),
      "SEAL_DID_NOT_RESUME"
    );
    assert.equal(
      sql(`SELECT private.sync_write_time_v1() > '${upper}'::timestamptz`),
      "t"
    );
  } finally {
    writer.child.stdin.end("ROLLBACK;\n");
    reader.child.stdin.end("ROLLBACK;\n");
  }
});

test("real snapshot DELETE journal is transactional, owner scoped and count-paged with tied timestamps", () => {
  sql(`BEGIN;
    INSERT INTO auth.users(id, email) VALUES ('${USER}','issue255-fence@monyvi.test'), ('${OTHER}','issue255-fence-other@monyvi.test') ON CONFLICT(id) DO NOTHING;
    INSERT INTO public.daily_snapshot_assets(id,user_id,snapshot_date,total_assets_usd)
      VALUES ('${RECORD}','${USER}','2001-01-01',1), ('${RECORD2}','${USER}','2001-01-02',2);
    COMMIT;`);
  try {
    const lower = watermark();
    authenticated(`SELECT public.seal_sync_pull_v1('${lower}')`);
    assert.equal(
      sql(
        `BEGIN; DELETE FROM public.daily_snapshot_assets WHERE id='${RECORD}'; SELECT count(*) FROM private.sync_snapshot_deletions WHERE record_id='${RECORD}'; ROLLBACK;`
      ),
      "1"
    );
    assert.equal(
      sql(
        `SELECT count(*) FROM private.sync_snapshot_deletions WHERE record_id='${RECORD}'`
      ),
      "0"
    );
    sql(
      `DELETE FROM public.daily_snapshot_assets WHERE id IN ('${RECORD}','${RECORD2}');`
    );
    const upper = watermark();
    authenticated(`SELECT public.seal_sync_pull_v1('${upper}')`);
    assert.equal(
      sql(
        `SELECT bool_and(published_at > '${lower}') FROM private.sync_snapshot_deletions WHERE record_id IN ('${RECORD}','${RECORD2}')`
      ),
      "t"
    );
    // Tie only the owned test publications as superuser: pagination fixture, not producer evidence.
    sql(
      `UPDATE private.sync_snapshot_deletions SET published_at = '${upper}' WHERE record_id IN ('${RECORD}','${RECORD2}');`
    );
    const first = JSON.parse(
      authenticated(
        `SELECT public.pull_snapshot_deletions_page_v1('${lower}','${upper}',NULL,NULL,1)`
      )
    );
    assert.equal(first.count, 2);
    assert.equal(first.rows.length, 1);
    const cursor = first.rows[0];
    const second = JSON.parse(
      authenticated(
        `SELECT public.pull_snapshot_deletions_page_v1('${lower}','${upper}','${cursor.published_at}','${cursor.entry_id}',1)`
      )
    );
    assert.equal(second.count, 1);
    assert.notEqual(second.rows[0].record_id, cursor.record_id);
    const foreign = JSON.parse(
      authenticated(
        `SELECT public.pull_snapshot_deletions_page_v1('${lower}','${upper}',NULL,NULL,1)`,
        OTHER
      )
    );
    assert.equal(foreign.count, 0);
    assert.throws(
      () =>
        authenticated(
          `SELECT public.pull_snapshot_deletions_page_v1(NULL,'${upper}','${upper}',NULL,1)`
        ),
      /cursor/
    );
    assert.throws(
      () =>
        authenticated(
          `SELECT public.pull_snapshot_deletions_page_v1(NULL,'${upper}',NULL,NULL,0)`
        ),
      /limit/
    );
  } finally {
    sql(
      `DELETE FROM public.daily_snapshot_assets WHERE id IN ('${RECORD}','${RECORD2}'); DELETE FROM private.sync_snapshot_deletions WHERE record_id IN ('${RECORD}','${RECORD2}');`
    );
  }
});

// Historical rows predate publication fencing. Disable only the named INSERT
// trigger while building each fixture, then restore it before exercising writes.
// Every fixture and trigger change rolls back in the same SQL transaction.
const SNAPSHOTS = [
  { table: "daily_snapshot_assets", amount: "total_assets_usd" },
  { table: "daily_snapshot_balance", amount: "total_accounts_usd" },
  { table: "daily_snapshot_net_worth", amount: "total_net_worth" },
];
function historicalSnapshotFixture(table, amount) {
  return `BEGIN;
    INSERT INTO auth.users(id,email) VALUES ('${USER}','issue255-fence@monyvi.test') ON CONFLICT(id) DO NOTHING;
    ALTER TABLE public.${table} DISABLE TRIGGER ${table}_sync_publication;
    INSERT INTO public.${table}(id,user_id,snapshot_date,${amount},created_at)
      VALUES ('${RECORD}','${USER}',CURRENT_DATE - 91,1,clock_timestamp() - interval '91 days');
    ALTER TABLE public.${table} ENABLE TRIGGER ${table}_sync_publication;
    CREATE TEMP TABLE original_snapshot ON COMMIT DROP AS
      SELECT created_at FROM public.${table} WHERE id='${RECORD}';`;
}
for (const { table, amount } of SNAPSHOTS) {
  test(`snapshot retention: ${table} payload UPDATE preserves historical publication and 90-day exclusion`, () => {
    const result = JSON.parse(
      sql(`${historicalSnapshotFixture(table, amount)}
      UPDATE public.${table} SET ${amount}=2 WHERE id='${RECORD}';
      SELECT jsonb_build_object(
        'unchanged', created_at = (SELECT created_at FROM original_snapshot),
        'outsideRetention', created_at < clock_timestamp() - interval '90 days',
        'amount', ${amount},
        'deletions', (SELECT count(*) FROM private.sync_snapshot_deletions
          WHERE table_name='${table}' AND record_id='${RECORD}'))
      FROM public.${table} WHERE id='${RECORD}';
      ROLLBACK;`)
    );
    assert.deepEqual(result, {
      unchanged: true,
      outsideRetention: true,
      amount: 2,
      deletions: 0,
    });
  });
  test(`snapshot replacement: ${table} DELETE plus INSERT publishes new identity and journals old identity`, () => {
    const lower = watermark();
    authenticated(`SELECT public.seal_sync_pull_v1('${lower}')`);
    const result = JSON.parse(
      sql(`${historicalSnapshotFixture(table, amount)}
      DELETE FROM public.${table} WHERE id='${RECORD}';
      INSERT INTO public.${table}(id,user_id,snapshot_date,${amount},created_at)
        VALUES ('${RECORD2}','${USER}',CURRENT_DATE - 91,2,'2001-01-01');
      SELECT jsonb_build_object(
        'oldAbsent', NOT EXISTS(SELECT 1 FROM public.${table} WHERE id='${RECORD}'),
        'newPublished', created_at > '${lower}'::timestamptz AND created_at <= clock_timestamp(),
        'insideRetention', created_at > clock_timestamp() - interval '90 days',
        'deletions', (SELECT count(*) FROM private.sync_snapshot_deletions
          WHERE table_name='${table}' AND record_id='${RECORD}' AND user_id='${USER}'
            AND published_at > '${lower}'::timestamptz AND published_at <= clock_timestamp()))
      FROM public.${table} WHERE id='${RECORD2}';
      ROLLBACK;`)
    );
    assert.deepEqual(result, {
      oldAbsent: true,
      newPublished: true,
      insideRetention: true,
      deletions: 1,
    });
  });
}
