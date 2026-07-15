import {
  QA_SMS_NO_CURRENCY_FAMILIES,
  type QaExpectedOutcome,
  QaSanitizedCandidateDraft,
  QaSmsCurrency,
  QaSmsMessageFamily,
  getQaSmsCoverageCurrencies,
  getQaSmsTransactionDirection,
} from "./qa-sms-pattern-types";

interface QaSmsDraftClassification {
  readonly messageFamily: QaSmsMessageFamily;
  readonly currency: QaSmsCurrency;
}

const NON_FINANCIAL_FAMILIES = new Set<QaSmsMessageFamily>(
  QA_SMS_NO_CURRENCY_FAMILIES
);

const SANITIZER_FINDING_CODES = new Set([
  "ambiguous_dynamic_value",
  "unknown_dynamic_value",
]);

export function isQaSmsCurrencySupportedForFamily(
  messageFamily: QaSmsMessageFamily,
  currency: QaSmsCurrency
): boolean {
  return getQaSmsCoverageCurrencies(messageFamily).some(
    (supportedCurrency) => supportedCurrency === currency
  );
}

function buildTransactionOutcome(
  messageFamily: QaSmsMessageFamily
): QaExpectedOutcome {
  const direction = getQaSmsTransactionDirection(messageFamily);
  if (direction === null) throw new Error("transaction_direction_required");
  const isTransfer =
    messageFamily === "incoming_ipn_transfer" ||
    messageFamily === "outgoing_ipn_transfer";
  return {
    kind: "transaction",
    direction,
    requiredPlaceholderRoles: ["transaction_amount"],
    confidenceCeiling: 0.8,
    reviewStatus: "needs_review",
    reviewReasons: isTransfer
      ? ["candidate_pattern", "transfer_accounts_required"]
      : messageFamily === "atm_withdrawal"
        ? ["candidate_pattern", "account_context_required"]
        : ["candidate_pattern"],
  };
}

function buildExpectedOutcome(
  messageFamily: QaSmsMessageFamily
): QaExpectedOutcome {
  if (messageFamily === "bank_to_wallet_transfer") {
    return {
      kind: "transfer",
      direction: "bank_to_wallet",
      requiredPlaceholderRoles: ["transaction_amount"],
      confidenceCeiling: 0.8,
      reviewStatus: "needs_review",
      reviewReasons: ["candidate_pattern", "transfer_accounts_required"],
    };
  }
  if (messageFamily === "failed_transaction") {
    return { kind: "rejection", reason: "failed_transaction" };
  }
  if (messageFamily === "otp") {
    return { kind: "rejection", reason: "otp" };
  }
  if (messageFamily === "informational") {
    return { kind: "rejection", reason: "informational" };
  }
  if (messageFamily === "promotional") {
    return { kind: "rejection", reason: "promotional" };
  }
  return buildTransactionOutcome(messageFamily);
}

export function classifyQaSmsDraft(
  draft: QaSanitizedCandidateDraft,
  classification: QaSmsDraftClassification
): QaSanitizedCandidateDraft {
  const isNonFinancial = NON_FINANCIAL_FAMILIES.has(
    classification.messageFamily
  );
  if (!isNonFinancial && classification.currency === null) {
    throw new Error("currency_required_for_financial_family");
  }
  if (isNonFinancial && classification.currency !== null) {
    throw new Error("currency_not_applicable_for_non_financial_family");
  }
  if (
    !isQaSmsCurrencySupportedForFamily(
      classification.messageFamily,
      classification.currency
    )
  ) {
    throw new Error("currency_not_supported_for_message_family");
  }
  const sanitizerFindings = draft.validationFindings.filter(({ code }) =>
    SANITIZER_FINDING_CODES.has(code)
  );

  return {
    ...draft,
    messageFamily: classification.messageFamily,
    currency: classification.currency,
    expectedOutcome: buildExpectedOutcome(classification.messageFamily),
    classificationStatus: "confirmed",
    validationFindings: sanitizerFindings,
    status: sanitizerFindings.length > 0 ? "blocked" : "draft",
  };
}

export type { QaSmsDraftClassification };
