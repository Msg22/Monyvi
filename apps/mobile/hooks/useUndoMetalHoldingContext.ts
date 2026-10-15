import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDatabase } from "@/providers/DatabaseProvider";
import { getCurrentUserDataScope } from "@/services/user-data-access";
import { getActiveSyncPromise } from "@/services/sync";
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
  readonly retryAfterSync: () => void;
}

export function useUndoMetalHoldingContext(
  holdingId: string | undefined,
  terminalIdentity: string | null
): UseUndoMetalHoldingContextResult {
  const database = useDatabase();
  const { userId, isResolvingUser } = useCurrentUser();
  const [retryIndex, setRetryIndex] = useState(0);
  const scopeIdentity = JSON.stringify([
    holdingId,
    userId,
    terminalIdentity,
    isResolvingUser,
  ]);
  const currentScopeRef = useRef(scopeIdentity);
  const scopeGenerationRef = useRef(0);
  if (currentScopeRef.current !== scopeIdentity) {
    currentScopeRef.current = scopeIdentity;
    scopeGenerationRef.current += 1;
  }
  const scopeGeneration = scopeGenerationRef.current;
  const recoveryIdentity = JSON.stringify([scopeIdentity, scopeGeneration]);
  const pendingRecoveryRef = useRef<string | null>(null);
  const [pendingRecoveryIdentity, setPendingRecoveryIdentity] = useState<
    string | null
  >(null);
  const isMountedRef = useRef(false);
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
    isMountedRef.current = true;
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  // Detail Retry starts the single-flight pull. Wait for its completion before
  // rereading local, owned eligibility evidence; never start sync on mount.
  const retryAfterSync = useCallback((): void => {
    if (
      !holdingId ||
      userId === null ||
      isResolvingUser ||
      terminalIdentity === null ||
      pendingRecoveryRef.current === recoveryIdentity
    ) {
      return;
    }
    const activeSync = getActiveSyncPromise();
    if (activeSync === null) {
      retry();
      return;
    }
    pendingRecoveryRef.current = recoveryIdentity;
    setPendingRecoveryIdentity(recoveryIdentity);
    const finish = (): void => {
      if (pendingRecoveryRef.current === recoveryIdentity) {
        pendingRecoveryRef.current = null;
      }
      if (
        !isMountedRef.current ||
        currentScopeRef.current !== scopeIdentity ||
        scopeGenerationRef.current !== scopeGeneration
      ) {
        return;
      }
      setPendingRecoveryIdentity(null);
      // Even after a failed/offline pull, re-evaluate current local evidence
      // once, preserving the existing retryable failure if still incomplete.
      setRetryIndex((value) => value + 1);
    };
    void activeSync.then(finish, finish);
  }, [
    holdingId,
    isResolvingUser,
    recoveryIdentity,
    retry,
    scopeGeneration,
    scopeIdentity,
    terminalIdentity,
    userId,
  ]);

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
  const isRecovering = pendingRecoveryIdentity === recoveryIdentity;
  return {
    context: isCurrentState && !isRecovering ? state.context : null,
    error: isCurrentState && !isRecovering ? state.error : null,
    isLoading:
      isRecovering ||
      (isCurrentState ? state.isLoading : terminalIdentity !== null),
    userId,
    isResolvingUser,
    retry,
    retryAfterSync,
  };
}
