import { readFileSync } from "fs";
import path from "path";

import { SmsAiNegativeOutcome } from "../../../../packages/db/src/models/SmsAiNegativeOutcome";
import { schema } from "../../../../packages/db/src/schema";

jest.mock("@monyvi/db", () => {
  const actualSchema = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  return { schema: actualSchema.schema };
});

import { SYNCABLE_TABLES } from "@/services/sync/config";
import {
  isReadOnlyTable,
  isServerOwnedUserTable,
} from "@/services/sync/table-predicates";

function getColumnNames(tableName: string): readonly string[] {
  return schema.tables[tableName].columnArray.map((column) => column.name);
}

describe("SMS AI negative-outcome Watermelon registration", () => {
  it("registers the pull-only model and privacy-safe fields", () => {
    const columns = getColumnNames("sms_ai_negative_outcomes");
    const databaseSource = readFileSync(
      path.resolve(__dirname, "../../../../packages/db/src/database.ts"),
      "utf8"
    );

    expect(SmsAiNegativeOutcome.table).toBe("sms_ai_negative_outcomes");
    expect(databaseSource).toContain(
      'import { SmsAiNegativeOutcome } from "./models/SmsAiNegativeOutcome"'
    );
    expect(databaseSource).toMatch(/modelClasses:[\s\S]*SmsAiNegativeOutcome/);
    expect(columns).toEqual(
      expect.arrayContaining([
        "user_id",
        "sms_fingerprint",
        "original_received_at",
        "strike_count",
        "is_terminal",
        "terminal_at",
        "last_classified_at",
        "created_at",
        "updated_at",
        "deleted",
      ])
    );
    expect(columns).not.toEqual(
      expect.arrayContaining(["sms_body", "sender", "amount", "merchant"])
    );
  });

  it("syncs the table by scoped pull while excluding it from push", () => {
    expect(SYNCABLE_TABLES).toContain("sms_ai_negative_outcomes");
    expect(isReadOnlyTable("sms_ai_negative_outcomes")).toBe(true);
    expect(isServerOwnedUserTable("sms_ai_negative_outcomes")).toBe(true);
  });
});
