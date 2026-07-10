import { clampConfidence } from "../utils/ai-parser-utils";
import { MAX_TRANSACTION_AMOUNT } from "../utils/amount-helpers";
import {
  LOCAL_SMS_PATTERNS,
  LOCAL_SMS_VERY_HIGH_CONFIDENCE,
  validateLocalSmsPatternCatalog,
} from "./local-sms-pattern-catalog";
import type {
  LocalParsedSmsTransaction,
  LocalReviewReason,
  LocalSmsCandidate,
  LocalSmsParserError,
  LocalSmsParserRequest,
  LocalSmsParserResult,
  LocalSmsPattern,
  LocalSmsPatternMatch,
} from "./local-sms-parser-types";

const NON_TRANSACTIONAL_PATTERNS: readonly RegExp[] = [
  /\bOTP\b/i,
  /\bverification\s*code\b/i,
  /\boffer\b/i,
  /\bdiscount\b/i,
  /\bcashback\s+offer\b/i,
  /\bactivation\b/i,
  /\bstatement\b/i,
  /\breminder\b/i,
  /\bfailed\b/i,
  /\bdeclined\b/i,
  /\bpassword\b/i,
  /\bPIN\b/i,
  /\bsurvey\b/i,
];

function createErrorResult(error: LocalSmsParserError): LocalSmsParserResult {
  return {
    transactions: [],
    unsupportedCount: 0,
    matchedPatternIds: [],
    error,
  };
}

function validateRequest(
  request: LocalSmsParserRequest
): LocalSmsParserError | null {
  if (request.categories.length === 0) {
    return {
      kind: "invalid_categories",
      message: "Local SMS parser requires at least one category.",
    };
  }

  if (!request.supportedCurrencies.some((currency) => currency === "EGP")) {
    return {
      kind: "invalid_supported_currencies",
      message: "Local SMS parser requires supported currency configuration.",
    };
  }

  const catalogValidation = validateLocalSmsPatternCatalog();
  if (!catalogValidation.isValid) {
    return {
      kind: "catalog_configuration",
      message: "Local SMS parser catalog is invalid.",
    };
  }

  return null;
}

function isNonTransactionalCandidate(candidate: LocalSmsCandidate): boolean {
  return NON_TRANSACTIONAL_PATTERNS.some((pattern) =>
    pattern.test(candidate.body)
  );
}

function isKnownCategory(
  categorySystemName: string,
  request: LocalSmsParserRequest
): boolean {
  return request.categories.some(
    (category) => category.systemName === categorySystemName
  );
}

function createReviewReasons(
  match: LocalSmsPatternMatch,
  pattern: LocalSmsPattern,
  request: LocalSmsParserRequest
): readonly LocalReviewReason[] {
  const reasons = new Set<LocalReviewReason>([
    ...pattern.reviewReasons,
    ...(match.reviewReasons ?? []),
  ]);

  if (pattern.confidence < LOCAL_SMS_VERY_HIGH_CONFIDENCE) {
    reasons.add("low_confidence");
  }

  if (!isKnownCategory(match.categorySystemName, request)) {
    reasons.add("category_needed");
  }

  if (match.isAtmWithdrawal === true) {
    reasons.add("cash_transfer_review");
  }

  return Array.from(reasons);
}

function toParsedTransaction(
  candidate: LocalSmsCandidate,
  pattern: LocalSmsPattern,
  match: LocalSmsPatternMatch,
  request: LocalSmsParserRequest
): LocalParsedSmsTransaction | null {
  if (
    !Number.isFinite(match.amount) ||
    match.amount <= 0 ||
    match.amount > MAX_TRANSACTION_AMOUNT ||
    !request.supportedCurrencies.includes(match.currency)
  ) {
    return null;
  }

  const reviewReasons = createReviewReasons(match, pattern, request);
  const confidence = clampConfidence(pattern.confidence);
  const reviewStatus =
    pattern.reviewExpectation === "auto_selectable" &&
    pattern.runtimeScope === "dev_test" &&
    pattern.autoSelectPolicy === "dev_only" &&
    confidence >= LOCAL_SMS_VERY_HIGH_CONFIDENCE &&
    reviewReasons.length === 0
      ? "auto_selectable"
      : "needs_review";

  return {
    messageId: candidate.messageId,
    smsFingerprint: candidate.smsFingerprint,
    amount: match.amount,
    currency: match.currency,
    type: match.type,
    counterparty: match.counterparty,
    date: match.date,
    categorySystemName: match.categorySystemName,
    confidence,
    reviewStatus,
    reviewReasons,
    isAtmWithdrawal: match.isAtmWithdrawal,
    cardLast4: match.cardLast4,
    parserSource: "local",
    patternId: pattern.id,
    patternRuntimeScope: pattern.runtimeScope,
  };
}

function parseCandidate(
  candidate: LocalSmsCandidate,
  request: LocalSmsParserRequest
): LocalParsedSmsTransaction | null {
  if (
    candidate.body.trim().length === 0 ||
    candidate.sender.trim().length === 0 ||
    candidate.smsFingerprint.trim().length === 0 ||
    !Number.isFinite(candidate.receivedAtMs) ||
    isNonTransactionalCandidate(candidate)
  ) {
    return null;
  }

  for (const pattern of LOCAL_SMS_PATTERNS) {
    const match = pattern.matchRules.match({
      sender: candidate.sender,
      body: candidate.body,
      receivedAtMs: candidate.receivedAtMs,
    });
    if (!match) continue;

    return toParsedTransaction(candidate, pattern, match, request);
  }

  return null;
}

export function parseSmsWithLocalParser(
  request: LocalSmsParserRequest
): LocalSmsParserResult {
  const validationError = validateRequest(request);
  if (validationError) {
    return createErrorResult(validationError);
  }

  const transactions: LocalParsedSmsTransaction[] = [];
  let unsupportedCount = 0;

  for (const candidate of request.candidates) {
    const parsed = parseCandidate(candidate, request);
    if (parsed) {
      transactions.push(parsed);
    } else {
      unsupportedCount++;
    }
  }

  return {
    transactions,
    unsupportedCount,
    matchedPatternIds: transactions.map((transaction) => transaction.patternId),
  };
}
