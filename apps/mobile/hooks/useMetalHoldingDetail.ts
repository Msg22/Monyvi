import { useCallback, useEffect, useState } from "react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useMarketRates } from "@/hooks/useMarketRates";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { useDatabase } from "@/providers/DatabaseProvider";
import {
  observeLiveRatesTrust,
  type LiveRatesTrustReadModel,
} from "@/services/live-rates-trust-read-model-service";
import {
  readMetalDetailReadModel,
  type MetalDetailReadModel,
} from "@/services/metal-detail-read-model-service";

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
  const { userId, isResolvingUser } = useCurrentUser();
  const { isConnected } = useMarketRates();
  const { preferredCurrency, isLoading: isCurrencyLoading } =
    usePreferredCurrency();
  const [model, setModel] = useState<MetalDetailReadModel | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryIndex, setRetryIndex] = useState(0);
  const [currentRates, setCurrentRates] = useState<LiveRatesTrustReadModel>(
    createEmptyTrustReadModel
  );
  const [isRatesLoading, setIsRatesLoading] = useState(true);
  const retry = useCallback(
    (): void => setRetryIndex((value) => value + 1),
    []
  );
  useEffect(() => {
    const subscription = observeLiveRatesTrust(database).subscribe({
      next: (rates): void => {
        setCurrentRates(rates);
        setIsRatesLoading(false);
      },
      error: (): void => {
        setCurrentRates(createEmptyTrustReadModel());
        setIsRatesLoading(false);
      },
    });
    return () => subscription.unsubscribe();
  }, [database]);
  useEffect(() => {
    let isCurrent = true;
    if (isResolvingUser || isCurrencyLoading || isRatesLoading) {
      setIsLoading(true);
      return () => {
        isCurrent = false;
      };
    }
    if (userId === null || holdingId === undefined) {
      setModel(null);
      setError(null);
      setIsLoading(false);
      return () => {
        isCurrent = false;
      };
    }
    setIsLoading(true);
    setError(null);
    void readMetalDetailReadModel({
      currentRates,
      holdingId,
      preferredCurrency,
      userId,
    })
      .then((next) => {
        if (isCurrent) setModel(next);
      })
      .catch((cause: unknown) => {
        if (isCurrent)
          setError(
            cause instanceof Error
              ? cause
              : new Error("Holding detail unavailable")
          );
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
    isRatesLoading,
    isResolvingUser,
    preferredCurrency,
    retryIndex,
    userId,
  ]);
  return { error, isLoading, isOffline: !isConnected, model, retry };
}
