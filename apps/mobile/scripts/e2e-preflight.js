const { existsSync } = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const { delimiter, join } = require("node:path");
const { spawnSync } = require("node:child_process");

const appId = process.env.E2E_APP_ID || "com.monyvi.app";
const deviceId = process.env.ANDROID_SERIAL || "emulator-5554";
const { hostMetroUrl, metroUrl } = resolveMetroUrls(process.env);
const isReleaseBuild = process.env.E2E_RELEASE_BUILD === "1";
const preflightLaunchAttempts = parsePositiveInt(
  process.env.E2E_PREFLIGHT_LAUNCH_ATTEMPTS,
  2
);
const preflightAttemptTimeoutMs = parsePositiveInt(
  process.env.E2E_PREFLIGHT_ATTEMPT_TIMEOUT_MS,
  300000
);
const androidDeviceReconnectTimeoutMs = parsePositiveInt(
  process.env.E2E_ADB_RECONNECT_TIMEOUT_MS,
  180000
);
const devClientUrl = buildDevClientUrl(metroUrl);
const devMenuPreferencesPath =
  "shared_prefs/expo.modules.devmenu.sharedpreferences.xml";
const privateShellMarkers = [
  "fab-button",
  "search-input",
  "sms-sync-button",
  "live-sms-detection-switch",
  "sms-simulator-log-count",
  "transaction-card-",
  "card-amount-",
];
// Arabic fallback strings are escaped to keep this script ASCII-only.
const arabicPrivateTextFallbackMarkers = {
  settings: "\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a",
  accounts: "\u0627\u0644\u062d\u0633\u0627\u0628\u0627\u062a",
  transactions: "\u0627\u0644\u0645\u0639\u0627\u0645\u0644\u0627\u062a",
};
const arabicAuthReadyMarkers = {
  welcomeToMonyvi:
    "\u0645\u0631\u062d\u0628\u064b\u0627 \u0628\u0643 \u0641\u064a Monyvi",
  emailAddress:
    "\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a",
  signIn: "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644",
};
const privateTextFallbackMarkers = [
  "Home",
  "Accounts",
  "Transactions",
  "Metals",
  "Settings",
  "Good Evening",
  "Good Afternoon",
  "Good Morning",
  ...Object.values(arabicPrivateTextFallbackMarkers),
];
const authReadyMarkers = [
  "emailAddress",
  "Welcome to Monyvi",
  "Email address",
  "Sign In",
  "Skip",
  "Get Started",
  "Auto-Track Transactions",
  "Track with your voice.",
  "Your bank texts. We listen.",
  "Live rates. Real gold.",
  ...Object.values(arabicAuthReadyMarkers),
];

function appendAndroidPlatform(url) {
  const parsedUrl = new URL(url);
  parsedUrl.searchParams.set("platform", "android");
  return parsedUrl.toString();
}

function buildDevClientUrl(url) {
  return `monyvi://expo-development-client/?url=${encodeURIComponent(url)}`;
}

function resolveMetroUrls(env = process.env) {
  const hostUrl =
    env.E2E_HOST_METRO_URL || env.E2E_METRO_URL || "http://127.0.0.1:8081";
  const defaultDeviceUrl = env.CI === "true" ? "http://10.0.2.2:8081" : hostUrl;
  const deviceUrl =
    env.E2E_DEVICE_METRO_URL || env.E2E_METRO_URL || defaultDeviceUrl;

  return {
    hostMetroUrl: hostUrl,
    metroUrl: appendAndroidPlatform(deviceUrl),
  };
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function wait(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function getHttpClientNameForUrl(url) {
  return new URL(url).protocol === "https:" ? "https" : "http";
}

function getHttpClientForUrl(url) {
  return getHttpClientNameForUrl(url) === "https" ? https : http;
}

function findOnPath(command) {
  const pathValue = process.env.PATH || "";
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];

  for (const directory of pathValue.split(delimiter)) {
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension.toLowerCase()}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function resolveMaestroBin() {
  if (process.env.MAESTRO_BIN) {
    return process.env.MAESTRO_BIN;
  }

  const home = process.env.USERPROFILE || process.env.HOME;
  if (home) {
    const localInstall =
      process.platform === "win32"
        ? join(home, "maestro", "bin", "maestro.bat")
        : join(home, ".maestro", "bin", "maestro");

    if (existsSync(localInstall)) {
      return localInstall;
    }
  }

  return findOnPath("maestro");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    cwd: options.cwd,
    input: options.input,
    shell: process.platform === "win32" && command.endsWith(".bat"),
    stdio: options.capture ? "pipe" : "inherit",
    timeout: options.timeout,
  });

  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture
      ? `\n${result.stdout || ""}${result.stderr || ""}`
      : "";
    const cause = result.error ? `: ${result.error.message}` : "";
    throw new Error(`${command} ${args.join(" ")} failed${cause}${detail}`);
  }

  return `${result.stdout || ""}${result.stderr || ""}`;
}

function waitForHttpOk(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    function attempt() {
      const request = getHttpClientForUrl(url).get(url, (response) => {
        response.resume();
        if (
          response.statusCode &&
          response.statusCode >= 200 &&
          response.statusCode < 300
        ) {
          resolve();
          return;
        }
        retry();
      });

      request.on("error", retry);
      request.setTimeout(30000, () => {
        request.destroy();
        retry();
      });
    }

    function retry() {
      if (Date.now() - startedAt >= timeoutMs) {
        reject(
          new Error(
            `Metro is not reachable at ${url}. Start it with npm run start:android.`
          )
        );
        return;
      }
      setTimeout(attempt, 1000);
    }

    attempt();
  });
}

function adb(args, options = {}) {
  return run("adb", ["-s", deviceId, ...args], {
    timeout: 30000,
    ...options,
  });
}

function isRetryableMaestroTransportFailure(output) {
  return /StatusRuntimeException:\s*UNAVAILABLE(?::\s*End of stream or IOException)?|host:transport:.*device offline|device offline|view[-_\s]?hierarchy.*(?:UNAVAILABLE|IOException|timed out|timeout)|(?:timed out|timeout).*view[-_\s]?hierarchy/i.test(
    output
  );
}

function reconnectAndroidDevice() {
  run("adb", ["kill-server"], { allowFailure: true, timeout: 30000 });
  run("adb", ["start-server"], { timeout: 30000 });
  adb(["wait-for-device"], { timeout: androidDeviceReconnectTimeoutMs });

  if (!isReleaseBuild) {
    adb(["reverse", "tcp:8081", "tcp:8081"], { allowFailure: true });
  }
}

function stabilizeAndroidDevice() {
  adb(["wait-for-device"], { timeout: 60000 });
  collapseSystemUi();

  if (!isReleaseBuild) {
    adb(["reverse", "tcp:8081", "tcp:8081"], { allowFailure: true });
  }
}

function buildDevMenuPreferencesXml() {
  return [
    "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>",
    "<map>",
    '    <boolean name="isOnboardingFinished" value="true" />',
    '    <boolean name="showFab" value="false" />',
    "</map>",
    "",
  ].join("\n");
}

function disableExpoDevMenuFabForE2e() {
  if (isReleaseBuild) return;

  adb(["shell", "run-as", appId, "mkdir", "-p", "shared_prefs"], {
    capture: true,
  });
  adb(["shell", "run-as", appId, "tee", devMenuPreferencesPath], {
    capture: true,
    input: buildDevMenuPreferencesXml(),
  });
}

function collapseSystemUi() {
  adb(["shell", "cmd", "statusbar", "collapse"], { allowFailure: true });
}

function forceStopApp() {
  collapseSystemUi();
  adb(["shell", "am", "force-stop", appId], { allowFailure: true });
}

function startAppWithoutChangingPermissions() {
  if (isReleaseBuild) {
    adb([
      "shell",
      "monkey",
      "-p",
      appId,
      "-c",
      "android.intent.category.LAUNCHER",
      "1",
    ]);
    return;
  }

  adb(["reverse", "tcp:8081", "tcp:8081"]);
  disableExpoDevMenuFabForE2e();
  adb([
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    devClientUrl,
    appId,
  ]);
}

function getCurrentFocus() {
  return adb(["shell", "dumpsys", "window"], {
    capture: true,
    allowFailure: true,
  });
}

function dumpVisibleText() {
  const windowDumpPath = "/sdcard/window.xml";
  adb(["shell", "rm", "-f", windowDumpPath], {
    capture: true,
    allowFailure: true,
  });
  const dumpOutput = adb(["shell", "uiautomator", "dump", windowDumpPath], {
    capture: true,
    allowFailure: true,
  });

  if (!didDumpUiHierarchy(dumpOutput)) {
    return "";
  }

  return adb(["exec-out", "cat", windowDumpPath], {
    capture: true,
    allowFailure: true,
  });
}

function didDumpUiHierarchy(dumpOutput) {
  return (
    dumpOutput.includes("UI hierarchy dumped") ||
    dumpOutput.includes("UI hierchary dumped")
  );
}

function tapByVisibleLabel(uiXml, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = uiXml.match(
    new RegExp(
      `(?:text|content-desc)="${escapedLabel}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`
    )
  );

  if (!match) {
    return false;
  }

  const [, left, top, right, bottom] = match.map(Number);
  const x = Math.round((left + right) / 2);
  const y = Math.round((top + bottom) / 2);
  adb(["shell", "input", "tap", String(x), String(y)], {
    allowFailure: true,
  });
  return true;
}

function tapDevelopmentServerIfVisible(uiXml) {
  if (!visibleTextShowsWrongShell(uiXml)) {
    return false;
  }

  if (tapByVisibleLabel(uiXml, metroUrl)) {
    wait(2000);
    return true;
  }

  const normalizedMetroUrl = metroUrl.replace(/\/\?/, "?");
  if (tapByVisibleLabel(uiXml, normalizedMetroUrl)) {
    wait(2000);
    return true;
  }

  const localhostMetroUrl = metroUrl.replace("10.0.2.2", "127.0.0.1");
  if (tapByVisibleLabel(uiXml, localhostMetroUrl)) {
    wait(2000);
    return true;
  }

  const emulatorMetroUrl = metroUrl.replace("127.0.0.1", "10.0.2.2");
  if (tapByVisibleLabel(uiXml, emulatorMetroUrl)) {
    wait(2000);
    return true;
  }

  const metroUrlWithoutPlatform = new URL(metroUrl);
  metroUrlWithoutPlatform.searchParams.delete("platform");
  const baseMetroUrl = metroUrlWithoutPlatform.toString().replace(/\/$/, "");
  if (tapByVisibleLabel(uiXml, baseMetroUrl)) {
    wait(2000);
    return true;
  }

  const baseEmulatorMetroUrl = baseMetroUrl.replace("127.0.0.1", "10.0.2.2");
  if (tapByVisibleLabel(uiXml, baseEmulatorMetroUrl)) {
    wait(2000);
    return true;
  }

  return false;
}

function dismissDevMenuIfVisible(uiXml) {
  if (uiXml.includes("This is the developer menu")) {
    tapByVisibleLabel(uiXml, "Continue");
    wait(2000);
    return true;
  }

  if (uiXml.includes("Connected to:") && uiXml.includes("Reload")) {
    adb(["shell", "input", "keyevent", "4"], { allowFailure: true });
    wait(2000);
    return true;
  }

  return false;
}

function dismissDevMenuIfFocused(currentFocus) {
  if (!currentFocusShowsDevMenu(currentFocus)) {
    return false;
  }

  adb(["shell", "input", "keyevent", "4"], { allowFailure: true });
  wait(2000);
  return true;
}

function waitThroughAnrDialogIfVisible(uiXml, currentFocus, waitAttempts) {
  if (!uiXml.includes("isn't responding")) {
    return false;
  }

  const isMonyviAnr = uiXml.includes("Monyvi isn't responding");
  const isLauncherAnr = currentFocusShowsLauncher(currentFocus);
  if (isMonyviAnr && waitAttempts >= 3) {
    throw new Error("Monyvi showed the Android ANR dialog repeatedly.");
  }

  if (isLauncherAnr) {
    if (!tapByVisibleLabel(uiXml, "Close app")) {
      tapByVisibleLabel(uiXml, "Wait");
    }
    startAppWithoutChangingPermissions();
    wait(5000);
    return true;
  }

  tapByVisibleLabel(uiXml, "Wait");
  wait(5000);
  return true;
}

function restoreAppFromLauncherIfVisible(uiXml, currentFocus, restoreAttempts) {
  if (
    !uiXml.includes("com.google.android.apps.nexuslauncher") &&
    !currentFocusShowsLauncher(currentFocus)
  ) {
    return false;
  }

  if (restoreAttempts >= 3) {
    throw new Error("Monyvi kept returning to the Android launcher.");
  }

  startAppWithoutChangingPermissions();
  wait(3000);
  return true;
}

function shouldRestoreFromDevLauncher(uiXml, currentFocus) {
  return (
    currentFocus.includes("expo.modules.devlauncher.launcher") &&
    visibleTextShowsWrongShell(uiXml)
  );
}

function restoreAppFromDevLauncherIfFocused(
  uiXml,
  currentFocus,
  restoreAttempts
) {
  if (!shouldRestoreFromDevLauncher(uiXml, currentFocus)) {
    return false;
  }

  if (restoreAttempts >= 3) {
    throw new Error("Monyvi stayed in the Expo Dev Launcher.");
  }

  startAppWithoutChangingPermissions();
  wait(3000);
  return true;
}

function isAppReady(uiXml) {
  if (visibleTextShowsWrongShell(uiXml) || visibleTextShowsDevMenu(uiXml)) {
    return false;
  }

  const isSettingsReady =
    uiXml.includes("sms-sync-button") ||
    uiXml.includes("live-sms-detection-switch") ||
    (uiXml.includes("LANGUAGE") &&
      uiXml.includes("SMS SYNC") &&
      uiXml.includes("LIVE SMS DETECTION"));
  const isPrivateShellReady =
    privateShellMarkers.some((marker) => uiXml.includes(marker)) ||
    (uiXml.includes("Open menu") &&
      privateTextFallbackMarkers.some((marker) => uiXml.includes(marker)));
  const isAuthReady = authReadyMarkers.some((marker) => uiXml.includes(marker));

  return isSettingsReady || isPrivateShellReady || isAuthReady;
}

function isNativeRootMounted(uiXml) {
  return (
    uiXml.includes('package="com.monyvi.app"') &&
    (uiXml.includes("androidx.compose.ui.platform.ComposeView") ||
      uiXml.includes("android.view.View"))
  );
}

function assertNotWrongShell(currentFocus) {
  if (currentFocus.includes("host.exp.exponent")) {
    throw new Error(
      "E2E preflight opened Expo Go instead of the Monyvi dev client."
    );
  }
}

function waitForProductUi(timeoutMs = 240000) {
  const startedAt = Date.now();
  let lastUiXml = "";
  let lastFocus = "";
  let hasSeenNativeRoot = false;
  let anrWaitAttempts = 0;
  let launcherRestoreAttempts = 0;
  let devLauncherRestoreAttempts = 0;

  while (Date.now() - startedAt < timeoutMs) {
    collapseSystemUi();
    wait(1000);
    lastFocus = getCurrentFocus();
    lastUiXml = dumpVisibleText();

    assertNotWrongShell(lastFocus);

    if (dismissDevMenuIfVisible(lastUiXml)) {
      continue;
    }

    if (
      restoreAppFromDevLauncherIfFocused(
        lastUiXml,
        lastFocus,
        devLauncherRestoreAttempts
      )
    ) {
      devLauncherRestoreAttempts += 1;
      continue;
    }

    if (waitThroughAnrDialogIfVisible(lastUiXml, lastFocus, anrWaitAttempts)) {
      if (lastUiXml.includes("Monyvi isn't responding")) {
        anrWaitAttempts += 1;
      }
      continue;
    }

    if (
      restoreAppFromLauncherIfVisible(
        lastUiXml,
        lastFocus,
        launcherRestoreAttempts
      )
    ) {
      launcherRestoreAttempts += 1;
      continue;
    }

    if (dismissDevMenuIfFocused(lastFocus)) {
      continue;
    }

    if (tapDevelopmentServerIfVisible(lastUiXml)) {
      continue;
    }

    if (lastFocus.includes(appId) && isAppReady(lastUiXml)) {
      wait(3000);
      const finalFocus = getCurrentFocus();
      const finalUiXml = dumpVisibleText();
      if (
        finalFocus.includes(appId) &&
        !currentFocusShowsDevMenu(finalFocus) &&
        isAppReady(finalUiXml)
      ) {
        return;
      }
    }

    if (lastFocus.includes(appId) && isNativeRootMounted(lastUiXml)) {
      hasSeenNativeRoot = true;
    }

    wait(2000);
  }

  const isAccountLoading = lastUiXml.includes("account-loading-screen");
  const isDevLauncher =
    currentFocusShowsWrongShell(lastFocus) ||
    visibleTextShowsWrongShell(lastUiXml);
  const hint = isDevLauncher
    ? `The app stayed in the Expo Dev Launcher. Metro URL: ${metroUrl}`
    : isAccountLoading
      ? "The app stayed on Loading your account. Check auth/profile startup state and Metro logs."
      : hasSeenNativeRoot
        ? "The native app root mounted, but no recognized Monyvi screen became visible. Check Metro and React logs for bundle or render errors."
        : "The app did not reach a recognized Monyvi screen.";

  throw new Error(`E2E preflight failed. ${hint}\n${lastFocus}`);
}

function currentFocusShowsWrongShell(currentFocus) {
  const currentWindowState = withoutLastAnrSection(currentFocus);
  return (
    currentWindowState.includes("host.exp.exponent") ||
    currentWindowState.includes("DevLauncherActivity")
  );
}

function currentFocusShowsDevMenu(currentFocus) {
  const currentWindowState = withoutLastAnrSection(currentFocus);
  return /(?:mCurrentFocus|currentFocus)=Window\{[^}]*\s(?:u\d+\s)?com\.monyvi\.app\/expo\.modules\.devmenu\.DevMenuActivity/.test(
    currentWindowState
  );
}

function currentFocusShowsLauncher(currentFocus) {
  const currentWindowState = withoutLastAnrSection(currentFocus);
  return /(?:mCurrentFocus|currentFocus)=Window\{[^}]*com\.google\.android\.apps\.nexuslauncher|(?:mFocusedApp|focusedApp)=ActivityRecord\{[^}]*com\.google\.android\.apps\.nexuslauncher/.test(
    currentWindowState
  );
}

function withoutLastAnrSection(currentFocus) {
  const lastAnrIndex = currentFocus.indexOf("WINDOW MANAGER LAST ANR");
  if (lastAnrIndex === -1) {
    return currentFocus;
  }

  const followingSectionMarkers = [
    "WINDOW MANAGER POLICY STATE",
    "WINDOW MANAGER WINDOWS",
    "WINDOW MANAGER ANIMATOR STATE",
  ]
    .map((marker) => currentFocus.indexOf(marker, lastAnrIndex + 1))
    .filter((index) => index > lastAnrIndex);

  const nextSectionIndex =
    followingSectionMarkers.length > 0
      ? Math.min(...followingSectionMarkers)
      : currentFocus.length;

  return (
    currentFocus.slice(0, lastAnrIndex) + currentFocus.slice(nextSectionIndex)
  );
}

function visibleTextShowsWrongShell(uiXml) {
  return (
    uiXml.includes("Development servers") || uiXml.includes("Recently opened")
  );
}

function visibleTextShowsDevMenu(uiXml) {
  return (
    uiXml.includes("This is the developer menu") ||
    (uiXml.includes("Connected to:") && uiXml.includes("Reload"))
  );
}

async function ensureE2eAppReady() {
  if (!isReleaseBuild) {
    await waitForHttpOk(new URL("/status", hostMetroUrl).toString(), 120000);
  }

  let lastError = null;
  for (let attempt = 1; attempt <= preflightLaunchAttempts; attempt += 1) {
    collapseSystemUi();
    startAppWithoutChangingPermissions();

    try {
      waitForProductUi(preflightAttemptTimeoutMs);
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= preflightLaunchAttempts) {
        break;
      }

      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `E2E preflight launch attempt ${attempt} failed; retrying. ${message}`
      );
      forceStopApp();
      wait(3000);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("E2E preflight failed to open Monyvi.");
}

module.exports = {
  adb,
  appId,
  collapseSystemUi,
  deviceId,
  dumpVisibleText,
  ensureE2eAppReady,
  forceStopApp,
  appendAndroidPlatform,
  currentFocusShowsDevMenu,
  currentFocusShowsLauncher,
  buildDevMenuPreferencesXml,
  buildDevClientUrl,
  didDumpUiHierarchy,
  disableExpoDevMenuFabForE2e,
  getHttpClientNameForUrl,
  androidDeviceReconnectTimeoutMs,
  isAppReady,
  isNativeRootMounted,
  isReleaseBuild,
  shouldRestoreFromDevLauncher,
  hostMetroUrl,
  metroUrl,
  isRetryableMaestroTransportFailure,
  reconnectAndroidDevice,
  resolveMetroUrls,
  resolveMaestroBin,
  run,
  stabilizeAndroidDevice,
  startAppWithoutChangingPermissions,
  wait,
  waitForProductUi,
};
