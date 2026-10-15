/**
 * #395 T046: opt-in PURE complete selected-review financial action.
 *
 * Deliberately not added to DEFAULT_FINANCIAL_ACTION_REGISTRY. SQL/local writer,
 * stored ownership, financial revision and replay checks are later lanes.
 */
import type {
  FinancialActionDefinition, RegisteredActionPayload,
} from "./action-registry";
import {
  reviewBatchSaveWireSchema,
  type ReviewBatchSavePayload,
} from "./review-batch-save-shapes";
import {
  validateCreateCoverage, validateGroupAndBookkeeping,
  validateSelectedCoverage, validateSourceAndChildren,
} from "./review-batch-save-integrity";
import {
  validateAffectedAccountCoverage, validateCreatedAccountBalances,
  validateFinancialRowLimits, validatePostedEffects,
  validateTransferEndpoints,
} from "./review-batch-save-effects";

export type { ReviewBatchSavePayload } from "./review-batch-save-shapes";

/**
 * Every nested object is closed by the wire schema. These additional
 * pure checks compare all selected records, guards and exact effects.
 */
export const reviewBatchSavePayloadSchema = reviewBatchSaveWireSchema.superRefine(
  (payload, ctx) => {
    const checks: ReadonlyArray<(value: ReviewBatchSavePayload) => string | null> = [
      validateCreateCoverage,
      validateSelectedCoverage,
      validateSourceAndChildren,
      validateGroupAndBookkeeping,
      validateTransferEndpoints,
      validateFinancialRowLimits,
      validateAffectedAccountCoverage,
      validatePostedEffects,
      validateCreatedAccountBalances,
    ];
    for (const check of checks) {
      const reason = check(payload);
      if (reason !== null) ctx.addIssue({ code: "custom", message: reason });
    }
  }
);

export function validateReviewBatchSavePayload(
  value: unknown
): ReviewBatchSavePayload {
  return reviewBatchSavePayloadSchema.parse(value);
}

function toCanonicalRegistryPayload(
  payload: ReviewBatchSavePayload
): RegisteredActionPayload {
  const { cashDefaultSnapshot, ...required } = payload;
  return cashDefaultSnapshot === undefined
    ? required
    : { ...required, cashDefaultSnapshot };
}

/**
 * Explicit caller registry only; no action activation in the app or old v1.
 * The foundation's canonical envelope/guard selector is a separate Root gate.
 */
export function createReviewFinancialActionDefinitions(
  invalidPayloadCode: string
): readonly FinancialActionDefinition[] {
  const definition: FinancialActionDefinition = Object.freeze({
    domain: "transactions",
    kind: "review_batch_save",
    payloadVersion: "review.batch-save/v1",
    validatePayload: (value: unknown): RegisteredActionPayload => {
      try {
        return toCanonicalRegistryPayload(validateReviewBatchSavePayload(value));
      } catch {
        throw new Error(invalidPayloadCode);
      }
    },
  });
  return Object.freeze([definition]);
}
