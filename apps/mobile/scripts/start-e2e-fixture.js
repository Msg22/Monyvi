const { spawnSync } = require("node:child_process");
const { getE2eSeedConfig } = require("./e2e-seed");

function resolveNpxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function hasExplicitSupabaseAppEnv(baseEnv) {
  return Boolean(
    baseEnv.EXPO_PUBLIC_SUPABASE_URL &&
    baseEnv.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

function buildE2eMetroEnv(parserMode, baseEnv = process.env) {
  const config = hasExplicitSupabaseAppEnv(baseEnv)
    ? null
    : getE2eSeedConfig({
        ...baseEnv,
        E2E_SUPABASE_MODE: "local",
      });
  const { EXPO_NO_METRO_WORKSPACE_ROOT, ...metroEnv } = baseEnv;

  return {
    ...metroEnv,
    E2E_SUPABASE_MODE: "local",
    EXPO_PUBLIC_MONYVI_TEST_MODE: "e2e",
    EXPO_PUBLIC_AI_SMS_PARSER_MODE: parserMode,
    EXPO_PUBLIC_SUPABASE_URL:
      baseEnv.EXPO_PUBLIC_SUPABASE_URL ?? config.appSupabaseUrl,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      baseEnv.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? config.anonKey,
    EXPO_PUBLIC_SENTRY_DSN: baseEnv.EXPO_PUBLIC_SENTRY_DSN ?? "",
    EXPO_NO_TELEMETRY: "1",
    CI: baseEnv.CI ?? "1",
  };
}

function buildE2eFixtureEnv(baseEnv = process.env) {
  return buildE2eMetroEnv("fixture", baseEnv);
}

function getParserModeFromEnv(baseEnv = process.env) {
  return baseEnv.EXPO_PUBLIC_AI_SMS_PARSER_MODE === "local"
    ? "local"
    : "fixture";
}

function main() {
  const parserMode = getParserModeFromEnv();
  const env = {
    ...buildE2eMetroEnv(parserMode),
  };

  const shouldClearCache = process.env.E2E_METRO_CLEAR_CACHE === "1";
  const defaultArgs = ["expo", "start", "--dev-client", "--port", "8081"];
  if (shouldClearCache) {
    defaultArgs.splice(2, 0, "--clear");
  }

  const args =
    process.argv.length > 2
      ? ["expo", "start", ...process.argv.slice(2)]
      : defaultArgs;

  console.log(
    `Starting E2E Metro with SMS parser mode "${parserMode}"${
      shouldClearCache ? " and cleared cache" : ""
    }.`
  );

  const result = spawnSync(resolveNpxCommand(), args, {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  process.exit(result.status ?? 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildE2eMetroEnv,
  buildE2eFixtureEnv,
};
