/**
 * Issue #255 dedicated disposable backend preparer.
 * Owned scope only: writes under scripts/testing/issue255-sync-reproduction/.
 * Never touches production supabase/config.toml or shared *_Monyvi stack.
 *
 * What it does:
 * 1. Creates owned supabase/ dir + minimal config.toml with
 *    project_id monyvi-issue255-repro and loopback ports distinct
 *    from shared 54321/54322/54323/54324/54327.
 * 2. Copies immutable application migrations from <root>/supabase/migrations
 *    into owned supabase/migrations (no edits, no seed, no fake history).
 */
const fs = require("fs");
const path = require("path");

function main() {
  const root = path.resolve(__dirname, "..", "..", "..");
  const ownedRoot = path.resolve(
    root,
    "scripts",
    "testing",
    "issue255-sync-reproduction"
  );
  const ownedSupabase = path.join(ownedRoot, "supabase");
  const ownedMigrations = path.join(ownedSupabase, "migrations");
  const srcMigrations = path.join(root, "supabase", "migrations");

  fs.mkdirSync(ownedSupabase, { recursive: true });
  fs.mkdirSync(ownedMigrations, { recursive: true });

  const config = `# Dedicated disposable backend for Monyvi #255 sync-reproduction.
# Owned scope only. Never edit production supabase/config.toml.
project_id = "monyvi-issue255-repro"

[api]
enabled = true
port = 54341
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54342
shadow_port = 54340
major_version = 17

[db.pooler]
enabled = false
port = 54349
pool_mode = "transaction"
default_pool_size = 20
max_client_conn = 100

[db.migrations]
enabled = true
schema_paths = []

[db.seed]
enabled = false
sql_paths = []

[realtime]
enabled = false

[studio]
enabled = false
port = 54343
api_url = "http://127.0.0.1"

[inbucket]
enabled = false
port = 54344

[storage]
enabled = false

[auth]
enabled = true
site_url = "http://127.0.0.1:3000"
additional_redirect_urls = ["https://127.0.0.1:3000", "monyvi://auth-callback"]
jwt_expiry = 3600
enable_refresh_token_rotation = true
refresh_token_reuse_interval = 10
enable_signup = true
enable_anonymous_sign_ins = false
enable_manual_linking = false
minimum_password_length = 6
password_requirements = ""

[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = false
secure_password_change = false
max_frequency = "2m"
otp_length = 6
otp_expiry = 600

[auth.sms]
enable_signup = false
enable_confirmations = false
template = "Your code is {{ .Code }}"
max_frequency = "5s"

[edge_runtime]
enabled = false
policy = "per_worker"
inspector_port = 8093

[analytics]
enabled = false
port = 54347
backend = "postgres"
`;

  fs.writeFileSync(path.join(ownedSupabase, "config.toml"), config, "utf8");

  const entries = fs
    .readdirSync(srcMigrations)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let copied = 0;
  for (const f of entries) {
    const src = path.join(srcMigrations, f);
    const dst = path.join(ownedMigrations, f);
    fs.copyFileSync(src, dst);
    copied += 1;
  }

  // Write a non-secret manifest (no keys) for the runner.
  const manifest = {
    project_id: "monyvi-issue255-repro",
    workdir: "scripts/testing/issue255-sync-reproduction",
    api_port: 54341,
    db_port: 54342,
    shadow_port: 54340,
    studio_port: 54343,
    inbucket_port: 54344,
    analytics_port: 54347,
    migrations_copied: copied,
    migration_files: entries,
    shared_stack_untouched: [54321, 54322, 54323, 54324, 54327],
  };
  fs.writeFileSync(
    path.join(ownedRoot, "backend-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  console.log(
    JSON.stringify({
      ok: true,
      migrations_copied: copied,
      project_id: manifest.project_id,
    })
  );
}

main();
