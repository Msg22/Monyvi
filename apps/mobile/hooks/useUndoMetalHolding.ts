import { useCallback, useEffect, useRef, useState } from "react";

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
  return {
    actionId: input.createId(),
    actionEvidenceId: input.createId(),
    lifecycleEventId: input.createId(),
    predecessorEventId: input.currentTerminalEventId,
    reversesEventId: input.currentTerminalEventId,
    holdingId: input.holdingId,
    userId: input.userId,
    occurredAt: input.getOccurredAt(),
    expectedFinancialRevision: input.expectedFinancialRevision,
  };
}

export function useUndoMetalHolding(
  input: UseUndoMetalHoldingInput
): UseUndoMetalHoldingResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const commandRef = useRef<UndoMetalHoldingCommandInput | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  const runCommand = useCallback(
    (command: UndoMetalHoldingCommandInput): Promise<boolean> => {
      const current = inFlightRef.current;
      if (current) return current;
      setIsSubmitting(true);
      setError(null);
      const pending = input.service
        .undo(command)
        .then((): boolean => {
          if (isMountedRef.current) setIsCompleted(true);
          return true;
        })
        .catch((caught: unknown): boolean => {
          if (isMountedRef.current) setError(asError(caught));
          return false;
        })
        .finally((): void => {
          inFlightRef.current = null;
          if (isMountedRef.current) setIsSubmitting(false);
        });
      inFlightRef.current = pending;
      return pending;
    },
    [input.service]
  );

  const submit = useCallback((): Promise<boolean> => {
    const current = inFlightRef.current;
    if (current) return current;
    try {
      const command = commandRef.current ?? createCommand(input);
      commandRef.current = command;
      return runCommand(command);
    } catch (caught: unknown) {
      const nextError = asError(caught);
      if (isMountedRef.current) setError(nextError);
      return Promise.resolve(false);
    }
  }, [input, runCommand]);

  const retry = useCallback((): Promise<boolean> => {
    const command = commandRef.current;
    return command ? runCommand(command) : submit();
  }, [runCommand, submit]);

  return { isSubmitting, isCompleted, error, submit, retry };
}
