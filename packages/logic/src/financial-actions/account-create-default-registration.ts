/**
 * #395 T067/T068 opt-in Add default tuple, isolated from legacy registry.
 * All canonical Add/Review payloads are validated by their own closed schemas.
 */
import {
  ACTION_REGISTRY_ERROR_CODES,
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  createFinancialActionRegistry,
  type FinancialActionDefinition,
  type FinancialActionRegistry,
  type RegisteredActionPayload,
} from "./action-registry";
import { validateAccountCreateDefaultPayload } from "./account-create-default";
import { createReviewFinancialActionDefinitions } from "./review-batch-save";

export function createAccountCreateDefaultDefinitions(
  invalidPayloadCode: string
): readonly FinancialActionDefinition[] {
  const addDefinition: FinancialActionDefinition = Object.freeze({
    domain: "accounts",
    kind: "create_with_default",
    payloadVersion: "account.create-default/v1",
    validatePayload: (value: unknown): RegisteredActionPayload => {
      try {
        const payload = validateAccountCreateDefaultPayload(value);
        return { ...payload };
      } catch {
        throw new Error(invalidPayloadCode);
      }
    },
  });
  return Object.freeze([addDefinition]);
}

/**
 * Feature-scoped registry. Do not widen DEFAULT_FINANCIAL_ACTION_REGISTRY:
 * historical account actions and independent Review remain available.
 */
export function createAccountDefaultAndReviewRegistry(): FinancialActionRegistry {
  return createFinancialActionRegistry([
    ...DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions,
    ...createReviewFinancialActionDefinitions(
      ACTION_REGISTRY_ERROR_CODES.INVALID_PAYLOAD
    ),
    ...createAccountCreateDefaultDefinitions(
      ACTION_REGISTRY_ERROR_CODES.INVALID_PAYLOAD
    ),
  ]);
}
