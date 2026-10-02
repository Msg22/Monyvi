/**
 * MIG-078 RED-phase contract test (database-reviewer).
 *
 * Asserts the additive staging repair migration
 * `supabase/migrations/078_restore_sms_ai_get_availability.sql`
 * restores exactly the authoritative `sms_ai_get_availability`
 * definition from immutable `061_sms_ai_safeguards.sql`
 * (function lines 542-713 plus revoke/grant lines 918-923)
 * with no unrelated DDL or data changes, keeping the
 * service_role-only guard, locked search_path, and privileges.
 *
 * TDD RED: this test MUST fail while 078 is absent, then pass
 * unchanged once the GREEN-phase migration is added.
 *
 * Run: npx --no-install tsx --test scripts/__tests__/sms-ai-availability-migration.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS_DIR = join(repoRoot, "supabase", "migrations");
const SOURCE_061 = join(MIGRATIONS_DIR, "061_sms_ai_safeguards.sql");
const REPAIR_078 = join(
  MIGRATIONS_DIR,
  "078_restore_sms_ai_get_availability.sql"
);

// Immutable authoritative line ranges in 061 (1-indexed, inclusive).
// Old 061 is immutable: these pins are intentional, not magic numbers.
const FUNCTION_START_LINE = 542;
const FUNCTION_END_LINE = 713;
const GRANTS_START_LINE = 918;
const GRANTS_END_LINE = 923;

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

/** Normalize for exact comparison: ignore blank lines, trailing space, comments. */
function canonical(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function readAuthoritativeBlocks(): {
  readonly functionBlock: string;
  readonly grantsBlock: string;
} {
  const lines = readLines(SOURCE_061);
  return {
    functionBlock: sliceLines(lines, FUNCTION_START_LINE, FUNCTION_END_LINE),
    grantsBlock: sliceLines(lines, GRANTS_START_LINE, GRANTS_END_LINE),
  };
}

describe("MIG-078 sms_ai_get_availability repair contract", (): void => {
  it("repair migration 078 exists", (): void => {
    assert.equal(
      existsSync(REPAIR_078),
      true,
      `missing additive repair migration: ${REPAIR_078}`
    );
  });

  it("authoritative 061 source blocks are intact", (): void => {
    const { functionBlock, grantsBlock } = readAuthoritativeBlocks();
    assert.match(
      functionBlock,
      /^CREATE OR REPLACE FUNCTION public\.sms_ai_get_availability\(/
    );
    assert.match(functionBlock.trimEnd(), /\$function\$;\s*$/);
    assert.match(grantsBlock, /REVOKE ALL ON FUNCTION/);
    assert.match(grantsBlock, /GRANT EXECUTE ON FUNCTION/);
    assert.match(grantsBlock, /TO service_role;/);
  });

  it("078 contains exactly the authoritative function plus revoke/grant", (): void => {
    const { functionBlock, grantsBlock } = readAuthoritativeBlocks();
    const expected = canonical(`${functionBlock}\n${grantsBlock}`);
    const actual = canonical(readFileSync(REPAIR_078, "utf8"));
    assert.equal(
      actual,
      expected,
      "078 must restore exactly 061 lines 542-713 plus 918-923, nothing else"
    );
  });

  it("078 keeps the service_role guard, locked search_path, and definer", (): void => {
    const actual = readFileSync(REPAIR_078, "utf8");
    assert.match(actual, /SECURITY DEFINER/);
    assert.match(actual, /SET search_path TO 'public', 'pg_temp'/);
    assert.match(actual, /sms_ai_get_availability is service-role only/);
    assert.match(actual, /RAISE EXCEPTION 'Invalid SMS AI availability input'/);
  });

  it("078 denies PUBLIC/anon/authenticated and grants service_role only", (): void => {
    const actual = readFileSync(REPAIR_078, "utf8");
    assert.ok(
      actual.includes("REVOKE ALL ON FUNCTION public.sms_ai_get_availability(")
    );
    assert.ok(
      actual.includes(
        "GRANT EXECUTE ON FUNCTION public.sms_ai_get_availability("
      )
    );
    assert.ok(actual.includes("FROM PUBLIC, anon, authenticated;"));
    assert.ok(actual.includes("TO service_role;"));
    const grantCount = (actual.match(/GRANT EXECUTE/g) ?? []).length;
    const revokeCount = (actual.match(/REVOKE ALL/g) ?? []).length;
    assert.equal(grantCount, 1);
    assert.equal(revokeCount, 1);
  });

  it("078 carries no unrelated DDL or data changes", (): void => {
    const code = readFileSync(REPAIR_078, "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    const forbidden =
      /\b(CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+INDEX|CREATE\s+POLICY|CREATE\s+TRIGGER|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|TRUNCATE|COPY\s+\w+|SELECT\s+cron\.schedule)\b/i;
    assert.doesNotMatch(code, forbidden);
    const functionCount = (
      code.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION/gi) ?? []
    ).length;
    assert.equal(functionCount, 1);
  });
});
