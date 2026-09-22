const assert = require("node:assert/strict");
const { readdirSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

test("Supabase migration versions are unique so a clean database can replay them", () => {
  const files = readdirSync(path.join(__dirname, "../supabase/migrations"))
    .filter((file) => /^\d+_.+\.sql$/.test(file));
  const versions = files.map((file) => file.split("_")[0]);
  assert.equal(new Set(versions).size, versions.length, "Duplicate migration version blocks Supabase startup");
});
