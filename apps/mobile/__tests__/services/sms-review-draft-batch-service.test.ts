import type { Model } from "@nozbe/watermelondb";

const mockAssertExpectedCurrentUser = jest.fn();
const mockCaptureCachedModelSnapshot = jest.fn();
const mockRestoreCachedModelSnapshot = jest.fn();
const mockCommitPreparedBatch = jest.fn();

jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: (...args: readonly unknown[]): unknown =>
    mockAssertExpectedCurrentUser(...args),
}));

jest.mock("@/services/watermelon-cache-snapshot", () => ({
  captureCachedModelSnapshot: (...args: readonly unknown[]): unknown =>
    mockCaptureCachedModelSnapshot(...args),
  restoreCachedModelSnapshot: (...args: readonly unknown[]): unknown =>
    mockRestoreCachedModelSnapshot(...args),
}));

jest.mock("@/services/watermelon-atomic-batch", () => ({
  commitPreparedBatch: (...args: readonly unknown[]): unknown =>
    mockCommitPreparedBatch(...args),
}));

import { commitScopedPreparedBatch } from "@/services/sms-review-draft-batch-service";

function model(id: string): Model {
  return { id } as unknown as Model;
}

describe("commitScopedPreparedBatch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssertExpectedCurrentUser.mockResolvedValue(undefined);
    mockCaptureCachedModelSnapshot.mockImplementation((cachedModel: Model) => ({
      cachedModel,
    }));
  });

  it("restores every declared cached model when the adapter rejects", async () => {
    const queue = model("queue");
    const item = model("item");
    const operation = model("operation");
    mockCommitPreparedBatch.mockRejectedValueOnce(
      new Error("adapter rejected")
    );

    await expect(
      commitScopedPreparedBatch("user-a", [queue, item], () => [operation])
    ).rejects.toThrow("adapter rejected");

    expect(mockCaptureCachedModelSnapshot).toHaveBeenNthCalledWith(1, queue);
    expect(mockCaptureCachedModelSnapshot).toHaveBeenNthCalledWith(2, item);
    expect(mockRestoreCachedModelSnapshot).toHaveBeenCalledTimes(2);
  });

  it("restores cached models when preparation throws after mutating them", async () => {
    const item = model("item");

    await expect(
      commitScopedPreparedBatch("user-a", [item], () => {
        throw new Error("prepare failed");
      })
    ).rejects.toThrow("prepare failed");

    expect(mockCommitPreparedBatch).not.toHaveBeenCalled();
    expect(mockRestoreCachedModelSnapshot).toHaveBeenCalledWith({
      cachedModel: item,
    });
  });
});
