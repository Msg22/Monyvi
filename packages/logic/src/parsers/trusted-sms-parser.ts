import { parseLocalSmsMessageDate } from "./local-sms-date-parser";
import { matchTrustedSmsTemplate } from "./trusted-sms-template-matcher";
import type {
  TrustedSmsExtractedValue,
  TrustedSmsParsedTransaction,
  TrustedSmsParserCandidate,
  TrustedSmsParserOutcome,
  TrustedSmsParserRequest,
  TrustedSmsParserResult,
  TrustedSmsPattern,
} from "./trusted-sms-pattern-types";

function findValue(
  values: readonly TrustedSmsExtractedValue[],
  role: TrustedSmsExtractedValue["semanticRole"]
): string | undefined {
  return values.find(({ semanticRole }) => semanticRole === role)?.value;
}

function requireValue(
  values: readonly TrustedSmsExtractedValue[],
  role: TrustedSmsExtractedValue["semanticRole"]
): string {
  const value = findValue(values, role);
  if (value === undefined) throw new Error(`trusted_sms_missing_value:${role}`);
  return value;
}

function parseTransactionDate(
  candidate: TrustedSmsParserCandidate,
  values: readonly TrustedSmsExtractedValue[]
): Date {
  const date = findValue(values, "transaction_date");
  if (date === undefined) return new Date(candidate.receivedAtMs);
  const time = findValue(values, "transaction_time");
  return parseLocalSmsMessageDate(
    time === undefined ? date : `${date} at ${time}`,
    candidate.receivedAtMs
  );
}

function mapTransaction(
  candidate: TrustedSmsParserCandidate,
  pattern: TrustedSmsPattern,
  values: readonly TrustedSmsExtractedValue[]
): TrustedSmsParsedTransaction {
  if (pattern.expectedOutcome.kind !== "transaction") {
    throw new Error("trusted_sms_invalid_transaction_outcome");
  }
  const isAtmWithdrawal = pattern.messageFamily === "atm_withdrawal";
  const currency = requireValue(values, "transaction_currency");
  if (currency !== "EGP" && currency !== "USD") {
    throw new Error("trusted_sms_invalid_currency");
  }
  return {
    messageId: candidate.candidateId,
    smsFingerprint: candidate.smsFingerprint,
    amount: Number(
      requireValue(values, "transaction_amount").replaceAll(",", "")
    ),
    currency,
    type: pattern.expectedOutcome.direction === "income" ? "INCOME" : "EXPENSE",
    counterparty: isAtmWithdrawal
      ? ""
      : (findValue(values, "merchant_name") ??
        findValue(values, "counterparty_person") ??
        ""),
    date: parseTransactionDate(candidate, values),
    categorySystemName: "other",
    confidence: Math.min(pattern.expectedOutcome.confidenceCeiling, 0.8),
    reviewStatus: "needs_review",
    reviewReasons: pattern.expectedOutcome.reviewReasons,
    ...(isAtmWithdrawal ? { isAtmWithdrawal: true } : {}),
    ...(findValue(values, "card_last4")
      ? { cardLast4: findValue(values, "card_last4") }
      : {}),
    parserSource: "trusted_local",
    patternId: pattern.patternId,
    patternVersion: pattern.patternVersion,
  };
}

function parseCandidate(
  candidate: TrustedSmsParserCandidate,
  request: TrustedSmsParserRequest
): TrustedSmsParserOutcome {
  const identity = {
    candidateId: candidate.candidateId,
    smsFingerprint: candidate.smsFingerprint,
  };
  if (request.activation.status !== "active") {
    return { ...identity, status: "catalog_error", reason: "catalog_inactive" };
  }
  const result = matchTrustedSmsTemplate({
    candidate,
    patterns: request.activation.patterns,
    supportedCurrencies: request.supportedCurrencies,
  });
  if (result.status === "matched") {
    return {
      ...identity,
      status: "matched",
      transaction: mapTransaction(
        candidate,
        result.pattern,
        result.extractedValues
      ),
    };
  }
  if (result.status === "catalog_error") {
    return { ...identity, ...result };
  }
  return { ...identity, ...result };
}

export function parseSmsWithTrustedCatalog(
  request: TrustedSmsParserRequest
): TrustedSmsParserResult {
  return {
    outcomes: request.candidates.map((candidate) =>
      parseCandidate(candidate, request)
    ),
  };
}
