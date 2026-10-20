import {
  logReviewFailure,
  sanitizeReviewFailure,
} from "@/services/account-review-feedback-diagnostics";
import { FINANCIAL_ACTION_FOUNDATION_ERROR_CODES } from "@/services/financial-action-foundation-contracts";

describe("#395 Save diagnostic privacy and stable boundaries", () => {
  it("never echoes private messages, frames, IDs, amounts or arbitrary codes", () => {
    const secret = "SECRET_TRANSCRIPT_SMS_AMOUNT_ACCOUNT_TOKEN";
    const failure = new Error(secret);
    failure.stack = [
      "Error: " + secret,
      "    at saveCapturedAccountReview (/private/" +
        secret +
        "/file.ts:14:22)",
      "    at " + secret + " (/private/source.ts:1:1)",
      "    at assertRuntimeOwner (/private/id:35:2)",
    ].join("\n");
    const diagnostic = sanitizeReviewFailure({
      source: "VOICE",
      stage: "save_invocation",
      error: failure,
      reasonCodes: [secret],
    });
    expect(diagnostic).toEqual({
      source: "VOICE",
      stage: "save_invocation",
      code: "unexpected_error",
      errorClass: "Error",
      frames: ["saveCapturedAccountReview", "assertRuntimeOwner"],
    });
    expect(JSON.stringify(diagnostic)).not.toContain(secret);
    expect(JSON.stringify(diagnostic)).not.toContain("/private");
  });

  it("reports only explicitly allowlisted codes and known classes", () => {
    const categoryFailure = new Error("account_review_save_category_stale");
    const diagnostic = sanitizeReviewFailure({
      source: "SMS",
      stage: "save_invocation",
      error: categoryFailure,
    });
    expect(diagnostic.code).toBe("account_review_save_category_stale");
    expect(diagnostic.errorClass).toBe("Error");

    const codeOnly = Object.assign(new Error("private SQL payload"), {
      code: "SQLITE_CONSTRAINT_UNIQUE",
    });
    expect(
      sanitizeReviewFailure({
        source: "SMS",
        stage: "save_invocation",
        error: codeOnly,
      }).code
    ).toBe("SQLITE_CONSTRAINT_UNIQUE");
    expect(
      sanitizeReviewFailure({
        source: "SMS",
        stage: "command",
        reasonCodes: ["account_group_removed"],
      }).code
    ).toBe("account_group_removed");
  });

  it("prints a structured sanitized Metro diagnostic, never the original Error", () => {
    const privateFailure = new Error("SECRET RAW ERROR TEXT");
    privateFailure.stack = "Error: SECRET\n    at runCommand (/secret:2:3)";
    const spy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const diagnostic = logReviewFailure({
        source: "VOICE",
        stage: "command",
        error: privateFailure,
      });
      expect(diagnostic.frames).toEqual(["runCommand"]);
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        expect(spy).toHaveBeenCalledWith(
          "[account-review-feedback]",
          diagnostic
        );
      } else {
        expect(spy).not.toHaveBeenCalled();
      }
      expect(JSON.stringify(spy.mock.calls)).not.toContain("SECRET");
      expect(JSON.stringify(spy.mock.calls)).not.toContain("/secret");
    } finally {
      spy.mockRestore();
    }
  });
  it("recognizes each authoritative foundation code without importing the writer", () => {
    for (const code of Object.values(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES)) {
      const diagnostic = sanitizeReviewFailure({
        source: "VOICE",
        stage: "save_invocation",
        error: new Error(code),
      });
      expect(diagnostic).toMatchObject({
        code,
        errorClass: "Error",
        frames: [],
      });
    }
  });

  it.each([
    "core_account_financial_action_account_unavailable",
    "core_account_financial_action_invalid_effect",
    "core_account_financial_action_invalid_mutation",
    "core_account_financial_action_not_owned",
    "core_account_financial_action_revision_exhausted",
    "core_account_financial_action_unsafe_balance",
    "financial_action_invalid_envelope",
    "financial_action_invalid_payload",
    "financial_action_invalid_revision",
    "financial_action_duplicate_definition",
    "financial_action_unknown_definition",
    "account_review_financial_wrong_tuple",
    "account_review_save_replay_unexpected_prepare",
  ])("recognizes a verified exact financial-action code: %s", (code) => {
    const diagnostic = sanitizeReviewFailure({
      source: "VOICE",
      stage: "save_invocation",
      error: Object.assign(new Error("private raw message"), { code }),
    });
    expect(diagnostic.code).toBe(code);
    expect(JSON.stringify(diagnostic)).not.toContain("private raw message");
  });

  it("does not accept private suffixes masquerading as known SDK error codes", () => {
    const secret = "SECRET_TRANSCRIPT_ACCOUNT_ID_TOKEN";
    const error = Object.assign(
      new Error("core_account_financial_action_invalid_effect_" + secret),
      { code: "financial_action_invalid_payload_" + secret }
    );
    const diagnostic = sanitizeReviewFailure({
      source: "VOICE",
      stage: "save_invocation",
      error,
      reasonCodes: ["financial_action_auth_scope_changed_" + secret],
    });
    expect(diagnostic.code).toBe("unexpected_error");
    expect(diagnostic.frames).toEqual([]);
    expect(JSON.stringify(diagnostic)).not.toContain(secret);
  });
});
