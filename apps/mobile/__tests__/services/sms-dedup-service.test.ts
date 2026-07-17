interface MockQuery {
  readonly fetchCount: jest.Mock<Promise<number>, []>;
}

interface MockCollection {
  readonly tableName: string;
}

let mockFetchCounts: number[] = [];
let mockScopeUserId = "user-1";
const mockQueryOwned = jest.fn<MockQuery, unknown[]>();
const mockGet = jest.fn<MockCollection, [string]>();

jest.mock("@monyvi/db", () => ({
  database: {
    get: (tableName: string) => mockGet(tableName),
  },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    notEq: jest.fn((value: unknown) => ({ notEq: value })),
    where: jest.fn((field: string, value: unknown) => ({ field, value })),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: jest.fn(() =>
    Promise.resolve({
      userId: mockScopeUserId,
      queryOwned: mockQueryOwned,
    })
  ),
}));

import { hasExistingSmsFingerprint } from "@/services/sms-dedup-service";

describe("sms-dedup-service", () => {
  beforeEach(() => {
    mockFetchCounts = [];
    mockScopeUserId = "user-1";
    mockQueryOwned.mockReset();
    mockQueryOwned.mockImplementation(() => ({
      fetchCount: jest.fn(() => Promise.resolve(mockFetchCounts.shift() ?? 0)),
    }));
    mockGet.mockReset();
    mockGet.mockImplementation((tableName: string) => ({ tableName }));
  });

  it("returns false when the SMS fingerprint is not found in transactions or transfers", async () => {
    mockFetchCounts = [0, 0];

    await expect(hasExistingSmsFingerprint("hash-1")).resolves.toBe(false);
  });

  it("returns true when the SMS fingerprint already exists in transactions", async () => {
    mockFetchCounts = [1, 0];

    await expect(hasExistingSmsFingerprint("hash-1")).resolves.toBe(true);
  });

  it("returns true when the SMS fingerprint already exists in transfers", async () => {
    mockFetchCounts = [0, 1];

    await expect(hasExistingSmsFingerprint("hash-1")).resolves.toBe(true);
  });

  it("does not query another user's scope for a pinned live-SMS event", async () => {
    mockScopeUserId = "user-2";

    await expect(hasExistingSmsFingerprint("hash-1", "user-1")).resolves.toBe(
      false
    );
    expect(mockQueryOwned).not.toHaveBeenCalled();
  });
});
