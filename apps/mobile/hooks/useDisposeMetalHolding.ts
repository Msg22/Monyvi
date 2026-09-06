import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  DisposeCategory,
  DisposeMetalHoldingCommandInput,
  DisposeTreatment,
} from "@/services/dispose-metal-holding-command-service";

export interface DisposableMetalHoldingReadModel {
  readonly holdingId: string;
  readonly name: string;
  readonly userId: string;
  readonly status: "active" | "sold" | "disposed";
  readonly expectedFinancialRevision: string;
  readonly predecessorEventId: string | null;
}

export interface DisposeMetalHoldingFacadeDependencies {
  readonly loadHolding: (
    holdingId: string
  ) => Promise<DisposableMetalHoldingReadModel>;
  readonly disposeHolding: (
    input: DisposeMetalHoldingCommandInput
  ) => Promise<unknown>;
}

export interface UseDisposeMetalHoldingInput {
  readonly holdingId: string;
  readonly today: string;
  readonly createId: () => string;
  readonly dependencies: DisposeMetalHoldingFacadeDependencies;
}

export interface UseDisposeMetalHoldingResult {
  readonly model: DisposableMetalHoldingReadModel | null;
  readonly category: DisposeCategory | null;
  readonly otherTreatment: DisposeTreatment | null;
  readonly disposalDate: string;
  readonly notes: string;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly isDirty: boolean;
  readonly loadError: string | null;
  readonly submitError: string | null;
  readonly validationErrors: Readonly<Record<string, string>>;
  readonly setCategory: (value: DisposeCategory) => void;
  readonly setOtherTreatment: (value: DisposeTreatment) => void;
  readonly setDisposalDate: (value: string) => void;
  readonly setNotes: (value: string) => void;
  readonly submit: () => Promise<boolean>;
  readonly retryLoad: () => void;
}

interface StableRequestIds {
  readonly actionId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
}

function validate(
  category: DisposeCategory | null,
  otherTreatment: DisposeTreatment | null,
  disposalDate: string,
  today: string
): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  if (category === null) errors.category = "dispose_category_required";
  if (category === "other" && otherTreatment === null)
    errors.treatment = "dispose_other_treatment_required";
  if (!isCalendarDate(disposalDate) || disposalDate > today) {
    errors.disposalDate = "dispose_date_invalid";
  }
  return Object.freeze(errors);
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function toErrorCode(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

export function useDisposeMetalHolding(
  input: UseDisposeMetalHoldingInput
): UseDisposeMetalHoldingResult {
  const [reloadKey, setReloadKey] = useState(0);
  const [model, setModel] = useState<DisposableMetalHoldingReadModel | null>(
    null
  );
  const [category, setCategoryState] = useState<DisposeCategory | null>(null);
  const [otherTreatment, setOtherTreatmentState] =
    useState<DisposeTreatment | null>(null);
  const [disposalDate, setDisposalDateState] = useState(input.today);
  const [notes, setNotesState] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Readonly<Record<string, string>>
  >({});
  const idsRef = useRef<StableRequestIds | null>(null);
  const commandRef = useRef<DisposeMetalHoldingCommandInput | null>(null);
  const isInFlightRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setLoadError(null);
    void input.dependencies
      .loadHolding(input.holdingId)
      .then((loaded) => {
        if (isCancelled) return;
        setModel(loaded);
        setIsLoading(false);
      })
      .catch((caught: unknown) => {
        if (isCancelled) return;
        setModel(null);
        setLoadError(toErrorCode(caught, "metal_holding_load_failed"));
        setIsLoading(false);
      });
    return (): void => {
      isCancelled = true;
    };
  }, [input.dependencies, input.holdingId, reloadKey]);

  const invalidateIntent = useCallback((): void => {
    if (!isInFlightRef.current) {
      idsRef.current = null;
      commandRef.current = null;
    }
    setSubmitError(null);
    setValidationErrors({});
  }, []);

  const setCategory = useCallback(
    (value: DisposeCategory): void => {
      invalidateIntent();
      setCategoryState(value);
      if (value !== "other") setOtherTreatmentState(null);
    },
    [invalidateIntent]
  );
  const setOtherTreatment = useCallback(
    (value: DisposeTreatment): void => {
      invalidateIntent();
      setOtherTreatmentState(value);
    },
    [invalidateIntent]
  );
  const setDisposalDate = useCallback(
    (value: string): void => {
      invalidateIntent();
      setDisposalDateState(value);
    },
    [invalidateIntent]
  );
  const setNotes = useCallback(
    (value: string): void => {
      invalidateIntent();
      setNotesState(value);
    },
    [invalidateIntent]
  );

  const isDirty = useMemo(
    () =>
      category !== null ||
      otherTreatment !== null ||
      disposalDate !== input.today ||
      notes.length > 0,
    [category, disposalDate, input.today, notes.length, otherTreatment]
  );

  const submit = useCallback(async (): Promise<boolean> => {
    if (isInFlightRef.current) return false;
    const errors = validate(
      category,
      otherTreatment,
      disposalDate,
      input.today
    );
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0 || !model) return false;
    isInFlightRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      idsRef.current ??= {
        actionId: input.createId(),
        actionEvidenceId: input.createId(),
        lifecycleEventId: input.createId(),
      };
      commandRef.current ??= {
        ...idsRef.current,
        predecessorEventId: model.predecessorEventId,
        holdingId: model.holdingId,
        userId: model.userId,
        occurredAt: new Date().toISOString(),
        cairoTodayDate: input.today,
        expectedFinancialRevision: model.expectedFinancialRevision,
        disposalDate,
        category,
        otherTreatment,
        notes: notes.trim().length === 0 ? null : notes,
      };
      await input.dependencies.disposeHolding(commandRef.current);
      idsRef.current = null;
      commandRef.current = null;
      return true;
    } catch (caught: unknown) {
      if (isMountedRef.current)
        setSubmitError(toErrorCode(caught, "metal_holding_dispose_failed"));
      return false;
    } finally {
      isInFlightRef.current = false;
      if (isMountedRef.current) setIsSubmitting(false);
    }
  }, [category, disposalDate, input, model, notes, otherTreatment]);

  const retryLoad = useCallback(
    (): void => setReloadKey((value) => value + 1),
    []
  );

  return {
    model,
    category,
    otherTreatment,
    disposalDate,
    notes,
    isLoading,
    isSubmitting,
    isDirty,
    loadError,
    submitError,
    validationErrors,
    setCategory,
    setOtherTreatment,
    setDisposalDate,
    setNotes,
    submit,
    retryLoad,
  };
}
