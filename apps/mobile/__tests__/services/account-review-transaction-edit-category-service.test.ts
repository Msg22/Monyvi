/**
 * #395 T054 tests first: authenticated accessible category admission.
 * No SMS writer or account balance mock; this isolates current-owner query
 * and verifies that untrusted/deleted/hidden/foreign categories never reach
 * the pure edit reducer as evidence.
 */
import { waitFor } from "@testing-library/react-native";
import { loadCurrentAccountReviewEditorCategories } from "@/services/account-review-transaction-edit-category-service";

const OWNER = "00000000-0000-4000-8000-000000000123";
const FOREIGN = "00000000-0000-4000-8000-000000000124";
let mockCurrentOwner = OWNER;
let mockRecords: Array<{
  id: string;
  userId: string | null;
  isSystem: boolean;
  deleted: boolean;
  isHidden: boolean;
  isInternal: boolean;
  type: "EXPENSE" | "INCOME" | null;
  displayName: string;
  level: number;
  parentId?: string;
}> = [];
let mockQueryInvoked = 0;
let mockHoldRead = false;
let mockReleaseRead: (() => void) | null = null;

jest.mock("@monyvi/db", () => ({
  database: {
    get: (name: string) => {
      if (name !== "categories") throw new Error("Unexpected collection");
      return { table: "categories" };
    },
  },
}));

jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: () =>
    Promise.resolve({
      userId: mockCurrentOwner,
      queryAccessibleCategories: (
        _collection: unknown,
        ..._conditions: unknown[]
      ) => ({
        fetch: async () => {
          mockQueryInvoked += 1;
          if (mockHoldRead) {
            await new Promise<void>((resolve) => {
              mockReleaseRead = resolve;
            });
          }
          // Deliberately return extra mockRecords to prove that the service
          // does not trust an adapter's filtering alone.
          return mockRecords;
        },
      }),
    }),
  assertExpectedCurrentUser: (expected: string): Promise<void> =>
    mockCurrentOwner === expected
      ? Promise.resolve()
      : Promise.reject(new Error("auth_scope_changed")),
}));

function category(
  id: string,
  overrides: Partial<(typeof mockRecords)[number]> = {}
): (typeof mockRecords)[number] {
  return {
    id,
    userId: null,
    isSystem: true,
    deleted: false,
    isHidden: false,
    isInternal: false,
    type: "EXPENSE",
    displayName: "Verified category",
    level: 1,
    ...overrides,
  };
}

const CAT = "00000000-0000-4000-8000-000000000125";

beforeEach(() => {
  mockCurrentOwner = OWNER;
  mockQueryInvoked = 0;
  mockRecords = [];
  mockHoldRead = false;
  mockReleaseRead = null;
});

describe("#395 FR-019 authenticated category snapshots", () => {
  it("filters inaccessible, inactive and incompatible category records while retaining legitimate system/current-owner rows", async () => {
    mockRecords = [
      category(CAT),
      category("00000000-0000-4000-8000-000000000126", {
        userId: OWNER,
        isSystem: false,
        type: "INCOME",
        displayName: "Salary",
      }),
      category("00000000-0000-4000-8000-000000000127", {
        userId: FOREIGN,
        isSystem: false,
      }),
      category("00000000-0000-4000-8000-000000000128", { deleted: true }),
      category("00000000-0000-4000-8000-000000000129", { isHidden: true }),
      category("00000000-0000-4000-8000-000000000130", { isInternal: true }),
      category("00000000-0000-4000-8000-000000000131", {
        userId: null,
        isSystem: false,
      }),
      category("00000000-0000-4000-8000-000000000132", { type: null }),
    ];
    const result = await loadCurrentAccountReviewEditorCategories(OWNER);
    expect(mockQueryInvoked).toBe(1);
    expect(result.snapshot.ownerId).toBe(OWNER);
    expect(result.snapshot.categories.map((row) => row.id)).toEqual([
      CAT,
      "00000000-0000-4000-8000-000000000126",
    ]);
    expect(result.records.map((row) => row.id)).toEqual(
      result.snapshot.categories.map((row) => row.id)
    );
  });

  it("rejects foreign active owners before exposing a category", async () => {
    mockRecords = [category(CAT)];
    await expect(
      loadCurrentAccountReviewEditorCategories(FOREIGN)
    ).rejects.toThrow("review_owner_changed");
  });

  it("rechecks the authenticated actor after the awaited database query", async () => {
    mockRecords = [category(CAT)];
    mockHoldRead = true;
    const promise = loadCurrentAccountReviewEditorCategories(OWNER);
    await waitFor(() => expect(mockQueryInvoked).toBe(1));
    mockCurrentOwner = FOREIGN;
    const release = mockReleaseRead;
    if (!release) throw new Error("Mock category read never reached barrier");
    release();
    await expect(promise).rejects.toThrow("auth_scope_changed");
  });

  it("fails a pre-aborted category read without delivering stale options", async () => {
    const signal = new AbortController();
    signal.abort();
    await expect(
      loadCurrentAccountReviewEditorCategories(OWNER, signal.signal)
    ).rejects.toThrow();
    expect(mockQueryInvoked).toBe(0);
  });

  it("rejects duplicate current category identities rather than picking one label", async () => {
    mockRecords = [
      category(CAT),
      category(CAT, { displayName: "Conflicting" }),
    ];
    await expect(
      loadCurrentAccountReviewEditorCategories(OWNER)
    ).rejects.toThrow("account_review_category_snapshot_conflict");
  });
});
