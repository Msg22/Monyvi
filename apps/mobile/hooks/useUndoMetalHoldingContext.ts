import { useCallback, useEffect, useMemo, useState } from "react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDatabase } from "@/providers/DatabaseProvider";
import { getCurrentUserDataScope } from "@/services/user-data-access";
import {
  readUndoMetalHoldingContext,
  type UndoMetalHoldingContext,
  type UndoMetalHoldingReadDependencies,
} from "@/services/undo-metal-holding-command-service";

interface ContextState {
  readonly identity: string;
  readonly context: UndoMetalHoldingContext | null;
  readonly error: Error | null;
  readonly isLoading: boolean;
}

export interface UseUndoMetalHoldingContextResult {
  readonly context: UndoMetalHoldingContext | null;
  readonly userId: string | null;
  readonly isResolvingUser: boolean;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly retry: () => void;
}

export function useUndoMetalHoldingContext(
  holdingId: string | undefined,
  terminalIdentity: string | null
): UseUndoMetalHoldingContextResult {
  const database = useDatabase();
  const { userId, isResolvingUser } = useCurrentUser();
  const [retryIndex, setRetryIndex] = useState(0);
  const identity = JSON.stringify([
    holdingId,
    userId,
    terminalIdentity,
    isResolvingUser,
    retryIndex,
  ]);
  const [state, setState] = useState<ContextState>({
    identity,
    context: null,
    error: null,
    isLoading: true,
  });
  const dependencies = useMemo<UndoMetalHoldingReadDependencies>(
    (): UndoMetalHoldingReadDependencies => ({
      database,
      getCurrentUserDataScope,
    }),
    [database]
  );
  const retry = useCallback(
    (): void => setRetryIndex((value) => value + 1),
    []
  );

  useEffect((): (() => void) => {
    let isCurrent = true;
    if (
      !holdingId ||
      userId === null ||
      isResolvingUser ||
      terminalIdentity === null
    ) {
      setState({ identity, context: null, error: null, isLoading: false });
    } else {
      setState({ identity, context: null, error: null, isLoading: true });
      void readUndoMetalHoldingContext(dependencies, holdingId, userId)
        .then((context): void => {
          if (isCurrent)
            setState({ identity, context, error: null, isLoading: false });
        })
        .catch((cause: unknown): void => {
          if (isCurrent)
            setState({
              identity,
              context: null,
              error:
                cause instanceof Error ? cause : new Error("metal_undo_failed"),
              isLoading: false,
            });
        });
    }
    return (): void => {
      isCurrent = false;
    };
  }, [
    dependencies,
    holdingId,
    identity,
    isResolvingUser,
    terminalIdentity,
    userId,
  ]);

  const isCurrentState = state.identity === identity;
  return {
    context: isCurrentState ? state.context : null,
    error: isCurrentState ? state.error : null,
    isLoading: isCurrentState ? state.isLoading : terminalIdentity !== null,
    userId,
    isResolvingUser,
    retry,
  };
}
