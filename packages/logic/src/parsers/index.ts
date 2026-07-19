/**
 * Parsers Barrel Exports
 *
 * Re-exports all SMS parser modules for clean imports from
 * `@monyvi/logic` or `packages/logic/src/parsers`.
 *
 * @module parsers/index
 */

export {
  computeSmsFingerprint,
  normalizeSmsBody,
  type SmsFingerprintInput,
} from "./sms-hash";
export {
  isExcludedBeforeSmsParsing,
  isLikelyFinancialSms,
} from "./sms-keyword-filter";
export { isLikelyCorruptedSmsText } from "./sms-text-quality";
export { getParsedSmsTransactionKey } from "./parsed-sms-transaction-key";
export { parseSmsWithLocalParser } from "./local-sms-parser";
export { parseSmsWithTrustedCatalog } from "./trusted-sms-parser";
export { matchTrustedSmsTemplate } from "./trusted-sms-template-matcher";
export {
  activateTrustedSmsCatalog,
  createBundledTrustedSmsCatalogProvider,
} from "./trusted-sms-catalog-activation";
export { QNB_EGYPT_TRUSTED_SMS_CATALOG } from "./trusted-sms-patterns";
export type {
  TrustedSmsCatalogActivation,
  TrustedSmsCatalogProvider,
  TrustedSmsEligibleFamily,
  TrustedSmsParsedTransaction,
  TrustedSmsParserCandidate,
  TrustedSmsParserOutcome,
  TrustedSmsParserRequest,
  TrustedSmsParserResult,
  TrustedSmsTemplateResult,
} from "./trusted-sms-pattern-types";
export {
  LOCAL_SMS_PATTERNS,
  LOCAL_SMS_VERY_HIGH_CONFIDENCE,
  validateLocalSmsPatternCatalog,
  type LocalSmsCatalogValidationResult,
} from "./local-sms-pattern-catalog";
export {
  LOCAL_SMS_FIXTURE_CORPUS,
  LOCAL_SMS_FIXTURE_CORPUS_MINIMUM_SIZE,
} from "./local-sms-fixture-corpus";
export type {
  LocalSmsFixture,
  LocalSmsFixtureExpectedOutcome,
  LocalSmsFixtureScenario,
  LocalParsedSmsTransaction,
  LocalReviewReason,
  LocalReviewStatus,
  LocalSmsCandidate,
  LocalSmsExpectedOutcome,
  LocalSmsMatchInput,
  LocalSmsMatchRules,
  LocalSmsParserError,
  LocalSmsParserErrorKind,
  LocalSmsParserRequest,
  LocalSmsParserResult,
  LocalSmsPattern,
  LocalSmsPatternMatch,
  PatternAutoSelectPolicy,
  PatternPromotionEligibility,
  PatternRuntimeScope,
  PatternSourceConfidence,
  PatternSourceType,
} from "./local-sms-parser-types";
export { evaluateAmountExpression } from "./expression-evaluator";
export {
  SMS_ENRICHMENT_CATEGORY_SYSTEM_NAMES,
  isSmsEnrichmentCategorySystemName,
} from "./sms-category-taxonomy";
export {
  EGYPTIAN_FINANCIAL_INSTITUTIONS,
  getAllFinancialSenders,
  getInstitutionById,
  getSelectableEgyptianInstitutions,
  getSenderPatternsForInstitution,
  isKnownFinancialSender,
} from "./egyptian-bank-registry";
export * from "./qa-sms-pattern-intake";
export type {
  BankInfo,
  EgyptianFinancialInstitution,
  EgyptianInstitutionAuditStatus,
  EgyptianInstitutionId,
  EgyptianInstitutionType,
  SelectableEgyptianInstitutionId,
} from "./egyptian-bank-registry";
