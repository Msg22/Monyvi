import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useMarketRates } from "@/hooks/useMarketRates";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { useDatabase } from "@/providers/DatabaseProvider";
import {
  observeLiveRatesTrust,
  type LiveRatesTrustReadModel,
} from "@/services/live-rates-trust-read-model-service";
import {
  observeMetalDetailEvents,
  observeMetalDetailHolding,
  observeMetalDetailHoldingState,
  observeMetalDetailRateReferences,
  readMetalDetailReadModel,
  type MetalDetailReadModel,
} from "@/services/metal-detail-read-model-service";
import { observeMetalDetailActionEvidence } from "@/services/metal-action-evidence-observer-service";
import { syncDatabase } from "@/services/sync";

interface UseMetalHoldingDetailResult {
  readonly error: Error | null;
  readonly isLoading: boolean;
  readonly isOffline: boolean;
  readonly model: MetalDetailReadModel | null;
  readonly retry: () => void;
}

function createEmptyTrustReadModel(): LiveRatesTrustReadModel {
  return {
    gold: { state: "missing", ageMs: null, providerObservedAt: null },
    silver: { state: "missing", ageMs: null, providerObservedAt: null },
    currencies: new Map(),
  };
}

export function useMetalHoldingDetail(
  holdingId: string | undefined
): UseMetalHoldingDetailResult {
  const database = useDatabase();
  const isFocused = useIsFocused();
  const { userId, isResolvingUser } = useCurrentUser();
  const { isConnected } = useMarketRates();
  const { preferredCurrency, isLoading: isCurrencyLoading } =
    usePreferredCurrency();
  const [model, setModel] = useState<MetalDetailReadModel | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryIndex, setRetryIndex] = useState(0);
  const [localRevision, setLocalRevision] = useState(0);
  const hasLoadedOnceRef = useRef(false);
  const [currentRates, setCurrentRates] = useState<LiveRatesTrustReadModel>(
    createEmptyTrustReadModel
  );
  const [isRatesLoading, setIsRatesLoading] = useState(true);
  const retry = useCallback((): void => {
    setRetryIndex((value) => value + 1);
    void syncDatabase(database).catch((cause: unknown) => {
      setError(
        cause instanceof Error ? cause : new Error("Holding sync unavailable")
      );
    });
  }, [database]);

  useEffect(() => {
    const subscription = observeLiveRatesTrust(database).subscribe({
      next: (rates): void => {
        setCurrentRates(rates);
        setIsRatesLoading(false);
      },
      error: (): void => {
        setIsRatesLoading(false);
      },
    });
    return () => subscription.unsubscribe();
  }, [database]);

  useEffect(() => {
    if (
      !isFocused ||
      isResolvingUser ||
      userId === null ||
      holdingId === undefined
    ) {
      return;
    }
    const onChange = (): void => setLocalRevision((value) => value + 1);
    const subscriptions = [
      observeMetalDetailHolding(userId, holdingId)
        .observe()
        .subscribe(onChange),
      observeMetalDetailHoldingState(userId, holdingId)
        .observe()
        .subscribe(onChange),
      observeMetalDetailEvents(userId, holdingId).observe().subscribe(onChange),
      observeMetalDetailActionEvidence(userId, holdingId)
        .observe()
        .subscribe(onChange),
      observeMetalDetailRateReferences(userId, holdingId)
        .observe()
        .subscribe(onChange),
    ];
    return () =>
      subscriptions.forEach((subscription) => subscription.unsubscribe());
  }, [holdingId, isFocused, isResolvingUser, userId]);

  useEffect(() => {
    let isCurrent = true;
    if (isResolvingUser) {
      hasLoadedOnceRef.current = false;
      setModel(null);
      setError(null);
      setIsLoading(isFocused);
      return () => {
        isCurrent = false;
      };
    }
    if (!isFocused || isCurrencyLoading || isRatesLoading) {
      setIsLoading(isFocused);
      return () => {
        isCurrent = false;
      };
    }
    if (userId === null || holdingId === undefined) {
      hasLoadedOnceRef.current = false;
      setModel(null);
      setError(null);
      setIsLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    setIsLoading(!hasLoadedOnceRef.current);
    setError(null);
    void readMetalDetailReadModel({
      currentRates,
      holdingId,
      preferredCurrency,
      userId,
    })
      .then((next) => {
        if (isCurrent) {
          hasLoadedOnceRef.current = true;
          setModel(next);
        }
      })
      .catch((cause: unknown) => {
        if (isCurrent) {
          setModel(null);
          setError(
            cause instanceof Error
              ? cause
              : new Error("Holding detail unavailable")
          );
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [
    currentRates,
    holdingId,
    isCurrencyLoading,
    isFocused,
    isRatesLoading,
    isResolvingUser,
    localRevision,
    preferredCurrency,
    retryIndex,
    userId,
  ]);

  return { error, isLoading, isOffline: !isConnected, model, retry };
}
