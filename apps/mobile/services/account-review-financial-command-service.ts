/** #395 T048: private, opt-in review-only command; no legacy registry widening. */
import type { Database } from "@nozbe/watermelondb";
import {
  canonicalizeFinancialActionEnvelope,
  type FinancialActionRegistry,
} from "@monyvi/logic";
import { createAccountDefaultAndReviewRegistry } from
  "../../../packages/logic/src/financial-actions/account-create-default-registration";
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
  return createAccountDefaultAndReviewRegistry();
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

/**
 * Dedicated Add feature route through the same approved prepared foundation.
 * Review remains explicitly review-only; DEFAULT registry stays legacy-only.
 */
export function createAccountDefaultFinancialCommandService(
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
        envelope.domain !== "accounts" ||
        envelope.kind !== "create_with_default" ||
        envelope.payloadVersion !== "account.create-default/v1"
      ) {
        throw new Error("account_default_financial_wrong_tuple");
      }
      return foundation.commitFinancialActionGroupLocally({
        envelope,
        hashProvider: input.hashProvider,
        prepareLinkedOperationPlan: input.prepareDomainOperationPlan,
      });
    },
  };
}
