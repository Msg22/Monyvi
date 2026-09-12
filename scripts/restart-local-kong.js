const { spawnSync } = require("node:child_process");

const LOCAL_KONG_HEALTH_URL = "http://127.0.0.1:54321/auth/v1/health";
const KONG_CONTAINER_FILTER = "name=supabase_kong_";
const HEALTH_TIMEOUT_MS = 30000;
const HEALTH_POLL_INTERVAL_MS = 1000;

function runDocker(args) {
  return spawnSync("docker", args, { encoding: "utf8" });
}

function findKongContainers() {
  const result = runDocker([
    "ps",
    "--filter",
    KONG_CONTAINER_FILTER,
    "--format",
    "{{.Names}}",
  ]);
  if (result.status !== 0) {
    throw new Error(
      `docker ps failed: ${result.stderr ?? result.error?.message ?? "unknown error"}`
    );
  }
  return result.stdout
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForKongHealth() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const remainingBeforeFetch = deadline - Date.now();
    if (remainingBeforeFetch <= 0) break;
    try {
      const response = await fetch(LOCAL_KONG_HEALTH_URL, {
        signal: AbortSignal.timeout(Math.max(1, remainingBeforeFetch)),
      });
      if (response.ok && Date.now() < deadline) {
        return true;
      }
    } catch {
      // Kong is still restarting; keep polling until the deadline.
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(HEALTH_POLL_INTERVAL_MS, remainingMs));
  }
  return false;
}

async function main() {
  let names;
  try {
    names = findKongContainers();
  } catch (error) {
    console.warn(
      `Skipping local Kong restart: ${error instanceof Error ? error.message : String(error)}`
    );
    return;
  }

  if (names.length === 0) {
    console.warn("Skipping local Kong restart: no running Kong container.");
    return;
  }

  for (const name of names) {
    const restart = runDocker(["restart", name]);
    if (restart.status !== 0) {
      throw new Error(
        `Failed to restart ${name}: ${restart.stderr ?? restart.error?.message ?? "unknown error"}`
      );
    }
    console.log(`Restarted ${name} to refresh upstream routes after db reset.`);
  }

  if (!(await waitForKongHealth())) {
    console.warn(
      `Kong did not report healthy at ${LOCAL_KONG_HEALTH_URL} within ${HEALTH_TIMEOUT_MS / 1000}s.`
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = { findKongContainers, main };
