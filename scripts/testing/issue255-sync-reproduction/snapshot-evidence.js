/**
 * Issue #255: snapshot current evidence dir into evidence/<label>/ before a
 * gateway-parameter rerun. Redacted manifests only; never touches secrets.
 */
const fs = require("fs");
const path = require("path");

function main() {
  const ownedRoot = path.resolve(__dirname);
  const label = process.argv[2] || "default-gateway";
  const src = path.join(ownedRoot, "evidence");
  const dst = path.join(src, label);
  fs.mkdirSync(dst, { recursive: true });
  let copied = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    fs.copyFileSync(path.join(src, entry.name), path.join(dst, entry.name));
    copied += 1;
  }
  console.log(JSON.stringify({ ok: true, label, copied }));
}

main();
