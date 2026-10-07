import type {
  Asset,
  AssetMetal,
  CurrencyType,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
  MetalRateReference,
} from "@monyvi/db";
import {
  calculatePureGrams,
  hasCanonicalDecimalPrecision,
  isSupportedMetalsIsoCurrencyCode,
  orderLifecycleEventsNewestFirst,
  parseCanonicalDecimal,
  resolveMetalsCurrencyMinorUnits,
  resolvePuritySelection,
  roundDecimal,
  serializeDecimal,
  validateAndNormalizeRateReference,
  type CurrencyInstrumentCode,
  type LifecycleEvent,
  type MetalInstrumentCode,
  type NormalizedRateReference,
  type RateReferenceExpectation,
  type SupportedMetal,
} from "@monyvi/logic";

import type {
  BuildMetalDetailReadModelInput,
  MetalDetailAssetInput,
  MetalDetailHoldingStateInput,
  MetalDetailLifecycleEventInput,
  MetalDetailMetalInput,
  MetalDetailPhysicalForm,
  MetalDetailReadModel,
  MetalDetailRenderKey,
  MetalDetailTimelineItem,
  MetalDetailCorrectionChange,
} from "@/services/metal-detail-read-model-service";
import type {
  LiveRatesTrustReadModel,
  LiveRatesTrustValue,
} from "@/services/live-rates-trust-read-model-service";

export type DetailRateExpectation = RateReferenceExpectation & {
  readonly actionId: string | null;
};

export function hasTrustedCurrentRate(
  rate: LiveRatesTrustValue | undefined
): rate is LiveRatesTrustValue & { readonly valueDecimal: string } {
  return (
    rate !== undefined &&
    rate.state !== "invalid" &&
    rate.state !== "missing" &&
    typeof rate.valueDecimal === "string"
  );
}

export interface MetalDetailAssetRecord {
  readonly acquisitionActionId: string | null;
  readonly id: string;
  readonly name: string;
  readonly notes: Asset["notes"];
  readonly purchaseCurrency: string | null;
  readonly purchaseDate: Date | null;
  readonly purchasePriceDecimal: string | null;
  readonly userId: string;
}

// Only the immutable payload of this accepted event can describe its past.
// Do not consult the current asset projection to fill missing evidence.
const CORRECTION_FACT_KEYS = [
  "weightGramsDecimal",
  "purityCode",
  "purityCatalogVersion",
  "purityFactorDecimal",
  "physicalForm",
  "purchasePriceDecimal",
  "purchaseCurrency",
  "purchaseDate",
] as const;

type CorrectionFactKey = (typeof CORRECTION_FACT_KEYS)[number];
type CorrectionFacts = Readonly<Record<CorrectionFactKey, string | null>>;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function correctionFacts(value: unknown): CorrectionFacts | null {
  const facts = record(value);
  if (
    !facts ||
    CORRECTION_FACT_KEYS.some(
      (key) =>
        !Object.prototype.hasOwnProperty.call(facts, key) ||
        (facts[key] !== null && typeof facts[key] !== "string")
    )
  ) {
    return null;
  }
  const result = facts as unknown as CorrectionFacts;
  // Legacy before facts may be null, but the recorded date is always required.
  if (
    result.purchaseDate === null ||
    result.purityCode === "" ||
    result.purchaseCurrency === ""
  ) {
    return null;
  }
  const metal = result.purityCode?.startsWith("gold-")
    ? "GOLD"
    : result.purityCode?.startsWith("silver-")
      ? "SILVER"
      : null;
  const missingPurity =
    result.purityCode === null &&
    result.purityCatalogVersion === null &&
    result.purityFactorDecimal === null;
  if (!missingPurity) {
    if (
      metal === null ||
      result.purityCatalogVersion !== "1" ||
      result.purityFactorDecimal === null
    ) {
      return null;
    }
    const purity = resolvePuritySelection(metal, result.purityCode as string);
    if (
      !purity.available ||
      purity.entry.factorDecimal !== result.purityFactorDecimal
    ) {
      return null;
    }
  }
  if (
    result.weightGramsDecimal !== null &&
    !isValidWeight(result.weightGramsDecimal)
  ) {
    return null;
  }
  if (
    result.purchasePriceDecimal !== null &&
    result.purchaseCurrency !== null &&
    !isValidPurchaseCost(result.purchasePriceDecimal, result.purchaseCurrency)
  ) {
    return null;
  }
  if (
    result.purchaseCurrency !== null &&
    !isSupportedMetalsIsoCurrencyCode(result.purchaseCurrency)
  ) {
    return null;
  }
  if (
    result.physicalForm !== null &&
    !["COIN", "BAR", "JEWELRY"].includes(result.physicalForm)
  ) {
    return null;
  }
  const purchaseDate = new Date(result.purchaseDate + "T00:00:00.000Z");
  if (
    !Number.isFinite(purchaseDate.getTime()) ||
    purchaseDate.toISOString().slice(0, 10) !== result.purchaseDate
  ) {
    return null;
  }
  return result;
}

export function correctionChangesFromPayload(
  payloadJson: string | undefined
): readonly MetalDetailCorrectionChange[] | null {
  if (!payloadJson) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  const material = record(record(parsed)?.materialCorrection);
  const before = correctionFacts(material?.before);
  const after = correctionFacts(material?.after);
  if (
    !before ||
    !after ||
    !isValidWeight(after.weightGramsDecimal) ||
    !isValidPurchaseCost(after.purchasePriceDecimal, after.purchaseCurrency) ||
    after.purityCode === null
  ) {
    return null;
  }
  const changes: MetalDetailCorrectionChange[] = [];
  const add = (
    field: MetalDetailCorrectionChange["field"],
    oldValue: string | null,
    newValue: string | null,
    currencies?: { before: string | null; after: string | null }
  ): void => {
    if (oldValue === newValue) return;
    changes.push(
      Object.freeze({
        field,
        before: oldValue,
        after: newValue,
        ...(currencies
          ? {
              beforeCurrency: currencies.before,
              afterCurrency: currencies.after,
            }
          : {}),
      })
    );
  };
  add("weight", before.weightGramsDecimal, after.weightGramsDecimal);
  if (
    before.purityCode !== after.purityCode ||
    before.purityCatalogVersion !== after.purityCatalogVersion ||
    before.purityFactorDecimal !== after.purityFactorDecimal
  ) {
    add("purity", before.purityCode, after.purityCode);
  }
  add("physicalForm", before.physicalForm, after.physicalForm);
  add(
    "purchasePrice",
    before.purchasePriceDecimal,
    after.purchasePriceDecimal,
    {
      before: before.purchaseCurrency,
      after: after.purchaseCurrency,
    }
  );
  add("purchaseCurrency", before.purchaseCurrency, after.purchaseCurrency);
  add("purchaseDate", before.purchaseDate, after.purchaseDate);
  return changes.length > 0 ? Object.freeze(changes) : null;
}

export function buildTimeline(
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
          ...(event.kind === "correct"
            ? {
                correctionChanges: correctionChangesFromPayload(
                  event.payloadJson
                ),
              }
            : {}),
        })
      )
  );
}

export function getUnavailableExactFacts(
  input: BuildMetalDetailReadModelInput
): MetalDetailReadModel["unavailableExactFacts"] {
  const unavailable: Array<"weight" | "purity" | "purchase_cost"> = [];
  if (!isValidWeight(input.metal.weightGramsDecimal)) {
    unavailable.push("weight");
  }
  if (!hasCompletePurityTuple(input.metal)) {
    unavailable.push("purity");
  }
  if (
    !isValidPurchaseCost(
      input.asset.purchasePriceDecimal,
      input.asset.purchaseCurrency
    )
  ) {
    unavailable.push("purchase_cost");
  }
  return Object.freeze(unavailable);
}

export function toDetailAssetInput(
  asset: MetalDetailAssetRecord
): MetalDetailAssetInput {
  return {
    acquisitionActionId: asset.acquisitionActionId,
    id: asset.id,
    name: asset.name,
    notes: asset.notes,
    purchaseCurrency: asset.purchaseCurrency,
    purchaseDate: copyValidDate(asset.purchaseDate),
    purchasePriceDecimal: asset.purchasePriceDecimal,
    userId: asset.userId,
  };
}

export function toDetailMetalInput(
  metal: AssetMetal,
  metalType: SupportedMetal
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

export function toDetailHoldingStateInput(
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

export function toDetailLifecycleEventInput(
  event: MetalLifecycleEvent,
  evidence: readonly MetalActionEvidence[]
): MetalDetailLifecycleEventInput | null {
  const isLegacyAdd =
    event.kind === "created" &&
    evidence.some(
      (candidate) =>
        candidate.actionId === event.actionId &&
        candidate.holdingId === event.holdingId &&
        candidate.userId === event.userId &&
        candidate.kind === "add" &&
        !candidate.deleted
    );
  const kind = isLegacyAdd ? "add" : event.kind;
  if (!isSupportedLifecycleKind(kind)) return null;
  const occurredAt = copyValidDate(event.occurredAt);
  if (occurredAt === null) return null;
  const hasBoundEvidence = evidence.some(
    (candidate) =>
      candidate.actionId === event.actionId &&
      candidate.holdingId === event.holdingId &&
      candidate.kind === kind &&
      candidate.userId === event.userId &&
      !candidate.deleted
  );
  return {
    actionId: event.actionId,
    actionState: event.isEffective
      ? hasBoundEvidence
        ? "accepted"
        : "unknown"
      : "rejected",
    id: event.id,
    isEffective: event.isEffective,
    isHistoryVisible: event.isHistoryVisible,
    kind,
    occurredAt,
    payloadJson: event.payloadJson,
    predecessorEventId: event.predecessorEventId,
    reversesEventId: event.reversesEventId,
  };
}

export function shapeMetalDetailLifecycleEvents(
  events: readonly MetalLifecycleEvent[],
  evidence: readonly MetalActionEvidence[]
): readonly MetalDetailLifecycleEventInput[] {
  const canonicalAddActionIds = new Set(
    events
      .filter((event) => event.id === event.actionId && event.kind === "add")
      .map((event) => event.actionId)
  );
  return Object.freeze(
    events
      .filter(
        (event) =>
          event.kind !== "created" || !canonicalAddActionIds.has(event.actionId)
      )
      .map((event) => toDetailLifecycleEventInput(event, evidence))
      .filter(
        (event): event is MetalDetailLifecycleEventInput => event !== null
      )
  );
}

export function selectCanonicalOrOnly<T extends { readonly id: string }>(
  records: readonly T[],
  canonicalId: string
): T | null {
  if (records.length === 1) return records[0];
  if (records.length !== 2) return null;
  return records.find((record) => record.id === canonicalId) ?? null;
}

export function toRateReferenceInput(
  reference: MetalRateReference
): Readonly<Record<string, unknown>> {
  return {
    actionId: reference.actionId,
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

export function normalizePhysicalForm(
  value: string | null
): MetalDetailPhysicalForm | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === "bar" ||
    normalized === "coin" ||
    normalized === "jewelry"
    ? normalized
    : null;
}

export function toRenderKey(
  metalType: SupportedMetal,
  itemForm: MetalDetailPhysicalForm | null
): MetalDetailRenderKey | null {
  return itemForm === null
    ? null
    : `${metalType === "GOLD" ? "gold" : "silver"}:${itemForm}`;
}

export function copyValidDate(value: Date | null): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? new Date(value.getTime())
    : null;
}

function hasCompletePurityTuple(input: MetalDetailMetalInput): boolean {
  if (
    input.purityCatalogVersion !== "1" ||
    input.purityCode === null ||
    input.purityFactorDecimal === null
  ) {
    return false;
  }
  const resolution = resolvePuritySelection(input.metalType, input.purityCode);
  return (
    resolution.available &&
    resolution.entry.factorDecimal === input.purityFactorDecimal
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

function isValidWeight(value: string | null): boolean {
  return (
    value !== null &&
    hasCanonicalDecimalPrecision(value) &&
    hasAtMostDecimalPlaces(value, 3) &&
    isPositiveDecimal(value)
  );
}

function isValidPurchaseCost(
  value: string | null,
  currency: string | null
): boolean {
  if (
    value === null ||
    !isSupportedMetalsIsoCurrencyCode(currency) ||
    !hasCanonicalDecimalPrecision(value)
  ) {
    return false;
  }
  const decimalPlaces = resolveMetalsCurrencyMinorUnits(`currency:${currency}`);
  return (
    decimalPlaces !== null &&
    hasAtMostDecimalPlaces(value, decimalPlaces) &&
    isPositiveDecimal(value)
  );
}

function hasAtMostDecimalPlaces(value: string, maximum: number): boolean {
  const fractional = value.split(".")[1];
  return fractional === undefined || fractional.length <= maximum;
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

export function readCurrentCurrencyRateDecimal(
  currentRates: LiveRatesTrustReadModel | undefined,
  currency: CurrencyType
): string | null {
  if (currency === "USD") return "1";
  const rate = currentRates?.currencies.get(currency);
  return hasTrustedCurrentRate(rate) ? rate.valueDecimal : null;
}

export function calculateRoundingDifference(
  total: string,
  components: readonly string[],
  currency: CurrencyType
): string | null {
  if (!isSupportedMetalsIsoCurrencyCode(currency)) return null;
  const decimalPlaces = resolveMetalsCurrencyMinorUnits(`currency:${currency}`);
  if (decimalPlaces === null) return null;
  try {
    const roundedTotal = parseCanonicalDecimal(
      roundDecimal(total, decimalPlaces)
    );
    const roundedComponents = components.reduce(
      (sum, value) =>
        sum.plus(parseCanonicalDecimal(roundDecimal(value, decimalPlaces))),
      parseCanonicalDecimal("0")
    );
    const difference = roundedTotal.minus(roundedComponents);
    return difference.isZero() ? null : serializeDecimal(difference);
  } catch {
    return null;
  }
}

export function toPureGramsDecimal(
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

export function toCurrencyInstrumentCode(
  value: string | null
): CurrencyInstrumentCode | null {
  return value !== null && isSupportedMetalsIsoCurrencyCode(value)
    ? `currency:${value}`
    : null;
}

export function toMetalInstrumentCode(
  metalType: SupportedMetal
): MetalInstrumentCode {
  return metalType === "GOLD" ? "metal:GOLD" : "metal:SILVER";
}

export function findReference(
  references: readonly unknown[],
  expectation: DetailRateExpectation
): NormalizedRateReference | null {
  const candidates = references.filter((candidate) =>
    isRateCandidate(candidate, expectation)
  );
  if (candidates.length !== 1) return null;
  const reference = candidates[0];
  const normalized = validateAndNormalizeRateReference(reference, expectation);
  return normalized.available ? normalized.value : null;
}

export function isRateCandidate(
  candidate: unknown,
  expectation: DetailRateExpectation
): candidate is Readonly<Record<string, unknown>> {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "role" in candidate &&
    candidate.role === expectation.role &&
    "instrumentCode" in candidate &&
    candidate.instrumentCode === expectation.instrumentCode &&
    "actionId" in candidate &&
    candidate.actionId === expectation.actionId
  );
}
