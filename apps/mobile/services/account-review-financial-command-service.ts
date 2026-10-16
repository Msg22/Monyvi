/** #395 T048: private, opt-in review-only command; no legacy registry widening. */
import type { Database } from "@nozbe/watermelondb";
import {
  ACTION_REGISTRY_ERROR_CODES,
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  canonicalizeFinancialActionEnvelope,
  createFinancialActionRegistry,
  type FinancialActionRegistry,
} from "@monyvi/logic";
import { createReviewFinancialActionDefinitions } from "../../../packages/logic/src/financial-actions/review-batch-save";
import type {
  AccountBalanceCommandService,
  ExecuteAccountBalanceCommandInput,
} from "./account-balance-command-service";
import { createFinancialActionFoundationRepository } from "./financial-action-foundation-repository";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";

export function createAccountReviewFinancialRegistry(): FinancialActionRegistry {
  return createFinancialActionRegistry([
    ...DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions,
    ...createReviewFinancialActionDefinitions(
      ACTION_REGISTRY_ERROR_CODES.INVALID_PAYLOAD
    ),
  ]);
}
export function createAccountReviewFinancialCommandService(
  database: Database
): Pick<AccountBalanceCommandService, "execute"> {
  const registry = createAccountReviewFinancialRegistry();
  const foundation = createFinancialActionFoundationRepository({
    database,
    getCurrentUserDataScope,
    assertExpectedCurrentUser,
    registry,
  });
  return {
    execute: async (input: ExecuteAccountBalanceCommandInput) => {
      const envelope = canonicalizeFinancialActionEnvelope(
        input.envelope,
        registry
      );
      if (
        envelope.domain !== "transactions" ||
        envelope.kind !== "review_batch_save" ||
        envelope.payloadVersion !== "review.batch-save/v1"
      ) {
        throw new Error("account_review_financial_wrong_tuple");
      }
      return foundation.commitFinancialActionGroupLocally({
        envelope,
        hashProvider: input.hashProvider,
        prepareLinkedOperationPlan: input.prepareDomainOperationPlan,
      });
    },
  };
}
