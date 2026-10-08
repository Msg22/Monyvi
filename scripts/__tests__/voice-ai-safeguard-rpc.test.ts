import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/086_voice_ai_usage_limits.sql"
);
const migrationExists = existsSync(migrationPath);
const requiresMigration = { skip: !migrationExists };

function readMigration(): string {
  return readFileSync(migrationPath, "utf8");
}

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
}

function readCreateTableBody(sql: string, tableName: string): string {
  const match = sql.match(
    new RegExp(
      `CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+public\\.${tableName}\\s*\\(([\\s\\S]*?)\\)\\s*;`,
      "i"
    )
  );
  assert.ok(match, `missing CREATE TABLE for ${tableName}`);
  return match[1] ?? "";
}

function assertServiceRoleOnly(sql: string, functionName: string): void {
  assert.match(
    sql,
    new RegExp(
      `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${functionName}\\([^;]*\\)\\s+FROM\\s+PUBLIC,\\s*anon,\\s*authenticated\\s*;`,
      "i"
    )
  );
  assert.match(
    sql,
    new RegExp(
      `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${functionName}\\([^;]*\\)\\s+TO\\s+service_role\\s*;`,
      "i"
    )
  );
}

test("T006 voice safeguard migration exists as an explicit production artifact", () => {
  assert.equal(
    migrationExists,
    true,
    `missing expected migration: ${migrationPath}`
  );
});

test(
  "creates exactly two privacy-safe voice operational tables",
  requiresMigration,
  () => {
    const sql = stripSqlComments(readMigration());
    const voiceTables = [
      ...sql.matchAll(
        /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+public\.(voice_ai_[a-z_]+)/gi
      ),
    ].map((match) => match[1]);

    assert.deepEqual(
      [...voiceTables].sort(),
      ["voice_ai_usage_windows", "voice_ai_work_requests"].sort()
    );

    const usageWindowBody = readCreateTableBody(sql, "voice_ai_usage_windows");
    const workRequestBody = readCreateTableBody(sql, "voice_ai_work_requests");

    assert.match(usageWindowBody, /\buser_id\s+uuid\b/i);
    assert.match(usageWindowBody, /\btime_zone\s+text\b/i);
    assert.match(workRequestBody, /\buser_id\s+uuid\s+NOT NULL\b/i);
    assert.match(workRequestBody, /\brequest_key\s+text\s+NOT NULL\b/i);
    assert.match(
      sql,
      /(?:UNIQUE\s*\(\s*user_id\s*,\s*request_key\s*\)|CREATE\s+UNIQUE\s+INDEX[\s\S]*?voice_ai_work_requests[\s\S]*?\(\s*user_id\s*,\s*request_key\s*\))/i
    );

    const persistedColumns = `${usageWindowBody}\n${workRequestBody}`;
    for (const forbiddenColumn of [
      "audio",
      "transcript",
      "original_transcript",
      "amount",
      "currency",
      "counterparty",
      "account_id",
      "category_id",
      "provider_request",
      "provider_response",
    ]) {
      assert.doesNotMatch(
        persistedColumns,
        new RegExp(`\\b${forbiddenColumn}\\s+`, "i"),
        forbiddenColumn
      );
    }
  }
);

test(
  "keeps voice tables server-only and denies ordinary table access",
  requiresMigration,
  () => {
    const sql = stripSqlComments(readMigration());

    for (const tableName of [
      "voice_ai_usage_windows",
      "voice_ai_work_requests",
    ]) {
      assert.match(
        sql,
        new RegExp(
          `ALTER\\s+TABLE\\s+public\\.${tableName}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
          "i"
        )
      );
      assert.match(
        sql,
        new RegExp(
          `REVOKE\\s+ALL\\s+ON\\s+(?:TABLE\\s+)?public\\.${tableName}\\s+FROM\\s+PUBLIC,\\s*anon,\\s*authenticated\\s*;`,
          "i"
        )
      );
    }

    assert.doesNotMatch(
      sql,
      /CREATE\s+POLICY[\s\S]*?ON\s+public\.voice_ai_(?:usage_windows|work_requests)[\s\S]*?TO\s+authenticated/i
    );
    assert.doesNotMatch(
      sql,
      /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)[^;]*ON\s+(?:TABLE\s+)?public\.voice_ai_(?:usage_windows|work_requests)[^;]*TO\s+(?:PUBLIC|anon|authenticated)\s*;/i
    );
  }
);

test(
  "restricts every voice safeguard RPC to service_role",
  requiresMigration,
  () => {
    const sql = stripSqlComments(readMigration());
    const requiredFunctions = [
      "voice_ai_get_availability",
      "voice_ai_reserve_work",
      "voice_ai_mark_provider_started",
      "voice_ai_release_work",
      "voice_ai_complete_work",
    ];

    for (const functionName of requiredFunctions) {
      assert.match(
        sql,
        new RegExp(
          `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${functionName}\\s*\\(`,
          "i"
        ),
        `missing required RPC ${functionName}`
      );
      assertServiceRoleOnly(sql, functionName);
    }

    const cleanupMatch = sql.match(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(voice_ai_[a-z_]*cleanup[a-z_]*)\s*\(/i
    );
    assert.ok(cleanupMatch, "missing bounded voice cleanup RPC");
    const cleanupFunctionName = cleanupMatch[1];
    assert.ok(cleanupFunctionName, "cleanup RPC name must be present");
    assertServiceRoleOnly(sql, cleanupFunctionName);

    assert.doesNotMatch(
      sql,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.voice_ai_[^;]+\s+TO\s+(?:PUBLIC|anon|authenticated)\s*;/i
    );
  }
);

test("does not modify SMS safeguard objects", requiresMigration, () => {
  assert.doesNotMatch(stripSqlComments(readMigration()), /\bsms_ai_/i);
});
