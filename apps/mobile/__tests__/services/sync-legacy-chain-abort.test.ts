const mockSynchronize = jest.fn();
const mockRepairLegacyAdds = jest.fn();
const mockRepairLegacyEdits = jest.fn();

jest.mock("@monyvi/db", () => ({
  schema: {
    tables: {
      accounts: {},
      asset_metals: {},
      assets: {},
      categories: {},
      financial_action_groups: {},
      profiles: {},
      transactions: {},
    },
  },
}));

jest.mock("@nozbe/watermelondb/sync", () => ({
  synchronize: (args: unknown): Promise<unknown> =>
    mockSynchronize(args) as Promise<unknown>,
}));

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: jest.fn().mockResolvedValue("current-user"),
  supabase: {},
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("../../services/legacy-metal-add-repair-service", () => ({
  repairLegacyMetalAdds: (...args: readonly unknown[]): unknown =>
    mockRepairLegacyAdds(...args),
}));

jest.mock("../../services/legacy-metal-edit-repair-service", () => ({
  repairLegacyMetalEdits: (...args: readonly unknown[]): unknown =>
    mockRepairLegacyEdits(...args),
}));

import type { Database } from "@nozbe/watermelondb";

import { syncDatabase } from "../../services/sync";

function makeDatabase(): Database {
  return {
    adapter: {
      getLocal: jest.fn().mockResolvedValue("current-user"),
      setLocal: jest.fn().mockResolvedValue(undefined),
    },
  } as unknown as Database;
}

describe("syncDatabase legacy chain abort", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepairLegacyAdds.mockResolvedValue({ repaired: 0, skipped: [] });
    mockRepairLegacyEdits.mockResolvedValue({ repaired: 0, skipped: [] });
    mockSynchronize.mockResolvedValue(undefined);
  });

  it("aborts before synchronize when a legacy Add is superseded by a chained Edit", async () => {
    mockRepairLegacyAdds.mockResolvedValue({
      repaired: 0,
      skipped: [
        {
          actionId: "20000000-0000-4000-8000-000000000012",
          reason: "superseded",
        },
      ],
    });

    await expect(syncDatabase(makeDatabase())).rejects.toThrow(
      "sync_legacy_metal_chain_unsafe"
    );
    expect(mockSynchronize).not.toHaveBeenCalled();
    expect(mockRepairLegacyEdits).not.toHaveBeenCalled();
  });

  it("continues sync when a legacy Add skip is malformed rather than chained", async () => {
    mockRepairLegacyAdds.mockResolvedValue({
      repaired: 0,
      skipped: [
        {
          actionId: "20000000-0000-4000-8000-000000000099",
          reason: "malformed",
        },
      ],
    });

    await expect(syncDatabase(makeDatabase())).resolves.toBeUndefined();
    expect(mockSynchronize).toHaveBeenCalledTimes(1);
  });
});
