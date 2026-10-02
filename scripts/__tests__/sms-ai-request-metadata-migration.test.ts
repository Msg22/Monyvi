/**
 * MIG-079 RED-phase contract test (database-reviewer).
 *
 * Asserts the additive repair migration
 * `supabase/migrations/079_restore_sms_ai_request_metadata.sql`
 * restores exactly the authoritative `sms_ai_work_requests` metadata
 * from immutable `062_fix_sms_ai_outcome_reconciliation.sql`
 * (columns + constraints lines 84-94) plus a bad-shape guard,
 * with no other changes.
 *
 * TDD RED: this test MUST fail while 079 is absent, then pass
 * unchanged once the GREEN-phase migration is added.
 *
 * Run: node node_modules/tsx/dist/cli.mjs --test scripts/__tests__/sms-ai-request-metadata-migration.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS_DIR = join(repoRoot, "supabase", "migrations");
const SOURCE_062 = join(
  MIGRATIONS_DIR,
  "062_fix_sms_ai_outcome_reconciliation.sql"
);
const REPAIR_079 = join(
  MIGRATIONS_DIR,
  "079_restore_sms_ai_request_metadata.sql"
);

// Immutable authoritative line range in 062 (1-indexed, inclusive).
// Old 062 is immutable: this pin is intentional, not a magic number.
const BLOCK_START_LINE = 84;
const BLOCK_END_LINE = 94;

function readLines(path: string): readonly string[] {
  return readFileSync(path, "utf8").split("\n");
}

function sliceLines(
  lines: readonly string[],
  startLine: number,
  endLine: number
): string {
  return lines.slice(startLine - 1, endLine).join("\n");
}

/** Normalize for comparison: ignore blank lines, trailing space, comments. */
function canonical(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function readAuthoritativeBlock(): string {
  return sliceLines(readLines(SOURCE_062), BLOCK_START_LINE, BLOCK_END_LINE);
}

describe("MIG-079 sms_ai_work_requests metadata repair contract", (): void => {
  it("repair migration 079 exists", (): void => {
    assert.equal(
      existsSync(REPAIR_079),
      true,
      `missing additive repair migration: ${REPAIR_079}`
    );
  });

  it("authoritative 062 source block is intact", (): void => {
    const block = readAuthoritativeBlock();
    assert.match(block, /ADD COLUMN IF NOT EXISTS request_digest text/);
    assert.match(
      block,
      /ADD COLUMN IF NOT EXISTS history_cooldown_seconds integer NOT NULL DEFAULT 0/
    );
    assert.match(block, /sms_ai_work_requests_request_digest_shape/);
    assert.match(block, /sms_ai_work_requests_history_cooldown_nonnegative/);
    assert.match(block, /\^\[0-9a-f\]\{64\}\$/);
    assert.match(block, /history_cooldown_seconds >= 0/);
  });

  it("079 contains the authoritative columns plus constraints", (): void => {
    const authoritative = canonical(readAuthoritativeBlock());
    const actual = canonical(readFileSync(REPAIR_079, "utf8"));
    assert.ok(
      actual.includes(authoritative),
      "079 must contain exactly 062 lines 84-94 (columns + 2 constraints)"
    );
  });

  it("079 restores nullable 64-lower-hex digest and nonnegative cooldown", (): void => {
    const actual = readFileSync(REPAIR_079, "utf8");
    assert.match(actual, /request_digest text/);
    assert.match(actual, /history_cooldown_seconds integer NOT NULL DEFAULT 0/);
    assert.match(
      actual,
      /CHECK \(request_digest IS NULL OR request_digest ~ '\^\[0-9a-f\]\{64\}\$'\)/
    );
    assert.match(actual, /CHECK \(history_cooldown_seconds >= 0\)/);
  });

  it("079 is conditional idempotent and stops on bad-shape existing", (): void => {
    const actual = readFileSync(REPAIR_079, "utf8");
    assert.match(actual, /ADD COLUMN IF NOT EXISTS request_digest/);
    assert.match(actual, /ADD COLUMN IF NOT EXISTS history_cooldown_seconds/);
    assert.match(actual, /DROP CONSTRAINT IF EXISTS/);
    assert.match(actual, /RAISE EXCEPTION/);
  });

  it("079 guard rejects bad defaults/nullability with table-scoped checks", (): void => {
    const actual = readFileSync(REPAIR_079, "utf8");
    assert.match(actual, /IS DISTINCT FROM '0'/);
    assert.doesNotMatch(actual, /NOT LIKE '%0%'/);
    assert.match(actual, /conrelid/);
    assert.match(actual, /sms_ai_work_requests'::regclass/);
  });

  it("079 carries no function, index, RLS, SMS-body, or financial changes", (): void => {
    const code = readFileSync(REPAIR_079, "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    const forbidden =
      /\b(CREATE\s+OR\s+REPLACE\s+FUNCTION|CREATE\s+(UNIQUE\s+)?INDEX|CREATE\s+POLICY|CREATE\s+TRIGGER|ALTER\s+TABLE\s+\S+\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|TRUNCATE|SELECT\s+cron\.schedule)\b/i;
    assert.doesNotMatch(code, forbidden);
    assert.doesNotMatch(code, /sms_body|raw_sms|message_body|payload_bytes/i);
    assert.doesNotMatch(
      code,
      /scan_window|market_rate|metal_|transaction|transfer/i
    );
    assert.ok(code.includes("sms_ai_work_requests"));
    const alterCount = (
      code.match(/ALTER\s+TABLE\s+public\.sms_ai_work_requests/gi) ?? []
    ).length;
    assert.equal(alterCount, 2);
  });
});
