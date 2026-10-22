/* GENERATED from canonical T009 Zod. Do not edit. */

export {
  accountReviewRequestContextSchema,
  accountReviewEvidenceSpanSchema,
  accountReviewAccountEvidenceSchema,
  accountReviewCurrencyEvidenceSchema,
  accountReviewSuggestedAccountSchema,
  accountReviewVoiceResponseV2Schema,
  accountReviewSmsResponseV2Schema,
} from "./account-review-parser-contract.ts";

export {
  buildAccountReviewGeminiResponseSchema,
  buildAccountReviewDeepInfraResponseSchema,
} from "./account-review-provider-projections.ts";

export const ACCOUNT_REVIEW_EDGE_GENERATOR_VERSION = "account-review-edge/v1";

export const ACCOUNT_REVIEW_CANONICAL_SHA256 =
  "d7ec5849636988cb05fad970bf99afe5cc352602906a770dd28b4dc2ce1f66b4";

export const ACCOUNT_REVIEW_CANONICAL_SOURCE_PATHS = Object.freeze([
  "packages/logic/src/account-review/generated-vocabulary.ts",
  "packages/logic/src/account-review/parser-advisory-validation.ts",
  "packages/logic/src/account-review/parser-schemas.ts",
  "packages/logic/src/account-review/review-schemas.ts",
  "packages/logic/src/account-review/review-value-primitives.ts",
  "packages/logic/src/account-review/schema-primitives.ts",
  "packages/logic/src/account-review/schemas.ts",
  "packages/logic/src/financial-actions/account-balance-effects-registry.ts",
  "packages/logic/src/financial-actions/account-create-default-integrity.ts",
  "packages/logic/src/financial-actions/account-create-default-shapes.ts",
  "packages/logic/src/financial-actions/account-create-default.ts",
  "packages/logic/src/financial-actions/action-contracts.ts",
  "packages/logic/src/financial-actions/action-registry.ts",
  "packages/logic/src/financial-actions/canonical-unsigned-revision.ts",
  "packages/logic/src/financial-actions/metals-action-payload-registry.ts",
  "packages/logic/src/financial-actions/review-batch-save-effects.ts",
  "packages/logic/src/financial-actions/review-batch-save-envelope.ts",
  "packages/logic/src/financial-actions/review-batch-save-integrity.ts",
  "packages/logic/src/financial-actions/review-batch-save-shapes.ts",
  "packages/logic/src/financial-actions/review-batch-save.ts",
  "packages/logic/src/metals/currency-minor-units.ts",
  "packages/logic/src/metals/decimal.ts",
  "packages/logic/src/metals/rate-reference.ts",
  "packages/logic/src/utils/ai-parser-utils.ts",
  "packages/logic/src/utils/amount-helpers.ts",
  "packages/logic/src/utils/amount-limits.ts",
  "packages/logic/src/utils/currency-data.ts",
  "packages/logic/src/utils/currency.ts",
  "packages/logic/src/utils/market-rate.ts",
]);
