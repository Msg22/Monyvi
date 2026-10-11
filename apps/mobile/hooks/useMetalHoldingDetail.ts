import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useMarketRates } from "@/hooks/useMarketRates";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { useDatabase } from "@/providers/DatabaseProvider";
import type { LiveRatesTrustReadModel } from "@/services/live-rates-trust-read-model-service";
import {
  observeMetalDetailAssetMetal,
  observeMetalDetailEvents,
  observeMetalDetailHolding,
  observeMetalDetailHoldingState,
  observeMetalDetailRateReferences,
  readMetalDetailReadModel,
  readMetalDetailPurchaseDateMarketReference,
  type MetalDetailReadModel,
} from "@/services/metal-detail-read-model-service";
import { observeMetalDetailActionEvidence } from "@/services/metal-action-evidence-observer-service";
import { syncDatabase } from "@/services/sync";
import { logger } from "@/utils/logger";
import { redactIdentifierForLog } from "@/utils/logger-redaction";
import { AppState } from "react-native";

const RATE_STATUS_REFRESH_INTERVAL_MS = 60_000;
const DETAIL_ASSET_COLUMNS = [
  "name",
  "notes",
  "purchase_date",
  "purchase_price_decimal",
  "purchase_currency",
  "acquisition_action_id",
] as const;
const DETAIL_HOLDING_STATE_COLUMNS = [
  "status",
  "effective_action_id",
  "effective_event_id",
  "is_visible",
  "reconciliation_state",
] as const;
const DETAIL_METAL_COLUMNS = [
  "metal_type",
  "item_form",
  "purity_catalog_version",
  "purity_code",
  "purity_factor_decimal",
  "weight_grams_decimal",
] as const;
const DETAIL_LIFECYCLE_EVENT_COLUMNS = [
  "is_effective",
  "is_history_visible",
] as const;

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
  const {
    currentError: marketRatesError,
    isConnected,
    refreshSelectedSnapshot,
    selectedSnapshot,
  } = useMarketRates();
  const currentRates = useMemo<LiveRatesTrustReadModel>(
    () => selectedSnapshot?.trust ?? createEmptyTrustReadModel(),
    [selectedSnapshot]
  );
  const { preferredCurrency, isLoading: isCurrencyLoading } =
    usePreferredCurrency();
  const detailIdentity = createDetailIdentity(userId, holdingId);
  const [model, setModel] = useState<MetalDetailReadModel | null>(null);
  const [observationError, setObservationError] = useState<Error | null>(null);
  const [readError, setReadError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryIndex, setRetryIndex] = useState(0);
  const [localRevision, setLocalRevision] = useState(0);
  const hasLoadedOnceRef = useRef(false);
  const detailIdentityRef = useRef(detailIdentity);
  const modelIdentityRef = useRef<string | null>(null);
  const historicalAttemptRef = useRef<string | null>(null);
  if (detailIdentityRef.current !== detailIdentity) {
    detailIdentityRef.current = detailIdentity;
    modelIdentityRef.current = null;
    hasLoadedOnceRef.current = false;
    historicalAttemptRef.current = null;
  }

  const retry = useCallback((): void => {
    setRetryIndex((value) => value + 1);
    refreshSelectedSnapshot();
    void syncDatabase(database).catch((cause: unknown) => {
      setReadError(toError(cause, "Holding sync unavailable"));
    });
  }, [database, refreshSelectedSnapshot]);

  useEffect(() => {
    const timer = setInterval(
      refreshSelectedSnapshot,
      RATE_STATUS_REFRESH_INTERVAL_MS
    );
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") {
          refreshSelectedSnapshot();
        }
      }
    );
    return () => {
      clearInterval(timer);
      appStateSubscription.remove();
    };
  }, [refreshSelectedSnapshot]);

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
      logger.error("metalHoldingDetail.observation.failed", cause, {
        holdingId,
        redactedUserId: redactIdentifierForLog(userId),
      });
      hasLoadedOnceRef.current = false;
      modelIdentityRef.current = null;
      setModel(null);
      setObservationError(toError(cause, "Holding detail updates unavailable"));
      setIsLoading(false);
    };
    setObservationError(null);

    let metalSubscription: { unsubscribe(): void } | null = null;
    const holdingSubscription = observeMetalDetailHolding(userId, holdingId)
      .observeWithColumns([...DETAIL_ASSET_COLUMNS])
      .subscribe({
        error: onObservationError,
        next: (assets): void => {
          onChange();
          metalSubscription?.unsubscribe();
          const query = observeMetalDetailAssetMetal(userId, assets);
          metalSubscription =
            query
              ?.observeWithColumns([...DETAIL_METAL_COLUMNS])
              .subscribe({ error: onObservationError, next: onChange }) ?? null;
        },
      });
    const subscriptions = [
      holdingSubscription,
      observeMetalDetailHoldingState(userId, holdingId)
        .observeWithColumns([...DETAIL_HOLDING_STATE_COLUMNS])
        .subscribe({ error: onObservationError, next: onChange }),
      observeMetalDetailEvents(userId, holdingId)
        .observeWithColumns([...DETAIL_LIFECYCLE_EVENT_COLUMNS])
        .subscribe({ error: onObservationError, next: onChange }),
      observeMetalDetailActionEvidence(userId, holdingId)
        .observe()
        .subscribe({ error: onObservationError, next: onChange }),
      observeMetalDetailRateReferences(userId, holdingId)
        .observe()
        .subscribe({ error: onObservationError, next: onChange }),
    ];
    return () => {
      metalSubscription?.unsubscribe();
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
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
    if (!isFocused || isCurrencyLoading) {
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

    if (observationError !== null) {
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
      includePurchaseDateMarketReference: true,
      snapshotId: selectedSnapshot?.snapshotId ?? null,
      preferredCurrency,
      userId,
    })
      .then((next) => {
        if (isCurrent && detailIdentityRef.current === detailIdentity) {
          hasLoadedOnceRef.current = true;
          modelIdentityRef.current = detailIdentity;
          setModel((previous) => {
            if (
              next !== null &&
              previous !== null &&
              next.purchaseDateMarketReferenceContextKey !== undefined &&
              next.purchaseDateMarketReferenceContextKey ===
                previous.purchaseDateMarketReferenceContextKey &&
              previous.purchaseDateMarketReference?.status === "available" &&
              next.purchaseDateMarketReference?.status !== "available"
            ) {
              return {
                ...next,
                purchaseDateMarketReference:
                  previous.purchaseDateMarketReference,
              };
            }
            return next;
          });
        }
      })
      .catch((cause: unknown) => {
        logger.error("metalHoldingDetail.read.failed", cause, {
          holdingId,
          redactedUserId: redactIdentifierForLog(userId),
        });
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
    isResolvingUser,
    localRevision,
    observationError,
    preferredCurrency,
    retryIndex,
    selectedSnapshot,
    userId,
  ]);

  const historicalContextKey =
    modelIdentityRef.current === detailIdentity
      ? (model?.purchaseDateMarketReferenceContextKey ?? null)
      : null;
  const shouldEnrichHistory =
    model?.isActiveOwnership === true &&
    model.purchaseDateMarketReference?.status !== "available" &&
    (model.purchaseDateMarketReference?.status === "fetch_failed" ||
      (model.purchaseDateMarketReference?.status === "unavailable" &&
        (model.purchaseDateMarketReference.reason === "cache_miss" ||
          model.purchaseDateMarketReference.reason ===
            "purchase_currency_unavailable")));

  useEffect(() => {
    if (
      !isFocused ||
      !isConnected ||
      isResolvingUser ||
      userId === null ||
      holdingId === undefined ||
      historicalContextKey === null ||
      !shouldEnrichHistory ||
      observationError !== null
    )
      return;
    const attemptKey = JSON.stringify([
      detailIdentity,
      historicalContextKey,
      retryIndex,
    ]);
    if (historicalAttemptRef.current === attemptKey) return;
    historicalAttemptRef.current = attemptKey;
    const controller = new AbortController();
    let hasSettled = false;
    void readMetalDetailPurchaseDateMarketReference({
      holdingId,
      userId,
      contextKey: historicalContextKey,
      signal: controller.signal,
    })
      .then((reference) => {
        hasSettled = true;
        if (
          controller.signal.aborted ||
          reference === null ||
          detailIdentityRef.current !== detailIdentity
        )
          return;
        setModel((previous) =>
          previous !== null &&
          previous.purchaseDateMarketReferenceContextKey ===
            historicalContextKey
            ? { ...previous, purchaseDateMarketReference: reference }
            : previous
        );
      })
      .catch((cause: unknown) => {
        hasSettled = true;
        if (!controller.signal.aborted) {
          logger.error("metalHoldingDetail.history.failed", cause, {
            holdingId,
            redactedUserId: redactIdentifierForLog(userId),
          });
        }
      });
    return () => {
      controller.abort();
      if (!hasSettled && historicalAttemptRef.current === attemptKey)
        historicalAttemptRef.current = null;
    };
  }, [
    detailIdentity,
    historicalContextKey,
    holdingId,
    isConnected,
    isFocused,
    isResolvingUser,
    observationError,
    retryIndex,
    shouldEnrichHistory,
    userId,
  ]);

  return {
    error: observationError ?? readError ?? marketRatesError,
    isLoading,
    isOffline: !isConnected,
    model: modelIdentityRef.current === detailIdentity ? model : null,
    retry,
  };
}
