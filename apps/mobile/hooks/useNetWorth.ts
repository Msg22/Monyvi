/**
 * useNetWorth Hook
 * Local-first net worth calculation using WatermelonDB.
 */

import type {
  Account,
  Asset,
  AssetMetal,
  DailySnapshotNetWorth,
} from "@monyvi/db";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildMonthlyPercentageChange,
  buildNetWorthReadModel,
  observeNetWorthAccounts,
  observeNetWorthAssetMetals,
  observeNetWorthAssets,
  observeNetWorthSnapshots,
} from "@/services/net-worth-read-model-service";
import { logger } from "@/utils/logger";
import { useMarketRates } from "./useMarketRates";
import { usePreferredCurrency } from "./usePreferredCurrency";
import { runUserScopedEffect, useCurrentUser } from "./useCurrentUser";

interface UseNetWorthResult {
  readonly totalNetWorth: number | null;
  readonly totalNetWorthUsd: number | null;
  readonly totalAccounts: number | null;
  readonly totalAssets: number | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly refresh: () => void;
}

export function useNetWorth(): UseNetWorthResult {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const assetsRef = useRef<readonly Asset[]>([]);
  const [assetMetals, setAssetMetals] = useState<AssetMetal[]>([]);
  const [isAccountsLoading, setIsAccountsLoading] = useState(true);
  const [isAssetMetalsLoading, setIsAssetMetalsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { selectedSnapshot, isLoading: isRatesLoading } = useMarketRates();
  const { preferredCurrency } = usePreferredCurrency();
  const { userId, isResolvingUser } = useCurrentUser();

  const refresh = (): void => {
    setRefreshKey((prev) => prev + 1);
  };

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        setAccounts([]);
        setIsAccountsLoading(true);
      },
      onSignedOut: () => {
        setAccounts([]);
        setIsAccountsLoading(false);
      },
      onAuthenticated: (currentUserId) => {
        setIsAccountsLoading(true);

        const subscription = observeNetWorthAccounts(currentUserId)
          .observeWithColumns(["balance"])
          .subscribe({
            next: (result) => {
              setAccounts(result);
              setIsAccountsLoading(false);
            },
            error: (err: unknown) => {
              logger.error("netWorth.accounts.observe.failed", err);
              setError(err instanceof Error ? err : new Error(String(err)));
              setIsAccountsLoading(false);
            },
          });

        return () => subscription.unsubscribe();
      },
    });
  }, [refreshKey, userId, isResolvingUser]);

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        setAssets([]);
        setAssetMetals([]);
        setIsAssetMetalsLoading(true);
      },
      onSignedOut: () => {
        setAssets([]);
        setAssetMetals([]);
        setIsAssetMetalsLoading(false);
      },
      onAuthenticated: (currentUserId) => {
        setAssets([]);
        setAssetMetals([]);
        setIsAssetMetalsLoading(true);

        const subscription = observeNetWorthAssets(currentUserId)
          .observeWithColumns(["id"])
          .subscribe({
            next: (result) => {
              setAssets(result);
              if (result.length === 0) {
                setAssetMetals([]);
                setIsAssetMetalsLoading(false);
              }
            },
            error: (err: unknown) => {
              logger.error("netWorth.assets.observe.failed", err);
              setError(err instanceof Error ? err : new Error(String(err)));
              setAssets([]);
              setAssetMetals([]);
              setIsAssetMetalsLoading(false);
            },
          });

        return () => subscription.unsubscribe();
      },
    });
  }, [refreshKey, userId, isResolvingUser]);

  const assetIdsKey = useMemo(
    (): string => assets.map((asset) => asset.id).join(","),
    [assets]
  );

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        setAssetMetals([]);
        setIsAssetMetalsLoading(true);
      },
      onSignedOut: () => {
        setAssetMetals([]);
        setIsAssetMetalsLoading(false);
      },
      onAuthenticated: (currentUserId) => {
        const currentAssetIds =
          assetIdsKey.length > 0 ? assetIdsKey.split(",") : [];
        const currentAssets = assetsRef.current.filter((asset) =>
          currentAssetIds.includes(asset.id)
        );
        const query = observeNetWorthAssetMetals({
          userId: currentUserId,
          assets: currentAssets,
        });

        if (!query) {
          setAssetMetals([]);
          setIsAssetMetalsLoading(false);
          return;
        }

        setAssetMetals([]);
        setIsAssetMetalsLoading(true);

        const subscription = query.observe().subscribe({
          next: (result) => {
            setAssetMetals(result);
            setIsAssetMetalsLoading(false);
          },
          error: (err: unknown) => {
            logger.error("netWorth.assetMetals.observe.failed", err);
            setError(err instanceof Error ? err : new Error(String(err)));
            setAssetMetals([]);
            setIsAssetMetalsLoading(false);
          },
        });

        return () => subscription.unsubscribe();
      },
    });
  }, [assetIdsKey, userId, isResolvingUser]);

  const netWorthData = useMemo(
    () =>
      isResolvingUser ||
      isAccountsLoading ||
      isAssetMetalsLoading ||
      isRatesLoading
        ? null
        : buildNetWorthReadModel({
            accounts,
            assetMetals,
            currentSnapshot: selectedSnapshot,
            preferredCurrency,
          }),
    [
      accounts,
      assetMetals,
      selectedSnapshot,
      preferredCurrency,
      isResolvingUser,
      isAccountsLoading,
      isAssetMetalsLoading,
      isRatesLoading,
    ]
  );

  return {
    totalNetWorth: netWorthData?.totalNetWorth ?? null,
    totalNetWorthUsd: netWorthData?.totalNetWorthUsd ?? null,
    totalAccounts: netWorthData?.totalAccounts ?? null,
    totalAssets: netWorthData?.totalAssets ?? null,
    isLoading:
      isResolvingUser ||
      isAccountsLoading ||
      isAssetMetalsLoading ||
      isRatesLoading,
    error,
    refresh,
  };
}

export function useMonthlyPercentageChange(): {
  monthlyPercentageChange: number | null;
  isLoading: boolean;
} {
  const [monthlyPercentageChange, setMonthlyPercentageChange] = useState<
    number | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const { userId, isResolvingUser } = useCurrentUser();

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        setMonthlyPercentageChange(null);
        setIsLoading(true);
      },
      onSignedOut: () => {
        setMonthlyPercentageChange(null);
        setIsLoading(false);
      },
      onAuthenticated: (currentUserId) => {
        const subscription = observeNetWorthSnapshots(currentUserId)
          .observe()
          .subscribe({
            next: (snapshots: DailySnapshotNetWorth[]) => {
              setMonthlyPercentageChange(
                buildMonthlyPercentageChange(snapshots)
              );
              setIsLoading(false);
            },
            error: (err: unknown) => {
              logger.error("netWorth.snapshots.observe.failed", err);
              setIsLoading(false);
            },
          });

        return () => subscription.unsubscribe();
      },
    });
  }, [userId, isResolvingUser]);

  return {
    monthlyPercentageChange,
    isLoading,
  };
}
