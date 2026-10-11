import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  SellMetalHoldingValues,
  SellMetalHoldingField,
  SellMetalHoldingPreviewState,
  SellMetalHoldingRequestIds,
  SellMetalHoldingHookCommand,
} from "@/services/sell-metal-holding-form-contract";

export type {
  SellMetalHoldingValues,
  SellMetalHoldingField,
  SellMetalHoldingPreviewState,
  SellMetalHoldingRequestIds,
  SellMetalHoldingHookCommand,
} from "@/services/sell-metal-holding-form-contract";

export interface UseSellMetalHoldingInput<
  TCommand extends SellMetalHoldingHookCommand = SellMetalHoldingHookCommand,
> {
  readonly intentKey?: string;
  readonly lockedSaleCurrency?: string;
  readonly initialValues: SellMetalHoldingValues;
  readonly buildPreview: (
    values: SellMetalHoldingValues
  ) => SellMetalHoldingPreviewState;
  readonly createCommand: (
    values: SellMetalHoldingValues,
    preview: SellMetalHoldingPreviewState,
    ids: SellMetalHoldingRequestIds
  ) => TCommand;
  readonly execute: (command: TCommand) => Promise<void>;
  readonly createId: () => string;
}

export interface UseSellMetalHoldingResult {
  readonly values: SellMetalHoldingValues;
  readonly preview: SellMetalHoldingPreviewState;
  readonly validationErrors: Readonly<Record<string, string>>;
  readonly isDirty: boolean;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly updateField: (
    field: SellMetalHoldingField,
    value: string | boolean
  ) => void;
  readonly submit: () => Promise<boolean>;
  readonly retry: () => Promise<boolean>;
}

function updateValues(
  current: SellMetalHoldingValues,
  field: SellMetalHoldingField,
  value: string | boolean
): SellMetalHoldingValues {
  if (field === "hasAcknowledgedRateRisk") {
    return typeof value === "boolean"
      ? { ...current, hasAcknowledgedRateRisk: value }
      : current;
  }
  if (typeof value !== "string") return current;
  switch (field) {
    case "saleDate":
      return { ...current, saleDate: value };
    case "grossProceedsDecimal":
      return { ...current, grossProceedsDecimal: value };
    case "saleCurrency":
      return { ...current, saleCurrency: value };
    case "feeDecimal":
      return { ...current, feeDecimal: value };
    case "notes":
      return { ...current, notes: value };
  }
}

export function useSellMetalHolding<
  TCommand extends SellMetalHoldingHookCommand,
>(input: UseSellMetalHoldingInput<TCommand>): UseSellMetalHoldingResult {
  const [values, setValues] = useState(input.initialValues);
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const idsRef = useRef<SellMetalHoldingRequestIds | null>(null);
  const isMountedRef = useRef(true);
  const commandRef = useRef<TCommand | null>(null);
  const hasCompletedRef = useRef(false);
  const intentKeyRef = useRef(input.intentKey);

  useEffect(() => {
    isMountedRef.current = true;
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  const effectiveValues = useMemo(
    (): SellMetalHoldingValues =>
      input.lockedSaleCurrency === undefined
        ? values
        : { ...values, saleCurrency: input.lockedSaleCurrency },
    [input.lockedSaleCurrency, values]
  );
  const preview = useMemo(
    () => input.buildPreview(effectiveValues),
    [input, effectiveValues]
  );
  useEffect(() => {
    if (intentKeyRef.current === input.intentKey || inFlightRef.current) return;
    intentKeyRef.current = input.intentKey;
    commandRef.current = null;
    idsRef.current = null;
    setSubmitError(null);
  }, [input.intentKey]);

  const updateField = useCallback(
    (field: SellMetalHoldingField, value: string | boolean): void => {
      if (inFlightRef.current || hasCompletedRef.current) return;
      commandRef.current = null;
      idsRef.current = null;
      setSubmitError(null);
      setIsDirty(true);
      setValues((current) => updateValues(current, field, value));
    },
    []
  );

  const submit = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current || hasCompletedRef.current || !preview.canSubmit)
      return false;
    inFlightRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      idsRef.current ??= {
        actionId: input.createId(),
        actionEvidenceId: input.createId(),
        lifecycleEventId: input.createId(),
      };
      commandRef.current ??= input.createCommand(
        effectiveValues,
        preview,
        idsRef.current
      );
      await input.execute(commandRef.current);
      hasCompletedRef.current = true;
      commandRef.current = null;
      idsRef.current = null;
      return true;
    } catch (caught: unknown) {
      if (isMountedRef.current) {
        setSubmitError(
          caught instanceof Error ? caught.message : "metal_sale_failed"
        );
      }
      return false;
    } finally {
      inFlightRef.current = false;
      if (isMountedRef.current) setIsSubmitting(false);
    }
  }, [input, preview, effectiveValues]);

  return {
    values: effectiveValues,
    preview,
    validationErrors: preview.validationErrors,
    isDirty,
    isSubmitting,
    submitError,
    updateField,
    submit,
    retry: submit,
  };
}
