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
  hasCanonicalDecimalPrecision,
  isSupportedMetalsIsoCurrencyCode,
  parseCanonicalDecimal,
  reduceMetalLifecycle,
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
} from "@monyvi/logic";
import { Q, type Query } from "@nozbe/watermelondb";
import {
  getCurrentUserDataScope,
  queryOwned,
  type CurrentUserDataScope,
  USER_DATA_ACCESS_ERROR_CODES,
} from "@/services/user-data-access";
import {
  summarizeLiveRatesTrust,
  type LiveRatesTrustReadModel,
  type LiveRatesTrustState,
  type LiveRatesTrustValue,
} from "@/services/live-rates-trust-read-model-service";
import {
  buildTimeline,
  copyValidDate,
  isSupportedMetalType,
  normalizePhysicalForm,
  toDetailAssetInput,
  toDetailHoldingStateInput,
  toDetailLifecycleEventInput,
  toDetailMetalInput,
  toRateReferenceInput,
  toRenderKey,
} from "@/services/metal-detail-read-model-shaping";

export interface MetalDetailAssetInput {
  readonly acquisitionActionId: string | null;
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
  readonly actionId?: string | null;
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
  readonly roundingDifferenceDecimal: string | null;
}

export interface MetalDetailRateStatus {
  readonly ageMs: number | null;
  readonly providerObservedAt: Date | null;
  readonly quality: string | null;
  readonly source: string | null;
  readonly state: LiveRatesTrustState;
}

export type MetalDetailPhysicalForm = "bar" | "coin" | "jewelry";
export type MetalDetailRenderKey =
  `${"gold" | "silver"}:${MetalDetailPhysicalForm}`;

export interface MetalDetailReadModel {
  readonly attribution: MetalDetailAttribution | null;
  readonly currentValueCurrency?: CurrencyType | null;
  readonly currentValueDecimal: string | null;
  readonly currentValueObservedAt?: Date | null;
  readonly currentValueRateStatus: MetalDetailRateStatus | null;
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
  readonly reconciliationState: string;
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
  readonly preferredCurrency?: CurrencyType;
  readonly userId: string;
}

type DetailRateExpectation = RateReferenceExpectation & {
  readonly actionId: string | null;
};

interface DetailCurrentValue {
  readonly currency: CurrencyType;
  readonly observedAt: Date | null;
  readonly valueDecimal: string;
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
  holdingId: string
): Query<MetalLifecycleEvent> {
  return queryOwned(
    database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
    userId,
    Q.where("holding_id", holdingId),
    Q.where("deleted", false),
    Q.sortBy("occurred_at", Q.desc)
  );
}

export function observeMetalDetailHoldingState(
  userId: string,
  holdingId: string
): Query<MetalHoldingState> {
  return queryOwned(
    database.get<MetalHoldingState>("metal_holding_states"),
    userId,
    Q.where("holding_id", holdingId),
    Q.where("deleted", false)
  );
}

export function observeMetalDetailRateReferences(
  userId: string,
  holdingId: string
): Query<MetalRateReference> {
  return queryOwned(
    database.get<MetalRateReference>("metal_rate_references"),
    userId,
    Q.where("holding_id", holdingId),
    Q.where("deleted", false),
    Q.sortBy("captured_at", Q.desc)
  );
}

export async function readMetalDetailReadModel(
  options: ReadMetalDetailReadModelOptions
): Promise<MetalDetailReadModel | null> {
  const scope = await getCurrentUserDataScope();
  assertRequestedUser(scope.userId, options.userId);
  const asset = await readOwnedDetailAsset(scope, options.holdingId);
  if (asset === null) return null;
  const dependencies = await readDetailDependencies(scope, asset);
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
  asset: Asset
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
    readDetailEvidenceAndEvents(scope, asset.id),
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
  holdingId: string
): Promise<
  Pick<MetalDetailDependencies, "evidence" | "events" | "rateReferences">
> {
  const [events, evidence, rateReferences] = await Promise.all([
    scope
      .queryOwned(
        database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
        Q.where("holding_id", holdingId),
        Q.where("deleted", false),
        Q.sortBy("occurred_at", Q.desc)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalActionEvidence>("metal_action_evidence"),
        Q.where("holding_id", holdingId),
        Q.where("deleted", false)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalRateReference>("metal_rate_references"),
        Q.where("holding_id", holdingId),
        Q.where("deleted", false),
        Q.sortBy("captured_at", Q.desc)
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
  const acquisitionActionId = input.asset.acquisitionActionId;
  const currentValue = active
    ? buildCurrentObservationValue(input, unavailableExactFacts)
    : null;
  const attribution = active
    ? buildActiveAttribution(
        input,
        unavailableExactFacts,
        references,
        acquisitionActionId
      )
    : null;
  const itemForm = normalizePhysicalForm(input.metal.itemForm);
  return Object.freeze({
    attribution,
    currentValueCurrency: currentValue?.currency ?? null,
    currentValueDecimal: currentValue?.valueDecimal ?? null,
    currentValueObservedAt: currentValue?.observedAt ?? null,
    currentValueRateStatus: active ? buildCurrentRateStatus(input) : null,
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
    reconciliationState: input.holdingState.reconciliationState,
    requiresCompleteMaterialCorrection: unavailableExactFacts.length > 0,
    renderKey: toRenderKey(input.metal.metalType, itemForm),
    status,
    timeline:
      projection === null
        ? []
        : buildTimeline(reduced.acceptedEvents, input.lifecycleEvents),
    totalGainDecimal: attribution?.totalGainDecimal ?? null,
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

function buildCurrentObservationValue(
  input: BuildMetalDetailReadModelInput,
  unavailableExactFacts: MetalDetailReadModel["unavailableExactFacts"]
): DetailCurrentValue | null {
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
  const currencyRateDecimal = readCurrentCurrencyRateDecimal(
    input.currentRates,
    input.preferredCurrency
  );
  if (!hasTrustedCurrentRate(metalRate) || currencyRateDecimal === null)
    return null;
  const value = calculateMetalReferenceValue({
    currencyUsdPerUnitDecimal: currencyRateDecimal,
    metalUsdPerPureGramDecimal: metalRate.valueDecimal,
    purityFactorDecimal: input.metal.purityFactorDecimal ?? "0",
    weightGramsDecimal: input.metal.weightGramsDecimal ?? "0",
  });
  if (!value.available) return null;
  return {
    currency: input.preferredCurrency,
    observedAt: resolveCurrentValueObservedAt(input),
    valueDecimal: value.valueDecimal,
  };
}

function buildCurrentRateStatus(
  input: BuildMetalDetailReadModelInput
): MetalDetailRateStatus {
  const values = getCurrentValueRates(input);
  const sources = new Set(
    values
      .map((value) => value.source ?? null)
      .filter((source): source is string => source !== null)
  );
  const qualities = new Set(
    values
      .map((value) => value.quality ?? null)
      .filter((quality): quality is string => quality !== null)
  );
  return {
    ageMs: values.reduce(
      (maximum, value) =>
        value.ageMs === null ? maximum : Math.max(maximum ?? 0, value.ageMs),
      null as number | null
    ),
    providerObservedAt: conservativeObservedAt(values),
    quality: qualities.size === 1 ? Array.from(qualities)[0] : null,
    source: sources.size === 1 ? Array.from(sources)[0] : null,
    state: summarizeLiveRatesTrust(values),
  };
}

function getCurrentValueRates(
  input: BuildMetalDetailReadModelInput
): readonly LiveRatesTrustValue[] {
  if (
    input.currentRates === undefined ||
    input.preferredCurrency === undefined ||
    !isSupportedMetalsIsoCurrencyCode(input.preferredCurrency)
  ) {
    return [];
  }
  const metal =
    input.metal.metalType === "GOLD"
      ? input.currentRates.gold
      : input.currentRates.silver;
  if (input.preferredCurrency === "USD") return [metal];
  const currency = input.currentRates.currencies.get(input.preferredCurrency);
  return currency === undefined ? [] : [metal, currency];
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

function conservativeObservedAt(
  rates: readonly LiveRatesTrustValue[]
): Date | null {
  const timestamps = rates.flatMap((rate) =>
    rate.providerObservedAt === null ? [] : [rate.providerObservedAt.getTime()]
  );
  return timestamps.length > 0 && timestamps.length === rates.length
    ? new Date(Math.min(...timestamps))
    : null;
}

function toReducerEvent(event: MetalDetailLifecycleEventInput): LifecycleEvent {
  return {
    canonicalCasStatus: event.actionState ?? "unknown",
    evidenceState:
      event.isEffective === false
        ? "ineffective"
        : event.actionState === "unknown"
          ? "incomplete"
          : "effective",
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
  if (!isValidWeight(input.metal.weightGramsDecimal))
    unavailable.push("weight");
  if (!hasCompletePurityTuple(input.metal)) unavailable.push("purity");
  if (
    !isValidPurchaseCost(
      input.asset.purchasePriceDecimal,
      input.asset.purchaseCurrency
    )
  )
    unavailable.push("purchase_cost");
  return Object.freeze(unavailable);
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
  const instrumentCode = toCurrencyInstrumentCode(currency);
  if (
    value === null ||
    instrumentCode === null ||
    !hasCanonicalDecimalPrecision(value)
  ) {
    return false;
  }
  const decimalPlaces = resolveMetalsCurrencyMinorUnits(instrumentCode);
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

function convertDetailValueForDisplay(
  valueDecimal: string,
  input: BuildMetalDetailReadModelInput
): { readonly currency: CurrencyType; readonly valueDecimal: string } | null {
  const purchaseCurrency = input.asset.purchaseCurrency;
  if (
    purchaseCurrency === null ||
    !isSupportedMetalsIsoCurrencyCode(purchaseCurrency)
  ) {
    return null;
  }
  const preferredCurrency = input.preferredCurrency ?? purchaseCurrency;
  if (!isSupportedMetalsIsoCurrencyCode(preferredCurrency)) return null;
  if (preferredCurrency === purchaseCurrency) {
    return { currency: preferredCurrency, valueDecimal };
  }

  const purchaseRateDecimal = readCurrentCurrencyRateDecimal(
    input.currentRates,
    purchaseCurrency
  );
  const preferredRateDecimal = readCurrentCurrencyRateDecimal(
    input.currentRates,
    preferredCurrency
  );
  if (purchaseRateDecimal === null || preferredRateDecimal === null)
    return null;

  try {
    return {
      currency: preferredCurrency,
      valueDecimal: serializeDecimal(
        parseCanonicalDecimal(valueDecimal)
          .times(purchaseRateDecimal)
          .dividedBy(preferredRateDecimal)
      ),
    };
  } catch {
    return null;
  }
}

function resolveCurrentValueObservedAt(
  input: BuildMetalDetailReadModelInput
): Date | null {
  return conservativeObservedAt(getCurrentValueRates(input));
}

function buildActiveAttribution(
  input: BuildMetalDetailReadModelInput,
  unavailableExactFacts: MetalDetailReadModel["unavailableExactFacts"],
  references: readonly unknown[],
  acquisitionActionId: string | null
):
  | (MetalDetailAttribution & { readonly totalGainDecimal: string | null })
  | null {
  const purchaseCurrency = input.asset.purchaseCurrency;
  const currencyInstrumentCode = toCurrencyInstrumentCode(purchaseCurrency);
  if (
    purchaseCurrency === null ||
    !isSupportedMetalsIsoCurrencyCode(purchaseCurrency) ||
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
      actionId: acquisitionActionId,
      role: "acquisition_purchase_currency",
      instrumentCode: currencyInstrumentCode,
    }),
    acquisitionMetalRate: findReference(references, {
      actionId: acquisitionActionId,
      role: "acquisition_metal",
      instrumentCode: metalInstrumentCode,
    }),
    metalInstrumentCode,
    purchaseCostDecimal: input.asset.purchasePriceDecimal,
    purchaseCurrencyDecimalPlaces: decimalPlaces,
    purchaseCurrencyInstrumentCode: currencyInstrumentCode,
    pureGramsDecimal,
    valuationCurrencyRate: buildCurrentReference(
      input.currentRates?.currencies.get(purchaseCurrency),
      {
        role: "current_purchase_currency",
        instrumentCode: currencyInstrumentCode,
      }
    ),
    valuationMetalRate: buildCurrentReference(
      input.metal.metalType === "GOLD"
        ? input.currentRates?.gold
        : input.currentRates?.silver,
      { role: "current_metal", instrumentCode: metalInstrumentCode }
    ),
  });
  if (!result.available) return null;

  const total = convertDetailValueForDisplay(
    result.value.combinedDecimal,
    input
  );
  if (total === null) return null;
  if (!result.value.breakdown.available) {
    return {
      breakdown: { available: false },
      currencyGainDecimal: null,
      metalGainDecimal: null,
      premiumAndCostsDecimal: null,
      roundingDifferenceDecimal: null,
      totalGainDecimal: total.valueDecimal,
    };
  }

  const components = result.value.breakdown.value.components;
  const currencyGain = convertDetailValueForDisplay(
    components.currencyMovementDecimal,
    input
  );
  const metalGain = convertDetailValueForDisplay(
    components.metalMovementDecimal,
    input
  );
  const premium = convertDetailValueForDisplay(
    components.purchaseCostDecimal,
    input
  );
  if (currencyGain === null || metalGain === null || premium === null) {
    return {
      breakdown: { available: false },
      currencyGainDecimal: null,
      metalGainDecimal: null,
      premiumAndCostsDecimal: null,
      roundingDifferenceDecimal: null,
      totalGainDecimal: total.valueDecimal,
    };
  }
  return {
    breakdown: { available: true },
    currencyGainDecimal: currencyGain.valueDecimal,
    metalGainDecimal: metalGain.valueDecimal,
    premiumAndCostsDecimal: premium.valueDecimal,
    roundingDifferenceDecimal: calculateRoundingDifference(
      total.valueDecimal,
      [currencyGain.valueDecimal, metalGain.valueDecimal, premium.valueDecimal],
      total.currency
    ),
    totalGainDecimal: total.valueDecimal,
  };
}

function buildCurrentReference(
  value: LiveRatesTrustValue | undefined,
  expectation: RateReferenceExpectation
): NormalizedRateReference | null {
  if (
    !hasTrustedCurrentRate(value) ||
    value.capturedAt === undefined ||
    value.capturedAt === null ||
    value.quality !== "valid" ||
    typeof value.source !== "string"
  ) {
    return null;
  }
  const isMetal = expectation.instrumentCode.startsWith("metal:");
  const normalized = validateAndNormalizeRateReference(
    {
      capturedAt: value.capturedAt.getTime(),
      instrumentCode: expectation.instrumentCode,
      kind: isMetal ? "metal" : "currency",
      orientation: "quote_per_base",
      providerObservedAt: value.providerObservedAt?.getTime() ?? null,
      quality: value.quality,
      role: expectation.role,
      source: value.source,
      unit: isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit",
      valueDecimal: value.valueDecimal,
    },
    expectation
  );
  return normalized.available ? normalized.value : null;
}

function readCurrentCurrencyRateDecimal(
  currentRates: LiveRatesTrustReadModel | undefined,
  currency: CurrencyType
): string | null {
  if (currency === "USD") return "1";
  const rate = currentRates?.currencies.get(currency);
  return hasTrustedCurrentRate(rate) ? rate.valueDecimal : null;
}

function calculateRoundingDifference(
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

function isRateCandidate(
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

function assertRequestedUser(
  actualUserId: string,
  requestedUserId: string
): void {
  if (actualUserId !== requestedUserId) {
    throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
  }
}
