import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useMarketRates } from "@/hooks/useMarketRates";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { useDatabase } from "@/providers/DatabaseProvider";
import {
  observeLiveRatesTrust,
  type LiveRatesTrustObservationStream,
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
import { AppState } from "react-native";

const RATE_STATUS_REFRESH_INTERVAL_MS = 60_000;

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

function createDetailIdentity(
  userId: string | null,
  holdingId: string | undefined
): string {
  return `${userId ?? "signed-out"}:${holdingId ?? "missing"}`;
}

function toError(cause: unknown, fallbackMessage: string): Error {
  return cause instanceof Error ? cause : new Error(fallbackMessage);
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
  const detailIdentity = createDetailIdentity(userId, holdingId);
  const [model, setModel] = useState<MetalDetailReadModel | null>(null);
  const [observationError, setObservationError] = useState<Error | null>(null);
  const [readError, setReadError] = useState<Error | null>(null);
  const [ratesError, setRatesError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryIndex, setRetryIndex] = useState(0);
  const [localRevision, setLocalRevision] = useState(0);
  const hasLoadedOnceRef = useRef(false);
  const detailIdentityRef = useRef(detailIdentity);
  const modelIdentityRef = useRef<string | null>(null);
  const trustObservationRef = useRef<LiveRatesTrustObservationStream | null>(
    null
  );
  const [currentRates, setCurrentRates] = useState<LiveRatesTrustReadModel>(
    createEmptyTrustReadModel
  );
  const [isRatesLoading, setIsRatesLoading] = useState(true);
  if (detailIdentityRef.current !== detailIdentity) {
    detailIdentityRef.current = detailIdentity;
    modelIdentityRef.current = null;
    hasLoadedOnceRef.current = false;
  }

  const retry = useCallback((): void => {
    setRetryIndex((value) => value + 1);
    void syncDatabase(database).catch((cause: unknown) => {
      setReadError(toError(cause, "Holding sync unavailable"));
    });
  }, [database]);

  useEffect(() => {
    const observation = observeLiveRatesTrust(database);
    trustObservationRef.current = observation;
    setIsRatesLoading(true);
    const subscription = observation.subscribe({
      next: (rates): void => {
        setCurrentRates(rates);
        setRatesError(null);
        setIsRatesLoading(false);
      },
      error: (cause: unknown): void => {
        setRatesError(toError(cause, "Holding rates unavailable"));
        setIsRatesLoading(false);
      },
    });
    return () => {
      if (trustObservationRef.current === observation) {
        trustObservationRef.current = null;
      }
      subscription.unsubscribe();
    };
  }, [database, retryIndex]);

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
    if (
      !isFocused ||
      isResolvingUser ||
      userId === null ||
      holdingId === undefined
    ) {
      return;
    }
    const onChange = (): void => setLocalRevision((value) => value + 1);
    const onObservationError = (cause: unknown): void => {
      hasLoadedOnceRef.current = false;
      modelIdentityRef.current = null;
      setModel(null);
      setObservationError(toError(cause, "Holding detail updates unavailable"));
      setIsLoading(false);
    };
    setObservationError(null);
    const subscriptions = [
      observeMetalDetailHolding(userId, holdingId)
        .observe()
        .subscribe({ error: onObservationError, next: onChange }),
      observeMetalDetailHoldingState(userId, holdingId)
        .observe()
        .subscribe({ error: onObservationError, next: onChange }),
      observeMetalDetailEvents(userId, holdingId)
        .observe()
        .subscribe({ error: onObservationError, next: onChange }),
      observeMetalDetailActionEvidence(userId, holdingId)
        .observe()
        .subscribe({ error: onObservationError, next: onChange }),
      observeMetalDetailRateReferences(userId, holdingId)
        .observe()
        .subscribe({ error: onObservationError, next: onChange }),
    ];
    return () =>
      subscriptions.forEach((subscription) => subscription.unsubscribe());
  }, [holdingId, isFocused, isResolvingUser, retryIndex, userId]);

  useEffect(() => {
    let isCurrent = true;
    if (isResolvingUser) {
      hasLoadedOnceRef.current = false;
      modelIdentityRef.current = null;
      setModel(null);
      setReadError(null);
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
      modelIdentityRef.current = null;
      setModel(null);
      setReadError(null);
      setIsLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    if (observationError !== null || ratesError !== null) {
      setIsLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    setIsLoading(!hasLoadedOnceRef.current);
    setReadError(null);
    void readMetalDetailReadModel({
      currentRates,
      holdingId,
      preferredCurrency,
      userId,
    })
      .then((next) => {
        if (isCurrent && detailIdentityRef.current === detailIdentity) {
          hasLoadedOnceRef.current = true;
          modelIdentityRef.current = detailIdentity;
          setModel(next);
        }
      })
      .catch((cause: unknown) => {
        if (isCurrent && detailIdentityRef.current === detailIdentity) {
          modelIdentityRef.current = null;
          setModel(null);
          setReadError(toError(cause, "Holding detail unavailable"));
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
    detailIdentity,
    holdingId,
    isCurrencyLoading,
    isFocused,
    isRatesLoading,
    isResolvingUser,
    localRevision,
    observationError,
    preferredCurrency,
    ratesError,
    retryIndex,
    userId,
  ]);

  return {
    error: observationError ?? ratesError ?? readError,
    isLoading,
    isOffline: !isConnected,
    model: modelIdentityRef.current === detailIdentity ? model : null,
    retry,
  };
}
