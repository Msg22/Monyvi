import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DISPOSE_RATE_ROLES,
  resolveDisposeTreatment,
  type DisposeCategory,
  type DisposeMetalHoldingCommandInput,
  type DisposeRateRole,
  type DisposeRateSnapshot,
  type DisposeRateSnapshotDraft,
  type DisposeTreatment,
} from "@/services/dispose-metal-holding-command-service";

export interface DisposableMetalHoldingReadModel {
  readonly holdingId: string;
  readonly name: string;
  readonly userId: string;
  readonly status: "active" | "sold" | "disposed";
  readonly expectedFinancialRevision: string;
  readonly predecessorEventId: string | null;
  readonly purchaseDate: string;
}

export interface DisposeMetalHoldingFacadeDependencies {
  readonly loadHolding: (
    holdingId: string
  ) => Promise<DisposableMetalHoldingReadModel>;
  readonly loadTerminalRateSnapshots: (
    holdingId: string
  ) => Promise<readonly DisposeRateSnapshotDraft[]>;
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
  readonly treatment: DisposeTreatment | null;
  readonly disposalDate: string;
  readonly notes: string;
  readonly terminalRates: readonly DisposeRateSnapshotDraft[];
  readonly requiresRateAcknowledgment: boolean;
  readonly rateAcknowledged: boolean;
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
  readonly setRateAcknowledged: (value: boolean) => void;
  readonly submit: () => Promise<boolean>;
  readonly retryLoad: () => void;
}

interface RetainedDisposeIntent {
  readonly holdingId: string;
  readonly command: DisposeMetalHoldingCommandInput;
}

function validate(
  category: DisposeCategory | null,
  otherTreatment: DisposeTreatment | null,
  disposalDate: string,
  today: string,
  purchaseDate: string | null,
  terminalRates: readonly DisposeRateSnapshotDraft[],
  rateAcknowledged: boolean
): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  if (category === null) errors.category = "dispose_category_required";
  if (category === "other" && otherTreatment === null)
    errors.treatment = "dispose_other_treatment_required";
  if (!isCalendarDate(disposalDate) || disposalDate > today) {
    errors.disposalDate = "dispose_date_invalid";
  } else if (purchaseDate !== null && disposalDate < purchaseDate) {
    errors.disposalDate = "dispose_date_before_acquisition";
  }
  if (
    terminalRates.some((rate) => rate.capturedFreshness !== "fresh") &&
    !rateAcknowledged
  ) {
    errors.rateAcknowledgment = "dispose_rate_acknowledgment_required";
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

function normalizeTerminalRates(
  drafts: readonly DisposeRateSnapshotDraft[]
): readonly DisposeRateSnapshotDraft[] {
  const byRole = new Map<DisposeRateRole, DisposeRateSnapshotDraft>();
  for (const draft of drafts) {
    if (
      !DISPOSE_RATE_ROLES.includes(draft.role) ||
      byRole.has(draft.role) ||
      (draft.role === "terminal_metal" && draft.kind !== "metal") ||
      (draft.role === "terminal_purchase_currency" && draft.kind !== "currency")
    ) {
      return Object.freeze([]);
    }
    byRole.set(draft.role, draft);
  }
  if (byRole.size !== DISPOSE_RATE_ROLES.length) return Object.freeze([]);
  const metal = byRole.get("terminal_metal");
  const currency = byRole.get("terminal_purchase_currency");
  if (!metal || !currency) return Object.freeze([]);
  return Object.freeze([metal, currency]);
}

function snapshotsFromDrafts(
  drafts: readonly DisposeRateSnapshotDraft[],
  createId: () => string
): readonly DisposeRateSnapshot[] {
  return drafts.map((draft) => ({ ...draft, referenceId: createId() }));
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
  const [terminalRates, setTerminalRates] = useState<
    readonly DisposeRateSnapshotDraft[]
  >([]);
  const [rateAcknowledged, setRateAcknowledgedState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Readonly<Record<string, string>>
  >({});
  const commandRef = useRef<RetainedDisposeIntent | null>(null);
  const requestedHoldingIdRef = useRef(input.holdingId);
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
    if (!isInFlightRef.current) commandRef.current = null;
    if (requestedHoldingIdRef.current !== input.holdingId) {
      requestedHoldingIdRef.current = input.holdingId;
      setRateAcknowledgedState(false);
      setCategoryState(null);
      setOtherTreatmentState(null);
      setDisposalDateState(input.today);
      setNotesState("");
      setValidationErrors({});
      setSubmitError(null);
    }
    void Promise.all([
      input.dependencies.loadHolding(input.holdingId),
      input.dependencies
        .loadTerminalRateSnapshots(input.holdingId)
        .catch((): readonly DisposeRateSnapshotDraft[] => []),
    ])
      .then(([loaded, drafts]) => {
        if (isCancelled) return;
        setModel(loaded);
        setTerminalRates(normalizeTerminalRates(drafts));
        setIsLoading(false);
      })
      .catch((caught: unknown) => {
        if (isCancelled) return;
        setModel(null);
        setTerminalRates([]);
        setLoadError(toErrorCode(caught, "metal_holding_load_failed"));
        setIsLoading(false);
      });
    return (): void => {
      isCancelled = true;
    };
  }, [input.dependencies, input.holdingId, input.today, reloadKey]);

  const invalidateIntent = useCallback((): void => {
    if (!isInFlightRef.current) commandRef.current = null;
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
  const setRateAcknowledged = useCallback((value: boolean): void => {
    setRateAcknowledgedState(value);
    setValidationErrors((current) => {
      if (!("rateAcknowledgment" in current)) return current;
      const next = { ...current };
      delete next.rateAcknowledgment;
      return Object.freeze(next);
    });
  }, []);

  const isDirty = useMemo(
    () =>
      category !== null ||
      otherTreatment !== null ||
      disposalDate !== input.today ||
      notes.length > 0,
    [category, disposalDate, input.today, notes.length, otherTreatment]
  );
  const treatment = useMemo(
    () => resolveDisposeTreatment(category, otherTreatment),
    [category, otherTreatment]
  );
  const requiresRateAcknowledgment = useMemo(
    () => terminalRates.some((rate) => rate.capturedFreshness !== "fresh"),
    [terminalRates]
  );

  const submit = useCallback(async (): Promise<boolean> => {
    if (isInFlightRef.current) return false;
    const errors = validate(
      category,
      otherTreatment,
      disposalDate,
      input.today,
      model?.purchaseDate ?? null,
      terminalRates,
      rateAcknowledged
    );
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0 || !model) return false;
    isInFlightRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      if (
        commandRef.current === null ||
        commandRef.current.holdingId !== model.holdingId
      ) {
        commandRef.current = {
          holdingId: model.holdingId,
          command: {
            actionId: input.createId(),
            actionEvidenceId: input.createId(),
            lifecycleEventId: input.createId(),
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
            rateSnapshots: snapshotsFromDrafts(terminalRates, input.createId),
          },
        };
      }
      await input.dependencies.disposeHolding(commandRef.current.command);
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
  }, [
    category,
    disposalDate,
    input,
    model,
    notes,
    otherTreatment,
    rateAcknowledged,
    terminalRates,
  ]);

  const retryLoad = useCallback(
    (): void => setReloadKey((value) => value + 1),
    []
  );

  return {
    model,
    category,
    otherTreatment,
    treatment,
    disposalDate,
    notes,
    terminalRates,
    requiresRateAcknowledgment,
    rateAcknowledged,
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
    setRateAcknowledged,
    submit,
    retryLoad,
  };
}
