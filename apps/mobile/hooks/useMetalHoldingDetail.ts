import { useCallback, useEffect, useState } from "react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useMarketRates } from "@/hooks/useMarketRates";
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

export function useMetalHoldingDetail(
  holdingId: string | undefined
): UseMetalHoldingDetailResult {
  const { userId, isResolvingUser } = useCurrentUser();
  const { isConnected } = useMarketRates();
  const [model, setModel] = useState<MetalDetailReadModel | null>(null);
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
    void readMetalDetailReadModel({ holdingId, userId })
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
  }, [holdingId, isResolvingUser, retryIndex, userId]);
  return { error, isLoading, isOffline: !isConnected, model, retry };
}
