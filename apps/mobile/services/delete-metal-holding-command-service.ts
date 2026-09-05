import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  Asset,
  AssetMetal,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
} from "@monyvi/db";
import type {
  FinancialActionEnvelopeV1,
  RegisteredActionPayload,
  Sha256Provider,
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
  readonly predecessorEventId: string;
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
  readonly predecessor: MetalLifecycleEvent;
  readonly timeline: readonly MetalLifecycleEvent[];
}

const EFFECTIVE_RECONCILIATION_STATES = new Set([
  "local_complete",
  "sync_pending",
  "sync_failed",
  "accepted",
  "reconciled",
]);

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
  const [metals, states, predecessor, timeline] = await Promise.all([
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
    findOwnedById(
      database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
      input.predecessorEventId,
      input.userId
    ),
    database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query(
        Q.where("holding_id", input.holdingId),
        Q.where("user_id", input.userId),
        Q.where("deleted", false)
      )
      .fetch(),
  ]);
  if (
    !metals[0] ||
    !states[0] ||
    predecessor.deleted ||
    predecessor.holdingId !== input.holdingId ||
    timeline.length === 0
  ) {
    throw new Error("metal_holding_not_found");
  }
  return {
    asset,
    metal: metals[0],
    state: states[0],
    predecessor,
    timeline,
  };
}

function assertEffectiveActiveProjection(
  input: DeleteMetalHoldingCommandInput,
  projection: DeleteProjection
): void {
  const { state, predecessor } = projection;
  if (
    state.status !== "active" ||
    !state.isVisible ||
    !EFFECTIVE_RECONCILIATION_STATES.has(state.reconciliationState) ||
    !predecessor.isEffective ||
    !predecessor.isHistoryVisible
  ) {
    throw new Error("metal_delete_effective_active_holding_required");
  }
  if (
    state.financialRevision !== input.expectedFinancialRevision ||
    state.effectiveEventId !== input.predecessorEventId
  ) {
    throw new Error("holding_revision_conflict");
  }
}

function assertOwnedRows(
  userId: string,
  rows: readonly (
    | FinancialActionLinkedOperationPreimage
    | FinancialActionLinkedOperationPostimage
  )[]
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
      record.kind = "deleted";
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
      return { kind: result.kind === "replay" ? "replay" : "committed" };
    },
  };
}
