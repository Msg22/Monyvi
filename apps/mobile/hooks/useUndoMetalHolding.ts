import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  UndoMetalHoldingCommandInput,
  UndoMetalHoldingCommandService,
} from "../services/undo-metal-holding-command-service";

export interface UseUndoMetalHoldingInput {
  readonly holdingId: string;
  readonly userId: string;
  readonly status: "active" | "sold" | "disposed";
  readonly currentTerminalEventId: string | null;
  readonly expectedFinancialRevision: string;
  readonly service: UndoMetalHoldingCommandService;
  readonly createId: () => string;
  readonly getOccurredAt: () => string;
}

export interface UseUndoMetalHoldingResult {
  readonly isSubmitting: boolean;
  readonly isCompleted: boolean;
  readonly error: Error | null;
  readonly submit: () => Promise<boolean>;
  readonly retry: () => Promise<boolean>;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error("metal_undo_failed");
}

function createCommand(
  input: UseUndoMetalHoldingInput
): UndoMetalHoldingCommandInput {
  if (input.status === "active" || input.currentTerminalEventId === null) {
    throw new Error("metal_undo_terminal_holding_required");
  }
  const actionId = input.createId();
  return {
    actionId,
    actionEvidenceId: actionId,
    lifecycleEventId: actionId,
    predecessorEventId: input.currentTerminalEventId,
    reversesEventId: input.currentTerminalEventId,
    holdingId: input.holdingId,
    userId: input.userId,
    occurredAt: input.getOccurredAt(),
    expectedFinancialRevision: input.expectedFinancialRevision,
  };
}

interface UndoAttempt {
  readonly identity: string;
  command: UndoMetalHoldingCommandInput | null;
  inFlight: Promise<boolean> | null;
}

interface UndoAttemptState {
  readonly attempt: UndoAttempt;
  readonly isSubmitting: boolean;
  readonly isCompleted: boolean;
  readonly error: Error | null;
}

function attemptIdentity(input: UseUndoMetalHoldingInput): string {
  return JSON.stringify([
    input.holdingId,
    input.userId,
    input.status,
    input.currentTerminalEventId,
    input.expectedFinancialRevision,
  ]);
}

export function useUndoMetalHolding(
  input: UseUndoMetalHoldingInput
): UseUndoMetalHoldingResult {
  const identity = attemptIdentity(input);
  const attempt = useMemo<UndoAttempt>(
    (): UndoAttempt => ({ identity, command: null, inFlight: null }),
    [identity]
  );
  const attemptRef = useRef(attempt);
  const [state, setState] = useState<UndoAttemptState>({
    attempt,
    isSubmitting: false,
    isCompleted: false,
    error: null,
  });
  const isMountedRef = useRef(true);

  useLayoutEffect((): void => {
    attemptRef.current = attempt;
  }, [attempt]);

  useEffect((): (() => void) => {
    isMountedRef.current = true;
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  const runCommand = useCallback(
    (
      attempt: UndoAttempt,
      command: UndoMetalHoldingCommandInput
    ): Promise<boolean> => {
      if (attempt.inFlight) return attempt.inFlight;
      const isCurrentAttempt = (): boolean =>
        isMountedRef.current && attemptRef.current === attempt;
      setState({
        attempt,
        isSubmitting: true,
        isCompleted: false,
        error: null,
      });
      const pending = Promise.resolve()
        .then(
          (): ReturnType<UndoMetalHoldingCommandService["undo"]> =>
            input.service.undo(command)
        )
        .then((): boolean => {
          if (!isCurrentAttempt()) return false;
          setState({
            attempt,
            isSubmitting: false,
            isCompleted: true,
            error: null,
          });
          return true;
        })
        .catch((caught: unknown): boolean => {
          if (isCurrentAttempt()) {
            setState({
              attempt,
              isSubmitting: false,
              isCompleted: false,
              error: asError(caught),
            });
          }
          return false;
        })
        .finally((): void => {
          attempt.inFlight = null;
        });
      attempt.inFlight = pending;
      return pending;
    },
    [input.service]
  );

  const submit = useCallback((): Promise<boolean> => {
    if (!isMountedRef.current || attemptRef.current !== attempt)
      return Promise.resolve(false);
    if (attempt.inFlight) return attempt.inFlight;
    try {
      const command = attempt.command ?? createCommand(input);
      attempt.command = command;
      return runCommand(attempt, command);
    } catch (caught: unknown) {
      const nextError = asError(caught);
      if (isMountedRef.current)
        setState({
          attempt,
          isSubmitting: false,
          isCompleted: false,
          error: nextError,
        });
      return Promise.resolve(false);
    }
  }, [attempt, input, runCommand]);

  const isCurrentState = state.attempt === attempt;
  return {
    isSubmitting: isCurrentState && state.isSubmitting,
    isCompleted: isCurrentState && state.isCompleted,
    error: isCurrentState ? state.error : null,
    submit,
    retry: submit,
  };
}
