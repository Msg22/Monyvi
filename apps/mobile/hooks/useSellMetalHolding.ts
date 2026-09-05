import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface SellMetalHoldingValues {
  readonly saleDate: string;
  readonly grossProceedsDecimal: string;
  readonly saleCurrency: string;
  readonly feeDecimal: string;
  readonly notes: string;
  readonly hasAcknowledgedRateRisk: boolean;
}

export type SellMetalHoldingField = keyof SellMetalHoldingValues;

export interface SellMetalHoldingPreviewState {
  readonly validationErrors: Readonly<Record<string, string>>;
  readonly netProceedsMinorUnits: string | null;
  readonly canSubmit: boolean;
}

export interface SellMetalHoldingRequestIds {
  readonly actionId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
}

export interface SellMetalHoldingHookCommand {
  readonly values: SellMetalHoldingValues;
  readonly preview: SellMetalHoldingPreviewState;
  readonly ids: SellMetalHoldingRequestIds;
}

export interface UseSellMetalHoldingInput {
  readonly initialValues: SellMetalHoldingValues;
  readonly buildPreview: (
    values: SellMetalHoldingValues
  ) => SellMetalHoldingPreviewState;
  readonly createCommand: (
    values: SellMetalHoldingValues,
    preview: SellMetalHoldingPreviewState,
    ids: SellMetalHoldingRequestIds
  ) => SellMetalHoldingHookCommand;
  readonly execute: (command: SellMetalHoldingHookCommand) => Promise<void>;
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

export function useSellMetalHolding(
  input: UseSellMetalHoldingInput
): UseSellMetalHoldingResult {
  const [values, setValues] = useState(input.initialValues);
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const idsRef = useRef<SellMetalHoldingRequestIds | null>(null);
  const isMountedRef = useRef(true);

  useEffect(
    () => (): void => {
      isMountedRef.current = false;
    },
    []
  );

  const preview = useMemo(() => input.buildPreview(values), [input, values]);

  const updateField = useCallback(
    (field: SellMetalHoldingField, value: string | boolean): void => {
      if (inFlightRef.current) return;
      idsRef.current = null;
      setSubmitError(null);
      setIsDirty(true);
      setValues((current) => updateValues(current, field, value));
    },
    []
  );

  const submit = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current || !preview.canSubmit) return false;
    inFlightRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    idsRef.current ??= {
      actionId: input.createId(),
      actionEvidenceId: input.createId(),
      lifecycleEventId: input.createId(),
    };
    const command = input.createCommand(values, preview, idsRef.current);
    try {
      await input.execute(command);
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
  }, [input, preview, values]);

  return {
    values,
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
