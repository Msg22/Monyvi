/** Existing trusted mapping policies, extracted only to bound the orchestration file. */
import {
  buildCategoryMap,
  clampConfidence,
  normalizeCurrency,
  normalizeType,
  parseCategory,
  type ParsedSmsTransaction,
  type TrustedSmsParsedTransaction,
} from "@monyvi/logic";
import type { ParseSmsContext, SmsCandidate } from "./ai-sms-parser-service";
import {
  MIN_ACCEPTED_CATEGORY_CONFIDENCE,
  MIN_AUTO_SELECT_CATEGORY_CONFIDENCE,
  TRUSTED_ENRICHED_PURCHASE_CONFIDENCE,
  type TrustedSmsCategoryCandidate,
  type TrustedSmsCategoryEnrichmentResult,
  type TrustedSmsCategoryOutcome,
} from "./ai-sms-category-enrichment-service";

function trustedCategoryMatch(
  transaction: TrustedSmsParsedTransaction,
  context: ParseSmsContext,
  categoryOutcome?: TrustedSmsCategoryOutcome
): ParseSmsContext["categories"][number] | undefined {
  return transaction.messageFamily === "card_purchase" &&
    categoryOutcome !== undefined &&
    Number.isFinite(categoryOutcome.confidence) &&
    categoryOutcome.confidence >= MIN_ACCEPTED_CATEGORY_CONFIDENCE
    ? context.categories.find(
        (category) =>
          category.isSystem === true &&
          category.type === "EXPENSE" &&
          category.isHidden !== true &&
          category.isInternal !== true &&
          category.deleted !== true &&
          category.systemName === categoryOutcome.categorySystemName
      )
    : undefined;
}

function trustedCategoryProjection(
  transaction: TrustedSmsParsedTransaction,
  context: ParseSmsContext,
  categoryOutcome?: TrustedSmsCategoryOutcome
): {
  readonly category: { readonly id: string; readonly displayName: string };
  readonly acceptedCategoryOutcome: TrustedSmsCategoryOutcome | undefined;
  readonly reviewReasons: TrustedSmsParsedTransaction["reviewReasons"];
} {
  const acceptedCategory = trustedCategoryMatch(
    transaction,
    context,
    categoryOutcome
  );
  const acceptedCategoryOutcome =
    acceptedCategory !== undefined && categoryOutcome !== undefined
      ? categoryOutcome
      : undefined;
  const requiresCategoryReview =
    acceptedCategoryOutcome !== undefined &&
    acceptedCategoryOutcome.confidence < MIN_AUTO_SELECT_CATEGORY_CONFIDENCE;
  const category = acceptedCategory
    ? {
        id: acceptedCategory.id,
        displayName: acceptedCategory.displayName,
      }
    : parseCategory(
        transaction.categorySystemName,
        buildCategoryMap(context.categories)
      );
  const preservedReviewReasons =
    acceptedCategoryOutcome !== undefined
      ? transaction.reviewReasons.filter(
          (reason) =>
            reason !== "low_confidence" && reason !== "category_needed"
        )
      : transaction.reviewReasons;
  const reviewReasons = requiresCategoryReview
    ? [...preservedReviewReasons, "category_needed" as const]
    : preservedReviewReasons;
  return { category, acceptedCategoryOutcome, reviewReasons };
}

export function mapTrustedTransaction(
  transaction: TrustedSmsParsedTransaction,
  candidate: SmsCandidate,
  context: ParseSmsContext,
  categoryOutcome?: TrustedSmsCategoryOutcome
): ParsedSmsTransaction {
  const { category, acceptedCategoryOutcome, reviewReasons } =
    trustedCategoryProjection(transaction, context, categoryOutcome);
  return {
    amount: transaction.amount,
    currency: normalizeCurrency(transaction.currency),
    type: normalizeType(transaction.type),
    counterparty: transaction.counterparty,
    date: transaction.date,
    categoryId: category.id,
    categoryDisplayName: category.displayName,
    confidence:
      acceptedCategoryOutcome !== undefined
        ? TRUSTED_ENRICHED_PURCHASE_CONFIDENCE
        : clampConfidence(transaction.confidence),
    originLabel: candidate.message.address,
    source: "SMS",
    deduplicationHash: candidate.smsFingerprint,
    smsFingerprint: candidate.smsFingerprint,
    senderDisplayName: candidate.message.address,
    rawSmsBody: candidate.message.body,
    reviewStatus:
      acceptedCategoryOutcome !== undefined && reviewReasons.length === 0
        ? "auto_selectable"
        : "needs_review",
    reviewReasons,
    isAtmWithdrawal: transaction.isAtmWithdrawal,
    cardLast4: transaction.cardLast4,
  };
}

export function toCategoryCandidate(
  transaction: TrustedSmsParsedTransaction
): TrustedSmsCategoryCandidate | null {
  if (
    transaction.messageFamily !== "card_purchase" ||
    transaction.type !== "EXPENSE" ||
    transaction.counterparty.trim().length === 0
  ) {
    return null;
  }
  return {
    candidateId: transaction.messageId,
    merchant: transaction.counterparty,
    transactionType: transaction.type,
    messageFamily: transaction.messageFamily,
  };
}

export function createEmptyCategoryEnrichmentResult(): TrustedSmsCategoryEnrichmentResult {
  return {
    outcomesByCandidateId: new Map(),
    attemptedMerchantCount: 0,
    acceptedCandidateCount: 0,
    rejectedResultCount: 0,
    missingResultCount: 0,
    hasError: false,
  };
}
