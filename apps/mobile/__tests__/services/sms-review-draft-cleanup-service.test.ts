const mockDeleteExpired = jest.fn();
const mockGetScope = jest.fn();

jest.mock("@/services/sms-review-draft-repository", () => ({
  deleteExpiredSmsReviewDrafts: (...args: readonly unknown[]): unknown =>
    mockDeleteExpired(...args),
}));

jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: (): unknown => mockGetScope(),
}));

import {
  cleanupExpiredSmsReviewDrafts,
  SMS_REVIEW_DRAFT_RETENTION_DAYS,
} from "@/services/sms-review-draft-cleanup-service";

describe("cleanupExpiredSmsReviewDrafts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetScope.mockResolvedValue({ userId: "user-1" });
    mockDeleteExpired.mockResolvedValue(2);
  });

  it("deletes only the current user's items older than the retention boundary", async () => {
    const now = new Date("2026-07-27T12:00:00.000Z");

    await expect(cleanupExpiredSmsReviewDrafts({ now })).resolves.toBe(2);

    expect(mockDeleteExpired).toHaveBeenCalledWith(
      "user-1",
      new Date(
        now.getTime() - SMS_REVIEW_DRAFT_RETENTION_DAYS * 24 * 60 * 60 * 1000
      ),
      undefined
    );
  });

  it("does no database work when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      cleanupExpiredSmsReviewDrafts({ signal: controller.signal })
    ).resolves.toBe(0);

    expect(mockGetScope).not.toHaveBeenCalled();
    expect(mockDeleteExpired).not.toHaveBeenCalled();
  });

  it("reports completed cleanup even if cancellation arrives after the write", async () => {
    const controller = new AbortController();
    mockDeleteExpired.mockImplementation((): Promise<number> => {
      controller.abort();
      return Promise.resolve(2);
    });

    await expect(
      cleanupExpiredSmsReviewDrafts({ signal: controller.signal })
    ).resolves.toBe(2);

    expect(mockDeleteExpired).toHaveBeenCalledWith(
      "user-1",
      expect.any(Date),
      controller.signal
    );
  });
});
