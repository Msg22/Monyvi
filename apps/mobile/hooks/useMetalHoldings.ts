/**
 * useMetalHoldings Hook
 *
 * Reactive hook that observes metal holdings from WatermelonDB.
 * Follows the useAssetBreakdown pattern for WatermelonDB observation.
 *
 * Architecture & Design Rationale:
 * - Pattern: Observer pattern via WatermelonDB's observe() + React state
 * - Why: Consistent with all existing hooks (useAssetBreakdown, useMarketRates).
 *   Data updates reactively when DB changes.
 * - SOLID: Open/Closed — hook returns processed data; components don't know
 *   about DB internals.
 *
 * @module useMetalHoldings
 */

import { Q } from "@nozbe/watermelondb";
import { useEffect, useMemo, useState } from "react";

import { Asset, AssetMetal, database } from "@monyvi/db";

import {
  type MetalHolding,
  type PortfolioSplit,
  type ProfitLoss,
  computePortfolioSplit,
  enrichHolding,
  groupAndSortHoldings,
  joinAssetsWithMetals,
  PERCENTAGE_MULTIPLIER,
  sumAvailableHoldingValues,
} from "../services/metal-holding-calculations";

import { useMarketRates } from "./useMarketRates";
import { usePreferredCurrency } from "./usePreferredCurrency";
import {
  queryChildrenOfOwnedParents,
  queryOwned,
} from "@/services/user-data-access";
import { logger } from "@/utils/logger";
import { useCurrentUser } from "./useCurrentUser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseMetalHoldingsResult {
  /** Gold holdings sorted by purchase date descending (newest first) */
  readonly goldHoldings: readonly MetalHolding[];
  /** Silver holdings sorted by purchase date descending (newest first) */
  readonly silverHoldings: readonly MetalHolding[];
  /** Total portfolio value in preferred currency */
  readonly totalValue: number | null;
  /** Total purchase price of all holdings in preferred currency */
  readonly totalPurchasePrice: number | null;
  /** Aggregate profit/loss for the entire portfolio */
  readonly profitLoss: ProfitLoss;
  /** Portfolio split between Gold and Silver */
  readonly portfolioSplit: PortfolioSplit;
  /** Whether the data is still loading */
  readonly isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Default values for empty/loading state
// ---------------------------------------------------------------------------

const EMPTY_HOLDINGS: readonly MetalHolding[] = [];

const EMPTY_SPLIT: PortfolioSplit = {
  gold: { totalValue: 0, percentage: 0, itemCount: 0 },
  silver: { totalValue: 0, percentage: 0, itemCount: 0 },
};

const ZERO_PROFIT_LOSS: ProfitLoss = { amount: 0, percent: 0 };

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Reactive hook for observing and computing metal holdings data.
 *
 * Observes both `assets` (type=METAL, deleted=false) and `asset_metals`
 * (deleted=false) from WatermelonDB, joining them and computing market
 * values, profit/loss, and portfolio split.
 */
export function useMetalHoldings(): UseMetalHoldingsResult {
  const { selectedSnapshot } = useMarketRates();
  const { preferredCurrency } = usePreferredCurrency();
  const { userId, isResolvingUser } = useCurrentUser();

  const [assets, setAssets] = useState<readonly Asset[]>([]);
  const [assetMetals, setAssetMetals] = useState<readonly AssetMetal[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Observe assets of type METAL
  useEffect(() => {
    if (isResolvingUser) {
      setAssets([]);
      setDataLoading(true);
      return;
    }

    if (!userId) {
      setAssets([]);
      setDataLoading(false);
      return;
    }

    const query = queryOwned(
      database.get<Asset>("assets"),
      userId,
      Q.where("type", "METAL"),
      Q.where("deleted", false)
    );

    const subscription = query.observe().subscribe({
      next: (result) => {
        setAssets(result);
      },
      error: (err: unknown) => {
        logger.error("metalHoldings.assets.observe.failed", err);
        setDataLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [userId, isResolvingUser]);

  // Observe asset_metals (deleted=false)
  useEffect(() => {
    if (isResolvingUser) {
      setAssetMetals([]);
      setDataLoading(true);
      return;
    }

    if (!userId) {
      setAssetMetals([]);
      setDataLoading(false);
      return;
    }

    const assetIds = assets.map((asset) => asset.id);
    if (assetIds.length === 0) {
      setAssetMetals([]);
      setDataLoading(false);
      return;
    }

    const query = queryChildrenOfOwnedParents(
      database.get<AssetMetal>("asset_metals"),
      assets,
      userId,
      "asset_id",
      Q.where("deleted", false)
    );

    const subscription = query.observe().subscribe({
      next: (result) => {
        setAssetMetals(result);
        setDataLoading(false);
      },
      error: (err: unknown) => {
        logger.error("metalHoldings.assetMetals.observe.failed", err);
        setDataLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [assets, userId, isResolvingUser]);

  // Compute enriched holdings when raw data or rates change
  const computedData = useMemo((): Omit<
    UseMetalHoldingsResult,
    "isLoading"
  > => {
    if (assets.length === 0) {
      return {
        goldHoldings: EMPTY_HOLDINGS,
        silverHoldings: EMPTY_HOLDINGS,
        totalValue: 0,
        totalPurchasePrice: 0,
        profitLoss: ZERO_PROFIT_LOSS,
        portfolioSplit: EMPTY_SPLIT,
      };
    }

    // 1. Join assets with their metals
    const rawHoldings = joinAssetsWithMetals(assets, assetMetals);

    // 2. Enrich with computed values
    const enriched = rawHoldings.map((raw) =>
      enrichHolding(raw, selectedSnapshot, preferredCurrency)
    );

    // 3. Group and sort (FR-024: newest first)
    const { gold, silver } = groupAndSortHoldings(enriched);

    // 4. Compute aggregates (using pre-computed purchasePriceInPref from enrichHolding)
    const totalValue = sumAvailableHoldingValues(enriched, "currentValue");
    const totalPurchasePrice = sumAvailableHoldingValues(
      enriched,
      "purchasePriceInPref"
    );

    const profitLossAmount =
      totalValue === null || totalPurchasePrice === null
        ? null
        : totalValue - totalPurchasePrice;
    const profitLossPercent =
      profitLossAmount === null || totalPurchasePrice === null
        ? null
        : totalPurchasePrice > 0
          ? (profitLossAmount / totalPurchasePrice) * PERCENTAGE_MULTIPLIER
          : 0;

    // 5. Portfolio split
    const portfolioSplit = computePortfolioSplit(gold, silver, totalValue);

    return {
      goldHoldings: gold,
      silverHoldings: silver,
      totalValue,
      totalPurchasePrice,
      profitLoss: { amount: profitLossAmount, percent: profitLossPercent },
      portfolioSplit,
    };
  }, [assets, assetMetals, selectedSnapshot, preferredCurrency]);

  return {
    ...computedData,
    isLoading: dataLoading,
  };
}

export type {
  MetalHolding,
  PortfolioSplit,
  ProfitLoss,
  UseMetalHoldingsResult,
};
