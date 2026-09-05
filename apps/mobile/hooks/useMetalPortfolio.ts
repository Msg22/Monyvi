import { useDatabase } from "@/providers/DatabaseProvider";
import {
  buildWealthBreakdownReadModel,
  type WealthBreakdownReadModel,
} from "@/services/net-worth-read-model-service";
import {
  buildMetalPortfolioReadModel,
  observePortfolioAssetMetals,
  observePortfolioAssets,
  observePortfolioHoldingStates,
  observePortfolioRecentHistory,
  shapeMetalPortfolioHoldings,
  type MetalPortfolioFilter,
  type MetalPortfolioReadModel,
  type PortfolioRateStatus,
} from "@/services/metal-portfolio-read-model-service";
import {
  observeLiveRatesTrust,
  summarizeLiveRatesTrust,
  type LiveRatesTrustReadModel,
  type LiveRatesTrustState,
} from "@/services/live-rates-trust-read-model-service";
import { logger } from "@/utils/logger";
import type {
  Asset,
  AssetMetal,
  MetalHoldingState,
  MetalLifecycleEvent,
} from "@monyvi/db";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMarketRates } from "./useMarketRates";
import { usePreferredCurrency } from "./usePreferredCurrency";
import { runUserScopedEffect, useCurrentUser } from "./useCurrentUser";

interface UseMetalPortfolioResult {
  readonly error: Error | null;
  readonly isLoading: boolean;
  readonly isOffline: boolean;
  readonly onFilterChange: (filter: MetalPortfolioFilter) => void;
  readonly portfolio: MetalPortfolioReadModel | null;
  readonly refresh: () => void;
  readonly selectedFilter: MetalPortfolioFilter;
  readonly wealthBreakdown: WealthBreakdownReadModel | null;
}

function createEmptyTrustReadModel(): LiveRatesTrustReadModel {
  return {
    gold: { state: "missing", ageMs: null, providerObservedAt: null },
    silver: { state: "missing", ageMs: null, providerObservedAt: null },
    currencies: new Map(),
  };
}

export function useMetalPortfolio(
  input: {
    readonly accountsValueDecimal?: string | null;
  } = {}
): UseMetalPortfolioResult {
  const database = useDatabase();
  const { userId, isResolvingUser } = useCurrentUser();
  const { preferredCurrency, isLoading: isCurrencyLoading } =
    usePreferredCurrency();
  const { isConnected } = useMarketRates();
  const [selectedFilter, setSelectedFilter] =
    useState<MetalPortfolioFilter>("ALL");
  const [assets, setAssets] = useState<readonly Asset[]>([]);
  const assetsRef = useRef<readonly Asset[]>([]);
  const [assetMetals, setAssetMetals] = useState<readonly AssetMetal[]>([]);
  const [holdingStates, setHoldingStates] = useState<
    readonly MetalHoldingState[]
  >([]);
  const [lifecycleEvents, setLifecycleEvents] = useState<
    readonly MetalLifecycleEvent[]
  >([]);
  const [currentRates, setCurrentRates] = useState<LiveRatesTrustReadModel>(
    createEmptyTrustReadModel
  );
  const [isAssetsLoading, setIsAssetsLoading] = useState(true);
  const [isAssetMetalsLoading, setIsAssetMetalsLoading] = useState(true);
  const [isHoldingStatesLoading, setIsHoldingStatesLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isRatesLoading, setIsRatesLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const onFilterChange = useCallback((filter: MetalPortfolioFilter): void => {
    setSelectedFilter(filter);
  }, []);

  const refresh = useCallback((): void => {
    setError(null);
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => resetAssets(setAssets, setIsAssetsLoading),
      onSignedOut: () => {
        setAssets([]);
        setIsAssetsLoading(false);
      },
      onAuthenticated: (currentUserId) => {
        setIsAssetsLoading(true);
        const subscription = observePortfolioAssets(currentUserId)
          .observe()
          .subscribe({
            next: (result): void => {
              setAssets(result);
              setIsAssetsLoading(false);
            },
            error: (reason: unknown): void => {
              recordObserverError(
                "metalPortfolio.assets.observe.failed",
                reason,
                setError
              );
              setAssets([]);
              setIsAssetsLoading(false);
            },
          });
        return () => subscription.unsubscribe();
      },
    });
  }, [refreshKey, isResolvingUser, userId]);

  const assetIdsKey = useMemo(
    (): string => assets.map((asset) => asset.id).join(","),
    [assets]
  );

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
        const currentAssets = assetsRef.current.filter((asset) =>
          assetIdsKey.split(",").includes(asset.id)
        );
        const query = observePortfolioAssetMetals({
          assets: currentAssets,
          userId: currentUserId,
        });
        if (query === null) {
          setAssetMetals([]);
          setIsAssetMetalsLoading(false);
          return;
        }
        setAssetMetals([]);
        setIsAssetMetalsLoading(true);
        const subscription = query.observe().subscribe({
          next: (result): void => {
            setAssetMetals(result);
            setIsAssetMetalsLoading(false);
          },
          error: (reason: unknown): void => {
            recordObserverError(
              "metalPortfolio.assetMetals.observe.failed",
              reason,
              setError
            );
            setAssetMetals([]);
            setIsAssetMetalsLoading(false);
          },
        });
        return () => subscription.unsubscribe();
      },
    });
  }, [assetIdsKey, isResolvingUser, refreshKey, userId]);

  useEffect(() => {
    return subscribeForCurrentUser({
      isResolvingUser,
      onAuthenticated: (currentUserId) =>
        observePortfolioHoldingStates(currentUserId).observe(),
      onError: (reason) =>
        recordObserverError(
          "metalPortfolio.holdingStates.observe.failed",
          reason,
          setError
        ),
      onNext: setHoldingStates,
      onSignedOut: () => setHoldingStates([]),
      onResolving: () => setHoldingStates([]),
      setLoading: setIsHoldingStatesLoading,
      userId,
    });
  }, [isResolvingUser, refreshKey, userId]);

  useEffect(() => {
    return subscribeForCurrentUser({
      isResolvingUser,
      onAuthenticated: (currentUserId) =>
        observePortfolioRecentHistory(currentUserId).observe(),
      onError: (reason) =>
        recordObserverError(
          "metalPortfolio.history.observe.failed",
          reason,
          setError
        ),
      onNext: setLifecycleEvents,
      onSignedOut: () => setLifecycleEvents([]),
      onResolving: () => setLifecycleEvents([]),
      setLoading: setIsHistoryLoading,
      userId,
    });
  }, [isResolvingUser, refreshKey, userId]);

  useEffect(() => {
    const observation = observeLiveRatesTrust(database);
    setIsRatesLoading(true);
    const subscription = observation.subscribe({
      next: (result): void => {
        setCurrentRates(result);
        setIsRatesLoading(false);
      },
      error: (reason: unknown): void => {
        recordObserverError(
          "metalPortfolio.rates.observe.failed",
          reason,
          setError
        );
        setCurrentRates(createEmptyTrustReadModel());
        setIsRatesLoading(false);
      },
    });
    return () => subscription.unsubscribe();
  }, [database, refreshKey]);

  const portfolio = useMemo((): MetalPortfolioReadModel | null => {
    if (
      userId === null ||
      isResolvingUser ||
      isAssetsLoading ||
      isAssetMetalsLoading ||
      isHoldingStatesLoading ||
      isHistoryLoading ||
      isRatesLoading ||
      isCurrencyLoading
    ) {
      return null;
    }
    const holdings = shapeMetalPortfolioHoldings({
      assetMetals,
      assets,
      currentRates,
      holdingStates,
      lifecycleEvents,
      preferredCurrency,
      userId,
    });
    return buildMetalPortfolioReadModel({
      filter: selectedFilter,
      holdings,
      rateStatus: getPortfolioRateStatus(currentRates, preferredCurrency),
      userId,
    });
  }, [
    assetMetals,
    assets,
    currentRates,
    holdingStates,
    isAssetMetalsLoading,
    isAssetsLoading,
    isCurrencyLoading,
    isHistoryLoading,
    isHoldingStatesLoading,
    isRatesLoading,
    isResolvingUser,
    lifecycleEvents,
    preferredCurrency,
    selectedFilter,
    userId,
  ]);

  const wealthBreakdown = useMemo((): WealthBreakdownReadModel | null => {
    if (portfolio === null || input.accountsValueDecimal === undefined) {
      return null;
    }
    return buildWealthBreakdownReadModel({
      accountsValueDecimal: input.accountsValueDecimal ?? "0",
      currency: preferredCurrency,
      holdings: portfolio.activeHoldings,
    });
  }, [input.accountsValueDecimal, portfolio, preferredCurrency]);

  return {
    error,
    isLoading:
      isResolvingUser ||
      isAssetsLoading ||
      isAssetMetalsLoading ||
      isHoldingStatesLoading ||
      isHistoryLoading ||
      isRatesLoading ||
      isCurrencyLoading,
    isOffline: !isConnected,
    onFilterChange,
    portfolio,
    refresh,
    selectedFilter,
    wealthBreakdown,
  };
}

function resetAssets(
  setAssets: (value: readonly Asset[]) => void,
  setIsLoading: (value: boolean) => void
): void {
  setAssets([]);
  setIsLoading(true);
}

function recordObserverError(
  event: string,
  reason: unknown,
  setError: (value: Error) => void
): void {
  logger.error(event, reason);
  setError(reason instanceof Error ? reason : new Error(String(reason)));
}

function subscribeForCurrentUser<T>({
  isResolvingUser,
  onAuthenticated,
  onError,
  onNext,
  onSignedOut,
  onResolving,
  setLoading,
  userId,
}: {
  readonly isResolvingUser: boolean;
  readonly onAuthenticated: (userId: string) => {
    readonly subscribe: (observer: {
      readonly error: (reason: unknown) => void;
      readonly next: (value: readonly T[]) => void;
    }) => { readonly unsubscribe: () => void };
  };
  readonly onError: (reason: unknown) => void;
  readonly onNext: (value: readonly T[]) => void;
  readonly onSignedOut: () => void;
  readonly onResolving: () => void;
  readonly setLoading: (value: boolean) => void;
  readonly userId: string | null;
}): void | (() => void) {
  return runUserScopedEffect({
    userId,
    isResolvingUser,
    onResolving: () => {
      onResolving();
      setLoading(true);
    },
    onSignedOut: () => {
      onSignedOut();
      setLoading(false);
    },
    onAuthenticated: (currentUserId) => {
      setLoading(true);
      const subscription = onAuthenticated(currentUserId).subscribe({
        next: (result): void => {
          onNext(result);
          setLoading(false);
        },
        error: (reason: unknown): void => {
          onError(reason);
          setLoading(false);
        },
      });
      return () => subscription.unsubscribe();
    },
  });
}

function getPortfolioRateStatus(
  currentRates: LiveRatesTrustReadModel,
  preferredCurrency: string
): PortfolioRateStatus {
  const values = [
    currentRates.gold,
    currentRates.silver,
    currentRates.currencies.get(preferredCurrency as never) ?? {
      state: "missing" as const,
      ageMs: null,
      providerObservedAt: null,
    },
  ];
  const state = summarizeLiveRatesTrust(values);
  return {
    ageMs: values.reduce(
      (maximum, value) =>
        value.ageMs === null ? maximum : Math.max(maximum ?? 0, value.ageMs),
      null as number | null
    ),
    state: toPortfolioRateState(state),
  };
}

function toPortfolioRateState(
  state: LiveRatesTrustState
): PortfolioRateStatus["state"] {
  return state === "invalid" ? "missing" : state;
}
