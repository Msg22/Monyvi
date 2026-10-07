/**
 * Issue #255 transport probe: same long-URI child lookup the sync performs,
 * executed with real fetch/auth against the dedicated backend.
 * Prints ONLY: url length, outcome, HTTP status, response header byte sizes,
 * error name/code/message snippet. NEVER keys, tokens, or full URLs.
 */
const fs = require("fs");
const path = require("path");

function fixtureUuid(index) {
  return `25500002-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function describeError(error, depth) {
  if (!error || depth > 4) return null;
  const out = {
    name: error.name,
    code: error.code,
    message: String(error.message || "").slice(0, 200),
  };
  if (error.cause !== undefined && error.cause !== null) {
    out.cause =
      typeof error.cause === "object"
        ? describeError(error.cause, depth + 1)
        : String(error.cause).slice(0, 120);
  }
  return out;
}

async function main() {
  const ownedRoot = path.resolve(__dirname);
  const runtime = JSON.parse(
    fs.readFileSync(path.join(ownedRoot, "runtime.local.json"), "utf8")
  );
  const parentCount = Number(process.argv[2] || "2501");
  const idList = Array.from({ length: parentCount }, (_, i) =>
    fixtureUuid(i + 1)
  ).join(",");
  const url = `${runtime.supabaseUrl.replace(/\/$/, "")}/rest/v1/asset_metals?select=id&asset_id=in.(${idList})`;

  const started = Date.now();
  let result;
  try {
    const res = await fetch(url, { headers: { apikey: runtime.anonKey } });
    const headers = {};
    let headerBytes = 0;
    for (const [k, v] of res.headers.entries()) {
      headers[k] = v.length;
      headerBytes += k.length + v.length;
    }
    const body = await res.text();
    result = {
      ok: true,
      urlLength: url.length,
      status: res.status,
      headerBytes,
      contentLocationLength: headers["content-location"] ?? null,
      bodyLength: body.length,
      bodySnippet: body.slice(0, 120),
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    result = {
      ok: false,
      urlLength: url.length,
      elapsedMs: Date.now() - started,
      error: describeError(error, 0),
    };
  }
  console.log(
    JSON.stringify({
      parentCount,
      maxHeaderSize: require("http").maxHeaderSize,
      ...result,
    })
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({ ok: false, fatal: String(error).slice(0, 160) })
  );
  process.exit(1);
});
