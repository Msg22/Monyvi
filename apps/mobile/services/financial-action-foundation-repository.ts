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
  type FinancialActionHashResult,
  type FinancialActionState,
  type Sha256Provider,
} from "../../../packages/logic/src/financial-actions";
import {
  Q,
  type Collection,
  type Database,
  type Model,
} from "@nozbe/watermelondb";

import {
  assertExpectedCurrentUser as assertProductionCurrentUser,
  getCurrentUserDataScope as getProductionCurrentUserDataScope,
  type CurrentUserDataScope,
} from "./user-data-access";
import {
  captureCachedModelSnapshot,
  restoreCachedModelSnapshot,
} from "./watermelon-cache-snapshot";

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

export interface FinancialActionLinkedOperationPlan {
  readonly cachedModels: readonly Model[];
  readonly prepareOperations: () => readonly Model[];
  readonly assertCachedOwnership: (
    input: FinancialActionLinkedOperationCachedOwnershipInput
  ) => Promise<void>;
  readonly assertPreparedOwnership: (
    input: FinancialActionLinkedOperationPreparedOwnershipInput
  ) => Promise<void>;
}

export interface FinancialActionLinkedOperationCachedOwnershipInput {
  readonly userId: string;
  readonly cachedModels: readonly Model[];
}

export interface FinancialActionLinkedOperationPreparedOwnershipInput {
  readonly userId: string;
  readonly cachedModels: readonly Model[];
  readonly preparedOperations: readonly Model[];
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

interface PreparedFinancialActionContext {
  readonly envelope: FinancialActionEnvelopeV1;
  readonly payload: FinancialActionHashResult;
  readonly scope: FinancialActionUserDataScope;
}

interface PreparedLocalRoot {
  readonly operation: Model;
  readonly record: FinancialActionGroup;
}

export interface FinancialActionFoundationRepositoryDependencies {
  readonly database: Database;
  readonly getCurrentUserDataScope: () => Promise<FinancialActionUserDataScope>;
  readonly assertExpectedCurrentUser: (expectedUserId: string) => Promise<void>;
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

  function assertInputUser(
    scope: FinancialActionUserDataScope,
    userId: string
  ): void {
    if (scope.userId !== userId) {
      throw new Error(
        FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.AUTH_SCOPE_CHANGED
      );
    }
  }

  async function reassertExpectedCurrentUser(
    expectedUserId: string
  ): Promise<void> {
    try {
      await dependencies.assertExpectedCurrentUser(expectedUserId);
    } catch {
      throw new Error(
        FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.AUTH_SCOPE_CHANGED
      );
    }
  }

  async function prepareActionContext(
    input: CreateFinancialActionGroupInput
  ): Promise<PreparedFinancialActionContext> {
    const envelope = canonicalizeFinancialActionEnvelope(input.envelope);
    const scope = await dependencies.getCurrentUserDataScope();
    assertInputUser(scope, envelope.userId);
    const payload = await hashFinancialActionEnvelope(
      envelope,
      input.hashProvider
    );
    return { envelope, payload, scope };
  }

  function assertMatchingPayload(
    record: FinancialActionGroup,
    payload: FinancialActionHashResult
  ): void {
    if (
      record.payloadJson !== payload.canonicalText ||
      record.payloadHash !== payload.payloadHash
    ) {
      throw new Error(
        FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.ACTION_ID_PAYLOAD_MISMATCH
      );
    }
  }

  function prepareNewRoot(
    context: PreparedFinancialActionContext,
    state: FinancialActionState,
    now: Date
  ): FinancialActionGroup {
    return collection().prepareCreate((candidate) => {
      candidate.actionId = context.envelope.actionId;
      candidate.userId = context.scope.userId;
      candidate.domain = context.envelope.domain;
      candidate.kind = context.envelope.kind;
      candidate.domainReferenceId = context.envelope.domainReferenceId;
      candidate.payloadJson = context.payload.canonicalText;
      candidate.payloadHash = context.payload.payloadHash;
      candidate.accountGuardsJson = "[]";
      candidate.state = state;
      candidate.serverOutcome = null;
      candidate.outcomeJson = null;
      candidate.rejectionCode = null;
      candidate.deleted = false;
      candidate.updatedAt = now;
    });
  }

  function assertNoRootTargets(models: readonly Model[]): void {
    if (models.some((model) => model.table === TABLE_NAME)) {
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
    }
  }

  function prepareLocalRoot(
    context: PreparedFinancialActionContext,
    foundRecord: FinancialActionGroup | null
  ): PreparedLocalRoot {
    const now = new Date();
    const record =
      foundRecord ?? prepareNewRoot(context, "local_complete", now);
    const operation = foundRecord
      ? record.prepareUpdate((candidate) => {
          candidate.state = "local_complete";
          candidate.updatedAt = now;
        })
      : record;
    return { operation, record };
  }

  async function createFinancialActionGroup(
    input: CreateFinancialActionGroupInput
  ): Promise<CreateFinancialActionGroupResult> {
    const context = await prepareActionContext(input);

    return dependencies.database.write(
      async (): Promise<CreateFinancialActionGroupResult> => {
        await reassertExpectedCurrentUser(context.scope.userId);
        const existing = await findOwnedByActionId(
          context.scope,
          context.envelope.actionId
        );
        await reassertExpectedCurrentUser(context.scope.userId);
        if (existing) {
          assertMatchingPayload(existing, context.payload);
          return { kind: "replay", record: existing };
        }

        const record = prepareNewRoot(context, "pending_local", new Date());
        await dependencies.database.batch(record);
        await reassertExpectedCurrentUser(context.scope.userId);
        return { kind: "created", record };
      }
    );
  }

  async function commitLinkedPlan(
    context: PreparedFinancialActionContext,
    foundRecord: FinancialActionGroup | null,
    plan: FinancialActionLinkedOperationPlan
  ): Promise<CommitFinancialActionGroupLocallyResult> {
    if (
      typeof plan.assertCachedOwnership !== "function" ||
      typeof plan.assertPreparedOwnership !== "function"
    ) {
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
    }
    assertNoRootTargets(plan.cachedModels);
    const snapshotModels = foundRecord
      ? [foundRecord, ...plan.cachedModels]
      : [...plan.cachedModels];
    const snapshots = [...new Set(snapshotModels)].map((model) =>
      captureCachedModelSnapshot(model)
    );
    let hasCommitted = false;
    try {
      await plan.assertCachedOwnership({
        userId: context.scope.userId,
        cachedModels: plan.cachedModels,
      });
      await reassertExpectedCurrentUser(context.scope.userId);
      const linkedOperations = plan.prepareOperations();
      if (linkedOperations.length === 0) {
        throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
      }
      assertNoRootTargets(linkedOperations);
      await plan.assertPreparedOwnership({
        userId: context.scope.userId,
        cachedModels: plan.cachedModels,
        preparedOperations: linkedOperations,
      });
      await reassertExpectedCurrentUser(context.scope.userId);
      assertFinancialActionTransition("pending_local", "local_complete");
      const root = prepareLocalRoot(context, foundRecord);
      await reassertExpectedCurrentUser(context.scope.userId);
      await dependencies.database.batch(root.operation, ...linkedOperations);
      hasCommitted = true;
      await reassertExpectedCurrentUser(context.scope.userId);
      return { kind: "committed", record: root.record };
    } catch (error) {
      if (!hasCommitted) snapshots.forEach(restoreCachedModelSnapshot);
      throw error;
    }
  }

  async function commitFinancialActionGroupLocally(
    input: CommitFinancialActionGroupLocallyInput
  ): Promise<CommitFinancialActionGroupLocallyResult> {
    const context = await prepareActionContext(input);

    return dependencies.database.write(
      async (): Promise<CommitFinancialActionGroupLocallyResult> => {
        await reassertExpectedCurrentUser(context.scope.userId);
        const foundRecord = await findOwnedByActionId(
          context.scope,
          context.envelope.actionId
        );
        await reassertExpectedCurrentUser(context.scope.userId);
        if (foundRecord) assertMatchingPayload(foundRecord, context.payload);
        if (
          foundRecord &&
          asFinancialActionState(foundRecord.state) !== "pending_local"
        ) {
          return {
            kind: "replay",
            record: context.scope.assertOwned(foundRecord),
          };
        }

        const plan = await input.prepareLinkedOperationPlan();
        await reassertExpectedCurrentUser(context.scope.userId);
        return commitLinkedPlan(context, foundRecord, plan);
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
      await reassertExpectedCurrentUser(scope.userId);
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
    commitFinancialActionGroupLocally,
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
export const commitFinancialActionGroupLocally =
  productionRepository.commitFinancialActionGroupLocally;
export const getFinancialActionGroup =
  productionRepository.getFinancialActionGroup;
export const markFinancialActionGroupSyncFailed =
  productionRepository.markFinancialActionGroupSyncFailed;
export const retryFinancialActionGroup =
  productionRepository.retryFinancialActionGroup;
