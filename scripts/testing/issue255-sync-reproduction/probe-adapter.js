/** Probe installed Watermelon sqlite-node driver lifecycle (no secrets). */
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..", "..", "..");
const driver = path.join(
  root,
  "node_modules",
  "@nozbe",
  "watermelondb",
  "adapters",
  "sqlite",
  "sqlite-node",
  "DatabaseDriver.js"
);
const db = path.join(
  root,
  "node_modules",
  "@nozbe",
  "watermelondb",
  "adapters",
  "sqlite",
  "sqlite-node",
  "Database.js"
);
const dispatcher = path.join(
  root,
  "node_modules",
  "@nozbe",
  "watermelondb",
  "adapters",
  "sqlite",
  "makeDispatcher",
  "index.js"
);
function show(file, names) {
  const src = fs.readFileSync(file, "utf8").split("\n");
  const out = [];
  names.forEach((name) => {
    const i = src.findIndex((l) => l.includes(name));
    if (i === -1) {
      out.push(`### ${name}: NOT FOUND`);
      return;
    }
    out.push(`### ${name} (line ${i + 1}):`);
    out.push(src.slice(Math.max(0, i - 2), i + 30).join("\n"));
  });
  return out.join("\n");
}
console.log(
  show(driver, [
    "setUpWithSchema",
    "unsafeResetDatabase",
    "unsafeDestroyEverything",
    "cached",
    "dbName",
  ])
);
console.log(show(db, ["unsafeDestroyEverything", "unlink"]));
console.log(show(dispatcher, ["cache", "dbName"]));
// Cleanup: remove stale file-backed artifacts from failed Windows runs.
const staleDir = path.join(root, "apps", "mobile");
for (const entry of fs.readdirSync(staleDir)) {
  if (/^issue255-sync-repro-\d+\.db(-wal|-shm)?$/.test(entry)) {
    try {
      fs.unlinkSync(path.join(staleDir, entry));
      console.log(`removed stale ${entry}`);
    } catch (error) {
      console.log(`keep stale ${entry}: ${String(error).slice(0, 120)}`);
    }
  }
}
