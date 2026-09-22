/**
 * Local-first net worth from the same effective ownership projection as Home.
 */
import type { Account, DailySnapshotNetWorth } from "@monyvi/db";
import { useEffect, useMemo, useState } from "react";
import {
  type NetWorthReadModel,
  buildMonthlyPercentageChange,
  buildNetWorthReadModel,
  observeNetWorthAccounts,
  observeNetWorthSnapshots,
} from "@/services/net-worth-read-model-service";
import { logger } from "@/utils/logger";
import { useMarketRates } from "./useMarketRates";
import { useMetalPortfolio } from "./useMetalPortfolio";
import { usePreferredCurrency } from "./usePreferredCurrency";
import { runUserScopedEffect, useCurrentUser } from "./useCurrentUser";

interface UseNetWorthResult {
  readonly totalNetWorth: number | null;
  readonly totalNetWorthUsd: number | null;
  readonly totalAccounts: number | null;
  readonly totalAccountsDecimal:
    | NetWorthReadModel["totalAccountsDecimal"]
    | null;
  readonly totalAssets: number | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly refresh: () => void;
}

export function useNetWorth(): UseNetWorthResult {
  const { userId, isResolvingUser } = useCurrentUser();
  const [accountState, setAccountState] = useState<{
    readonly userId: string | null;
    readonly rows: readonly Account[];
  }>({ userId: null, rows: [] });
  const [isAccountsLoading, setIsAccountsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { selectedSnapshot, isCurrentLoading } = useMarketRates();
  const { preferredCurrency } = usePreferredCurrency();

  useEffect((): (() => void) | void => {
    setError(null);
    setAccountState({ userId: null, rows: [] });
    if (isResolvingUser || userId === null) {
      setIsAccountsLoading(isResolvingUser);
      return;
    }
    setIsAccountsLoading(true);
    let isActive = true;
    const subscription = observeNetWorthAccounts(userId)
      .observeWithColumns(["balance", "currency"])
      .subscribe({
        next: (rows): void => {
          if (!isActive) return;
          setAccountState({ userId, rows });
          setIsAccountsLoading(false);
          setError(null);
        },
        error: (cause: unknown): void => {
          if (!isActive) return;
          const failure =
            cause instanceof Error ? cause : new Error(String(cause));
          logger.error("netWorth.accounts.observe.failed", failure);
          setError(failure);
          setIsAccountsLoading(false);
        },
      });
    return (): void => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [userId, isResolvingUser, refreshKey]);

  const hasCurrentAccounts =
    userId !== null && !isResolvingUser && accountState.userId === userId;
  // Metal contributions come exclusively from the lifecycle-validated projection.
  const accountModel = useMemo(
    (): NetWorthReadModel | null =>
      hasCurrentAccounts && !isAccountsLoading && !error
        ? buildNetWorthReadModel({
            accounts: accountState.rows,
            assetMetals: [],
            currentSnapshot: selectedSnapshot,
            preferredCurrency,
          })
        : null,
    [
      hasCurrentAccounts,
      isAccountsLoading,
      error,
      accountState,
      selectedSnapshot,
      preferredCurrency,
    ]
  );
  const {
    wealthBreakdown,
    isSummaryLoading,
    error: portfolioError,
    refresh: refreshPortfolio,
  } = useMetalPortfolio({
    accountsValueDecimal: accountModel?.totalAccountsDecimal ?? null,
  });
  const canShowTotals = accountModel !== null && error === null;
  const refresh = (): void => {
    setRefreshKey((value) => value + 1);
    refreshPortfolio();
  };
  return {
    totalNetWorth: canShowTotals
      ? displayNumber(wealthBreakdown?.totalNetWorthDecimal)
      : null,
    totalNetWorthUsd: canShowTotals
      ? displayNumber(wealthBreakdown?.totalNetWorthUsdDecimal)
      : null,
    totalAccounts: accountModel?.totalAccounts ?? null,
    totalAccountsDecimal: accountModel?.totalAccountsDecimal ?? null,
    totalAssets: canShowTotals
      ? displayNumber(wealthBreakdown?.metals.amountDecimal)
      : null,
    isLoading:
      isResolvingUser ||
      (userId !== null &&
        (isAccountsLoading || isSummaryLoading || isCurrentLoading)),
    error: error ?? portfolioError,
    refresh,
  };
}

function displayNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
