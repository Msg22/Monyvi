const { spawnSync } = require("node:child_process");

const LOCAL_APP_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_FLOW_TIMEOUT_MS = "300000";
const DEFAULT_ADB_DISCOVERY_TIMEOUT_MS = 60000;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: options.env,
    shell: process.platform === "win32" && command.endsWith(".cmd"),
    stdio: options.capture ? "pipe" : "inherit",
    timeout: options.timeout ?? 30000,
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

function getExplicitDevice(env = process.env) {
  return env.MAESTRO_DEVICE_ID || env.DEVICE || env.ANDROID_SERIAL || null;
}

function getPositiveTimeoutMs(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatSpawnFailure(result) {
  return [result.error?.message, result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n");
}

function restartAdbServer() {
  console.warn("ADB device discovery timed out. Restarting ADB server once.");
  spawnSync("adb", ["kill-server"], {
    encoding: "utf8",
    stdio: "ignore",
    timeout: 15000,
  });
  const result = spawnSync("adb", ["start-server"], {
    encoding: "utf8",
    stdio: "inherit",
    timeout: 30000,
  });

  if (result.status !== 0 || result.error) {
    throw new Error(`adb start-server failed: ${formatSpawnFailure(result)}`);
  }
}

function readAdbDevices(env = process.env) {
  const timeout = getPositiveTimeoutMs(
    env.E2E_ADB_DISCOVERY_TIMEOUT_MS,
    DEFAULT_ADB_DISCOVERY_TIMEOUT_MS
  );

  const firstResult = spawnSync("adb", ["devices"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
  });

  if (firstResult.status === 0 && !firstResult.error) {
    return `${firstResult.stdout || ""}${firstResult.stderr || ""}`;
  }

  if (firstResult.error?.code !== "ETIMEDOUT") {
    throw new Error(`adb devices failed: ${formatSpawnFailure(firstResult)}`);
  }

  restartAdbServer();

  const secondResult = spawnSync("adb", ["devices"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
  });

  if (secondResult.status === 0 && !secondResult.error) {
    return `${secondResult.stdout || ""}${secondResult.stderr || ""}`;
  }

  throw new Error(
    `adb devices failed after restarting ADB: ${formatSpawnFailure(secondResult)}`
  );
}

function parseAdbDevices(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("List of devices"))
    .map((line) => {
      const [serial, state] = line.split(/\s+/);
      return { serial, state };
    })
    .filter((device) => device.state === "device")
    .map((device) => device.serial);
}

function resolveDevice(env = process.env) {
  const explicitDevice = getExplicitDevice(env);
  if (explicitDevice) return explicitDevice;

  const devices = parseAdbDevices(readAdbDevices(env));

  if (devices.length === 1) {
    return devices[0];
  }

  if (devices.length === 0) {
    throw new Error(
      "No Android device is connected. Connect a device/emulator or set ANDROID_SERIAL."
    );
  }

  throw new Error(
    `Multiple Android devices are connected (${devices.join(
      ", "
    )}). Set ANDROID_SERIAL to choose one.`
  );
}

function reversePort(device, port) {
  run("adb", ["-s", device, "reverse", `tcp:${port}`, `tcp:${port}`], {
    timeout: 30000,
  });
}

function prepareDevice(device) {
  run("adb", ["-s", device, "wait-for-device"], { timeout: 60000 });
  reversePort(device, "8081");
  reversePort(device, "54321");
}

function buildCommonEnv(device, baseEnv = process.env) {
  return {
    ...baseEnv,
    ANDROID_SERIAL: device,
    DEVICE: baseEnv.DEVICE ?? device,
    MAESTRO_DEVICE_ID: baseEnv.MAESTRO_DEVICE_ID ?? device,
    E2E_SUPABASE_MODE: "local",
    E2E_LOCAL_APP_SUPABASE_URL:
      baseEnv.E2E_LOCAL_APP_SUPABASE_URL ?? LOCAL_APP_SUPABASE_URL,
    EXPO_PUBLIC_MONYVI_TEST_MODE: "e2e",
    EXPO_PUBLIC_AI_SMS_PARSER_MODE: "local",
  };
}

function buildMetroEnv(device, baseEnv = process.env) {
  return {
    ...buildCommonEnv(device, baseEnv),
    E2E_METRO_CLEAR_CACHE: "1",
  };
}

function startMetro(device) {
  prepareDevice(device);
  const env = buildMetroEnv(device);

  console.log(`Starting local-parser E2E Metro for Android device ${device}.`);
  console.log(
    "Metro cache will be cleared so the local parser env is rebundled."
  );
  console.log("Keep this terminal open while running Maestro.");

  return spawnSync(process.execPath, ["scripts/start-e2e-fixture.js"], {
    env,
    stdio: "inherit",
    shell: false,
  });
}

function buildSmsSyncRunnerArgs(journeys = []) {
  return ["scripts/run-sms-sync-journeys.js", ...journeys];
}

function runSmsSync(device, args) {
  prepareDevice(device);
  const env = {
    ...buildCommonEnv(device),
    E2E_AUTH_DEEPLINK_BOOTSTRAP: "1",
    E2E_MAESTRO_FLOW_TIMEOUT_MS:
      process.env.E2E_MAESTRO_FLOW_TIMEOUT_MS ?? DEFAULT_FLOW_TIMEOUT_MS,
  };

  return spawnSync(process.execPath, buildSmsSyncRunnerArgs(args), {
    env,
    stdio: "inherit",
    shell: false,
  });
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  const device = resolveDevice();

  if (command === "metro") {
    return startMetro(device);
  }

  if (command === "sms-sync") {
    return runSmsSync(device, args);
  }

  throw new Error(
    "Usage: node scripts/e2e-device-local-parser.js <metro|sms-sync> [journey...]"
  );
}

if (require.main === module) {
  try {
    const result = main();
    process.exit(result.status ?? 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = {
  buildSmsSyncRunnerArgs,
  buildCommonEnv,
  buildMetroEnv,
  readAdbDevices,
  parseAdbDevices,
  resolveDevice,
};
