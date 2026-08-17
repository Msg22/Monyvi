import { useCallback, useState } from "react";

import { useDatabase } from "@/providers/DatabaseProvider";
import { clearBudgetDashboardFilterSession } from "@/hooks/budget-dashboard-filter-session";
import { performLogout } from "@/services/logout-service";
import { logger } from "@/utils/logger";

interface UseLogoutFlowOptions {
  readonly onSuccess?: () => void;
  readonly onNoNetwork?: () => void;
  readonly onUnknownError?: () => void;
}

interface UseLogoutFlowResult {
  readonly isLoggingOut: boolean;
  readonly showSyncWarning: boolean;
  readonly showForceLogoutError: boolean;
  readonly requestLogout: () => Promise<void>;
  readonly forceLogout: () => Promise<void>;
  readonly showSyncWarningModal: () => void;
  readonly dismissSyncWarning: () => void;
  readonly dismissForceLogoutError: () => void;
}

export function useLogoutFlow({
  onSuccess,
  onNoNetwork,
  onUnknownError,
}: UseLogoutFlowOptions = {}): UseLogoutFlowResult {
  const database = useDatabase();
  const [showSyncWarning, setShowSyncWarning] = useState(false);
  const [showForceLogoutError, setShowForceLogoutError] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const requestLogout = useCallback(async (): Promise<void> => {
    setIsLoggingOut(true);

    try {
      const result = await performLogout(database);

      if (result.success) {
        clearBudgetDashboardFilterSession();
        onSuccess?.();
        return;
      }

      if (result.error === "no_network") {
        onNoNetwork?.();
        return;
      }

      if (result.error === "sync_failed") {
        setShowSyncWarning(true);
        return;
      }

      onUnknownError?.();
    } catch (error: unknown) {
      logger.error("logout.request.failed", error);
      onUnknownError?.();
    } finally {
      setIsLoggingOut(false);
    }
  }, [database, onNoNetwork, onSuccess, onUnknownError]);

  const forceLogout = useCallback(async (): Promise<void> => {
    setShowSyncWarning(false);
    setIsLoggingOut(true);

    try {
      const result = await performLogout(database, true);

      if (result.success) {
        clearBudgetDashboardFilterSession();
        onSuccess?.();
        return;
      }

      setShowForceLogoutError(true);
    } catch (error: unknown) {
      logger.error("logout.force.failed", error);
      setShowForceLogoutError(true);
    } finally {
      setIsLoggingOut(false);
    }
  }, [database, onSuccess]);

  const showSyncWarningModal = useCallback((): void => {
    setShowSyncWarning(true);
  }, []);

  const dismissSyncWarning = useCallback((): void => {
    setShowSyncWarning(false);
  }, []);

  const dismissForceLogoutError = useCallback((): void => {
    setShowForceLogoutError(false);
  }, []);

  return {
    isLoggingOut,
    showSyncWarning,
    showForceLogoutError,
    requestLogout,
    forceLogout,
    showSyncWarningModal,
    dismissSyncWarning,
    dismissForceLogoutError,
  };
}
