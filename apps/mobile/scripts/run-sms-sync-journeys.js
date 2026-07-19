const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createClient } = require("@supabase/supabase-js");
const {
  adb,
  appId,
  collapseSystemUi,
  ensureE2eAppReady,
  forceStopApp,
  getMaestroDeviceArgs,
  isRetryableMaestroTransportFailure,
  isMissingDeviceSqliteError,
  reconnectAndroidDevice,
  resolveMaestroBin,
  seedIntroSeenFlagForE2e,
  deviceId,
} = require("./e2e-preflight");
const { applyE2eAuthDeepLink } = require("./e2e-auth-deeplink");
const { getE2eSeedConfig, seedE2eData } = require("./e2e-seed");
const { logE2eDuration } = require("./e2e-timing");

const mobileRoot = join(__dirname, "..");
const flowDir = join("e2e", "maestro", "sms-sync");
const defaultMaestroFlowTimeoutMs = 10 * 60 * 1000;
const defaultSmsSyncFlowAttemptCount = 2;
const uiAuthBootstrapFlow = "../helpers/ci-auth-bootstrap.yaml";
const deeplinkAuthBootstrapFlow = "../helpers/ci-auth-deeplink-bootstrap.yaml";
const retryableSmsSyncFlowSet = new Set([
  "sms-sync-batch-duplicates-atm.yaml",
  "sms-sync-rescan-skips-saved.yaml",
]);

const readSmsPermission = "android.permission.READ_SMS";

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function getActiveUserFilter(env = process.env) {
  if (!env.E2E_USER_ID) {
    throw new Error("E2E_USER_ID is required for SMS sync probe SQL.");
  }

  return `user_id = ${sqlString(env.E2E_USER_ID)}`;
}

function isFixtureParserE2eMode(env = process.env) {
  return env.EXPO_PUBLIC_AI_SMS_PARSER_MODE !== "local";
}

function isLocalParserE2eMode(env = process.env) {
  return env.EXPO_PUBLIC_AI_SMS_PARSER_MODE === "local";
}

function clearPermissionFlags(permission) {
  adb(
    [
      "shell",
      "pm",
      "clear-permission-flags",
      appId,
      permission,
      "user-set",
      "user-fixed",
    ],
    { allowFailure: true }
  );
}

function grantReadSmsPermission() {
  clearPermissionFlags(readSmsPermission);
  adb(["shell", "pm", "grant", appId, readSmsPermission], {
    allowFailure: true,
  });
}

async function runFlow(flow) {
  const maestroBin = resolveMaestroBin();
  if (!maestroBin) {
    throw new Error("Maestro was not found. Install it or set MAESTRO_BIN.");
  }

  const maxAttempts = getSmsSyncFlowAttemptCount();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runMaestroFlowOnce(maestroBin, flow);
    if (result.status === 0) {
      return;
    }

    if (
      attempt < maxAttempts &&
      shouldRetrySmsSyncFlowAttempt(flow, result) &&
      shouldRetrySmsSyncFlowAfterTransportFailure(flow)
    ) {
      console.warn(
        `Retrying SMS sync Maestro flow after transport failure: ${flow}`
      );
      await prepareSmsSyncFlowRetry(flow);
      continue;
    }

    throw new Error(`${maestroBin} test ${join(flowDir, flow)} failed`);
  }
}

async function prepareSmsSyncFlowRetry(flow) {
  reconnectAndroidDevice();

  if (!shouldResetSmsSyncAppStateBeforeRetry(flow)) {
    return;
  }

  await bootstrapCleanAuthenticatedSession();
  grantReadSmsPermission();
}

function shouldResetSmsSyncAppStateBeforeRetry(flow, env = process.env) {
  return (
    flow === "sms-sync-batch-duplicates-atm.yaml" &&
    env.E2E_SUPABASE_MODE === "local" &&
    env.E2E_SKIP_AUTH_BOOTSTRAP !== "1" &&
    env.E2E_SKIP_SEED !== "1"
  );
}

function shouldRetrySmsSyncFlowAfterTransportFailure(flow, env = process.env) {
  if (!retryableSmsSyncFlowSet.has(flow)) {
    return false;
  }

  return (
    flow !== "sms-sync-batch-duplicates-atm.yaml" ||
    shouldResetSmsSyncAppStateBeforeRetry(flow, env)
  );
}

function shouldRetrySmsSyncFlowAttempt(flow, result) {
  return (
    !result.didTimeout &&
    retryableSmsSyncFlowSet.has(flow) &&
    isRetryableMaestroTransportFailure(result.output)
  );
}

function getMaestroFlowTimeoutMs(env = process.env) {
  const parsed = Number(env.E2E_MAESTRO_FLOW_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : defaultMaestroFlowTimeoutMs;
}

function getSmsSyncFlowAttemptCount(env = process.env) {
  const parsed = Number(env.E2E_SMS_SYNC_FLOW_ATTEMPT_COUNT);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return defaultSmsSyncFlowAttemptCount;
  }
  return Math.min(parsed, defaultSmsSyncFlowAttemptCount);
}

function runMaestroFlowOnce(maestroBin, flow) {
  const startedAt = Date.now();
  const result = spawnSync(
    maestroBin,
    [...getMaestroDeviceArgs(), "test", join(flowDir, flow)],
    {
      encoding: "utf8",
      cwd: mobileRoot,
      maxBuffer: 16 * 1024 * 1024,
      shell: process.platform === "win32" && maestroBin.endsWith(".bat"),
      stdio: ["ignore", "pipe", "pipe"],
      timeout: getMaestroFlowTimeoutMs(),
    }
  );
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const errorMessage = result.error?.message ?? "";

  if (stdout) {
    process.stdout.write(stdout);
  }
  if (stderr) {
    process.stderr.write(stderr);
  }
  logE2eDuration(`SMS flow ${flow}`, startedAt);

  return {
    didTimeout:
      result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM",
    output: `${stdout}${stderr}${errorMessage}`,
    status: result.error ? 1 : (result.status ?? 1),
  };
}

function getAuthBootstrapFlow(env = process.env) {
  return env.E2E_AUTH_DEEPLINK_BOOTSTRAP === "1"
    ? deeplinkAuthBootstrapFlow
    : uiAuthBootstrapFlow;
}

function applyLocalE2eDefaults() {
  if (process.env.E2E_SUPABASE_MODE !== "local") return;

  process.env.E2E_SUPABASE_MODE = "local";
  process.env.EXPO_PUBLIC_MONYVI_TEST_MODE ??= "e2e";
  process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE ??= "fixture";
  process.env.EXPO_PUBLIC_SUPABASE_URL ??= "http://10.0.2.2:54321";

  if (process.env.E2E_SKIP_AUTH_BOOTSTRAP === "1") return;

  const config = getE2eSeedConfig({
    ...process.env,
    E2E_SUPABASE_MODE: "local",
  });

  process.env.EXPO_PUBLIC_SUPABASE_URL = config.appSupabaseUrl;
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= config.anonKey;
  process.env.MAESTRO_E2E_EMAIL ??= config.email;
  process.env.MAESTRO_E2E_PASSWORD ??= config.password;
  applyE2eAuthDeepLink();
}

async function bootstrapCleanAuthenticatedSession() {
  if (process.env.E2E_SUPABASE_MODE !== "local") return;
  if (process.env.E2E_SKIP_AUTH_BOOTSTRAP === "1") return;

  applyLocalE2eDefaults();
  const config = getE2eSeedConfig({
    ...process.env,
    E2E_SUPABASE_MODE: "local",
  });
  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await seedE2eData(client, config);
  process.env.E2E_USER_ID = result.userId;
  adb(["shell", "pm", "clear", appId]);
  seedIntroSeenFlagForE2e();
  await ensureE2eAppReady();
  await runFlow(getAuthBootstrapFlow());
}

function queryWatermelonScalar(sql) {
  try {
    return adb(["shell", "run-as", appId, "sqlite3", "watermelon.db"], {
      allowFailure: false,
      capture: true,
      input: sql,
    }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isMissingDeviceSqliteError(message)) {
      throw error;
    }

    return queryWatermelonScalarFromHostSnapshot(sql);
  }
}

function expectWatermelonScalar(sql, expected, label) {
  const actual = queryWatermelonScalar(sql);
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function buildSmsSyncProbeCleanupSql() {
  const activeUserFilter = getActiveUserFilter();

  return [
    [
      "delete from transactions",
      "where source = 'SMS'",
      "and sms_fingerprint is not null",
      `and ${activeUserFilter};`,
    ].join(" "),
    [
      "delete from transfers",
      "where sms_fingerprint is not null",
      `and ${activeUserFilter};`,
    ].join(" "),
  ].join(" ");
}

function clearSmsSyncProbeRows() {
  const sql = buildSmsSyncProbeCleanupSql();

  const output = adb(["shell", "run-as", appId, "sqlite3", "watermelon.db"], {
    allowFailure: true,
    capture: true,
    input: sql,
  }).trim();

  if (isMissingDeviceSqliteError(output)) {
    console.warn(
      "Skipping SMS sync probe cleanup because this Android device does not expose sqlite3 through adb shell."
    );
    return;
  }

  if (output) {
    throw new Error(`SMS sync probe cleanup failed: ${output}`);
  }
}

function queryWatermelonScalarFromHostSnapshot(sql) {
  const snapshotDir = mkdtempSync(join(tmpdir(), "monyvi-watermelon-"));
  const dbPath = join(snapshotDir, "watermelon.db");

  try {
    copyWatermelonFileToHost("watermelon.db", dbPath, false);
    copyWatermelonFileToHost("watermelon.db-wal", `${dbPath}-wal`, true);
    copyWatermelonFileToHost("watermelon.db-shm", `${dbPath}-shm`, true);

    const result = spawnSync("sqlite3", [dbPath], {
      encoding: "utf8",
      input: sql,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
    });

    if (result.status !== 0) {
      throw new Error(
        `Host sqlite3 query failed: ${result.stderr || result.stdout}`
      );
    }

    return (result.stdout || "").trim();
  } finally {
    rmSync(snapshotDir, { force: true, recursive: true });
  }
}

function copyWatermelonFileToHost(remotePath, localPath, optional) {
  const result = spawnSync(
    "adb",
    ["-s", deviceId, "exec-out", "run-as", appId, "cat", remotePath],
    {
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    }
  );

  if (result.status !== 0) {
    if (optional) {
      return;
    }

    throw new Error(
      `Could not copy ${remotePath} from Android app data: ${result.stderr.toString(
        "utf8"
      )}`
    );
  }

  writeFileSync(localPath, result.stdout);
}

function verifyBatchSmsSaved() {
  for (const {
    label,
    sql,
    expected,
  } of buildBatchSmsSavedVerificationQueries()) {
    expectWatermelonScalar(sql, expected, label);
  }
}

function buildBatchSmsSavedVerificationQueries() {
  return isLocalParserE2eMode()
    ? buildLocalParserSmsSavedVerificationQueries()
    : buildFixtureSmsSavedVerificationQueries();
}

function buildFixtureSmsSavedVerificationQueries() {
  const activeUserFilter = getActiveUserFilter();

  return [
    {
      label: "Duplicate batch SMS transaction count",
      expected: "2",
      sql: [
        "select count(*) from transactions",
        "where counterparty = 'PR622 BATCH DUPLICATE SHOP'",
        "and deleted = 0",
        "and sms_fingerprint is not null",
        `and ${activeUserFilter};`,
      ].join(" "),
    },
    {
      label: "Duplicate batch SMS distinct fingerprint count",
      expected: "2",
      sql: [
        "select count(distinct sms_fingerprint) from transactions",
        "where counterparty = 'PR622 BATCH DUPLICATE SHOP'",
        "and deleted = 0",
        "and sms_fingerprint is not null",
        `and ${activeUserFilter};`,
      ].join(" "),
    },
    {
      label: "ATM withdrawal transfer count",
      expected: "1",
      sql: [
        "select count(*) from transfers",
        "where notes = 'ATM Withdrawal'",
        "and amount = 2000",
        "and deleted = 0",
        "and sms_fingerprint is not null",
        `and ${activeUserFilter};`,
      ].join(" "),
    },
  ];
}

function buildSavedSmsRowsUnionSql() {
  const activeUserFilter = getActiveUserFilter();

  return [
    "select sms_fingerprint from transactions",
    "where source = 'SMS'",
    "and deleted = 0",
    "and sms_fingerprint is not null",
    `and ${activeUserFilter}`,
    "union all",
    "select sms_fingerprint from transfers",
    "where deleted = 0",
    "and sms_fingerprint is not null",
    `and ${activeUserFilter}`,
  ].join(" ");
}

function buildLocalParserSmsSavedVerificationQueries() {
  const activeUserFilter = getActiveUserFilter();
  const savedRowsUnion = buildSavedSmsRowsUnionSql();

  return [
    {
      label: "Local parser saved at least 10 SMS-derived records",
      expected: "1",
      sql: `select case when (select count(*) from (${savedRowsUnion})) >= 10 then 1 else 0 end;`,
    },
    {
      label: "Local parser saved SMS fingerprints are unique",
      expected: "1",
      sql: `select case when (select count(*) from (${savedRowsUnion})) = (select count(distinct sms_fingerprint) from (${savedRowsUnion})) then 1 else 0 end;`,
    },
    {
      label: "Local parser saved at least one ATM withdrawal transfer",
      expected: "1",
      sql: [
        "select case when count(*) >= 1 then 1 else 0 end from transfers",
        "where notes = 'ATM Withdrawal'",
        "and deleted = 0",
        "and sms_fingerprint is not null",
        `and ${activeUserFilter};`,
      ].join(" "),
    },
  ];
}

let hasSavedSmsSyncBaseline = false;

function shouldRelaunchBetweenSmsSyncJourneys(env = process.env) {
  return env.E2E_SMS_SYNC_RELAUNCH_BETWEEN_JOURNEYS === "1";
}

function shouldRelaunchBeforeSmsSyncJourney(
  hasSavedBaseline,
  env = process.env
) {
  if (!hasSavedBaseline) {
    return env.E2E_SMS_SYNC_RELAUNCH_BEFORE_FIRST_JOURNEY === "1";
  }

  return shouldRelaunchBetweenSmsSyncJourneys(env);
}

async function maybeRelaunchBeforeSmsSyncJourney() {
  if (!shouldRelaunchBeforeSmsSyncJourney(hasSavedSmsSyncBaseline)) {
    return;
  }

  forceStopApp();
  await ensureE2eAppReady();
}

async function runBatchDuplicatesAndAtm() {
  grantReadSmsPermission();
  clearSmsSyncProbeRows();
  await maybeRelaunchBeforeSmsSyncJourney();
  await runFlow("sms-sync-batch-duplicates-atm.yaml");
  verifyBatchSmsSaved();
  hasSavedSmsSyncBaseline = true;
}

async function runRescanSkipsSaved() {
  if (!hasSavedSmsSyncBaseline) {
    await runBatchDuplicatesAndAtm();
  }

  grantReadSmsPermission();
  await maybeRelaunchBeforeSmsSyncJourney();
  await runFlow("sms-sync-rescan-skips-saved.yaml");
  verifyBatchSmsSaved();
}

async function runHybridPartialRetry() {
  grantReadSmsPermission();
  clearSmsSyncProbeRows();
  await maybeRelaunchBeforeSmsSyncJourney();
  await runFlow("sms-sync-hybrid-partial-retry.yaml");
}

const journeys = {
  "01": runBatchDuplicatesAndAtm,
  "02": runRescanSkipsSaved,
  "03": runHybridPartialRetry,
};

function getDefaultJourneyIds(env = process.env) {
  return env.EXPO_PUBLIC_AI_SMS_PARSER_MODE === "hybrid-fixture"
    ? ["03"]
    : ["01", "02"];
}

async function main() {
  applyLocalE2eDefaults();

  const requested = process.argv.slice(2);
  const selected =
    requested.length > 0
      ? requested.map((id) => id.padStart(2, "0"))
      : getDefaultJourneyIds();

  await bootstrapCleanAuthenticatedSession();

  for (const id of selected) {
    const journey = journeys[id];
    if (!journey) {
      throw new Error(`Unknown SMS sync journey: ${id}`);
    }

    console.log(`\n=== SMS sync journey ${id} ===`);
    collapseSystemUi();
    await journey();
    collapseSystemUi();
    console.log(`SMS sync journey ${id} passed`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildBatchSmsSavedVerificationQueries,
  buildFixtureSmsSavedVerificationQueries,
  buildLocalParserSmsSavedVerificationQueries,
  buildSmsSyncProbeCleanupSql,
  getAuthBootstrapFlow,
  getDefaultJourneyIds,
  getMaestroFlowTimeoutMs,
  getSmsSyncFlowAttemptCount,
  getActiveUserFilter,
  isFixtureParserE2eMode,
  isLocalParserE2eMode,
  shouldResetSmsSyncAppStateBeforeRetry,
  shouldRetrySmsSyncFlowAttempt,
  shouldRetrySmsSyncFlowAfterTransportFailure,
  shouldRelaunchBeforeSmsSyncJourney,
  shouldRelaunchBetweenSmsSyncJourneys,
};
