/**
 * #395 T012 tests-first creation Red — the future mobile Voice review parser
 * is a pure financial/advisory discriminator, not a second provider transport.
 * Full sessions are produced by the REAL T014-P pure normalizer at its own seam.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { accountReviewSessionSchema } from "../../../../packages/logic/src/account-review/schemas";
import type {
  AccountReviewVoiceFinancialRow,
  AccountReviewVoiceResponseV2,
} from "../../../../packages/logic/src/account-review/parser-schemas";
import {
  makeGroundedVoiceCashV2Response,
  makeVoiceV1Response,
  makeVoiceV2Response,
  REVIEW_WIRE_IDS,
} from "../../../../packages/logic/src/account-review/__tests__/fixtures";
import {
  makeVoiceInput,
  NORMALIZATION_IDS,
} from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import { normalizeAccountReviewParserResult } from "../../../../packages/logic/src/account-review/normalization";
import type { AiVoiceParserSuccess } from "@/services/ai-voice-parser-service";
import {
  classifyVoiceReviewV2Response,
  attachVoiceReviewSession,
} from "@/services/ai-voice-parser-review";

function requireFinancial(
  value: readonly AccountReviewVoiceFinancialRow[]
): AccountReviewVoiceFinancialRow {
  const row = value[0];
  if (!row) throw new Error("Expected original Voice financial row");
  return row;
}

function voiceSuccess(): AiVoiceParserSuccess {
  const input = makeVoiceInput();
  return {
    transactions: [...input.mappedTransactions],
    transcript: input.providerResponse.transcript,
    originalTranscript: input.originalTranscript,
    detectedLanguage: input.providerResponse.detected_language,
  };
}

describe("#395 T012 — mobile original Voice financial/advisory split", () => {
  it("accepts canonical v2 while retaining original financial row/date/currency and exact refs", () => {
    const raw: AccountReviewVoiceResponseV2 = makeVoiceV2Response();
    const parsed = classifyVoiceReviewV2Response(raw);
    expect(parsed.kind).toBe("v2");
    expect(parsed.financialRows).toHaveLength(1);
    expect(parsed.providerResponse).toEqual(raw);
    expect(requireFinancial(parsed.financialRows)).toMatchObject({
      amount: 50, currency: "EGP", type: "EXPENSE",
      categorySystemName: "food", date: "2026-10-14",
    });
    expect(raw.transactions[0]?.transactionRef).toBe(REVIEW_WIRE_IDS.voiceRowRef);
    expect(raw.transactions[0]?.suggestionRef).toBe(REVIEW_WIRE_IDS.suggestionRef);
  });

  it("keeps legitimate grounded Voice CASH and never invents destination evidence", () => {
    const raw = makeGroundedVoiceCashV2Response();
    const parsed = classifyVoiceReviewV2Response(raw);
    expect(parsed.kind).toBe("v2");
    expect(parsed.providerResponse).toEqual(raw);
    expect(raw.transactions[0]?.accountEvidence.type).toBe("CASH");
    expect(raw.transactions[0]?.toAccountEvidence).toBeNull();
    expect(raw.suggestedAccounts[0]?.type).toBe("CASH");
  });

  it("retains v2 financial currency null rather than forcing preferred or account currency", () => {
    const base = makeVoiceV2Response();
    const raw: AccountReviewVoiceResponseV2 = {
      ...base, suggestedAccounts: [],
      transactions: [{
        ...base.transactions[0],
        currency: null, suggestionRef: null,
        currencyEvidence: {
          state: "ambiguous",
          statedCode: null,
          candidateCodes: ["EGP", "USD"],
          evidenceSpans: [],
        },
      }],
    };
    const parsed = classifyVoiceReviewV2Response(raw);
    expect(parsed.kind).toBe("v2");
    expect(parsed.financialRows).toHaveLength(1);
    expect(requireFinancial(parsed.financialRows).currency).toBeNull();
    expect(parsed.providerResponse).toEqual(raw);
  });

  it("old-server v1 keeps financial rows but has NO proven omission/accepted v2 advisory", () => {
    const legacy = makeVoiceV1Response();
    const parsed = classifyVoiceReviewV2Response(legacy);
    expect(parsed.kind).toBe("legacy");
    expect(parsed.financialRows).toHaveLength(1);
    expect(parsed.providerResponse).toBeNull();
    expect(requireFinancial(parsed.financialRows).categorySystemName).toBe("food");
    expect(requireFinancial(parsed.financialRows).date).toBe("2026-10-14");
    expect(requireFinancial(parsed.financialRows).amount).toBe(50);
  });

  it("retains accepted financial content with malformed account proof for hard review", () => {
    const base = makeVoiceV2Response();
    const raw = {
      ...base,
      transactions: [{
        ...base.transactions[0],
        accountEvidence: {
          ...base.transactions[0]?.accountEvidence,
          evidenceSpans: [{
            sourceRef: "foreign-recording", field: "transcript",
            start: 0, end: 3, text: "QNB",
          }],
        },
      }],
    };
    const parsed = classifyVoiceReviewV2Response(raw);
    expect(parsed.kind).toBe("malformed_advisory");
    expect(parsed.financialRows).toHaveLength(1);
    expect(parsed.providerResponse).toEqual(raw);
    expect(requireFinancial(parsed.financialRows)).toMatchObject({
      amount: 50, categorySystemName: "food", date: "2026-10-14",
    });
  });

  it("invalid v2 omission cannot become an accepted known preferred currency", () => {
    const base = makeVoiceV2Response();
    const raw = {
      ...base, suggestedAccounts: [],
      transactions: [{
        ...base.transactions[0], suggestionRef: null,
        currencyEvidence: {
          state: "omitted", statedCode: "EGP",
          candidateCodes: ["EGP"], evidenceSpans: [],
        },
      }],
    };
    const parsed = classifyVoiceReviewV2Response(raw);
    expect(parsed.kind).toBe("malformed_advisory");
    expect(parsed.providerResponse).toEqual(raw);
    expect(parsed.financialRows).toHaveLength(1);
  });

  it("unknown v2 discriminator stays malformed rather than silently downgrading to v1", () => {
    const result = classifyVoiceReviewV2Response({
      ...makeVoiceV2Response(), reviewContractVersion: "account-review/v3",
    });
    expect(result.kind).toBe("malformed_advisory");
    expect(result.financialRows).toHaveLength(1);
    expect(result.providerResponse).not.toBeNull();
  });

  it("an invalid core financial amount is never laundered through advisory fallback", () => {
    const base = makeVoiceV2Response();
    const result = classifyVoiceReviewV2Response({
      ...base, transactions: [{
        ...base.transactions[0], amount: Number.POSITIVE_INFINITY,
      }],
    });
    expect(result.kind).toBe("invalid_financial");
    expect(result.financialRows).toHaveLength(0);
  });

  it("an invalid core financial date/category does not become an accepted source row", () => {
    const base = makeVoiceV2Response();
    for (const bad of [
      { date: "invalid-date" },
      { categorySystemName: "" },
    ]) {
      const result = classifyVoiceReviewV2Response({
        ...base, transactions: [{ ...base.transactions[0], ...bad }],
      });
      expect(result.financialRows).toHaveLength(0);
      expect(result.kind).toBe("invalid_financial");
    }
  });

  it("accepts genuine zero-row v2 without creating an account group or parser request", () => {
    const base = makeVoiceV2Response();
    const parsed = classifyVoiceReviewV2Response({
      ...base, transactions: [], suggestedAccounts: [],
    });
    expect(parsed.kind).toBe("v2");
    expect(parsed.financialRows).toEqual([]);
  });

  it("does not import transport, mobile database, provider or network from pure helper", () => {
    const source = readFileSync(
      join(__dirname, "../../services/ai-voice-parser-review.ts"), "utf8"
    );
    expect(source).not.toMatch(/supabase\.functions\.invoke|Deno\.env|process\.env/);
    expect(source).not.toMatch(/from ["'][^"']*(?:@monyvi\/db|apps\/mobile\/hooks|database)[^"']*["']/);
    expect(source).not.toMatch(/models\.generateContent\(|fetch\(/);
  });
});

describe("#395 T012 — full canonical session handoff (real normalizer, not mocked)", () => {
  it("attaches only the full schema-validated Voice session supplied by the T014-M facade", async () => {
    const input = makeVoiceInput();
    const produced = await normalizeAccountReviewParserResult(input);
    const realSession = accountReviewSessionSchema.parse(produced);
    const success = voiceSuccess();
    const attached = attachVoiceReviewSession({
      success,
      reviewSession: realSession,
      expectedOwnerId: input.ownerId,
      expectedSessionId: input.sessionId,
    });
    expect(attached).not.toBe(success);
    expect(attached.transactions).toEqual(success.transactions);
    expect(attached).toHaveProperty("reviewSession", realSession);
    expect(realSession.source).toBe("VOICE");
    expect(realSession.ownerId).toBe(NORMALIZATION_IDS.owner);
    expect(realSession.sessionId).toBe(NORMALIZATION_IDS.session);
    expect(realSession.rows[0]?.sourceFingerprint).toBeNull();
    expect(realSession.rows[0]?.transaction.categoryId).toBe(NORMALIZATION_IDS.foodCategory);
    expect(realSession.groups[0]?.status).toBe("pending");
    expect(realSession.rows.every((row) => row.selected === false)).toBe(true);
    expect(realSession.saveIntent).toBeNull();
  });

  it("does not attach a review session when original opt-in/facade result is absent", () => {
    const success = voiceSuccess();
    const result = attachVoiceReviewSession({
      success, reviewSession: null,
      expectedOwnerId: REVIEW_WIRE_IDS.ownerId,
      expectedSessionId: NORMALIZATION_IDS.session,
    });
    expect(result).not.toHaveProperty("reviewSession");
    expect(result.transactions).toEqual(success.transactions);
  });

  it("rejects stale owner or another recording session without mutating existing success", async () => {
    const input = makeVoiceInput();
    const session = accountReviewSessionSchema.parse(
      await normalizeAccountReviewParserResult(input)
    );
    const original = voiceSuccess();
    expect(() => attachVoiceReviewSession({
      success: original, reviewSession: session,
      expectedOwnerId: NORMALIZATION_IDS.foreignOwner,
      expectedSessionId: input.sessionId,
    })).toThrow();
    expect(() => attachVoiceReviewSession({
      success: original, reviewSession: session,
      expectedOwnerId: input.ownerId,
      expectedSessionId: NORMALIZATION_IDS.alternateSession,
    })).toThrow();
    expect(original).not.toHaveProperty("reviewSession");
  });

  it("rejects malformed or cross-source sessions while retaining the Voice success", async () => {
    const input = makeVoiceInput();
    const review = accountReviewSessionSchema.parse(
      await normalizeAccountReviewParserResult(input)
    );
    const success = voiceSuccess();
    expect(() => attachVoiceReviewSession({
      success, reviewSession: { ...review, ownerId: "not-a-uuid" },
      expectedOwnerId: input.ownerId, expectedSessionId: input.sessionId,
    })).toThrow();
    expect(() => attachVoiceReviewSession({
      success, reviewSession: { ...review, source: "SMS" },
      expectedOwnerId: input.ownerId, expectedSessionId: input.sessionId,
    })).toThrow();
    expect(success).not.toHaveProperty("reviewSession");
  });
});
