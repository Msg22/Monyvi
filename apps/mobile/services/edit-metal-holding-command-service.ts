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

export interface EditMetalMaterialFacts {
  readonly weightGramsDecimal: string;
  readonly purityCode: string;
  readonly purityCatalogVersion: "1";
  readonly purityFactorDecimal: string;
  readonly purchasePriceDecimal: string;
  readonly purchaseCurrency: string;
  readonly purchaseDate: string;
  readonly physicalForm: "COIN" | "BAR" | "JEWELRY" | null;
}

export interface EditMetalRateSnapshot extends RegisteredActionPayload {
  readonly referenceId: string;
  readonly role: "acquisition_metal" | "acquisition_purchase_currency";
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

interface MetalMetadata {
  readonly name: string;
  readonly notes: string | null;
}

export interface EditMetalHoldingCommandInput {
  readonly actionId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
  readonly predecessorEventId: string;
  readonly holdingId: string;
  readonly userId: string;
  readonly occurredAt: string;
  readonly cairoTodayDate: string;
  readonly expectedFinancialRevision: string;
  readonly correctionReason: string | null;
  readonly originalMetadata: MetalMetadata;
  readonly metadata: MetalMetadata;
  readonly originalMaterialFacts: EditMetalMaterialFacts;
  readonly materialFacts: EditMetalMaterialFacts | null;
  readonly rateSnapshots: readonly EditMetalRateSnapshot[];
}

type Commit = (
  input: CommitFinancialActionGroupLocallyInput
) => Promise<CommitFinancialActionGroupLocallyResult>;
export interface EditMetalHoldingCommandDependencies {
  readonly database: Database;
  readonly commitFinancialActionGroupLocally: Commit;
  readonly createEnvelope: (
    input: EditMetalHoldingCommandInput,
    payload: RegisteredActionPayload
  ) => FinancialActionEnvelopeV1;
  readonly hashProvider: Sha256Provider;
}
export interface EditMetalHoldingCommandService {
  readonly save: (
    input: EditMetalHoldingCommandInput
  ) => Promise<{ readonly kind: "metadata" | "correction" | "replay" }>;
}

function setPreparedId(model: Model, id: string): void {
  model._raw.id = id;
}
function metadataChanged(input: EditMetalHoldingCommandInput): boolean {
  return (
    input.originalMetadata.name !== input.metadata.name ||
    input.originalMetadata.notes !== input.metadata.notes
  );
}
function materialChanged(input: EditMetalHoldingCommandInput): boolean {
  return (
    input.materialFacts !== null &&
    JSON.stringify(input.originalMaterialFacts) !==
      JSON.stringify(input.materialFacts)
  );
}
function payloadFor(
  input: EditMetalHoldingCommandInput
): RegisteredActionPayload {
  const payload = {
    holdingId: input.holdingId,
    expectedHoldingRevision: input.expectedFinancialRevision,
    predecessorEventId: input.predecessorEventId,
    reversesEventId: null,
    metadataChange: metadataChanged(input)
      ? { before: input.originalMetadata, after: input.metadata }
      : null,
    materialCorrection: materialChanged(input)
      ? {
          before: input.originalMaterialFacts,
          after: input.materialFacts,
          reason: input.correctionReason,
          rateSnapshots: input.rateSnapshots,
        }
      : null,
  };
  return payload as unknown as RegisteredActionPayload;
}

async function loadProjection(
  database: Database,
  input: EditMetalHoldingCommandInput
): Promise<{
  readonly asset: Asset;
  readonly metal: AssetMetal;
  readonly state: MetalHoldingState;
  readonly predecessor: MetalLifecycleEvent;
}> {
  const asset = await findOwnedById(
    database.get<Asset>("assets"),
    input.holdingId,
    input.userId
  );
  if (asset.deleted) throw new Error("metal_holding_not_found");
  const [metal, state, predecessor] = await Promise.all([
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
    !metal[0] ||
    !state[0] ||
    predecessor.userId !== input.userId ||
    predecessor.holdingId !== input.holdingId ||
    predecessor.deleted
  )
    throw new Error("metal_holding_not_found");
  return { asset, metal: metal[0], state: state[0], predecessor };
}

function assertOriginalProjection(
  input: EditMetalHoldingCommandInput,
  projection: Awaited<ReturnType<typeof loadProjection>>
): void {
  const persistedMetadata = {
    name: projection.asset.name,
    notes: projection.asset.notes ?? null,
  };
  const persistedMaterial: EditMetalMaterialFacts = {
    weightGramsDecimal:
      projection.metal.weightGramsDecimal ??
      String(projection.metal.weightGrams),
    purityCode: projection.metal.purityCode ?? "",
    purityCatalogVersion:
      projection.metal.purityCatalogVersion === "1" ? "1" : "1",
    purityFactorDecimal:
      projection.metal.purityFactorDecimal ??
      String(projection.metal.purityFraction),
    purchasePriceDecimal:
      projection.asset.purchasePriceDecimal ??
      String(projection.asset.purchasePrice),
    purchaseCurrency:
      projection.asset.purchaseCurrency ?? projection.asset.currency,
    purchaseDate: projection.asset.purchaseDate.toISOString().slice(0, 10),
    physicalForm:
      projection.metal.itemForm === "COIN" ||
      projection.metal.itemForm === "BAR" ||
      projection.metal.itemForm === "JEWELRY"
        ? projection.metal.itemForm
        : null,
  };
  if (
    JSON.stringify(persistedMetadata) !==
      JSON.stringify(input.originalMetadata) ||
    JSON.stringify(persistedMaterial) !==
      JSON.stringify(input.originalMaterialFacts)
  ) {
    throw new Error("holding_projection_changed");
  }
}

function prepareCorrectionPlan(
  database: Database,
  input: EditMetalHoldingCommandInput,
  envelope: FinancialActionEnvelopeV1,
  projection: Awaited<ReturnType<typeof loadProjection>>
): FinancialActionLinkedOperationPlan {
  if (projection.state.status !== "active")
    throw new Error("terminal_holding_material_edit_forbidden");
  if (
    projection.state.financialRevision !== input.expectedFinancialRevision ||
    projection.state.effectiveEventId !== input.predecessorEventId
  )
    throw new Error("holding_revision_conflict");
  assertOriginalProjection(input, projection);
  const material = input.materialFacts;
  if (!material) throw new Error("metal_correction_material_required");
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
      record.kind = "correct";
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
      record.kind = "corrected";
      record.occurredAt = occurredAt;
      record.payloadJson = payloadJson;
      record.predecessorEventId = input.predecessorEventId;
      record.reversesEventId = null;
      record.updatedAt = occurredAt;
      record.userId = input.userId;
    });
  const rateReferences = input.rateSnapshots.map((snapshot) =>
    database
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
      })
  );
  return {
    preparedCreates: [evidence, event, ...rateReferences],
    existingOperations: [
      {
        kind: "update",
        model: projection.asset,
        update: (model): void => {
          const asset = model as Asset;
          asset.name = input.metadata.name;
          asset.notes = input.metadata.notes ?? undefined;
          asset.currency = material.purchaseCurrency as Asset["currency"];
          asset.purchaseCurrency = material.purchaseCurrency;
          asset.purchaseDate = new Date(
            `${material.purchaseDate}T00:00:00.000Z`
          );
          asset.purchasePrice = Number(material.purchasePriceDecimal);
          asset.purchasePriceDecimal = material.purchasePriceDecimal;
          if (input.rateSnapshots.length > 0)
            asset.acquisitionActionId = input.actionId;
          asset.updatedAt = occurredAt;
        },
      },
      {
        kind: "update",
        model: projection.metal,
        update: (model): void => {
          const metal = model as AssetMetal;
          metal.itemForm = material.physicalForm ?? undefined;
          metal.purityCatalogVersion = material.purityCatalogVersion;
          metal.purityCode = material.purityCode;
          metal.purityFactorDecimal = material.purityFactorDecimal;
          metal.purityFraction = Number(material.purityFactorDecimal);
          metal.weightGramsDecimal = material.weightGramsDecimal;
          metal.weightGrams = Number(material.weightGramsDecimal);
          metal.updatedAt = occurredAt;
        },
      },
      {
        kind: "update",
        model: projection.state,
        update: (model): void => {
          const state = model as MetalHoldingState;
          state.effectiveActionId = input.actionId;
          state.effectiveEventId = input.lifecycleEventId;
          state.financialRevision = nextRevision;
          state.reconciliationState = "sync_pending";
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

async function saveMetadata(
  database: Database,
  input: EditMetalHoldingCommandInput
): Promise<void> {
  const projection = await loadProjection(database, input);
  await database.write(async (): Promise<void> => {
    await projection.asset.update((asset): void => {
      asset.name = input.metadata.name;
      asset.notes = input.metadata.notes ?? undefined;
      asset.updatedAt = new Date(input.occurredAt);
    });
  });
}

export function createEditMetalHoldingCommandService(
  dependencies: EditMetalHoldingCommandDependencies
): EditMetalHoldingCommandService {
  return {
    save: async (
      input
    ): Promise<{ readonly kind: "metadata" | "correction" | "replay" }> => {
      if (!materialChanged(input)) {
        await saveMetadata(dependencies.database, input);
        return { kind: "metadata" };
      }
      if (!input.correctionReason?.trim())
        throw new Error("correction_reason_required");
      const payload = payloadFor(input);
      const envelope = dependencies.createEnvelope(input, payload);
      const projection = await loadProjection(dependencies.database, input);
      const result = await dependencies.commitFinancialActionGroupLocally({
        envelope,
        hashProvider: dependencies.hashProvider,
        validationInput: { cairoTodayDate: input.cairoTodayDate },
        prepareLinkedOperationPlan: () =>
          Promise.resolve(
            prepareCorrectionPlan(
              dependencies.database,
              input,
              envelope,
              projection
            )
          ),
      });
      return { kind: result.kind === "replay" ? "replay" : "correction" };
    },
  };
}
