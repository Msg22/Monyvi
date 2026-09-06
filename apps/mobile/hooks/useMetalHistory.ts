import { useIsFocused } from "@react-navigation/native";
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

const EMPTY_COUNTS = Object.freeze({ all: 0, sold: 0, disposed: 0 });
const EMPTY_HISTORY: MetalHistoryReadModel = Object.freeze({
  counts: EMPTY_COUNTS,
  filter: "all",
  items: Object.freeze([]),
});

function emptyHistory(filter: MetalHistoryFilter): MetalHistoryReadModel {
  return { counts: EMPTY_COUNTS, filter, items: [] };
}

export function useMetalHistory(): UseMetalHistoryResult {
  const isFocused = useIsFocused();
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
      setHistory(emptyHistory(filter));
      setError(null);
      setIsLoading(isFocused);
      return () => {
        isCurrent = false;
      };
    }
    if (!isFocused) {
      setIsLoading(false);
      return () => {
        isCurrent = false;
      };
    }
    if (userId === null) {
      setHistory(emptyHistory(filter));
      setError(null);
      setIsLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    setHistory(emptyHistory(filter));
    setIsLoading(true);
    setError(null);
    void readMetalHistoryReadModel({ filter, userId })
      .then((next) => {
        if (isCurrent) setHistory(next);
      })
      .catch((cause: unknown) => {
        if (isCurrent) {
          setHistory(emptyHistory(filter));
          setError(
            cause instanceof Error ? cause : new Error("History unavailable")
          );
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [filter, isFocused, isResolvingUser, retryIndex, userId]);

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
