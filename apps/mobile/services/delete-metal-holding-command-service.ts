import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  Asset,
  AssetMetal,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
  FinancialActionGroup,
} from "@monyvi/db";
import {
  reduceMetalLifecycle,
  type FinancialActionEnvelopeV1,
  type LifecycleEvent,
  type RegisteredActionPayload,
  type Sha256Provider,
} from "@monyvi/logic";

import type {
  CommitFinancialActionGroupLocallyInput,
  CommitFinancialActionGroupLocallyResult,
  FinancialActionLinkedOperationPlan,
  FinancialActionLinkedOperationPostimage,
  FinancialActionLinkedOperationPreimage,
} from "./financial-action-foundation-repository";
import { incrementCanonicalMetalRevision } from "./metal-financial-action-adapter";
import { findOwnedById, queryChildrenOfOwnedParent } from "./user-data-access";

export interface DeleteMetalHoldingCommandInput {
  readonly actionId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
  readonly predecessorEventId: string | null;
  readonly holdingId: string;
  readonly userId: string;
  readonly occurredAt: string;
  readonly cairoTodayDate: string;
  readonly expectedFinancialRevision: string;
}

type Commit = (
  input: CommitFinancialActionGroupLocallyInput
) => Promise<CommitFinancialActionGroupLocallyResult>;

export interface DeleteMetalHoldingCommandDependencies {
  readonly database: Database;
  readonly commitFinancialActionGroupLocally: Commit;
  readonly createEnvelope: (
    input: DeleteMetalHoldingCommandInput,
    payload: RegisteredActionPayload
  ) => FinancialActionEnvelopeV1;
  readonly hashProvider: Sha256Provider;
}

export interface DeleteMetalHoldingCommandService {
  readonly delete: (
    input: DeleteMetalHoldingCommandInput
  ) => Promise<{ readonly kind: "committed" | "replay" }>;
}

interface DeleteProjection {
  readonly asset: Asset;
  readonly metal: AssetMetal;
  readonly state: MetalHoldingState;
  readonly predecessor: MetalLifecycleEvent | null;
  readonly timeline: readonly MetalLifecycleEvent[];
  readonly actionGroups: readonly FinancialActionGroup[];
}

const EFFECTIVE_RECONCILIATION_STATES = new Set([
  "local_complete",
  "sync_pending",
  "sync_failed",
  "accepted",
  "reconciled",
]);

const SUCCESSFUL_REPLAY_STATES = new Set([
  "local_complete",
  "sync_pending",
  "sync_failed",
  "accepted",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertStableLocalIds(input: DeleteMetalHoldingCommandInput): void {
  const ids = [input.actionEvidenceId, input.lifecycleEventId];
  if (
    ids.some((id) => !UUID_PATTERN.test(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error("metal_delete_invalid_local_id");
  }
}

function setPreparedId(model: Model, id: string): void {
  model._raw.id = id;
}

function payloadFor(
  input: DeleteMetalHoldingCommandInput
): RegisteredActionPayload {
  return {
    holdingId: input.holdingId,
    expectedHoldingRevision: input.expectedFinancialRevision,
    predecessorEventId: input.predecessorEventId,
    reversesEventId: null,
  };
}

async function loadProjection(
  database: Database,
  input: DeleteMetalHoldingCommandInput
): Promise<DeleteProjection> {
  const asset = await findOwnedById(
    database.get<Asset>("assets"),
    input.holdingId,
    input.userId
  );
  if (asset.deleted) throw new Error("metal_holding_not_found");
  const predecessorPromise =
    input.predecessorEventId === null
      ? Promise.resolve(null)
      : findOwnedById(
          database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
          input.predecessorEventId,
          input.userId
        );
  const [metals, states, predecessor, timeline, actionGroups] =
    await Promise.all([
      queryChildrenOfOwnedParent(
        database.get<AssetMetal>("asset_metals"),
        asset,
        input.userId,
        "asset_id",
        Q.where("deleted", false),
        Q.take(1)
      ).fetch(),
      database
        .get<MetalHoldingState>("metal_holding_states")
        .query(
          Q.where("holding_id", input.holdingId),
          Q.where("user_id", input.userId),
          Q.where("deleted", false),
          Q.take(1)
        )
        .fetch(),
      predecessorPromise,
      database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query(
          Q.where("holding_id", input.holdingId),
          Q.where("user_id", input.userId),
          Q.where("deleted", false)
        )
        .fetch(),
      database
        .get<FinancialActionGroup>("financial_action_groups")
        .query(
          Q.where("domain_reference_id", input.holdingId),
          Q.where("user_id", input.userId),
          Q.where("deleted", false)
        )
        .fetch(),
    ]);
  if (
    !metals[0] ||
    !states[0] ||
    (predecessor !== null &&
      (predecessor.deleted || predecessor.holdingId !== input.holdingId))
  ) {
    throw new Error("metal_holding_not_found");
  }
  return {
    asset,
    metal: metals[0],
    state: states[0],
    predecessor,
    timeline,
    actionGroups,
  };
}

function assertEffectiveActiveProjection(
  input: DeleteMetalHoldingCommandInput,
  projection: DeleteProjection
): void {
  const { actionGroups, state, predecessor, timeline } = projection;
  if (
    state.status !== "active" ||
    !state.isVisible ||
    !EFFECTIVE_RECONCILIATION_STATES.has(state.reconciliationState)
  ) {
    throw new Error("metal_delete_effective_active_holding_required");
  }
  if (state.financialRevision !== input.expectedFinancialRevision) {
    throw new Error("holding_revision_conflict");
  }
  const isRevisionZeroLegacyProjection =
    input.expectedFinancialRevision === "0" &&
    input.predecessorEventId === null &&
    state.effectiveActionId === null &&
    state.effectiveEventId === null &&
    predecessor === null &&
    timeline.length === 0;
  if (isRevisionZeroLegacyProjection) return;
  if (
    predecessor === null ||
    !predecessor.isEffective ||
    !predecessor.isHistoryVisible ||
    state.effectiveEventId !== input.predecessorEventId
  ) {
    throw new Error("metal_delete_effective_active_holding_required");
  }

  const lifecycleEvents = timeline.map((event) =>
    toLifecycleEvent(event, actionGroups)
  );
  if (lifecycleEvents.some((event) => event === null)) {
    throw new Error("metal_delete_effective_active_holding_required");
  }
  const reduced = reduceMetalLifecycle(lifecycleEvents);
  if (
    reduced.projection?.status !== "active" ||
    !reduced.projection.isVisible ||
    reduced.projection.effectiveEventId !== input.predecessorEventId
  ) {
    throw new Error("metal_delete_effective_active_holding_required");
  }
}

function toLifecycleEvent(
  event: MetalLifecycleEvent,
  actionGroups: readonly FinancialActionGroup[]
): LifecycleEvent | null {
  const action = actionGroups.find(
    (candidate) => candidate.actionId === event.actionId
  );
  const kind = toLifecycleKind(event.kind);
  if (kind === null) return null;

  return {
    canonicalCasStatus: event.isEffective ? "accepted" : "unknown",
    evidenceState:
      action === undefined || isRejectedAction(action)
        ? "ineffective"
        : "effective",
    fingerprint: event.payloadJson,
    id: event.id,
    kind,
    occurredAt: event.occurredAt.getTime(),
    predecessorEventId: event.predecessorEventId,
    reversesEventId: event.reversesEventId,
  };
}

function toLifecycleKind(kind: string): LifecycleEvent["kind"] | null {
  const lifecycleKinds: Readonly<Record<string, LifecycleEvent["kind"]>> = {
    add: "created",
    created: "created",
    correct: "corrected",
    corrected: "corrected",
    delete: "deleted",
    deleted: "deleted",
    dispose: "disposed",
    disposed: "disposed",
    sell: "sold",
    sold: "sold",
    undo: "reversed",
    reversed: "reversed",
  };
  return lifecycleKinds[kind] ?? null;
}

function isRejectedAction(action: FinancialActionGroup): boolean {
  return (
    action.state === "rejected_compensating" ||
    action.state === "reconciliation_incomplete"
  );
}

function assertSuccessfulReplay(
  result: CommitFinancialActionGroupLocallyResult
): void {
  if (
    result.kind === "replay" &&
    !SUCCESSFUL_REPLAY_STATES.has(result.record.state)
  ) {
    throw new Error("metal_delete_replay_requires_recovery");
  }
}

function assertOwnedRows(
  userId: string,
  rows: ReadonlyArray<
    | FinancialActionLinkedOperationPreimage
    | FinancialActionLinkedOperationPostimage
  >
): Promise<void> {
  if (rows.some((row) => ownerIdFromRaw(row.raw) !== userId)) {
    return Promise.reject(new Error("ownership_failed"));
  }
  return Promise.resolve();
}

function ownerIdFromRaw(raw: Readonly<Model["_raw"]>): unknown {
  return (raw as unknown as Readonly<Record<string, unknown>>).user_id;
}

function prepareDeletePlan(
  database: Database,
  input: DeleteMetalHoldingCommandInput,
  envelope: FinancialActionEnvelopeV1,
  projection: DeleteProjection
): FinancialActionLinkedOperationPlan {
  assertEffectiveActiveProjection(input, projection);
  const occurredAt = new Date(input.occurredAt);
  const nextRevision = incrementCanonicalMetalRevision(
    input.expectedFinancialRevision
  );
  const payloadJson = JSON.stringify(envelope.payload);
  const evidence = database
    .get<MetalActionEvidence>("metal_action_evidence")
    .prepareCreate((record): void => {
      setPreparedId(record, input.actionEvidenceId);
      record.actionId = input.actionId;
      record.canonicalHoldingRevision = nextRevision;
      record.deleted = false;
      record.domainPayloadJson = payloadJson;
      record.expectedHoldingRevision = input.expectedFinancialRevision;
      record.holdingId = input.holdingId;
      record.kind = "delete";
      record.updatedAt = occurredAt;
      record.userId = input.userId;
    });
  const deleteEvent = database
    .get<MetalLifecycleEvent>("metal_lifecycle_events")
    .prepareCreate((record): void => {
      setPreparedId(record, input.lifecycleEventId);
      record.actionId = input.actionId;
      record.deleted = false;
      record.holdingId = input.holdingId;
      record.isEffective = false;
      record.isHistoryVisible = false;
      record.kind = "delete";
      record.occurredAt = occurredAt;
      record.payloadJson = payloadJson;
      record.predecessorEventId = input.predecessorEventId;
      record.reversesEventId = null;
      record.updatedAt = occurredAt;
      record.userId = input.userId;
    });
  return {
    preparedCreates: [evidence, deleteEvent],
    existingOperations: [
      {
        kind: "update",
        model: projection.state,
        update: (model): void => {
          const state = model as MetalHoldingState;
          state.effectiveActionId = input.actionId;
          state.effectiveEventId = input.lifecycleEventId;
          state.financialRevision = nextRevision;
          state.isVisible = false;
          state.reconciliationState = "sync_pending";
          state.updatedAt = occurredAt;
        },
      },
      ...projection.timeline.map((timelineEvent) => ({
        kind: "update" as const,
        model: timelineEvent,
        update: (model: Model): void => {
          const event = model as MetalLifecycleEvent;
          event.isEffective = false;
          event.isHistoryVisible = false;
          event.updatedAt = occurredAt;
        },
      })),
    ],
    assertCachedOwnership: ({ userId, cachedPreimages }) =>
      assertOwnedRows(userId, cachedPreimages),
    assertPreparedOwnership: ({ userId, preparedPostimages }) =>
      assertOwnedRows(userId, preparedPostimages),
  };
}

export function createDeleteMetalHoldingCommandService(
  dependencies: DeleteMetalHoldingCommandDependencies
): DeleteMetalHoldingCommandService {
  return {
    delete: async (
      input
    ): Promise<{ readonly kind: "committed" | "replay" }> => {
      assertStableLocalIds(input);
      const payload = payloadFor(input);
      const envelope = dependencies.createEnvelope(input, payload);
      const projection = await loadProjection(dependencies.database, input);
      const result = await dependencies.commitFinancialActionGroupLocally({
        envelope,
        hashProvider: dependencies.hashProvider,
        validationInput: { cairoTodayDate: input.cairoTodayDate },
        prepareLinkedOperationPlan: () =>
          Promise.resolve(
            prepareDeletePlan(
              dependencies.database,
              input,
              envelope,
              projection
            )
          ),
      });
      assertSuccessfulReplay(result);
      return { kind: result.kind === "replay" ? "replay" : "committed" };
    },
  };
}
