import type { CurrencyType, TransactionType } from "@monyvi/db";
import { isKnownFinancialSender } from "./egyptian-bank-registry";
import { parseLocalSmsMessageDate } from "./local-sms-date-parser";
import type {
  LocalReviewReason,
  LocalSmsMatchInput,
  LocalSmsPattern,
  LocalSmsPatternMatch,
} from "./local-sms-parser-types";

const VERY_HIGH_CONFIDENCE = 0.96;
const ACCOUNT_NEEDED_REVIEW_REASONS: readonly LocalReviewReason[] = [
  "account_needed",
];
const CURRENCY_CODES = [
  "EGP",
  "USD",
  "EUR",
  "GBP",
  "SAR",
  "AED",
  "KWD",
] as const;
const AMOUNT_PATTERN = new RegExp(
  `(?<currency>${CURRENCY_CODES.join("|")})\\s*(?<amount>\\d[\\d,.]*)`,
  "i"
);

interface ParsedAmount {
  readonly amount: number;
  readonly currency: CurrencyType;
}

interface PatternConfig {
  readonly id: string;
  readonly provider: string;
  readonly description: string;
  readonly sanitizedExampleShape: string;
  readonly acceptanceExample: string;
  readonly expected: {
    readonly amount: number;
    readonly currency: CurrencyType;
    readonly type: TransactionType;
    readonly counterparty: string;
    readonly categorySystemName: string;
    readonly confidence: number;
    readonly reviewStatus: "auto_selectable" | "needs_review";
    readonly reviewReasons: readonly LocalReviewReason[];
    readonly cardLast4?: string;
    readonly isAtmWithdrawal?: boolean;
  };
  readonly confidence: number;
  readonly reviewExpectation: "auto_selectable" | "needs_review";
  readonly reviewReasons: readonly LocalReviewReason[];
  readonly edgeCases: readonly string[];
  readonly match: (input: LocalSmsMatchInput) => LocalSmsPatternMatch | null;
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

function extractAmount(body: string): ParsedAmount | null {
  const match = AMOUNT_PATTERN.exec(body);
  const amountText = match?.groups?.amount;
  const currencyText = match?.groups?.currency;
  if (!amountText || !currencyText) return null;

  const amount = parseAmount(amountText);
  const currency = toCurrency(currencyText);
  return amount === null || currency === null ? null : { amount, currency };
}

function extractCardLast4(body: string): string | undefined {
  return (
    /(?:card\s*(?:ending|ends?|no\.?)?|card\s*\*+)\s*(?<last4>\d{4})/i.exec(
      body
    ) ?? /\*{2,}\s*(?<last4>\d{4})/.exec(body)
  )?.groups?.last4;
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

function isKnownType(
  input: LocalSmsMatchInput,
  type: "bank" | "wallet"
): boolean {
  return isKnownFinancialSender(input.sender)?.type === type;
}

function matchBankPurchase(
  input: LocalSmsMatchInput
): LocalSmsPatternMatch | null {
  if (!isKnownType(input, "bank")) return null;
  const body = normalizeText(input.body);
  const amount = extractAmount(body);
  const merchant =
    /\bat\s+(?<merchant>.+?)(?:\s+on\s+\d{1,2}[/-]|\s+using\s+card|\.\s*Avail|\s+Avail|\s*$)/i.exec(
      body
    )?.groups?.merchant;
  return amount && /\bpurchase\b/i.test(body) && merchant
    ? createMatch(input, {
        amount,
        type: "EXPENSE",
        counterparty: merchant,
        categorySystemName: "shopping",
        reviewReasons: extractCardLast4(body) ? [] : ["account_needed"],
      })
    : null;
}

function matchBankAtm(input: LocalSmsMatchInput): LocalSmsPatternMatch | null {
  if (!isKnownType(input, "bank")) return null;
  const body = normalizeText(input.body);
  const amount = extractAmount(body);
  return amount && /\bATM\b/i.test(body) && /\bwithdrawal\b/i.test(body)
    ? createMatch(input, {
        amount,
        type: "EXPENSE",
        counterparty: "ATM Withdrawal",
        categorySystemName: "other",
        isAtmWithdrawal: true,
        reviewReasons: ["cash_transfer_review"],
      })
    : null;
}

function matchBankTransfer(
  input: LocalSmsMatchInput,
  type: TransactionType
): LocalSmsPatternMatch | null {
  if (!isKnownType(input, "bank")) return null;
  const body = normalizeText(input.body);
  const isIncoming = type === "INCOME";
  const verb = isIncoming
    ? /\bcredit\s+[A-Z]{3}\s+\d/i
    : /\btransfer\s+[A-Z]{3}\s+\d/i;
  const party = (
    isIncoming
      ? /\bfrom\s+(?<counterparty>.+?)(?:\s+on\s+\d{1,2}\/\d{1,2}|\.\s*New|\s*$)/i
      : /\bto\s+(?<counterparty>.+?)(?:\s+on\s+\d{1,2}\/\d{1,2}|\.\s*Avail|\s*$)/i
  ).exec(body)?.groups?.counterparty;
  const amount = extractAmount(body);
  return amount && verb.test(body) && party
    ? createMatch(input, {
        amount,
        type,
        counterparty: party,
        categorySystemName: isIncoming ? "salary" : "other",
        reviewReasons: ["low_confidence"],
      })
    : null;
}

function matchWalletTransfer(
  input: LocalSmsMatchInput,
  type: TransactionType
): LocalSmsPatternMatch | null {
  if (!isKnownType(input, "wallet")) return null;
  const body = normalizeText(input.body);
  const isIncoming = type === "INCOME";
  const verb = isIncoming ? /\breceived\b/i : /\bsent\b/i;
  const phone = (
    isIncoming
      ? /\bfrom\s+(?<counterparty>01\d{9})\b/i
      : /\bto\s+(?<counterparty>01\d{9})\b/i
  ).exec(body)?.groups?.counterparty;
  const amount = extractAmount(body);
  return amount && verb.test(body) && phone
    ? createMatch(input, {
        amount,
        type,
        counterparty: phone,
        categorySystemName: isIncoming ? "salary" : "other",
        reviewReasons: ACCOUNT_NEEDED_REVIEW_REASONS,
      })
    : null;
}

function matchWalletCash(
  input: LocalSmsMatchInput,
  type: TransactionType
): LocalSmsPatternMatch | null {
  if (!isKnownType(input, "wallet")) return null;
  const body = normalizeText(input.body);
  const phrase = type === "INCOME" ? /\bcash in\b/i : /\bcash out\b/i;
  const agent = /\bat\s+(?<counterparty>.+?)\s+agent\b/i.exec(body)?.groups
    ?.counterparty;
  const amount = extractAmount(body);
  return amount && phrase.test(body) && agent
    ? createMatch(input, {
        amount,
        type,
        counterparty: `${agent} agent`,
        categorySystemName: "other",
        reviewReasons: ACCOUNT_NEEDED_REVIEW_REASONS,
      })
    : null;
}

function matchWalletBill(
  input: LocalSmsMatchInput
): LocalSmsPatternMatch | null {
  if (!isKnownType(input, "wallet")) return null;
  const body = normalizeText(input.body);
  const biller = /\bfor\s+(?<counterparty>.+?)\s+from your wallet\b/i.exec(body)
    ?.groups?.counterparty;
  const amount = extractAmount(body);
  return amount && /\bbill payment\b/i.test(body) && biller
    ? createMatch(input, {
        amount,
        type: "EXPENSE",
        counterparty: biller,
        categorySystemName: "other",
        reviewReasons: ACCOUNT_NEEDED_REVIEW_REASONS,
      })
    : null;
}

function matchWalletMerchant(
  input: LocalSmsMatchInput
): LocalSmsPatternMatch | null {
  if (!isKnownType(input, "wallet")) return null;
  const body = normalizeText(input.body);
  const merchant = /\bto\s+(?<counterparty>.+?)\s+from your wallet\b/i.exec(
    body
  )?.groups?.counterparty;
  const amount = extractAmount(body);
  return amount && /\bpayment\b/i.test(body) && merchant
    ? createMatch(input, {
        amount,
        type: "EXPENSE",
        counterparty: merchant,
        categorySystemName: "shopping",
        reviewReasons: ACCOUNT_NEEDED_REVIEW_REASONS,
      })
    : null;
}

function pattern(config: PatternConfig): LocalSmsPattern {
  return {
    id: config.id,
    provider: config.provider,
    runtimeScope: "dev_test",
    sourceType: "synthetic",
    sourceConfidence: "unknown",
    autoSelectPolicy:
      config.reviewExpectation === "auto_selectable" ? "dev_only" : "never",
    promotionEligibility: "needs_trusted_provenance",
    sanitizedExampleShape: config.sanitizedExampleShape,
    acceptanceExamples: [config.acceptanceExample],
    matchRules: { description: config.description, match: config.match },
    expectedOutcome: config.expected,
    confidence: config.confidence,
    reviewExpectation: config.reviewExpectation,
    reviewReasons: config.reviewReasons,
    edgeCases: config.edgeCases,
  };
}

export const LOCAL_SMS_BROAD_DEV_TEST_PATTERNS: readonly LocalSmsPattern[] = [
  pattern({
    id: "egypt-bank-card-purchase",
    provider: "KNOWN_EGYPTIAN_BANK",
    description: "Known Egyptian bank card purchase dev/test template",
    sanitizedExampleShape:
      "<bank sender>: Purchase EGP <amount> on card **** <last4> at <merchant> on <date>. Avail bal EGP <balance>",
    acceptanceExample:
      "BANK: Purchase EGP 107.00 on card **** 4321 at BANK TEST MART 1 on 08/04 14:01. Avail bal EGP 12,000.00",
    expected: {
      amount: 107,
      currency: "EGP",
      type: "EXPENSE",
      counterparty: "BANK TEST MART 1",
      categorySystemName: "shopping",
      confidence: VERY_HIGH_CONFIDENCE,
      reviewStatus: "auto_selectable",
      reviewReasons: [],
      cardLast4: "4321",
    },
    confidence: VERY_HIGH_CONFIDENCE,
    reviewExpectation: "auto_selectable",
    reviewReasons: [],
    edgeCases: ["known sender required before purchase extraction"],
    match: matchBankPurchase,
  }),
  pattern({
    id: "egypt-bank-atm-withdrawal",
    provider: "KNOWN_EGYPTIAN_BANK",
    description: "Known Egyptian bank ATM withdrawal dev/test template",
    sanitizedExampleShape:
      "<bank sender>: ATM cash withdrawal EGP <amount> from card **** <last4> on <date>. Avail bal EGP <balance>",
    acceptanceExample:
      "BANK: ATM cash withdrawal EGP 528.00 from card **** 4321 on 08/04/2026 15:04. Avail bal EGP 8,000.00",
    expected: {
      amount: 528,
      currency: "EGP",
      type: "EXPENSE",
      counterparty: "ATM Withdrawal",
      categorySystemName: "other",
      confidence: VERY_HIGH_CONFIDENCE,
      reviewStatus: "needs_review",
      reviewReasons: ["cash_transfer_review"],
      isAtmWithdrawal: true,
      cardLast4: "4321",
    },
    confidence: VERY_HIGH_CONFIDENCE,
    reviewExpectation: "needs_review",
    reviewReasons: ["cash_transfer_review"],
    edgeCases: ["ATM withdrawals should stay needs-review"],
    match: matchBankAtm,
  }),
  pattern({
    id: "egypt-bank-transfer-in",
    provider: "KNOWN_EGYPTIAN_BANK",
    description: "Known Egyptian bank incoming transfer dev/test template",
    sanitizedExampleShape:
      "<bank sender>: Credit EGP <amount> to account **** <last4> via transfer from <counterparty> on <date>. New bal EGP <balance>",
    acceptanceExample:
      "BANK: Credit EGP 1214.00 to account **** 4321 via transfer from BANK TEST USER 2 on 08/04. New bal EGP 15,000.00",
    expected: {
      amount: 1214,
      currency: "EGP",
      type: "INCOME",
      counterparty: "BANK TEST USER 2",
      categorySystemName: "salary",
      confidence: 0.94,
      reviewStatus: "needs_review",
      reviewReasons: ["low_confidence"],
      cardLast4: "4321",
    },
    confidence: 0.94,
    reviewExpectation: "needs_review",
    reviewReasons: ["low_confidence"],
    edgeCases: ["transfer counterparties are synthetic and need review"],
    match: (input) => matchBankTransfer(input, "INCOME"),
  }),
  pattern({
    id: "egypt-bank-transfer-out",
    provider: "KNOWN_EGYPTIAN_BANK",
    description: "Known Egyptian bank outgoing transfer dev/test template",
    sanitizedExampleShape:
      "<bank sender>: Transfer EGP <amount> from account **** <last4> to <counterparty> on <date>. Avail bal EGP <balance>",
    acceptanceExample:
      "BANK: Transfer EGP 671.00 from account **** 4321 to BANK TEST USER 3 on 08/04. Avail bal EGP 9,000.00",
    expected: {
      amount: 671,
      currency: "EGP",
      type: "EXPENSE",
      counterparty: "BANK TEST USER 3",
      categorySystemName: "other",
      confidence: 0.94,
      reviewStatus: "needs_review",
      reviewReasons: ["low_confidence"],
      cardLast4: "4321",
    },
    confidence: 0.94,
    reviewExpectation: "needs_review",
    reviewReasons: ["low_confidence"],
    edgeCases: ["transfer counterparties are synthetic and need review"],
    match: (input) => matchBankTransfer(input, "EXPENSE"),
  }),
  pattern({
    id: "egypt-wallet-transfer-in",
    provider: "KNOWN_EGYPTIAN_WALLET",
    description: "Known Egyptian wallet incoming transfer dev/test template",
    sanitizedExampleShape:
      "<wallet sender>: You received EGP <amount> from <phone> to your wallet. Balance EGP <balance>",
    acceptanceExample:
      "VF-CASH: You received EGP 1475.00 from 01000000200 to your wallet. Balance EGP 900.00",
    expected: {
      amount: 1475,
      currency: "EGP",
      type: "INCOME",
      counterparty: "01000000200",
      categorySystemName: "salary",
      confidence: VERY_HIGH_CONFIDENCE,
      reviewStatus: "needs_review",
      reviewReasons: ACCOUNT_NEEDED_REVIEW_REASONS,
    },
    confidence: VERY_HIGH_CONFIDENCE,
    reviewExpectation: "needs_review",
    reviewReasons: ACCOUNT_NEEDED_REVIEW_REASONS,
    edgeCases: ["known wallet sender required"],
    match: (input) => matchWalletTransfer(input, "INCOME"),
  }),
  pattern({
    id: "egypt-wallet-transfer-out",
    provider: "KNOWN_EGYPTIAN_WALLET",
    description: "Known Egyptian wallet outgoing transfer dev/test template",
    sanitizedExampleShape:
      "<wallet sender>: You sent EGP <amount> to <phone> from your wallet. Balance EGP <balance>",
    acceptanceExample:
      "VF-CASH: You sent EGP 1490.00 to 01000000201 from your wallet. Balance EGP 750.00",
    expected: {
      amount: 1490,
      currency: "EGP",
      type: "EXPENSE",
      counterparty: "01000000201",
      categorySystemName: "other",
      confidence: VERY_HIGH_CONFIDENCE,
      reviewStatus: "needs_review",
      reviewReasons: ACCOUNT_NEEDED_REVIEW_REASONS,
    },
    confidence: VERY_HIGH_CONFIDENCE,
    reviewExpectation: "needs_review",
    reviewReasons: ACCOUNT_NEEDED_REVIEW_REASONS,
    edgeCases: ["known wallet sender required"],
    match: (input) => matchWalletTransfer(input, "EXPENSE"),
  }),
  pattern({
    id: "egypt-wallet-cash-in",
    provider: "KNOWN_EGYPTIAN_WALLET",
    description: "Known Egyptian wallet cash-in dev/test template",
    sanitizedExampleShape:
      "<wallet sender>: Cash in EGP <amount> to your wallet at <agent>. Balance EGP <balance>",
    acceptanceExample:
      "VF-CASH: Cash in EGP 1650.00 to your wallet at Vodafone Cash agent. Balance EGP 1,200.00",
    expected: {
      amount: 1650,
      currency: "EGP",
      type: "INCOME",
      counterparty: "Vodafone Cash agent",
      categorySystemName: "other",
      confidence: VERY_HIGH_CONFIDENCE,
      reviewStatus: "needs_review",
      reviewReasons: ACCOUNT_NEEDED_REVIEW_REASONS,
    },
    confidence: VERY_HIGH_CONFIDENCE,
    reviewExpectation: "needs_review",
    reviewReasons: ACCOUNT_NEEDED_REVIEW_REASONS,
    edgeCases: ["cash in should not parse the balance as amount"],
    match: (input) => matchWalletCash(input, "INCOME"),
  }),
  pattern({
    id: "egypt-wallet-cash-out",
    provider: "KNOWN_EGYPTIAN_WALLET",
    description: "Known Egyptian wallet cash-out dev/test template",
    sanitizedExampleShape:
      "<wallet sender>: Cash out EGP <amount> from your wallet at <agent>. Balance EGP <balance>",
    acceptanceExample:
      "VF-CASH: Cash out EGP 1580.00 from your wallet at Vodafone Cash agent. Balance EGP 700.00",
    expected: {
      amount: 1580,
      currency: "EGP",
      type: "EXPENSE",
      counterparty: "Vodafone Cash agent",
      categorySystemName: "other",
      confidence: VERY_HIGH_CONFIDENCE,
      reviewStatus: "needs_review",
      reviewReasons: ACCOUNT_NEEDED_REVIEW_REASONS,
    },
    confidence: VERY_HIGH_CONFIDENCE,
    reviewExpectation: "needs_review",
    reviewReasons: ACCOUNT_NEEDED_REVIEW_REASONS,
    edgeCases: ["cash out should not parse the balance as amount"],
    match: (input) => matchWalletCash(input, "EXPENSE"),
  }),
  pattern({
    id: "egypt-wallet-bill-payment",
    provider: "KNOWN_EGYPTIAN_WALLET",
    description: "Known Egyptian wallet bill payment dev/test template",
    sanitizedExampleShape:
      "<wallet sender>: Bill payment EGP <amount> for <biller> from your wallet. Balance EGP <balance>",
    acceptanceExample:
      "VF-CASH: Bill payment EGP 1455.00 for TEST UTILITY from your wallet. Balance EGP 650.00",
    expected: {
      amount: 1455,
      currency: "EGP",
      type: "EXPENSE",
      counterparty: "TEST UTILITY",
      categorySystemName: "other",
      confidence: VERY_HIGH_CONFIDENCE,
      reviewStatus: "needs_review",
      reviewReasons: ACCOUNT_NEEDED_REVIEW_REASONS,
    },
    confidence: VERY_HIGH_CONFIDENCE,
    reviewExpectation: "needs_review",
    reviewReasons: ACCOUNT_NEEDED_REVIEW_REASONS,
    edgeCases: ["bill payment should keep biller as counterparty"],
    match: matchWalletBill,
  }),
  pattern({
    id: "egypt-wallet-merchant-payment",
    provider: "KNOWN_EGYPTIAN_WALLET",
    description: "Known Egyptian wallet merchant payment dev/test template",
    sanitizedExampleShape:
      "<wallet sender>: Payment EGP <amount> to <merchant> from your wallet. Balance EGP <balance>",
    acceptanceExample:
      "VF-CASH: Payment EGP 1442.00 to Vodafone Cash TEST MART 200 from your wallet. Balance EGP 600.00",
    expected: {
      amount: 1442,
      currency: "EGP",
      type: "EXPENSE",
      counterparty: "Vodafone Cash TEST MART 200",
      categorySystemName: "shopping",
      confidence: VERY_HIGH_CONFIDENCE,
      reviewStatus: "needs_review",
      reviewReasons: ACCOUNT_NEEDED_REVIEW_REASONS,
    },
    confidence: VERY_HIGH_CONFIDENCE,
    reviewExpectation: "needs_review",
    reviewReasons: ACCOUNT_NEEDED_REVIEW_REASONS,
    edgeCases: ["merchant payment should keep merchant as counterparty"],
    match: matchWalletMerchant,
  }),
];
