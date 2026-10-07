/**
 * Issue #255 owned runner: passes local config privately to targeted Jest.
 * - Reads gitignored runtime.local.json (never prints secrets).
 * - Sets ISSUE255_SYNC_REPRO=1 and ISSUE255_SYNC_CONFIG_JSON for the child.
 * - Test file absent -> BLOCKED (exit 2), never Red.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const TEST_REL =
  "apps/mobile/__tests__/services/sync-pull-cap.local.integration.test.ts";
// Workspace-relative path: `npm -w @monyvi/mobile` resolves --runTestsByPath
// against the workspace dir, so the apps/mobile prefix must be stripped.
const TEST_WORKSPACE_REL =
  "__tests__/services/sync-pull-cap.local.integration.test.ts";

function main() {
  const root = path.resolve(__dirname, "..", "..", "..");
  const ownedRoot = path.resolve(__dirname);
  const testAbs = path.join(root, TEST_REL);

  let runtime = null;
  try {
    runtime = JSON.parse(
      fs.readFileSync(path.join(ownedRoot, "runtime.local.json"), "utf8")
    );
  } catch {
    console.log(
      JSON.stringify({
        ok: false,
        status: "BLOCKED",
        reason: "runtime.local.json missing; run resolve-runtime.js first",
      })
    );
    process.exit(2);
  }

  const required = [
    "supabaseUrl",
    "anonKey",
    "serviceRoleKey",
    "email",
    "password",
    "expectedUserId",
  ];
  const missing = required.filter((k) => !runtime[k]);
  if (missing.length > 0) {
    console.log(
      JSON.stringify({
        ok: false,
        status: "BLOCKED",
        reason: `runtime incomplete`,
        missing,
      })
    );
    process.exit(2);
  }

  if (!fs.existsSync(testAbs)) {
    console.log(
      JSON.stringify({
        ok: false,
        status: "BLOCKED",
        reason: "accepted test source not transferred yet",
        test: TEST_REL,
        backend: runtime.supabaseUrl,
        expectedUserId: runtime.expectedUserId,
      })
    );
    process.exit(2);
  }

  const config = {
    supabaseUrl: runtime.supabaseUrl,
    anonKey: runtime.anonKey,
    serviceRoleKey: runtime.serviceRoleKey,
    email: runtime.email,
    password: runtime.password,
    expectedUserId: runtime.expectedUserId,
  };
  const env = {
    ...process.env,
    ISSUE255_SYNC_REPRO: "1",
    ISSUE255_SYNC_CONFIG_JSON: JSON.stringify(config),
  };

  // Windows-safe: invoke the installed Jest entry directly with the
  // workspace config instead of spawning npm without a shell (EINVAL).
  const workspaceDir = path.join(root, "apps", "mobile");
  const jestBin = path.join(root, "node_modules", "jest", "bin", "jest.js");
  if (!fs.existsSync(jestBin)) {
    console.log(
      JSON.stringify({
        ok: false,
        status: "BLOCKED",
        reason: "jest-bin-missing",
      })
    );
    process.exit(2);
  }
  const result = spawnSync(
    process.execPath,
    [
      jestBin,
      "--config",
      path.join(workspaceDir, "jest.config.js"),
      "--runInBand",
      "--runTestsByPath",
      TEST_WORKSPACE_REL,
    ],
    { cwd: workspaceDir, env, stdio: "inherit", timeout: 600000 }
  );
  process.exit(result.status == null ? 3 : result.status);
}

main();
