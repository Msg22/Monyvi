/**
 * Issue #255: create dedicated fixture user + prove authenticated ID.
 * Private: reads runtime.local.json, never prints keys/password/tokens.
 * Creates NO financial rows (auth user only; zero-balance fixture safety kept).
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

async function req(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text: text.slice(0, 300) };
}

function main() {
  const ownedRoot = path.resolve(__dirname);
  const runtimePath = path.join(ownedRoot, "runtime.local.json");
  const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
  if (!runtime.password) {
    runtime.password = crypto.randomBytes(24).toString("base64url");
    fs.writeFileSync(runtimePath, JSON.stringify(runtime, null, 2), "utf8");
  }

  (async () => {
    const base = runtime.supabaseUrl.replace(/\/$/, "");
    const adminHeaders = {
      apikey: runtime.serviceRoleKey,
      Authorization: `Bearer ${runtime.serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    // 1. Create user via admin API (idempotent: already-exists is fine).
    const created = await req(`${base}/auth/v1/admin/users`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        email: runtime.email,
        password: runtime.password,
        email_confirm: true,
        user_metadata: { issue255_fixture: true },
      }),
    });
    const createdId =
      created.json &&
      (created.json.id || (created.json.user && created.json.user.id));
    const alreadyExists =
      created.status === 422 ||
      created.status === 409 ||
      (typeof created.text === "string" &&
        created.text.toLowerCase().includes("already"));

    // 2. Sign in with anon key to prove authenticated user ID.
    const signin = await req(`${base}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: runtime.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: runtime.email,
        password: runtime.password,
      }),
    });
    const authUserId = signin.json && signin.json.user && signin.json.user.id;
    if (!authUserId) throw new Error(`signin-failed status=${signin.status}`);

    runtime.expectedUserId = authUserId;
    fs.writeFileSync(runtimePath, JSON.stringify(runtime, null, 2), "utf8");

    // 3. Authenticated REST probe (empty-table response is fine; proves routing).
    const accessToken = signin.json.access_token;
    const probe = await req(`${base}/rest/v1/asset_metals?select=id&limit=1`, {
      headers: {
        apikey: runtime.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    console.log(
      JSON.stringify({
        ok: true,
        email: runtime.email,
        adminCreateStatus: created.status,
        adminCreated: Boolean(createdId),
        adminAlreadyExisted: Boolean(alreadyExists && !createdId),
        expectedUserId: authUserId,
        signinMatchesAdmin: createdId ? createdId === authUserId : true,
        restProbeStatus: probe.status,
        restProbeRows: Array.isArray(probe.json) ? probe.json.length : -1,
        financialRowsCreated: 0,
      })
    );
  })().catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        error: String((error && error.message) || error).slice(0, 200),
      })
    );
    process.exit(1);
  });
}

main();
