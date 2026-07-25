import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  getSmsAiAvailability,
  type SmsAiAvailabilitySnapshot,
} from "@/services/sms-ai-availability-service";
import { isEdgeFunctionAuthenticationError } from "@/services/authenticated-edge-function-service";
import { logger } from "@/utils/logger";

interface UseSmsAiAvailabilityResult {
  readonly availability: SmsAiAvailabilitySnapshot | null;
  readonly refresh: () => Promise<void>;
}

export function useSmsAiAvailability(
  isEnabled = true
): UseSmsAiAvailabilityResult {
  const [availability, setAvailability] =
    useState<SmsAiAvailabilitySnapshot | null>(null);
  const isMountedRef = useRef(true);
  const refreshGenerationRef = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const refreshGeneration = ++refreshGenerationRef.current;
    try {
      const nextAvailability = await getSmsAiAvailability();
      if (
        isMountedRef.current &&
        refreshGeneration === refreshGenerationRef.current
      ) {
        setAvailability(nextAvailability);
      }
    } catch (error: unknown) {
      if (refreshGeneration !== refreshGenerationRef.current) return;
      if (isEdgeFunctionAuthenticationError(error)) return;
      logger.warn("smsAiAvailability.refreshFailed", {
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isEnabled) void refresh();
    }, [isEnabled, refresh])
  );

  useEffect(() => {
    if (!isEnabled) {
      refreshGenerationRef.current += 1;
      setAvailability(null);
    }
  }, [isEnabled]);

  useEffect(() => {
    if (availability === null) return;
    const historyAvailableAt = availability.historyCooldownAvailableAt;
    if (historyAvailableAt === null) return;

    const serverNowMs = Date.parse(availability.serverNow);
    const historyAvailableAtMs = Date.parse(historyAvailableAt);
    if (
      !Number.isFinite(serverNowMs) ||
      !Number.isFinite(historyAvailableAtMs)
    ) {
      return;
    }

    const timeoutId = setTimeout(
      () => {
        setAvailability((currentAvailability) => {
          if (
            currentAvailability?.historyCooldownAvailableAt !==
            historyAvailableAt
          ) {
            return currentAvailability;
          }
          const wasPrimaryBlocker =
            currentAvailability.reason === "history_cooldown";
          return {
            ...currentAvailability,
            reason: wasPrimaryBlocker ? null : currentAvailability.reason,
            availableAt: wasPrimaryBlocker
              ? null
              : currentAvailability.availableAt,
            historyCooldownAvailableAt: null,
          };
        });
        void refresh();
      },
      Math.max(0, historyAvailableAtMs - serverNowMs) + 1
    );

    return () => clearTimeout(timeoutId);
  }, [availability, refresh]);

  useEffect(() => {
    isMountedRef.current = true;
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus): void => {
        if (isEnabled && nextState === "active") void refresh();
      }
    );

    return () => {
      isMountedRef.current = false;
      refreshGenerationRef.current += 1;
      subscription.remove();
    };
  }, [isEnabled, refresh]);

  return { availability, refresh };
}
