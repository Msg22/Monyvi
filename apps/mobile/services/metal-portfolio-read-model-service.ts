import {
  database,
  type Asset,
  type AssetMetal,
  type CurrencyType,
  type MetalHoldingState,
  type MetalLifecycleEvent,
} from "@monyvi/db";
import {
  calculateMetalReferenceValue,
  hasCanonicalDecimalPrecision,
  isSupportedMetalsIsoCurrencyCode,
  parseCanonicalDecimal,
  resolveMetalsCurrencyMinorUnits,
  resolvePuritySelection,
  roundDecimal,
  serializeDecimal,
  type CurrencyInstrumentCode,
  type MetalsIsoCurrencyCode,
} from "@monyvi/logic";
import { Q, type Query } from "@nozbe/watermelondb";

import {
  queryChildrenOfOwnedParents,
  queryOwned,
} from "@/services/user-data-access";
import type {
  LiveRatesTrustReadModel,
  LiveRatesTrustValue,
} from "@/services/live-rates-trust-read-model-service";

const RECENT_HISTORY_LIMIT = 3;

export type MetalPortfolioFilter = "ALL" | "GOLD" | "SILVER";

export interface PortfolioRateStatus {
  readonly ageMs: number | null;
  readonly state: "fresh" | "stale" | "unknown" | "missing";
}

export interface MetalPortfolioHoldingInput {
  readonly currentPerformanceDecimal: string | null;
  readonly currentValueDecimal: string | null;
  readonly id: string;
  readonly isEffective: boolean;
  readonly isVisible: boolean;
  readonly metalType: "GOLD" | "SILVER";
  readonly name: string;
  readonly occurredAt: Date;
  readonly physicalForm: string | null;
  readonly purchaseCurrency: MetalsIsoCurrencyCode | null;
  readonly purchaseDate: Date | null;
  readonly purchasePriceDecimal: string | null;
  readonly purityCatalogVersion: "1" | null;
  readonly purityCode: string | null;
  readonly purityFactorDecimal: string | null;
  readonly soldResultDecimal: string | null;
  readonly status: "active" | "sold" | "disposed";
  readonly userId: string;
  readonly weightGramsDecimal: string | null;
}

export interface MetalPortfolioAssetSnapshot {
  readonly createdAt: Date;
  readonly id: string;
  readonly name: string;
  readonly purchaseCurrency: string | null;
  readonly purchaseDate: Date | null;
  readonly purchasePriceDecimal: string | null;
  readonly userId: string;
}

export interface MetalPortfolioAssetMetalSnapshot {
  readonly assetId: string;
  readonly deleted: boolean;
  readonly itemForm: string | null | undefined;
  readonly metalType: string;
  readonly purityCatalogVersion: string | null;
  readonly purityCode: string | null;
  readonly purityFactorDecimal: string | null;
  readonly weightGramsDecimal: string | null;
}

export interface MetalPortfolioHoldingStateSnapshot {
  readonly deleted: boolean;
  readonly effectiveEventId: string | null;
  readonly holdingId: string;
  readonly isVisible: boolean;
  readonly reconciliationState: string;
  readonly status: string;
  readonly userId: string;
}

export interface MetalPortfolioLifecycleEventSnapshot {
  readonly deleted: boolean;
  readonly holdingId: string;
  readonly id: string;
  readonly isEffective: boolean;
  readonly occurredAt: Date;
  readonly userId: string;
}

export interface ShapeMetalPortfolioHoldingsInput {
  readonly assetMetals: readonly MetalPortfolioAssetMetalSnapshot[];
  readonly assets: readonly MetalPortfolioAssetSnapshot[];
  readonly currentRates: LiveRatesTrustReadModel;
  readonly holdingStates: readonly MetalPortfolioHoldingStateSnapshot[];
  readonly lifecycleEvents: readonly MetalPortfolioLifecycleEventSnapshot[];
  readonly preferredCurrency: CurrencyType;
  readonly userId: string;
}

export interface BuildMetalPortfolioReadModelInput {
  readonly filter: MetalPortfolioFilter;
  readonly holdings: readonly MetalPortfolioHoldingInput[];
  readonly rateStatus: PortfolioRateStatus;
  readonly userId: string;
}

export interface MetalPortfolioAllocation {
  readonly gold: string | null;
  readonly silver: string | null;
}

export type MetalPortfolioListState =
  | "POPULATED"
  | "PORTFOLIO_EMPTY"
  | "FILTER_EMPTY";

export interface MetalPortfolioReadModel {
  readonly activeHoldings: readonly MetalPortfolioHoldingInput[];
  readonly activeTotalDecimal: string | null;
  readonly allocation: MetalPortfolioAllocation;
  readonly currentPerformanceDecimal: string | null;
  readonly filter: MetalPortfolioFilter;
  readonly hasTerminalHistory: boolean;
  readonly holdings: readonly MetalPortfolioHoldingInput[];
  readonly listState: MetalPortfolioListState;
  readonly rateStatus: PortfolioRateStatus;
  readonly recentHistory: readonly MetalPortfolioHoldingInput[];
  readonly soldResultDecimal: string | null;
}

export interface ObservePortfolioAssetMetalsInput {
  readonly assets: readonly Asset[];
  readonly userId: string;
}

export function observePortfolioAssets(userId: string): Query<Asset> {
  return queryOwned(
    database.get<Asset>("assets"),
    userId,
    Q.where("type", "METAL"),
    Q.where("deleted", false)
  );
}

export function observePortfolioAssetMetals(
  input: ObservePortfolioAssetMetalsInput
): Query<AssetMetal> | null {
  if (input.assets.length === 0) {
    return null;
  }

  return queryChildrenOfOwnedParents(
    database.get<AssetMetal>("asset_metals"),
    input.assets,
    input.userId,
    "asset_id",
    Q.where("deleted", false)
  );
}

export function observePortfolioHoldingStates(
  userId: string
): Query<MetalHoldingState> {
  return queryOwned(
    database.get<MetalHoldingState>("metal_holding_states"),
    userId,
    Q.where("deleted", false)
  );
}

export function observePortfolioRecentHistory(
  userId: string
): Query<MetalLifecycleEvent> {
  return queryOwned(
    database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
    userId,
    Q.where("deleted", false),
    Q.where("is_effective", true),
    Q.where("is_history_visible", true),
    Q.sortBy("occurred_at", Q.desc),
    Q.take(RECENT_HISTORY_LIMIT)
  );
}

export function shapeMetalPortfolioHoldings(
  input: ShapeMetalPortfolioHoldingsInput
): readonly MetalPortfolioHoldingInput[] {
  const metalsByAssetId = new Map(
    input.assetMetals
      .filter((metal) => !metal.deleted)
      .map((metal) => [metal.assetId, metal] as const)
  );
  const statesByHoldingId = new Map(
    input.holdingStates
      .filter((state) => state.userId === input.userId && !state.deleted)
      .map((state) => [state.holdingId, state] as const)
  );
  const eventsById = new Map(
    input.lifecycleEvents
      .filter((event) => event.userId === input.userId && !event.deleted)
      .map((event) => [event.id, event] as const)
  );

  return input.assets.flatMap((asset) => {
    if (asset.userId !== input.userId) {
      return [];
    }
    const metal = metalsByAssetId.get(asset.id);
    const state = statesByHoldingId.get(asset.id);
    if (!metal || !state || !isSupportedMetal(metal.metalType)) {
      return [];
    }
    const status = normalizeHoldingStatus(state.status);
    const createdAt = copyValidDate(asset.createdAt);
    if (status === null || createdAt === null) {
      return [];
    }

    const event = state.effectiveEventId
      ? eventsById.get(state.effectiveEventId)
      : undefined;
    const hasValidEventLink =
      state.effectiveEventId === null ||
      (event !== undefined &&
        event.holdingId === asset.id &&
        event.isEffective &&
        copyValidDate(event.occurredAt) !== null);
    const exactFacts = normalizeExactHoldingFacts(asset, metal);
    const values = calculateHoldingCardValues({
      currentRates: input.currentRates,
      facts: exactFacts,
      metalType: metal.metalType,
      preferredCurrency: input.preferredCurrency,
    });

    return [
      {
        currentPerformanceDecimal: values.currentPerformanceDecimal,
        currentValueDecimal: values.currentValueDecimal,
        id: asset.id,
        isEffective:
          hasValidEventLink &&
          isEffectiveReconciliationState(state.reconciliationState),
        isVisible: state.isVisible,
        metalType: metal.metalType,
        name: asset.name,
        occurredAt: event ? new Date(event.occurredAt.getTime()) : createdAt,
        physicalForm: normalizeOptionalText(metal.itemForm),
        purchaseCurrency: exactFacts.purchaseCurrency,
        purchaseDate: copyValidDate(asset.purchaseDate),
        purchasePriceDecimal: exactFacts.purchasePriceDecimal,
        purityCatalogVersion: exactFacts.purityCatalogVersion,
        purityCode: exactFacts.purityCode,
        purityFactorDecimal: exactFacts.purityFactorDecimal,
        soldResultDecimal: null,
        status,
        userId: asset.userId,
        weightGramsDecimal: exactFacts.weightGramsDecimal,
      },
    ];
  });
}

export function buildMetalPortfolioReadModel(
  input: BuildMetalPortfolioReadModelInput
): MetalPortfolioReadModel {
  const ownedHoldings = input.holdings.filter(
    (holding) => holding.userId === input.userId
  );
  const activeHoldings = ownedHoldings
    .filter(isEffectiveVisibleActiveHolding)
    .map(copyHolding)
    .sort(sortByOccurredAtDescending);
  const terminalHoldings = ownedHoldings
    .filter(isEffectiveVisibleTerminalHolding)
    .map(copyHolding)
    .sort(sortByOccurredAtDescending);
  const goldHoldings = activeHoldings.filter(
    (holding) => holding.metalType === "GOLD"
  );
  const silverHoldings = activeHoldings.filter(
    (holding) => holding.metalType === "SILVER"
  );
  const activeTotalDecimal = sumAvailableDecimals(
    activeHoldings.map((holding) => holding.currentValueDecimal),
    "0"
  );
  const goldTotalDecimal = sumAvailableDecimals(
    goldHoldings.map((holding) => holding.currentValueDecimal),
    "0"
  );
  const silverTotalDecimal = sumAvailableDecimals(
    silverHoldings.map((holding) => holding.currentValueDecimal),
    "0"
  );
  const selectedHoldings = selectHoldings(activeHoldings, input.filter);
  const soldHoldings = terminalHoldings.filter(
    (holding) => holding.status === "sold"
  );

  return {
    activeHoldings,
    activeTotalDecimal,
    allocation: {
      gold: calculateDisplayedShare(goldTotalDecimal, activeTotalDecimal),
      silver: calculateDisplayedShare(silverTotalDecimal, activeTotalDecimal),
    },
    currentPerformanceDecimal: sumAvailableDecimals(
      activeHoldings.map((holding) => holding.currentPerformanceDecimal),
      "0"
    ),
    filter: input.filter,
    hasTerminalHistory: terminalHoldings.length > 0,
    holdings: selectedHoldings,
    listState: determineListState(activeHoldings, selectedHoldings),
    rateStatus: { ...input.rateStatus },
    recentHistory: terminalHoldings.slice(0, RECENT_HISTORY_LIMIT),
    soldResultDecimal:
      soldHoldings.length === 0
        ? null
        : sumAvailableDecimals(
            soldHoldings.map((holding) => holding.soldResultDecimal),
            null
          ),
  };
}

export function selectPortfolioHoldings(
  model: MetalPortfolioReadModel,
  filter: MetalPortfolioFilter
): readonly MetalPortfolioHoldingInput[] {
  return selectHoldings(model.activeHoldings, filter);
}

function isEffectiveVisibleActiveHolding(
  holding: MetalPortfolioHoldingInput
): boolean {
  return (
    holding.isEffective && holding.isVisible && holding.status === "active"
  );
}

function isEffectiveVisibleTerminalHolding(
  holding: MetalPortfolioHoldingInput
): boolean {
  return (
    holding.isEffective &&
    holding.isVisible &&
    (holding.status === "sold" || holding.status === "disposed")
  );
}

function copyHolding(
  holding: MetalPortfolioHoldingInput
): MetalPortfolioHoldingInput {
  return {
    ...holding,
    occurredAt: new Date(holding.occurredAt.getTime()),
    purchaseDate:
      holding.purchaseDate === null
        ? null
        : new Date(holding.purchaseDate.getTime()),
  };
}

function sortByOccurredAtDescending(
  left: MetalPortfolioHoldingInput,
  right: MetalPortfolioHoldingInput
): number {
  return right.occurredAt.getTime() - left.occurredAt.getTime();
}

function selectHoldings(
  holdings: readonly MetalPortfolioHoldingInput[],
  filter: MetalPortfolioFilter
): readonly MetalPortfolioHoldingInput[] {
  if (filter === "ALL") {
    return holdings;
  }

  return holdings.filter((holding) => holding.metalType === filter);
}

function determineListState(
  activeHoldings: readonly MetalPortfolioHoldingInput[],
  selectedHoldings: readonly MetalPortfolioHoldingInput[]
): MetalPortfolioListState {
  if (activeHoldings.length === 0) {
    return "PORTFOLIO_EMPTY";
  }

  return selectedHoldings.length === 0 ? "FILTER_EMPTY" : "POPULATED";
}

interface ExactHoldingFacts {
  readonly purchaseCurrency: MetalsIsoCurrencyCode | null;
  readonly purchasePriceDecimal: string | null;
  readonly purityCatalogVersion: "1" | null;
  readonly purityCode: string | null;
  readonly purityFactorDecimal: string | null;
  readonly weightGramsDecimal: string | null;
}

interface HoldingCardValues {
  readonly currentPerformanceDecimal: string | null;
  readonly currentValueDecimal: string | null;
}

function normalizeExactHoldingFacts(
  asset: MetalPortfolioAssetSnapshot,
  metal: MetalPortfolioAssetMetalSnapshot
): ExactHoldingFacts {
  const purchaseCurrency = isSupportedMetalsIsoCurrencyCode(
    asset.purchaseCurrency
  )
    ? asset.purchaseCurrency
    : null;
  const purity = normalizePurityTuple(metal);

  return {
    purchaseCurrency,
    purchasePriceDecimal: normalizePurchasePrice(
      asset.purchasePriceDecimal,
      purchaseCurrency
    ),
    purityCatalogVersion: purity?.catalogVersion ?? null,
    purityCode: purity?.code ?? null,
    purityFactorDecimal: purity?.factorDecimal ?? null,
    weightGramsDecimal: normalizeWeight(metal.weightGramsDecimal),
  };
}

function normalizePurityTuple(metal: MetalPortfolioAssetMetalSnapshot): {
  readonly catalogVersion: "1";
  readonly code: string;
  readonly factorDecimal: string;
} | null {
  if (
    !isSupportedMetal(metal.metalType) ||
    metal.purityCatalogVersion !== "1" ||
    metal.purityCode === null ||
    metal.purityFactorDecimal === null
  ) {
    return null;
  }
  const resolution = resolvePuritySelection(metal.metalType, metal.purityCode);
  if (
    !resolution.available ||
    resolution.entry.factorDecimal !== metal.purityFactorDecimal
  ) {
    return null;
  }
  return {
    catalogVersion: "1",
    code: resolution.entry.code,
    factorDecimal: resolution.entry.factorDecimal,
  };
}

function normalizeWeight(value: string | null): string | null {
  if (value === null || !hasCanonicalDecimalPrecision(value)) {
    return null;
  }
  try {
    const weight = parseCanonicalDecimal(value);
    return weight.greaterThan("0") && hasAtMostDecimalPlaces(value, 3)
      ? serializeDecimal(weight)
      : null;
  } catch {
    return null;
  }
}

function normalizePurchasePrice(
  value: string | null,
  currency: MetalsIsoCurrencyCode | null
): string | null {
  if (
    value === null ||
    currency === null ||
    !hasCanonicalDecimalPrecision(value)
  ) {
    return null;
  }
  const decimalPlaces = resolveMetalsCurrencyMinorUnits(
    `currency:${currency}` as CurrencyInstrumentCode
  );
  if (decimalPlaces === null || !hasAtMostDecimalPlaces(value, decimalPlaces)) {
    return null;
  }
  try {
    const price = parseCanonicalDecimal(value);
    return price.greaterThan("0") ? serializeDecimal(price) : null;
  } catch {
    return null;
  }
}

function calculateHoldingCardValues(input: {
  readonly currentRates: LiveRatesTrustReadModel;
  readonly facts: ExactHoldingFacts;
  readonly metalType: "GOLD" | "SILVER";
  readonly preferredCurrency: CurrencyType;
}): HoldingCardValues {
  if (
    input.facts.weightGramsDecimal === null ||
    input.facts.purityFactorDecimal === null ||
    !isSupportedMetalsIsoCurrencyCode(input.preferredCurrency)
  ) {
    return unavailableHoldingCardValues();
  }
  const metalRate = readAvailableRate(
    input.metalType === "GOLD"
      ? input.currentRates.gold
      : input.currentRates.silver
  );
  const preferredRate = readAvailableRate(
    input.currentRates.currencies.get(input.preferredCurrency)
  );
  if (metalRate === null || preferredRate === null) {
    return unavailableHoldingCardValues();
  }
  const currentValue = calculateMetalReferenceValue({
    currencyUsdPerUnitDecimal: preferredRate,
    metalUsdPerPureGramDecimal: metalRate,
    purityFactorDecimal: input.facts.purityFactorDecimal,
    weightGramsDecimal: input.facts.weightGramsDecimal,
  });
  if (!currentValue.available) {
    return unavailableHoldingCardValues();
  }

  return {
    currentValueDecimal: currentValue.valueDecimal,
    currentPerformanceDecimal: calculateCurrentPerformance({
      currentRates: input.currentRates,
      currentValueDecimal: currentValue.valueDecimal,
      preferredCurrency: input.preferredCurrency,
      preferredRateDecimal: preferredRate,
      purchaseCurrency: input.facts.purchaseCurrency,
      purchasePriceDecimal: input.facts.purchasePriceDecimal,
    }),
  };
}

function calculateCurrentPerformance(input: {
  readonly currentRates: LiveRatesTrustReadModel;
  readonly currentValueDecimal: string;
  readonly preferredCurrency: MetalsIsoCurrencyCode;
  readonly preferredRateDecimal: string;
  readonly purchaseCurrency: MetalsIsoCurrencyCode | null;
  readonly purchasePriceDecimal: string | null;
}): string | null {
  if (input.purchaseCurrency === null || input.purchasePriceDecimal === null) {
    return null;
  }
  const purchaseRate =
    input.purchaseCurrency === input.preferredCurrency
      ? input.preferredRateDecimal
      : readAvailableRate(
          input.currentRates.currencies.get(input.purchaseCurrency)
        );
  if (purchaseRate === null) {
    return null;
  }
  try {
    const purchaseCostInPreferredCurrency = parseCanonicalDecimal(
      input.purchasePriceDecimal
    )
      .times(purchaseRate)
      .dividedBy(input.preferredRateDecimal);
    return serializeDecimal(
      parseCanonicalDecimal(input.currentValueDecimal).minus(
        purchaseCostInPreferredCurrency
      )
    );
  } catch {
    return null;
  }
}

function readAvailableRate(
  rate: LiveRatesTrustValue | undefined
): string | null {
  return rate !== undefined &&
    rate.state !== "invalid" &&
    rate.state !== "missing" &&
    typeof rate.valueDecimal === "string"
    ? rate.valueDecimal
    : null;
}

function unavailableHoldingCardValues(): HoldingCardValues {
  return { currentPerformanceDecimal: null, currentValueDecimal: null };
}

function normalizeOptionalText(
  value: string | null | undefined
): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function copyValidDate(value: Date | null): Date | null {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return null;
  }
  return new Date(value.getTime());
}

function isSupportedMetal(value: string): value is "GOLD" | "SILVER" {
  return value === "GOLD" || value === "SILVER";
}

function normalizeHoldingStatus(
  value: string
): "active" | "sold" | "disposed" | null {
  return value === "active" || value === "sold" || value === "disposed"
    ? value
    : null;
}

function isEffectiveReconciliationState(value: string): boolean {
  return (
    value === "local_complete" ||
    value === "sync_pending" ||
    value === "sync_failed" ||
    value === "accepted" ||
    value === "reconciled"
  );
}

function hasAtMostDecimalPlaces(value: string, maximum: number): boolean {
  const decimalPart = value.split(".")[1];
  return decimalPart === undefined || decimalPart.length <= maximum;
}

function sumAvailableDecimals(
  values: readonly (string | null)[],
  emptyValue: string | null
): string | null {
  if (values.length === 0) {
    return emptyValue;
  }

  let total = parseCanonicalDecimal("0");
  for (const value of values) {
    if (value === null) {
      return null;
    }

    try {
      total = total.plus(parseCanonicalDecimal(value));
    } catch {
      return null;
    }
  }

  return serializeDecimal(total);
}

function calculateDisplayedShare(
  amountDecimal: string | null,
  totalDecimal: string | null
): string | null {
  if (amountDecimal === null || totalDecimal === null) {
    return null;
  }

  const total = parseCanonicalDecimal(totalDecimal);
  if (total.isZero()) {
    return "0";
  }

  const share = parseCanonicalDecimal(amountDecimal)
    .times("100")
    .dividedBy(total);
  return serializeDecimal(parseCanonicalDecimal(roundDecimal(share, 1)));
}
