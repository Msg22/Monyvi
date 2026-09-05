import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  Asset,
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
  FinancialActionUserDataScope,
} from "./financial-action-foundation-repository";
import { incrementCanonicalMetalRevision } from "./metal-financial-action-adapter";

export const DISPOSE_CATEGORIES = [
  "lost_or_stolen",
  "destroyed_or_damaged",
  "given_away",
  "donated",
  "other",
] as const;
export const DISPOSE_TREATMENTS = ["write_off", "external_transfer"] as const;
export const DISPOSE_REASONS = [
  "lost_or_stolen",
  "destroyed_or_damaged",
  "given_away",
  "donated",
  "other_write_off",
  "other_external_transfer",
] as const;

export type DisposeCategory = (typeof DISPOSE_CATEGORIES)[number];
export type DisposeTreatment = (typeof DISPOSE_TREATMENTS)[number];
export type DisposeReason = (typeof DISPOSE_REASONS)[number];

export interface DisposeMetalHoldingCommandInput {
  readonly actionId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
  readonly predecessorEventId: string;
  readonly holdingId: string;
  readonly userId: string;
  readonly occurredAt: string;
  readonly cairoTodayDate: string;
  readonly expectedFinancialRevision: string;
  readonly disposalDate: string;
  readonly category: DisposeCategory | null;
  readonly otherTreatment: DisposeTreatment | null;
  readonly notes: string | null;
}

type Commit = (
  input: CommitFinancialActionGroupLocallyInput
) => Promise<CommitFinancialActionGroupLocallyResult>;

export interface DisposeMetalHoldingCommandDependencies {
  readonly database: Database;
  readonly getCurrentUserDataScope: () => Promise<FinancialActionUserDataScope>;
  readonly commitFinancialActionGroupLocally: Commit;
  readonly createEnvelope: (
    input: DisposeMetalHoldingCommandInput,
    payload: RegisteredActionPayload
  ) => FinancialActionEnvelopeV1;
  readonly hashProvider: Sha256Provider;
}

export interface DisposeMetalHoldingCommandService {
  readonly dispose: (input: DisposeMetalHoldingCommandInput) => Promise<{
    readonly kind: "committed" | "replay";
    readonly holdingId: string;
  }>;
}

export interface DisposeMetalHoldingConsequences {
  readonly category: DisposeCategory;
  readonly treatment: DisposeTreatment;
  readonly removesActiveOwnership: true;
  readonly preservesHistory: true;
  readonly hasSaleMoney: false;
  readonly hasAccountEffect: false;
  readonly hasOrdinaryIncome: false;
  readonly hasRealizedSaleProfitLoss: false;
  readonly recordsCostBasisWriteOff: boolean;
  readonly recordsExternalTransfer: boolean;
}

interface Projection {
  readonly asset: Asset;
  readonly state: MetalHoldingState;
  readonly predecessor: MetalLifecycleEvent;
}

export function resolveDisposeReason(
  category: DisposeCategory | null,
  otherTreatment: DisposeTreatment | null
): DisposeReason {
  if (category === null) throw new Error("dispose_category_required");
  if (category === "other") {
    if (otherTreatment === null)
      throw new Error("dispose_other_treatment_required");
    return otherTreatment === "write_off"
      ? "other_write_off"
      : "other_external_transfer";
  }
  if (otherTreatment !== null)
    throw new Error("dispose_known_category_treatment_forbidden");
  return category;
}

export function shapeDisposeMetalHoldingConsequences(
  reason: DisposeReason
): DisposeMetalHoldingConsequences {
  const treatment: DisposeTreatment =
    reason === "lost_or_stolen" ||
    reason === "destroyed_or_damaged" ||
    reason === "other_write_off"
      ? "write_off"
      : "external_transfer";
  const category: DisposeCategory =
    reason === "other_write_off" || reason === "other_external_transfer"
      ? "other"
      : reason;
  return Object.freeze({
    category,
    treatment,
    removesActiveOwnership: true,
    preservesHistory: true,
    hasSaleMoney: false,
    hasAccountEffect: false,
    hasOrdinaryIncome: false,
    hasRealizedSaleProfitLoss: false,
    recordsCostBasisWriteOff: treatment === "write_off",
    recordsExternalTransfer: treatment === "external_transfer",
  });
}

function payloadFor(
  input: DisposeMetalHoldingCommandInput,
  reason: DisposeReason
): RegisteredActionPayload {
  return {
    holdingId: input.holdingId,
    expectedHoldingRevision: input.expectedFinancialRevision,
    predecessorEventId: input.predecessorEventId,
    reversesEventId: null,
    disposalDate: input.disposalDate,
    reason,
    notes: input.notes,
  } as unknown as RegisteredActionPayload;
}

async function loadProjection(
  dependencies: DisposeMetalHoldingCommandDependencies,
  input: DisposeMetalHoldingCommandInput
): Promise<Projection> {
  const scope = await dependencies.getCurrentUserDataScope();
  if (scope.userId !== input.userId)
    throw new Error("financial_action_auth_scope_changed");
  const [assets, states, predecessors] = await Promise.all([
    scope
      .queryOwned(
        dependencies.database.get<Asset>("assets"),
        Q.where("id", input.holdingId),
        Q.where("deleted", false),
        Q.take(1)
      )
      .fetch(),
    scope
      .queryOwned(
        dependencies.database.get<MetalHoldingState>("metal_holding_states"),
        Q.where("holding_id", input.holdingId),
        Q.where("deleted", false),
        Q.take(1)
      )
      .fetch(),
    scope
      .queryOwned(
        dependencies.database.get<MetalLifecycleEvent>(
          "metal_lifecycle_events"
        ),
        Q.where("id", input.predecessorEventId),
        Q.where("holding_id", input.holdingId),
        Q.where("deleted", false),
        Q.take(1)
      )
      .fetch(),
  ]);
  if (!assets[0] || !states[0] || !predecessors[0])
    throw new Error("metal_holding_not_found");
  return {
    asset: scope.assertOwned(assets[0]),
    state: scope.assertOwned(states[0]),
    predecessor: scope.assertOwned(predecessors[0]),
  };
}

function assertProjection(
  projection: Projection,
  input: DisposeMetalHoldingCommandInput
): void {
  if (projection.asset.type !== "METAL")
    throw new Error("metal_holding_not_found");
  if (projection.state.status !== "active")
    throw new Error("metal_holding_not_active");
  if (
    projection.state.financialRevision !== input.expectedFinancialRevision ||
    projection.state.effectiveEventId !== input.predecessorEventId ||
    !projection.predecessor.isEffective
  ) {
    throw new Error("holding_revision_conflict");
  }
}

function setPreparedId(model: Model, id: string): void {
  model._raw.id = id;
}

function assertOwnedRows(
  userId: string,
  holdingId: string,
  rows: readonly {
    readonly table: string;
    readonly raw: Readonly<Model["_raw"]>;
  }[]
): void {
  const allowedTables = new Set([
    "metal_action_evidence",
    "metal_holding_states",
    "metal_lifecycle_events",
  ]);
  for (const row of rows) {
    const raw = row.raw as unknown as Readonly<Record<string, unknown>>;
    if (
      !allowedTables.has(row.table) ||
      raw["user_id"] !== userId ||
      raw["holding_id"] !== holdingId
    ) {
      throw new Error("metal_dispose_ownership_failed");
    }
  }
}

function preparePlan(
  dependencies: DisposeMetalHoldingCommandDependencies,
  input: DisposeMetalHoldingCommandInput,
  envelope: FinancialActionEnvelopeV1,
  projection: Projection
): FinancialActionLinkedOperationPlan {
  assertProjection(projection, input);
  const occurredAt = new Date(input.occurredAt);
  const nextRevision = incrementCanonicalMetalRevision(
    input.expectedFinancialRevision
  );
  const payloadJson = JSON.stringify(envelope.payload);
  const evidence = dependencies.database
    .get<MetalActionEvidence>("metal_action_evidence")
    .prepareCreate((record): void => {
      setPreparedId(record, input.actionEvidenceId);
      record.actionId = input.actionId;
      record.canonicalHoldingRevision = nextRevision;
      record.deleted = false;
      record.domainPayloadJson = payloadJson;
      record.expectedHoldingRevision = input.expectedFinancialRevision;
      record.holdingId = input.holdingId;
      record.kind = "dispose";
      record.updatedAt = occurredAt;
      record.userId = input.userId;
    });
  const event = dependencies.database
    .get<MetalLifecycleEvent>("metal_lifecycle_events")
    .prepareCreate((record): void => {
      setPreparedId(record, input.lifecycleEventId);
      record.actionId = input.actionId;
      record.deleted = false;
      record.holdingId = input.holdingId;
      record.isEffective = true;
      record.isHistoryVisible = true;
      record.kind = "dispose";
      record.occurredAt = occurredAt;
      record.payloadJson = payloadJson;
      record.predecessorEventId = input.predecessorEventId;
      record.reversesEventId = null;
      record.updatedAt = occurredAt;
      record.userId = input.userId;
    });
  const plan: FinancialActionLinkedOperationPlan = {
    preparedCreates: [evidence, event],
    existingOperations: [
      {
        kind: "update",
        model: projection.state,
        update: (model): void => {
          const state = model as MetalHoldingState;
          state.effectiveActionId = input.actionId;
          state.effectiveEventId = input.lifecycleEventId;
          state.financialRevision = nextRevision;
          state.reconciliationState = "sync_pending";
          state.status = "disposed";
          state.updatedAt = occurredAt;
        },
      },
    ],
    assertCachedOwnership: ({ userId, cachedPreimages }): Promise<void> => {
      assertOwnedRows(userId, input.holdingId, cachedPreimages);
      return Promise.resolve();
    },
    assertPreparedOwnership: ({
      userId,
      preparedPostimages,
    }): Promise<void> => {
      assertOwnedRows(userId, input.holdingId, preparedPostimages);
      return Promise.resolve();
    },
  };
  return plan;
}

export function createDisposeMetalHoldingCommandService(
  dependencies: DisposeMetalHoldingCommandDependencies
): DisposeMetalHoldingCommandService {
  return Object.freeze({
    dispose: async (input: DisposeMetalHoldingCommandInput) => {
      const reason = resolveDisposeReason(input.category, input.otherTreatment);
      const envelope = dependencies.createEnvelope(
        input,
        payloadFor(input, reason)
      );
      const result = await dependencies.commitFinancialActionGroupLocally({
        envelope,
        hashProvider: dependencies.hashProvider,
        validationInput: { cairoTodayDate: input.cairoTodayDate },
        prepareLinkedOperationPlan: async () => {
          const projection = await loadProjection(dependencies, input);
          return preparePlan(dependencies, input, envelope, projection);
        },
      });
      return { kind: result.kind, holdingId: input.holdingId };
    },
  });
}
