import { useCallback, useEffect, useState } from "react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useMarketRates } from "@/hooks/useMarketRates";
import {
  readMetalHistoryReadModel,
  type MetalHistoryFilter,
  type MetalHistoryReadModel,
} from "@/services/metal-history-read-model-service";

interface UseMetalHistoryResult {
  readonly error: Error | null;
  readonly filter: MetalHistoryFilter;
  readonly history: MetalHistoryReadModel;
  readonly isLoading: boolean;
  readonly isOffline: boolean;
  readonly retry: () => void;
  readonly setFilter: (filter: MetalHistoryFilter) => void;
}
const EMPTY_HISTORY: MetalHistoryReadModel = Object.freeze({
  filter: "all",
  items: Object.freeze([]),
});

export function useMetalHistory(): UseMetalHistoryResult {
  const { userId, isResolvingUser } = useCurrentUser();
  const { isConnected } = useMarketRates();
  const [filter, setFilter] = useState<MetalHistoryFilter>("all");
  const [history, setHistory] = useState<MetalHistoryReadModel>(EMPTY_HISTORY);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryIndex, setRetryIndex] = useState(0);
  const retry = useCallback(
    (): void => setRetryIndex((value) => value + 1),
    []
  );
  useEffect(() => {
    let isCurrent = true;
    if (isResolvingUser) {
      setIsLoading(true);
      return () => {
        isCurrent = false;
      };
    }
    if (userId === null) {
      setHistory({ filter, items: [] });
      setError(null);
      setIsLoading(false);
      return () => {
        isCurrent = false;
      };
    }
    setIsLoading(true);
    setError(null);
    void readMetalHistoryReadModel({ filter, userId })
      .then((next) => {
        if (isCurrent) setHistory(next);
      })
      .catch((cause: unknown) => {
        if (isCurrent)
          setError(
            cause instanceof Error ? cause : new Error("History unavailable")
          );
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [filter, isResolvingUser, retryIndex, userId]);
  return {
    error,
    filter,
    history,
    isLoading,
    isOffline: !isConnected,
    retry,
    setFilter,
  };
}
