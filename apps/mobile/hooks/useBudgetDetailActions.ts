import { useCallback, useEffect, useRef, useState } from "react";

import {
  deleteBudget,
  pauseBudget,
  resumeBudget,
} from "../services/budget-service";
import { logger } from "../utils/logger";

export type BudgetDetailAction = "pause" | "resume" | "delete";

interface BudgetDetailActionSuccess {
  readonly status: "success";
  readonly action: BudgetDetailAction;
}

interface BudgetDetailActionError {
  readonly status: "error";
  readonly action: BudgetDetailAction;
  readonly errorKey: BudgetDetailActionErrorKey;
}

interface BudgetDetailActionIgnored {
  readonly status: "ignored";
  readonly action: BudgetDetailAction;
}

export type BudgetDetailActionResult =
  | BudgetDetailActionSuccess
  | BudgetDetailActionError
  | BudgetDetailActionIgnored;

export type BudgetDetailActionErrorKey =
  | "detail.actions.pause_error"
  | "detail.actions.resume_error"
  | "detail.actions.delete_error";

export interface UseBudgetDetailActionsResult {
  readonly pendingAction: BudgetDetailAction | null;
  readonly errorKey: BudgetDetailActionErrorKey | null;
  readonly execute: (
    action: BudgetDetailAction,
    budgetId: string
  ) => Promise<BudgetDetailActionResult>;
  readonly clearError: () => void;
}

type BudgetCommand = (budgetId: string) => Promise<void>;

const COMMANDS: Readonly<Record<BudgetDetailAction, BudgetCommand>> = {
  pause: pauseBudget,
  resume: resumeBudget,
  delete: deleteBudget,
};

const ERROR_KEYS: Readonly<
  Record<BudgetDetailAction, BudgetDetailActionErrorKey>
> = {
  pause: "detail.actions.pause_error",
  resume: "detail.actions.resume_error",
  delete: "detail.actions.delete_error",
};

export function useBudgetDetailActions(): UseBudgetDetailActionsResult {
  const [pendingAction, setPendingAction] =
    useState<BudgetDetailAction | null>(null);
  const [errorKey, setErrorKey] =
    useState<BudgetDetailActionErrorKey | null>(null);
  const pendingActionRef = useRef<BudgetDetailAction | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  const clearError = useCallback((): void => {
    if (isMountedRef.current) {
      setErrorKey(null);
    }
  }, []);

  const execute = useCallback(
    async (
      action: BudgetDetailAction,
      budgetId: string
    ): Promise<BudgetDetailActionResult> => {
      if (pendingActionRef.current !== null) {
        return { status: "ignored", action };
      }

      pendingActionRef.current = action;
      if (isMountedRef.current) {
        setErrorKey(null);
        setPendingAction(action);
      }

      try {
        await COMMANDS[action](budgetId);
        return { status: "success", action };
      } catch (error: unknown) {
        const actionErrorKey = ERROR_KEYS[action];
        logger.error("budgetDetail.action.failed", error, {
          action,
          budgetId,
        });
        if (isMountedRef.current) {
          setErrorKey(actionErrorKey);
        }
        return {
          status: "error",
          action,
          errorKey: actionErrorKey,
        };
      } finally {
        pendingActionRef.current = null;
        if (isMountedRef.current) {
          setPendingAction(null);
        }
      }
    },
    []
  );

  return {
    pendingAction,
    errorKey,
    execute,
    clearError,
  };
}
