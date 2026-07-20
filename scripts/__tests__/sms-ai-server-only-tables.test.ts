import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(__dirname, "../..");

for (const scriptPath of [
  "scripts/sql-to-watermelon-migration.js",
  "scripts/transform-schema.js",
]) {
  test(`${scriptPath} excludes both server-only SMS AI ledgers`, () => {
    const source = readFileSync(path.join(root, scriptPath), "utf8");

    assert.match(
      source,
      /EXCLUDED_TABLES[\s\S]*sms_ai_work_requests[\s\S]*sms_ai_usage_events/
    );
  });
}

test("the Watermelon migration generator preserves existing raw SQL imports", () => {
  const generator = readFileSync(
    path.join(root, "scripts/sql-to-watermelon-migration.js"),
    "utf8"
  );
  const migrations = readFileSync(
    path.join(root, "packages/db/src/migrations.ts"),
    "utf8"
  );

  assert.match(generator, /hasUnsafeExecuteSql/);
  assert.match(generator, /content\.includes\("unsafeExecuteSql\("\)/);
  assert.match(migrations, /import \{[\s\S]*unsafeExecuteSql/);
});
