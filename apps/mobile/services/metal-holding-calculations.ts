/**
 * Metal Holding Calculations
 *
 * Pure computation functions for metal holdings — enrichment, grouping,
 * sorting, and portfolio split. Extracted from the hook layer to comply
 * with Constitution IV (Service-Layer Separation): hooks handle lifecycle
 * only; business calculations live in the service/utility layer.
 *
 * Architecture & Design Rationale:
 * - Pattern: Pure Functions (Functional Core)
 * - Why: These functions are pure data transforms with no side-effects.
 *   Extracting them makes them testable, reusable, and keeps the hook thin.
 * - SOLID: SRP — each function does one thing (enrich, group, split).
 *
 * @module metal-holding-calculations
 */

import type { Asset, AssetMetal, CurrencyType } from "@monyvi/db";
import {
  convertSelectedCurrentAmount,
  getSelectedCurrentMetalPrice,
} from "@/services/current-market-snapshot-calculations";
import type { SelectedMarketRateSnapshot } from "@/services/market-rate-snapshot-read-model-service";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Multiplier to convert a ratio (0–1) to a percentage (0–100) */
const PERCENTAGE_MULTIPLIER = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw DB data before enrichment */
interface RawHolding {
  readonly asset: Asset;
  readonly assetMetal: AssetMetal;
}

/** A metal holding enriched with computed values for display */
interface MetalHolding {
  /** The parent Asset record */
  readonly asset: Asset;
  /** The child AssetMetal record */
  readonly assetMetal: AssetMetal;
  /** Current market value in user's preferred currency */
  readonly currentValue: number;
  /** Current market value in USD */
  readonly currentValueUsd: number;
  /** Purchase price converted to preferred currency */
  readonly purchasePriceInPref: number;
  /** Profit/loss as a percentage ((current - purchase) / purchase * 100) */
  readonly profitLossPercent: number;
  /** Absolute profit/loss amount in preferred currency */
  readonly profitLossAmount: number;
}

/** Summary for a single metal type */
interface MetalTypeSummary {
  readonly totalValue: number;
  readonly percentage: number;
  readonly itemCount: number;
}

/** Portfolio split between metal types */
interface PortfolioSplit {
  readonly gold: MetalTypeSummary;
  readonly silver: MetalTypeSummary;
}

/** Aggregate profit/loss for the entire portfolio */
interface ProfitLoss {
  /** Absolute profit/loss amount in preferred currency */
  readonly amount: number;
  /** Profit/loss as a percentage */
  readonly percent: number;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Joins assets with their corresponding asset_metals records.
 * Each asset is expected to have exactly one asset_metal child.
 */
function joinAssetsWithMetals(
  assets: readonly Asset[],
  assetMetals: readonly AssetMetal[]
): readonly RawHolding[] {
  const metalsByAssetId = new Map<string, AssetMetal>();

  for (const metal of assetMetals) {
    metalsByAssetId.set(metal.assetId, metal);
  }

  const holdings: RawHolding[] = [];

  for (const asset of assets) {
    const assetMetal = metalsByAssetId.get(asset.id);
    if (assetMetal) {
      holdings.push({ asset, assetMetal });
    }
  }

  return holdings;
}

/**
 * Enriches a raw holding with computed market values and profit/loss.
 */
function enrichHolding(
  raw: RawHolding,
  currentSnapshot: SelectedMarketRateSnapshot,
  preferredCurrency: CurrencyType
): MetalHolding | null {
  const pricePerGramUsd = getSelectedCurrentMetalPrice({
    metal: raw.assetMetal.metalType,
    toCurrency: "USD",
    currentSnapshot,
  });
  const pricePerGramPreferred = getSelectedCurrentMetalPrice({
    metal: raw.assetMetal.metalType,
    toCurrency: preferredCurrency,
    currentSnapshot,
  });
  const purchasePriceInPref = convertSelectedCurrentAmount({
    amount: raw.asset.purchasePrice,
    fromCurrency: raw.asset.currency,
    toCurrency: preferredCurrency,
    currentSnapshot,
  });
  if (
    pricePerGramUsd === null ||
    pricePerGramPreferred === null ||
    purchasePriceInPref === null
  ) {
    return null;
  }

  const currentValueUsd = raw.assetMetal.calculateValue(pricePerGramUsd);
  const currentValue = raw.assetMetal.calculateValue(pricePerGramPreferred);
  const profitLossAmount = currentValue - purchasePriceInPref;
  const profitLossPercent =
    purchasePriceInPref > 0
      ? (profitLossAmount / purchasePriceInPref) * PERCENTAGE_MULTIPLIER
      : 0;

  return {
    asset: raw.asset,
    assetMetal: raw.assetMetal,
    currentValue,
    currentValueUsd,
    purchasePriceInPref,
    profitLossPercent,
    profitLossAmount,
  };
}

/**
 * Sort comparator: newest purchase date first (descending).
 * FR-024: Holdings sorted by purchase date descending.
 */
function sortByPurchaseDateDesc(a: MetalHolding, b: MetalHolding): number {
  return b.asset.purchaseDate.getTime() - a.asset.purchaseDate.getTime();
}

/**
 * Group enriched holdings by metal type and sort by purchase date desc.
 */
function groupAndSortHoldings(holdings: readonly MetalHolding[]): {
  gold: MetalHolding[];
  silver: MetalHolding[];
} {
  const gold: MetalHolding[] = [];
  const silver: MetalHolding[] = [];

  for (const holding of holdings) {
    if (holding.assetMetal.metalType === "GOLD") {
      gold.push(holding);
    } else if (holding.assetMetal.metalType === "SILVER") {
      silver.push(holding);
    }
  }

  gold.sort(sortByPurchaseDateDesc);
  silver.sort(sortByPurchaseDateDesc);

  return { gold, silver };
}

/**
 * Compute portfolio split percentages.
 */
function computePortfolioSplit(
  goldHoldings: readonly MetalHolding[],
  silverHoldings: readonly MetalHolding[],
  totalValue: number
): PortfolioSplit {
  const goldTotal = goldHoldings.reduce((sum, h) => sum + h.currentValue, 0);
  const silverTotal = silverHoldings.reduce(
    (sum, h) => sum + h.currentValue,
    0
  );

  return {
    gold: {
      totalValue: goldTotal,
      percentage:
        totalValue > 0 ? (goldTotal / totalValue) * PERCENTAGE_MULTIPLIER : 0,
      itemCount: goldHoldings.length,
    },
    silver: {
      totalValue: silverTotal,
      percentage:
        totalValue > 0 ? (silverTotal / totalValue) * PERCENTAGE_MULTIPLIER : 0,
      itemCount: silverHoldings.length,
    },
  };
}

export {
  joinAssetsWithMetals,
  enrichHolding,
  groupAndSortHoldings,
  computePortfolioSplit,
  PERCENTAGE_MULTIPLIER,
};

export type {
  RawHolding,
  MetalHolding,
  MetalTypeSummary,
  PortfolioSplit,
  ProfitLoss,
};
