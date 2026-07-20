jest.mock("@monyvi/db", () => ({
  schema: {
    tables: {
      accounts: {},
      account_sms_senders: {},
      asset_metals: {},
      bank_details: {},
      profiles: {},
    },
  },
}));

import {
  CHILD_TABLE_NAMES,
  CHILD_TABLES_MAP,
  EXCLUDED_TABLES,
  SYNCABLE_TABLES,
} from "../../services/sync/config";

describe("sync child table configuration", () => {
  it("treats account_sms_senders as an account-owned child table", () => {
    expect(CHILD_TABLE_NAMES).toContain("account_sms_senders");
    expect(CHILD_TABLES_MAP.account_sms_senders).toEqual({
      parentTable: "accounts",
      foreignKey: "account_id",
    });
  });

  it("includes account_sms_senders in syncable local tables", () => {
    expect(SYNCABLE_TABLES).toContain("account_sms_senders");
  });

  it("excludes every server-only SMS safeguard table from mobile sync", () => {
    expect(EXCLUDED_TABLES).toEqual(
      expect.arrayContaining([
        "sms_ai_work_requests",
        "sms_ai_usage_events",
        "sms_ai_scan_sessions",
      ])
    );
  });
});
