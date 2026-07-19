import { sha256Hex } from "./trusted-sms-integrity";
import {
  TRUSTED_SMS_CATALOG_SCHEMA_VERSION,
  TRUSTED_SMS_ELIGIBLE_FAMILIES,
  TRUSTED_SMS_PLACEHOLDER_ROLES,
  type TrustedSmsCatalog,
  type TrustedSmsCatalogActivation,
  type TrustedSmsCatalogValidationIssue,
  type TrustedSmsCatalogValidationResult,
  type TrustedSmsPattern,
} from "./trusted-sms-pattern-types";

const ELIGIBLE_FAMILIES = new Set<string>(TRUSTED_SMS_ELIGIBLE_FAMILIES);
const PLACEHOLDER_ROLES = new Set<string>(TRUSTED_SMS_PLACEHOLDER_ROLES);
const SHA_256_HEX = /^[a-f0-9]{64}$/;
const STABLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const TRANSACTION_DIRECTIONS = {
  card_purchase: "expense",
  atm_withdrawal: "expense",
  incoming_ipn_transfer: "income",
  outgoing_ipn_transfer: "expense",
  refund_or_reversal: "income",
} as const;

const REJECTION_REASONS = {
  failed_transaction: "failed_transaction",
  otp: "otp",
  informational: "informational",
  promotional: "promotional",
} as const;

function withoutIntegrity<T extends { readonly integrityDigest: string }>(
  value: T
): Omit<T, "integrityDigest"> {
  const { integrityDigest: _integrityDigest, ...payload } = value;
  return payload;
}

export function createTrustedSmsPatternIntegrityDigest(
  pattern: TrustedSmsPattern
): string {
  return sha256Hex(JSON.stringify(withoutIntegrity(pattern)));
}

export function createTrustedSmsCatalogIntegrityDigest(
  catalog: TrustedSmsCatalog
): string {
  return sha256Hex(JSON.stringify(withoutIntegrity(catalog)));
}

function addPatternIssue(
  issues: TrustedSmsCatalogValidationIssue[],
  pattern: TrustedSmsPattern,
  code: string
): void {
  issues.push({ code, patternId: pattern.patternId });
}

function hasPassedValidation(pattern: TrustedSmsPattern): boolean {
  return Object.values(pattern.validationStatus).every(
    (status) => status === "passed"
  );
}

function countPlaceholderRole(
  pattern: TrustedSmsPattern,
  role: string
): number {
  return pattern.segments.filter(
    (segment) => segment.kind === "placeholder" && segment.semanticRole === role
  ).length;
}

function hasValidTransactionContract(pattern: TrustedSmsPattern): boolean {
  if (pattern.expectedOutcome.kind !== "transaction") return true;
  return (
    pattern.currency !== null &&
    countPlaceholderRole(pattern, "transaction_currency") >= 1 &&
    countPlaceholderRole(pattern, "transaction_amount") === 1
  );
}

function hasValidExpectedOutcome(pattern: TrustedSmsPattern): boolean {
  if (pattern.expectedOutcome.kind === "transaction") {
    const expectedDirection =
      TRANSACTION_DIRECTIONS[
        pattern.messageFamily as keyof typeof TRANSACTION_DIRECTIONS
      ];
    return expectedDirection === pattern.expectedOutcome.direction;
  }
  return (
    REJECTION_REASONS[
      pattern.messageFamily as keyof typeof REJECTION_REASONS
    ] === pattern.expectedOutcome.reason
  );
}

function hasValidReviewPolicy(pattern: TrustedSmsPattern): boolean {
  if (pattern.expectedOutcome.kind !== "transaction") return true;
  return (
    Number.isFinite(pattern.expectedOutcome.confidenceCeiling) &&
    pattern.expectedOutcome.confidenceCeiling > 0 &&
    pattern.expectedOutcome.confidenceCeiling <= 1 &&
    pattern.expectedOutcome.reviewStatus === "needs_review" &&
    pattern.expectedOutcome.reviewReasons.length > 0
  );
}

function validatePattern(
  pattern: TrustedSmsPattern,
  catalogVersion: number,
  issues: TrustedSmsCatalogValidationIssue[]
): void {
  if (!STABLE_ID.test(pattern.patternId)) {
    addPatternIssue(issues, pattern, "pattern_id_invalid");
  }
  if (!Number.isInteger(pattern.patternVersion) || pattern.patternVersion < 1) {
    addPatternIssue(issues, pattern, "pattern_version_invalid");
  }
  if (!STABLE_ID.test(pattern.providerId)) {
    addPatternIssue(issues, pattern, "provider_id_invalid");
  }
  if (
    pattern.verifiedSenderAliases.length === 0 ||
    pattern.verifiedSenderAliases.some((alias) => alias.trim().length === 0)
  ) {
    addPatternIssue(issues, pattern, "sender_aliases_invalid");
  }
  if (!STABLE_ID.test(pattern.promotionId)) {
    addPatternIssue(issues, pattern, "promotion_id_invalid");
  }
  if (pattern.schemaVersion !== TRUSTED_SMS_CATALOG_SCHEMA_VERSION) {
    addPatternIssue(issues, pattern, "pattern_schema_version_invalid");
  }
  if (pattern.catalogVersion !== catalogVersion) {
    addPatternIssue(issues, pattern, "pattern_catalog_version_invalid");
  }
  if (pattern.runtimeScope !== "trusted_production") {
    addPatternIssue(issues, pattern, "runtime_scope_invalid");
  }
  if (pattern.autoSelectPolicy !== "never") {
    addPatternIssue(issues, pattern, "auto_select_policy_invalid");
  }
  if (pattern.sourceType !== "qa-real-sms") {
    addPatternIssue(issues, pattern, "source_type_invalid");
  }
  if (!ELIGIBLE_FAMILIES.has(pattern.messageFamily)) {
    addPatternIssue(issues, pattern, "message_family_invalid");
  }
  if (!hasValidReviewPolicy(pattern)) {
    addPatternIssue(issues, pattern, "review_policy_invalid");
  }
  if (!hasValidTransactionContract(pattern)) {
    addPatternIssue(issues, pattern, "transaction_contract_invalid");
  }
  if (!hasValidExpectedOutcome(pattern)) {
    addPatternIssue(issues, pattern, "expected_outcome_invalid");
  }
  if (
    pattern.segments.length === 0 ||
    pattern.segments.some(
      (segment) =>
        (segment.kind === "fixed" && segment.text.length === 0) ||
        (segment.kind === "placeholder" &&
          !PLACEHOLDER_ROLES.has(segment.semanticRole))
    )
  ) {
    addPatternIssue(issues, pattern, "segments_invalid");
  }
  if (
    !pattern.segments.some(
      (segment) => segment.kind === "fixed" && segment.text.trim().length > 0
    )
  ) {
    addPatternIssue(issues, pattern, "fixed_structure_missing");
  }
  if (!hasPassedValidation(pattern)) {
    addPatternIssue(issues, pattern, "validation_incomplete");
  }
  if (
    !SHA_256_HEX.test(pattern.integrityDigest) ||
    pattern.integrityDigest !== createTrustedSmsPatternIntegrityDigest(pattern)
  ) {
    addPatternIssue(issues, pattern, "pattern_integrity_invalid");
  }
}

export function validateTrustedSmsCatalog(
  catalog: TrustedSmsCatalog
): TrustedSmsCatalogValidationResult {
  const issues: TrustedSmsCatalogValidationIssue[] = [];
  if (catalog.schemaVersion !== TRUSTED_SMS_CATALOG_SCHEMA_VERSION) {
    issues.push({ code: "catalog_schema_version_invalid" });
  }
  if (!Number.isInteger(catalog.catalogVersion) || catalog.catalogVersion < 1) {
    issues.push({ code: "catalog_version_invalid" });
  }
  const identities = new Set<string>();
  const patternIds = new Set<string>();
  for (const pattern of catalog.patterns) {
    const identity = `${pattern.patternId}@${pattern.patternVersion}`;
    if (identities.has(identity)) {
      addPatternIssue(issues, pattern, "duplicate_pattern_identity");
    }
    identities.add(identity);
    if (patternIds.has(pattern.patternId)) {
      addPatternIssue(issues, pattern, "duplicate_pattern_id");
    }
    patternIds.add(pattern.patternId);
    validatePattern(pattern, catalog.catalogVersion, issues);
  }
  if (
    !SHA_256_HEX.test(catalog.integrityDigest) ||
    catalog.integrityDigest !== createTrustedSmsCatalogIntegrityDigest(catalog)
  ) {
    issues.push({ code: "catalog_integrity_invalid" });
  }
  return { isValid: issues.length === 0, issues };
}

export function activateTrustedSmsCatalog(
  catalog: TrustedSmsCatalog
): TrustedSmsCatalogActivation {
  const validation = validateTrustedSmsCatalog(catalog);
  if (!validation.isValid) {
    return {
      status: validation.issues.some(
        ({ code }) => code === "catalog_schema_version_invalid"
      )
        ? "incompatible"
        : "invalid",
      catalogVersion: null,
      patterns: [],
      issues: validation.issues,
    };
  }
  return {
    status: "active",
    catalogVersion: catalog.catalogVersion,
    patterns: catalog.patterns.filter(({ enabled }) => enabled),
    issues: [],
  };
}
