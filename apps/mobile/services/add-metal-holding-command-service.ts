import type { Database, Model } from "@nozbe/watermelondb";
import type {
  Asset,
  AssetMetal,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
  MetalRateReference,
} from "@monyvi/db";
import {
  isSupportedMetalsIsoCurrencyCode,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "@monyvi/logic";

import type {
  CommitFinancialActionGroupLocallyInput,
  CommitFinancialActionGroupLocallyResult,
  FinancialActionLinkedOperationPlan,
} from "./financial-action-foundation-repository";

interface AddRateSnapshot {
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

export interface AddMetalHoldingCommandInput {
  readonly actionId: string;
  readonly holdingId: string;
  readonly holdingStateId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
  readonly userId: string;
  readonly occurredAt: string;
  readonly cairoTodayDate: string;
  readonly holding: {
    readonly name: string;
    readonly metal: "GOLD" | "SILVER";
    readonly weightGramsDecimal: string;
    readonly purity: {
      readonly code: string;
      readonly catalogVersion: "1";
      readonly factorDecimal: string;
      readonly labelKey: string;
    };
    readonly purchasePriceDecimal: string;
    readonly purchaseCurrency: string;
    readonly purchaseDate: string;
    readonly physicalForm: "COIN" | "BAR" | "JEWELRY" | null;
    readonly notes: string | null;
  };
  readonly rateSnapshots: readonly AddRateSnapshot[];
}

type CommitFinancialActionGroupLocally = (
  input: CommitFinancialActionGroupLocallyInput
) => Promise<CommitFinancialActionGroupLocallyResult>;

export interface AddMetalHoldingCommandDependencies {
  readonly database: Database;
  readonly commitFinancialActionGroupLocally: CommitFinancialActionGroupLocally;
  readonly createEnvelope: (
    input: AddMetalHoldingCommandInput
  ) => FinancialActionEnvelopeV1;
  readonly hashProvider: Sha256Provider;
}

export interface AddMetalHoldingCommandService {
  readonly add: (input: AddMetalHoldingCommandInput) => Promise<{
    readonly kind: "committed" | "replay";
    readonly holdingId: string;
  }>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertStableLocalIds(input: AddMetalHoldingCommandInput): void {
  const ids = [
    input.holdingStateId,
    input.actionEvidenceId,
    input.lifecycleEventId,
    ...input.rateSnapshots.map((snapshot) => snapshot.referenceId),
  ];
  if (
    ids.some((id) => !UUID_PATTERN.test(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error("metal_add_invalid_local_id");
  }
}

function setPreparedId(model: Model, id: string): void {
  model._raw.id = id;
}

function assertCreatedRowsOwned(
  userId: string,
  holdingId: string,
  plan: FinancialActionLinkedOperationPlan
): void {
  if (plan.existingOperations.length !== 0) {
    throw new Error("metal_add_unexpected_existing_operation");
  }

  for (const model of plan.preparedCreates) {
    const table = model.table;
    const raw = model._raw as unknown as Readonly<Record<string, unknown>>;
    if (table === "asset_metals") {
      if (raw["asset_id"] !== holdingId)
        throw new Error("metal_add_ownership_failed");
      continue;
    }
    if (raw["user_id"] !== userId)
      throw new Error("metal_add_ownership_failed");
  }
}

function prepareAddPlan(
  database: Database,
  input: AddMetalHoldingCommandInput,
  envelope: FinancialActionEnvelopeV1
): Promise<FinancialActionLinkedOperationPlan> {
  const occurredAt = new Date(input.occurredAt);
  const purchaseDate = new Date(`${input.holding.purchaseDate}T00:00:00.000Z`);
  const domainPayloadJson = JSON.stringify(envelope.payload);
  if (!isSupportedMetalsIsoCurrencyCode(input.holding.purchaseCurrency)) {
    throw new Error("metal_add_invalid_purchase_currency");
  }
  const purchaseCurrency = input.holding.purchaseCurrency;
  const acquisitionActionId =
    input.rateSnapshots.length === 0 ? null : input.actionId;

  const asset = database.get<Asset>("assets").prepareCreate((record): void => {
    setPreparedId(record, input.holdingId);
    record.acquisitionActionId = acquisitionActionId;
    record.currency = purchaseCurrency;
    record.deleted = false;
    record.isLiquid = true;
    record.name = input.holding.name;
    record.notes = input.holding.notes ?? undefined;
    record.purchaseCurrency = input.holding.purchaseCurrency;
    record.purchaseDate = purchaseDate;
    record.purchasePrice = Number(input.holding.purchasePriceDecimal);
    record.purchasePriceDecimal = input.holding.purchasePriceDecimal;
    record.type = "METAL";
    record.updatedAt = occurredAt;
    record.userId = input.userId;
  });

  const metal = database
    .get<AssetMetal>("asset_metals")
    .prepareCreate((record): void => {
      record.assetId = input.holdingId;
      record.deleted = false;
      record.itemForm = input.holding.physicalForm ?? undefined;
      record.metalType = input.holding.metal;
      record.purityCatalogVersion = input.holding.purity.catalogVersion;
      record.purityCode = input.holding.purity.code;
      record.purityFactorDecimal = input.holding.purity.factorDecimal;
      record.purityFraction = Number(input.holding.purity.factorDecimal);
      record.updatedAt = occurredAt;
      record.weightGrams = Number(input.holding.weightGramsDecimal);
      record.weightGramsDecimal = input.holding.weightGramsDecimal;
    });

  const holdingState = database
    .get<MetalHoldingState>("metal_holding_states")
    .prepareCreate((record): void => {
      setPreparedId(record, input.holdingStateId);
      record.deleted = false;
      record.effectiveActionId = input.actionId;
      record.effectiveEventId = input.lifecycleEventId;
      record.financialRevision = "0";
      record.holdingId = input.holdingId;
      record.isVisible = true;
      record.reconciliationState = "sync_pending";
      record.status = "active";
      record.updatedAt = occurredAt;
      record.userId = input.userId;
    });

  const evidence = database
    .get<MetalActionEvidence>("metal_action_evidence")
    .prepareCreate((record): void => {
      setPreparedId(record, input.actionEvidenceId);
      record.actionId = input.actionId;
      record.canonicalHoldingRevision = "0";
      record.deleted = false;
      record.domainPayloadJson = domainPayloadJson;
      record.expectedHoldingRevision = null;
      record.holdingId = input.holdingId;
      record.kind = "add";
      record.updatedAt = occurredAt;
      record.userId = input.userId;
    });

  const lifecycleEvent = database
    .get<MetalLifecycleEvent>("metal_lifecycle_events")
    .prepareCreate((record): void => {
      setPreparedId(record, input.lifecycleEventId);
      record.actionId = input.actionId;
      record.deleted = false;
      record.holdingId = input.holdingId;
      record.isEffective = true;
      record.isHistoryVisible = true;
      record.kind = "created";
      record.occurredAt = occurredAt;
      record.payloadJson = domainPayloadJson;
      record.predecessorEventId = null;
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

  const preparedCreates: readonly Model[] = [
    asset,
    metal,
    holdingState,
    evidence,
    lifecycleEvent,
    ...rateReferences,
  ];
  const plan: FinancialActionLinkedOperationPlan = {
    preparedCreates,
    existingOperations: [],
    assertCachedOwnership: ({ cachedPreimages }): Promise<void> => {
      if (cachedPreimages.length !== 0) {
        throw new Error("metal_add_unexpected_cached_operation");
      }
      return Promise.resolve();
    },
    assertPreparedOwnership: ({ userId, cachedPreimages }): Promise<void> => {
      if (cachedPreimages.length !== 0) {
        throw new Error("metal_add_unexpected_cached_operation");
      }
      assertCreatedRowsOwned(userId, input.holdingId, plan);
      return Promise.resolve();
    },
  };
  return Promise.resolve(plan);
}

export function createAddMetalHoldingCommandService(
  dependencies: AddMetalHoldingCommandDependencies
): AddMetalHoldingCommandService {
  return {
    add: async (
      input: AddMetalHoldingCommandInput
    ): Promise<{
      readonly kind: "committed" | "replay";
      readonly holdingId: string;
    }> => {
      assertStableLocalIds(input);
      const envelope = dependencies.createEnvelope(input);
      const result = await dependencies.commitFinancialActionGroupLocally({
        envelope,
        hashProvider: dependencies.hashProvider,
        validationInput: { cairoTodayDate: input.cairoTodayDate },
        prepareLinkedOperationPlan: () =>
          prepareAddPlan(dependencies.database, input, envelope),
      });
      return { kind: result.kind, holdingId: input.holdingId };
    },
  };
}
