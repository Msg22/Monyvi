"use strict";

const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const mobileRoot = resolve(__dirname, "..");
const startScript = join(__dirname, "start-mobile-local-supabase.js");
const runnerPath = join(
  mobileRoot,
  "services",
  "testing",
  "sms-safeguard-qa-runner.ts"
);

function buildSafeguardQaEnvironment(
  baseEnvironment = process.env,
  profileId = null
) {
  const qaRunId =
    baseEnvironment.EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID ??
    (profileId === null ? undefined : `${profileId}-${Date.now()}`);
  return {
    ...baseEnvironment,
    EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
    EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
    EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
    ...(profileId === null
      ? {}
      : {
          EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE: profileId,
          EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID: qaRunId,
        }),
    EXPO_PUBLIC_AI_SMS_PARSER_MODE: "edge",
    EXPO_PUBLIC_SMS_INBOX_MODE: "fixture",
  };
}

function resolveSafeguardQaProfileArgument(args, options = {}) {
  const profileIndex = args.indexOf("--scenario");
  const profileId = profileIndex >= 0 ? args[profileIndex + 1] : null;
  if (profileId === undefined || profileId?.startsWith("--")) {
    throw new Error("--scenario requires a named versioned profile.");
  }
  if (options.required === true && profileId === null) {
    throw new Error(
      "App-facing safeguard QA requires --scenario <profile-id>."
    );
  }
  return profileId;
}

function runTests(args, environment) {
  require("tsx/cjs");
  const { SmsSafeguardQaRunner } = require(runnerPath);
  const runner = new SmsSafeguardQaRunner({ environment });
  const profileId = resolveSafeguardQaProfileArgument(args);

  return (profileId ? runner.run(profileId) : runner.runAll()).then(
    (result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  );
}

function startDevelopmentServer(args, environment, profileId) {
  const startArgs = args.filter(
    (arg, index) => arg !== "--scenario" && args[index - 1] !== "--scenario"
  );
  const resolvedStartArgs =
    startArgs.length > 0 ? startArgs : ["--wireless-device"];
  const result = spawnSync(
    process.execPath,
    [startScript, "--fixture-sms", ...resolvedStartArgs],
    {
      cwd: mobileRoot,
      env: buildSafeguardQaEnvironment(environment, profileId),
      stdio: "inherit",
    }
  );

  process.exit(result.status ?? 1);
}

async function main() {
  const [command = "test", ...args] = process.argv.slice(2);
  const environment = buildSafeguardQaEnvironment();

  if (command === "test") {
    await runTests(args, environment);
    return;
  }
  if (command === "start") {
    const profileId = resolveSafeguardQaProfileArgument(args, {
      required: true,
    });
    await runTests(["--scenario", profileId], {
      ...environment,
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE: profileId,
    });
    startDevelopmentServer(args, environment, profileId);
    return;
  }

  throw new Error(
    `Unknown SMS safeguard QA command: ${command}. Use test or start.`
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  });
}

module.exports = {
  buildSafeguardQaEnvironment,
  resolveSafeguardQaProfileArgument,
  startDevelopmentServer,
};
