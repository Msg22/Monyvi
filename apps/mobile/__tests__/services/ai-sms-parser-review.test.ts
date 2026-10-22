/**
 * #395 T013 tests-first creation Red.
 * SUT is the future real pure mobile v2 SMS classification/session helper;
 * source adapter, provider, DB, and T014-M stateful reducer are not mocked.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  accountReviewSmsResponseV2Schema,
  type AccountReviewSmsResponseV2,
} from "../../../../packages/logic/src/account-review/parser-schemas";
import { accountReviewSessionSchema } from "../../../../packages/logic/src/account-review/review-schemas";
import {
  makeSmsV1Response,
  makeSmsV2Response,
  REVIEW_WIRE_IDS,
  REVIEW_SMS_BODY,
} from "../../../../packages/logic/src/account-review/__tests__/fixtures";
import {
  makeSmsInput,
  NORMALIZATION_IDS,
} from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import { normalizeAccountReviewParserResult } from "../../../../packages/logic/src/account-review/normalization";
import type { AiParseResult } from "@/services/ai-sms-parser-service";
import {
  classifySmsReviewV2Response,
  attachSmsReviewSession,
} from "@/services/ai-sms-parser-review";

function sourceInput(): ReturnType<typeof makeSmsInput> {
  return makeSmsInput();
}

function originalMessages(): ReturnType<
  typeof sourceInput
>["submittedMessages"] {
  return sourceInput().submittedMessages;
}

function successResult(): AiParseResult {
  const input = sourceInput();
  return {
    transactions: [...input.mappedTransactions],
    hasError: false,
    durableNegativeFingerprints: [],
    terminalFingerprints: [],
    unresolvedCandidates: [],
  };
}

describe("#395 T013 — pure mobile SMS v2 financial/advisory boundary", () => {
  it("valid v2 keeps canonical financial rows, original source and metadata separate", () => {
    const raw = makeSmsV2Response();
    const result = classifySmsReviewV2Response(raw, originalMessages());
    expect(result.kind).toBe("v2");
    expect(result.financialRows).toHaveLength(1);
    expect(result.providerResponse).toEqual(raw);
    expect(result.financialRows[0]).toMatchObject({
      messageId: REVIEW_WIRE_IDS.smsMessageId,
      amount: 50,
      currency: "EGP",
      date: "2026-10-14",
      categorySystemName: "shopping",
    });
    expect(raw.completionStatus).toBe("complete");
    expect(raw.negativeFingerprints).toEqual([]);
  });

  it("accepts v2 null financial currency and preserves explicit unknown state", () => {
    const base = makeSmsV2Response();
    const raw: AccountReviewSmsResponseV2 = {
      ...base,
      suggestedAccounts: [],
      transactions: [
        {
          ...base.transactions[0],
          currency: null,
          suggestionRef: null,
          currencyEvidence: {
            state: "unknown",
            statedCode: null,
            candidateCodes: [],
            evidenceSpans: [],
          },
        },
      ],
    };
    expect(accountReviewSmsResponseV2Schema.safeParse(raw).success).toBe(true);
    const result = classifySmsReviewV2Response(raw, originalMessages());
    expect(result.kind).toBe("v2");
    expect(result.financialRows[0]?.currency).toBeNull();
    expect(result.providerResponse).toEqual(raw);
  });

  it("keeps genuine v1 financial and completion metadata but no fabricated v2 omission", () => {
    const raw = makeSmsV1Response();
    const result = classifySmsReviewV2Response(raw, originalMessages());
    expect(result.kind).toBe("legacy");
    expect(result.financialRows).toHaveLength(1);
    expect(result.financialRows[0]?.amount).toBe(50);
    expect(result.financialRows[0]?.date).toBe("2026-10-14");
    expect(result.providerResponse).toBeNull();
  });

  it("malformed v2 account evidence retains exact valid finance for hard review", () => {
    const raw = makeSmsV2Response();
    const malformed = {
      ...raw,
      transactions: [
        {
          ...raw.transactions[0],
          accountEvidence: {
            ...raw.transactions[0]?.accountEvidence,
            evidenceSpans: [
              {
                sourceRef: "unsubmitted-message",
                field: "body",
                start: 0,
                end: 3,
                text: "QNB",
              },
            ],
          },
        },
      ],
    };
    const result = classifySmsReviewV2Response(malformed, originalMessages());
    expect(result.kind).toBe("malformed_advisory");
    expect(result.financialRows).toHaveLength(1);
    expect(result.financialRows[0]?.amount).toBe(50);
    expect(result.financialRows[0]?.categorySystemName).toBe("shopping");
    expect(result.providerResponse).toEqual(malformed);
  });

  it("invalid v2 currency omission does not fabricate confirmed EGP evidence", () => {
    const base = makeSmsV2Response();
    const malformed = {
      ...base,
      suggestedAccounts: [],
      transactions: [
        {
          ...base.transactions[0],
          suggestionRef: null,
          currencyEvidence: {
            state: "omitted",
            statedCode: "EGP",
            candidateCodes: [],
            evidenceSpans: [],
          },
        },
      ],
    };
    const result = classifySmsReviewV2Response(malformed, originalMessages());
    expect(result.kind).toBe("malformed_advisory");
    expect(result.financialRows).toHaveLength(1);
    expect(result.providerResponse).toEqual(malformed);
  });

  it("unknown v2 version does not silently turn into proven old-server omission", () => {
    const result = classifySmsReviewV2Response(
      {
        ...makeSmsV2Response(),
        reviewContractVersion: "account-review/v3",
      },
      originalMessages()
    );
    expect(result.kind).toBe("malformed_advisory");
    expect(result.providerResponse).not.toBeNull();
  });

  it("foreign provider message identity never becomes an accepted original finance", () => {
    const base = makeSmsV2Response();
    const raw = {
      ...base,
      transactions: [
        {
          ...base.transactions[0],
          messageId: "not-a-submitted-message",
        },
      ],
    };
    const result = classifySmsReviewV2Response(raw, originalMessages());
    expect(result.kind).toBe("invalid_financial");
    expect(result.financialRows).toHaveLength(0);
  });

  it("duplicate model financial rows for one SMS are rejected, not reclassified", () => {
    const base = makeSmsV2Response();
    const original = base.transactions[0];
    if (!original) throw new Error("Synthetic source missing financial row");
    const raw = {
      ...base,
      suggestedAccounts: [],
      transactions: [
        { ...original, transactionRef: "different-ref-a", suggestionRef: null },
        { ...original, transactionRef: "different-ref-b", suggestionRef: null },
      ],
    };
    const result = classifySmsReviewV2Response(raw, originalMessages());
    expect(result.kind).toBe("invalid_financial");
    expect(result.financialRows).toHaveLength(0);
  });

  it("invalid financial amount or category cannot be laundered by advisory fallback", () => {
    const base = makeSmsV2Response();
    for (const broken of [
      { amount: Number.POSITIVE_INFINITY },
      { categorySystemName: "" },
    ]) {
      const result = classifySmsReviewV2Response(
        {
          ...base,
          transactions: [{ ...base.transactions[0], ...broken }],
        },
        originalMessages()
      );
      expect(result.kind).toBe("invalid_financial");
      expect(result.financialRows).toHaveLength(0);
    }
  });

  it("preserves exact submitted body/fingerprint and ATM proof when it is grounded", () => {
    const base = makeSmsV2Response();
    const original = base.transactions[0];
    if (!original) throw new Error("Synthetic source missing financial row");
    const body = "QNB ATM withdrew 50 EGP to Cash";
    const start = body.indexOf("Cash");
    const raw: AccountReviewSmsResponseV2 = {
      ...base,
      suggestedAccounts: [],
      transactions: [
        {
          ...original,
          isAtmWithdrawal: true,
          suggestionRef: null,
          currencyEvidence: {
            ...original.currencyEvidence,
            evidenceSpans: [
              {
                sourceRef: REVIEW_WIRE_IDS.smsMessageId,
                field: "body",
                start: body.indexOf("EGP"),
                end: body.indexOf("EGP") + 3,
                text: "EGP",
              },
            ],
          },
          toAccountEvidence: {
            state: "explicit",
            name: "Cash",
            type: "CASH",
            institutionId: null,
            providerDisplayName: null,
            cardLast4: null,
            evidenceSpans: [
              {
                sourceRef: REVIEW_WIRE_IDS.smsMessageId,
                field: "body",
                start,
                end: start + 4,
                text: "Cash",
              },
            ],
            candidateAccountIds: [],
          },
        },
      ],
    };
    const submitted = originalMessages().map((sms) => ({
      ...sms,
      body,
    }));
    const result = classifySmsReviewV2Response(raw, submitted);
    expect(result.kind).toBe("v2");
    expect(result.providerResponse).toEqual(raw);
    expect(result.financialRows[0]?.isAtmWithdrawal).toBe(true);
    expect(submitted[0]?.smsFingerprint).toBe(NORMALIZATION_IDS.smsFingerprint);
    expect(submitted[0]?.body).toBe(body);
  });

  it("does not promote a conflicting original sender/body span into trusted evidence", () => {
    const base = makeSmsV2Response();
    const original = base.transactions[0];
    if (!original) throw new Error("Synthetic source missing financial row");
    const forged = {
      ...base,
      transactions: [
        {
          ...original,
          accountEvidence: {
            ...original.accountEvidence,
            evidenceSpans: [
              {
                sourceRef: REVIEW_WIRE_IDS.smsMessageId,
                field: "sender",
                start: 0,
                end: 3,
                text: "CIB",
              },
            ],
          },
        },
      ],
    };
    const result = classifySmsReviewV2Response(forged, originalMessages());
    expect(result.kind).toBe("malformed_advisory");
    expect(result.financialRows).toHaveLength(1);
    expect(result.providerResponse).toEqual(forged);
    expect(REVIEW_SMS_BODY).toContain("QNB");
  });

  it("empty v2 financial rows do not create a new session or a negative fingerprint", () => {
    const result = classifySmsReviewV2Response(
      {
        ...makeSmsV2Response(),
        transactions: [],
        suggestedAccounts: [],
      },
      originalMessages()
    );
    expect(result.kind).toBe("v2");
    expect(result.financialRows).toEqual([]);
  });

  it("pure helper cannot import network, app DB, parser orchestrator or hooks", () => {
    const text = readFileSync(
      join(__dirname, "../../services/ai-sms-parser-review.ts"),
      "utf8"
    );
    expect(text).not.toMatch(
      /supabase\.functions\.invoke|fetch\(|\.executeProvider\(/
    );
    expect(text).not.toMatch(
      /from ["'][^"']*(?:@monyvi\/db|sms-parser-orchestrator|\/hooks\/|database)[^"']*["']/
    );
  });
});

describe("#395 T013 — immutable full SMS session handoff, not a second parser", () => {
  it("accepts the real normalized canonical SMS session without rewriting finance", async () => {
    const input = sourceInput();
    const normalized = await normalizeAccountReviewParserResult(input);
    const checked = accountReviewSessionSchema.parse(normalized);
    const success = successResult();
    const attached = attachSmsReviewSession({
      success,
      reviewSession: checked,
      expectedOwnerId: input.ownerId,
      expectedSessionId: input.sessionId,
    });
    expect(attached).toHaveProperty("reviewSession", checked);
    expect(attached.transactions).toEqual(success.transactions);
    expect(attached.durableNegativeFingerprints).toEqual([]);
    expect(checked.ownerId).toBe(NORMALIZATION_IDS.owner);
    expect(checked.source).toBe("SMS");
    const row = checked.rows[0];
    if (!row || row.source !== "SMS")
      throw new Error("Expected normalized SMS row");
    expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.shoppingCategory);
    expect(row.transaction.smsFingerprint).toBe(
      NORMALIZATION_IDS.smsFingerprint
    );
    expect(row.revision).toBe("0");
    expect(row.selected).toBe(false);
    expect(checked.saveIntent).toBeNull();
  });

  it("no opt-in/cancelled facade result cannot fabricate a review session", () => {
    const success = successResult();
    const result = attachSmsReviewSession({
      success,
      reviewSession: null,
      expectedOwnerId: NORMALIZATION_IDS.owner,
      expectedSessionId: NORMALIZATION_IDS.session,
    });
    expect(result).not.toHaveProperty("reviewSession");
    expect(result.transactions).toEqual(success.transactions);
  });

  it("rejects changed owner/session and invalid source instead of borrowing revisions", async () => {
    const input = sourceInput();
    const review = accountReviewSessionSchema.parse(
      await normalizeAccountReviewParserResult(input)
    );
    const success = successResult();
    expect(() =>
      attachSmsReviewSession({
        success,
        reviewSession: review,
        expectedOwnerId: NORMALIZATION_IDS.foreignOwner,
        expectedSessionId: NORMALIZATION_IDS.session,
      })
    ).toThrow();
    expect(() =>
      attachSmsReviewSession({
        success,
        reviewSession: review,
        expectedOwnerId: NORMALIZATION_IDS.owner,
        expectedSessionId: NORMALIZATION_IDS.alternateSession,
      })
    ).toThrow();
    expect(() =>
      attachSmsReviewSession({
        success,
        reviewSession: { ...review, source: "VOICE" },
        expectedOwnerId: NORMALIZATION_IDS.owner,
        expectedSessionId: NORMALIZATION_IDS.session,
      })
    ).toThrow();
    expect(success).not.toHaveProperty("reviewSession");
  });
});
