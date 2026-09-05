import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isSupportedMetalsIsoCurrencyCode,
  resolveMetalsCurrencyMinorUnits,
} from "@monyvi/logic";

import type { DropdownItem } from "@/components/ui/Dropdown";
import type {
  MetalHoldingFormField,
  MetalHoldingFormPreview,
  MetalHoldingFormValues,
} from "@/components/metals/MetalHoldingForm";
import {
  calculateMetalHoldingPreviewDetails,
  calculateMetalHoldingPreviewValuation,
  type MetalHoldingPreviewRates,
} from "@/services/metal-holding-preview-service";
import {
  compareMetalHoldingEdit,
  type EditableMetalHoldingFacts,
} from "@/services/edit-metal-holding-preview-service";
import { evaluateMetalUnusualValuePolicy } from "@/services/metal-unusual-value-policy";
import {
  loadEditableMetalHolding,
  saveEditedMetalHolding,
  type EditMetalHoldingReadModel,
  type EditMetalHoldingRequestIds,
} from "@/services/edit-metal-holding-facade-service";
import {
  getSupportedMetalPurities,
  validateMetalHoldingForm,
  type MetalHoldingFormData,
  type MetalHoldingFormValidationContext,
  type NormalizedMetalHoldingFormData,
} from "@/validation/metal-holding-form-validation";

interface UseEditMetalHoldingInput {
  readonly holdingId: string | undefined;
  readonly locale: "en" | "ar";
  readonly today: string;
  readonly safeRange: MetalHoldingFormValidationContext["safeRange"];
  readonly getPreviewRates: (
    holding: NormalizedMetalHoldingFormData
  ) => MetalHoldingPreviewRates;
  readonly createId: () => string;
}
export interface UseEditMetalHoldingResult {
  readonly model: EditMetalHoldingReadModel | null;
  readonly values: MetalHoldingFormValues;
  readonly preview: MetalHoldingFormPreview;
  readonly purityOptions: ReadonlyArray<DropdownItem<string>>;
  readonly validationErrors: Readonly<Record<string, string>>;
  readonly correctionReason: string;
  readonly unusualValueAcknowledged: boolean;
  readonly requiresUnusualValueAcknowledgment: boolean;
  readonly comparison: ReturnType<typeof compareMetalHoldingEdit>;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly isDirty: boolean;
  readonly error: Error | null;
  readonly submitError: string | null;
  readonly updateField: (
    field: MetalHoldingFormField,
    value: string | null
  ) => void;
  readonly setCorrectionReason: (value: string) => void;
  readonly acknowledgeUnusualValue: () => void;
  readonly submit: () => Promise<boolean>;
  readonly retry: () => void;
}

const EMPTY_VALUES: MetalHoldingFormValues = {
  name: "",
  metal: "GOLD",
  weightGrams: "",
  purityCode: "gold-999",
  purchasePrice: "",
  purchaseCurrency: "EGP",
  purchaseDate: "",
  physicalForm: null,
  notes: "",
};
const EMPTY_FACTS: EditableMetalHoldingFacts = {
  name: "",
  notes: null,
  metal: "GOLD",
  weightGramsDecimal: "",
  purityCode: "gold-999",
  purityCatalogVersion: "1",
  purityFactorDecimal: "0.999",
  purchasePriceDecimal: "",
  purchaseCurrency: "EGP",
  purchaseDate: "",
  physicalForm: null,
};

export function useEditMetalHolding(
  input: UseEditMetalHoldingInput
): UseEditMetalHoldingResult {
  const [reloadKey, setReloadKey] = useState(0);
  const [model, setModel] = useState<EditMetalHoldingReadModel | null>(null);
  const [values, setValues] = useState<MetalHoldingFormValues>(EMPTY_VALUES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Readonly<Record<string, string>>
  >({});
  const [correctionReason, setCorrectionReason] = useState("");
  const [unusualValueAcknowledged, setUnusualValueAcknowledged] =
    useState(false);
  const idsRef = useRef<EditMetalHoldingRequestIds | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let isCancelled = false;
    if (!input.holdingId) {
      setError(new Error("metal_holding_not_found"));
      setIsLoading(false);
      return (): void => {
        isCancelled = true;
      };
    }
    setIsLoading(true);
    setError(null);
    void loadEditableMetalHolding(input.holdingId)
      .then((loaded) => {
        if (isCancelled) return;
        setModel(loaded);
        setValues(toValues(loaded.facts));
        setIsLoading(false);
      })
      .catch((caught: unknown) => {
        if (!isCancelled) {
          setError(
            caught instanceof Error
              ? caught
              : new Error("metal_holding_load_failed")
          );
          setIsLoading(false);
        }
      });
    return (): void => {
      isCancelled = true;
    };
  }, [input.holdingId, reloadKey]);

  const validationContext = useMemo<MetalHoldingFormValidationContext>(
    () => ({
      locale: input.locale,
      today: input.today,
      currencyMinorUnits: isSupportedMetalsIsoCurrencyCode(
        values.purchaseCurrency
      )
        ? (resolveMetalsCurrencyMinorUnits(
            `currency:${values.purchaseCurrency}`
          ) ?? 2)
        : 2,
      safeRange: input.safeRange,
      isUnusualValue: () => false,
      isUnusualHolding: (holding) => {
        const rates = input.getPreviewRates(holding);
        return evaluateMetalUnusualValuePolicy({
          metal: holding.metal,
          weightGramsDecimal: holding.weightGramsDecimal,
          purchasePriceDecimal: holding.purchasePriceDecimal,
          purchaseCurrencyUsdPerUnitDecimal: rates.currencyUsdPerUnitDecimal,
          egpUsdPerUnitDecimal: rates.egpUsdPerUnitDecimal ?? null,
        }).isUnusual;
      },
    }),
    [input, values.purchaseCurrency]
  );
  const validation = useMemo(
    () =>
      validateMetalHoldingForm(
        toValidation(values, unusualValueAcknowledged),
        validationContext
      ),
    [unusualValueAcknowledged, validationContext, values]
  );
  const currentFacts = useMemo(
    () => (model ? toRawFacts(values, model.facts) : EMPTY_FACTS),
    [model, values]
  );
  const comparison = useMemo(
    () =>
      compareMetalHoldingEdit({
        original: model?.facts ?? EMPTY_FACTS,
        current: currentFacts,
        holdingStatus: model?.status ?? "active",
      }),
    [currentFacts, model]
  );
  const preview = useMemo<MetalHoldingFormPreview>(() => {
    const normalized = validation.normalized;
    if (!normalized) return fallbackPreview(values);
    const rates = input.getPreviewRates(normalized);
    const purity = getSupportedMetalPurities(normalized.metal).find(
      (entry) => entry.code === normalized.purity.code
    );
    const valuation = calculateMetalHoldingPreviewValuation(normalized, rates);
    const currencyMinorUnits = isSupportedMetalsIsoCurrencyCode(
      normalized.purchaseCurrency
    )
      ? (resolveMetalsCurrencyMinorUnits(
          `currency:${normalized.purchaseCurrency}`
        ) ?? 2)
      : 2;
    return {
      metal: normalized.metal,
      purityCode: normalized.purity.code,
      purityLabel: purity?.displayLabel ?? normalized.purity.code,
      purityFactorDecimal: normalized.purity.factorDecimal,
      physicalForm: normalized.physicalForm,
      name: normalized.name,
      weightGramsDecimal: normalized.weightGramsDecimal,
      displayCurrency: normalized.purchaseCurrency,
      valuation,
      rateFreshness: rates.rateFreshness,
      metalUsdPerPureGramDecimal: rates.metalUsdPerPureGramDecimal,
      rateSources: rates.rateSources,
      providerObservedAt: rates.providerObservedAt,
      ...calculateMetalHoldingPreviewDetails(
        normalized,
        valuation,
        currencyMinorUnits
      ),
    };
  }, [input, validation.normalized, values]);
  const purityOptions = useMemo(
    () =>
      getSupportedMetalPurities(values.metal).map((entry) => ({
        value: entry.code,
        label: entry.displayLabel,
      })),
    [values.metal]
  );
  const isDirty =
    comparison.hasMetadataChanges || comparison.hasMaterialChanges;

  const updateField = useCallback(
    (field: MetalHoldingFormField, value: string | null): void => {
      if (field === "metal" || (value === null && field !== "physicalForm"))
        return;
      idsRef.current = null;
      setSubmitError(null);
      setValidationErrors({});
      setUnusualValueAcknowledged(false);
      setValues((current) =>
        field === "physicalForm"
          ? {
              ...current,
              physicalForm:
                value === "COIN" || value === "BAR" || value === "JEWELRY"
                  ? value
                  : null,
            }
          : { ...current, [field]: value }
      );
    },
    []
  );
  const submit = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current || !model || !isDirty) return false;
    const result = validateMetalHoldingForm(
      toValidation(values, unusualValueAcknowledged),
      validationContext
    );
    const errors: Record<string, string> = Object.fromEntries(
      Object.entries(result.errors).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
    if (!values.name.trim()) errors.name = "required";
    if (comparison.hasMaterialChanges && !correctionReason.trim())
      errors.correctionReason = "required";
    const normalizedCurrent = result.normalized
      ? toFacts(result.normalized)
      : currentFacts;
    if (
      (comparison.hasMaterialChanges &&
        (!result.normalized || !result.isValid)) ||
      Object.keys(errors).length > 0
    ) {
      setValidationErrors(errors);
      return false;
    }
    inFlightRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    idsRef.current ??= {
      actionId: input.createId(),
      actionEvidenceId: input.createId(),
      lifecycleEventId: input.createId(),
    };
    try {
      await saveEditedMetalHolding({
        ids: idsRef.current,
        original: model,
        current: normalizedCurrent,
        correctionReason: comparison.hasMaterialChanges
          ? correctionReason
          : null,
        cairoTodayDate: input.today,
      });
      idsRef.current = null;
      return true;
    } catch (caught: unknown) {
      setSubmitError(
        caught instanceof Error ? caught.message : "metal_edit_failed"
      );
      return false;
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }, [
    comparison.hasMaterialChanges,
    correctionReason,
    currentFacts,
    input,
    isDirty,
    model,
    unusualValueAcknowledged,
    validationContext,
    values,
  ]);

  return {
    model,
    values,
    preview,
    purityOptions,
    validationErrors,
    correctionReason,
    unusualValueAcknowledged,
    requiresUnusualValueAcknowledgment:
      validation.requiresUnusualValueAcknowledgment,
    comparison,
    isLoading,
    isSubmitting,
    isDirty,
    error,
    submitError,
    updateField,
    setCorrectionReason,
    acknowledgeUnusualValue: () => setUnusualValueAcknowledged(true),
    submit,
    retry: () => setReloadKey((value) => value + 1),
  };
}

function toValues(facts: EditableMetalHoldingFacts): MetalHoldingFormValues {
  return {
    name: facts.name,
    metal: facts.metal,
    weightGrams: facts.weightGramsDecimal,
    purityCode: facts.purityCode,
    purchasePrice: facts.purchasePriceDecimal,
    purchaseCurrency: facts.purchaseCurrency,
    purchaseDate: facts.purchaseDate,
    physicalForm: facts.physicalForm,
    notes: facts.notes ?? "",
  };
}
function toValidation(
  values: MetalHoldingFormValues,
  unusualValueAcknowledged: boolean
): MetalHoldingFormData {
  return {
    name: values.name,
    metal: values.metal,
    weightGrams: values.weightGrams,
    purityCode: values.purityCode,
    purchasePrice: values.purchasePrice,
    purchaseCurrency: values.purchaseCurrency,
    purchaseDate: values.purchaseDate,
    physicalForm: values.physicalForm,
    notes: values.notes,
    unusualValueAcknowledged,
  };
}
function toFacts(
  value: NormalizedMetalHoldingFormData
): EditableMetalHoldingFacts {
  return {
    name: value.name,
    notes: value.notes,
    metal: value.metal,
    weightGramsDecimal: value.weightGramsDecimal,
    purityCode: value.purity.code,
    purityCatalogVersion: value.purity.catalogVersion,
    purityFactorDecimal: value.purity.factorDecimal,
    purchasePriceDecimal: value.purchasePriceDecimal,
    purchaseCurrency: value.purchaseCurrency,
    purchaseDate: value.purchaseDate,
    physicalForm: value.physicalForm,
  };
}
function toRawFacts(
  values: MetalHoldingFormValues,
  original: EditableMetalHoldingFacts
): EditableMetalHoldingFacts {
  const purity = getSupportedMetalPurities(values.metal).find(
    (entry) => entry.code === values.purityCode
  );
  return {
    name: values.name,
    notes: values.notes.trim() || null,
    metal: original.metal,
    weightGramsDecimal: values.weightGrams,
    purityCode: values.purityCode,
    purityCatalogVersion: "1",
    purityFactorDecimal: purity?.factorDecimal ?? original.purityFactorDecimal,
    purchasePriceDecimal: values.purchasePrice,
    purchaseCurrency: values.purchaseCurrency,
    purchaseDate: values.purchaseDate,
    physicalForm: values.physicalForm,
  };
}
function fallbackPreview(
  values: MetalHoldingFormValues
): MetalHoldingFormPreview {
  const purity = getSupportedMetalPurities(values.metal).find(
    (entry) => entry.code === values.purityCode
  );
  return {
    metal: values.metal,
    purityCode: values.purityCode,
    purityLabel: purity?.displayLabel ?? values.purityCode,
    purityFactorDecimal: purity?.factorDecimal ?? "0",
    physicalForm: values.physicalForm,
    name: values.name || undefined,
    weightGramsDecimal: values.weightGrams || undefined,
    displayCurrency: values.purchaseCurrency,
    valuation: { available: false, reason: "missing_rate" },
  };
}
