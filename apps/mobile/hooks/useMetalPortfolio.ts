import { useIsFocused } from "@react-navigation/native";
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
  type LiveRatesTrustObservationStream,
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
import { AppState } from "react-native";

import {
  resolveMetalPortfolioReadiness,
  type MetalPortfolioSectionReadiness,
} from "./metal-portfolio-readiness";
import { useMarketRates } from "./useMarketRates";
import { usePreferredCurrency } from "./usePreferredCurrency";
import { runUserScopedEffect, useCurrentUser } from "./useCurrentUser";

const RATE_STATUS_REFRESH_INTERVAL_MS = 60_000;

const PORTFOLIO_ASSET_OBSERVED_COLUMNS = [
  "name",
  "purchase_date",
  "purchase_price_decimal",
  "purchase_currency",
] as const;

const PORTFOLIO_ASSET_METAL_OBSERVED_COLUMNS = [
  "metal_type",
  "item_form",
  "purity_catalog_version",
  "purity_code",
  "purity_factor_decimal",
  "weight_grams_decimal",
] as const;

const PORTFOLIO_HOLDING_STATE_OBSERVED_COLUMNS = [
  "status",
  "effective_action_id",
  "effective_event_id",
  "is_visible",
  "reconciliation_state",
] as const;

type ActiveMetalType = "GOLD" | "SILVER";

interface UseMetalPortfolioResult {
  readonly error: Error | null;
  readonly isLoading: boolean;
  readonly isOffline: boolean;
  readonly isSummaryLoading: boolean;
  readonly onFilterChange: (filter: MetalPortfolioFilter) => void;
  readonly portfolio: MetalPortfolioReadModel | null;
  readonly rateProviderObservedAt: Date | null;
  readonly readiness: MetalPortfolioSectionReadiness;
  readonly recentHistory: MetalPortfolioReadModel["recentHistory"] | null;
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
  const isFocused = useIsFocused();
  const wasFocusedRef = useRef(isFocused);
  const { userId, isResolvingUser } = useCurrentUser();
  const { preferredCurrency, isLoading: isCurrencyLoading } =
    usePreferredCurrency();
  const { isConnected } = useMarketRates();
  const [selectedFilter, setSelectedFilter] =
    useState<MetalPortfolioFilter>("ALL");
  const [assets, setAssets] = useState<readonly Asset[]>([]);
  const assetsRef = useRef<readonly Asset[]>([]);
  const [assetsSnapshotUserId, setAssetsSnapshotUserId] = useState<string | null>(
    null
  );
  const [assetMetals, setAssetMetals] = useState<readonly AssetMetal[]>([]);
  const [assetMetalsDependencyKey, setAssetMetalsDependencyKey] = useState<
    string | null
  >(null);
  const [holdingStates, setHoldingStates] = useState<
    readonly MetalHoldingState[]
  >([]);
  const [holdingStatesSnapshotUserId, setHoldingStatesSnapshotUserId] = useState<
    string | null
  >(null);
  const [lifecycleEvents, setLifecycleEvents] = useState<
    readonly MetalLifecycleEvent[]
  >([]);
  const [historyDependencyKey, setHistoryDependencyKey] = useState<string | null>(
    null
  );
  const [currentRates, setCurrentRates] = useState<LiveRatesTrustReadModel>(
    createEmptyTrustReadModel
  );
  const [hasRateObservationSettled, setHasRateObservationSettled] =
    useState(false);
  const [isAssetsLoading, setIsAssetsLoading] = useState(true);
  const [isAssetMetalsLoading, setIsAssetMetalsLoading] = useState(true);
  const [isHoldingStatesLoading, setIsHoldingStatesLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isRatesLoading, setIsRatesLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const trustObservationRef = useRef<LiveRatesTrustObservationStream | null>(
    null
  );

  const onFilterChange = useCallback((filter: MetalPortfolioFilter): void => {
    setSelectedFilter(filter);
  }, []);

  const refresh = useCallback((): void => {
    setError(null);
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (isFocused && !wasFocusedRef.current) {
      setSelectedFilter("ALL");
    }
    wasFocusedRef.current = isFocused;
  }, [isFocused]);

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    const timer = setInterval(
      () => trustObservationRef.current?.refresh(),
      RATE_STATUS_REFRESH_INTERVAL_MS
    );
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") {
          trustObservationRef.current?.refresh();
        }
      }
    );
    return () => {
      clearInterval(timer);
      appStateSubscription.remove();
    };
  }, []);

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        assetsRef.current = [];
        setAssets([]);
        setAssetsSnapshotUserId(null);
        setIsAssetsLoading(true);
      },
      onSignedOut: () => {
        assetsRef.current = [];
        setAssets([]);
        setAssetsSnapshotUserId(null);
        setIsAssetsLoading(false);
      },
      onAuthenticated: (currentUserId) => {
        if (assetsSnapshotUserId !== currentUserId) {
          assetsRef.current = [];
          setAssets([]);
          setAssetsSnapshotUserId(null);
        }
        setIsAssetsLoading(true);
        const subscription = observePortfolioAssets(currentUserId)
          .observeWithColumns([...PORTFOLIO_ASSET_OBSERVED_COLUMNS])
          .subscribe({
            next: (result): void => {
              assetsRef.current = result;
              setAssets(result);
              setAssetsSnapshotUserId(currentUserId);
              setIsAssetsLoading(false);
            },
            error: (reason: unknown): void => {
              recordObserverError(
                "metalPortfolio.assets.observe.failed",
                reason,
                setError
              );
              setIsAssetsLoading(false);
            },
          });
        return () => subscription.unsubscribe();
      },
    });
  }, [assetsSnapshotUserId, refreshKey, isResolvingUser, userId]);

  const assetIdsKey = useMemo(
    (): string => assets.map((asset) => asset.id).sort().join(","),
    [assets]
  );

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        setAssetMetals([]);
        setAssetMetalsDependencyKey(null);
        setIsAssetMetalsLoading(true);
      },
      onSignedOut: () => {
        setAssetMetals([]);
        setAssetMetalsDependencyKey(null);
        setIsAssetMetalsLoading(false);
      },
      onAuthenticated: (currentUserId) => {
        const assetIds = new Set(assetIdsKey.split(",").filter(Boolean));
        const currentAssets = assetsRef.current.filter((asset) =>
          assetIds.has(asset.id)
        );
        const query = observePortfolioAssetMetals({
          assets: currentAssets,
          userId: currentUserId,
        });
        if (query === null) {
          setAssetMetals([]);
          setAssetMetalsDependencyKey(assetIdsKey);
          setIsAssetMetalsLoading(false);
          return;
        }
        setIsAssetMetalsLoading(true);
        const subscription = query
          .observeWithColumns([...PORTFOLIO_ASSET_METAL_OBSERVED_COLUMNS])
          .subscribe({
            next: (result): void => {
              setAssetMetals(result);
              setAssetMetalsDependencyKey(assetIdsKey);
              setIsAssetMetalsLoading(false);
            },
            error: (reason: unknown): void => {
              recordObserverError(
                "metalPortfolio.assetMetals.observe.failed",
                reason,
                setError
              );
              setIsAssetMetalsLoading(false);
            },
          });
        return () => subscription.unsubscribe();
      },
    });
  }, [assetIdsKey, isResolvingUser, refreshKey, userId]);

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        setHoldingStates([]);
        setHoldingStatesSnapshotUserId(null);
        setIsHoldingStatesLoading(true);
      },
      onSignedOut: () => {
        setHoldingStates([]);
        setHoldingStatesSnapshotUserId(null);
        setIsHoldingStatesLoading(false);
      },
      onAuthenticated: (currentUserId) => {
        if (holdingStatesSnapshotUserId !== currentUserId) {
          setHoldingStates([]);
          setHoldingStatesSnapshotUserId(null);
        }
        setIsHoldingStatesLoading(true);
        const subscription = observePortfolioHoldingStates(currentUserId)
          .observeWithColumns([...PORTFOLIO_HOLDING_STATE_OBSERVED_COLUMNS])
          .subscribe({
            next: (result): void => {
              setHoldingStates(result);
              setHoldingStatesSnapshotUserId(currentUserId);
              setIsHoldingStatesLoading(false);
            },
            error: (reason: unknown): void => {
              recordObserverError(
                "metalPortfolio.holdingStates.observe.failed",
                reason,
                setError
              );
              setIsHoldingStatesLoading(false);
            },
          });
        return () => subscription.unsubscribe();
      },
    });
  }, [holdingStatesSnapshotUserId, isResolvingUser, refreshKey, userId]);

  const holdingStatesKey = useMemo(
    () =>
      holdingStates
        .map(
          (state) =>
            `${state.holdingId}:${state.status}:${state.effectiveEventId ?? ""}:${state.effectiveActionId ?? ""}:${state.isVisible ? "1" : "0"}:${state.reconciliationState}`
        )
        .sort()
        .join(","),
    [holdingStates]
  );

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        setLifecycleEvents([]);
        setHistoryDependencyKey(null);
        setIsHistoryLoading(true);
      },
      onSignedOut: () => {
        setLifecycleEvents([]);
        setHistoryDependencyKey(null);
        setIsHistoryLoading(false);
      },
      onAuthenticated: (currentUserId) => {
        const query = observePortfolioRecentHistory({
          holdingStates,
          userId: currentUserId,
        });
        if (query === null) {
          setLifecycleEvents([]);
          setHistoryDependencyKey(holdingStatesKey);
          setIsHistoryLoading(false);
          return;
        }
        setIsHistoryLoading(true);
        const subscription = query.observe().subscribe({
          next: (result): void => {
            setLifecycleEvents(result);
            setHistoryDependencyKey(holdingStatesKey);
            setIsHistoryLoading(false);
          },
          error: (reason: unknown): void => {
            recordObserverError(
              "metalPortfolio.history.observe.failed",
              reason,
              setError
            );
            setIsHistoryLoading(false);
          },
        });
        return () => subscription.unsubscribe();
      },
    });
  }, [holdingStates, holdingStatesKey, isResolvingUser, refreshKey, userId]);

  useEffect(() => {
    const observation = observeLiveRatesTrust(database);
    trustObservationRef.current = observation;
    setIsRatesLoading(true);
    setHasRateObservationSettled(false);
    const subscription = observation.subscribe({
      next: (result): void => {
        setCurrentRates(result);
        setHasRateObservationSettled(true);
        setIsRatesLoading(false);
      },
      error: (reason: unknown): void => {
        recordObserverError(
          "metalPortfolio.rates.observe.failed",
          reason,
          setError
        );
        // A definitively failed rate read must still settle readiness so the
        // screen renders unavailable rate values instead of an indefinite
        // skeleton; the last known trust state stays as-is.
        setHasRateObservationSettled(true);
        setIsRatesLoading(false);
      },
    });
    return () => {
      if (trustObservationRef.current === observation) {
        trustObservationRef.current = null;
      }
      subscription.unsubscribe();
    };
  }, [database, refreshKey]);

  const readiness = useMemo(
    () =>
      resolveMetalPortfolioReadiness({
        assetIdsKey,
        assetMetalsDependencyKey,
        assetsReady: userId !== null && assetsSnapshotUserId === userId,
        currencyReady: !isCurrencyLoading,
        historyDependencyKey,
        holdingStatesKey,
        holdingStatesReady:
          userId !== null && holdingStatesSnapshotUserId === userId,
        ratesReady: hasRateObservationSettled,
      }),
    [
      assetIdsKey,
      assetMetalsDependencyKey,
      assetsSnapshotUserId,
      hasRateObservationSettled,
      historyDependencyKey,
      holdingStatesKey,
      holdingStatesSnapshotUserId,
      isCurrencyLoading,
      userId,
    ]
  );

  const portfolioShapedHoldings = useMemo(() => {
    if (userId === null || isResolvingUser || !readiness.holdings) {
      return null;
    }
    return shapeMetalPortfolioHoldings({
      assetMetals,
      assets,
      currentRates,
      holdingStates,
      lifecycleEvents,
      preferredCurrency,
      userId,
    });
  }, [
    assetMetals,
    assets,
    currentRates,
    holdingStates,
    isResolvingUser,
    lifecycleEvents,
    preferredCurrency,
    readiness.holdings,
    userId,
  ]);

  const historyShapedHoldings = useMemo(() => {
    if (userId === null || isResolvingUser || !readiness.recentHistory) {
      return null;
    }
    return shapeMetalPortfolioHoldings({
      assetMetals,
      assets,
      currentRates,
      holdingStates,
      lifecycleEvents,
      preferredCurrency,
      userId,
    });
  }, [
    assetMetals,
    assets,
    currentRates,
    holdingStates,
    isResolvingUser,
    lifecycleEvents,
    preferredCurrency,
    readiness.recentHistory,
    userId,
  ]);

  const recentHistory = useMemo<
    MetalPortfolioReadModel["recentHistory"] | null
  >(() => {
    if (userId === null || historyShapedHoldings === null) return null;
    return buildMetalPortfolioReadModel({
      filter: "ALL",
      holdings: historyShapedHoldings,
      rateStatus: { ageMs: null, state: "missing" },
      userId,
    }).recentHistory;
  }, [historyShapedHoldings, userId]);

  const portfolio = useMemo((): MetalPortfolioReadModel | null => {
    if (
      userId === null ||
      isResolvingUser ||
      !readiness.holdings ||
      portfolioShapedHoldings === null
    ) {
      return null;
    }
    const activeMetalTypes = Array.from(
      new Set(
        portfolioShapedHoldings
          .filter(
            (holding) =>
              holding.isEffective &&
              holding.isVisible &&
              holding.status === "active"
          )
          .map((holding) => holding.metalType)
      )
    ) as ActiveMetalType[];
    const activePurchaseCurrencies = Array.from(
      new Set(
        portfolioShapedHoldings
          .filter(
            (holding) =>
              holding.isEffective &&
              holding.isVisible &&
              holding.status === "active" &&
              holding.purchasePriceDecimal !== null &&
              holding.purchaseCurrency !== null
          )
          .flatMap((holding) =>
            holding.purchaseCurrency === null ? [] : [holding.purchaseCurrency]
          )
      )
    );
    return buildMetalPortfolioReadModel({
      filter: selectedFilter,
      holdings: portfolioShapedHoldings,
      rateStatus: getPortfolioRateStatus(
        currentRates,
        preferredCurrency,
        activeMetalTypes,
        activePurchaseCurrencies
      ),
      userId,
    });
  }, [
    currentRates,
    isResolvingUser,
    portfolioShapedHoldings,
    preferredCurrency,
    readiness.holdings,
    selectedFilter,
    userId,
  ]);

  const rateProviderObservedAt = useMemo(
    () =>
      readiness.rateCurrency
        ? getPortfolioProviderObservedAt(
            currentRates,
            portfolio?.activeHoldings ?? [],
            preferredCurrency
          )
        : null,
    [currentRates, portfolio, preferredCurrency, readiness.rateCurrency]
  );

  const wealthBreakdown = useMemo((): WealthBreakdownReadModel | null => {
    if (
      !readiness.summary ||
      portfolio === null ||
      input.accountsValueDecimal === undefined ||
      input.accountsValueDecimal === null
    ) {
      return null;
    }
    return buildWealthBreakdownReadModel({
      accountsValueDecimal: input.accountsValueDecimal,
      currency: preferredCurrency,
      holdings: portfolio.activeHoldings,
      preferredCurrencyUsdPerUnitDecimal:
        getTrustedRateDecimal(currentRates.currencies.get(preferredCurrency)) ??
        (preferredCurrency === "USD" ? "1" : null),
    });
  }, [
    currentRates,
    input.accountsValueDecimal,
    portfolio,
    preferredCurrency,
    readiness.summary,
  ]);

  const isAnySubscriptionLoading =
    isAssetsLoading ||
    isAssetMetalsLoading ||
    isHoldingStatesLoading ||
    isHistoryLoading ||
    isRatesLoading ||
    isCurrencyLoading;
  const hasAnyReadySection =
    readiness.summary || readiness.holdings || readiness.recentHistory;

  // The My Metals screen renders each section from `readiness`, so its
  // screen-level `isLoading` can settle as soon as any section is usable.
  // Dashboard net-worth and wealth-breakdown consumers have the opposite
  // requirement: they must keep their own skeletons until the wealth summary
  // (holdings + lifecycle events + rates + preferred currency) is ready, and a
  // pending rate or currency must never collapse the total into a dash. An
  // observer error stops the loading state so the consumer shows its
  // unavailable state instead of spinning forever.
  const isSummaryLoading =
    isResolvingUser ||
    (userId !== null && error === null && !readiness.summary);

  return {
    error,
    isLoading:
      isResolvingUser || (isAnySubscriptionLoading && !hasAnyReadySection),
    isOffline: !isConnected,
    isSummaryLoading,
    onFilterChange,
    portfolio,
    rateProviderObservedAt,
    readiness,
    recentHistory,
    refresh,
    selectedFilter,
    wealthBreakdown,
  };
}

function getTrustedRateDecimal(
  value: LiveRatesTrustReadModel["gold"] | undefined
): string | null {
  return value !== undefined &&
    value.state !== "missing" &&
    value.state !== "invalid" &&
    typeof value.valueDecimal === "string"
    ? value.valueDecimal
    : null;
}

function recordObserverError(
  event: string,
  reason: unknown,
  setError: (value: Error) => void
): void {
  logger.error(event, reason);
  setError(reason instanceof Error ? reason : new Error(String(reason)));
}

function getPortfolioRateValues(
  currentRates: LiveRatesTrustReadModel,
  preferredCurrency: string,
  activeMetalTypes: readonly ActiveMetalType[],
  activePurchaseCurrencies: readonly string[]
): readonly LiveRatesTrustReadModel["gold"][] {
  return [
    ...activeMetalTypes.map((metalType) =>
      metalType === "GOLD" ? currentRates.gold : currentRates.silver
    ),
    currentRates.currencies.get(preferredCurrency as never) ?? {
      state: "missing" as const,
      ageMs: null,
      providerObservedAt: null,
    },
    ...activePurchaseCurrencies
      .filter((currency) => currency !== preferredCurrency)
      .map(
        (currency) =>
          currentRates.currencies.get(currency as never) ?? {
            state: "missing" as const,
            ageMs: null,
            providerObservedAt: null,
          }
      ),
  ];
}

function getPortfolioRateStatus(
  currentRates: LiveRatesTrustReadModel,
  preferredCurrency: string,
  activeMetalTypes: readonly ActiveMetalType[],
  activePurchaseCurrencies: readonly string[]
): PortfolioRateStatus {
  const values = getPortfolioRateValues(
    currentRates,
    preferredCurrency,
    activeMetalTypes,
    activePurchaseCurrencies
  );
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

function getPortfolioProviderObservedAt(
  currentRates: LiveRatesTrustReadModel,
  activeHoldings: MetalPortfolioReadModel["activeHoldings"],
  preferredCurrency: string
): Date | null {
  if (activeHoldings.length === 0) return null;
  const activeMetalTypes = Array.from(
    new Set(activeHoldings.map((holding) => holding.metalType))
  ) as ActiveMetalType[];
  const activePurchaseCurrencies = Array.from(
    new Set(
      activeHoldings.flatMap((holding) =>
        holding.purchasePriceDecimal !== null &&
        holding.purchaseCurrency !== null
          ? [holding.purchaseCurrency]
          : []
      )
    )
  );
  const values = getPortfolioRateValues(
    currentRates,
    preferredCurrency,
    activeMetalTypes,
    activePurchaseCurrencies
  );
  // Mirror `conservativeObservedAt` in the detail read model: only report a
  // single "last updated" time when every consumed rate has a valid provider
  // timestamp. Otherwise the aggregate would claim an observation time that
  // does not cover an unknown/missing input, contradicting the rate state.
  const timestamps = values.flatMap((value) =>
    value.providerObservedAt === null ||
    !Number.isFinite(value.providerObservedAt.getTime())
      ? []
      : [value.providerObservedAt.getTime()]
  );
  return timestamps.length > 0 && timestamps.length === values.length
    ? new Date(Math.min(...timestamps))
    : null;
}

function toPortfolioRateState(
  state: LiveRatesTrustState
): PortfolioRateStatus["state"] {
  return state === "invalid" ? "missing" : state;
}
