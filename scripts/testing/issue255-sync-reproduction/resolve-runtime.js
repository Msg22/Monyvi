/**
 * Issue #255: privately resolve dedicated backend keys via local CLI status.
 * Keys stay in runtime.local.json (gitignored). Stdout is redacted: no keys.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function pickStatusJson(raw) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start)
    throw new Error("status-output-not-json");
  return JSON.parse(raw.slice(start, end + 1));
}

function findKey(obj, names) {
  const seen = [];
  (function walk(v) {
    if (typeof v === "string") {
      for (const n of names) {
        if (v.startsWith(n)) seen.push(v);
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (v && typeof v === "object") {
      for (const value of Object.values(v)) walk(value);
    }
  })(obj);
  return seen[0];
}

function main() {
  const root = path.resolve(__dirname, "..", "..", "..");
  const ownedRoot = path.join(
    root,
    "scripts",
    "testing",
    "issue255-sync-reproduction"
  );
  const cli = path.join(
    root,
    "node_modules",
    "supabase",
    "dist",
    "supabase.js"
  );

  const raw = execFileSync(
    process.execPath,
    [
      cli,
      "status",
      "--workdir",
      "scripts/testing/issue255-sync-reproduction",
      "-o",
      "json",
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 60000,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  const status = pickStatusJson(raw);
  const text = JSON.stringify(status);

  const anonKey =
    status.ANON_KEY ||
    status.anonKey ||
    status.anon_key ||
    status.PUBLISHABLE_KEY ||
    status.publishableKey ||
    status.publishable_key ||
    findKey(status, ["sb_publishable_", "eyJ"]);
  const serviceRoleKey =
    status.SERVICE_ROLE_KEY ||
    status.serviceRoleKey ||
    status.service_role_key ||
    status.SECRET_KEY ||
    status.secretKey ||
    status.secret_key ||
    findKey(status, ["sb_secret_"]);
  const url =
    status.API_URL ||
    status.apiUrl ||
    status.api_url ||
    status.projectUrl ||
    status.project_url ||
    "http://127.0.0.1:54341";

  if (!anonKey || !serviceRoleKey) throw new Error("keys-not-found-in-status");

  const prevPath = path.join(ownedRoot, "runtime.local.json");
  let prev = {};
  try {
    prev = JSON.parse(fs.readFileSync(prevPath, "utf8"));
  } catch {
    prev = {};
  }

  const runtime = {
    supabaseUrl:
      typeof url === "string" && url.startsWith("http")
        ? url
        : "http://127.0.0.1:54341",
    anonKey,
    serviceRoleKey,
    email: prev.email || "issue255@monyvi.test",
    password: prev.password || undefined,
    expectedUserId: prev.expectedUserId || undefined,
  };
  fs.writeFileSync(prevPath, JSON.stringify(runtime, null, 2), "utf8");

  // Redacted stdout only.
  console.log(
    JSON.stringify({
      ok: true,
      supabaseUrl: runtime.supabaseUrl,
      hasAnonKey: true,
      hasServiceRoleKey: true,
      hasPassword: Boolean(runtime.password),
      hasExpectedUserId: Boolean(runtime.expectedUserId),
      statusKeys: Object.keys(status).slice(0, 20),
      urlPresentInStatus: text.includes("54341"),
    })
  );
}

main();
