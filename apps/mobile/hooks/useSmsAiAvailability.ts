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

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const nextAvailability = await getSmsAiAvailability();
      if (isMountedRef.current) setAvailability(nextAvailability);
    } catch (error: unknown) {
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
    if (!isEnabled) setAvailability(null);
  }, [isEnabled]);

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
      subscription.remove();
    };
  }, [isEnabled, refresh]);

  return { availability, refresh };
}
