import type { FinancialActionGroup } from "@monyvi/db";
import type { Database, Model } from "@nozbe/watermelondb";

import type {
  FinancialActionEnvelopeV1,
  FinancialActionRegistry,
  FinancialActionValidationInput,
  Sha256Provider,
} from "../../../packages/logic/src/financial-actions";
import type { CurrentUserDataScope } from "./user-data-access";

export const FINANCIAL_ACTION_FOUNDATION_ERROR_CODES = {
  AUTH_SCOPE_CHANGED: "financial_action_auth_scope_changed",
  ACTION_ID_PAYLOAD_MISMATCH: "action_id_payload_mismatch",
  NOT_FOUND: "financial_action_not_found",
  INVALID_INPUT: "financial_action_invalid_input",
} as const;

export interface CreateFinancialActionGroupInput {
  readonly envelope: FinancialActionEnvelopeV1;
  readonly hashProvider: Sha256Provider;
  readonly validationInput?: FinancialActionValidationInput;
}

export type CreateFinancialActionGroupResult =
  | { readonly kind: "created"; readonly record: FinancialActionGroup }
  | { readonly kind: "replay"; readonly record: FinancialActionGroup };

export interface FinancialActionLinkedOperationPlan {
  readonly preparedCreates: readonly Model[];
  readonly existingOperations: readonly FinancialActionLinkedExistingOperation[];
  readonly assertCachedOwnership: (
    input: FinancialActionLinkedOperationCachedOwnershipInput
  ) => Promise<void>;
  readonly assertPreparedOwnership: (
    input: FinancialActionLinkedOperationPreparedOwnershipInput
  ) => Promise<void>;
}

export type FinancialActionLinkedExistingOperation =
  | {
      readonly kind: "update";
      readonly model: Model;
      readonly update: (model: Model) => void;
    }
  | {
      readonly kind: "markAsDeleted";
      readonly model: Model;
    };

export interface FinancialActionLinkedOperationPreimage {
  readonly id: string;
  readonly kind: FinancialActionLinkedExistingOperation["kind"];
  readonly table: string;
  readonly raw: Readonly<Model["_raw"]>;
}

export interface FinancialActionLinkedOperationPostimage {
  readonly id: string;
  readonly kind: "create" | FinancialActionLinkedExistingOperation["kind"];
  readonly table: string;
  readonly raw: Readonly<Model["_raw"]>;
}

export interface FinancialActionLinkedOperationCachedOwnershipInput {
  readonly userId: string;
  readonly cachedPreimages: readonly FinancialActionLinkedOperationPreimage[];
}

export interface FinancialActionLinkedOperationPreparedOwnershipInput {
  readonly userId: string;
  readonly cachedPreimages: readonly FinancialActionLinkedOperationPreimage[];
  readonly preparedPostimages: readonly FinancialActionLinkedOperationPostimage[];
}

export interface CommitFinancialActionGroupLocallyInput extends CreateFinancialActionGroupInput {
  readonly prepareLinkedOperationPlan: () => Promise<FinancialActionLinkedOperationPlan>;
}

export type CommitFinancialActionGroupLocallyResult =
  | { readonly kind: "committed"; readonly record: FinancialActionGroup }
  | { readonly kind: "replay"; readonly record: FinancialActionGroup };

export type FinancialActionUserDataScope = Pick<
  CurrentUserDataScope,
  "userId" | "queryOwned" | "assertOwned"
>;

export interface FinancialActionFoundationRepositoryDependencies {
  readonly database: Database;
  readonly getCurrentUserDataScope: () => Promise<FinancialActionUserDataScope>;
  readonly assertExpectedCurrentUser: (expectedUserId: string) => Promise<void>;
  readonly registry: FinancialActionRegistry;
}

export interface FinancialActionFoundationRepository {
  readonly createFinancialActionGroup: (
    input: CreateFinancialActionGroupInput
  ) => Promise<CreateFinancialActionGroupResult>;
  readonly commitFinancialActionGroupLocally: (
    input: CommitFinancialActionGroupLocallyInput
  ) => Promise<CommitFinancialActionGroupLocallyResult>;
  readonly getFinancialActionGroup: (
    actionId: string
  ) => Promise<FinancialActionGroup | null>;
  readonly markFinancialActionGroupSyncFailed: (
    actionId: string,
    rejectionCode: string
  ) => Promise<void>;
  readonly markFinancialActionGroupSyncPending: (
    actionId: string
  ) => Promise<void>;
  readonly recordFinancialActionGroupServerOutcome: (
    actionId: string,
    serverOutcome: "accepted" | "idempotent" | "stale" | "rejected",
    outcomeJson: string,
    rejectionCode: string | null
  ) => Promise<void>;
  readonly retryFinancialActionGroup: (actionId: string) => Promise<void>;
}
