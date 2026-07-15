const { spawnSync } = require("node:child_process");

const QA_SMS_INTAKE_URL = "monyvi://qa-sms-pattern-intake";
const ANDROID_PACKAGE = "com.monyvi.app";

function main() {
  const device = process.env.DEVICE;
  const deviceArgs = device ? ["-s", device] : [];
  const result = spawnSync(
    "adb",
    [
      ...deviceArgs,
      "shell",
      "am",
      "start",
      "-a",
      "android.intent.action.VIEW",
      "-d",
      QA_SMS_INTAKE_URL,
      ANDROID_PACKAGE,
    ],
    {
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: "inherit",
      timeout: 15_000,
    }
  );

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
