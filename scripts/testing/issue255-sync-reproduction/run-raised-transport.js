/**
 * Issue #255 transport-capacity runner (test fixture tuning, NOT repair).
 * Raises request-line capacity ONLY inside the dedicated Kong container,
 * runs a real action (probe|jest), then restores + verifies byte equality
 * even when the action fails. Never touches shared *_Monyvi, images,
 * migrations, or repository config. Prints no keys.
 *
 * Usage:
 *   node scripts/testing/issue255-sync-reproduction/run-raised-transport.js probe
 *   node scripts/testing/issue255-sync-reproduction/run-raised-transport.js jest
 */
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const KONG = "supabase_kong_monyvi-issue255-repro";
const KONG_HOST_PORT = "0.0.0.0:54341";
const CONF = "/usr/local/kong/nginx-kong.conf";
const BACKUP = "/usr/local/kong/nginx-kong.conf.issue255-bak";
const DIRECTIVE =
  "large_client_header_buffers 4 128k; # issue255-fixture-temporary";
const MARKER = "# injected nginx_http_* directives";
const HEADER_FLAG = "--max-http-header-size=131072";
const SECRET_FILES = new Set(["runtime.local.json", "status.json"]);

const root = path.resolve(__dirname, "..", "..", "..");
const ownedRoot = path.resolve(__dirname);

class StepError extends Error {
  constructor(step, detail) {
    super(`${step}: ${String(detail).slice(0, 200)}`);
    this.step = step;
  }
}

function fail(step, detail) {
  throw new StepError(step, detail);
}

function docker(args, options) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 60000,
    ...options,
  });
}

function identityCheck() {
  const name = docker([
    "inspect",
    KONG,
    "--format",
    "{{.Name}} {{.Config.Image}}",
  ]);
  if (name.status !== 0) fail("identity-inspect", name.stderr);
  const [exactName, image] = name.stdout.trim().split(/\s+/);
  if (exactName !== `/${KONG}`) fail("identity-name", exactName || "(empty)");
  if (!image || !image.includes("kong"))
    fail("identity-image", (image || "(empty)").slice(0, 120));
  const ports = docker(["port", KONG]);
  if (ports.status !== 0) fail("identity-port", ports.stderr);
  const lines = ports.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.includes(`8000/tcp -> ${KONG_HOST_PORT}`))
    fail("identity-port-missing", lines.join("; ").slice(0, 160));
  if (lines.some((line) => line.includes("54321")))
    fail("identity-port-shared", lines.join("; ").slice(0, 160));
  console.log(
    JSON.stringify({
      ok: true,
      step: "identity",
      container: KONG,
      hostPort: KONG_HOST_PORT,
    })
  );
}

function workerPids() {
  const res = docker([
    "exec",
    KONG,
    "sh",
    "-c",
    "ps aux | grep 'nginx: worker process' | awk '{print $1}'",
  ]);
  if (res.status !== 0) return [];
  return res.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function reloadNginx() {
  const before = workerPids();
  const reload = docker([
    "exec",
    KONG,
    "/usr/local/openresty/nginx/sbin/nginx",
    "-p",
    "/usr/local/kong",
    "-c",
    "nginx.conf",
    "-s",
    "reload",
  ]);
  if (reload.status !== 0) fail("nginx-reload", reload.stderr);
  const deadline = Date.now() + 90000;
  let after = workerPids();
  while (Date.now() < deadline) {
    if (after.length > 0 && after.every((pid) => !before.includes(pid))) break;
    sleep(2000);
    after = workerPids();
  }
  if (!(after.length > 0 && after.every((pid) => !before.includes(pid)))) {
    fail(
      "worker-turnover-timeout",
      `before=${before.join(",")} after=${after.join(",")}`
    );
  }
  console.log(
    JSON.stringify({
      ok: true,
      step: "workers-turned-over",
      before: before.length,
      after: after.length,
    })
  );
}

function readConf() {
  const res = docker(["exec", KONG, "cat", CONF]);
  if (res.status !== 0) fail("read-conf", res.stderr);
  return res.stdout;
}

function writeConf(content) {
  const res = docker(["exec", "-i", KONG, "tee", CONF], { input: content });
  if (res.status !== 0) fail("write-conf", res.stderr);
}

let backupReady = false;

function raise() {
  const current = readConf();
  if (current.includes("large_client_header_buffers")) {
    fail("already-raised-refused", "directive present; backup untouched");
  }
  const backup = docker(["exec", KONG, "cp", CONF, BACKUP]);
  if (backup.status !== 0) fail("backup", backup.stderr);
  backupReady = true;
  const lines = current.split("\n");
  const at = lines.findIndex((line) => line.trim() === MARKER);
  if (at === -1) fail("marker-missing", MARKER);
  lines.splice(at + 1, 0, DIRECTIVE);
  writeConf(lines.join("\n"));
  const test = docker([
    "exec",
    KONG,
    "/usr/local/openresty/nginx/sbin/nginx",
    "-p",
    "/usr/local/kong",
    "-c",
    "nginx.conf",
    "-t",
  ]);
  if (test.status !== 0) fail("nginx-test", test.stderr);
  reloadNginx();
  console.log(
    JSON.stringify({ ok: true, step: "raised", directive: DIRECTIVE })
  );
}

function restore() {
  if (!backupReady) {
    console.log(
      JSON.stringify({
        ok: true,
        step: "restore-skipped",
        reason: "no-backup-taken",
      })
    );
    return;
  }
  const cp = docker(["exec", KONG, "cp", BACKUP, CONF]);
  if (cp.status !== 0) fail("restore-cp", cp.stderr);
  const test = docker([
    "exec",
    KONG,
    "/usr/local/openresty/nginx/sbin/nginx",
    "-p",
    "/usr/local/kong",
    "-c",
    "nginx.conf",
    "-t",
  ]);
  if (test.status !== 0) fail("restore-test", test.stderr);
  reloadNginx();
  const diff = docker(["exec", KONG, "diff", BACKUP, CONF]);
  const equal = diff.status === 0 && diff.stdout === "";
  console.log(
    JSON.stringify({ ok: equal, step: "restored", byteEqual: equal })
  );
  if (!equal) fail("restore-byte-mismatch", diff.stdout.slice(0, 200));
}

function sha256(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function recordLineage(runDir) {
  const files = [
    "apps/mobile/__tests__/services/sync-pull-cap.local.integration.test.ts",
    "apps/mobile/__tests__/services/issue255-sync-reproduction/manifests.ts",
    "scripts/testing/issue255-sync-reproduction/run-cap-test.js",
    "scripts/testing/issue255-sync-reproduction/run-raised-transport.js",
    "scripts/testing/issue255-sync-reproduction/probe-transport.js",
    "scripts/testing/issue255-sync-reproduction/probe-adapter.js",
  ];
  const lineage = {};
  for (const rel of files) {
    const abs = path.join(root, rel);
    lineage[rel] = {
      sha256: sha256(abs),
      lines: fs.readFileSync(abs, "utf8").split("\n").length,
    };
  }
  fs.writeFileSync(
    path.join(runDir, "source-lineage.json"),
    JSON.stringify(lineage, null, 2)
  );
  console.log(
    JSON.stringify({
      ok: true,
      step: "lineage",
      files: Object.keys(lineage).length,
    })
  );
}

function archiveTopLevel(runDir, sub) {
  const src = path.join(ownedRoot, "evidence");
  const dst = path.join(runDir, sub);
  fs.mkdirSync(dst, { recursive: true });
  let copied = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!entry.isFile() || SECRET_FILES.has(entry.name)) continue;
    if (!entry.name.endsWith(".json") && !entry.name.endsWith(".log")) continue;
    fs.copyFileSync(path.join(src, entry.name), path.join(dst, entry.name));
    copied += 1;
  }
  return copied;
}

function runNodeChild(flagged, script, args, env, cwd) {
  const nodeArgs = flagged ? [HEADER_FLAG, script, ...args] : [script, ...args];
  return spawnSync(process.execPath, nodeArgs, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 600000,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function configEnv() {
  const runtime = JSON.parse(
    fs.readFileSync(path.join(ownedRoot, "runtime.local.json"), "utf8")
  );
  for (const key of [
    "supabaseUrl",
    "anonKey",
    "serviceRoleKey",
    "email",
    "password",
    "expectedUserId",
  ]) {
    if (!runtime[key]) fail("runtime-incomplete", key);
  }
  return {
    ...process.env,
    ISSUE255_SYNC_REPRO: "1",
    ISSUE255_SYNC_CONFIG_JSON: JSON.stringify({
      supabaseUrl: runtime.supabaseUrl,
      anonKey: runtime.anonKey,
      serviceRoleKey: runtime.serviceRoleKey,
      email: runtime.email,
      password: runtime.password,
      expectedUserId: runtime.expectedUserId,
    }),
  };
}

function main() {
  const mode = process.argv[2];
  if (mode !== "probe" && mode !== "jest") {
    console.log(
      JSON.stringify({ ok: false, step: "usage", detail: "probe|jest" })
    );
    process.exit(2);
  }
  const runId = `run-${Date.now()}`;
  const runDir = path.join(ownedRoot, "evidence", "runs", runId);
  fs.mkdirSync(runDir, { recursive: true });
  let code = 3;
  try {
    identityCheck();
    raise();
    recordLineage(runDir);
    archiveTopLevel(runDir, "before");
    if (mode === "probe") {
      const script = path.join(ownedRoot, "probe-transport.js");
      const c1 = runNodeChild(false, script, ["2501"], process.env, root);
      fs.writeFileSync(
        path.join(runDir, "probe-default-flags.log"),
        `exit=${c1.status}\n${c1.stdout}\n${(c1.stderr || "").slice(-2000)}`
      );
      process.stdout.write(
        `--- probe default flags (exit ${c1.status}) ---\n${c1.stdout}`
      );
      const c2 = runNodeChild(true, script, ["2501"], process.env, root);
      fs.writeFileSync(
        path.join(runDir, "probe-raised-flags.log"),
        `exit=${c2.status}\n${c2.stdout}\n${(c2.stderr || "").slice(-2000)}`
      );
      process.stdout.write(
        `--- probe raised flags (exit ${c2.status}) ---\n${c2.stdout}`
      );
      code = c1.status === 0 && c2.status === 0 ? 0 : 1;
    } else {
      const env = configEnv();
      const workspaceDir = path.join(root, "apps", "mobile");
      const jestBin = path.join(root, "node_modules", "jest", "bin", "jest.js");
      if (!fs.existsSync(jestBin)) fail("jest-bin-missing", jestBin);
      const res = runNodeChild(
        true,
        jestBin,
        [
          "--config",
          path.join(workspaceDir, "jest.config.js"),
          "--runInBand",
          "--runTestsByPath",
          "__tests__/services/sync-pull-cap.local.integration.test.ts",
        ],
        env,
        workspaceDir
      );
      fs.writeFileSync(
        path.join(runDir, "jest.log"),
        `exit=${res.status}\n${res.stdout}\n--- stderr tail ---\n${(res.stderr || "").slice(-4000)}\n`
      );
      const tail = (res.stdout || "")
        .split("\n")
        .filter(
          (line) =>
            line.includes("issue255:") ||
            line.includes("Tests:") ||
            line.includes("✓") ||
            line.includes("×")
        );
      process.stdout.write(`${tail.join("\n")}\n`);
      code = res.status == null ? 3 : res.status;
    }
    archiveTopLevel(runDir, "after");
    console.log(JSON.stringify({ ok: true, step: "run-archived", runId }));
  } catch (error) {
    const step = error instanceof StepError ? error.step : "unexpected";
    console.log(
      JSON.stringify({
        ok: false,
        step,
        detail: String((error && error.message) || error).slice(0, 200),
      })
    );
    code = 3;
  } finally {
    try {
      restore();
    } catch (error) {
      const step =
        error instanceof StepError ? error.step : "restore-unexpected";
      console.log(
        JSON.stringify({
          ok: false,
          step,
          detail: String((error && error.message) || error).slice(0, 200),
        })
      );
      code = 3;
    }
  }
  process.exit(code);
}

main();
