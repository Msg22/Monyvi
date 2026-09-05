import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  Asset,
  AssetMetal,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
  MetalRateReference,
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
} from "./financial-action-foundation-repository";
import { incrementCanonicalMetalRevision } from "./metal-financial-action-adapter";
import { findOwnedById, queryChildrenOfOwnedParent } from "./user-data-access";

export interface SellMetalRateSnapshot extends RegisteredActionPayload {
  readonly referenceId: string;
  readonly role:
    | "terminal_metal"
    | "terminal_purchase_currency"
    | "terminal_proceeds_currency";
  readonly kind: "metal" | "currency";
  readonly instrumentCode: string;
  readonly valueDecimal: string;
  readonly unit:
    | "usd_per_pure_gram"
    | "usd_per_currency_unit"
    | "currency_units_per_usd";
  readonly orientation: "quote_per_base" | "base_per_quote";
  readonly providerObservedAt: string | null;
  readonly source: string | null;
  readonly quality: "valid";
  readonly capturedFreshness: "fresh" | "stale" | "unknown";
  readonly capturedAt: string;
}

export interface SellMetalHoldingCommandInput {
  readonly actionId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
  readonly predecessorEventId: string;
  readonly holdingId: string;
  readonly userId: string;
  readonly occurredAt: string;
  readonly cairoTodayDate: string;
  readonly saleDate: string;
  readonly expectedFinancialRevision: string;
  readonly metalType: "GOLD" | "SILVER";
  readonly purchaseCurrency: string;
  readonly saleCurrency: string;
  readonly grossProceedsMinorUnits: string;
  readonly feeMinorUnits: string;
  readonly netProceedsMinorUnits: string;
  readonly notes: string | null;
  readonly rateSnapshots: readonly SellMetalRateSnapshot[];
}

type Commit = (
  input: CommitFinancialActionGroupLocallyInput
) => Promise<CommitFinancialActionGroupLocallyResult>;

export interface SellMetalHoldingCommandDependencies {
  readonly database: Database;
  readonly commitFinancialActionGroupLocally: Commit;
  readonly createEnvelope: (
    input: SellMetalHoldingCommandInput,
    payload: RegisteredActionPayload
  ) => FinancialActionEnvelopeV1;
  readonly hashProvider: Sha256Provider;
}

export interface SellMetalHoldingCommandService {
  readonly sell: (
    input: SellMetalHoldingCommandInput
  ) => Promise<{ readonly kind: "committed" | "replay" }>;
}

interface SellProjection {
  readonly asset: Asset;
  readonly metal: AssetMetal;
  readonly state: MetalHoldingState;
  readonly predecessor: MetalLifecycleEvent;
}

function setPreparedId(model: Model, id: string): void {
  model._raw.id = id;
}

function payloadFor(
  input: SellMetalHoldingCommandInput
): RegisteredActionPayload {
  return {
    holdingId: input.holdingId,
    expectedHoldingRevision: input.expectedFinancialRevision,
    predecessorEventId: input.predecessorEventId,
    reversesEventId: null,
    metalType: input.metalType,
    saleDate: input.saleDate,
    purchaseCurrency: input.purchaseCurrency,
    saleCurrency: input.saleCurrency,
    grossProceedsMinorUnits: input.grossProceedsMinorUnits,
    feeMinorUnits: input.feeMinorUnits,
    netProceedsMinorUnits: input.netProceedsMinorUnits,
    notes: input.notes,
    rateSnapshots: input.rateSnapshots,
  };
}

async function loadProjection(
  database: Database,
  input: SellMetalHoldingCommandInput
): Promise<SellProjection> {
  const asset = await findOwnedById(
    database.get<Asset>("assets"),
    input.holdingId,
    input.userId
  );
  if (asset.deleted) throw new Error("metal_holding_not_found");
  const [metals, states, predecessor] = await Promise.all([
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
  ]);
  if (
    !metals[0] ||
    !states[0] ||
    predecessor.deleted ||
    predecessor.holdingId !== input.holdingId
  ) {
    throw new Error("metal_holding_not_found");
  }
  return { asset, metal: metals[0], state: states[0], predecessor };
}

function assertActiveProjection(
  input: SellMetalHoldingCommandInput,
  projection: SellProjection
): void {
  if (projection.state.status !== "active") {
    throw new Error("metal_sale_active_holding_required");
  }
  if (
    projection.state.financialRevision !== input.expectedFinancialRevision ||
    projection.state.effectiveEventId !== input.predecessorEventId ||
    !projection.predecessor.isEffective
  ) {
    throw new Error("holding_revision_conflict");
  }
  const purchaseCurrency =
    projection.asset.purchaseCurrency ?? projection.asset.currency;
  if (
    projection.metal.metalType !== input.metalType ||
    purchaseCurrency !== input.purchaseCurrency
  ) {
    throw new Error("holding_projection_changed");
  }
  const purchaseDate = projection.asset.purchaseDate.toISOString().slice(0, 10);
  if (input.saleDate < purchaseDate)
    throw new Error("metal_sale_before_purchase");
}

function prepareRateReference(
  database: Database,
  input: SellMetalHoldingCommandInput,
  snapshot: SellMetalRateSnapshot,
  occurredAt: Date
): MetalRateReference {
  return database
    .get<MetalRateReference>("metal_rate_references")
    .prepareCreate((record): void => {
      setPreparedId(record, snapshot.referenceId);
      record.actionId = input.actionId;
      record.capturedAt = new Date(snapshot.capturedAt);
      record.capturedFreshness = snapshot.capturedFreshness;
      record.deleted = false;
      record.holdingId = input.holdingId;
      record.instrumentCode = snapshot.instrumentCode;
      record.kind = snapshot.kind;
      record.orientation = snapshot.orientation;
      record.providerObservedAt = snapshot.providerObservedAt
        ? new Date(snapshot.providerObservedAt)
        : null;
      record.quality = snapshot.quality;
      record.role = snapshot.role;
      record.source = snapshot.source;
      record.unit = snapshot.unit;
      record.updatedAt = occurredAt;
      record.userId = input.userId;
      record.valueDecimal = snapshot.valueDecimal;
    });
}

function prepareSalePlan(
  database: Database,
  input: SellMetalHoldingCommandInput,
  envelope: FinancialActionEnvelopeV1,
  projection: SellProjection
): FinancialActionLinkedOperationPlan {
  assertActiveProjection(input, projection);
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
      record.kind = "sell";
      record.updatedAt = occurredAt;
      record.userId = input.userId;
    });
  const event = database
    .get<MetalLifecycleEvent>("metal_lifecycle_events")
    .prepareCreate((record): void => {
      setPreparedId(record, input.lifecycleEventId);
      record.actionId = input.actionId;
      record.deleted = false;
      record.holdingId = input.holdingId;
      record.isEffective = true;
      record.isHistoryVisible = true;
      record.kind = "sold";
      record.occurredAt = occurredAt;
      record.payloadJson = payloadJson;
      record.predecessorEventId = input.predecessorEventId;
      record.reversesEventId = null;
      record.updatedAt = occurredAt;
      record.userId = input.userId;
    });
  const rateReferences = input.rateSnapshots.map((snapshot) =>
    prepareRateReference(database, input, snapshot, occurredAt)
  );
  return {
    preparedCreates: [evidence, event, ...rateReferences],
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
          state.status = "sold";
          state.updatedAt = occurredAt;
        },
      },
      {
        kind: "update",
        model: projection.predecessor,
        update: (model): void => {
          const predecessor = model as MetalLifecycleEvent;
          predecessor.isEffective = false;
          predecessor.updatedAt = occurredAt;
        },
      },
    ],
    assertCachedOwnership: (): Promise<void> => Promise.resolve(),
    assertPreparedOwnership: (): Promise<void> => Promise.resolve(),
  };
}

export function createSellMetalHoldingCommandService(
  dependencies: SellMetalHoldingCommandDependencies
): SellMetalHoldingCommandService {
  return {
    sell: async (input): Promise<{ readonly kind: "committed" | "replay" }> => {
      const payload = payloadFor(input);
      const envelope = dependencies.createEnvelope(input, payload);
      const projection = await loadProjection(dependencies.database, input);
      const result = await dependencies.commitFinancialActionGroupLocally({
        envelope,
        hashProvider: dependencies.hashProvider,
        validationInput: { cairoTodayDate: input.cairoTodayDate },
        prepareLinkedOperationPlan: () =>
          Promise.resolve(
            prepareSalePlan(dependencies.database, input, envelope, projection)
          ),
      });
      return { kind: result.kind === "replay" ? "replay" : "committed" };
    },
  };
}
