import {
  Q,
  type Collection,
  type Database,
  type Model,
  type Query,
} from "@nozbe/watermelondb";
import type { Clause } from "@nozbe/watermelondb/QueryDescription";
import {
  Asset,
  AssetMetal,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
  MetalRateReference,
} from "@monyvi/db";
import type {
  FinancialActionEnvelopeV1,
  FinancialActionValidationInput,
  Sha256Provider,
} from "@monyvi/logic";

import {
  createFinancialActionFoundationRepository,
  type FinancialActionLinkedExistingOperation,
  type FinancialActionLinkedOperationPlan,
  type FinancialActionUserDataScope,
} from "./financial-action-foundation-repository";
import type { UserOwnedRecord } from "./user-data-access";
import {
  incrementCanonicalMetalRevision,
  METAL_FINANCIAL_ACTION_REGISTRY,
} from "./metal-financial-action-adapter";

interface WatermelonMetalRepositoryInput {
  readonly database: Database;
  readonly getCurrentUserId: () => Promise<string>;
}

export type MetalFinancialActionRepositoryDependencies =
  WatermelonMetalRepositoryInput;

export interface CommitMetalFinancialActionInput {
  readonly envelope: FinancialActionEnvelopeV1;
  readonly hashProvider: Sha256Provider;
  readonly validationInput?: FinancialActionValidationInput;
}

export interface MetalFinancialActionRepository {
  readonly commit: (
    input: CommitMetalFinancialActionInput
  ) => Promise<{ readonly kind: "committed" | "replay" }>;
}

type Payload = Readonly<Record<string, unknown>>;

function asObject(value: unknown): Payload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid_metal_action_payload");
  }
  return value as Payload;
}

function setId(model: Model, id: string): void {
  model._raw.id = id;
}

function assertOwnedRaw(raw: Readonly<Model["_raw"]>, userId: string): void {
  if ("user_id" in raw && raw.user_id !== userId) {
    throw new Error("metal_action_not_owned");
  }
}

function prepareOwnershipPlan(
  preparedCreates: readonly Model[],
  existingOperations: FinancialActionLinkedOperationPlan["existingOperations"]
): Pick<
  FinancialActionLinkedOperationPlan,
  "assertCachedOwnership" | "assertPreparedOwnership"
> {
  return {
    assertCachedOwnership: ({ userId, cachedPreimages }): Promise<void> => {
      cachedPreimages.forEach((image) => assertOwnedRaw(image.raw, userId));
      return Promise.resolve();
    },
    assertPreparedOwnership: ({
      userId,
      preparedPostimages,
    }): Promise<void> => {
      preparedPostimages.forEach((image) => assertOwnedRaw(image.raw, userId));
      if (
        preparedCreates.length + existingOperations.length !==
        preparedPostimages.length
      ) {
        throw new Error("invalid_metal_action_plan");
      }
      return Promise.resolve();
    },
  };
}

async function findOne<T extends Model>(
  collection: Collection<T>,
  ...conditions: Clause[]
): Promise<T | null> {
  const rows = await collection.query(...conditions).fetch();
  return rows[0] ?? null;
}

function eventPayloadJson(payload: Payload): string {
  return JSON.stringify(payload);
}

function payloadSnapshots(payload: Payload): readonly Payload[] {
  if (Array.isArray(payload.rateSnapshots)) {
    return payload.rateSnapshots.map(asObject);
  }
  const correction =
    payload.materialCorrection === undefined ||
    payload.materialCorrection === null
      ? null
      : asObject(payload.materialCorrection);
  return correction && Array.isArray(correction.rateSnapshots)
    ? correction.rateSnapshots.map(asObject)
    : [];
}

function prepareEvidence(
  database: Database,
  envelope: FinancialActionEnvelopeV1,
  now: Date
): MetalActionEvidence {
  const payload = asObject(envelope.payload);
  return database
    .get<MetalActionEvidence>("metal_action_evidence")
    .prepareCreate((row) => {
      setId(row, envelope.actionId);
      row.actionId = envelope.actionId;
      row.canonicalHoldingRevision = null;
      row.deleted = false;
      row.domainPayloadJson = eventPayloadJson(payload);
      row.expectedHoldingRevision = payload.expectedHoldingRevision as
        | string
        | null;
      row.holdingId = envelope.domainReferenceId;
      row.kind = envelope.kind;
      row.updatedAt = now;
      row.userId = envelope.userId;
    });
}

function prepareEvent(
  database: Database,
  envelope: FinancialActionEnvelopeV1,
  now: Date
): MetalLifecycleEvent {
  const payload = asObject(envelope.payload);
  return database
    .get<MetalLifecycleEvent>("metal_lifecycle_events")
    .prepareCreate((row) => {
      setId(row, envelope.actionId);
      row.actionId = envelope.actionId;
      row.deleted = false;
      row.holdingId = envelope.domainReferenceId;
      row.isEffective = true;
      row.isHistoryVisible = envelope.kind !== "delete";
      row.kind = envelope.kind;
      row.occurredAt = new Date(envelope.occurredAt);
      row.payloadJson = eventPayloadJson(payload);
      row.predecessorEventId = payload.predecessorEventId as string | null;
      row.reversesEventId = payload.reversesEventId as string | null;
      row.updatedAt = now;
      row.userId = envelope.userId;
    });
}

function prepareRates(
  database: Database,
  envelope: FinancialActionEnvelopeV1,
  now: Date
): readonly MetalRateReference[] {
  return payloadSnapshots(asObject(envelope.payload)).map((snapshot) =>
    database
      .get<MetalRateReference>("metal_rate_references")
      .prepareCreate((row) => {
        setId(row, snapshot.referenceId as string);
        row.actionId = envelope.actionId;
        row.capturedAt = new Date(snapshot.capturedAt as string);
        row.capturedFreshness = snapshot.capturedFreshness as string;
        row.deleted = false;
        row.holdingId = envelope.domainReferenceId;
        row.instrumentCode = snapshot.instrumentCode as string;
        row.kind = snapshot.kind as string;
        row.orientation = snapshot.orientation as string;
        row.providerObservedAt = snapshot.providerObservedAt
          ? new Date(snapshot.providerObservedAt as string)
          : null;
        row.quality = snapshot.quality as string;
        row.role = snapshot.role as string;
        row.source = snapshot.source as string | null;
        row.unit = snapshot.unit as string;
        row.updatedAt = now;
        row.userId = envelope.userId;
        row.valueDecimal = snapshot.valueDecimal as string;
      })
  );
}

function applyAssetFacts(
  asset: Asset,
  facts: Payload,
  actionId: string,
  now: Date
): void {
  asset.acquisitionActionId = actionId;
  asset.currency = facts.purchaseCurrency as Asset["currency"];
  asset.purchaseCurrency = facts.purchaseCurrency as string;
  asset.purchaseDate = new Date(`${String(facts.purchaseDate)}T00:00:00.000Z`);
  asset.purchasePriceDecimal = facts.purchasePriceDecimal as string;
  asset.purchasePrice = Number(facts.purchasePriceDecimal);
  asset.updatedAt = now;
}

function applyMetalFacts(metal: AssetMetal, facts: Payload, now: Date): void {
  metal.itemForm = facts.physicalForm as string;
  metal.purityCatalogVersion = facts.purityCatalogVersion as string;
  metal.purityCode = facts.purityCode as string;
  metal.purityFactorDecimal = facts.purityFactorDecimal as string;
  metal.purityFraction = Number(facts.purityFactorDecimal);
  metal.updatedAt = now;
  metal.weightGrams = Number(facts.weightGramsDecimal);
  metal.weightGramsDecimal = facts.weightGramsDecimal as string;
}

function currentMaterialFacts(asset: Asset, metal: AssetMetal): Payload {
  return {
    physicalForm: metal.itemForm,
    purchaseCurrency: asset.purchaseCurrency,
    purchaseDate: asset.purchaseDate.toISOString().slice(0, 10),
    purchasePriceDecimal: asset.purchasePriceDecimal,
    purityCatalogVersion: metal.purityCatalogVersion,
    purityCode: metal.purityCode,
    purityFactorDecimal: metal.purityFactorDecimal,
    weightGramsDecimal: metal.weightGramsDecimal,
  };
}

function hasMatchingMaterialFacts(
  candidate: Payload,
  current: Payload
): boolean {
  return (
    candidate.physicalForm === current.physicalForm &&
    candidate.purchaseCurrency === current.purchaseCurrency &&
    candidate.purchaseDate === current.purchaseDate &&
    candidate.purchasePriceDecimal === current.purchasePriceDecimal &&
    candidate.purityCatalogVersion === current.purityCatalogVersion &&
    candidate.purityCode === current.purityCode &&
    candidate.purityFactorDecimal === current.purityFactorDecimal &&
    candidate.weightGramsDecimal === current.weightGramsDecimal
  );
}

function assertPayloadMatchesProjection(
  envelope: FinancialActionEnvelopeV1,
  payload: Payload,
  asset: Asset,
  metal: AssetMetal
): void {
  if (envelope.kind === "correct") {
    const correction =
      payload.materialCorrection === null
        ? null
        : asObject(payload.materialCorrection);
    const metadataChange =
      payload.metadataChange === null ? null : asObject(payload.metadataChange);
    if (
      (correction &&
        !hasMatchingMaterialFacts(
          asObject(correction.before),
          currentMaterialFacts(asset, metal)
        )) ||
      (metadataChange &&
        JSON.stringify(asObject(metadataChange.before)) !==
          JSON.stringify({ name: asset.name, notes: asset.notes ?? null }))
    ) {
      throw new Error("metal_action_projection_mismatch");
    }
    const after = correction ? asObject(correction.after) : null;
    if (
      after &&
      (after.purityCode as string).startsWith("gold-") !==
        (metal.metalType === "GOLD")
    ) {
      throw new Error("metal_action_projection_mismatch");
    }
  }
  if (
    envelope.kind === "sell" &&
    (payload.metalType !== metal.metalType ||
      payload.purchaseCurrency !== asset.purchaseCurrency)
  ) {
    throw new Error("metal_action_projection_mismatch");
  }
  if (
    envelope.kind === "dispose" &&
    String(payload.disposalDate) < asset.purchaseDate.toISOString().slice(0, 10)
  ) {
    throw new Error("metal_disposal_before_acquisition");
  }
}

function prepareAddPlan(
  dependencies: MetalFinancialActionRepositoryDependencies,
  envelope: FinancialActionEnvelopeV1
): FinancialActionLinkedOperationPlan {
  const payload = asObject(envelope.payload);
  const facts = asObject(payload.materialFacts);
  const metadata = asObject(payload.metadata);
  const now = new Date();
  const asset = dependencies.database
    .get<Asset>("assets")
    .prepareCreate((row) => {
      setId(row, envelope.domainReferenceId);
      row.deleted = false;
      row.isLiquid = false;
      row.name = metadata.name as string;
      row.notes = (metadata.notes as string | null) ?? undefined;
      row.type = "METAL";
      row.userId = envelope.userId;
      applyAssetFacts(row, facts, envelope.actionId, now);
    });
  const metal = dependencies.database
    .get<AssetMetal>("asset_metals")
    .prepareCreate((row) => {
      setId(row, envelope.domainReferenceId);
      row.assetId = envelope.domainReferenceId;
      row.deleted = false;
      row.metalType = payload.metalType as AssetMetal["metalType"];
      applyMetalFacts(row, facts, now);
    });
  const state = dependencies.database
    .get<MetalHoldingState>("metal_holding_states")
    .prepareCreate((row) => {
      setId(row, envelope.domainReferenceId);
      row.deleted = false;
      row.effectiveActionId = envelope.actionId;
      row.effectiveEventId = envelope.actionId;
      row.financialRevision = "0";
      row.holdingId = envelope.domainReferenceId;
      row.isVisible = true;
      row.reconciliationState = "local_complete";
      row.status = "active";
      row.updatedAt = now;
      row.userId = envelope.userId;
    });
  const preparedCreates: readonly Model[] = [
    asset,
    metal,
    state,
    prepareEvidence(dependencies.database, envelope, now),
    prepareEvent(dependencies.database, envelope, now),
    ...prepareRates(dependencies.database, envelope, now),
  ];
  const existingOperations: FinancialActionLinkedOperationPlan["existingOperations"] =
    [];
  return {
    preparedCreates,
    existingOperations,
    ...prepareOwnershipPlan(preparedCreates, existingOperations),
  };
}

function assertCurrentActionState(
  state: MetalHoldingState,
  envelope: FinancialActionEnvelopeV1
): void {
  const payload = asObject(envelope.payload);
  if (state.financialRevision !== payload.expectedHoldingRevision) {
    throw new Error("metal_holding_revision_stale");
  }
  const isLegacyRoot =
    state.financialRevision === "0" &&
    state.effectiveEventId === null &&
    state.effectiveActionId === null;
  if (
    state.reconciliationState === "reconciliation_incomplete" ||
    (state.effectiveEventId !== payload.predecessorEventId && !isLegacyRoot)
  ) {
    throw new Error("metal_holding_predecessor_stale");
  }
  if (envelope.kind === "undo") {
    if (
      state.status === "active" ||
      payload.reversesEventId !== state.effectiveEventId
    ) {
      throw new Error("invalid_metal_holding_transition");
    }
    return;
  }
  if (state.status !== "active" || !state.isVisible) {
    throw new Error("invalid_metal_holding_transition");
  }
}

async function prepareExistingPlan(
  dependencies: MetalFinancialActionRepositoryDependencies,
  envelope: FinancialActionEnvelopeV1
): Promise<FinancialActionLinkedOperationPlan> {
  const [asset, metal, state] = await Promise.all([
    findOne(
      dependencies.database.get<Asset>("assets"),
      Q.where("id", envelope.domainReferenceId)
    ),
    findOne(
      dependencies.database.get<AssetMetal>("asset_metals"),
      Q.where("asset_id", envelope.domainReferenceId)
    ),
    findOne(
      dependencies.database.get<MetalHoldingState>("metal_holding_states"),
      Q.where("holding_id", envelope.domainReferenceId),
      Q.where("user_id", envelope.userId)
    ),
  ]);
  if (!asset || !metal || !state || asset.userId !== envelope.userId) {
    throw new Error("metal_holding_not_owned");
  }
  assertCurrentActionState(state, envelope);
  const payload = asObject(envelope.payload);
  assertPayloadMatchesProjection(envelope, payload, asset, metal);
  const now = new Date();
  const existingOperations: FinancialActionLinkedExistingOperation[] = [
    {
      kind: "update",
      model: state,
      update: (model): void => {
        const row = model as MetalHoldingState;
        row.effectiveActionId = envelope.actionId;
        row.effectiveEventId = envelope.actionId;
        row.financialRevision = incrementCanonicalMetalRevision(
          payload.expectedHoldingRevision as string
        );
        row.isVisible = envelope.kind !== "delete";
        row.reconciliationState = "local_complete";
        row.status =
          envelope.kind === "sell"
            ? "sold"
            : envelope.kind === "dispose"
              ? "disposed"
              : "active";
        if (envelope.kind === "correct" && payload.metadataChange !== null) {
          const metadataChange = asObject(payload.metadataChange);
          const before = asObject(metadataChange.before);
          const after = asObject(metadataChange.after);
          const writtenAt = Date.parse(envelope.occurredAt);
          if (before.name !== after.name) {
            row.nameWrittenAt = writtenAt;
            row.nameWriterId = envelope.actionId;
          }
          if (before.notes !== after.notes) {
            row.notesWrittenAt = writtenAt;
            row.notesWriterId = envelope.actionId;
          }
        }
        row.updatedAt = now;
      },
    },
  ];
  if (envelope.kind === "correct") {
    const correction =
      payload.materialCorrection === null
        ? null
        : asObject(payload.materialCorrection);
    const metadataChange =
      payload.metadataChange === null ? null : asObject(payload.metadataChange);
    if (correction || metadataChange) {
      const materialAfter = correction ? asObject(correction.after) : null;
      const metadataAfter = metadataChange
        ? asObject(metadataChange.after)
        : null;
      existingOperations.push({
        kind: "update",
        model: asset,
        update: (model): void => {
          const row = model as Asset;
          if (materialAfter) {
            applyAssetFacts(row, materialAfter, envelope.actionId, now);
          }
          if (metadataAfter) {
            row.name = metadataAfter.name as string;
            row.notes = (metadataAfter.notes as string | null) ?? undefined;
            row.updatedAt = now;
          }
        },
      });
      if (materialAfter) {
        existingOperations.push({
          kind: "update",
          model: metal,
          update: (model): void =>
            applyMetalFacts(model as AssetMetal, materialAfter, now),
        });
      }
    }
  }
  const preparedCreates: readonly Model[] = [
    prepareEvidence(dependencies.database, envelope, now),
    prepareEvent(dependencies.database, envelope, now),
    ...prepareRates(dependencies.database, envelope, now),
  ];
  return {
    preparedCreates,
    existingOperations,
    ...prepareOwnershipPlan(preparedCreates, existingOperations),
  };
}

export function createWatermelonMetalFinancialActionRepositoryDependencies(
  input: WatermelonMetalRepositoryInput
): MetalFinancialActionRepositoryDependencies {
  return Object.freeze({ ...input });
}

export function createMetalFinancialActionRepository(
  dependencies: MetalFinancialActionRepositoryDependencies
): MetalFinancialActionRepository {
  const foundation = createFinancialActionFoundationRepository({
    database: dependencies.database,
    registry: METAL_FINANCIAL_ACTION_REGISTRY,
    getCurrentUserDataScope:
      async (): Promise<FinancialActionUserDataScope> => {
        const userId = await dependencies.getCurrentUserId();
        return {
          userId,
          queryOwned: <TRecord extends Model & UserOwnedRecord>(
            collection: Collection<TRecord>,
            ...conditions: Clause[]
          ): Query<TRecord> =>
            collection.query(Q.where("user_id", userId), ...conditions),
          assertOwned: <TRecord extends UserOwnedRecord>(
            record: TRecord
          ): TRecord => {
            if (record.userId !== userId)
              throw new Error("metal_action_not_owned");
            return record;
          },
        };
      },
    assertExpectedCurrentUser: async (
      expectedUserId: string
    ): Promise<void> => {
      if ((await dependencies.getCurrentUserId()) !== expectedUserId) {
        throw new Error("financial_action_auth_scope_changed");
      }
    },
  });

  async function commit(
    input: CommitMetalFinancialActionInput
  ): Promise<{ readonly kind: "committed" | "replay" }> {
    const result = await foundation.commitFinancialActionGroupLocally({
      ...input,
      prepareLinkedOperationPlan:
        async (): Promise<FinancialActionLinkedOperationPlan> => {
          if (input.envelope.kind === "add") {
            const existing = await findOne(
              dependencies.database.get<Asset>("assets"),
              Q.where("id", input.envelope.domainReferenceId)
            );
            if (existing) throw new Error("metal_holding_already_exists");
            return prepareAddPlan(dependencies, input.envelope);
          }
          return prepareExistingPlan(dependencies, input.envelope);
        },
    });
    return Object.freeze({ kind: result.kind });
  }

  return Object.freeze({ commit });
}
