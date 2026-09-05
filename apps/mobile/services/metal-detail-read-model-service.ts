import {
  database,
  type Asset,
  type AssetMetal,
  type CurrencyType,
  type MetalActionEvidence,
  type MetalHoldingState,
  type MetalLifecycleEvent,
  type MetalRateReference,
} from "@monyvi/db";
import {
  calculateMetalReferenceValue,
  calculatePureGrams,
  calculateUnrealizedAttribution,
  isSupportedMetalsIsoCurrencyCode,
  orderLifecycleEventsNewestFirst,
  parseCanonicalDecimal,
  reduceMetalLifecycle,
  resolveMetalsCurrencyMinorUnits,
  validateAndNormalizeRateReference,
  type CurrencyInstrumentCode,
  type LifecycleEvent,
  type MetalInstrumentCode,
  type NormalizedRateReference,
  type RateReferenceExpectation,
} from "@monyvi/logic";
import { Q, type Query } from "@nozbe/watermelondb";
import {
  getCurrentUserDataScope,
  queryOwned,
  type CurrentUserDataScope,
  USER_DATA_ACCESS_ERROR_CODES,
} from "@/services/user-data-access";
import type { LiveRatesTrustReadModel } from "@/services/live-rates-trust-read-model-service";

export const METAL_DETAIL_PAGE_SIZE = 50;
const MAX_METAL_DETAIL_PAGE_SIZE = 100;

export interface MetalDetailAssetInput {
  readonly id: string;
  readonly name: string;
  readonly purchaseCurrency: string | null;
  readonly purchaseDate: Date | null;
  readonly purchasePriceDecimal: string | null;
  readonly userId: string;
}

export interface MetalDetailMetalInput {
  readonly itemForm: string | null;
  readonly metalType: "GOLD" | "SILVER";
  readonly purityCatalogVersion: string | null;
  readonly purityCode: string | null;
  readonly purityFactorDecimal: string | null;
  readonly weightGramsDecimal: string | null;
}

export interface MetalDetailHoldingStateInput {
  readonly effectiveActionId?: string | null;
  readonly effectiveEventId?: string | null;
  readonly holdingId: string;
  readonly isVisible: boolean;
  readonly reconciliationState: string;
  readonly status: string;
  readonly userId: string;
}

export interface MetalDetailLifecycleEventInput {
  readonly actionState?: "accepted" | "rejected" | "unknown";
  readonly id: string;
  readonly isEffective?: boolean;
  readonly isHistoryVisible?: boolean;
  readonly kind: "add" | "correct" | "sell" | "dispose" | "delete" | "undo";
  readonly occurredAt: Date;
  readonly payloadJson?: string;
  readonly predecessorEventId: string | null;
  readonly reversesEventId?: string | null;
}

export interface BuildMetalDetailReadModelInput {
  readonly asset: MetalDetailAssetInput;
  readonly currentRates?: LiveRatesTrustReadModel;
  readonly holdingState: MetalDetailHoldingStateInput;
  readonly lifecycleEvents: readonly MetalDetailLifecycleEventInput[];
  readonly metal: MetalDetailMetalInput;
  readonly preferredCurrency?: CurrencyType;
  readonly rateReferences: readonly unknown[];
  readonly userId: string;
}

export interface MetalDetailTimelineItem {
  readonly id: string;
  readonly kind: MetalDetailLifecycleEventInput["kind"];
  readonly occurredAt: Date;
}

export interface MetalDetailAttribution {
  readonly breakdown:
    | { readonly available: true }
    | { readonly available: false };
  readonly currencyGainDecimal: string | null;
  readonly metalGainDecimal: string | null;
  readonly premiumAndCostsDecimal: string | null;
}

export type MetalDetailPhysicalForm = "bar" | "coin" | "jewelry";
export type MetalDetailRenderKey =
  `${"gold" | "silver"}:${MetalDetailPhysicalForm}`;

export interface MetalDetailReadModel {
  readonly attribution: MetalDetailAttribution | null;
  readonly currentValueCurrency?: CurrencyType | null;
  readonly currentValueDecimal: string | null;
  readonly currentValueObservedAt?: Date | null;
  readonly id: string;
  readonly isActiveOwnership: boolean;
  readonly isFinancialActionLocked: boolean;
  readonly itemForm: MetalDetailPhysicalForm | null;
  readonly metalType: "GOLD" | "SILVER";
  readonly name: string;
  readonly purchaseCurrency: string | null;
  readonly purchaseDate: Date | null;
  readonly purchasePriceDecimal: string | null;
  readonly purityCatalogVersion: string | null;
  readonly purityCode: string | null;
  readonly purityFactorDecimal: string | null;
  readonly requiresCompleteMaterialCorrection: boolean;
  readonly renderKey: MetalDetailRenderKey | null;
  readonly status: "active" | "sold" | "disposed";
  readonly timeline: readonly MetalDetailTimelineItem[];
  readonly totalGainDecimal: string | null;
  readonly unavailableExactFacts: ReadonlyArray<
    "weight" | "purity" | "purchase_cost"
  >;
  readonly weightGramsDecimal: string | null;
}

export interface ReadMetalDetailReadModelOptions {
  readonly currentRates?: LiveRatesTrustReadModel;
  readonly holdingId: string;
  readonly pageSize?: number;
  readonly preferredCurrency?: CurrencyType;
  readonly userId: string;
}

export function observeMetalDetailHolding(
  userId: string,
  holdingId: string
): Query<Asset> {
  return queryOwned(
    database.get<Asset>("assets"),
    userId,
    Q.where("id", holdingId),
    Q.where("deleted", false)
  );
}

export function observeMetalDetailEvents(
  userId: string,
  holdingId: string,
  pageSize: number = METAL_DETAIL_PAGE_SIZE
): Query<MetalLifecycleEvent> {
  return queryOwned(
    database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
    userId,
    Q.where("holding_id", holdingId),
    Q.where("deleted", false),
    Q.sortBy("occurred_at", Q.desc),
    Q.take(toBoundedPageSize(pageSize) + 1)
  );
}

export function observeMetalDetailRateReferences(
  userId: string,
  holdingId: string,
  pageSize: number = METAL_DETAIL_PAGE_SIZE
): Query<MetalRateReference> {
  return queryOwned(
    database.get<MetalRateReference>("metal_rate_references"),
    userId,
    Q.where("holding_id", holdingId),
    Q.where("deleted", false),
    Q.sortBy("captured_at", Q.desc),
    Q.take(toBoundedPageSize(pageSize) + 1)
  );
}

export async function readMetalDetailReadModel(
  options: ReadMetalDetailReadModelOptions
): Promise<MetalDetailReadModel | null> {
  const scope = await getCurrentUserDataScope();
  assertRequestedUser(scope.userId, options.userId);
  const pageSize = toBoundedPageSize(
    options.pageSize ?? METAL_DETAIL_PAGE_SIZE
  );
  const asset = await readOwnedDetailAsset(scope, options.holdingId);
  if (asset === null) return null;
  const dependencies = await readDetailDependencies(scope, asset, pageSize);
  if (dependencies === null) return null;
  const { evidence, events, holdingState, metal, metalType, rateReferences } =
    dependencies;

  return buildMetalDetailReadModel({
    asset: toDetailAssetInput(asset),
    currentRates: options.currentRates,
    holdingState: toDetailHoldingStateInput(holdingState),
    lifecycleEvents: shapeMetalDetailLifecycleEvents(events, evidence),
    metal: toDetailMetalInput(metal, metalType),
    preferredCurrency: options.preferredCurrency,
    rateReferences: rateReferences.map(toRateReferenceInput),
    userId: scope.userId,
  });
}

async function readOwnedDetailAsset(
  scope: CurrentUserDataScope,
  holdingId: string
): Promise<Asset | null> {
  const assets = await scope
    .queryOwned(
      database.get<Asset>("assets"),
      Q.where("id", holdingId),
      Q.where("type", "METAL"),
      Q.where("deleted", false),
      Q.take(2)
    )
    .fetch();
  return assets.length === 1 ? assets[0] : null;
}

interface MetalDetailDependencies {
  readonly evidence: readonly MetalActionEvidence[];
  readonly events: readonly MetalLifecycleEvent[];
  readonly holdingState: MetalHoldingState;
  readonly metal: AssetMetal;
  readonly metalType: "GOLD" | "SILVER";
  readonly rateReferences: readonly MetalRateReference[];
}

async function readDetailDependencies(
  scope: CurrentUserDataScope,
  asset: Asset,
  pageSize: number
): Promise<MetalDetailDependencies | null> {
  const [metals, holdingStates, evidenceAndEvents] = await Promise.all([
    scope
      .queryChildrenOfOwnedParent(
        database.get<AssetMetal>("asset_metals"),
        asset,
        "asset_id",
        Q.where("deleted", false),
        Q.take(2)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalHoldingState>("metal_holding_states"),
        Q.where("holding_id", asset.id),
        Q.where("deleted", false),
        Q.take(2)
      )
      .fetch(),
    readDetailEvidenceAndEvents(scope, asset.id, pageSize),
  ]);
  if (metals.length !== 1 || holdingStates.length !== 1) return null;
  const metal = metals[0];
  if (!isSupportedMetalType(metal.metalType)) return null;
  return {
    ...evidenceAndEvents,
    holdingState: holdingStates[0],
    metal,
    metalType: metal.metalType,
  };
}

async function readDetailEvidenceAndEvents(
  scope: CurrentUserDataScope,
  holdingId: string,
  pageSize: number
): Promise<
  Pick<MetalDetailDependencies, "evidence" | "events" | "rateReferences">
> {
  const [events, evidence, rateReferences] = await Promise.all([
    scope
      .queryOwned(
        database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
        Q.where("holding_id", holdingId),
        Q.where("deleted", false),
        Q.sortBy("occurred_at", Q.desc),
        Q.take(pageSize + 1)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalActionEvidence>("metal_action_evidence"),
        Q.where("holding_id", holdingId),
        Q.where("deleted", false),
        Q.take(pageSize + 1)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalRateReference>("metal_rate_references"),
        Q.where("holding_id", holdingId),
        Q.where("deleted", false),
        Q.sortBy("captured_at", Q.desc),
        Q.take(pageSize + 1)
      )
      .fetch(),
  ]);
  return { evidence, events, rateReferences };
}

export function shapeMetalDetailLifecycleEvents(
  events: readonly MetalLifecycleEvent[],
  evidence: readonly MetalActionEvidence[]
): readonly MetalDetailLifecycleEventInput[] {
  return Object.freeze(
    events
      .map((event) => toDetailLifecycleEventInput(event, evidence))
      .filter(
        (event): event is MetalDetailLifecycleEventInput => event !== null
      )
  );
}

export function buildMetalDetailReadModel(
  input: BuildMetalDetailReadModelInput
): MetalDetailReadModel | null {
  if (!isOwnedDetailInput(input)) return null;

  const reduced = reduceMetalLifecycle(
    input.lifecycleEvents.map(toReducerEvent)
  );
  const projection = reduced.projection;
  if (
    (projection === null && !isMigrationBackfilledActiveHolding(input)) ||
    (projection !== null && !projection.isVisible) ||
    !input.holdingState.isVisible
  ) {
    return null;
  }

  const unavailableExactFacts = getUnavailableExactFacts(input);
  const status = projection?.status ?? "active";
  const active = status === "active";
  const references = input.rateReferences;
  const legacyCurrentValue = isMigrationBackfilledActiveHolding(input)
    ? buildLegacyCurrentValue(input, unavailableExactFacts)
    : null;
  const attribution = active
    ? buildActiveAttribution(input, unavailableExactFacts, references)
    : null;
  const itemForm = normalizePhysicalForm(input.metal.itemForm);

  return Object.freeze({
    attribution,
    currentValueCurrency: legacyCurrentValue?.currency ?? null,
    currentValueDecimal: active
      ? (buildCurrentValue(input, unavailableExactFacts, references) ??
        legacyCurrentValue?.valueDecimal ??
        null)
      : null,
    currentValueObservedAt: legacyCurrentValue?.observedAt ?? null,
    id: input.asset.id,
    isActiveOwnership: active,
    isFinancialActionLocked:
      input.holdingState.reconciliationState === "reconciliation_incomplete",
    itemForm,
    metalType: input.metal.metalType,
    name: input.asset.name,
    purchaseCurrency: input.asset.purchaseCurrency,
    purchaseDate: copyValidDate(input.asset.purchaseDate),
    purchasePriceDecimal: input.asset.purchasePriceDecimal,
    purityCatalogVersion: input.metal.purityCatalogVersion,
    purityCode: input.metal.purityCode,
    purityFactorDecimal: input.metal.purityFactorDecimal,
    requiresCompleteMaterialCorrection: unavailableExactFacts.length > 0,
    renderKey: toRenderKey(input.metal.metalType, itemForm),
    status,
    timeline:
      projection === null
        ? []
        : buildTimeline(reduced.acceptedEvents, input.lifecycleEvents),
    totalGainDecimal:
      attribution?.breakdown.available === true
        ? attribution.totalGainDecimal
        : null,
    unavailableExactFacts,
    weightGramsDecimal: input.metal.weightGramsDecimal,
  });
}

function isOwnedDetailInput(input: BuildMetalDetailReadModelInput): boolean {
  return (
    input.asset.userId === input.userId &&
    input.holdingState.userId === input.userId &&
    input.holdingState.holdingId === input.asset.id
  );
}

function isMigrationBackfilledActiveHolding(
  input: BuildMetalDetailReadModelInput
): boolean {
  return (
    input.lifecycleEvents.length === 0 &&
    input.holdingState.effectiveActionId === null &&
    input.holdingState.effectiveEventId === null &&
    input.holdingState.status === "active"
  );
}

function buildLegacyCurrentValue(
  input: BuildMetalDetailReadModelInput,
  unavailableExactFacts: MetalDetailReadModel["unavailableExactFacts"]
): {
  readonly currency: CurrencyType;
  readonly observedAt: Date | null;
  readonly valueDecimal: string;
} | null {
  if (
    input.currentRates === undefined ||
    input.preferredCurrency === undefined ||
    !isSupportedMetalsIsoCurrencyCode(input.preferredCurrency) ||
    unavailableExactFacts.includes("weight") ||
    unavailableExactFacts.includes("purity")
  ) {
    return null;
  }
  const metalRate =
    input.metal.metalType === "GOLD"
      ? input.currentRates.gold
      : input.currentRates.silver;
  const currencyRate = input.currentRates.currencies.get(
    input.preferredCurrency
  );
  if (
    !hasTrustedCurrentRate(metalRate) ||
    !hasTrustedCurrentRate(currencyRate)
  ) {
    return null;
  }
  const value = calculateMetalReferenceValue({
    currencyUsdPerUnitDecimal: currencyRate.valueDecimal,
    metalUsdPerPureGramDecimal: metalRate.valueDecimal,
    purityFactorDecimal: input.metal.purityFactorDecimal ?? "0",
    weightGramsDecimal: input.metal.weightGramsDecimal ?? "0",
  });
  if (!value.available) return null;
  return {
    currency: input.preferredCurrency,
    observedAt: latestObservedAt(
      metalRate.providerObservedAt,
      currencyRate.providerObservedAt
    ),
    valueDecimal: value.valueDecimal,
  };
}

function hasTrustedCurrentRate(
  rate: LiveRatesTrustReadModel["gold"] | undefined
): rate is LiveRatesTrustReadModel["gold"] & { readonly valueDecimal: string } {
  return (
    rate !== undefined &&
    rate.state !== "invalid" &&
    rate.state !== "missing" &&
    typeof rate.valueDecimal === "string"
  );
}

function latestObservedAt(
  first: Date | null,
  second: Date | null
): Date | null {
  if (first === null || second === null) return null;
  return new Date(Math.max(first.getTime(), second.getTime()));
}

function toReducerEvent(event: MetalDetailLifecycleEventInput): LifecycleEvent {
  return {
    canonicalCasStatus: event.actionState ?? "unknown",
    evidenceState: event.isEffective === false ? "ineffective" : "effective",
    fingerprint: event.payloadJson ?? event.id,
    id: event.id,
    kind: toLifecycleKind(event.kind),
    occurredAt: event.occurredAt.getTime(),
    predecessorEventId: event.predecessorEventId,
    reversesEventId: event.reversesEventId ?? null,
  };
}

function toLifecycleKind(
  kind: MetalDetailLifecycleEventInput["kind"]
): LifecycleEvent["kind"] {
  const mappedKinds: Readonly<
    Record<MetalDetailLifecycleEventInput["kind"], LifecycleEvent["kind"]>
  > = {
    add: "created",
    correct: "corrected",
    delete: "deleted",
    dispose: "disposed",
    sell: "sold",
    undo: "reversed",
  };
  return mappedKinds[kind];
}

function getUnavailableExactFacts(
  input: BuildMetalDetailReadModelInput
): MetalDetailReadModel["unavailableExactFacts"] {
  const unavailable: Array<"weight" | "purity" | "purchase_cost"> = [];
  if (!isPositiveDecimal(input.metal.weightGramsDecimal))
    unavailable.push("weight");
  if (!hasCompletePurityTuple(input.metal)) unavailable.push("purity");
  if (!isPositiveDecimal(input.asset.purchasePriceDecimal))
    unavailable.push("purchase_cost");
  return Object.freeze(unavailable);
}

function hasCompletePurityTuple(input: MetalDetailMetalInput): boolean {
  return (
    input.purityCatalogVersion !== null &&
    input.purityCode !== null &&
    isPositiveDecimal(input.purityFactorDecimal)
  );
}

function isPositiveDecimal(value: string | null): boolean {
  if (value === null) return false;
  try {
    return parseCanonicalDecimal(value).greaterThan("0");
  } catch {
    return false;
  }
}

function buildCurrentValue(
  input: BuildMetalDetailReadModelInput,
  unavailableExactFacts: MetalDetailReadModel["unavailableExactFacts"],
  references: readonly unknown[]
): string | null {
  if (
    unavailableExactFacts.includes("weight") ||
    unavailableExactFacts.includes("purity")
  ) {
    return null;
  }
  const currencyInstrumentCode = toCurrencyInstrumentCode(
    input.asset.purchaseCurrency
  );
  if (currencyInstrumentCode === null) return null;
  const metalReference = findReference(references, {
    role: "current_metal",
    instrumentCode: toMetalInstrumentCode(input.metal.metalType),
  });
  const currencyReference = findReference(references, {
    role: "current_purchase_currency",
    instrumentCode: currencyInstrumentCode,
  });
  if (metalReference === null || currencyReference === null) return null;

  const result = calculateMetalReferenceValue({
    currencyUsdPerUnitDecimal: currencyReference.normalizedUsdPerBaseDecimal,
    metalUsdPerPureGramDecimal: metalReference.normalizedUsdPerBaseDecimal,
    purityFactorDecimal: input.metal.purityFactorDecimal ?? "0",
    weightGramsDecimal: input.metal.weightGramsDecimal ?? "0",
  });
  return result.available ? result.valueDecimal : null;
}

function buildActiveAttribution(
  input: BuildMetalDetailReadModelInput,
  unavailableExactFacts: MetalDetailReadModel["unavailableExactFacts"],
  references: readonly unknown[]
):
  | (MetalDetailAttribution & { readonly totalGainDecimal: string | null })
  | null {
  const currencyInstrumentCode = toCurrencyInstrumentCode(
    input.asset.purchaseCurrency
  );
  if (
    currencyInstrumentCode === null ||
    unavailableExactFacts.includes("weight") ||
    unavailableExactFacts.includes("purity")
  ) {
    return null;
  }
  const decimalPlaces = resolveMetalsCurrencyMinorUnits(currencyInstrumentCode);
  if (decimalPlaces === null) return null;
  const pureGramsDecimal = toPureGramsDecimal(input);
  if (pureGramsDecimal === null) return null;
  const metalInstrumentCode = toMetalInstrumentCode(input.metal.metalType);
  const result = calculateUnrealizedAttribution({
    acquisitionCurrencyRate: findReference(references, {
      role: "acquisition_purchase_currency",
      instrumentCode: currencyInstrumentCode,
    }),
    acquisitionMetalRate: findReference(references, {
      role: "acquisition_metal",
      instrumentCode: metalInstrumentCode,
    }),
    metalInstrumentCode,
    purchaseCostDecimal: input.asset.purchasePriceDecimal,
    purchaseCurrencyDecimalPlaces: decimalPlaces,
    purchaseCurrencyInstrumentCode: currencyInstrumentCode,
    pureGramsDecimal,
    valuationCurrencyRate: findReference(references, {
      role: "current_purchase_currency",
      instrumentCode: currencyInstrumentCode,
    }),
    valuationMetalRate: findReference(references, {
      role: "current_metal",
      instrumentCode: metalInstrumentCode,
    }),
  });
  if (!result.available) return null;

  if (!result.value.breakdown.available) {
    return {
      breakdown: { available: false },
      currencyGainDecimal: null,
      metalGainDecimal: null,
      premiumAndCostsDecimal: null,
      totalGainDecimal: result.value.combinedDecimal,
    };
  }
  return {
    breakdown: { available: true },
    currencyGainDecimal:
      result.value.breakdown.value.components.currencyMovementDecimal,
    metalGainDecimal:
      result.value.breakdown.value.components.metalMovementDecimal,
    premiumAndCostsDecimal:
      result.value.breakdown.value.components.purchaseCostDecimal,
    totalGainDecimal: result.value.combinedDecimal,
  };
}

function toPureGramsDecimal(
  input: BuildMetalDetailReadModelInput
): string | null {
  const weight = input.metal.weightGramsDecimal;
  const purity = input.metal.purityFactorDecimal;
  if (weight === null || purity === null) return null;
  const result = calculatePureGrams({
    purityFactorDecimal: purity,
    weightGramsDecimal: weight,
  });
  return result.available ? result.valueDecimal : null;
}

function toCurrencyInstrumentCode(
  value: string | null
): CurrencyInstrumentCode | null {
  return value !== null && isSupportedMetalsIsoCurrencyCode(value)
    ? `currency:${value}`
    : null;
}

function toMetalInstrumentCode(
  metalType: "GOLD" | "SILVER"
): MetalInstrumentCode {
  return metalType === "GOLD" ? "metal:GOLD" : "metal:SILVER";
}

function findReference(
  references: readonly unknown[],
  expectation: RateReferenceExpectation
): NormalizedRateReference | null {
  const candidates = references.filter((candidate) =>
    isRateCandidate(candidate, expectation)
  );
  if (candidates.length !== 1) return null;
  const reference = candidates[0];
  const normalized = validateAndNormalizeRateReference(reference, expectation);
  return normalized.available ? normalized.value : null;
}

function isRateCandidate(
  candidate: unknown,
  expectation: RateReferenceExpectation
): candidate is Readonly<Record<string, unknown>> {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "role" in candidate &&
    candidate.role === expectation.role &&
    "instrumentCode" in candidate &&
    candidate.instrumentCode === expectation.instrumentCode
  );
}

function buildTimeline(
  acceptedEvents: readonly LifecycleEvent[],
  sourceEvents: readonly MetalDetailLifecycleEventInput[]
): readonly MetalDetailTimelineItem[] {
  const sourceById = new Map(sourceEvents.map((event) => [event.id, event]));
  return Object.freeze(
    orderLifecycleEventsNewestFirst(acceptedEvents)
      .map((accepted) => sourceById.get(accepted.id))
      .filter(
        (event): event is MetalDetailLifecycleEventInput =>
          event !== undefined && event.isHistoryVisible !== false
      )
      .map((event) =>
        Object.freeze({
          id: event.id,
          kind: event.kind,
          occurredAt: new Date(event.occurredAt.getTime()),
        })
      )
  );
}

function toDetailAssetInput(asset: Asset): MetalDetailAssetInput {
  return {
    id: asset.id,
    name: asset.name,
    purchaseCurrency: asset.purchaseCurrency,
    purchaseDate: copyValidDate(asset.purchaseDate),
    purchasePriceDecimal: asset.purchasePriceDecimal,
    userId: asset.userId,
  };
}

function toDetailMetalInput(
  metal: AssetMetal,
  metalType: "GOLD" | "SILVER"
): MetalDetailMetalInput {
  return {
    itemForm: metal.itemForm ?? null,
    metalType,
    purityCatalogVersion: metal.purityCatalogVersion,
    purityCode: metal.purityCode,
    purityFactorDecimal: metal.purityFactorDecimal,
    weightGramsDecimal: metal.weightGramsDecimal,
  };
}

function toDetailHoldingStateInput(
  state: MetalHoldingState
): MetalDetailHoldingStateInput {
  return {
    effectiveActionId: state.effectiveActionId,
    effectiveEventId: state.effectiveEventId,
    holdingId: state.holdingId,
    isVisible: state.isVisible,
    reconciliationState: state.reconciliationState,
    status: state.status,
    userId: state.userId,
  };
}

function toDetailLifecycleEventInput(
  event: MetalLifecycleEvent,
  evidence: readonly MetalActionEvidence[]
): MetalDetailLifecycleEventInput | null {
  if (!isSupportedLifecycleKind(event.kind)) return null;
  const hasBoundEvidence = evidence.some(
    (candidate) =>
      candidate.actionId === event.actionId &&
      candidate.holdingId === event.holdingId &&
      candidate.kind === event.kind &&
      candidate.userId === event.userId &&
      !candidate.deleted
  );
  return {
    actionState: event.isEffective
      ? hasBoundEvidence
        ? "accepted"
        : "unknown"
      : "rejected",
    id: event.id,
    isEffective: event.isEffective,
    isHistoryVisible: event.isHistoryVisible,
    kind: event.kind,
    occurredAt: copyValidDate(event.occurredAt) ?? new Date(Number.NaN),
    payloadJson: event.payloadJson,
    predecessorEventId: event.predecessorEventId,
    reversesEventId: event.reversesEventId,
  };
}

function toRateReferenceInput(
  reference: MetalRateReference
): Readonly<Record<string, unknown>> {
  return {
    capturedAt: reference.capturedAt.getTime(),
    capturedFreshness: reference.capturedFreshness,
    instrumentCode: reference.instrumentCode,
    kind: reference.kind,
    orientation: reference.orientation,
    providerObservedAt: reference.providerObservedAt?.getTime() ?? null,
    quality: reference.quality,
    role: reference.role,
    source: reference.source,
    unit: reference.unit,
    valueDecimal: reference.valueDecimal,
  };
}

function isSupportedMetalType(value: string): value is "GOLD" | "SILVER" {
  return value === "GOLD" || value === "SILVER";
}

function isSupportedLifecycleKind(
  value: string
): value is MetalDetailLifecycleEventInput["kind"] {
  return (
    value === "add" ||
    value === "correct" ||
    value === "sell" ||
    value === "dispose" ||
    value === "delete" ||
    value === "undo"
  );
}

function normalizePhysicalForm(
  value: string | null
): MetalDetailPhysicalForm | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === "bar" ||
    normalized === "coin" ||
    normalized === "jewelry"
    ? normalized
    : null;
}

function toRenderKey(
  metalType: "GOLD" | "SILVER",
  itemForm: MetalDetailPhysicalForm | null
): MetalDetailRenderKey | null {
  return itemForm === null
    ? null
    : `${metalType === "GOLD" ? "gold" : "silver"}:${itemForm}`;
}

function copyValidDate(value: Date | null): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? new Date(value.getTime())
    : null;
}

function assertRequestedUser(
  actualUserId: string,
  requestedUserId: string
): void {
  if (actualUserId !== requestedUserId) {
    throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
  }
}

function toBoundedPageSize(pageSize: number): number {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1)
    return METAL_DETAIL_PAGE_SIZE;
  return Math.min(pageSize, MAX_METAL_DETAIL_PAGE_SIZE);
}
