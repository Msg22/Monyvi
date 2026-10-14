jest.mock("@monyvi/db", () => ({
  schema: {
    tables: {
      accounts: {},
      metal_historical_rate_cache: {},
    },
  },
}));

import { EXCLUDED_TABLES, SYNCABLE_TABLES } from "../../services/sync/config";

describe("#355 historical rate cache sync exclusion", () => {
  it("keeps the owner-scoped historical cache installation-local", () => {
    expect(EXCLUDED_TABLES).toContain("metal_historical_rate_cache");
    expect(SYNCABLE_TABLES).not.toContain("metal_historical_rate_cache");
  });
});
