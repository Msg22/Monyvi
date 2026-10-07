import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(__dirname, "../..");
const SERVER_ONLY_TABLE = "email_verification_resend_limits";

for (const scriptPath of [
  "scripts/sql-to-watermelon-migration.js",
  "scripts/transform-schema.js",
]) {
  test(`${scriptPath} excludes the email verification resend limiter`, () => {
    const source = readFileSync(path.join(root, scriptPath), "utf8");
    const excludedDeclaration = source.match(
      /const EXCLUDED_TABLES = \[[\s\S]*?\];/
    );

    assert.ok(excludedDeclaration);
    assert.match(
      excludedDeclaration[0],
      new RegExp(`["']${SERVER_ONLY_TABLE}["']`)
    );
  });
}
