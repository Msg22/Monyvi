import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  voiceAvailabilitySnapshotSchema,
  type VoiceAvailabilitySnapshot,
} from "@monyvi/logic";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  getVoiceAiAvailability,
  isVoiceAiAvailabilityError,
  type VoiceAiAvailabilityError,
} from "@/services/voice-ai-availability-service";
import { getDeviceTimeZone } from "@/utils/device-time-zone";
import { logger } from "@/utils/logger";

export interface UseVoiceAiAvailabilityResult {
  readonly availability: VoiceAvailabilitySnapshot | null;
  readonly isLoading: boolean;
  readonly error: VoiceAiAvailabilityError | null;
  readonly refresh: () => Promise<VoiceAvailabilitySnapshot | null>;
  readonly reconcileAuthoritativeSnapshot: (
    snapshot: VoiceAvailabilitySnapshot
  ) => void;
}

interface OwnedAvailabilityState {
  readonly ownerUserId: string | null;
  readonly availability: VoiceAvailabilitySnapshot | null;
  readonly isLoading: boolean;
  readonly error: VoiceAiAvailabilityError | null;
}

interface CurrentAvailabilityContext {
  readonly userId: string | null;
  readonly isResolvingUser: boolean;
  readonly isEnabled: boolean;
}

const EMPTY_STATE: OwnedAvailabilityState = {
  ownerUserId: null,
  availability: null,
  isLoading: false,
  error: null,
};

function createInvalidTimeZoneError(): VoiceAiAvailabilityError {
  return Object.assign(
    new Error("Voice availability requires a valid device timezone."),
    {
      name: "VoiceAiAvailabilityError",
      kind: "invalid_time_zone" as const,
    }
  );
}

function createUnavailableError(): VoiceAiAvailabilityError {
  return Object.assign(
    new Error("Voice availability is temporarily unavailable."),
    {
      name: "VoiceAiAvailabilityError",
      kind: "unavailable" as const,
    }
  );
}

function getNextRefreshDelay(
  snapshot: VoiceAvailabilitySnapshot
): number | null {
  const serverNowMs = Date.parse(snapshot.serverNow);
  if (!Number.isFinite(serverNowMs)) {
    return null;
  }

  const candidates = [snapshot.resetAt, snapshot.burstAvailableAt]
    .filter((value): value is string => value !== null)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value) && value >= serverNowMs);

  if (candidates.length === 0) {
    return null;
  }

  return Math.max(0, Math.min(...candidates) - serverNowMs) + 1;
}

export function useVoiceAiAvailability(
  isEnabled = true
): UseVoiceAiAvailabilityResult {
  const { userId, isResolvingUser } = useCurrentUser();

  const [ownedState, setOwnedState] =
    useState<OwnedAvailabilityState>(EMPTY_STATE);
  const [isFocused, setIsFocused] = useState(false);
  const [isAppActive, setIsAppActive] = useState(
    AppState.currentState === "active"
  );

  const isMountedRef = useRef(true);
  const generationRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const automaticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * Update this synchronously on every render. Old refresh/reconcile callbacks
   * therefore see the current auth/enablement context before effects run.
   */
  const currentContextRef = useRef<CurrentAvailabilityContext>({
    userId,
    isResolvingUser,
    isEnabled,
  });

  currentContextRef.current = {
    userId,
    isResolvingUser,
    isEnabled,
  };

  const clearAutomaticTimer = useCallback((): void => {
    if (automaticTimerRef.current !== null) {
      clearTimeout(automaticTimerRef.current);
      automaticTimerRef.current = null;
    }
  }, []);

  const cancelInFlight = useCallback((): void => {
    generationRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
  }, []);

  const refresh =
    useCallback(async (): Promise<VoiceAvailabilitySnapshot | null> => {
      const context = currentContextRef.current;
      if (
        !isMountedRef.current ||
        !context.isEnabled ||
        context.isResolvingUser ||
        userId === null ||
        context.userId !== userId
      ) {
        return null;
      }

      clearAutomaticTimer();

      const timeZone = getDeviceTimeZone();
      if (timeZone === null) {
        cancelInFlight();

        const latestContext = currentContextRef.current;
        if (
          isMountedRef.current &&
          latestContext.isEnabled &&
          !latestContext.isResolvingUser &&
          latestContext.userId === userId
        ) {
          setOwnedState({
            ownerUserId: userId,
            availability: null,
            isLoading: false,
            error: createInvalidTimeZoneError(),
          });
        }

        return null;
      }

      cancelInFlight();

      const generation = ++generationRef.current;
      const requestedUserId = userId;
      const controller = new AbortController();
      requestControllerRef.current = controller;

      setOwnedState((current) => ({
        ownerUserId: requestedUserId,
        availability:
          current.ownerUserId === requestedUserId ? current.availability : null,
        isLoading: true,
        error: null,
      }));

      try {
        const nextAvailability = await getVoiceAiAvailability(timeZone, {
          signal: controller.signal,
        });

        const latestContext = currentContextRef.current;
        if (
          !isMountedRef.current ||
          generation !== generationRef.current ||
          !latestContext.isEnabled ||
          latestContext.isResolvingUser ||
          latestContext.userId !== requestedUserId
        ) {
          return null;
        }

        setOwnedState({
          ownerUserId: requestedUserId,
          availability: nextAvailability,
          isLoading: false,
          error: null,
        });

        return nextAvailability;
      } catch (caught: unknown) {
        if (caught instanceof Error && caught.name === "AbortError") {
          return null;
        }

        const latestContext = currentContextRef.current;
        if (
          !isMountedRef.current ||
          generation !== generationRef.current ||
          !latestContext.isEnabled ||
          latestContext.isResolvingUser ||
          latestContext.userId !== requestedUserId
        ) {
          return null;
        }

        const nextError = isVoiceAiAvailabilityError(caught)
          ? caught
          : createUnavailableError();

        setOwnedState({
          ownerUserId: requestedUserId,
          availability: null,
          isLoading: false,
          error: nextError,
        });

        logger.warn("voiceAiAvailability.refreshFailed", {
          kind: nextError.kind,
          status: nextError.status,
        });

        return null;
      } finally {
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
        }

        const latestContext = currentContextRef.current;
        if (
          isMountedRef.current &&
          generation === generationRef.current &&
          latestContext.isEnabled &&
          !latestContext.isResolvingUser &&
          latestContext.userId === requestedUserId
        ) {
          setOwnedState((current) =>
            current.ownerUserId === requestedUserId && current.isLoading
              ? {
                  ...current,
                  isLoading: false,
                }
              : current
          );
        }
      }
    }, [
      cancelInFlight,
      clearAutomaticTimer,
      isEnabled,
      isResolvingUser,
      userId,
    ]);

  const reconcileAuthoritativeSnapshot = useCallback(
    (snapshot: VoiceAvailabilitySnapshot): void => {
      /*
       * Same stale-callback guard as refresh(): a reconciliation callback
       * captured for user A cannot mutate state after auth switches to B.
       */
      const context = currentContextRef.current;
      if (
        !isMountedRef.current ||
        !context.isEnabled ||
        context.isResolvingUser ||
        userId === null ||
        context.userId !== userId
      ) {
        return;
      }

      const parsed = voiceAvailabilitySnapshotSchema.safeParse(snapshot);

      cancelInFlight();

      if (!parsed.success) {
        setOwnedState({
          ownerUserId: userId,
          availability: null,
          isLoading: false,
          error: createUnavailableError(),
        });
        return;
      }

      /*
       * Re-check after cancellation before applying. This also protects a
       * synchronous auth transition triggered during cancellation cleanup.
       */
      const latestContext = currentContextRef.current;
      if (
        !isMountedRef.current ||
        !latestContext.isEnabled ||
        latestContext.isResolvingUser ||
        latestContext.userId !== userId
      ) {
        return;
      }

      setOwnedState({
        ownerUserId: userId,
        availability: parsed.data,
        isLoading: false,
        error: null,
      });
    },
    [cancelInFlight, userId]
  );

  /*
   * Clear physical stale state after auth/enablement changes. Render output is
   * already protected immediately by owner gating below, before this effect.
   */
  useEffect(() => {
    cancelInFlight();
    clearAutomaticTimer();
    setOwnedState(EMPTY_STATE);
  }, [cancelInFlight, clearAutomaticTimer, isEnabled, isResolvingUser, userId]);

  /*
   * Route focus controls automatic polling only. Explicit refresh() remains
   * callable for the mandatory pre-attempt authoritative gate.
   */
  useFocusEffect(
    useCallback(() => {
      if (!isMountedRef.current) {
        return;
      }

      setIsFocused(true);

      const context = currentContextRef.current;
      if (
        context.isEnabled &&
        !context.isResolvingUser &&
        context.userId === userId &&
        userId !== null &&
        AppState.currentState === "active"
      ) {
        void refresh();
      }

      return (): void => {
        setIsFocused(false);
        clearAutomaticTimer();
        cancelInFlight();
      };
    }, [
      cancelInFlight,
      clearAutomaticTimer,
      isEnabled,
      isResolvingUser,
      refresh,
      userId,
    ])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus): void => {
        const nextIsActive = nextState === "active";
        setIsAppActive(nextIsActive);

        if (!nextIsActive) {
          clearAutomaticTimer();
          cancelInFlight();
          return;
        }

        const context = currentContextRef.current;
        if (
          isFocused &&
          context.isEnabled &&
          !context.isResolvingUser &&
          context.userId === userId &&
          userId !== null
        ) {
          void refresh();
        }
      }
    );

    return () => subscription.remove();
  }, [cancelInFlight, clearAutomaticTimer, isFocused, refresh, userId]);

  /*
   * Schedule only while this route is visible and foregrounded.
   * Delay is server-relative: device wall-clock time never determines reset.
   */
  useEffect(() => {
    clearAutomaticTimer();

    if (
      !isFocused ||
      !isAppActive ||
      !isEnabled ||
      isResolvingUser ||
      userId === null ||
      ownedState.ownerUserId !== userId ||
      ownedState.availability === null
    ) {
      return;
    }

    const delay = getNextRefreshDelay(ownedState.availability);

    if (delay === null) {
      return;
    }

    automaticTimerRef.current = setTimeout(() => {
      automaticTimerRef.current = null;

      const context = currentContextRef.current;
      if (
        isMountedRef.current &&
        context.isEnabled &&
        !context.isResolvingUser &&
        context.userId === userId
      ) {
        void refresh();
      }
    }, delay);

    return clearAutomaticTimer;
  }, [
    clearAutomaticTimer,
    isAppActive,
    isEnabled,
    isFocused,
    isResolvingUser,
    ownedState.availability,
    ownedState.ownerUserId,
    refresh,
    userId,
  ]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      clearAutomaticTimer();
      cancelInFlight();
    };
  }, [cancelInFlight, clearAutomaticTimer]);

  /*
   * Owner gating happens during render, not in a post-render effect. A render
   * for user B can therefore never expose user A's snapshot/error/loading.
   */
  const ownsVisibleState =
    isEnabled &&
    !isResolvingUser &&
    userId !== null &&
    ownedState.ownerUserId === userId;

  return {
    availability: ownsVisibleState ? ownedState.availability : null,
    isLoading: ownsVisibleState ? ownedState.isLoading : false,
    error: ownsVisibleState ? ownedState.error : null,
    refresh,
    reconcileAuthoritativeSnapshot,
  };
}
