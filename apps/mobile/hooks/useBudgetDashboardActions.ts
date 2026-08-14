import { useCallback, useEffect, useRef, useState } from "react";

import { resumeBudget } from "@/services/budget-service";
import { logger } from "@/utils/logger";

export interface UseBudgetDashboardActionsResult {
  readonly isSubmitting: boolean;
  readonly errorKey: "dashboard_action_error" | null;
  readonly confirmResume: (
    budgetId: string
  ) => Promise<"resumed" | "ignored" | "failed">;
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
    async (
      budgetId: string
    ): Promise<"resumed" | "ignored" | "failed"> => {
      if (isSubmittingRef.current) return "ignored";

      isSubmittingRef.current = true;
      if (isMountedRef.current) {
        setIsSubmitting(true);
        setErrorKey(null);
      }

      try {
        await resumeBudget(budgetId);
        return "resumed";
      } catch (error: unknown) {
        logger.error("budgetDashboard.resume.failed", error, { budgetId });
        if (isMountedRef.current) setErrorKey("dashboard_action_error");
        return "failed";
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
