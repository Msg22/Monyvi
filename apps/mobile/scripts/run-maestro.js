const { spawnSync } = require("node:child_process");
const {
  adb,
  appId,
  ensureE2eAppReady,
  resolveMaestroBin,
} = require("./e2e-preflight");
const { applyE2eAuthDeepLink } = require("./e2e-auth-deeplink");
const { getE2eSeedConfig } = require("./e2e-seed");

const defaultMaestroTimeoutMs = 15 * 60 * 1000;

function getMaestroTimeoutMs(env = process.env) {
  const parsed = Number(env.E2E_MAESTRO_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : defaultMaestroTimeoutMs;
}

function shouldRunPreflight(args) {
  return args.includes("test");
}

function normalizeDeviceArgs(args) {
  const deviceFlagIndex = args.indexOf("--device");
  if (deviceFlagIndex >= 0) {
    const deviceValue = args[deviceFlagIndex + 1];
    if (!deviceValue) {
      return args;
    }

    const argsWithoutDevice = args.filter(
      (_arg, index) =>
        index !== deviceFlagIndex && index !== deviceFlagIndex + 1
    );
    return ["--device", deviceValue, ...argsWithoutDevice];
  }

  const device = process.env.DEVICE || process.env.ANDROID_SERIAL;
  return device ? ["--device", device, ...args] : args;
}

function applyLocalE2eDefaults() {
  if (process.env.E2E_SUPABASE_MODE !== "local") return;

  const config = getE2eSeedConfig({
    ...process.env,
    E2E_SUPABASE_MODE: "local",
  });

  process.env.E2E_SUPABASE_MODE = "local";
  process.env.EXPO_PUBLIC_SUPABASE_URL ??= config.appSupabaseUrl;
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= config.anonKey;
  process.env.EXPO_PUBLIC_MONYVI_TEST_MODE ??= "e2e";
  process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE ??= "fixture";
  process.env.MAESTRO_E2E_EMAIL ??= config.email;
  process.env.MAESTRO_E2E_PASSWORD ??= config.password;
  applyE2eAuthDeepLink();
}

async function main() {
  const args = process.argv.slice(2);
  const hasPreflight = shouldRunPreflight(args);

  if (hasPreflight) {
    applyLocalE2eDefaults();
  }

  const maestroBin = resolveMaestroBin();

  if (!maestroBin) {
    console.error(
      "Maestro was not found. Install it, add it to PATH, or set MAESTRO_BIN."
    );
    process.exit(1);
  }

  if (hasPreflight) {
    if (process.env.E2E_CLEAR_APP_STATE === "1") {
      adb(["shell", "pm", "clear", appId]);
    }
    await ensureE2eAppReady();
  }

  const maestroArgs = normalizeDeviceArgs(args);
  const result = spawnSync(maestroBin, maestroArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
    timeout: getMaestroTimeoutMs(),
  });

  if (result.error) {
    console.error(result.error.message);
  }

  process.exit(result.status ?? 1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  getMaestroTimeoutMs,
};
