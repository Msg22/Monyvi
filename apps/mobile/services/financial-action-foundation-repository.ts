import {
  database as productionDatabase,
  type FinancialActionGroup,
} from "@monyvi/db";
import {
  FINANCIAL_ACTION_STATES,
  assertFinancialActionStateEvidence,
  assertFinancialActionTransition,
  canonicalizeFinancialActionEnvelope,
  hashFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
  type FinancialActionState,
  type Sha256Provider,
} from "../../../packages/logic/src/financial-actions";
import { Q, type Collection, type Database } from "@nozbe/watermelondb";

import {
  assertExpectedCurrentUser as assertProductionCurrentUser,
  getCurrentUserDataScope as getProductionCurrentUserDataScope,
  type CurrentUserDataScope,
} from "./user-data-access";

export const FINANCIAL_ACTION_FOUNDATION_ERROR_CODES = {
  AUTH_SCOPE_CHANGED: "financial_action_auth_scope_changed",
  ACTION_ID_PAYLOAD_MISMATCH: "action_id_payload_mismatch",
  NOT_FOUND: "financial_action_not_found",
  INVALID_INPUT: "financial_action_invalid_input",
} as const;

export interface CreateFinancialActionGroupInput {
  readonly envelope: FinancialActionEnvelopeV1;
  readonly hashProvider: Sha256Provider;
}

export type CreateFinancialActionGroupResult =
  | { readonly kind: "created"; readonly record: FinancialActionGroup }
  | { readonly kind: "replay"; readonly record: FinancialActionGroup };

export type FinancialActionUserDataScope = Pick<
  CurrentUserDataScope,
  "userId" | "queryOwned" | "assertOwned"
>;

export interface FinancialActionFoundationRepositoryDependencies {
  readonly database: Database;
  readonly getCurrentUserDataScope: () => Promise<FinancialActionUserDataScope>;
  readonly assertExpectedCurrentUser: (expectedUserId: string) => Promise<void>;
}

export interface FinancialActionFoundationRepository {
  readonly createFinancialActionGroup: (
    input: CreateFinancialActionGroupInput
  ) => Promise<CreateFinancialActionGroupResult>;
  readonly getFinancialActionGroup: (
    actionId: string
  ) => Promise<FinancialActionGroup | null>;
  readonly markFinancialActionGroupSyncFailed: (
    actionId: string,
    rejectionCode: string
  ) => Promise<void>;
  readonly retryFinancialActionGroup: (actionId: string) => Promise<void>;
}

const TABLE_NAME = "financial_action_groups";

function asFinancialActionState(value: string): FinancialActionState {
  if (!FINANCIAL_ACTION_STATES.includes(value as FinancialActionState)) {
    throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
  }
  return value as FinancialActionState;
}

export function createFinancialActionFoundationRepository(
  dependencies: FinancialActionFoundationRepositoryDependencies
): FinancialActionFoundationRepository {
  function collection(): Collection<FinancialActionGroup> {
    return dependencies.database.get<FinancialActionGroup>(TABLE_NAME);
  }

  async function findOwnedByActionId(
    scope: FinancialActionUserDataScope,
    actionId: string
  ): Promise<FinancialActionGroup | null> {
    const records = await scope
      .queryOwned(collection(), Q.where("action_id", actionId))
      .fetch();
    return records.find((record) => record.actionId === actionId) ?? null;
  }

  function assertInputUser(scope: FinancialActionUserDataScope, userId: string): void {
    if (scope.userId !== userId) {
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.AUTH_SCOPE_CHANGED);
    }
  }

  async function reassertExpectedCurrentUser(expectedUserId: string): Promise<void> {
    try {
      await dependencies.assertExpectedCurrentUser(expectedUserId);
    } catch {
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.AUTH_SCOPE_CHANGED);
    }
  }

  async function createFinancialActionGroup(
    input: CreateFinancialActionGroupInput
  ): Promise<CreateFinancialActionGroupResult> {
    const envelope = canonicalizeFinancialActionEnvelope(input.envelope);
    const scope = await dependencies.getCurrentUserDataScope();
    assertInputUser(scope, envelope.userId);
    const preparedPayload = await hashFinancialActionEnvelope(
      envelope,
      input.hashProvider
    );

    return dependencies.database.write(
      async (): Promise<CreateFinancialActionGroupResult> => {
        await reassertExpectedCurrentUser(scope.userId);
        const existing = await findOwnedByActionId(scope, envelope.actionId);
        await reassertExpectedCurrentUser(scope.userId);
        if (existing) {
          if (
            existing.payloadJson !== preparedPayload.canonicalText ||
            existing.payloadHash !== preparedPayload.payloadHash
          ) {
            throw new Error(
              FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.ACTION_ID_PAYLOAD_MISMATCH
            );
          }
          return { kind: "replay", record: existing };
        }

        const now = new Date();
        const record = collection().prepareCreate((candidate) => {
          candidate.actionId = envelope.actionId;
          candidate.userId = scope.userId;
          candidate.domain = envelope.domain;
          candidate.kind = envelope.kind;
          candidate.domainReferenceId = envelope.domainReferenceId;
          candidate.payloadJson = preparedPayload.canonicalText;
          candidate.payloadHash = preparedPayload.payloadHash;
          candidate.expectedAccountRevision = null;
          candidate.state = "pending_local";
          candidate.serverOutcome = null;
          candidate.outcomeJson = null;
          candidate.rejectionCode = null;
          candidate.deleted = false;
          candidate.updatedAt = now;
        });
        await dependencies.database.batch(record);
        await reassertExpectedCurrentUser(scope.userId);
        return { kind: "created", record };
      }
    );
  }

  async function getFinancialActionGroup(
    actionId: string
  ): Promise<FinancialActionGroup | null> {
    const scope = await dependencies.getCurrentUserDataScope();
    const record = await findOwnedByActionId(scope, actionId);
    await reassertExpectedCurrentUser(scope.userId);
    return record ? scope.assertOwned(record) : null;
  }

  async function updateFinancialActionGroup(
    actionId: string,
    update: (record: FinancialActionGroup) => void
  ): Promise<void> {
    const scope = await dependencies.getCurrentUserDataScope();
    await dependencies.database.write(async (): Promise<void> => {
      await reassertExpectedCurrentUser(scope.userId);
      const foundRecord = await findOwnedByActionId(scope, actionId);
      await reassertExpectedCurrentUser(scope.userId);
      if (!foundRecord) {
        throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.NOT_FOUND);
      }
      const record = scope.assertOwned(foundRecord);
      const operation = record.prepareUpdate((candidate) => {
        update(candidate);
        candidate.updatedAt = new Date();
      });
      await dependencies.database.batch(operation);
    });
  }

  async function markFinancialActionGroupSyncFailed(
    actionId: string,
    rejectionCode: string
  ): Promise<void> {
    if (rejectionCode.trim().length === 0) {
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
    }
    await updateFinancialActionGroup(actionId, (record) => {
      assertFinancialActionTransition(
        asFinancialActionState(record.state),
        "sync_failed"
      );
      assertFinancialActionStateEvidence("sync_failed", {
        serverOutcome: null,
        outcomeJson: null,
        rejectionCode,
      });
      record.state = "sync_failed";
      record.serverOutcome = null;
      record.outcomeJson = null;
      record.rejectionCode = rejectionCode;
    });
  }

  async function retryFinancialActionGroup(actionId: string): Promise<void> {
    await updateFinancialActionGroup(actionId, (record) => {
      assertFinancialActionTransition(
        asFinancialActionState(record.state),
        "sync_pending"
      );
      assertFinancialActionStateEvidence("sync_pending", {
        serverOutcome: null,
        outcomeJson: null,
        rejectionCode: null,
      });
      record.state = "sync_pending";
      record.serverOutcome = null;
      record.outcomeJson = null;
      record.rejectionCode = null;
    });
  }

  return Object.freeze({
    createFinancialActionGroup,
    getFinancialActionGroup,
    markFinancialActionGroupSyncFailed,
    retryFinancialActionGroup,
  });
}

const productionRepository = createFinancialActionFoundationRepository({
  database: productionDatabase,
  getCurrentUserDataScope: getProductionCurrentUserDataScope,
  assertExpectedCurrentUser: assertProductionCurrentUser,
});

export const createFinancialActionGroup =
  productionRepository.createFinancialActionGroup;
export const getFinancialActionGroup = productionRepository.getFinancialActionGroup;
export const markFinancialActionGroupSyncFailed =
  productionRepository.markFinancialActionGroupSyncFailed;
export const retryFinancialActionGroup =
  productionRepository.retryFinancialActionGroup;
