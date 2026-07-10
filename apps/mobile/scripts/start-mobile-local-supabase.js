/**
 * Starts the Expo dev client in normal app mode against local Supabase with
 * Google auth available by default.
 *
 * The script reads the local anon key from `npx supabase status -o env`, points
 * ADB-reachable Android devices to loopback via `adb reverse`, and keeps E2E
 * fixture behavior disabled. Pass `--wireless-device` to start local Supabase,
 * seed the manual QA user, start ngrok, and use the ngrok HTTPS URL.
 */
const http = require("node:http");
const { existsSync } = require("node:fs");
const { delimiter, join, resolve } = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const LOCAL_ANDROID_SUPABASE_URL = "http://10.0.2.2:54321";
const LOCAL_LOOPBACK_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SUPABASE_PORT = "54321";
const NGROK_API_URL = "http://127.0.0.1:4040/api/tunnels";
const NGROK_START_TIMEOUT_MS = 30_000;
const NGROK_POLL_INTERVAL_MS = 500;
const repoRoot = resolve(__dirname, "..", "..", "..");
const mobileRoot = join(repoRoot, "apps", "mobile");
const expoCliPath = join(repoRoot, "node_modules", "expo", "bin", "cli");

function resolveNpxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function resolveNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
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

function resolveNgrokCommand(env = process.env, options = {}) {
  if (env.NGROK_COMMAND) return env.NGROK_COMMAND;

  const findCommandOnPath = options.findOnPath ?? findOnPath;
  const pathExists = options.pathExists ?? existsSync;
  const pathCommand = findCommandOnPath("ngrok");
  if (pathCommand) return pathCommand;

  const knownWindowsCommands = [
    env.LOCALAPPDATA
      ? join(
          env.LOCALAPPDATA,
          "Microsoft",
          "WinGet",
          "Packages",
          "Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe",
          "ngrok.exe"
        )
      : null,
    env.USERPROFILE
      ? join(env.USERPROFILE, "scoop", "shims", "ngrok.exe")
      : null,
    env.APPDATA ? join(env.APPDATA, "npm", "ngrok.cmd") : null,
  ].filter(Boolean);

  const knownCommand = knownWindowsCommands.find((command) =>
    pathExists(command)
  );

  return knownCommand ?? "ngrok";
}

function shouldShowSetupOutput(env = process.env) {
  return env.MONYVI_LOCAL_SUPABASE_VERBOSE_SETUP === "1";
}

function shouldWarnAboutMissingWatchman(env = process.env, options = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") return false;
  if (env.MONYVI_SUPPRESS_WATCHMAN_WARNING === "1") return false;

  const findCommandOnPath = options.findOnPath ?? findOnPath;
  return !findCommandOnPath("watchman");
}

function warnIfMissingWatchman(env = process.env) {
  if (!shouldWarnAboutMissingWatchman(env)) return;

  console.warn(
    [
      "Watchman was not found on PATH.",
      "Metro can fall back to the Windows file watcher, but this monorepo may start very slowly or fail watch mode without Watchman.",
      "Install Watchman or set MONYVI_SUPPRESS_WATCHMAN_WARNING=1 to hide this warning.",
    ].join("\n")
  );
}

function parseCliArgs(args) {
  let shouldUseWirelessDeviceTunnel = false;
  let shouldUseLocalParser = false;
  let shouldUseFixtureSmsInbox = false;
  let password = null;
  const expoArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--wireless-device" || arg === "--physical-device") {
      shouldUseWirelessDeviceTunnel = true;
      continue;
    }

    if (arg === "--local-parser") {
      shouldUseLocalParser = true;
      continue;
    }

    if (arg === "--fixture-sms") {
      shouldUseLocalParser = true;
      shouldUseFixtureSmsInbox = true;
      continue;
    }

    if (arg === "--password") {
      const nextArg = args[index + 1] ?? null;
      if (!nextArg || nextArg.startsWith("--")) {
        throw new Error("--password requires a value");
      }
      password = nextArg;
      index += 1;
      continue;
    }

    if (arg.startsWith("--password=")) {
      password = arg.slice("--password=".length);
      continue;
    }

    expoArgs.push(arg);
  }

  return {
    shouldUseWirelessDeviceTunnel,
    shouldUseLocalParser,
    shouldUseFixtureSmsInbox,
    password,
    expoArgs,
  };
}

function parseSupabaseEnv(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((env, line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) return env;

      const key = line.slice(0, separatorIndex);
      const value = line.slice(separatorIndex + 1).replace(/^"|"$/g, "");
      return { ...env, [key]: value };
    }, {});
}

function getLocalSupabaseEnv() {
  const result = spawnSync(
    resolveNpxCommand(),
    ["supabase", "status", "-o", "env"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 30_000,
    }
  );

  if (result.status !== 0) {
    throw new Error(
      [
        "Local Supabase is not ready.",
        "Start it from the repo root with: npx supabase start",
        result.stderr || result.stdout,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  const supabaseEnv = parseSupabaseEnv(result.stdout);
  const anonKey = supabaseEnv.ANON_KEY || supabaseEnv.SUPABASE_ANON_KEY;

  if (!anonKey) {
    throw new Error(
      "Could not find ANON_KEY in `npx supabase status -o env` output."
    );
  }

  return { anonKey };
}

function listConnectedDevices() {
  const result = spawnSync("adb", ["devices"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 10_000,
  });

  if (result.status !== 0) return [];

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.endsWith("\tdevice"))
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean);
}

function resolveAdbDeviceArgs() {
  if (process.env.DEVICE) return ["-s", process.env.DEVICE];

  const devices = listConnectedDevices();
  if (devices.length === 1) return ["-s", devices[0]];

  if (devices.length > 1) {
    console.warn(
      [
        "Multiple Android devices are connected.",
        "Set DEVICE=<serial> before running this script so local Supabase port 54321 can be reversed.",
        `Connected devices: ${devices.join(", ")}`,
      ].join(" ")
    );
  }

  return [];
}

function reverseLocalSupabasePort() {
  const deviceArgs = resolveAdbDeviceArgs();
  const result = spawnSync(
    "adb",
    [...deviceArgs, "reverse", "tcp:54321", "tcp:54321"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 10_000,
    }
  );

  if (result.status !== 0) {
    console.warn(
      [
        "Could not reverse local Supabase port 54321 to an Android device.",
        "Google sign-in needs either adb reverse for an emulator/USB device,",
        "or MONYVI_LOCAL_SUPABASE_DEVICE_URL for a wireless physical device.",
        result.stderr || result.stdout,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
}

function buildManualQaSeedEnv(cliPassword, baseEnv = process.env) {
  const password = cliPassword ?? baseEnv.MANUAL_QA_PASSWORD;
  if (password) {
    return {
      ...baseEnv,
      MANUAL_QA_PASSWORD: password,
      MANUAL_QA_PRESERVE_PASSWORD: undefined,
    };
  }

  return {
    ...baseEnv,
    MANUAL_QA_PRESERVE_PASSWORD: "1",
  };
}

function resolveLocalSupabaseDeviceConfig(env = process.env) {
  if (env.MONYVI_LOCAL_SUPABASE_DEVICE_URL) {
    return {
      supabaseUrl: env.MONYVI_LOCAL_SUPABASE_DEVICE_URL,
      shouldReversePort: false,
    };
  }

  if (env.MONYVI_LOCAL_SUPABASE_LOOPBACK === "0") {
    return {
      supabaseUrl: LOCAL_ANDROID_SUPABASE_URL,
      shouldReversePort: false,
    };
  }

  return {
    supabaseUrl: LOCAL_LOOPBACK_SUPABASE_URL,
    shouldReversePort: true,
  };
}

function resolveAiSmsParserMode(baseEnv, options) {
  if (options.shouldUseLocalParser) return "local";
  return baseEnv.EXPO_PUBLIC_AI_SMS_PARSER_MODE === "local" ? "local" : "edge";
}

function resolveSmsInboxMode(baseEnv, options) {
  if (options.shouldUseFixtureSmsInbox) return "fixture";
  return baseEnv.EXPO_PUBLIC_SMS_INBOX_MODE === "fixture"
    ? "fixture"
    : "device";
}

function buildLocalSupabaseExpoEnv(
  anonKey,
  baseEnv = process.env,
  options = {}
) {
  const config = resolveLocalSupabaseDeviceConfig(baseEnv);
  const { EXPO_NO_METRO_WORKSPACE_ROOT, ...metroEnv } = baseEnv;
  const parserMode = resolveAiSmsParserMode(baseEnv, options);
  const inboxMode = resolveSmsInboxMode(baseEnv, options);

  return {
    ...metroEnv,
    EXPO_PUBLIC_SUPABASE_URL:
      baseEnv.EXPO_PUBLIC_SUPABASE_URL ?? config.supabaseUrl,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      baseEnv.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? anonKey,
    EXPO_PUBLIC_MONYVI_TEST_MODE: "off",
    EXPO_PUBLIC_AI_SMS_PARSER_MODE: parserMode,
    EXPO_PUBLIC_SMS_INBOX_MODE: inboxMode,
    EXPO_PUBLIC_SENTRY_DSN: baseEnv.EXPO_PUBLIC_SENTRY_DSN ?? "",
    EXPO_NO_TELEMETRY: "1",
  };
}

function runRequiredCommand(label, command, args, options = {}) {
  const env = options.env ?? process.env;
  const isVerbose = shouldShowSetupOutput(env);
  if (isVerbose) {
    console.log(`\n${label}`);
  }

  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env,
    encoding: "utf8",
    stdio: isVerbose ? "inherit" : "pipe",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    const output = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      [`${label} failed with exit code ${result.status ?? 1}.`, output]
        .filter(Boolean)
        .join("\n")
    );
  }
}

function resolveNgrokTunnelUrl(apiResponse) {
  const parsed = JSON.parse(apiResponse);
  const tunnels = Array.isArray(parsed.tunnels) ? parsed.tunnels : [];
  const httpsTunnels = tunnels.filter(
    (candidate) =>
      candidate &&
      candidate.proto === "https" &&
      typeof candidate.public_url === "string" &&
      candidate.public_url.startsWith("https://")
  );
  const tunnel =
    httpsTunnels.find(
      (candidate) =>
        typeof candidate.config?.addr === "string" &&
        candidate.config.addr.includes(`:${LOCAL_SUPABASE_PORT}`)
    ) ?? httpsTunnels[0];

  if (!tunnel) {
    throw new Error("Could not find an HTTPS ngrok tunnel for local Supabase.");
  }

  return tunnel.public_url;
}

function readHttpText(url) {
  return new Promise((resolveText, reject) => {
    const request = http.get(url, (response) => {
      const chunks = [];

      response.on("data", (chunk) => {
        chunks.push(chunk);
      });

      response.on("end", () => {
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`ngrok API returned HTTP ${response.statusCode}.`));
          return;
        }

        resolveText(Buffer.concat(chunks).toString("utf8"));
      });
    });

    request.on("error", reject);
    request.setTimeout(2_000, () => {
      request.destroy(new Error("Timed out while reading the ngrok API."));
    });
  });
}

async function waitForNgrokTunnelUrl(
  apiUrl = NGROK_API_URL,
  timeoutMs = NGROK_START_TIMEOUT_MS
) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      return resolveNgrokTunnelUrl(await readHttpText(apiUrl));
    } catch (error) {
      lastError = error;
      await new Promise((resolveWait) =>
        setTimeout(resolveWait, NGROK_POLL_INTERVAL_MS)
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Timed out waiting for ngrok to expose local Supabase.");
}

function startNgrok() {
  const command = resolveNgrokCommand();
  return spawn(command, ["http", LOCAL_SUPABASE_PORT], {
    cwd: repoRoot,
    stdio: shouldShowSetupOutput() ? "inherit" : "ignore",
    shell: process.platform === "win32",
  });
}

function stopChildProcess(child) {
  if (child.killed) return;

  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }

  child.kill();
}

function hasExpoOption(expoArgs, option) {
  return expoArgs.some((arg) => arg === option || arg.startsWith(`${option}=`));
}

function buildExpoStartArgs(expoArgs) {
  const defaultArgs = [];

  if (!hasExpoOption(expoArgs, "--dev-client")) {
    defaultArgs.push("--dev-client");
  }

  if (!hasExpoOption(expoArgs, "--port")) {
    defaultArgs.push("--port", "8081");
  }

  return ["expo", "start", ...defaultArgs, ...expoArgs];
}

function buildExpoStartCommand(expoArgs, options = {}) {
  const pathExists = options.pathExists ?? existsSync;
  const installedExpoCliPath = options.expoCliPath ?? expoCliPath;
  const args = buildExpoStartArgs(expoArgs);
  const startArgs = args.slice(1);

  if (pathExists(installedExpoCliPath)) {
    return {
      command: options.nodeExecPath ?? process.execPath,
      args: [installedExpoCliPath, ...startArgs],
      shell: false,
    };
  }

  return {
    command: resolveNpxCommand(),
    args,
    shell: process.platform === "win32",
  };
}

function runExpoSync(env, expoArgs) {
  const expoStart = buildExpoStartCommand(expoArgs);
  const result = spawnSync(expoStart.command, expoStart.args, {
    cwd: mobileRoot,
    env,
    stdio: "inherit",
    shell: expoStart.shell,
  });

  process.exit(result.status ?? 1);
}

function startExpoProcess(env, expoArgs) {
  const expoStart = buildExpoStartCommand(expoArgs);
  return spawn(expoStart.command, expoStart.args, {
    cwd: mobileRoot,
    env,
    stdio: "inherit",
    shell: expoStart.shell,
  });
}

function startDefaultLocalSupabase(expoArgs, options) {
  const { anonKey } = getLocalSupabaseEnv();
  const deviceConfig = resolveLocalSupabaseDeviceConfig();

  if (deviceConfig.shouldReversePort && !process.env.EXPO_PUBLIC_SUPABASE_URL) {
    reverseLocalSupabasePort();
  }

  const env = buildLocalSupabaseExpoEnv(anonKey, process.env, options);
  warnIfMissingWatchman(env);
  runExpoSync(env, expoArgs);
}

async function startWirelessDeviceLocalSupabase(password, expoArgs, options) {
  runRequiredCommand("Starting local Supabase", resolveNpmCommand(), [
    "run",
    "supabase:start:local",
  ]);

  const seedEnv = buildManualQaSeedEnv(password);
  runRequiredCommand(
    "Seeding manual QA user",
    resolveNpmCommand(),
    ["run", "manual:seed-user", "-w", "@monyvi/mobile"],
    { env: seedEnv }
  );

  if (shouldShowSetupOutput()) {
    console.log("\nStarting ngrok tunnel for local Supabase");
  }
  const ngrok = startNgrok();
  let isShuttingDown = false;
  let ngrokStartError = null;

  const stopNgrok = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    stopChildProcess(ngrok);
  };

  process.once("SIGINT", () => {
    stopNgrok();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    stopNgrok();
    process.exit(143);
  });

  ngrok.once("error", (error) => {
    ngrokStartError = error;
  });

  ngrok.once("exit", (code) => {
    if (!isShuttingDown && code !== 0) {
      console.error(
        [
          `ngrok exited before Metro started with code ${code ?? 1}.`,
          "If ngrok is installed but not on PATH, set NGROK_COMMAND to the full ngrok.exe path.",
        ].join("\n")
      );
      process.exit(code ?? 1);
    }
  });

  let tunnelUrl;
  try {
    tunnelUrl = await waitForNgrokTunnelUrl();
  } catch (error) {
    stopNgrok();
    if (ngrokStartError instanceof Error) {
      throw new Error(`Could not start ngrok: ${ngrokStartError.message}`);
    }
    throw error;
  }

  if (shouldShowSetupOutput()) {
    console.log(`\nUsing local Supabase tunnel: ${tunnelUrl}`);
  }

  const { anonKey } = getLocalSupabaseEnv();
  const env = buildLocalSupabaseExpoEnv(
    anonKey,
    {
      ...process.env,
      MONYVI_LOCAL_SUPABASE_DEVICE_URL: tunnelUrl,
    },
    options
  );
  warnIfMissingWatchman(env);
  const expo = startExpoProcess(env, expoArgs);
  expo.once("exit", (code) => {
    stopNgrok();
    process.exit(code ?? 0);
  });
}

async function main() {
  const {
    shouldUseWirelessDeviceTunnel,
    shouldUseLocalParser,
    shouldUseFixtureSmsInbox,
    password,
    expoArgs,
  } = parseCliArgs(process.argv.slice(2));
  const parserOptions = {
    shouldUseLocalParser,
    shouldUseFixtureSmsInbox,
  };

  if (shouldUseWirelessDeviceTunnel) {
    await startWirelessDeviceLocalSupabase(password, expoArgs, parserOptions);
    return;
  }

  startDefaultLocalSupabase(expoArgs, parserOptions);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildExpoStartCommand,
  buildExpoStartArgs,
  buildManualQaSeedEnv,
  buildLocalSupabaseExpoEnv,
  parseCliArgs,
  parseSupabaseEnv,
  resolveLocalSupabaseDeviceConfig,
  resolveNgrokCommand,
  resolveNgrokTunnelUrl,
  shouldWarnAboutMissingWatchman,
  shouldShowSetupOutput,
};
