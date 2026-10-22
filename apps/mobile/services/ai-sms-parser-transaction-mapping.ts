/**
 * Original SMS financial row → existing parsed transaction. Cohesively
 * extracted from the near-900-line chunk runner for T013 nullable v2 currency.
 * Review evidence remains a separate canonical value, never stored on finance.
 */
import {
  clampConfidence,
  normalizeCurrency,
  normalizeType,
  parseCategory,
  type CategoryMap,
  type ParsedSmsTransaction,
} from "@monyvi/logic";
import { logger } from "@/utils/logger";
import type { SmsAiFinancialTransaction } from "./ai-sms-parser-response";
import type { SmsCandidate } from "./ai-sms-parser-service";

export interface AiMappingResult {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly resolvedMessageIds: ReadonlySet<string>;
  readonly failedMessageIds: ReadonlySet<string>;
  readonly hasUncorrelatedFailure: boolean;
}

function parseDate(dateStr: string, fallbackMs: number): Date {
  const parsed = new Date(dateStr);
  return Number.isNaN(parsed.getTime()) ? new Date(fallbackMs) : parsed;
}

function mapAiTransaction(
  aiTx: SmsAiFinancialTransaction,
  candidate: SmsCandidate,
  validCategoryMap: CategoryMap,
  preferredCurrency?: string
): ParsedSmsTransaction {
  const counterparty =
    candidate.message.address &&
    aiTx.counterparty.toLowerCase().trim() ===
      candidate.message.address.toLowerCase().trim()
      ? ""
      : aiTx.counterparty;
  const category = parseCategory(aiTx.categorySystemName, validCategoryMap);
  // The existing financial-action type stays non-null. The captured preferred
  // code is display-only for v2 unknown, NEVER proof of currency omission.
  const displayCurrency = aiTx.currency ?? preferredCurrency;
  if (displayCurrency === undefined)
    throw new Error("Unconfirmed SMS display currency missing");
  return {
    amount: aiTx.amount,
    currency: normalizeCurrency(displayCurrency),
    type: normalizeType(aiTx.type),
    counterparty,
    date: parseDate(aiTx.date, candidate.message.date),
    source: "SMS",
    originLabel: candidate.message.address,
    deduplicationHash: candidate.smsFingerprint,
    smsFingerprint: candidate.smsFingerprint,
    senderDisplayName: candidate.message.address,
    categoryId: category.id,
    categoryDisplayName: category.displayName,
    rawSmsBody: candidate.message.body,
    confidence: clampConfidence(aiTx.confidenceScore),
    isAtmWithdrawal: aiTx.isAtmWithdrawal ?? false,
    cardLast4: aiTx.cardLast4,
  };
}

export function mapAiTransactions(
  aiTransactions: readonly SmsAiFinancialTransaction[],
  candidateMap: ReadonlyMap<string, SmsCandidate>,
  validCategoryMap: CategoryMap,
  preferredCurrency?: string
): AiMappingResult {
  const transactions: ParsedSmsTransaction[] = [];
  const resolvedMessageIds = new Set<string>();
  const failedMessageIds = new Set<string>();
  let hasUncorrelatedFailure = false;
  for (const aiTx of aiTransactions) {
    const candidate = candidateMap.get(aiTx.messageId);
    if (!candidate) {
      logger.warn("[ai-sms-parser] Unknown message identity, skipping", {
        reasonCode: "candidate_identity_unknown",
      });
      hasUncorrelatedFailure = true;
      continue;
    }
    if (!aiTx.isTrusted) {
      logger.info("[ai-sms-parser] Untrusted transaction, skipping", {
        reasonCode: "ai_result_untrusted",
      });
      resolvedMessageIds.add(aiTx.messageId);
      continue;
    }
    try {
      transactions.push(
        mapAiTransaction(aiTx, candidate, validCategoryMap, preferredCurrency)
      );
      resolvedMessageIds.add(aiTx.messageId);
    } catch (error: unknown) {
      failedMessageIds.add(aiTx.messageId);
      logger.warn("[ai-sms-parser] Transaction mapping failed", {
        reasonCode: "transaction_mapping_failed",
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
  }
  return {
    transactions,
    resolvedMessageIds,
    failedMessageIds,
    hasUncorrelatedFailure,
  };
}
