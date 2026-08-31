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
import {
  assertPendingFinancialActionRootUnchanged,
  assertPreparedFinancialActionRootUnchanged,
  capturePendingFinancialActionRoot,
  type PendingFinancialActionRootExpectation,
} from "./financial-action-root-integrity";
import {
  cloneWatermelonRaw,
  watermelonRawRecordsMatch,
} from "./watermelon-raw-integrity";

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

interface PreparedFinancialActionContext {
  readonly envelope: FinancialActionEnvelopeV1;
  readonly payload: FinancialActionHashResult;
  readonly scope: FinancialActionUserDataScope;
}

interface PreparedLocalRoot {
  readonly operation: Model;
  readonly record: FinancialActionGroup;
}

interface ExistingOperationExpectation {
  readonly model: Model;
  readonly table: string;
  readonly id: string;
  readonly kind: FinancialActionLinkedExistingOperation["kind"];
  readonly expectedPreparedState: "update" | "markAsDeleted";
}

interface PreparedOperationExpectation {
  readonly model: Model;
  readonly table: string;
  readonly id: string;
  readonly kind: FinancialActionLinkedOperationPostimage["kind"];
  readonly expectedPreparedState: "create" | "update" | "markAsDeleted";
  readonly raw: Readonly<Model["_raw"]>;
  readonly isEditing: boolean;
}

interface PreparedCreateSnapshot {
  readonly model: Model;
  readonly raw: Model["_raw"];
  readonly preparedState: Model["_preparedState"];
  readonly isEditing: boolean;
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

  function assertGenuinePreparedCreates(models: readonly Model[]): void {
    if (
      models.some(
        (model) => model._preparedState !== "create" || model._isEditing
      )
    ) {
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
    }
  }

  function modelIdentity(model: Model): string {
    return `${model.table}\u0000${model.id}`;
  }

  function assertUniqueModelIdentities(models: readonly Model[]): void {
    const identities = models.map(modelIdentity);
    if (new Set(identities).size !== identities.length) {
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
    }
  }

  function assertCleanExistingModels(models: readonly Model[]): void {
    if (
      models.some((model) => model._preparedState !== null || model._isEditing)
    ) {
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
    }
  }

  function assertDisjointModelIdentities(
    leftModels: readonly Model[],
    rightModels: readonly Model[]
  ): void {
    const leftIdentities = new Set(leftModels.map(modelIdentity));
    if (rightModels.some((model) => leftIdentities.has(modelIdentity(model)))) {
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
    }
  }

  function captureExistingOperations(
    operations: readonly FinancialActionLinkedExistingOperation[]
  ): readonly FinancialActionLinkedExistingOperation[] {
    return Object.freeze(
      operations.map((operation): FinancialActionLinkedExistingOperation =>
        operation.kind === "update"
          ? Object.freeze({
              kind: "update",
              model: operation.model,
              update: operation.update,
            })
          : Object.freeze({
              kind: "markAsDeleted",
              model: operation.model,
            })
      )
    );
  }

  function capturePreparedCreates(models: readonly Model[]): readonly Model[] {
    return Object.freeze([...models]);
  }

  function capturePreparedCreateSnapshots(
    models: readonly Model[]
  ): readonly PreparedCreateSnapshot[] {
    return models.map((model) => ({
      model,
      raw: cloneWatermelonRaw(model._raw),
      preparedState: model._preparedState,
      isEditing: model._isEditing,
    }));
  }

  function restorePreparedCreateSnapshot(
    snapshot: PreparedCreateSnapshot
  ): void {
    snapshot.model._raw = cloneWatermelonRaw(snapshot.raw);
    snapshot.model._preparedState = snapshot.preparedState;
    snapshot.model._isEditing = snapshot.isEditing;
  }

  function captureExistingOperationExpectations(
    operations: readonly FinancialActionLinkedExistingOperation[]
  ): readonly ExistingOperationExpectation[] {
    return Object.freeze(
      operations.map((operation) =>
        Object.freeze({
          model: operation.model,
          table: operation.model.table,
          id: operation.model.id,
          kind: operation.kind,
          expectedPreparedState: operation.kind,
        })
      )
    );
  }

  function assertPreparedCreateIntegrity(
    models: readonly Model[],
    expectedIdentities: readonly string[]
  ): void {
    assertGenuinePreparedCreates(models);
    assertUniqueModelIdentities(models);
    if (
      models.length !== expectedIdentities.length ||
      models.some(
        (model, index) => modelIdentity(model) !== expectedIdentities[index]
      )
    ) {
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
    }
  }

  function assertCachedOperationsUnchanged(
    models: readonly Model[],
    snapshots: ReadonlyArray<ReturnType<typeof captureCachedModelSnapshot>>,
    expectations: readonly ExistingOperationExpectation[],
    preparedCreates: readonly Model[]
  ): void {
    if (
      models.length !== snapshots.length ||
      models.length !== expectations.length ||
      models.some((model, index) => {
        const snapshot = snapshots[index];
        const expectation = expectations[index];
        return (
          !snapshot ||
          !expectation ||
          model !== snapshot.model ||
          model !== expectation.model ||
          model.table !== expectation.table ||
          model.id !== expectation.id ||
          model._preparedState !== null ||
          model._isEditing ||
          !watermelonRawRecordsMatch(model._raw, snapshot.raw)
        );
      })
    ) {
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
    }
    assertNoRootTargets(models);
    assertUniqueModelIdentities(models);
    assertDisjointModelIdentities(models, preparedCreates);
  }

  function capturePreparedExpectations(
    preparedCreates: readonly Model[],
    preparedExistingOperations: readonly Model[],
    existingExpectations: readonly ExistingOperationExpectation[]
  ): readonly PreparedOperationExpectation[] {
    const createExpectations = preparedCreates.map((model) =>
      Object.freeze({
        model,
        table: model.table,
        id: model.id,
        kind: "create" as const,
        expectedPreparedState: "create" as const,
        raw: Object.freeze(cloneWatermelonRaw(model._raw)),
        isEditing: false,
      })
    );
    const updateExpectations = preparedExistingOperations.map((model, index) => {
      const existing = existingExpectations[index];
      if (!existing || model !== existing.model) {
        throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
      }
      return Object.freeze({
        model,
        table: existing.table,
        id: existing.id,
        kind: existing.kind,
        expectedPreparedState: existing.expectedPreparedState,
        raw: Object.freeze(cloneWatermelonRaw(model._raw)),
        isEditing: false,
      });
    });
    return Object.freeze([...createExpectations, ...updateExpectations]);
  }

  function assertPreparedOperationsMatch(
    operations: readonly Model[],
    expectations: readonly PreparedOperationExpectation[]
  ): void {
    if (
      operations.length !== expectations.length ||
      operations.some((model, index) => {
        const expected = expectations[index];
        return (
          !expected ||
          model !== expected.model ||
          model.table !== expected.table ||
          model.id !== expected.id ||
          model._preparedState !== expected.expectedPreparedState ||
          model._isEditing !== expected.isEditing ||
          !watermelonRawRecordsMatch(model._raw, expected.raw)
        );
      })
    ) {
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
    }
    assertNoRootTargets(operations);
    assertUniqueModelIdentities(operations);
  }

  function immutableRaw(raw: Readonly<Model["_raw"]>): Readonly<Model["_raw"]> {
    return Object.freeze(cloneWatermelonRaw(raw));
  }

  function createImmutablePreimages(
    snapshots: ReadonlyArray<ReturnType<typeof captureCachedModelSnapshot>>,
    expectations: readonly ExistingOperationExpectation[]
  ): readonly FinancialActionLinkedOperationPreimage[] {
    return Object.freeze(
      snapshots.map((snapshot, index) => {
        const expectation = expectations[index];
        if (!expectation) {
          throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
        }
        return Object.freeze({
          id: expectation.id,
          kind: expectation.kind,
          table: expectation.table,
          raw: immutableRaw(snapshot.raw),
        });
      })
    );
  }

  function createImmutablePostimages(
    expectations: readonly PreparedOperationExpectation[]
  ): readonly FinancialActionLinkedOperationPostimage[] {
    return Object.freeze(
      expectations.map((expectation) =>
        Object.freeze({
          id: expectation.id,
          kind: expectation.kind,
          table: expectation.table,
          raw: immutableRaw(expectation.raw),
        })
      )
    );
  }

  function prepareExistingOperation(
    operation: FinancialActionLinkedExistingOperation
  ): Model {
    if (operation.kind === "update") {
      return operation.model.prepareUpdate(operation.update);
    }
    if (operation.kind === "markAsDeleted") {
      return operation.model.prepareMarkAsDeleted();
    }
    throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
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
    pendingRootExpectation: PendingFinancialActionRootExpectation | null,
    plan: FinancialActionLinkedOperationPlan
  ): Promise<CommitFinancialActionGroupLocallyResult> {
    const assertCachedOwnership = plan.assertCachedOwnership;
    const assertPreparedOwnership = plan.assertPreparedOwnership;
    if (
      typeof assertCachedOwnership !== "function" ||
      typeof assertPreparedOwnership !== "function"
    ) {
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
    }
    const existingOperations = captureExistingOperations(
      plan.existingOperations
    );
    const existingExpectations = captureExistingOperationExpectations(
      existingOperations
    );
    const preparedCreates = capturePreparedCreates(plan.preparedCreates);
    const cachedModels = Object.freeze(
      existingOperations.map((operation) => operation.model)
    );
    const preparedCreateIdentities = Object.freeze(
      preparedCreates.map(modelIdentity)
    );
    assertNoRootTargets(cachedModels);
    assertNoRootTargets(preparedCreates);
    assertPreparedCreateIntegrity(preparedCreates, preparedCreateIdentities);
    assertCleanExistingModels(cachedModels);
    assertUniqueModelIdentities(cachedModels);
    assertDisjointModelIdentities(cachedModels, preparedCreates);
    const cachedSnapshots = cachedModels.map(captureCachedModelSnapshot);
    const cachedPreimages = createImmutablePreimages(
      cachedSnapshots,
      existingExpectations
    );
    const preparedCreateSnapshots = capturePreparedCreateSnapshots(preparedCreates);
    const initialPreparedCreateExpectations = capturePreparedExpectations(
      preparedCreates,
      [],
      []
    );
    let hasCommitted = false;
    try {
      await assertCachedOwnership(Object.freeze({
        userId: context.scope.userId,
        cachedPreimages,
      }));
      assertPendingFinancialActionRootUnchanged(
        foundRecord,
        pendingRootExpectation,
        FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT
      );
      await reassertExpectedCurrentUser(context.scope.userId);
      assertPendingFinancialActionRootUnchanged(
        foundRecord,
        pendingRootExpectation,
        FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT
      );
      assertCachedOperationsUnchanged(
        cachedModels,
        cachedSnapshots,
        existingExpectations,
        preparedCreates
      );
      assertPreparedCreateIntegrity(preparedCreates, preparedCreateIdentities);
      assertPreparedOperationsMatch(
        preparedCreates,
        initialPreparedCreateExpectations
      );
      const preparedExistingOperations: Model[] = [];
      const preparedExistingExpectations: PreparedOperationExpectation[] = [];
      for (const [index, operation] of existingOperations.entries()) {
        assertPreparedOperationsMatch(preparedExistingOperations, preparedExistingExpectations);
        assertCachedOperationsUnchanged(cachedModels.slice(index), cachedSnapshots.slice(index), existingExpectations.slice(index), preparedCreates);
        const preparedOperation = prepareExistingOperation(operation);
        preparedExistingOperations.push(preparedOperation);
        preparedExistingExpectations.push(...capturePreparedExpectations([], [preparedOperation], existingExpectations.slice(index, index + 1)));
        assertPreparedOperationsMatch(preparedExistingOperations, preparedExistingExpectations);
        assertCachedOperationsUnchanged(cachedModels.slice(index + 1), cachedSnapshots.slice(index + 1), existingExpectations.slice(index + 1), preparedCreates);
      }
      assertPreparedOperationsMatch(
        preparedCreates,
        initialPreparedCreateExpectations
      );
      const linkedOperations = Object.freeze([
        ...preparedCreates,
        ...preparedExistingOperations,
      ]);
      if (linkedOperations.length === 0) {
        throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
      }
      const preparedExpectations = Object.freeze([
        ...initialPreparedCreateExpectations,
        ...preparedExistingExpectations,
      ]);
      assertPreparedOperationsMatch(linkedOperations, preparedExpectations);
      const preparedPostimages = createImmutablePostimages(preparedExpectations);
      await assertPreparedOwnership(Object.freeze({
        userId: context.scope.userId,
        cachedPreimages,
        preparedPostimages,
      }));
      assertPendingFinancialActionRootUnchanged(
        foundRecord,
        pendingRootExpectation,
        FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT
      );
      await reassertExpectedCurrentUser(context.scope.userId);
      assertPendingFinancialActionRootUnchanged(
        foundRecord,
        pendingRootExpectation,
        FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT
      );
      assertPreparedOperationsMatch(linkedOperations, preparedExpectations);
      assertFinancialActionTransition("pending_local", "local_complete");
      assertPendingFinancialActionRootUnchanged(
        foundRecord,
        pendingRootExpectation,
        FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT
      );
      const root = prepareLocalRoot(context, foundRecord);
      const preparedRootSnapshot = foundRecord
        ? captureCachedModelSnapshot(foundRecord)
        : null;
      await reassertExpectedCurrentUser(context.scope.userId);
      if (foundRecord && pendingRootExpectation && preparedRootSnapshot) {
        assertPreparedFinancialActionRootUnchanged(
          foundRecord,
          pendingRootExpectation,
          preparedRootSnapshot,
          FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT
        );
      }
      assertPreparedOperationsMatch(linkedOperations, preparedExpectations);
      if (foundRecord && pendingRootExpectation && preparedRootSnapshot) {
        assertPreparedFinancialActionRootUnchanged(
          foundRecord,
          pendingRootExpectation,
          preparedRootSnapshot,
          FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT
        );
      }
      await dependencies.database.batch(root.operation, ...linkedOperations);
      hasCommitted = true;
      await reassertExpectedCurrentUser(context.scope.userId);
      return { kind: "committed", record: root.record };
    } catch (error) {
      if (!hasCommitted) {
        if (pendingRootExpectation) {
          restoreCachedModelSnapshot(pendingRootExpectation.snapshot);
        }
        cachedSnapshots.forEach(restoreCachedModelSnapshot);
        preparedCreateSnapshots.forEach(restorePreparedCreateSnapshot);
      }
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

        const pendingRootExpectation = foundRecord
          ? capturePendingFinancialActionRoot(
              foundRecord,
              FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT
            )
          : null;
        let plan: FinancialActionLinkedOperationPlan;
        try {
          plan = await input.prepareLinkedOperationPlan();
          assertPendingFinancialActionRootUnchanged(
            foundRecord,
            pendingRootExpectation,
            FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT
          );
          await reassertExpectedCurrentUser(context.scope.userId);
          assertPendingFinancialActionRootUnchanged(
            foundRecord,
            pendingRootExpectation,
            FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT
          );
        } catch (error) {
          if (pendingRootExpectation) {
            restoreCachedModelSnapshot(pendingRootExpectation.snapshot);
          }
          throw error;
        }
        return commitLinkedPlan(
          context,
          foundRecord,
          pendingRootExpectation,
          plan
        );
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
