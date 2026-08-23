const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createClient } = require("@supabase/supabase-js");
const {
  adb,
  appId,
  collapseSystemUi,
  dumpVisibleText,
  ensureE2eAppReady,
  forceStopApp,
  getMaestroDeviceArgs,
  isRetryableMaestroTransportFailure,
  reconnectAndroidDevice,
  resolveMaestroBin,
  seedIntroSeenFlagForE2e,
  startAppWithoutChangingPermissions,
  wait,
} = require("./e2e-preflight");
const { applyE2eAuthDeepLink } = require("./e2e-auth-deeplink");
const { getE2eSeedConfig, seedE2eData } = require("./e2e-seed");

const mobileRoot = join(__dirname, "..");
const flowDir = join("e2e", "maestro", "live-sms-detection");
const defaultMaestroFlowTimeoutMs = 10 * 60 * 1000;
const defaultMaestroTransportRetryAttempts = 4;
const liveSmsJourneyLaunchSettleMs = 3000;
const uiAuthBootstrapFlow = "../helpers/ci-auth-bootstrap.yaml";
const deeplinkAuthBootstrapFlow = "../helpers/ci-auth-deeplink-bootstrap.yaml";

const smsPermissions = [
  "android.permission.READ_SMS",
  "android.permission.RECEIVE_SMS",
];
const notificationPermission = "android.permission.POST_NOTIFICATIONS";
const actionProbeMarkers = [
  "CONFIRM ACTION MARKET",
  "DISCARD ACTION MARKET",
  "BACKGROUND CONFIRM MARKET",
  "CLOSED CONFIRM MARKET",
];
const releaseOnlyJourneyIds = new Set(["15"]);
const isReleaseRun = process.env.E2E_RELEASE_BUILD === "1";
const killedAppConfirmMarker = createKilledAppConfirmMarker(process.env);
process.env.MAESTRO_CLOSED_CONFIRM_MARKET = killedAppConfirmMarker;

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function getActiveUserFilter(env = process.env) {
  if (!env.E2E_USER_ID) {
    throw new Error("E2E_USER_ID is required for live SMS probe SQL.");
  }

  return `user_id = ${sqlString(env.E2E_USER_ID)}`;
}

function createKilledAppConfirmMarker(env = process.env) {
  const runId = env.E2E_PROBE_RUN_ID || `${Date.now()}`;
  return `CLOSED CONFIRM MARKET ${runId}`;
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

function setPermissionFlags(permission, flags) {
  adb(["shell", "pm", "set-permission-flags", appId, permission, ...flags], {
    allowFailure: true,
  });
}

function revokePermission(permission) {
  adb(["shell", "pm", "revoke", appId, permission], { allowFailure: true });
}

function grantPermission(permission) {
  clearPermissionFlags(permission);
  adb(["shell", "pm", "grant", appId, permission], { allowFailure: true });
}

function removeSmsRequestedPrefs() {
  adb(
    [
      "shell",
      "run-as",
      appId,
      "rm",
      "-f",
      "shared_prefs/sms_permission_state.xml",
    ],
    { allowFailure: true }
  );
}

function removeExpoPermissionAskedPrefs() {
  adb(
    [
      "shell",
      "run-as",
      appId,
      "rm",
      "-f",
      "shared_prefs/expo.modules.permissions.asked.xml",
    ],
    { allowFailure: true }
  );
}

function writeSmsRequestedPrefs() {
  const xml = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map>\n    <boolean name="requested_android.permission.READ_SMS" value="true" />\n    <boolean name="requested_android.permission.RECEIVE_SMS" value="true" />\n</map>\n`;
  adb(["shell", "run-as", appId, "mkdir", "shared_prefs"], {
    allowFailure: true,
  });
  adb(
    ["shell", "run-as", appId, "tee", "shared_prefs/sms_permission_state.xml"],
    {
      capture: true,
      input: xml,
    }
  );
}

function resetSmsPermissions() {
  for (const permission of smsPermissions) {
    revokePermission(permission);
    clearPermissionFlags(permission);
  }
  removeSmsRequestedPrefs();
}

function grantSmsPermissions() {
  for (const permission of smsPermissions) {
    grantPermission(permission);
  }
}

function blockSmsPermissions() {
  resetSmsPermissions();
  writeSmsRequestedPrefs();
  for (const permission of smsPermissions) {
    setPermissionFlags(permission, ["user-set", "user-fixed"]);
  }
}

function clearDeliveredNotifications(allowFailure = true) {
  adb(["shell", "cmd", "notification", "cancel-all"], { allowFailure });
}

function resetNotificationPermission() {
  revokePermission(notificationPermission);
  clearPermissionFlags(notificationPermission);
  removeExpoPermissionAskedPrefs();
}

function grantNotificationPermission() {
  grantPermission(notificationPermission);
}

function getMaestroFlowTimeoutMs(env = process.env) {
  const parsed = Number(env.E2E_MAESTRO_FLOW_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : defaultMaestroFlowTimeoutMs;
}

function getMaestroTransportRetryAttempts(env = process.env) {
  const parsed = Number(env.E2E_MAESTRO_TRANSPORT_RETRY_ATTEMPTS);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : defaultMaestroTransportRetryAttempts;
}

function getAuthBootstrapFlow(env = process.env) {
  return env.E2E_AUTH_DEEPLINK_BOOTSTRAP === "1"
    ? deeplinkAuthBootstrapFlow
    : uiAuthBootstrapFlow;
}

function reconnectMaestroTransport() {
  reconnectAndroidDevice();
}

function runMaestroFlowOnce(maestroBin, flow) {
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

  return {
    didTimeout:
      result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM",
    output: `${stdout}${stderr}${errorMessage}`,
    status: result.error ? 1 : (result.status ?? 1),
  };
}

async function runFlow(flow, prepareRetry, retryOnRecoverableFailure = false) {
  const maestroBin = resolveMaestroBin();
  if (!maestroBin) {
    throw new Error("Maestro was not found. Install it or set MAESTRO_BIN.");
  }

  const maxAttempts = retryOnRecoverableFailure
    ? getMaestroTransportRetryAttempts()
    : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runMaestroFlowOnce(maestroBin, flow);
    if (result.status === 0) {
      return;
    }

    const appProcessAlive = isAppProcessAlive();
    const isTransportFailure = isRetryableMaestroTransportFailure(
      result.output
    );
    if (
      retryOnRecoverableFailure &&
      !result.didTimeout &&
      shouldRetryLiveSmsFlowFailure(
        result.output,
        appProcessAlive,
        attempt,
        maxAttempts
      )
    ) {
      logInfo("liveSmsJourney.recoverableRetry", {
        flow,
        attempt,
        maxAttempts,
        reason: isTransportFailure ? "transport-unavailable" : "app-crashed",
      });
      if (isTransportFailure) {
        reconnectMaestroTransport();
      }
      await prepareRetry?.();
      continue;
    }

    throw new Error(`${maestroBin} test ${join(flowDir, flow)} failed`);
  }
}

async function runVerificationFlow(flow) {
  if (!shouldRetryLiveSmsVerificationFlow(flow)) {
    throw new Error(`Expected live SMS verification flow, received: ${flow}`);
  }

  await runFlow(flow, ensureE2eAppReady, true);
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
  await runFlow(getAuthBootstrapFlow(), undefined, true);
}

function getXmlAttribute(nodeText, attribute) {
  const pattern = new RegExp(`${attribute}="([^"]*)"`);
  return nodeText.match(pattern)?.[1] ?? "";
}

function parseUiNodes(uiXml) {
  return [...uiXml.matchAll(/<node\b[^>]*>/g)].map(([nodeText]) => ({
    text: getXmlAttribute(nodeText, "text"),
    contentDescription: getXmlAttribute(nodeText, "content-desc"),
    resourceId: getXmlAttribute(nodeText, "resource-id"),
    bounds: getXmlAttribute(nodeText, "bounds"),
  }));
}

function parseBoundsCenter(bounds) {
  const match = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!match) {
    throw new Error(`Unable to parse UI bounds: ${bounds}`);
  }

  const [, left, top, right, bottom] = match.map(Number);
  return {
    x: Math.round((left + right) / 2),
    y: Math.round((top + bottom) / 2),
  };
}

function parseBounds(bounds) {
  const match = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!match) {
    return null;
  }

  const [, left, top, right, bottom] = match.map(Number);
  return { left, top, right, bottom };
}

function getBoundsCenterY(bounds) {
  return Math.round((bounds.top + bounds.bottom) / 2);
}

function getNodeVisibleText(node) {
  return `${node.text} ${node.contentDescription}`;
}

function normalizeNotificationPatterns(patterns) {
  return Array.isArray(patterns) ? patterns : [patterns];
}

function getAppNotificationRecords(notificationDump, applicationId = appId) {
  return notificationDump
    .split(/(?=\s*NotificationRecord\()/)
    .filter((record) => record.includes(`pkg=${applicationId} `));
}

function classifyNotificationObservation(
  notificationDump,
  patterns,
  applicationId = appId,
  observationError
) {
  if (observationError) {
    return "observation-error";
  }

  const records = getAppNotificationRecords(notificationDump, applicationId);
  if (records.length === 0) {
    return "not-delivered";
  }

  const regexes = normalizeNotificationPatterns(patterns).map(
    (pattern) => new RegExp(pattern, "i")
  );
  return records.some((record) => regexes.every((regex) => regex.test(record)))
    ? "matched"
    : "unrelated-delivery";
}

function hasMatchingAppNotification(
  notificationDump,
  patterns,
  applicationId = appId
) {
  return (
    classifyNotificationObservation(
      notificationDump,
      patterns,
      applicationId
    ) === "matched"
  );
}

function readNotificationServiceState() {
  return adb(["shell", "dumpsys", "notification", "--noredact"], {
    allowFailure: false,
    capture: true,
  });
}

function findNotificationMatch(nodes, patterns) {
  const regexes = normalizeNotificationPatterns(patterns).map(
    (pattern) => new RegExp(pattern, "i")
  );

  for (const anchor of nodes) {
    if (!regexes[0].test(getNodeVisibleText(anchor))) {
      continue;
    }

    const anchorBounds = anchor.bounds ? parseBounds(anchor.bounds) : null;
    if (!anchorBounds) {
      continue;
    }

    const anchorCenterY = getBoundsCenterY(anchorBounds);
    const nearbyNodes = nodes.filter((node) => {
      const bounds = node.bounds ? parseBounds(node.bounds) : null;
      return (
        bounds !== null &&
        Math.abs(getBoundsCenterY(bounds) - anchorCenterY) <= 260
      );
    });

    const hasAllPatterns = regexes.every((regex) =>
      nearbyNodes.some((node) => regex.test(getNodeVisibleText(node)))
    );

    if (!hasAllPatterns) {
      continue;
    }

    const nearbyBounds = nearbyNodes
      .map((node) => (node.bounds ? parseBounds(node.bounds) : null))
      .filter(Boolean);

    return {
      anchor,
      top: Math.min(...nearbyBounds.map((bounds) => bounds.top)),
      bottom: Math.max(...nearbyBounds.map((bounds) => bounds.bottom)),
    };
  }

  return null;
}

function isNodeNearNotification(node, notificationMatch) {
  const bounds = node.bounds ? parseBounds(node.bounds) : null;
  if (!bounds) {
    return false;
  }

  const centerY = getBoundsCenterY(bounds);
  return (
    centerY >= notificationMatch.top - 40 &&
    centerY <= notificationMatch.bottom + 320
  );
}

function findExpandButtonForNotification(nodes, notificationMatch) {
  const matchingBounds = notificationMatch.anchor.bounds
    ? parseBounds(notificationMatch.anchor.bounds)
    : null;

  if (!matchingBounds) {
    return null;
  }

  const matchingCenterY = getBoundsCenterY(matchingBounds);
  return nodes.find((node) => {
    if (
      node.contentDescription !== "Expand" ||
      node.resourceId !== "android:id/expand_button"
    ) {
      return false;
    }

    const bounds = parseBounds(node.bounds);
    return (
      bounds !== null &&
      bounds.top <= matchingCenterY &&
      bounds.bottom >= matchingCenterY
    );
  });
}

function waitForNotificationText(patterns, timeoutMs = 60000) {
  const startedAt = Date.now();
  let lastNotificationDump = "";
  let notificationObservationError = "";

  while (Date.now() - startedAt < timeoutMs) {
    try {
      lastNotificationDump = readNotificationServiceState();
    } catch (error) {
      notificationObservationError =
        error instanceof Error ? error.message : String(error);
      break;
    }

    if (hasMatchingAppNotification(lastNotificationDump, patterns)) {
      return;
    }
    wait(1000);
  }

  const nativeDeliveryDiagnostics = adb(
    [
      "logcat",
      "-d",
      "-v",
      "brief",
      "-s",
      "SmsBroadcastReceiver:D",
      "SmsHeadlessTaskService:D",
      "ExpoNotifications:D",
      "ReactNativeJS:D",
      "*:S",
    ],
    { allowFailure: true, capture: true }
  ).trim();
  const observation = classifyNotificationObservation(
    lastNotificationDump,
    patterns,
    appId,
    notificationObservationError
  );
  const appNotificationCount =
    getAppNotificationRecords(lastNotificationDump).length;
  throw new Error(
    `Timed out waiting for notification text: ${normalizeNotificationPatterns(
      patterns
    ).join(
      ", "
    )}\nNotification observation: ${observation}\nNotification dump error: ${notificationObservationError || "(none)"}\nMonyvi notification records observed: ${appNotificationCount}\nNative SMS/notification diagnostics:\n${
      nativeDeliveryDiagnostics ||
      "(no receiver, headless-service, or notification logs)"
    }`
  );
}

function tapNotificationAction(notificationTextPatterns, actionText) {
  const startedAt = Date.now();
  let hasExpandedNotification = false;

  while (Date.now() - startedAt < 60000) {
    adb(["shell", "cmd", "statusbar", "expand-notifications"], {
      allowFailure: true,
    });
    wait(1000);

    const uiXml = dumpVisibleText();
    const nodes = parseUiNodes(uiXml);
    const notificationMatch = findNotificationMatch(
      nodes,
      notificationTextPatterns
    );

    if (!notificationMatch) {
      collapseSystemUi();
      wait(1000);
      continue;
    }

    const actionNode = nodes.find(
      (node) =>
        (node.text === actionText || node.contentDescription === actionText) &&
        isNodeNearNotification(node, notificationMatch)
    );

    if (actionNode?.bounds) {
      const { x, y } = parseBoundsCenter(actionNode.bounds);
      adb(["shell", "input", "tap", String(x), String(y)]);
      waitForNotificationDismissed(notificationTextPatterns);
      collapseSystemUi();
      return;
    }

    if (!hasExpandedNotification) {
      const expandNode = findExpandButtonForNotification(
        nodes,
        notificationMatch
      );
      if (expandNode?.bounds) {
        const { x, y } = parseBoundsCenter(expandNode.bounds);
        adb(["shell", "input", "tap", String(x), String(y)]);
        hasExpandedNotification = true;
        wait(1500);
        continue;
      }
    }

    collapseSystemUi();
    wait(1000);
  }

  throw new Error(
    `Timed out waiting for notification action "${actionText}" on "${normalizeNotificationPatterns(
      notificationTextPatterns
    ).join(", ")}"`
  );
}

function waitForNotificationDismissed(patterns, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!hasMatchingAppNotification(readNotificationServiceState(), patterns)) {
      return;
    }
    wait(1000);
  }

  throw new Error(
    `Notification was not dismissed: ${normalizeNotificationPatterns(
      patterns
    ).join(", ")}`
  );
}

function getAppPid() {
  return adb(["shell", "pidof", "-s", appId], {
    allowFailure: true,
    capture: true,
  }).trim();
}

function waitForAppProcessStopped(timeoutMs = 10000) {
  if (hasAppProcessStoppedWithin(timeoutMs)) {
    return;
  }

  throw new Error("Timed out waiting for the Monyvi app process to stop.");
}

function killCachedAppProcess(timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (getAppPid() === "") {
      return;
    }

    adb(["shell", "am", "kill", appId], { allowFailure: true });
    wait(1500);
  }

  waitForAppProcessStopped(1);
}

function hasAppProcessStoppedWithin(timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (getAppPid() === "") {
      return true;
    }
    wait(500);
  }

  return false;
}

function getMonyviRecentTaskId() {
  const output = adb(["shell", "dumpsys", "activity", "recents"], {
    capture: true,
    allowFailure: true,
  });
  const taskLine = output
    .split(/\r?\n/)
    .find((line) => line.includes("Task{") && line.includes(appId));

  return taskLine?.match(/Task\{[^}]* #(\d+)/)?.[1] ?? null;
}

function removeMonyviRecentTask() {
  const taskId = getMonyviRecentTaskId();
  if (!taskId) {
    return;
  }

  adb(["shell", "am", "stack", "remove", taskId], { allowFailure: true });
  wait(1000);
}

function findRecentsAppCard(timeoutMs = 10000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const uiXml = dumpVisibleText();
    const nodes = parseUiNodes(uiXml);
    const snapshotNode = nodes.find(
      (node) =>
        node.resourceId === "com.google.android.apps.nexuslauncher:id/snapshot"
    );

    if (snapshotNode?.bounds) {
      const bounds = snapshotNode.bounds
        ? parseBounds(snapshotNode.bounds)
        : null;
      if (bounds) {
        return bounds;
      }
    }
    wait(500);
  }

  return null;
}

function waitForRecentsAppCard(timeoutMs = 10000) {
  const bounds = findRecentsAppCard(timeoutMs);
  if (bounds) {
    return bounds;
  }

  throw new Error("Timed out waiting for the Monyvi card in Android recents.");
}

function swipeRecentsCardAway(cardBounds) {
  const centerX = Math.round((cardBounds.left + cardBounds.right) / 2);
  const cardHeight = cardBounds.bottom - cardBounds.top;
  const startY = Math.round(cardBounds.top + cardHeight * 0.66);
  const endY = Math.max(1, Math.round(cardBounds.top - cardHeight * 0.08));

  adb([
    "shell",
    "input",
    "swipe",
    String(centerX),
    String(startY),
    String(centerX),
    String(endY),
    "300",
  ]);
}

function buildLiveSmsActionProbeCleanupSql() {
  const activeUserFilter = getActiveUserFilter();
  const transactionMarkerFilters = actionProbeMarkers
    .map(
      (marker) => `counterparty like '%${marker}%' or note like '%${marker}%'`
    )
    .join(" or ");
  const transferMarkerFilters = actionProbeMarkers
    .map((marker) => `notes like '%${marker}%'`)
    .join(" or ");
  const sql = [
    `delete from transactions where (${transactionMarkerFilters}) and ${activeUserFilter};`,
    `delete from transfers where (${transferMarkerFilters}) and ${activeUserFilter};`,
  ].join(" ");

  return sql;
}

function shouldSkipRunAsProbeCleanup(env = process.env) {
  return env.E2E_RELEASE_BUILD === "1";
}

function clearLiveSmsActionProbeRows() {
  if (shouldSkipRunAsProbeCleanup()) {
    logInfo("liveSmsProbeCleanup.skipped", {
      reason: "run-as-unavailable-for-release-apk",
    });
    return;
  }

  const sql = buildLiveSmsActionProbeCleanupSql();

  adb(["shell", "run-as", appId, "sqlite3", "watermelon.db"], {
    capture: true,
    input: sql,
  });
}

function sendEmulatorSms(sender, body) {
  adb(["emu", "sms", "send", sender, body]);
}

function backgroundApp() {
  collapseSystemUi();
  adb(["shell", "input", "keyevent", "HOME"]);
  wait(1000);
}

function killBackgroundAppProcess() {
  backgroundApp();
  adb(["shell", "input", "keyevent", "KEYCODE_APP_SWITCH"]);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const cardBounds = findRecentsAppCard(5000);
    if (!cardBounds) {
      break;
    }

    wait(700);
    swipeRecentsCardAway(cardBounds);

    if (hasAppProcessStoppedWithin(5000)) {
      collapseSystemUi();
      return;
    }

    if (!getMonyviRecentTaskId()) {
      break;
    }

    adb(["shell", "input", "keyevent", "KEYCODE_APP_SWITCH"], {
      allowFailure: true,
    });
  }

  removeMonyviRecentTask();
  killCachedAppProcess();
  collapseSystemUi();
}

function sendBackgroundSms() {
  backgroundApp();
  sendEmulatorSms(
    "QNB",
    "Purchase EGP 63.21 at BACKGROUND LIVE SMS TEST using card ending 1234"
  );
  waitForNotificationText([
    "Expense Detected",
    "BACKGROUND LIVE SMS TEST",
    "63\\.21",
  ]);
}

async function sendForegroundSms() {
  sendEmulatorSms(
    "QNB",
    "Purchase EGP 64.32 at FOREGROUND LIVE SMS TEST using card ending 5566"
  );
  wait(1000);
  await runVerificationFlow(
    "live-sms-journey-16-foreground-real-sms-verification.yaml"
  );
}

function sendBackgroundConfirmSms() {
  backgroundApp();
  sendEmulatorSms(
    "QNB",
    "Purchase EGP 71.45 at BACKGROUND CONFIRM MARKET using card ending 1234"
  );
  const notificationPatterns = [
    "Expense Detected",
    "BACKGROUND CONFIRM MARKET",
    "71\\.45",
  ];
  waitForNotificationText(notificationPatterns);
  tapNotificationAction(notificationPatterns, "✓ Confirm");
}

function sendKilledAppConfirmSms() {
  killBackgroundAppProcess();
  sendEmulatorSms(
    "QNB",
    `Purchase EGP 72.56 at ${killedAppConfirmMarker} using card ending 1234`
  );
  const notificationPatterns = [
    "Expense Detected",
    killedAppConfirmMarker,
    "72\\.56",
  ];
  waitForNotificationText(notificationPatterns);
  tapNotificationAction(notificationPatterns, "✓ Confirm");
}

const journeys = {
  "01": {
    flow: "live-sms-journey-01-first-time-enable.yaml",
    prepare: () => {
      resetSmsPermissions();
      resetNotificationPermission();
      collapseSystemUi();
    },
  },
  "02": {
    flow: "live-sms-journey-02-sms-sync-then-live-detection.yaml",
    prepare: () => {
      resetSmsPermissions();
      resetNotificationPermission();
      collapseSystemUi();
    },
  },
  "03": {
    flow: "live-sms-journey-03-sms-deny-then-recover.yaml",
    prepare: () => {
      resetSmsPermissions();
      grantNotificationPermission();
      collapseSystemUi();
    },
  },
  "04": {
    flow: "live-sms-journey-04-notification-deny-then-recover.yaml",
    prepare: () => {
      grantSmsPermissions();
      resetNotificationPermission();
      collapseSystemUi();
    },
  },
  "05": {
    flow: "live-sms-journey-05-blocked-permission-open-settings.yaml",
    prepare: () => {
      blockSmsPermissions();
      grantNotificationPermission();
      collapseSystemUi();
    },
  },
  "06": {
    flow: "live-sms-journey-06-foreground-detects-sms.yaml",
    prepare: () => {
      grantSmsPermissions();
      grantNotificationPermission();
      collapseSystemUi();
    },
  },
  "07": {
    flow: "live-sms-journey-07-background-real-sms.yaml",
    prepare: () => {
      grantSmsPermissions();
      grantNotificationPermission();
      collapseSystemUi();
    },
    after: sendBackgroundSms,
  },
  "08": {
    flow: "live-sms-journey-08-disable-stops-processing.yaml",
    prepare: () => {
      grantSmsPermissions();
      grantNotificationPermission();
      collapseSystemUi();
    },
  },
  "09": {
    flow: "live-sms-journey-09-confirm-notification-action.yaml",
    prepare: () => {
      grantSmsPermissions();
      grantNotificationPermission();
      clearLiveSmsActionProbeRows();
      collapseSystemUi();
    },
    after: async () => {
      tapNotificationAction(
        ["Expense Detected", "CONFIRM ACTION MARKET", "91\\.23"],
        "✓ Confirm"
      );
      await ensureE2eAppReady();
      await runVerificationFlow(
        "live-sms-journey-09-confirm-verification.yaml"
      );
    },
  },
  10: {
    flow: "live-sms-journey-10-discard-notification-action.yaml",
    prepare: () => {
      grantSmsPermissions();
      grantNotificationPermission();
      clearLiveSmsActionProbeRows();
      collapseSystemUi();
    },
    after: async () => {
      tapNotificationAction(
        ["Expense Detected", "DISCARD ACTION MARKET", "82\\.34"],
        "✗ Discard"
      );
      await ensureE2eAppReady();
      await runVerificationFlow(
        "live-sms-journey-10-discard-verification.yaml"
      );
    },
  },
  11: {
    flow: "live-sms-journey-11-duplicate-sms-protection.yaml",
    prepare: () => {
      grantSmsPermissions();
      grantNotificationPermission();
      collapseSystemUi();
    },
    after: async () => {
      collapseSystemUi();
      await runFlow("live-sms-journey-11-duplicate-sms-verification.yaml");
    },
  },
  12: {
    flow: "live-sms-journey-12-auto-confirm.yaml",
    prepare: () => {
      grantSmsPermissions();
      grantNotificationPermission();
      clearDeliveredNotifications(false);
      collapseSystemUi();
    },
    after: () => {
      waitForNotificationText(["Transaction created", "NBE", "75"]);
      collapseSystemUi();
    },
  },
  13: {
    flow: "live-sms-journey-13-enable-before-revoke.yaml",
    prepare: () => {
      grantSmsPermissions();
      grantNotificationPermission();
      collapseSystemUi();
    },
    after: async () => {
      revokePermission(notificationPermission);
      forceStopApp();
      await ensureE2eAppReady();
      await runVerificationFlow(
        "live-sms-journey-13-revoked-permission-verification.yaml"
      );
    },
  },
  14: {
    flow: "live-sms-journey-14-background-confirm-real-sms.yaml",
    prepare: () => {
      grantSmsPermissions();
      grantNotificationPermission();
      clearLiveSmsActionProbeRows();
      collapseSystemUi();
    },
    after: async () => {
      sendBackgroundConfirmSms();
      await ensureE2eAppReady();
      await runVerificationFlow(
        "live-sms-journey-14-background-confirm-verification.yaml"
      );
    },
  },
  15: {
    flow: "live-sms-journey-15-killed-app-confirm-real-sms.yaml",
    prepare: () => {
      grantSmsPermissions();
      grantNotificationPermission();
      clearLiveSmsActionProbeRows();
      collapseSystemUi();
    },
    after: async () => {
      sendKilledAppConfirmSms();
      await ensureE2eAppReady();
      await runVerificationFlow(
        "live-sms-journey-15-killed-app-confirm-verification.yaml"
      );
    },
  },
  16: {
    flow: "live-sms-journey-16-foreground-real-sms.yaml",
    prepare: () => {
      grantSmsPermissions();
      grantNotificationPermission();
      collapseSystemUi();
    },
    after: sendForegroundSms,
  },
};

function compareJourneyIds(left, right) {
  return Number(left) - Number(right);
}

function getDefaultJourneyIds() {
  if (isReleaseRun) {
    return [...releaseOnlyJourneyIds].sort(compareJourneyIds);
  }

  return Object.keys(journeys)
    .filter((id) => !releaseOnlyJourneyIds.has(id))
    .sort(compareJourneyIds);
}

function normalizeJourneyId(id) {
  return id.padStart(2, "0");
}

function shouldPrepareLiveSmsFlowBeforeRetry(flow) {
  return Object.values(journeys).some((journey) => journey.flow === flow);
}

function shouldResetLiveSmsSideEffectsBeforeRetry(flow, env = process.env) {
  return (
    env.E2E_SUPABASE_MODE === "local" &&
    env.E2E_SKIP_AUTH_BOOTSTRAP !== "1" &&
    shouldPrepareLiveSmsFlowBeforeRetry(flow)
  );
}

function shouldRetryLiveSmsVerificationFlow(flow) {
  return flow.endsWith("-verification.yaml");
}

function isAppProcessAlive() {
  return Boolean(
    adb(["shell", "pidof", appId], {
      allowFailure: true,
      capture: true,
    }).trim()
  );
}

function shouldRetryLiveSmsFlowFailure(
  output,
  appProcessAlive,
  attempt,
  maxAttempts
) {
  if (isRetryableMaestroTransportFailure(output)) {
    return attempt < maxAttempts;
  }

  return !appProcessAlive && attempt === 1 && attempt < maxAttempts;
}

function logInfo(event, fields) {
  process.stdout.write(
    `${JSON.stringify({ level: "info", event, ...fields })}\n`
  );
}

function prepareLiveSmsJourneyStart(
  dependencies = {
    stopApp: forceStopApp,
    startApp: startAppWithoutChangingPermissions,
    waitForLaunch: wait,
  }
) {
  dependencies.stopApp();
  dependencies.startApp();
  dependencies.waitForLaunch(liveSmsJourneyLaunchSettleMs);
}

async function prepareLiveSmsJourneyRetry(journey) {
  await bootstrapCleanAuthenticatedSession();
  clearDeliveredNotifications();
  journey.prepare();
  prepareLiveSmsJourneyStart();
}

async function main() {
  applyLocalE2eDefaults();

  const requested = process.argv.slice(2);
  const selected =
    requested.length > 0
      ? requested.map(normalizeJourneyId)
      : getDefaultJourneyIds();

  await bootstrapCleanAuthenticatedSession();

  for (const id of selected) {
    const journey = journeys[id];
    if (!journey) {
      throw new Error(`Unknown live SMS journey: ${id}`);
    }

    logInfo("liveSmsJourney.started", { id, flow: journey.flow });
    journey.prepare();
    prepareLiveSmsJourneyStart();
    const canResetSideEffects = shouldResetLiveSmsSideEffectsBeforeRetry(
      journey.flow
    );
    await runFlow(
      journey.flow,
      canResetSideEffects
        ? () => prepareLiveSmsJourneyRetry(journey)
        : undefined,
      canResetSideEffects
    );
    await journey.after?.();
    collapseSystemUi();
    logInfo("liveSmsJourney.passed", { id, flow: journey.flow });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildLiveSmsActionProbeCleanupSql,
  createKilledAppConfirmMarker,
  getAuthBootstrapFlow,
  getMaestroFlowTimeoutMs,
  getMaestroTransportRetryAttempts,
  classifyNotificationObservation,
  hasMatchingAppNotification,
  getActiveUserFilter,
  isRetryableMaestroTransportFailure,
  prepareLiveSmsJourneyStart,
  shouldPrepareLiveSmsFlowBeforeRetry,
  shouldRetryLiveSmsFlowFailure,
  shouldRetryLiveSmsVerificationFlow,
  shouldResetLiveSmsSideEffectsBeforeRetry,
  shouldSkipRunAsProbeCleanup,
};
