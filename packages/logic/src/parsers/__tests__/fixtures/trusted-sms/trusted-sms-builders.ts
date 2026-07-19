import { createHash } from "node:crypto";
import type {
  TrustedSmsCatalog,
  TrustedSmsPattern,
  TrustedSmsPromotionRecord,
} from "../../../trusted-sms-pattern-types";

const DEFAULT_ROLE_VALUES: Readonly<Record<string, string>> = {
  transaction_currency: "EGP",
  transaction_amount: "125.50",
  available_balance: "5000.00",
  card_last4: "2132",
  account_reference: "7660",
  source_account_suffix: "7660",
  transaction_reference: "abc123",
  message_code: "123456",
  otp_code: "123456",
  merchant_name: "TEST MERCHANT",
  atm_terminal: "ATM-TEST",
  counterparty_person: "TEST PERSON",
  phone_number: "19700",
  provider_hotline: "19700",
  transaction_date: "13/07",
  transaction_time: "12:55 PM",
  promotional_amount: "1000",
  promotional_rate: "13.5",
  campaign_year: "2026",
  public_url: "https://example.test",
  public_reference: "204899052",
};

const PASSED_VALIDATION = {
  schema: "passed",
  privacy: "passed",
  exactPositive: "passed",
  nearMatch: "passed",
  intentionalNegative: "passed",
  ambiguity: "passed",
  integrity: "passed",
} as const;

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildTrustedPattern(
  overrides: Partial<TrustedSmsPattern> = {}
): TrustedSmsPattern {
  const base = {
    schemaVersion: 1,
    patternId: "qnb-egypt-card-purchase-v1",
    patternVersion: 1,
    catalogVersion: 1,
    providerId: "qnb-egypt",
    verifiedSenderAliases: ["QNB EGYPT"],
    messageFamily: "card_purchase",
    currency: "EGP",
    enabled: true,
    runtimeScope: "trusted_production",
    sourceType: "qa-real-sms",
    autoSelectPolicy: "never",
    provenanceCode: "qa_operator_promoted",
    promotionId: "promotion-qnb-egypt-card-purchase-v1",
    segments: [
      { kind: "fixed", text: "Paid " },
      {
        kind: "placeholder",
        token: "CURRENCY",
        semanticRole: "transaction_currency",
      },
      { kind: "fixed", text: " " },
      {
        kind: "placeholder",
        token: "AMOUNT",
        semanticRole: "transaction_amount",
      },
      { kind: "fixed", text: " at " },
      {
        kind: "placeholder",
        token: "MERCHANT",
        semanticRole: "merchant_name",
      },
    ],
    expectedOutcome: {
      kind: "transaction",
      direction: "expense",
      reviewStatus: "needs_review",
      reviewReasons: ["low_confidence"],
      confidenceCeiling: 0.95,
    },
    validationStatus: PASSED_VALIDATION,
  } as const;
  const withoutDigest = { ...base, ...overrides };
  const pattern: TrustedSmsPattern = {
    ...withoutDigest,
    integrityDigest:
      overrides.integrityDigest ?? sha256(JSON.stringify(withoutDigest)),
  };
  return pattern;
}

export function buildTrustedCatalog(
  patterns: readonly TrustedSmsPattern[] = [buildTrustedPattern()],
  overrides: Partial<TrustedSmsCatalog> = {}
): TrustedSmsCatalog {
  const withoutDigest = {
    schemaVersion: 1 as const,
    catalogVersion: 1,
    patterns,
    ...overrides,
  };
  return {
    ...withoutDigest,
    integrityDigest:
      overrides.integrityDigest ?? sha256(JSON.stringify(withoutDigest)),
  };
}

export function buildPromotionRecord(
  overrides: Partial<TrustedSmsPromotionRecord> = {}
): TrustedSmsPromotionRecord {
  return {
    schemaVersion: 1,
    promotionId: "promotion-qnb-egypt-card-purchase-v1",
    candidateId: "qa-candidate-c925d4ba-4409-48fb-b619-647860e0eb24",
    evidenceDigest: "a".repeat(64),
    patternId: "qnb-egypt-card-purchase-v1",
    patternVersion: 1,
    catalogVersion: 1,
    reviewerId: "mohamed",
    approvedAt: "2026-07-16T00:00:00.000Z",
    decision: "promote",
    validation: PASSED_VALIDATION,
    validationEvidence: {
      exactPositive: "rendered_candidate",
      nearMatch: "mutate_each_fixed_segment",
      intentionalNegative: "unverified_sender",
    },
    ...overrides,
  };
}

export function renderTrustedPattern(
  pattern: TrustedSmsPattern,
  roleValues: Readonly<Record<string, string>> = {}
): string {
  return pattern.segments
    .map((segment) => {
      if (segment.kind === "fixed") return segment.text;
      if (
        segment.semanticRole === "transaction_currency" &&
        pattern.currency !== null
      ) {
        return roleValues[segment.semanticRole] ?? pattern.currency;
      }
      return (
        roleValues[segment.semanticRole] ??
        DEFAULT_ROLE_VALUES[segment.semanticRole] ??
        "VALUE"
      );
    })
    .join("");
}
