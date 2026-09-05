import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { PageHeader } from "@/components/navigation/PageHeader";
import { Dropdown, type DropdownItem } from "@/components/ui/Dropdown";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { palette } from "@/constants/colors";
import { shouldUseCompactLayout } from "@/constants/ui";

import { MetalHoldingRender } from "./MetalHoldingRender";

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
  readonly valuation:
    | { readonly available: true; readonly valueDecimal: string }
    | { readonly available: false; readonly reason: "missing_rate" };
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
  readonly submitFailed: string;
  readonly rateFresh: string;
  readonly rateStale: string;
  readonly rateUnknown: string;
  readonly rateUnavailable: string;
}

export interface MetalHoldingFormProps {
  readonly locale: "en" | "ar";
  readonly isRtl: boolean;
  readonly colorScheme: "light" | "dark";
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
  readonly preview: MetalHoldingFormPreview;
  readonly onChange: (
    field: MetalHoldingFormField,
    value: string | null
  ) => void;
  readonly onSubmit: () => void;
  readonly onRequestExit: () => void;
  readonly onAcknowledgeUnusualValue?: () => void;
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
  submitFailed: "We couldn't add this holding. Try again.",
  rateFresh: "Rates are current",
  rateStale: "Using an older saved rate",
  rateUnknown: "Rate age is unavailable",
  rateUnavailable: "Some rate details are unavailable",
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
] as const;

export function MetalHoldingForm({
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
  preview,
  onChange,
  onSubmit,
  onRequestExit,
  onAcknowledgeUnusualValue,
}: MetalHoldingFormProps): React.JSX.Element {
  const [isPurityOpen, setIsPurityOpen] = useState(false);
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const shouldStackDenseFields = shouldUseCompactLayout(width, fontScale);
  const firstError = useMemo(
    () => FOCUSABLE_ERROR_ORDER.find(([field]) => validationErrors[field])?.[1],
    [validationErrors]
  );
  const submit = useCallback((): void => {
    if (!isSubmitting) onSubmit();
  }, [isSubmitting, onSubmit]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-25 dark:bg-slate-950"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      testID="metal-holding-form"
      accessibilityLanguage={locale}
      {...({
        fieldOrder: FIELD_ORDER,
        writingDirection: isRtl ? "rtl" : "ltr",
      } as object)}
    >
      <PageHeader
        title={copy.title}
        showDrawer={false}
        showBackButton
        onBack={onRequestExit}
        backAccessibilityLabel={copy.back}
      />

      {isLoading ? (
        <FormSkeleton />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-5 px-5 pb-8"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TextField
            testID="metal-holding-name-field"
            label={copy.name}
            accessibilityLabel={copy.name}
            value={values.name}
            placeholder={copy.namePlaceholder}
            onChangeText={(value) => onChange("name", value)}
            error={validationErrors.name}
            autoFocus={firstError === "metal-holding-name-field"}
            {...({
              accessibilityState: { invalid: Boolean(validationErrors.name) },
            } as object)}
            maxLength={100}
          />

          <MetalSelector copy={copy} value={values.metal} onChange={onChange} />

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
              containerClassName="flex-1"
              label={copy.weight}
              accessibilityLabel={copy.weight}
              value={values.weightGrams}
              onChangeText={(value) => onChange("weightGrams", value)}
              error={validationErrors.weightGrams}
              autoFocus={firstError === "metal-holding-weight-field"}
              keyboardType="decimal-pad"
              inputMode="decimal"
            />
            <View
              className="flex-1"
              accessible
              accessibilityLabel={copy.purity}
            >
              <Dropdown
                label={copy.purity}
                items={purityOptions}
                value={values.purityCode}
                onChange={(value) => {
                  setIsPurityOpen(false);
                  onChange("purityCode", value);
                }}
                isOpen={isPurityOpen}
                onToggle={() => setIsPurityOpen((open) => !open)}
              />
            </View>
          </View>

          <View>
            <TextField
              testID="metal-holding-purchase-price-field"
              label={copy.purchasePrice}
              value={values.purchasePrice}
              onChangeText={(value) => onChange("purchasePrice", value)}
              error={validationErrors.purchasePrice}
              autoFocus={firstError === "metal-holding-purchase-price-field"}
              keyboardType="decimal-pad"
              inputMode="decimal"
            />
            <Text className="mt-1 text-xs text-text-muted">
              {copy.purchasePriceHint}
            </Text>
          </View>

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
            />
          </View>

          <TextField
            testID="metal-holding-purchase-date-field"
            label={copy.purchaseDate}
            value={values.purchaseDate}
            onChangeText={(value) => onChange("purchaseDate", value)}
            error={validationErrors.purchaseDate}
            autoFocus={firstError === "metal-holding-purchase-date-field"}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            trailingAdornment={
              <Ionicons
                name="calendar-outline"
                size={20}
                color={palette.slate[500]}
              />
            }
          />

          <PhysicalFormSelector
            copy={copy}
            value={values.physicalForm}
            metal={values.metal}
            isStacked={shouldStackDenseFields}
            onChange={onChange}
          />

          <TextField
            testID="metal-holding-notes-field"
            label={copy.notes}
            value={values.notes}
            onChangeText={(value) => onChange("notes", value)}
            placeholder={copy.notesPlaceholder}
            multiline
            maxLength={500}
          />

          <LivePreview
            copy={copy}
            preview={preview}
            isStacked={shouldStackDenseFields}
          />

          {requiresUnusualValueAcknowledgment ? (
            <View className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
              <Text className="text-sm text-amber-900 dark:text-amber-100">
                {copy.unusualValue}
              </Text>
              {!unusualValueAcknowledged ? (
                <TouchableOpacity
                  accessibilityRole="button"
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
            <Text className="flex-1 text-xs leading-5 text-text-secondary">
              {copy.savedLocally}
            </Text>
          </View>
        </ScrollView>
      )}

      <View
        testID="metal-holding-submit-area"
        className="border-t border-slate-200 bg-slate-25 px-5 pt-3 dark:border-slate-800 dark:bg-slate-950"
        style={{ paddingBottom: bottomInset + 12 }}
        {...({ bottomInset } as object)}
      >
        <TouchableOpacity
          testID="metal-holding-submit"
          accessibilityRole="button"
          accessibilityLabel={isSubmitting ? copy.submitting : copy.submit}
          accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
          disabled={isSubmitting}
          onPress={submit}
          className="min-h-12 items-center justify-center rounded-2xl bg-nileGreen-700 px-5 py-3 dark:bg-nileGreen-500"
          style={isSubmitting ? { opacity: 0.55 } : undefined}
        >
          <Text className="text-base font-bold text-slate-25 dark:text-slate-950">
            {isSubmitting ? copy.submitting : copy.submit}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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

function MetalSelector({
  copy,
  value,
  onChange,
}: {
  readonly copy: MetalHoldingFormCopy;
  readonly value: "GOLD" | "SILVER";
  readonly onChange: MetalHoldingFormProps["onChange"];
}): React.JSX.Element {
  return (
    <View testID="metal-holding-metal-field">
      <Text className="mb-2 text-sm font-semibold text-text-secondary">
        {copy.metal}
      </Text>
      <View className="flex-row overflow-hidden rounded-2xl border border-slate-300 dark:border-slate-700">
        {(["GOLD", "SILVER"] as const).map((metal) => {
          const isSelected = value === metal;
          return (
            <TouchableOpacity
              key={metal}
              testID={`metal-holding-metal-option-${metal}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              onPress={() => onChange("metal", metal)}
              className={`min-h-12 flex-1 flex-row items-center justify-center gap-2 ${
                isSelected
                  ? "bg-nileGreen-50 dark:bg-nileGreen-950"
                  : "bg-slate-25 dark:bg-slate-950"
              }`}
            >
              <View
                className={`h-3 w-3 rounded-full ${metal === "GOLD" ? "bg-gold-500" : "bg-slate-400"}`}
              />
              <Text
                className={
                  isSelected
                    ? "font-semibold text-nileGreen-800 dark:text-nileGreen-300"
                    : "text-text-secondary"
                }
              >
                {metal === "GOLD" ? copy.gold : copy.silver}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function PhysicalFormSelector({
  copy,
  value,
  metal,
  isStacked,
  onChange,
}: {
  readonly copy: MetalHoldingFormCopy;
  readonly value: MetalHoldingFormValues["physicalForm"];
  readonly metal: "GOLD" | "SILVER";
  readonly isStacked: boolean;
  readonly onChange: MetalHoldingFormProps["onChange"];
}): React.JSX.Element {
  const forms = [
    { value: "COIN" as const, label: copy.coin },
    { value: "BAR" as const, label: copy.bar },
    { value: "JEWELRY" as const, label: copy.jewelry },
  ];
  return (
    <View testID="metal-holding-physical-form-field">
      <Text className="mb-2 text-sm font-semibold text-text-secondary">
        {copy.physicalForm}
      </Text>
      <View className={isStacked ? "gap-2" : "flex-row gap-2"}>
        {forms.map((form) => {
          const isSelected = value === form.value;
          return (
            <TouchableOpacity
              key={form.value}
              testID={`metal-holding-physical-form-option-${form.value}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              onPress={() =>
                onChange("physicalForm", isSelected ? null : form.value)
              }
              className={`min-h-28 items-center justify-center rounded-2xl border px-2 py-2 ${
                isStacked ? "w-full" : "flex-1"
              } ${
                isSelected
                  ? "border-nileGreen-700 bg-nileGreen-50 dark:border-nileGreen-400 dark:bg-nileGreen-950"
                  : "border-slate-300 bg-slate-25 dark:border-slate-700 dark:bg-slate-950"
              }`}
            >
              <MetalHoldingRender
                itemForm={
                  form.value.toLowerCase() as "coin" | "bar" | "jewelry"
                }
                metalType={metal}
              />
              <Text
                className={`text-sm ${isSelected ? "font-semibold text-nileGreen-800 dark:text-nileGreen-300" : "text-text-secondary"}`}
              >
                {form.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function LivePreview({
  copy,
  preview,
  isStacked,
}: {
  readonly copy: MetalHoldingFormCopy;
  readonly preview: MetalHoldingFormPreview;
  readonly isStacked: boolean;
}): React.JSX.Element {
  const valuationState = preview.valuation.available
    ? "available"
    : "unavailable";
  return (
    <View
      testID="metal-holding-live-preview"
      className="rounded-3xl border border-nileGreen-700 bg-nileGreen-50 p-4 dark:border-nileGreen-500 dark:bg-nileGreen-950"
      {...({
        metal: preview.metal,
        purityCode: preview.purityCode,
        valuationState,
      } as object)}
    >
      <Text className="mb-3 text-sm font-semibold text-nileGreen-800 dark:text-nileGreen-300">
        {copy.preview}
      </Text>
      <View className={isStacked ? "gap-3" : "flex-row items-center gap-3"}>
        <View
          testID="metal-holding-item-render"
          {...({ metal: preview.metal } as object)}
        >
          <MetalHoldingRender
            itemForm={
              preview.physicalForm?.toLowerCase() as
                | "coin"
                | "bar"
                | "jewelry"
                | null
            }
            metalType={preview.metal}
          />
        </View>
        <View className="min-w-0 flex-1">
          {preview.name ? (
            <Text className="text-base font-semibold text-text-primary">
              {preview.name}
            </Text>
          ) : null}
          <Text className="text-sm text-text-secondary">
            {preview.purityLabel}
          </Text>
          {preview.weightGramsDecimal ? (
            <Text className="text-sm text-text-secondary">
              {preview.weightGramsDecimal} g
            </Text>
          ) : null}
        </View>
        {preview.valuation.available ? (
          <Text
            className={`${isStacked ? "w-full" : "max-w-[45%]"} text-end text-base font-bold text-text-primary`}
          >
            {`${preview.displayCurrency ?? ""} ${preview.valuation.valueDecimal}`.trim()}
          </Text>
        ) : (
          <Text
            testID="metal-holding-valuation-unavailable"
            className={`${isStacked ? "w-full" : "max-w-[45%]"} text-end text-base font-bold text-text-primary`}
          >
            {copy.valuationUnavailable}
          </Text>
        )}
      </View>
      {preview.rateFreshness ? (
        <View className="mt-3 flex-row items-center gap-2">
          <Ionicons name="time-outline" size={16} color={palette.slate[500]} />
          <Text className="text-xs text-text-secondary">
            {preview.rateFreshness === "fresh"
              ? copy.rateFresh
              : preview.rateFreshness === "stale"
                ? copy.rateStale
                : preview.rateFreshness === "unknown"
                  ? copy.rateUnknown
                  : copy.rateUnavailable}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
