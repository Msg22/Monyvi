/**
 * useAssetBreakdown Hook
 * Reactive hook for asset breakdown data from WatermelonDB
 */

import { Asset, AssetMetal, database } from "@monyvi/db";
import {
  AssetBreakdownPercentage,
  calculateAssetBreakdown,
  calculateAssetBreakdownPercentages,
} from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";
import { useEffect, useMemo, useState } from "react";
import { logger } from "@/utils/logger";
import { useAccounts } from "./useAccounts";
import { useMarketRates } from "./useMarketRates";
import {
  queryChildrenOfOwnedParents,
  queryOwned,
} from "@/services/user-data-access";
import { runUserScopedEffect, useCurrentUser } from "./useCurrentUser";

interface UseAssetBreakdownResult {
  breakdown: AssetBreakdownPercentage[];
  isLoading: boolean;
}

/**
 * Hook to get asset breakdown (Bank, Cash, Metals) with percentages
 */
export function useAssetBreakdown(): UseAssetBreakdownResult {
  const { accounts, isLoading: accountsLoading } = useAccounts();
  const { latestRates, isLoading: ratesLoading } = useMarketRates();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetMetals, setAssetMetals] = useState<AssetMetal[]>([]);
  const [metalsLoading, setMetalsLoading] = useState(true);
  const { userId, isResolvingUser } = useCurrentUser();

  // Observe assets first, then subscribe to asset_metals for the active parent IDs.
  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        setAssets([]);
        setAssetMetals([]);
        setMetalsLoading(true);
      },
      onSignedOut: () => {
        setAssets([]);
        setAssetMetals([]);
        setMetalsLoading(false);
      },
      onAuthenticated: (currentUserId) => {
        setAssets([]);
        setAssetMetals([]);
        setMetalsLoading(true);

        const subscription = queryOwned(
          database.get<Asset>("assets"),
          currentUserId,
          Q.where("deleted", false)
        )
          .observe()
          .subscribe({
            next: (result) => {
              setAssets(result);
              if (result.length === 0) {
                setAssetMetals([]);
                setMetalsLoading(false);
              }
            },
            error: (err: unknown) => {
              logger.error("assetBreakdown.assets.observe.failed", err);
              setAssets([]);
              setAssetMetals([]);
              setMetalsLoading(false);
            },
          });

        return () => subscription.unsubscribe();
      },
    });
  }, [userId, isResolvingUser]);

  const assetIds = useMemo(
    (): string[] => assets.map((asset) => asset.id),
    [assets]
  );
  const assetIdsKey = useMemo((): string => assetIds.join(","), [assetIds]);

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        setAssetMetals([]);
        setMetalsLoading(true);
      },
      onSignedOut: () => {
        setAssetMetals([]);
        setMetalsLoading(false);
      },
      onAuthenticated: (currentUserId) => {
        const currentAssetIds =
          assetIdsKey.length > 0 ? assetIdsKey.split(",") : [];

        if (currentAssetIds.length === 0) {
          setAssetMetals([]);
          setMetalsLoading(false);
          return;
        }

        setAssetMetals([]);
        setMetalsLoading(true);

        const currentAssets = assets.filter((asset) =>
          currentAssetIds.includes(asset.id)
        );
        const query = queryChildrenOfOwnedParents(
          database.get<AssetMetal>("asset_metals"),
          currentAssets,
          currentUserId,
          "asset_id",
          Q.where("deleted", false)
        );

        const subscription = query.observe().subscribe({
          next: (result) => {
            setAssetMetals(result);
            setMetalsLoading(false);
          },
          error: (err: unknown) => {
            logger.error("assetBreakdown.assetMetals.observe.failed", err);
            setAssetMetals([]);
            setMetalsLoading(false);
          },
        });

        return () => subscription.unsubscribe();
      },
    });
  }, [assets, assetIdsKey, userId, isResolvingUser]);

  const breakdown = useMemo((): AssetBreakdownPercentage[] => {
    if (!latestRates) {
      return [];
    }
    const rawBreakdown = calculateAssetBreakdown(
      accounts,
      assetMetals,
      latestRates
    );
    return calculateAssetBreakdownPercentages(rawBreakdown);
  }, [accounts, assetMetals, latestRates]);

  const isLoading = accountsLoading || ratesLoading || metalsLoading;

  return { breakdown, isLoading };
}
