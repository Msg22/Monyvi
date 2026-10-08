/* Local-only opt-in launcher. Never reads root env or prints runtime credentials. */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");

const root = path.resolve(__dirname, "../../..");
const runtimePath = process.argv[2];
const evidencePath = process.argv[3];
if (!runtimePath || !evidencePath) {
  throw new Error(
    "Usage: node issue255-historical-recovery-run.cjs <private-runtime.json> <outside-evidence-directory>"
  );
}
const evidence = path.resolve(evidencePath);
if (evidence.startsWith(root + path.sep))
  throw new Error("Evidence must be outside the checkout");
const runtime = JSON.parse(fs.readFileSync(path.resolve(runtimePath), "utf8"));
for (const field of [
  "supabaseUrl",
  "anonKey",
  "serviceRoleKey",
  "email",
  "password",
  "expectedUserId",
]) {
  if (typeof runtime[field] !== "string" || !runtime[field])
    throw new Error("Incomplete private runtime");
}
const url = new URL(runtime.supabaseUrl);
if (
  url.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.port !== "54341" ||
  !/^issue255.*@monyvi\.test$/i.test(runtime.email) ||
  !/^[0-9a-f-]{36}$/i.test(runtime.expectedUserId)
)
  throw new Error("Owned synthetic runtime required");

function docker(args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000,
  });
  if (result.status !== 0)
    throw new Error("Owned Docker readiness unavailable");
  return result.stdout.trim();
}
const dbPorts = JSON.parse(
  docker([
    "inspect",
    "--format",
    "{{json .NetworkSettings.Ports}}",
    "supabase_db_monyvi-issue255-repro",
  ])
);
const apiPorts = JSON.parse(
  docker([
    "inspect",
    "--format",
    "{{json .NetworkSettings.Ports}}",
    "supabase_kong_monyvi-issue255-repro",
  ])
);
if (
  !dbPorts["5432/tcp"]?.some((p) => p.HostPort === "54342") ||
  !apiPorts["8000/tcp"]?.some((p) => p.HostPort === "54341")
)
  throw new Error("Owned port identity mismatch");
const migration = docker([
  "exec",
  "supabase_db_monyvi-issue255-repro",
  "psql",
  "-X",
  "-qAt",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-c",
  "SELECT max(version) FROM supabase_migrations.schema_migrations",
]);
if (migration !== "085")
  throw new Error(
    "Expected owned migration 085; review runner before changing contract"
  );
fs.mkdirSync(evidence, { recursive: true });
const suite = path.join(__dirname, "issue255-historical-recovery-live.test.js");
const mobile = path.join(root, "apps/mobile");
const config = {
  ...require(path.join(mobile, "jest.config.js")),
  rootDir: mobile,
  roots: [mobile, __dirname],
  testMatch: [suite.replaceAll("\\", "/")],
};
const configPath = path.join(evidence, "jest.live.config.json");
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
fs.writeFileSync(
  path.join(evidence, "invocation.json"),
  JSON.stringify(
    {
      migration,
      backend: "monyvi-issue255-repro",
      ports: [54341, 54342],
      owner: runtime.expectedUserId,
      source: path.relative(root, suite),
      sha256: createHash("sha256").update(fs.readFileSync(suite)).digest("hex"),
      startedAt: new Date().toISOString(),
    },
    null,
    2
  )
);
const env = {
  ...process.env,
  ISSUE255_SYNC_REPRO: "1",
  ISSUE255_SYNC_CONFIG_JSON: JSON.stringify(runtime),
  ISSUE255_EVIDENCE_DIR: evidence,
};
const log = fs.openSync(path.join(evidence, "jest.live.log"), "w");
const result = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules/jest/bin/jest.js"),
    "--config",
    configPath,
    "--runInBand",
    "--runTestsByPath",
    suite,
    "--json",
    "--outputFile",
    path.join(evidence, "jest.live.results.json"),
  ],
  {
    cwd: mobile,
    env,
    stdio: ["ignore", log, log],
    timeout: 900000,
    windowsHide: true,
  }
);
fs.closeSync(log);
fs.writeFileSync(
  path.join(evidence, "completion.json"),
  JSON.stringify(
    {
      exitCode: result.status,
      signal: result.signal,
      finishedAt: new Date().toISOString(),
      timedOut: result.error?.code === "ETIMEDOUT",
    },
    null,
    2
  )
);
process.exit(result.status ?? 3);
