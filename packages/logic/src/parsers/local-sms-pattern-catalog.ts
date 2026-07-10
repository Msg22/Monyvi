import type { CurrencyType, TransactionType } from "@monyvi/db";
import { isKnownFinancialSender } from "./egyptian-bank-registry";
import { LOCAL_SMS_BROAD_DEV_TEST_PATTERNS } from "./local-sms-broad-dev-test-patterns";
import { parseLocalSmsMessageDate } from "./local-sms-date-parser";
import type {
  LocalReviewReason,
  LocalSmsMatchInput,
  LocalSmsPattern,
  LocalSmsPatternMatch,
  PatternAutoSelectPolicy,
  PatternPromotionEligibility,
  PatternRuntimeScope,
  PatternSourceConfidence,
  PatternSourceType,
} from "./local-sms-parser-types";

export type { LocalSmsPattern } from "./local-sms-parser-types";

export const LOCAL_SMS_VERY_HIGH_CONFIDENCE = 0.96;

const DEV_TEST_SOURCE_TYPES = new Set<PatternSourceType>([
  "fixture",
  "synthetic",
  "internet_or_unknown",
]);
const TRUSTED_PRODUCTION_SOURCE_TYPES = new Set<PatternSourceType>([
  "qa-real-sms",
  "consented-user-real-sms",
  "provider-published-example",
  "controlled-real-transaction",
]);
const SUPPORTED_SOURCE_TYPES = new Set<PatternSourceType>([
  ...DEV_TEST_SOURCE_TYPES,
  ...TRUSTED_PRODUCTION_SOURCE_TYPES,
]);
const SUPPORTED_RUNTIME_SCOPES = new Set<PatternRuntimeScope>([
  "dev_test",
  "candidate",
  "trusted_production",
]);
const SUPPORTED_SOURCE_CONFIDENCE = new Set<PatternSourceConfidence>([
  "unknown",
  "low",
  "medium",
  "verified",
]);
const SUPPORTED_AUTO_SELECT_POLICIES = new Set<PatternAutoSelectPolicy>([
  "dev_only",
  "never",
  "production_allowed",
]);
const SUPPORTED_PROMOTION_ELIGIBILITY = new Set<PatternPromotionEligibility>([
  "blocked_dev_fixture",
  "needs_trusted_provenance",
  "ready_for_phase2_review",
]);

const CURRENCY_CODES = [
  "EGP",
  "USD",
  "EUR",
  "GBP",
  "SAR",
  "AED",
  "KWD",
] as const;

interface ParsedAmount {
  readonly amount: number;
  readonly currency: CurrencyType;
}

export interface LocalSmsCatalogValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseAmount(value: string): number | null {
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function toCurrency(value: string): CurrencyType | null {
  const upper = value.toUpperCase();
  return (CURRENCY_CODES as readonly string[]).includes(upper)
    ? (upper as CurrencyType)
    : null;
}

function extractAmount(
  body: string,
  kind: "currency-first" | "amount-first" = "currency-first"
): ParsedAmount | null {
  const currencyPattern = CURRENCY_CODES.join("|");
  const pattern =
    kind === "amount-first"
      ? new RegExp(
          `(?<amount>\\d[\\d,.]*)\\s*(?<currency>${currencyPattern})`,
          "i"
        )
      : new RegExp(
          `(?<currency>${currencyPattern})\\s*(?<amount>\\d[\\d,.]*)`,
          "i"
        );
  const match = pattern.exec(body);
  const amountText = match?.groups?.amount;
  const currencyText = match?.groups?.currency;
  if (!amountText || !currencyText) return null;

  const amount = parseAmount(amountText);
  const currency = toCurrency(currencyText);
  if (amount === null || currency === null) return null;

  return { amount, currency };
}

function extractCardLast4(body: string): string | undefined {
  const match =
    /(?:card\s*(?:ending|ends?|no\.?)?|card\s*\*+)\s*(?<last4>\d{4})/i.exec(
      body
    ) ?? /\*{2,}\s*(?<last4>\d{4})/.exec(body);
  return match?.groups?.last4;
}

function createMatch(
  input: LocalSmsMatchInput,
  values: {
    readonly amount: ParsedAmount;
    readonly type: TransactionType;
    readonly counterparty: string;
    readonly categorySystemName: string;
    readonly isAtmWithdrawal?: boolean;
    readonly reviewReasons?: readonly LocalReviewReason[];
  }
): LocalSmsPatternMatch {
  return {
    amount: values.amount.amount,
    currency: values.amount.currency,
    type: values.type,
    counterparty: normalizeText(values.counterparty),
    categorySystemName: values.categorySystemName,
    date: parseLocalSmsMessageDate(input.body, input.receivedAtMs),
    cardLast4: extractCardLast4(input.body),
    isAtmWithdrawal: values.isAtmWithdrawal,
    reviewReasons: values.reviewReasons,
  };
}

function matchDebitPurchase(
  input: LocalSmsMatchInput
): LocalSmsPatternMatch | null {
  const body = normalizeText(input.body);
  const amount =
    extractAmount(body, "currency-first") ??
    extractAmount(body, "amount-first");
  if (!amount) return null;

  const merchantMatch =
    /(?:\bat\s+)(?<merchant>.+?)(?:\s+on\s+\d{1,2}[/-]|\s+using\s+card|\s+from\s+card|\.\s*Avail|\s+Avail|\s*$)/i.exec(
      body
    );
  const merchant = merchantMatch?.groups?.merchant;
  if (!merchant) return null;

  return createMatch(input, {
    amount,
    type: "EXPENSE",
    counterparty: merchant,
    categorySystemName: "shopping",
  });
}

function matchCreditCardCharge(
  input: LocalSmsMatchInput
): LocalSmsPatternMatch | null {
  const body = normalizeText(input.body);
  const amount = extractAmount(body, "currency-first");
  if (!amount || !/\bcharged\b/i.test(body)) return null;

  const merchantMatch =
    /\bat\s+(?<merchant>.+?)(?:\s+on\s+\d{1,2}-[A-Z]{3}-\d{4}|\.\s*Bal|\s*$)/i.exec(
      body
    );
  const merchant = merchantMatch?.groups?.merchant;
  if (!merchant) return null;

  return createMatch(input, {
    amount,
    type: "EXPENSE",
    counterparty: merchant,
    categorySystemName: "shopping",
  });
}

function matchAtmWithdrawal(
  input: LocalSmsMatchInput
): LocalSmsPatternMatch | null {
  const body = normalizeText(input.body);
  if (!/\bATM\b/i.test(body) || !/\bwithdrawal\b/i.test(body)) return null;
  const amount =
    extractAmount(body, "currency-first") ??
    extractAmount(body, "amount-first");
  if (!amount) return null;

  return createMatch(input, {
    amount,
    type: "EXPENSE",
    counterparty: "ATM Withdrawal",
    categorySystemName: "other",
    isAtmWithdrawal: true,
    reviewReasons: ["cash_transfer_review"],
  });
}

function matchIncomingTransfer(
  input: LocalSmsMatchInput
): LocalSmsPatternMatch | null {
  const body = normalizeText(input.body);
  if (!/\bcredit\b/i.test(body) || !/\btransfer\b/i.test(body)) return null;
  const amount = extractAmount(body, "currency-first");
  const fromMatch =
    /\bfrom\s+(?<counterparty>.+?)(?:\s+on\s+\d{1,2}\/\d{1,2}|\.\s*New|\s*$)/i.exec(
      body
    );
  if (!amount || !fromMatch?.groups?.counterparty) return null;

  return createMatch(input, {
    amount,
    type: "INCOME",
    counterparty: fromMatch.groups.counterparty,
    categorySystemName: "salary",
  });
}

export const LOCAL_SMS_PATTERNS: readonly LocalSmsPattern[] = [
  {
    id: "nbe-debit-purchase",
    provider: "NBE",
    runtimeScope: "dev_test",
    sourceType: "fixture",
    sourceConfidence: "unknown",
    autoSelectPolicy: "dev_only",
    promotionEligibility: "needs_trusted_provenance",
    sanitizedExampleShape:
      "Purchase EGP <amount> on card **** <last4> at <merchant> on <date>. Avail bal EGP <balance>",
    acceptanceExamples: [
      "Purchase EGP 250.00 on card **** 4321 at CARREFOUR CAIRO on 08/04 14:23. Avail bal EGP 12,430.55",
    ],
    matchRules: {
      description: "NBE debit card purchase confirmation",
      match: (input) =>
        /^NBE$/i.test(input.sender) && /\bpurchase\b/i.test(input.body)
          ? matchDebitPurchase(input)
          : null,
    },
    expectedOutcome: {
      amount: 250,
      currency: "EGP",
      type: "EXPENSE",
      counterparty: "CARREFOUR CAIRO",
      categorySystemName: "shopping",
      confidence: LOCAL_SMS_VERY_HIGH_CONFIDENCE,
      reviewStatus: "auto_selectable",
      reviewReasons: [],
      cardLast4: "4321",
    },
    confidence: LOCAL_SMS_VERY_HIGH_CONFIDENCE,
    reviewExpectation: "auto_selectable",
    reviewReasons: [],
    edgeCases: ["balance amount must not be extracted as transaction amount"],
  },
  {
    id: "cib-credit-card-charge",
    provider: "CIB",
    runtimeScope: "dev_test",
    sourceType: "fixture",
    sourceConfidence: "unknown",
    autoSelectPolicy: "never",
    promotionEligibility: "needs_trusted_provenance",
    sanitizedExampleShape:
      "CIB: EGP <amount> charged on your credit card ending <last4> at <merchant> on <date>. Bal: EGP <balance>",
    acceptanceExamples: [
      "CIB: EGP 1,299.00 charged on your credit card ending 9988 at AMAZON.EG on 08-APR-2026. Bal: EGP 4,201.00",
    ],
    matchRules: {
      description: "CIB credit card charge confirmation",
      match: (input) =>
        /^CIB$/i.test(input.sender) ? matchCreditCardCharge(input) : null,
    },
    expectedOutcome: {
      amount: 1299,
      currency: "EGP",
      type: "EXPENSE",
      counterparty: "AMAZON.EG",
      categorySystemName: "shopping",
      confidence: 0.94,
      reviewStatus: "needs_review",
      reviewReasons: ["low_confidence"],
      cardLast4: "9988",
    },
    confidence: 0.94,
    reviewExpectation: "needs_review",
    reviewReasons: ["low_confidence"],
    edgeCases: [
      "statement balance must not be extracted as transaction amount",
    ],
  },
  {
    id: "qnb-atm-withdrawal",
    provider: "QNB",
    runtimeScope: "dev_test",
    sourceType: "fixture",
    sourceConfidence: "unknown",
    autoSelectPolicy: "never",
    promotionEligibility: "needs_trusted_provenance",
    sanitizedExampleShape:
      "QNB Alahli: ATM cash withdrawal EGP <amount> from card **** <last4> on <date>. Avail bal EGP <balance>",
    acceptanceExamples: [
      "QNB Alahli: ATM cash withdrawal EGP 2,000.00 from card **** 5566 on 08/04/2026 15:02. Avail bal EGP 8,000.00",
    ],
    matchRules: {
      description: "QNB ATM withdrawal confirmation",
      match: (input) =>
        /^QNB$/i.test(input.sender) || /^QNB/i.test(input.body)
          ? matchAtmWithdrawal(input)
          : null,
    },
    expectedOutcome: {
      amount: 2000,
      currency: "EGP",
      type: "EXPENSE",
      counterparty: "ATM Withdrawal",
      categorySystemName: "other",
      confidence: 0.97,
      reviewStatus: "needs_review",
      reviewReasons: ["cash_transfer_review"],
      isAtmWithdrawal: true,
      cardLast4: "5566",
    },
    confidence: 0.97,
    reviewExpectation: "needs_review",
    reviewReasons: ["cash_transfer_review"],
    edgeCases: [
      "ATM withdrawals may need transfer handling after account match",
    ],
  },
  {
    id: "nbe-incoming-transfer",
    provider: "NBE",
    runtimeScope: "dev_test",
    sourceType: "fixture",
    sourceConfidence: "unknown",
    autoSelectPolicy: "never",
    promotionEligibility: "needs_trusted_provenance",
    sanitizedExampleShape:
      "NBE: Credit EGP <amount> to your account **** <last4> via transfer from <counterparty> on <date>. New bal EGP <balance>",
    acceptanceExamples: [
      "NBE: Credit EGP 15,000.00 to your account **** 4321 via transfer from REDACTED PERSON on 08/04. New bal EGP 27,430.55",
    ],
    matchRules: {
      description: "NBE incoming transfer confirmation",
      match: (input) =>
        /^NBE$/i.test(input.sender) ? matchIncomingTransfer(input) : null,
    },
    expectedOutcome: {
      amount: 15000,
      currency: "EGP",
      type: "INCOME",
      counterparty: "REDACTED PERSON",
      categorySystemName: "salary",
      confidence: 0.93,
      reviewStatus: "needs_review",
      reviewReasons: ["low_confidence"],
      cardLast4: "4321",
    },
    confidence: 0.93,
    reviewExpectation: "needs_review",
    reviewReasons: ["low_confidence"],
    edgeCases: ["new balance must not be extracted as transaction amount"],
  },
  ...LOCAL_SMS_BROAD_DEV_TEST_PATTERNS,
  {
    id: "generic-fixture-card-purchase",
    provider: "SUPPORTED_CARD_PROVIDER",
    runtimeScope: "dev_test",
    sourceType: "fixture",
    sourceConfidence: "unknown",
    autoSelectPolicy: "dev_only",
    promotionEligibility: "blocked_dev_fixture",
    sanitizedExampleShape:
      "Purchase EGP <amount> at <merchant> using card ending <last4>",
    acceptanceExamples: [
      "Purchase EGP 63.21 at BACKGROUND LIVE SMS TEST using card ending 1234",
    ],
    matchRules: {
      description: "Controlled live-SMS fixture card purchase confirmation",
      match: (input) =>
        isKnownFinancialSender(input.sender) &&
        /\bpurchase\b/i.test(input.body) &&
        /\busing card ending\b/i.test(input.body)
          ? matchDebitPurchase(input)
          : null,
    },
    expectedOutcome: {
      amount: 63.21,
      currency: "EGP",
      type: "EXPENSE",
      counterparty: "BACKGROUND LIVE SMS TEST",
      categorySystemName: "shopping",
      confidence: LOCAL_SMS_VERY_HIGH_CONFIDENCE,
      reviewStatus: "auto_selectable",
      reviewReasons: [],
      cardLast4: "1234",
    },
    confidence: LOCAL_SMS_VERY_HIGH_CONFIDENCE,
    reviewExpectation: "auto_selectable",
    reviewReasons: [],
    edgeCases: ["development/live E2E fixture only"],
  },
];

export function validateLocalSmsPatternCatalog(
  patterns: readonly LocalSmsPattern[] = LOCAL_SMS_PATTERNS
): LocalSmsCatalogValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const pattern of patterns) {
    if (seenIds.has(pattern.id)) {
      errors.push(`Duplicate local SMS pattern id: ${pattern.id}`);
    }
    seenIds.add(pattern.id);

    if (!SUPPORTED_RUNTIME_SCOPES.has(pattern.runtimeScope)) {
      errors.push(`Pattern ${pattern.id} has unsupported runtime scope`);
    }

    if (!SUPPORTED_SOURCE_TYPES.has(pattern.sourceType)) {
      errors.push(`Pattern ${pattern.id} has unsupported source type`);
    }

    if (!SUPPORTED_SOURCE_CONFIDENCE.has(pattern.sourceConfidence)) {
      errors.push(`Pattern ${pattern.id} has unsupported source confidence`);
    }

    if (!SUPPORTED_AUTO_SELECT_POLICIES.has(pattern.autoSelectPolicy)) {
      errors.push(`Pattern ${pattern.id} has unsupported auto-select policy`);
    }

    if (!SUPPORTED_PROMOTION_ELIGIBILITY.has(pattern.promotionEligibility)) {
      errors.push(
        `Pattern ${pattern.id} has unsupported promotion eligibility`
      );
    }

    if (pattern.acceptanceExamples.length === 0) {
      errors.push(`Pattern ${pattern.id} must include acceptance examples`);
    }

    if (
      DEV_TEST_SOURCE_TYPES.has(pattern.sourceType) &&
      pattern.runtimeScope !== "dev_test"
    ) {
      errors.push(
        `Pattern ${pattern.id} dev/test source must use dev_test scope`
      );
    }

    if (
      pattern.autoSelectPolicy === "production_allowed" &&
      pattern.runtimeScope !== "trusted_production"
    ) {
      errors.push(
        `Pattern ${pattern.id} uses production auto-select policy outside trusted production scope`
      );
    }

    if (
      pattern.runtimeScope === "trusted_production" &&
      (!TRUSTED_PRODUCTION_SOURCE_TYPES.has(pattern.sourceType) ||
        pattern.sourceConfidence !== "verified")
    ) {
      errors.push(
        `Pattern ${pattern.id} trusted production pattern requires verified trusted provenance`
      );
    }

    if (
      pattern.runtimeScope === "dev_test" &&
      pattern.autoSelectPolicy === "production_allowed"
    ) {
      errors.push(
        `Pattern ${pattern.id} uses production auto-select policy in dev/test scope`
      );
    }

    const examplesText = [
      pattern.sanitizedExampleShape,
      ...pattern.acceptanceExamples,
    ].join("\n");
    if (/\bMOHAMED\s+SAMIR\b/i.test(examplesText)) {
      errors.push(`Pattern ${pattern.id} contains unsanitized example data`);
    }

    if (
      pattern.reviewExpectation === "auto_selectable" &&
      (pattern.confidence < LOCAL_SMS_VERY_HIGH_CONFIDENCE ||
        pattern.reviewReasons.length > 0 ||
        (pattern.runtimeScope === "dev_test" &&
          pattern.autoSelectPolicy !== "dev_only") ||
        (pattern.runtimeScope === "trusted_production" &&
          pattern.autoSelectPolicy !== "production_allowed"))
    ) {
      errors.push(
        `Pattern ${pattern.id} cannot be auto-selectable with low confidence or review reasons`
      );
    }
  }

  return { isValid: errors.length === 0, errors };
}
