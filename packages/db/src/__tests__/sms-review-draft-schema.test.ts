import { readFileSync } from "fs";
import path from "path";

import { schema } from "../schema";

const EXPECTED_TABLES = [
  "sms_review_queues",
  "sms_review_draft_items",
  "dismissed_sms_fingerprints",
] as const;

function getColumns(tableName: string): readonly string[] {
  return schema.tables[tableName].columnArray.map((column) => column.name);
}

describe("SMS review draft local schema", () => {
  it("keeps the three indexed local-only tables after schema version 25", () => {
    expect(schema.version).toBeGreaterThanOrEqual(25);
    expect(Object.keys(schema.tables)).toEqual(
      expect.arrayContaining(EXPECTED_TABLES)
    );

    expect(getColumns("sms_review_queues")).toEqual(
      expect.arrayContaining(["user_id", "created_at", "updated_at"])
    );
    expect(getColumns("sms_review_draft_items")).toEqual(
      expect.arrayContaining([
        "queue_id",
        "user_id",
        "sms_fingerprint",
        "payload_version",
        "payload_json",
        "selection_override",
        "position",
        "parsed_at",
        "created_at",
        "updated_at",
      ])
    );
    expect(
      schema.tables.sms_review_draft_items.columns.selection_override.isOptional
    ).toBe(true);
    expect(getColumns("dismissed_sms_fingerprints")).toEqual(
      expect.arrayContaining([
        "user_id",
        "sms_fingerprint",
        "created_at",
        "updated_at",
      ])
    );
  });

  it("keeps migration and model registration explicit", () => {
    const root = path.resolve(__dirname, "..");
    const migrations = readFileSync(path.join(root, "migrations.ts"), "utf8");
    const database = readFileSync(path.join(root, "database.ts"), "utf8");

    expect(migrations).toMatch(/toVersion:\s*25[\s\S]*sms_review_queues/);
    for (const table of EXPECTED_TABLES) {
      expect(migrations).toContain(`name: "${table}"`);
    }
    expect(database).toMatch(/modelClasses:[\s\S]*SmsReviewQueue/);
    expect(database).toMatch(/modelClasses:[\s\S]*SmsReviewDraftItem/);
    expect(database).toMatch(/modelClasses:[\s\S]*DismissedSmsFingerprint/);
  });
});
