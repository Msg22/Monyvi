import { smsReviewFixtureCategories } from "./sms-review-real-sqlite-fixture";
import type { AccountReviewSession } from "../../../../packages/logic/src/account-review/review-schemas";
import {
  makeSmsInput,
  makeTwoSmsInput,
} from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import type { SmsReviewChunk } from "@/services/ai-sms-parser-review";
import type {
  ParseSmsContext,
  SmsCandidate,
  SmsAiRequestContext,
} from "@/services/ai-sms-parser-service";
import { createCompleteSmsAccountReviewSession } from "@/services/account-review-source-adapter-service";
import type { Lease } from "./sms-review-namespace-test-harness";

export function chunksFromOriginal(): readonly SmsReviewChunk[] {
  const original = makeSmsInput();
  return [
    {
      requestKey: original.requestKey,
      financialRows: original.financialRows,
      mappedTransactions: original.mappedTransactions,
      submittedMessages: original.submittedMessages,
      providerResponse: original.providerResponse,
    },
  ];
}

export function separateOriginalChunks(): readonly SmsReviewChunk[] {
  const original = makeTwoSmsInput();
  return original.financialRows.map((row, index) => {
    const mapped = original.mappedTransactions[index];
    const message = original.submittedMessages[index];
    if (!mapped || !message) throw new Error("Missing original SMS peer");
    const localAlias = "tx-1"; // same model alias in *different* chunks
    const suggestion = original.providerResponse.suggestedAccounts[0];
    if (!suggestion) throw new Error("Missing source suggestion");
    return {
      requestKey: "submitted-chunk-" + index,
      financialRows: [{ ...row, transactionRef: localAlias }],
      mappedTransactions: [mapped],
      submittedMessages: [message],
      providerResponse: {
        ...original.providerResponse,
        transactions: [{ ...row, transactionRef: localAlias }],
        suggestedAccounts: [
          {
            ...suggestion,
            transactionRefs: [localAlias],
          },
        ],
      },
    };
  });
}

export async function complete(
  acceptedReviewChunks: readonly SmsReviewChunk[],
  lease: Lease
): Promise<AccountReviewSession> {
  return createCompleteSmsAccountReviewSession({
    reviewAccountSnapshots: makeSmsInput().reviewAccountSnapshots,
    acceptedReviewChunks,
    sourceRevision: "0",
    namespaceLease: lease,
  });
}

export function admittedContext(): ParseSmsContext {
  return {
    categories: smsReviewFixtureCategories(),
    supportedCurrencies: ["EGP", "USD"],
    reviewAccountSnapshots: makeSmsInput().reviewAccountSnapshots,
  };
}

export function smsCandidate(
  id: string,
  fingerprint: string,
  body: string
): SmsCandidate {
  return {
    message: {
      id,
      address: "QNB",
      body,
      read: false,
      date: Date.parse("2026-10-14T12:00:00.000Z"),
    },
    smsFingerprint: fingerprint,
  };
}

export function originalCandidate(): SmsCandidate {
  const original = makeSmsInput().submittedMessages[0];
  if (!original) throw new Error("Missing original admitted message");
  return smsCandidate(original.id, original.smsFingerprint, original.body);
}

export function smsRequestContext(): SmsAiRequestContext {
  return {
    scanKind: "incremental" as const,
    scanSessionId: "opaque-scan-not-a-uuid",
    scanStartedAtMs: Date.parse("2026-10-14T12:00:00.000Z"),
  };
}
