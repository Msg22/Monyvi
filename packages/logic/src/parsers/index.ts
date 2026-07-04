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
export { isLikelyFinancialSms } from "./sms-keyword-filter";
export { evaluateAmountExpression } from "./expression-evaluator";
export {
  EGYPTIAN_FINANCIAL_INSTITUTIONS,
  getAllFinancialSenders,
  getInstitutionById,
  getSelectableEgyptianInstitutions,
  getSenderPatternsForInstitution,
  isKnownFinancialSender,
} from "./egyptian-bank-registry";
export type {
  BankInfo,
  EgyptianFinancialInstitution,
  EgyptianInstitutionAuditStatus,
  EgyptianInstitutionId,
  EgyptianInstitutionType,
  SelectableEgyptianInstitutionId,
} from "./egyptian-bank-registry";
