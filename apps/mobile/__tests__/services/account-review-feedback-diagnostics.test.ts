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
          JSON.stringify({
            ...diagnostic,
            dev: {
              chain: [
                {
                  errorClass: "Error",
                  code: null,
                  reason: "unclassified",
                  evidence: "none",
                  stack: "unmapped",
                  locations: [],
                  frames: ["runCommand"],
                },
              ],
            },
          })
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

  it("recovers allowlisted Hermes, JSC and V8 locations without paths or private frame names", () => {
    const secret = "SECRET_TOKEN_ACCOUNT_SMS_TRANSCRIPT";
    const failure = new TypeError(
      "undefined is not an object (evaluating '" + secret + ".payload')"
    );
    failure.stack = [
      "TypeError: " + secret,
      "    at privateNativeCall (address at http://localhost:8081/index.android.bundle?platform=android&token=" +
        secret +
        ":1:432197)",
      "    at saveCapturedAccountReview (address at /Users/" +
        secret +
        "/apps/mobile/services/account-review-runtime-save.ts:193:7)",
      "assertRuntimeOwner@file:///tmp/" + secret + "/voice-review.tsx:260:9",
      "    at " + secret + " (/private/" + secret + ".js:8:1)",
    ].join("\n");
    const spy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const result = logReviewFailure({
        source: "VOICE",
        stage: "save_invocation",
        error: failure,
      });
      expect(result).toEqual({
        source: "VOICE",
        stage: "save_invocation",
        code: "unexpected_error",
        errorClass: "TypeError",
        frames: ["saveCapturedAccountReview", "assertRuntimeOwner"],
      });
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        expect(spy).toHaveBeenCalledWith(
          "[account-review-feedback]",
          JSON.stringify({
            ...result,
            dev: {
              chain: [
                {
                  errorClass: "TypeError",
                  code: null,
                  reason: "nullish_property_access",
                  evidence: "message_shape",
                  stack: "located",
                  locations: [
                    "index.android.bundle:1:432197",
                    "account-review-runtime-save.ts:193:7",
                    "voice-review.tsx:260:9",
                  ],
                  frames: ["saveCapturedAccountReview", "assertRuntimeOwner"],
                },
              ],
            },
          })
        );
      }
      const printed = JSON.stringify(spy.mock.calls);
      expect(printed).not.toContain(secret);
      expect(printed).not.toContain("http://");
      expect(printed).not.toContain("file://");
      expect(printed).not.toContain("/Users/");
      expect(printed).not.toContain("/private/");
    } finally {
      spy.mockRestore();
    }
  });

  it("traces bounded Error causes and classifies SQLite failure without leaking table names or SQL", () => {
    const secret = "PRIVATE_ACCOUNTS_TABLE_TOKEN";
    const sqlite = Object.assign(
      new Error("SQLITE_ERROR: no such table: " + secret),
      { code: "SQLITE_ERROR" }
    );
    sqlite.stack =
      "Error: secret\n    at internalSql (address at /private/" +
      secret +
      "/watermelon-atomic-batch.ts:160:5)";
    const outer = Object.assign(new Error("secret SQL text " + secret), {
      cause: sqlite,
    });
    // A cyclic cause must not produce unbounded logging.
    Object.assign(sqlite, { cause: outer });
    outer.stack =
      "Error: private hidden\n    at wrapper (/private/" +
      secret +
      "/unsafe-source.ts:2:1)";
    const spy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const result = logReviewFailure({
        source: "VOICE",
        stage: "save_invocation",
        error: outer,
      });
      expect(result.code).toBe("unexpected_error");
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        expect(spy).toHaveBeenCalledWith(
          "[account-review-feedback]",
          JSON.stringify({
            ...result,
            dev: {
              chain: [
                {
                  errorClass: "Error",
                  code: null,
                  reason: "unclassified",
                  evidence: "none",
                  stack: "unmapped",
                  locations: [],
                  frames: [],
                },
                {
                  errorClass: "Error",
                  code: null,
                  reason: "sqlite_missing_table",
                  evidence: "message_shape",
                  stack: "located",
                  locations: ["watermelon-atomic-batch.ts:160:5"],
                  frames: [],
                },
              ],
            },
          })
        );
      }
      expect(JSON.stringify(spy.mock.calls)).not.toContain(secret);
      expect(JSON.stringify(spy.mock.calls)).not.toContain("SQLITE_ERROR:");
      expect(JSON.stringify(spy.mock.calls)).not.toContain("/private/");
    } finally {
      spy.mockRestore();
    }
  });

  it("uses only static native error categories and exposes no arbitrary codes or message prefixes", () => {
    const secret = "SECRET_USER_ACCOUNT_ID_9988";
    const native = Object.assign(new Error("sqlite disk is full"), {
      code: "SQLITE_FULL",
      cause: Object.assign(new Error("private " + secret), {
        code: "SQLITE_FULL_" + secret,
      }),
    });
    native.stack = "Error: secret\nunknownJS@" + secret + "/private.js:55:6";
    const spy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const diagnostic = logReviewFailure({
        source: "SMS",
        stage: "save_invocation",
        error: native,
      });
      expect(diagnostic.code).toBe("unexpected_error");
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        expect(spy).toHaveBeenCalledWith(
          "[account-review-feedback]",
          JSON.stringify({
            ...diagnostic,
            dev: {
              chain: [
                {
                  errorClass: "Error",
                  code: null,
                  reason: "storage_full",
                  evidence: "static_code",
                  stack: "unmapped",
                  locations: [],
                  frames: [],
                },
                {
                  errorClass: "Error",
                  code: null,
                  reason: "unclassified",
                  evidence: "none",
                  stack: "unmapped",
                  locations: [],
                  frames: [],
                },
              ],
            },
          })
        );
      }
      expect(JSON.stringify(spy.mock.calls)).not.toContain(secret);
    } finally {
      spy.mockRestore();
    }
  });

  it("classifies quoted Hermes property failures but never prints the property name", () => {
    const secret = "PRIVATE_PROPERTY_TOKEN";
    const error = new TypeError(
      "Cannot read property '" + secret + "' of undefined"
    );
    error.stack =
      "TypeError: private\n    at unknown (/private/secret.js:10:4)";
    const spy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const result = logReviewFailure({
        source: "VOICE",
        stage: "save_invocation",
        error,
      });
      expect(result.code).toBe("unexpected_error");
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        expect(spy).toHaveBeenCalledWith(
          "[account-review-feedback]",
          JSON.stringify({
            ...result,
            dev: {
              chain: [
                {
                  errorClass: "TypeError",
                  code: null,
                  reason: "nullish_property_access",
                  evidence: "message_shape",
                  stack: "unmapped",
                  locations: [],
                  frames: [],
                },
              ],
            },
          })
        );
      }
      expect(JSON.stringify(spy.mock.calls)).not.toContain(secret);
    } finally {
      spy.mockRestore();
    }
  });

  it("reports missing technical evidence explicitly without inventing a diagnosis", () => {
    const secret = "PRIVATE_UNRECOGNIZED_RUNTIME_MESSAGE";
    const error = new Error(secret);
    error.stack = "";
    const spy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const result = logReviewFailure({
        source: "VOICE",
        stage: "save_invocation",
        error,
      });
      expect(result).toEqual({
        source: "VOICE",
        stage: "save_invocation",
        code: "unexpected_error",
        errorClass: "Error",
        frames: [],
      });
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        expect(spy).toHaveBeenCalledWith(
          "[account-review-feedback]",
          JSON.stringify({
            ...result,
            dev: {
              chain: [
                {
                  errorClass: "Error",
                  code: null,
                  reason: "unclassified",
                  evidence: "none",
                  stack: "absent",
                  locations: [],
                  frames: [],
                },
              ],
            },
          })
        );
      }
      expect(JSON.stringify(spy.mock.calls)).not.toContain(secret);
    } finally {
      spy.mockRestore();
    }
  });

  it.each([
    "account-review-save-digest.ts",
    "account-review-save-replay.ts",
    "account-review-save-sms.ts",
    "account-review-retention-lifecycle.ts",
    "user-data-access.ts",
    "account-review-save-ownership.ts",
  ])(
    "keeps exact Save source location %s readable through Metro string transport",
    (file) => {
      const secret = "PRIVATE_SQL_TOKEN_AND_USER_ACCOUNT";
      const error = new Error(secret);
      error.stack =
        "Error: " +
        secret +
        "\n    at privateWriter (/private/" +
        secret +
        "/services/" +
        file +
        ":77:15)";
      const spy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      try {
        const result = logReviewFailure({
          source: "VOICE",
          stage: "save_invocation",
          error,
        });
        expect(result.code).toBe("unexpected_error");
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          // A string bypasses React Native's maxDepth:3 object pretty-printer.
          expect(spy).toHaveBeenCalledWith(
            "[account-review-feedback]",
            expect.stringContaining('"' + file + ':77:15"')
          );
        } else {
          expect(spy).not.toHaveBeenCalled();
        }
        expect(JSON.stringify(spy.mock.calls)).not.toContain(secret);
        expect(JSON.stringify(spy.mock.calls)).not.toContain("/private/");
      } finally {
        spy.mockRestore();
      }
    }
  );

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
