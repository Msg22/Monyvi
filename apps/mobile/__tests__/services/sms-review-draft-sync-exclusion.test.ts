jest.mock("@monyvi/db", () => ({
  schema: {
    tables: {
      accounts: {},
      sms_review_queues: {},
      sms_review_draft_items: {},
      dismissed_sms_fingerprints: {},
    },
  },
}));

import { EXCLUDED_TABLES, SYNCABLE_TABLES } from "../../services/sync/config";

const LOCAL_DRAFT_TABLES = [
  "sms_review_queues",
  "sms_review_draft_items",
  "dismissed_sms_fingerprints",
] as const;

describe("SMS review draft sync exclusion", () => {
  it.each(LOCAL_DRAFT_TABLES)("never syncs %s", (table) => {
    expect(EXCLUDED_TABLES).toContain(table);
    expect(SYNCABLE_TABLES).not.toContain(table);
  });
});
