import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { logger } from "@/utils/logger";
import {
  readMicrophonePermission,
  requestMicrophonePermission,
  type MicrophonePermissionStatus,
} from "@/services/microphone-permission-service";
export type { MicrophonePermissionStatus } from "@/services/microphone-permission-service";

export function useMicrophonePermission(): {
  readonly permissionStatus: MicrophonePermissionStatus;
  readonly hasPermission: boolean;
  readonly refreshPermission: () => Promise<MicrophonePermissionStatus>;
  readonly requestPermission: () => Promise<boolean>;
} {
  const [permissionStatus, setPermissionStatus] =
    useState<MicrophonePermissionStatus>("unknown");
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const updatePermission = useCallback(
    async (request: boolean): Promise<MicrophonePermissionStatus> => {
      const generation = ++generationRef.current;
      try {
        const next = await (request
          ? requestMicrophonePermission()
          : readMicrophonePermission());
        if (mountedRef.current && generation === generationRef.current)
          setPermissionStatus(next);
        return next;
      } catch (error: unknown) {
        logger.error("voice.microphonePermission.failed", error);
        if (mountedRef.current && generation === generationRef.current)
          setPermissionStatus("unknown");
        return "unknown";
      }
    },
    []
  );
  const refreshPermission = useCallback(
    (): Promise<MicrophonePermissionStatus> => updatePermission(false),
    [updatePermission]
  );
  const requestPermission = useCallback(
    async (): Promise<boolean> => (await updatePermission(true)) === "granted",
    [updatePermission]
  );
  useEffect(() => {
    mountedRef.current = true;
    void refreshPermission();
    const subscription = AppState.addEventListener("change", (state): void => {
      if (state === "active") void refreshPermission();
    });
    return (): void => {
      mountedRef.current = false;
      generationRef.current += 1;
      subscription.remove();
    };
  }, [refreshPermission]);
  return {
    permissionStatus,
    hasPermission: permissionStatus === "granted",
    refreshPermission,
    requestPermission,
  };
}
