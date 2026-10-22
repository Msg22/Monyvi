import {
  mockEdge,
  OWNER,
  ownedQueues,
  draftItems,
  setParserRoute,
  installSmsReviewSqliteHooks,
  type EdgeReply,
} from "./sms-review-namespace-test-harness";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import {
  makeSmsInput,
  NORMALIZATION_IDS,
} from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import type { SmsCandidate } from "@/services/ai-sms-parser-service";
import { parseSmsWithOrchestrator } from "@/services/sms-parser-orchestrator";
import {
  mergeSmsReviewDrafts,
  updateSmsReviewDraftItem,
  updateSmsReviewDraftSelection,
} from "@/services/sms-review-draft-repository";
import { getFixtureById } from "@/services/dev/sms-fixtures";
import { completeInitialSmsReviewResult } from "@/services/sms-review-namespace-session-service";
import type { SmsParserOrchestratorResult } from "@/services/sms-parser-result-contract";
import { TRUSTED_ENRICHED_PURCHASE_CONFIDENCE } from "@/services/ai-sms-category-enrichment-service";
import { SMS_REVIEW_OTHER_CATEGORY_ID } from "./sms-review-real-sqlite-fixture";
import {
  admittedContext,
  smsRequestContext,
} from "./sms-review-complete-session-fixtures";

installSmsReviewSqliteHooks();

function catalogCandidate(fixtureId: string): SmsCandidate {
  const source = getFixtureById(fixtureId);
  if (!source || source.timestamp === undefined) {
    throw new Error("Missing timestamped trusted SMS fixture " + fixtureId);
  }
  return {
    message: {
      id: source.id,
      address: source.sender,
      body: source.body,
      date: source.timestamp,
      read: false,
    },
    smsFingerprint: "fingerprint-" + source.id,
  };
}

async function seedEditedTrustedSmsDraft(candidate: SmsCandidate): Promise<{
  readonly queueId: string;
  readonly draftId: string;
  readonly payloadJson: string;
}> {
  const source = makeSmsInput().mappedTransactions[0];
  if (!source) throw new Error("Missing original SMS financial fixture");
  const transaction: ParsedSmsTransaction = {
    ...source,
    smsFingerprint: candidate.smsFingerprint,
    senderDisplayName: candidate.message.address,
    rawSmsBody: candidate.message.body,
  };
  const merged = await mergeSmsReviewDrafts({
    expectedUserId: OWNER,
    transactions: [transaction],
  });
  expect(merged.insertedCount).toBe(1);
  const draft = (await draftItems())[0];
  const queue = (await ownedQueues())[0];
  if (!draft || !queue) throw new Error("Missing persisted SMS review");
  await updateSmsReviewDraftItem(draft.id, OWNER, {
    ...transaction,
    amount: 73,
    counterparty: "User edited merchant",
  });
  await updateSmsReviewDraftSelection(draft.id, OWNER, true);
  const edited = (await draftItems())[0];
  if (!edited) throw new Error("Edited draft disappeared");
  return {
    queueId: queue.id,
    draftId: edited.id,
    payloadJson: edited.payloadJson,
  };
}

function stubAcceptedHybridAiRow(candidate: SmsCandidate): void {
  mockEdge.mockImplementation(
    (name: string): Promise<EdgeReply> =>
      Promise.resolve({
        data:
          name === "parse-sms"
            ? {
                transactions: [
                  {
                    messageId: candidate.message.id,
                    amount: 55.55,
                    currency: "EGP",
                    type: "EXPENSE",
                    counterparty: "AI Shop",
                    date: "2026-10-14",
                    categorySystemName: "shopping",
                    confidenceScore: 0.95,
                    isTrusted: true,
                  },
                ],
                completionStatus: "complete",
                negativeFingerprints: [],
                terminalFingerprints: [],
                unresolvedFingerprints: [],
              }
            : { outcomes: [], completionStatus: "complete" },
        error: null,
      })
  );
}

describe("#395 outer orchestrator — real hybrid/local parser and final namespace", () => {
  it("hybrid publishes one final deduped session for trusted plus admitted AI SMS", async () => {
    setParserRoute("hybrid");
    const trusted = catalogCandidate("hybrid_trusted_qnb_purchase");
    const ai = catalogCandidate("hybrid_ai_purchase");
    mockEdge.mockImplementation((name: string): Promise<EdgeReply> => {
      const data =
        name === "parse-sms"
          ? {
              transactions: [
                {
                  messageId: ai.message.id,
                  amount: 55.55,
                  currency: "EGP",
                  type: "EXPENSE",
                  counterparty: "AI Shop",
                  date: "2026-10-14",
                  categorySystemName: "shopping",
                  confidenceScore: 0.95,
                  isTrusted: true,
                },
              ],
              completionStatus: "complete",
              negativeFingerprints: [],
              terminalFingerprints: [],
              unresolvedFingerprints: [],
            }
          : { outcomes: [], completionStatus: "complete" };
      return Promise.resolve({ data, error: null });
    });
    const emitted: number[] = [];
    const result = await parseSmsWithOrchestrator(
      [trusted, ai],
      admittedContext(),
      (progress) => {
        emitted.push(progress.completedTransactions.length);
      },
      undefined,
      { expectedUserId: OWNER, requestContext: smsRequestContext() }
    );
    expect(result.transactions.map((row) => row.smsFingerprint)).toEqual(
      expect.arrayContaining([trusted.smsFingerprint, ai.smsFingerprint])
    );
    expect(
      new Set(result.transactions.map((row) => row.smsFingerprint)).size
    ).toBe(result.transactions.length);
    expect(result.reviewSession?.sessionId).toBe((await ownedQueues())[0]?.id);
    expect(result.reviewSession?.rows).toHaveLength(result.transactions.length);
    expect(result.reviewSession?.rows.every((row) => !row.selected)).toBe(true);
    expect(emitted.length).toBeGreaterThan(0);
    expect(
      mockEdge.mock.calls.filter(([name]) => name === "parse-sms")
    ).toHaveLength(1);
  });

  it("local-only original financial results create a session without any AI call", async () => {
    setParserRoute("local");
    // This route uses LOCAL_SMS_PATTERNS, not the hybrid trusted catalog.
    const trusted = catalogCandidate("nbe_debit_purchase");
    const result = await parseSmsWithOrchestrator(
      [trusted],
      admittedContext(),
      undefined,
      undefined,
      { expectedUserId: OWNER, requestContext: smsRequestContext() }
    );
    expect(mockEdge).not.toHaveBeenCalled();
    expect(result.transactions).toHaveLength(1);
    expect(result.reviewSession?.rows).toHaveLength(1);
    expect(result.reviewSession?.sessionId).toBe((await ownedQueues())[0]?.id);
    expect(result.reviewSession?.rows[0]?.sourceFingerprint).toBe(
      trusted.smsFingerprint
    );
    expect(result.reviewSession?.rows[0]?.toAssignment).toBeNull();
    expect(result.transactions[0]?.amount).toBe(250);
    expect(result.diagnostics.mode).toBe("local-primary");
    expect(result.diagnostics.attemptedAi).toBe(false);
  });

  it("preserves a selected edited SQLite draft without AI-only interim publication", async () => {
    setParserRoute("hybrid");
    const trusted = catalogCandidate("hybrid_trusted_qnb_purchase");
    const ai = catalogCandidate("hybrid_ai_purchase");
    const edited = await seedEditedTrustedSmsDraft(trusted);
    stubAcceptedHybridAiRow(ai);
    const interimSessionFlags: boolean[] = [];
    const result = await parseSmsWithOrchestrator(
      [trusted, ai],
      admittedContext(),
      (progress) => {
        interimSessionFlags.push(
          Object.prototype.hasOwnProperty.call(progress, "reviewSession")
        );
      },
      undefined,
      { expectedUserId: OWNER, requestContext: smsRequestContext() }
    );
    const saved = await draftItems();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.id).toBe(edited.draftId);
    expect(saved[0]?.payloadJson).toBe(edited.payloadJson);
    expect(saved[0]?.selectionOverride).toBe(true);
    expect((await ownedQueues()).map((queue) => queue.id)).toEqual([
      edited.queueId,
    ]);
    expect(result.reviewSession?.sessionId).toBe(edited.queueId);
    expect(interimSessionFlags.length).toBeGreaterThan(0);
    expect(interimSessionFlags).not.toContain(true);
    expect(
      mockEdge.mock.calls.filter(([name]) => name === "parse-sms")
    ).toHaveLength(1);
  });

  it("hybrid prior trusted result cannot be overwritten by a duplicate AI fingerprint", async () => {
    setParserRoute("hybrid");
    const trusted = catalogCandidate("hybrid_trusted_qnb_purchase");
    const unrelated = catalogCandidate("hybrid_ai_purchase");
    const collision: SmsCandidate = {
      ...unrelated,
      smsFingerprint: trusted.smsFingerprint,
    };
    mockEdge.mockResolvedValue({
      data: {
        transactions: [
          {
            messageId: collision.message.id,
            amount: 999,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Fabricated",
            categorySystemName: "shopping",
            date: "2026-10-14",
            confidenceScore: 0.9,
            isTrusted: true,
          },
        ],
        completionStatus: "complete",
        negativeFingerprints: [],
        terminalFingerprints: [],
        unresolvedFingerprints: [],
      },
      error: null,
    });
    const result = await parseSmsWithOrchestrator(
      [trusted, collision],
      admittedContext(),
      undefined,
      undefined,
      { expectedUserId: OWNER, requestContext: smsRequestContext() }
    );
    expect(
      new Set(result.transactions.map((row) => row.smsFingerprint)).size
    ).toBe(result.transactions.length);
    expect(result.transactions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ amount: 999 })])
    );
    expect(result.reviewSession?.rows.length).toBe(result.transactions.length);
  });
});

function acceptShoppingEnrichment(): void {
  mockEdge.mockResolvedValueOnce({
    data: {
      categories: [
        {
          merchantId: "merchant-1",
          categorySystemName: "shopping",
          confidence: 0.95,
        },
      ],
    },
    error: null,
  });
}

function parseReviewedCandidate(
  candidate: SmsCandidate,
  onProgress?: Parameters<typeof parseSmsWithOrchestrator>[2]
): Promise<SmsParserOrchestratorResult> {
  return parseSmsWithOrchestrator(
    [candidate],
    admittedContext(),
    onProgress,
    undefined,
    { expectedUserId: OWNER, requestContext: smsRequestContext() }
  );
}

describe("#395 initial SMS repair — real enrichment and result contract", () => {
  it("keeps accepted trusted category enrichment instead of always falling back to Other", async () => {
    setParserRoute("hybrid");
    const trusted = catalogCandidate("hybrid_trusted_qnb_purchase");
    acceptShoppingEnrichment();
    const progressCategories: string[] = [];
    const result = await parseReviewedCandidate(trusted, (progress) => {
      progressCategories.push(
        ...progress.completedTransactions.map((row) => row.categoryId)
      );
    });
    expect(progressCategories).toEqual([SMS_REVIEW_OTHER_CATEGORY_ID]);
    expect(mockEdge.mock.calls.map(([name]) => name)).toEqual([
      "enrich-sms-categories",
    ]);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      smsFingerprint: trusted.smsFingerprint,
      amount: 16.79,
      categoryId: NORMALIZATION_IDS.shoppingCategory,
      confidence: TRUSTED_ENRICHED_PURCHASE_CONFIDENCE,
    });
    expect(result.transactions[0]?.reviewReasons).not.toContain(
      "category_needed"
    );
    expect(result.diagnostics.categoryEnrichedCount).toBe(1);
    expect(result.reviewSession?.rows[0]?.transaction.categoryId).toBe(
      NORMALIZATION_IDS.shoppingCategory
    );
    expect(result.reviewSession?.rows[0]?.selected).toBe(false);
  });

  it("preserves Hybrid unresolved reasons and exact diagnostic objects while attaching a session", async () => {
    setParserRoute("local");
    const candidate = catalogCandidate("nbe_debit_purchase");
    const local = await parseReviewedCandidate(candidate);
    const incoming: SmsParserOrchestratorResult = {
      ...local,
      hasError: true,
      isRetryable: true,
      unresolvedCandidates: [
        {
          candidate: catalogCandidate("hybrid_ai_purchase"),
          reason: "ai_failed",
          isRetryable: true,
        },
      ],
    };
    const result: SmsParserOrchestratorResult =
      await completeInitialSmsReviewResult({
        success: incoming,
        context: admittedContext(),
        candidates: [candidate],
      });
    expect(result.reviewSession?.rows).toHaveLength(1);
    expect(result.reviewSession?.sessionId).toBe(
      local.reviewSession?.sessionId
    );
    expect(result.unresolvedCandidates).toBe(incoming.unresolvedCandidates);
    expect(result.unresolvedCandidates[0]?.reason).toBe("ai_failed");
    expect(result.diagnostics).toBe(incoming.diagnostics);
    expect(result.safeguardSummary).toBe(incoming.safeguardSummary);
    expect(result.hasError).toBe(true);
    expect(result.isRetryable).toBe(true);
    expect(mockEdge).not.toHaveBeenCalled();
  });
});
