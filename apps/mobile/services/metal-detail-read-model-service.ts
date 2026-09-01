import {
  database,
  type Asset,
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
import { queryOwned } from "@/services/user-data-access";

export const METAL_DETAIL_PAGE_SIZE = 50;
const MAX_METAL_DETAIL_PAGE_SIZE = 100;

export interface MetalDetailAssetInput {
  readonly id: string;
  readonly name: string;
  readonly purchaseCurrency: string | null;
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
  readonly holdingState: MetalDetailHoldingStateInput;
  readonly lifecycleEvents: readonly MetalDetailLifecycleEventInput[];
  readonly metal: MetalDetailMetalInput;
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

export interface MetalDetailReadModel {
  readonly attribution: MetalDetailAttribution | null;
  readonly currentValueDecimal: string | null;
  readonly id: string;
  readonly isActiveOwnership: boolean;
  readonly isFinancialActionLocked: boolean;
  readonly itemForm: string | null;
  readonly metalType: "GOLD" | "SILVER";
  readonly name: string;
  readonly requiresCompleteMaterialCorrection: boolean;
  readonly status: "active" | "sold" | "disposed";
  readonly timeline: readonly MetalDetailTimelineItem[];
  readonly totalGainDecimal: string | null;
  readonly unavailableExactFacts: readonly (
    | "weight"
    | "purity"
    | "purchase_cost"
  )[];
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

export function buildMetalDetailReadModel(
  input: BuildMetalDetailReadModelInput
): MetalDetailReadModel | null {
  if (!isOwnedDetailInput(input)) return null;

  const reduced = reduceMetalLifecycle(
    input.lifecycleEvents.map(toReducerEvent)
  );
  const projection = reduced.projection;
  if (projection === null || !projection.isVisible || !input.holdingState.isVisible) {
    return null;
  }

  const unavailableExactFacts = getUnavailableExactFacts(input);
  const active = projection.status === "active";
  const references = input.rateReferences;
  const attribution = active
    ? buildActiveAttribution(input, unavailableExactFacts, references)
    : null;

  return Object.freeze({
    attribution,
    currentValueDecimal: active
      ? buildCurrentValue(input, unavailableExactFacts, references)
      : null,
    id: input.asset.id,
    isActiveOwnership: active,
    isFinancialActionLocked:
      input.holdingState.reconciliationState === "reconciliation_incomplete",
    itemForm: input.metal.itemForm,
    metalType: input.metal.metalType,
    name: input.asset.name,
    requiresCompleteMaterialCorrection: unavailableExactFacts.length > 0,
    status: projection.status,
    timeline: buildTimeline(reduced.acceptedEvents, input.lifecycleEvents),
    totalGainDecimal:
      attribution?.breakdown.available === true
        ? attribution.totalGainDecimal
        : null,
    unavailableExactFacts,
  });
}

function isOwnedDetailInput(input: BuildMetalDetailReadModelInput): boolean {
  return input.asset.userId === input.userId &&
    input.holdingState.userId === input.userId &&
    input.holdingState.holdingId === input.asset.id;
}

function toReducerEvent(
  event: MetalDetailLifecycleEventInput
): LifecycleEvent {
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
  const mappedKinds: Readonly<Record<MetalDetailLifecycleEventInput["kind"], LifecycleEvent["kind"]>> = {
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
  const unavailable: ("weight" | "purity" | "purchase_cost")[] = [];
  if (!isPositiveDecimal(input.metal.weightGramsDecimal)) unavailable.push("weight");
  if (!hasCompletePurityTuple(input.metal)) unavailable.push("purity");
  if (!isPositiveDecimal(input.asset.purchasePriceDecimal)) unavailable.push("purchase_cost");
  return Object.freeze(unavailable);
}

function hasCompletePurityTuple(input: MetalDetailMetalInput): boolean {
  return input.purityCatalogVersion !== null &&
    input.purityCode !== null &&
    isPositiveDecimal(input.purityFactorDecimal);
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
  if (unavailableExactFacts.includes("weight") || unavailableExactFacts.includes("purity")) {
    return null;
  }
  const currencyInstrumentCode = toCurrencyInstrumentCode(input.asset.purchaseCurrency);
  if (currencyInstrumentCode === null) return null;
  const metalReference = findReference(
    references,
    { role: "current_metal", instrumentCode: toMetalInstrumentCode(input.metal.metalType) }
  );
  const currencyReference = findReference(
    references,
    { role: "current_purchase_currency", instrumentCode: currencyInstrumentCode }
  );
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
): (MetalDetailAttribution & { readonly totalGainDecimal: string | null }) | null {
  const currencyInstrumentCode = toCurrencyInstrumentCode(input.asset.purchaseCurrency);
  if (currencyInstrumentCode === null || unavailableExactFacts.includes("weight") || unavailableExactFacts.includes("purity")) {
    return null;
  }
  const decimalPlaces = resolveMetalsCurrencyMinorUnits(currencyInstrumentCode);
  if (decimalPlaces === null) return null;
  const pureGramsDecimal = toPureGramsDecimal(input);
  if (pureGramsDecimal === null) return null;
  const metalInstrumentCode = toMetalInstrumentCode(input.metal.metalType);
  const result = calculateUnrealizedAttribution({
    acquisitionCurrencyRate: findReference(references, { role: "acquisition_purchase_currency", instrumentCode: currencyInstrumentCode }),
    acquisitionMetalRate: findReference(references, { role: "acquisition_metal", instrumentCode: metalInstrumentCode }),
    metalInstrumentCode,
    purchaseCostDecimal: input.asset.purchasePriceDecimal,
    purchaseCurrencyDecimalPlaces: decimalPlaces,
    purchaseCurrencyInstrumentCode: currencyInstrumentCode,
    pureGramsDecimal,
    valuationCurrencyRate: findReference(references, { role: "current_purchase_currency", instrumentCode: currencyInstrumentCode }),
    valuationMetalRate: findReference(references, { role: "current_metal", instrumentCode: metalInstrumentCode }),
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
    currencyGainDecimal: result.value.breakdown.value.components.currencyMovementDecimal,
    metalGainDecimal: result.value.breakdown.value.components.metalMovementDecimal,
    premiumAndCostsDecimal: result.value.breakdown.value.components.purchaseCostDecimal,
    totalGainDecimal: result.value.combinedDecimal,
  };
}

function toPureGramsDecimal(input: BuildMetalDetailReadModelInput): string | null {
  const weight = input.metal.weightGramsDecimal;
  const purity = input.metal.purityFactorDecimal;
  if (weight === null || purity === null) return null;
  const result = calculatePureGrams({
    purityFactorDecimal: purity,
    weightGramsDecimal: weight,
  });
  return result.available ? result.valueDecimal : null;
}

function toCurrencyInstrumentCode(value: string | null): CurrencyInstrumentCode | null {
  return value !== null && isSupportedMetalsIsoCurrencyCode(value)
    ? `currency:${value}`
    : null;
}

function toMetalInstrumentCode(metalType: "GOLD" | "SILVER"): MetalInstrumentCode {
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
  return typeof candidate === "object" && candidate !== null &&
    "role" in candidate && candidate.role === expectation.role &&
    "instrumentCode" in candidate && candidate.instrumentCode === expectation.instrumentCode;
}

function buildTimeline(
  acceptedEvents: readonly LifecycleEvent[],
  sourceEvents: readonly MetalDetailLifecycleEventInput[]
): readonly MetalDetailTimelineItem[] {
  const sourceById = new Map(sourceEvents.map((event) => [event.id, event]));
  return Object.freeze(
    orderLifecycleEventsNewestFirst(acceptedEvents)
      .map((accepted) => sourceById.get(accepted.id))
      .filter((event): event is MetalDetailLifecycleEventInput =>
        event !== undefined && event.isHistoryVisible !== false
      )
      .map((event) => Object.freeze({
        id: event.id,
        kind: event.kind,
        occurredAt: new Date(event.occurredAt.getTime()),
      }))
  );
}

function toBoundedPageSize(pageSize: number): number {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) return METAL_DETAIL_PAGE_SIZE;
  return Math.min(pageSize, MAX_METAL_DETAIL_PAGE_SIZE);
}
