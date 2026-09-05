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
import type {
  AddMetalHoldingFormSubmission,
  AddMetalHoldingRequestIds,
} from "@/services/add-metal-holding-facade-service";
import {
  calculateMetalHoldingPreviewDetails,
  calculateMetalHoldingPreviewValuation,
  type MetalHoldingPreviewRates,
} from "@/services/metal-holding-preview-service";
import { evaluateMetalUnusualValuePolicy } from "@/services/metal-unusual-value-policy";
import {
  observeLiveRatesTrust,
  type LiveRatesTrustReadModel,
  type LiveRatesTrustValue,
} from "@/services/live-rates-trust-read-model-service";
import { useDatabase } from "@/providers/DatabaseProvider";
import {
  getSupportedMetalPurities,
  validateMetalHoldingForm,
  type MetalHoldingFormData,
  type MetalHoldingFormValidationContext,
  type NormalizedMetalHoldingFormData,
  type SupportedMetalType,
} from "@/validation/metal-holding-form-validation";

export interface UseAddMetalHoldingFormInput {
  readonly locale: "en" | "ar";
  readonly preferredCurrency: string;
  readonly today: string;
  readonly currencyMinorUnits: number;
  readonly safeRange: MetalHoldingFormValidationContext["safeRange"];
  readonly previewRates: (
    holding: NormalizedMetalHoldingFormData
  ) => MetalHoldingPreviewRates;
  readonly isUnusualValue: MetalHoldingFormValidationContext["isUnusualValue"];
  readonly createId: () => string;
  readonly addHolding: (
    submission: AddMetalHoldingFormSubmission
  ) => Promise<void>;
}

export interface UseAddMetalHoldingFormResult {
  readonly values: MetalHoldingFormValues;
  readonly validationErrors: Readonly<Record<string, string>>;
  readonly preview: MetalHoldingFormPreview;
  readonly purityOptions: ReadonlyArray<DropdownItem<string>>;
  readonly isDirty: boolean;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly requiresUnusualValueAcknowledgment: boolean;
  readonly unusualValueAcknowledged: boolean;
  readonly updateField: (
    field: MetalHoldingFormField,
    value: string | null
  ) => void;
  readonly acknowledgeUnusualValue: () => void;
  readonly submit: () => Promise<string | null>;
}

export interface UseMetalAddPreviewRatesResult {
  readonly getPreviewRates: (
    holding: NormalizedMetalHoldingFormData
  ) => MetalHoldingPreviewRates;
}

function initialValues(
  input: UseAddMetalHoldingFormInput
): MetalHoldingFormValues {
  return {
    name: "",
    metal: "GOLD",
    weightGrams: "",
    purityCode: "gold-999",
    purchasePrice: "",
    purchaseCurrency: input.preferredCurrency,
    purchaseDate: input.today,
    physicalForm: null,
    notes: "",
  };
}

function createRequestIds(createId: () => string): AddMetalHoldingRequestIds {
  return {
    actionId: createId(),
    holdingId: createId(),
    holdingStateId: createId(),
    actionEvidenceId: createId(),
    lifecycleEventId: createId(),
    metalRateReferenceId: createId(),
    currencyRateReferenceId: createId(),
  };
}

function asValidationData(
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

function firstPurityCode(metal: SupportedMetalType): string {
  const first = getSupportedMetalPurities(metal).at(0);
  if (!first) throw new Error("metal_purity_catalog_empty");
  return first.code;
}

function fallbackPreview(
  values: MetalHoldingFormValues
): MetalHoldingFormPreview {
  const purity = getSupportedMetalPurities(values.metal).find(
    (entry) => entry.code === values.purityCode
  );
  return {
    metal: values.metal,
    purityCode: purity?.code ?? values.purityCode,
    purityLabel: purity?.displayLabel ?? "—",
    purityFactorDecimal: purity?.factorDecimal ?? "0",
    physicalForm: values.physicalForm,
    name: values.name.trim() || undefined,
    weightGramsDecimal: values.weightGrams || undefined,
    displayCurrency: values.purchaseCurrency,
    valuation: { available: false, reason: "missing_rate" },
  };
}

export function useAddMetalHoldingForm(
  input: UseAddMetalHoldingFormInput
): UseAddMetalHoldingFormResult {
  const [values, setValues] = useState<MetalHoldingFormValues>(() =>
    initialValues(input)
  );
  const [validationErrors, setValidationErrors] = useState<
    Readonly<Record<string, string>>
  >({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [unusualValueAcknowledged, setUnusualValueAcknowledged] =
    useState(false);
  const pendingIdsRef = useRef<AddMetalHoldingRequestIds | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (isDirty) return;
    setValues((current) =>
      current.purchaseCurrency === input.preferredCurrency
        ? current
        : { ...current, purchaseCurrency: input.preferredCurrency }
    );
  }, [input.preferredCurrency, isDirty]);

  const selectedCurrencyMinorUnits = isSupportedMetalsIsoCurrencyCode(
    values.purchaseCurrency
  )
    ? (resolveMetalsCurrencyMinorUnits(`currency:${values.purchaseCurrency}`) ??
      input.currencyMinorUnits)
    : input.currencyMinorUnits;

  const validationContext = useMemo<MetalHoldingFormValidationContext>(
    () => ({
      locale: input.locale,
      today: input.today,
      currencyMinorUnits: selectedCurrencyMinorUnits,
      safeRange: input.safeRange,
      isUnusualValue: input.isUnusualValue,
      isUnusualHolding: (holding) => {
        const previewRates = input.previewRates(holding);
        return evaluateMetalUnusualValuePolicy({
          metal: holding.metal,
          weightGramsDecimal: holding.weightGramsDecimal,
          purchasePriceDecimal: holding.purchasePriceDecimal,
          purchaseCurrencyUsdPerUnitDecimal:
            previewRates.currencyUsdPerUnitDecimal,
          egpUsdPerUnitDecimal: previewRates.egpUsdPerUnitDecimal ?? null,
        }).isUnusual;
      },
    }),
    [
      input,
      input.isUnusualValue,
      input.locale,
      input.previewRates,
      input.safeRange,
      input.today,
      selectedCurrencyMinorUnits,
    ]
  );
  const validation = useMemo(
    () =>
      validateMetalHoldingForm(
        asValidationData(values, unusualValueAcknowledged),
        validationContext
      ),
    [unusualValueAcknowledged, validationContext, values]
  );
  const preview = useMemo<MetalHoldingFormPreview>(() => {
    if (!validation.normalized) return fallbackPreview(values);
    const normalized = validation.normalized;
    const previewRates = input.previewRates(normalized);
    const valuation = calculateMetalHoldingPreviewValuation(
      normalized,
      previewRates
    );
    const details = calculateMetalHoldingPreviewDetails(
      normalized,
      valuation,
      previewRates.currencyMinorUnits
    );
    return {
      metal: normalized.metal,
      purityCode: normalized.purity.code,
      purityLabel:
        getSupportedMetalPurities(normalized.metal).find(
          (entry) => entry.code === normalized.purity.code
        )?.displayLabel ?? normalized.purity.code,
      purityFactorDecimal: normalized.purity.factorDecimal,
      physicalForm: normalized.physicalForm,
      name: normalized.name,
      weightGramsDecimal: normalized.weightGramsDecimal,
      displayCurrency: normalized.purchaseCurrency,
      valuation,
      rateFreshness: previewRates.rateFreshness,
      metalUsdPerPureGramDecimal: previewRates.metalUsdPerPureGramDecimal,
      rateSources: previewRates.rateSources,
      providerObservedAt: previewRates.providerObservedAt,
      ...details,
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

  const updateField = useCallback(
    (field: MetalHoldingFormField, value: string | null): void => {
      pendingIdsRef.current = null;
      setIsDirty(true);
      setSubmitError(null);
      setUnusualValueAcknowledged(false);
      setValidationErrors({});
      setValues((current) => {
        if (field === "metal" && (value === "GOLD" || value === "SILVER")) {
          return {
            ...current,
            metal: value,
            purityCode: firstPurityCode(value),
          };
        }
        if (field === "physicalForm") {
          return {
            ...current,
            physicalForm:
              value === "COIN" || value === "BAR" || value === "JEWELRY"
                ? value
                : null,
          };
        }
        if (value === null) return current;
        return { ...current, [field]: value };
      });
    },
    []
  );

  const submit = useCallback(async (): Promise<string | null> => {
    if (inFlightRef.current) return null;
    const result = validateMetalHoldingForm(
      asValidationData(values, unusualValueAcknowledged),
      validationContext
    );
    if (!result.isValid || !result.normalized) {
      const errors = Object.fromEntries(
        Object.entries(result.errors).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      );
      setValidationErrors(errors);
      return null;
    }

    inFlightRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    pendingIdsRef.current ??= createRequestIds(input.createId);
    const holdingId = pendingIdsRef.current.holdingId;
    try {
      await input.addHolding({
        ids: pendingIdsRef.current,
        holding: result.normalized,
        cairoTodayDate: input.today,
      });
      pendingIdsRef.current = null;
      setIsDirty(false);
      return holdingId;
    } catch (error: unknown) {
      setSubmitError(
        error instanceof Error ? error.message : "metal_add_failed"
      );
      return null;
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }, [input, unusualValueAcknowledged, validationContext, values]);

  return {
    values,
    validationErrors,
    preview,
    purityOptions,
    isDirty,
    isSubmitting,
    submitError,
    requiresUnusualValueAcknowledgment:
      validation.requiresUnusualValueAcknowledgment,
    unusualValueAcknowledged,
    updateField,
    acknowledgeUnusualValue: () => setUnusualValueAcknowledged(true),
    submit,
  };
}

function missingTrustReadModel(): LiveRatesTrustReadModel {
  const missing = (): LiveRatesTrustValue => ({
    state: "missing",
    ageMs: null,
    source: null,
    providerObservedAt: null,
    valueDecimal: null,
  });
  return { gold: missing(), silver: missing(), currencies: new Map() };
}

function availableRateValue(
  value: LiveRatesTrustValue | undefined
): string | null {
  if (
    !value ||
    value.state === "missing" ||
    value.state === "invalid" ||
    typeof value.valueDecimal !== "string"
  ) {
    return null;
  }
  return value.valueDecimal;
}

export function useMetalAddPreviewRates(): UseMetalAddPreviewRatesResult {
  const database = useDatabase();
  const [rates, setRates] = useState<LiveRatesTrustReadModel>(
    missingTrustReadModel
  );

  useEffect(() => {
    const subscription = observeLiveRatesTrust(database).subscribe({
      next: setRates,
      error: () => setRates(missingTrustReadModel()),
    });
    return (): void => subscription.unsubscribe();
  }, [database]);

  const getPreviewRates = useCallback(
    (holding: NormalizedMetalHoldingFormData): MetalHoldingPreviewRates => {
      if (!isSupportedMetalsIsoCurrencyCode(holding.purchaseCurrency)) {
        return {
          metalUsdPerPureGramDecimal: null,
          currencyUsdPerUnitDecimal: null,
          egpUsdPerUnitDecimal: null,
          currencyMinorUnits: 2,
          rateFreshness: "unavailable",
        };
      }
      const currencyMinorUnits = resolveMetalsCurrencyMinorUnits(
        `currency:${holding.purchaseCurrency}`
      );
      const metalRate = holding.metal === "GOLD" ? rates.gold : rates.silver;
      const currencyRate = rates.currencies.get(holding.purchaseCurrency);
      const egpRate = rates.currencies.get("EGP");
      return {
        metalUsdPerPureGramDecimal: availableRateValue(metalRate),
        currencyUsdPerUnitDecimal: availableRateValue(currencyRate),
        egpUsdPerUnitDecimal: availableRateValue(egpRate),
        currencyMinorUnits: currencyMinorUnits ?? 2,
        rateFreshness: combineRateFreshness([metalRate, currencyRate, egpRate]),
        rateSources: uniqueSources([metalRate, currencyRate]),
        providerObservedAt: oldestProviderObservation([
          metalRate,
          currencyRate,
        ]),
      };
    },
    [rates]
  );
  return { getPreviewRates };
}

function uniqueSources(
  values: ReadonlyArray<LiveRatesTrustValue | undefined>
): readonly string[] {
  return Array.from(
    new Set(
      values.flatMap((value) =>
        value?.source && availableRateValue(value) !== null
          ? [value.source]
          : []
      )
    )
  );
}

function oldestProviderObservation(
  values: ReadonlyArray<LiveRatesTrustValue | undefined>
): Date | null {
  if (
    values.some(
      (value) =>
        !value ||
        availableRateValue(value) === null ||
        value.providerObservedAt === null
    )
  ) {
    return null;
  }
  const timestamps = values.map((value) =>
    value!.providerObservedAt!.getTime()
  );
  return new Date(Math.min(...timestamps));
}

function combineRateFreshness(
  values: ReadonlyArray<LiveRatesTrustValue | undefined>
): "fresh" | "stale" | "unknown" | "unavailable" {
  if (
    values.some(
      (value) =>
        !value || value.state === "missing" || value.state === "invalid"
    )
  ) {
    return "unavailable";
  }
  if (values.some((value) => value?.state === "unknown")) return "unknown";
  if (values.some((value) => value?.state === "stale")) return "stale";
  return "fresh";
}
