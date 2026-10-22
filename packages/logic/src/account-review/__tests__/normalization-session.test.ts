import {
  normalizeCompleteSmsReviewSession,
  prepareInitialSmsReviewChunks,
  type AcceptedSmsReviewChunk,
  type CompleteSmsReviewNormalizationInput,
} from "../normalization-session";
import { makeSmsInput } from "./normalization-fixtures";

function completeInput(
  chunks: readonly AcceptedSmsReviewChunk[]
): CompleteSmsReviewNormalizationInput {
  const source = makeSmsInput();
  return {
    ownerId: source.ownerId,
    sessionId: source.sessionId,
    sourceRevision: source.sourceRevision,
    reviewAccountSnapshots: source.reviewAccountSnapshots,
    hashProvider: source.hashProvider,
    acceptedReviewChunks: chunks,
  };
}

describe("initial SMS normalization composition — no reducer or runtime", () => {
  it("keeps original financial/fingerprint/span identity when repeated source chunks coalesce", async () => {
    const source = makeSmsInput();
    const once = await normalizeCompleteSmsReviewSession(
      completeInput([source])
    );
    const twice = await normalizeCompleteSmsReviewSession(
      completeInput([source, source])
    );
    expect(twice.rows).toHaveLength(1);
    expect(twice.rows[0]?.rowId).toBe(once.rows[0]?.rowId);
    expect(twice.sessionId).toBe(source.sessionId);
    const row = twice.rows[0];
    if (!row || row.source !== "SMS")
      throw new Error("Missing original SMS row");
    expect(row.sourceFingerprint).toBe(
      source.mappedTransactions[0]?.smsFingerprint
    );
    expect(row.accountEvidence.evidenceSpans).toEqual(
      source.providerResponse.transactions[0]?.accountEvidence.evidenceSpans
    );
    expect(row.selected).toBe(false);
    expect(twice.groups.every((group) => group.status === "pending")).toBe(
      true
    );
  });

  it("rejects conflicting accepted originals instead of choosing the last arrival", async () => {
    const source = makeSmsInput();
    const financial = source.financialRows[0];
    const mapped = source.mappedTransactions[0];
    if (!financial || !mapped)
      throw new Error("Missing paired original fixture");
    const conflict: AcceptedSmsReviewChunk = {
      ...source,
      providerResponse: null,
      financialRows: [{ ...financial, amount: financial.amount + 1 }],
      mappedTransactions: [{ ...mapped, amount: mapped.amount + 1 }],
    };
    await expect(
      normalizeCompleteSmsReviewSession(completeInput([source, conflict]))
    ).rejects.toThrow();
    await expect(
      normalizeCompleteSmsReviewSession(completeInput([conflict, source]))
    ).rejects.toThrow();
  });
});

it("does not disguise missing original AI finance as local-only proof", () => {
  const source = makeSmsInput();
  expect(() =>
    prepareInitialSmsReviewChunks({
      chunks: [],
      transactions: source.mappedTransactions,
      sources: source.submittedMessages,
      categorySystemNamesById: new Map(),
      allowLocalSources: true,
      allowedLocalTransactions: [],
    })
  ).toThrow("account_review_original_ai_finance_missing");
});
