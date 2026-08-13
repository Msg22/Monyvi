import { useCallback, useEffect, useRef, useState } from "react";

import { resumeBudget } from "@/services/budget-service";
import { logger } from "@/utils/logger";

export interface UseBudgetDashboardActionsResult {
  readonly isSubmitting: boolean;
  readonly errorKey: "dashboard_action_error" | null;
  readonly confirmResume: (budgetId: string) => Promise<boolean>;
  readonly resetError: () => void;
}

export function useBudgetDashboardActions(): UseBudgetDashboardActionsResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<"dashboard_action_error" | null>(
    null
  );
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    []
  );

  const confirmResume = useCallback(
    async (budgetId: string): Promise<boolean> => {
      if (isSubmittingRef.current) return false;

      isSubmittingRef.current = true;
      if (isMountedRef.current) {
        setIsSubmitting(true);
        setErrorKey(null);
      }

      try {
        await resumeBudget(budgetId);
        return true;
      } catch (error: unknown) {
        logger.error("budgetDashboard.resume.failed", error, { budgetId });
        if (isMountedRef.current) setErrorKey("dashboard_action_error");
        return false;
      } finally {
        isSubmittingRef.current = false;
        if (isMountedRef.current) setIsSubmitting(false);
      }
    },
    []
  );

  const resetError = useCallback((): void => {
    setErrorKey(null);
  }, []);

  return { isSubmitting, errorKey, confirmResume, resetError };
}
