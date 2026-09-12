interface QueryCondition {
  readonly column: string;
  readonly value: unknown;
}

const mockEvidenceCollection = { table: "metal_action_evidence" };
const mockQueryOwned = jest.fn();
const mockQueryChildren = jest.fn();

jest.mock("@monyvi/db", () => ({
  database: {
    get: (): typeof mockEvidenceCollection => mockEvidenceCollection,
  },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    where: (column: string, value: unknown): QueryCondition => ({
      column,
      value,
    }),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  queryChildrenOfOwnedParents: (...args: readonly unknown[]): unknown =>
    mockQueryChildren(...args),
  queryOwned: (...args: readonly unknown[]): unknown => mockQueryOwned(...args),
}));

import {
  observeMetalDetailActionEvidence,
  observeMetalHistoryActionEvidence,
} from "@/services/metal-action-evidence-observer-service";

describe("metal action evidence observers", () => {
  beforeEach(() => jest.clearAllMocks());

  it("scopes detail evidence to the current user and holding", () => {
    observeMetalDetailActionEvidence("user-1", "holding-1");

    expect(mockQueryOwned).toHaveBeenCalledWith(
      mockEvidenceCollection,
      "user-1",
      { column: "holding_id", value: "holding-1" },
      { column: "deleted", value: false }
    );
  });

  it("scopes History evidence through the currently owned holdings", () => {
    const holdings = [{ id: "holding-1", userId: "user-1" }];
    observeMetalHistoryActionEvidence({ holdings, userId: "user-1" });

    expect(mockQueryChildren).toHaveBeenCalledWith(
      mockEvidenceCollection,
      holdings,
      "user-1",
      "holding_id",
      { column: "deleted", value: false }
    );
  });

  it("does not create an unbounded History evidence query", () => {
    expect(
      observeMetalHistoryActionEvidence({ holdings: [], userId: "user-1" })
    ).toBeNull();
    expect(mockQueryChildren).not.toHaveBeenCalled();
  });
});
