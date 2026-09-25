import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { PageHeader } from "@/components/navigation/PageHeader";
import { Dropdown, type DropdownItem } from "@/components/ui/Dropdown";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { palette } from "@/constants/colors";
import { shouldUseCompactLayout } from "@/constants/ui";

import { MetalHoldingLivePreview } from "./MetalHoldingLivePreview";
import { MetalHoldingCorrectionState } from "./MetalHoldingCorrectionState";
import {
  MetalSelector,
  PhysicalFormSelector,
} from "./MetalHoldingFormSelectors";

export type MetalHoldingFormField =
  | "name"
  | "metal"
  | "weightGrams"
  | "purityCode"
  | "purchasePrice"
  | "purchaseCurrency"
  | "purchaseDate"
  | "physicalForm"
  | "notes";

export interface MetalHoldingFormValues {
  readonly name: string;
  readonly metal: "GOLD" | "SILVER";
  readonly weightGrams: string;
  readonly purityCode: string;
  readonly purchasePrice: string;
  readonly purchaseCurrency: string;
  readonly purchaseDate: string;
  readonly physicalForm: "COIN" | "BAR" | "JEWELRY" | null;
  readonly notes: string;
}

export interface MetalHoldingFormPreview {
  readonly metal: "GOLD" | "SILVER";
  readonly purityCode: string;
  readonly purityLabel: string;
  readonly purityFactorDecimal: string;
  readonly physicalForm: "COIN" | "BAR" | "JEWELRY" | null;
  readonly name?: string;
  readonly weightGramsDecimal?: string;
  readonly displayCurrency?: string;
  readonly rateFreshness?: "fresh" | "stale" | "unknown" | "unavailable";
  readonly metalUsdPerPureGramDecimal?: string | null;
  readonly rateSources?: readonly string[];
  readonly providerObservedAt?: Date | null;
  readonly metalRateTrust?: MetalHoldingPreviewRateTrust;
  readonly fxRateTrust?: MetalHoldingPreviewRateTrust;
  readonly resultSincePurchaseDecimal?: string | null;
  readonly resultDirection?: "positive" | "negative" | "zero" | "unavailable";
  readonly purityPercentDecimal?: string;
  readonly valuation:
    | { readonly available: true; readonly valueDecimal: string }
    | { readonly available: false; readonly reason: "missing_rate" };
}

export interface MetalHoldingPreviewRateTrust {
  readonly valueDecimal: string | null;
  readonly state: "fresh" | "stale" | "unknown" | "missing" | "invalid";
  readonly ageMs: number | null;
  readonly source: string | null;
  readonly quality: string | null;
  readonly providerObservedAt: Date | null;
}

export interface MetalHoldingFormCopy {
  readonly title: string;
  readonly back: string;
  readonly name: string;
  readonly namePlaceholder: string;
  readonly metal: string;
  readonly gold: string;
  readonly silver: string;
  readonly weight: string;
  readonly purity: string;
  readonly purchasePrice: string;
  readonly purchasePriceHint: string;
  readonly purchaseCurrency: string;
  readonly purchaseDate: string;
  readonly physicalForm: string;
  readonly coin: string;
  readonly bar: string;
  readonly jewelry: string;
  readonly notes: string;
  readonly notesPlaceholder: string;
  readonly preview: string;
  readonly valuationUnavailable: string;
  readonly savedLocally: string;
  readonly submit: string;
  readonly submitting: string;
  readonly unusualValue: string;
  readonly acknowledge: string;
  readonly staleRateAcknowledgment: string;
  readonly submitFailed: string;
  readonly rateFresh: string;
  readonly rateStale: string;
  readonly rateUnknown: string;
  readonly rateUnavailable: string;
  readonly pure: string;
  readonly perPureGram: string;
  readonly estimatedGainSincePurchase: string;
  readonly estimatedLossSincePurchase: string;
  readonly ratesUpdated: string;
  readonly rateFreshnessUnknown?: string;
  readonly rateAgeUnavailable?: string;
  readonly rateObservationUnavailable?: string;
  readonly rateJustNow?: string;
  readonly metalRateLabel?: string;
  readonly fxRateLabel?: string;
  readonly unknownRateSource?: string;
  readonly unknownRateQuality?: string;
  readonly correctionReason?: string;
  readonly whatWillChange?: string;
  readonly previous?: string;
  readonly current?: string;
  readonly correctionHistory?: string;
  readonly noFinancialChange?: string;
  readonly unchangedGain?: string;
  readonly unchangedLoss?: string;
  readonly unchangedResult?: string;
  readonly imageDescriptionUpdate?: string;
  readonly reconciliationIncomplete?: string;
  readonly retry?: string;
  readonly editTitle?: string;
  readonly editSubmit?: string;
  readonly editSubmitting?: string;
  readonly lockedMetalHint?: string;
  readonly cancel?: string;
}

export interface MetalHoldingEditChange {
  readonly field: string;
  readonly label: string;
  readonly before: string;
  readonly after: string;
  readonly isFinancial: boolean;
}

export interface MetalHoldingFormEditState {
  readonly affectedChanges: readonly MetalHoldingEditChange[];
  readonly correctionReason: string;
}

export interface MetalHoldingFormProps {
  readonly mode?: "add" | "edit";
  readonly holdingStatus?: "active" | "sold" | "disposed";
  readonly reconciliationState?: string;
  readonly onRetryReconciliation?: () => void;
  readonly editState?: MetalHoldingFormEditState;
  readonly locale: "en" | "ar";
  readonly isRtl: boolean;
  readonly width: number;
  readonly fontScale: number;
  readonly bottomInset: number;
  readonly isLoading?: boolean;
  readonly isSubmitting?: boolean;
  readonly values?: MetalHoldingFormValues;
  readonly copy?: MetalHoldingFormCopy;
  readonly purityOptions?: ReadonlyArray<DropdownItem<string>>;
  readonly currencyOptions?: ReadonlyArray<DropdownItem<string>>;
  readonly validationErrors?: Readonly<Record<string, string>>;
  readonly submitError?: string | null;
  readonly requiresUnusualValueAcknowledgment?: boolean;
  readonly unusualValueAcknowledged?: boolean;
  readonly requiresStaleRateAcknowledgment?: boolean;
  readonly staleRateAcknowledged?: boolean;
  readonly preview: MetalHoldingFormPreview;
  readonly onChange: (
    field: MetalHoldingFormField,
    value: string | null
  ) => void;
  readonly onSubmit: () => void;
  readonly onRequestExit: () => void;
  readonly onAcknowledgeUnusualValue?: () => void;
  readonly onAcknowledgeStaleRate?: () => void;
  readonly onCorrectionReasonChange?: (value: string) => void;
}

const DEFAULT_VALUES: MetalHoldingFormValues = {
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

const DEFAULT_COPY: MetalHoldingFormCopy = {
  title: "Add holding",
  back: "Back",
  name: "Holding name",
  namePlaceholder: "e.g. Savings coin",
  metal: "Metal",
  gold: "Gold",
  silver: "Silver",
  weight: "Weight in grams",
  purity: "Purity",
  purchasePrice: "Total purchase price",
  purchasePriceHint:
    "Include workmanship, dealer premium, and other purchase costs.",
  purchaseCurrency: "Purchase currency",
  purchaseDate: "Purchase date",
  physicalForm: "Physical form (optional)",
  coin: "Coin",
  bar: "Bar",
  jewelry: "Jewelry",
  notes: "Notes (optional)",
  notesPlaceholder: "Add a note",
  preview: "Estimated value",
  valuationUnavailable: "Valuation unavailable",
  savedLocally:
    "Saved on this device first. It will sync when a connection is available.",
  submit: "Add holding",
  submitting: "Adding holding",
  unusualValue: "This value is unusually large. Review it before continuing.",
  acknowledge: "I reviewed it",
  staleRateAcknowledgment:
    "This estimate uses an older saved rate. Review it before continuing.",
  submitFailed: "We couldn't add this holding. Try again.",
  rateFresh: "Rates are current",
  rateStale: "Using an older saved rate",
  rateUnknown: "Rate age is unavailable",
  rateUnavailable: "Some rate details are unavailable",
  pure: "pure",
  perPureGram: "per pure gram",
  estimatedGainSincePurchase: "estimated gain since purchase",
  estimatedLossSincePurchase: "estimated loss since purchase",
  ratesUpdated: "Rates updated",
  rateFreshnessUnknown: "Freshness unknown",
  rateAgeUnavailable: "Rate age is unavailable",
  rateObservationUnavailable: "Observation time unavailable",
  rateJustNow: "just now",
  unchangedResult: "Your result since purchase stays",
};

const DEFAULT_PURITY_OPTIONS: ReadonlyArray<DropdownItem<string>> = [
  { value: "gold-999", label: "24K · 999" },
];
const DEFAULT_CURRENCY_OPTIONS: ReadonlyArray<DropdownItem<string>> = [
  { value: "EGP", label: "EGP" },
];
const FIELD_ORDER = [
  "metal-holding-name-field",
  "metal-holding-metal-field",
  "metal-holding-weight-purity-row",
  "metal-holding-purchase-price-field",
  "metal-holding-purchase-currency-field",
  "metal-holding-purchase-date-field",
  "metal-holding-physical-form-field",
  "metal-holding-notes-field",
  "metal-holding-live-preview",
  "metal-holding-local-first-status",
  "metal-holding-submit",
] as const;
const FOCUSABLE_ERROR_ORDER = [
  ["name", "metal-holding-name-field"],
  ["weightGrams", "metal-holding-weight-field"],
  ["purchasePrice", "metal-holding-purchase-price-field"],
  ["purchaseDate", "metal-holding-purchase-date-field"],
  ["correctionReason", "metal-holding-correction-reason"],
] as const;

export function MetalHoldingForm({
  mode = "add",
  holdingStatus = "active",
  reconciliationState,
  onRetryReconciliation,
  editState,
  locale,
  isRtl,
  width,
  fontScale,
  bottomInset,
  isLoading = false,
  isSubmitting = false,
  values = DEFAULT_VALUES,
  copy = DEFAULT_COPY,
  purityOptions = DEFAULT_PURITY_OPTIONS,
  currencyOptions = DEFAULT_CURRENCY_OPTIONS,
  validationErrors = {},
  submitError = null,
  requiresUnusualValueAcknowledgment = false,
  unusualValueAcknowledged = false,
  requiresStaleRateAcknowledgment = false,
  staleRateAcknowledged = false,
  preview,
  onChange,
  onSubmit,
  onRequestExit,
  onAcknowledgeUnusualValue,
  onAcknowledgeStaleRate,
  onCorrectionReasonChange,
}: MetalHoldingFormProps): React.JSX.Element {
  const [isPurityOpen, setIsPurityOpen] = useState(false);
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const shouldStackDenseFields = shouldUseCompactLayout(width, fontScale);
  const nameInputRef = useRef<TextInput>(null);
  const weightInputRef = useRef<TextInput>(null);
  const purchasePriceInputRef = useRef<TextInput>(null);
  const correctionReasonInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (validationErrors.name) {
      nameInputRef.current?.focus();
    } else if (validationErrors.weightGrams) {
      weightInputRef.current?.focus();
    } else if (validationErrors.purchasePrice) {
      purchasePriceInputRef.current?.focus();
    } else if (validationErrors.correctionReason) {
      correctionReasonInputRef.current?.focus();
    }
  }, [validationErrors]);

  const firstError = useMemo(
    () => FOCUSABLE_ERROR_ORDER.find(([field]) => validationErrors[field])?.[1],
    [validationErrors]
  );
  const submit = useCallback((): void => {
    if (!isSubmitting) onSubmit();
  }, [isSubmitting, onSubmit]);
  const requestExit = useCallback((): void => {
    if (!isSubmitting) onRequestExit();
  }, [isSubmitting, onRequestExit]);
  const handlePurchaseDateChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date): void => {
      if (event.type === "dismissed") {
        setIsDatePickerOpen(false);
        return;
      }
      setIsDatePickerOpen(Platform.OS === "ios");
      if (selectedDate)
        onChange("purchaseDate", toDateOnlyString(selectedDate));
    },
    [onChange]
  );
  const formMetadata: {
    readonly fieldOrder: typeof FIELD_ORDER;
    readonly writingDirection: "rtl" | "ltr";
  } = {
    fieldOrder: FIELD_ORDER,
    writingDirection: isRtl ? "rtl" : "ltr",
  };
  const submitAreaMetadata: { readonly bottomInset: number } = { bottomInset };
  const isTerminalEdit = mode === "edit" && holdingStatus !== "active";
  const isReconciliationIncomplete =
    mode === "edit" && reconciliationState === "reconciliation_incomplete";
  const isMaterialEditDisabled = isTerminalEdit || isReconciliationIncomplete;
  const hasMaterialChanges = Boolean(editState?.affectedChanges.length);
  const title =
    mode === "edit" ? (copy.editTitle ?? "Edit holding") : copy.title;
  const submitLabel =
    mode === "edit" ? (copy.editSubmit ?? "Save changes") : copy.submit;
  const submittingLabel =
    mode === "edit"
      ? (copy.editSubmitting ?? "Saving changes")
      : copy.submitting;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-25 dark:bg-slate-950"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      testID="metal-holding-form"
      accessibilityLanguage={locale}
      {...formMetadata}
    >
      <View
        testID={
          mode === "edit"
            ? "metal-holding-edit-screen"
            : "metal-holding-add-form"
        }
      />
      <PageHeader
        title={title}
        showDrawer={false}
        showBackButton
        onBack={requestExit}
        backAccessibilityLabel={copy.back}
      />

      {isLoading ? (
        <FormSkeleton />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 px-5 pb-6"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TextField
            testID="metal-holding-name-field"
            inputRef={nameInputRef}
            label={copy.name}
            accessibilityLabel={copy.name}
            value={values.name}
            editable={!isSubmitting}
            placeholder={copy.namePlaceholder}
            onChangeText={(value) => onChange("name", value)}
            error={validationErrors.name}
            autoFocus={firstError === "metal-holding-name-field"}
            aria-invalid={Boolean(validationErrors.name)}
            maxLength={100}
            containerClassName=""
          />

          <MetalSelector
            copy={copy}
            value={values.metal}
            onChange={onChange}
            isLocked={mode === "edit"}
            isDisabled={isSubmitting}
          />

          {isReconciliationIncomplete ? (
            <View
              testID="metal-holding-reconciliation-incomplete-banner"
              className="gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40"
            >
              <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
                {copy.reconciliationIncomplete ??
                  "Changes are still being checked. The last complete state remains active."}
              </Text>
              {onRetryReconciliation ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  testID="metal-holding-reconciliation-retry"
                  className="min-h-11 justify-center"
                  onPress={onRetryReconciliation}
                >
                  <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-400">
                    {copy.retry ?? "Retry"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {!isMaterialEditDisabled ? (
            <View
              testID="metal-holding-weight-purity-section"
              className="gap-2"
            >
              <View
                testID={
                  shouldStackDenseFields
                    ? "metal-holding-weight-purity-stacked"
                    : "metal-holding-weight-purity-row"
                }
                accessibilityRole="none"
                className={shouldStackDenseFields ? "gap-5" : "flex-row gap-3"}
              >
                <TextField
                  testID="metal-holding-weight-field"
                  inputRef={weightInputRef}
                  containerClassName="flex-1"
                  label={copy.weight}
                  accessibilityLabel={copy.weight}
                  value={values.weightGrams}
                  editable={!isSubmitting}
                  onChangeText={(value) => onChange("weightGrams", value)}
                  error={validationErrors.weightGrams}
                  autoFocus={firstError === "metal-holding-weight-field"}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  trailingAdornment={
                    <Text className="text-base text-text-secondary dark:text-text-secondary-dark">
                      g
                    </Text>
                  }
                />
                <View className="flex-1">
                  <Dropdown
                    testID="metal-holding-purity"
                    label={copy.purity}
                    items={purityOptions}
                    value={values.purityCode}
                    onChange={(value) => {
                      setIsPurityOpen(false);
                      onChange("purityCode", value);
                    }}
                    isOpen={isPurityOpen}
                    onToggle={() => setIsPurityOpen((open) => !open)}
                    disabled={isSubmitting}
                    className="mb-0"
                  />
                </View>
              </View>
              <PreviousValueCue
                change={findAffectedChange(editState, "weight")}
                copy={copy}
              />
              <PreviousValueCue
                change={findAffectedChange(editState, "purity")}
                copy={copy}
              />
            </View>
          ) : null}

          {!isMaterialEditDisabled ? (
            <View>
              <TextField
                testID="metal-holding-purchase-price-field"
                inputRef={purchasePriceInputRef}
                label={copy.purchasePrice}
                value={values.purchasePrice}
                editable={!isSubmitting}
                onChangeText={(value) => onChange("purchasePrice", value)}
                error={validationErrors.purchasePrice}
                autoFocus={firstError === "metal-holding-purchase-price-field"}
                keyboardType="decimal-pad"
                inputMode="decimal"
                leadingAdornment={
                  <Text className="text-sm font-semibold text-text-secondary dark:text-text-secondary-dark">
                    {values.purchaseCurrency}
                  </Text>
                }
                containerClassName=""
              />
              <Text className="mt-1 text-xs text-text-muted dark:text-text-muted-dark">
                {copy.purchasePriceHint}
              </Text>
              <PreviousValueCue
                change={findAffectedChange(editState, "purchasePrice")}
                copy={copy}
              />
            </View>
          ) : null}

          {!isMaterialEditDisabled ? (
            <View testID="metal-holding-purchase-currency-field">
              <Dropdown
                label={copy.purchaseCurrency}
                items={currencyOptions}
                value={values.purchaseCurrency}
                onChange={(value) => {
                  setIsCurrencyOpen(false);
                  onChange("purchaseCurrency", value);
                }}
                isOpen={isCurrencyOpen}
                onToggle={() => setIsCurrencyOpen((open) => !open)}
                disabled={isSubmitting}
                className="mb-0"
              />
              <PreviousValueCue
                change={findAffectedChange(editState, "purchaseCurrency")}
                copy={copy}
              />
            </View>
          ) : null}

          {!isMaterialEditDisabled ? (
            <View>
              <TouchableOpacity
                testID="metal-holding-purchase-date-field"
                accessibilityRole="button"
                accessibilityLabel={copy.purchaseDate}
                disabled={isSubmitting}
                onPress={() => setIsDatePickerOpen((isOpen) => !isOpen)}
              >
                <View pointerEvents="none">
                  <TextField
                    testID="metal-holding-purchase-date-input"
                    label={copy.purchaseDate}
                    value={formatPurchaseDate(values.purchaseDate, locale)}
                    editable={false}
                    error={validationErrors.purchaseDate}
                    placeholder="YYYY-MM-DD"
                    autoCapitalize="none"
                    trailingAdornment={
                      <Ionicons
                        name="calendar-outline"
                        size={20}
                        color={palette.slate[500]}
                      />
                    }
                    containerClassName=""
                  />
                </View>
              </TouchableOpacity>
              <PreviousValueCue
                change={findAffectedChange(editState, "purchaseDate")}
                copy={copy}
              />
            </View>
          ) : null}

          {isDatePickerOpen && !isMaterialEditDisabled && !isSubmitting ? (
            <DateTimePicker
              testID="metal-holding-purchase-date-picker"
              value={parsePurchaseDate(values.purchaseDate) ?? new Date()}
              maximumDate={new Date()}
              mode="date"
              display="default"
              onChange={handlePurchaseDateChange}
            />
          ) : null}

          {!isMaterialEditDisabled ? (
            <View>
              <PhysicalFormSelector
                copy={copy}
                value={values.physicalForm}
                metal={values.metal}
                isStacked={shouldStackDenseFields}
                isDisabled={isSubmitting}
                onChange={onChange}
              />
              <PreviousValueCue
                change={findAffectedChange(editState, "physicalForm")}
                copy={copy}
              />
            </View>
          ) : null}

          <TextField
            testID="metal-holding-notes-field"
            label={copy.notes}
            value={values.notes}
            editable={!isSubmitting}
            onChangeText={(value) => onChange("notes", value)}
            placeholder={copy.notesPlaceholder}
            multiline
            maxLength={500}
            containerClassName=""
          />

          {mode === "edit" && hasMaterialChanges && editState ? (
            <MetalHoldingCorrectionState
              copy={copy}
              state={editState}
              currency={preview.displayCurrency ?? ""}
              locale={locale}
              currentValue={
                preview.valuation.available
                  ? preview.valuation.valueDecimal
                  : null
              }
              resultSincePurchase={preview.resultSincePurchaseDecimal ?? null}
              resultDirection={preview.resultDirection}
              reasonError={validationErrors.correctionReason}
              onReasonChange={onCorrectionReasonChange}
              isDisabled={isSubmitting}
              autoFocus={firstError === "metal-holding-correction-reason"}
              inputRef={correctionReasonInputRef}
            />
          ) : null}

          {!isMaterialEditDisabled ? (
            <MetalHoldingLivePreview
              copy={copy}
              preview={preview}
              isStacked={shouldStackDenseFields}
              locale={locale}
            />
          ) : null}

          {requiresUnusualValueAcknowledgment ? (
            <View className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
              <Text className="text-sm text-amber-900 dark:text-amber-100">
                {copy.unusualValue}
              </Text>
              {!unusualValueAcknowledged ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={onAcknowledgeUnusualValue}
                  className="mt-3 min-h-11 items-center justify-center rounded-xl border border-amber-700 px-4"
                >
                  <Text className="font-semibold text-amber-900 dark:text-amber-100">
                    {copy.acknowledge}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {requiresStaleRateAcknowledgment ? (
            <View
              testID="metal-holding-stale-rate-acknowledgment"
              className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950"
            >
              <Text className="text-sm text-amber-900 dark:text-amber-100">
                {copy.staleRateAcknowledgment}
              </Text>
              {!staleRateAcknowledged ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={onAcknowledgeStaleRate}
                  className="mt-3 min-h-11 items-center justify-center rounded-xl border border-amber-700 px-4"
                >
                  <Text className="font-semibold text-amber-900 dark:text-amber-100">
                    {copy.acknowledge}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {submitError ? (
            <Text
              accessibilityRole="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {copy.submitFailed}
            </Text>
          ) : null}

          <View
            testID="metal-holding-local-first-status"
            className="flex-row items-start gap-2 px-1"
          >
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={palette.nileGreen[700]}
            />
            <Text className="flex-1 text-xs leading-5 text-text-secondary dark:text-text-secondary-dark">
              {copy.savedLocally}
            </Text>
          </View>
        </ScrollView>
      )}

      <View
        testID="metal-holding-submit-area"
        className="border-t border-slate-200 bg-slate-25 px-5 pt-3 dark:border-slate-800 dark:bg-slate-950"
        style={{ paddingBottom: bottomInset + 12 }}
        {...submitAreaMetadata}
      >
        <TouchableOpacity
          testID="metal-holding-submit"
          accessibilityRole="button"
          accessibilityLabel={isSubmitting ? submittingLabel : submitLabel}
          accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
          disabled={isSubmitting}
          onPress={submit}
          className="min-h-12 items-center justify-center rounded-2xl bg-nileGreen-700 px-5 py-3 dark:bg-nileGreen-500"
          style={isSubmitting ? { opacity: 0.55 } : undefined}
        >
          <Text className="text-base font-bold text-slate-25 dark:text-slate-950">
            {isSubmitting ? submittingLabel : submitLabel}
          </Text>
        </TouchableOpacity>
        {mode === "edit" ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={copy.cancel ?? "Cancel"}
            disabled={isSubmitting}
            onPress={onRequestExit}
            className="mt-3 min-h-12 items-center justify-center rounded-2xl border border-nileGreen-700 px-5 py-3 dark:border-nileGreen-400"
            style={isSubmitting ? { opacity: 0.55 } : undefined}
          >
            <Text className="text-base font-semibold text-nileGreen-700 dark:text-nileGreen-400">
              {copy.cancel ?? "Cancel"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}


function PreviousValueCue({
  change,
  copy,
}: {
  readonly change: MetalHoldingEditChange | null;
  readonly copy: MetalHoldingFormCopy;
}): React.JSX.Element | null {
  if (change === null) return null;
  return (
    <View className="mt-1 flex-row items-center gap-2 self-start rounded-lg bg-nileGreen-50 px-2 py-1 dark:bg-nileGreen-950">
      <Ionicons
        name="information-circle-outline"
        size={16}
        color={palette.nileGreen[700]}
      />
      <Text
        testID={`metal-holding-${change.field}-previous`}
        className="text-xs text-text-muted dark:text-text-muted-dark"
      >
        {`${copy.previous ?? "Previous"}: ${change.before}`}
      </Text>
    </View>
  );
}

function findAffectedChange(
  editState: MetalHoldingFormEditState | undefined,
  field: string
): MetalHoldingEditChange | null {
  return (
    editState?.affectedChanges.find((change) => change.field === field) ?? null
  );
}

function FormSkeleton(): React.JSX.Element {
  return (
    <View
      testID="metal-holding-form-skeleton"
      className="flex-1 gap-5 px-5 pt-2"
    >
      <Skeleton width="100%" height={64} borderRadius={12} />
      <Skeleton width="100%" height={64} borderRadius={12} />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Skeleton width="100%" height={64} borderRadius={12} />
        </View>
        <View className="flex-1">
          <Skeleton width="100%" height={64} borderRadius={12} />
        </View>
      </View>
      <Skeleton width="100%" height={96} borderRadius={16} />
      <Skeleton width="100%" height={176} borderRadius={24} />
    </View>
  );
}

function formatPurchaseDate(value: string, locale: "en" | "ar"): string {
  const date = parsePurchaseDate(value);
  if (date === null) return value;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function parsePurchaseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

function toDateOnlyString(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
