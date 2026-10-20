import { logReviewFailure } from "../../services/account-review-feedback-diagnostics";
import {
  observeReviewSaveFailure,
  rememberReviewSaveFailure,
  reviewSaveFailurePhases,
} from "../../services/account-review-save-failure-context";

describe("review Save failure evidence", () => {
  it("observes one failed operation without replacing the original exception or retrying", async () => {
    const error = new Error("private account failure");
    const operation = jest.fn(() => Promise.reject(error));
    const pending = observeReviewSaveFailure("construct_plan", operation());
    await expect(pending).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(reviewSaveFailurePhases(error)).toEqual(["construct_plan"]);
    await expect(
      observeReviewSaveFailure("invoke_save_service", pending)
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(reviewSaveFailurePhases(error)).toEqual([
      "construct_plan",
      "invoke_save_service",
    ]);
  });

  it("preserves successful operation results and records no failure", async () => {
    const outcome = { kind: "committed" };
    await expect(
      observeReviewSaveFailure("commit_action", Promise.resolve(outcome))
    ).resolves.toBe(outcome);
    expect(reviewSaveFailurePhases(outcome)).toEqual([]);
  });

  it("keeps concurrent errors separate and duplicate observations bounded", () => {
    const first = new Error("first");
    const second = new Error("second");
    rememberReviewSaveFailure(first, "lookup_action");
    rememberReviewSaveFailure(first, "lookup_action");
    rememberReviewSaveFailure(second, "load_save_service");
    expect(reviewSaveFailurePhases(first)).toEqual(["lookup_action"]);
    expect(reviewSaveFailurePhases(second)).toEqual(["load_save_service"]);
    expect(reviewSaveFailurePhases(null)).toEqual([]);
  });

  it("retains Expo virtual-entry coordinates and the failed phase without raw message, host or query", () => {
    const secret = "PRIVATE_ACCOUNT_TEST_SENTINEL";
    const error = new Error(secret);
    error.stack =
      "Error: " +
      secret +
      String.fromCharCode(10) +
      "    at anonymous (http://private-device:8081/.expo/.virtual-metro-entry.bundle?token=" +
      secret +
      ":123456:25)";
    rememberReviewSaveFailure(error, "lookup_action");
    const spy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const diagnostic = logReviewFailure({
        source: "VOICE",
        stage: "save_invocation",
        error,
      });
      expect(diagnostic.code).toBe("unexpected_error");
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        expect(spy).toHaveBeenCalledWith(
          "[account-review-feedback]",
          expect.stringContaining(".virtual-metro-entry.bundle:123456:25")
        );
        expect(spy).toHaveBeenCalledWith(
          "[account-review-feedback]",
          expect.stringContaining('"phases":["lookup_action"]')
        );
      }
      expect(JSON.stringify(spy.mock.calls)).not.toContain(secret);
      expect(JSON.stringify(spy.mock.calls)).not.toContain("private-device");
      expect(JSON.stringify(spy.mock.calls)).not.toContain("token=");
    } finally {
      spy.mockRestore();
    }
  });

  it("recognizes device bridge SQLite failures without printing table names", () => {
    const privateTable = "PRIVATE_TABLE_TEST_SENTINEL";
    const error = new Error(
      "Exception in HostFunction: no such table: " + privateTable
    );
    const spy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      logReviewFailure({ source: "VOICE", stage: "save_invocation", error });
      if (typeof __DEV__ !== "undefined" && __DEV__)
        expect(spy).toHaveBeenCalledWith(
          "[account-review-feedback]",
          expect.stringContaining('"reason":"sqlite_missing_table"')
        );
      expect(JSON.stringify(spy.mock.calls)).not.toContain(privateTable);
    } finally {
      spy.mockRestore();
    }
  });
  it.each([
    "account_review_local_default_invalid_prior_action_identity",
    "account_review_local_snapshot_invalid_physical_timestamp",
    "account_review_private_lifecycle_missing_review_private_evidence",
  ])("reports the exact static writer rejection %s", (code) => {
    const spy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const diagnostic = logReviewFailure({
        source: "VOICE",
        stage: "save_invocation",
        error: new Error(code),
      });
      expect(diagnostic.code).toBe(code);
    } finally {
      spy.mockRestore();
    }
  });
});
