import { useCallback, useEffect, useRef, useState } from "react";

export interface DeleteMetalHoldingRequestIds {
  readonly actionId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
}

export interface DeleteMetalHoldingHookCommand {
  readonly ids: DeleteMetalHoldingRequestIds;
}

export interface UseDeleteMetalHoldingInput {
  readonly createCommand: (
    ids: DeleteMetalHoldingRequestIds
  ) => DeleteMetalHoldingHookCommand;
  readonly execute: (command: DeleteMetalHoldingHookCommand) => Promise<void>;
  readonly createId: () => string;
}

export interface UseDeleteMetalHoldingResult {
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly submit: () => Promise<boolean>;
  readonly retry: () => Promise<boolean>;
}

export function useDeleteMetalHolding(
  input: UseDeleteMetalHoldingInput
): UseDeleteMetalHoldingResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const idsRef = useRef<DeleteMetalHoldingRequestIds | null>(null);
  const isMountedRef = useRef(true);

  useEffect((): (() => void) => {
    isMountedRef.current = true;
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  const submit = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    idsRef.current ??= {
      actionId: input.createId(),
      actionEvidenceId: input.createId(),
      lifecycleEventId: input.createId(),
    };
    const command = input.createCommand(idsRef.current);
    try {
      await input.execute(command);
      idsRef.current = null;
      return true;
    } catch (caught: unknown) {
      if (isMountedRef.current) {
        setSubmitError(
          caught instanceof Error ? caught.message : "metal_delete_failed"
        );
      }
      return false;
    } finally {
      inFlightRef.current = false;
      if (isMountedRef.current) setIsSubmitting(false);
    }
  }, [input]);

  return {
    isSubmitting,
    submitError,
    submit,
    retry: submit,
  };
}
