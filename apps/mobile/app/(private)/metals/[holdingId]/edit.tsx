import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  I18nManager,
  Modal,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  SUPPORTED_CURRENCIES,
  isSupportedMetalsIsoCurrencyCode,
} from "@monyvi/logic";

import {
  MetalHoldingForm,
  type MetalHoldingFormCopy,
  type MetalHoldingFormEditState,
} from "@/components/metals/MetalHoldingForm";
import { useEditMetalHolding } from "@/hooks/useEditMetalHolding";
import { useMetalAddPreviewRates } from "@/hooks/useAddMetalHolding";

const SAFE_RANGE = {
  maximumWeightGramsDecimal: "999999999.999",
  maximumPurchasePriceDecimal: "999999999999999.99",
} as const;

export default function EditMetalHoldingRoute(): React.JSX.Element {
  const { holdingId } = useLocalSearchParams<{ holdingId?: string }>();
  const { t, i18n } = useTranslation("metals");
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { getPreviewRates } = useMetalAddPreviewRates();
  const [isExitGuardVisible, setIsExitGuardVisible] = useState(false);
  const locale = (i18n.resolvedLanguage ?? i18n.language ?? "en").startsWith(
    "ar"
  )
    ? "ar"
    : "en";
  const today = useMemo(getCairoTodayDate, []);
  const form = useEditMetalHolding({
    holdingId,
    locale,
    today,
    safeRange: SAFE_RANGE,
    getPreviewRates,
    createId: Crypto.randomUUID,
  });
  const copy = useMemo(() => createCopy(t), [t]);
  const currencyOptions = useMemo(
    () =>
      SUPPORTED_CURRENCIES.filter(({ code }) =>
        isSupportedMetalsIsoCurrencyCode(code)
      ).map(({ code }) => ({ value: code, label: code })),
    []
  );
  const editState = useMemo<MetalHoldingFormEditState>(
    () => ({
      affectedChanges: form.comparison.affectedFields.map((field) => ({
        field,
        label: t(`edit.fields.${field}`),
        before: readAffectedValue(form.model?.facts, field, t),
        after: readAffectedValue(toCurrentFacts(form), field, t),
        isFinancial: field !== "physicalForm",
      })),
      correctionReason: form.correctionReason,
    }),
    [form, t]
  );
  const requestExit = useCallback((): void => {
    if (form.isSubmitting) return;
    if (form.isDirty) setIsExitGuardVisible(true);
    else router.back();
  }, [form.isDirty, form.isSubmitting]);
  const submit = useCallback((): void => {
    void form.submit().then((saved) => {
      if (saved) router.back();
    });
  }, [form]);
  return (
    <View className="flex-1 bg-slate-25 dark:bg-slate-950">
      <MetalHoldingForm
        mode="edit"
        holdingStatus={form.model?.status ?? "active"}
        editState={editState}
        locale={locale}
        isRtl={I18nManager.isRTL}
        width={width}
        fontScale={fontScale}
        bottomInset={insets.bottom}
        isLoading={form.isLoading}
        isSubmitting={form.isSubmitting}
        values={form.values}
        copy={copy}
        purityOptions={form.purityOptions}
        currencyOptions={currencyOptions}
        validationErrors={localizeErrors(form.validationErrors, t)}
        submitError={form.submitError}
        preview={form.preview}
        requiresUnusualValueAcknowledgment={
          form.requiresUnusualValueAcknowledgment
        }
        unusualValueAcknowledged={form.unusualValueAcknowledged}
        onAcknowledgeUnusualValue={form.acknowledgeUnusualValue}
        onCorrectionReasonChange={form.setCorrectionReason}
        onChange={form.updateField}
        onSubmit={submit}
        onRequestExit={requestExit}
      />
      <ExitGuard
        visible={isExitGuardVisible}
        bottomInset={insets.bottom}
        onKeep={() => setIsExitGuardVisible(false)}
        onDiscard={() => {
          setIsExitGuardVisible(false);
          router.back();
        }}
        copy={{
          title: t("edit.exit_title"),
          message: t("edit.exit_message"),
          keep: t("edit.keep_editing"),
          discard: t("edit.discard"),
        }}
      />
    </View>
  );
}

function ExitGuard({
  visible,
  bottomInset,
  onKeep,
  onDiscard,
  copy,
}: {
  readonly visible: boolean;
  readonly bottomInset: number;
  readonly onKeep: () => void;
  readonly onDiscard: () => void;
  readonly copy: {
    readonly title: string;
    readonly message: string;
    readonly keep: string;
    readonly discard: string;
  };
}): React.JSX.Element {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onKeep}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View
          className="rounded-t-3xl bg-slate-25 px-5 pt-6 dark:bg-slate-900"
          style={{ paddingBottom: bottomInset + 20 }}
        >
          <Text className="text-xl font-bold text-text-primary">
            {copy.title}
          </Text>
          <Text className="mt-2 text-sm text-text-secondary">
            {copy.message}
          </Text>
          <View className="mt-5 gap-3">
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onKeep}
              className="min-h-12 items-center justify-center rounded-2xl bg-nileGreen-700 px-4 dark:bg-nileGreen-500"
            >
              <Text className="font-bold text-slate-25 dark:text-slate-950">
                {copy.keep}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onDiscard}
              className="min-h-12 items-center justify-center rounded-2xl border border-red-500 px-4"
            >
              <Text className="font-semibold text-red-600 dark:text-red-400">
                {copy.discard}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createCopy(
  t: ReturnType<typeof useTranslation<"metals">>["t"]
): MetalHoldingFormCopy {
  return {
    title: t("add_new_holding"),
    back: t("add.back"),
    name: t("add.holding_name"),
    namePlaceholder: t("add.holding_name_placeholder"),
    metal: t("add.metal"),
    gold: t("gold"),
    silver: t("silver"),
    weight: t("add.weight"),
    purity: t("purity"),
    purchasePrice: t("add.total_purchase_price"),
    purchasePriceHint: t("add.purchase_price_hint"),
    purchaseCurrency: t("add.purchase_currency"),
    purchaseDate: t("purchase_date"),
    physicalForm: t("add.physical_form"),
    coin: t("form_coin"),
    bar: t("form_bar"),
    jewelry: t("form_jewelry"),
    notes: t("add.notes"),
    notesPlaceholder: t("add.notes_placeholder"),
    preview: t("add.estimated_value"),
    valuationUnavailable: t("add.estimate_unavailable"),
    savedLocally: t("edit.local_first"),
    submit: t("add.submit"),
    submitting: t("add.submitting"),
    unusualValue: t("add.unusual_value"),
    acknowledge: t("add.acknowledge"),
    submitFailed: t("error_save_failed"),
    rateFresh: t("add.rate_fresh"),
    rateStale: t("add.rate_stale"),
    rateUnknown: t("add.rate_unknown"),
    rateUnavailable: t("add.rate_unavailable"),
    pure: t("add.pure"),
    perPureGram: t("add.per_pure_gram"),
    estimatedGainSincePurchase: t("add.estimated_gain_since_purchase"),
    estimatedLossSincePurchase: t("add.estimated_loss_since_purchase"),
    ratesUpdated: t("add.rates_updated"),
    editTitle: t("edit.title"),
    editSubmit: t("edit.submit"),
    editSubmitting: t("edit.submitting"),
    correctionReason: t("edit.correction_reason"),
    whatWillChange: t("edit.what_will_change"),
    previous: t("edit.previous"),
    current: t("edit.current"),
    correctionHistory: t("edit.history_note"),
    noFinancialChange: t("edit.current_value_stays"),
    lockedMetalHint: t("edit.locked_metal_hint"),
    cancel: t("edit.cancel"),
  };
}
function toCurrentFacts(
  form: ReturnType<typeof useEditMetalHolding>
): EditableFactsLike {
  return {
    ...form.model?.facts,
    name: form.values.name,
    notes: form.values.notes,
    weightGramsDecimal: form.values.weightGrams,
    purityCode: form.values.purityCode,
    purchasePriceDecimal: form.values.purchasePrice,
    purchaseCurrency: form.values.purchaseCurrency,
    purchaseDate: form.values.purchaseDate,
    physicalForm: form.values.physicalForm,
  };
}
interface EditableFactsLike {
  readonly name?: string;
  readonly notes?: string | null;
  readonly weightGramsDecimal?: string;
  readonly purityCode?: string;
  readonly purchasePriceDecimal?: string;
  readonly purchaseCurrency?: string;
  readonly purchaseDate?: string;
  readonly physicalForm?: "COIN" | "BAR" | "JEWELRY" | null;
}
function readAffectedValue(
  facts: EditableFactsLike | undefined,
  field: string,
  t: ReturnType<typeof useTranslation<"metals">>["t"]
): string {
  if (!facts) return t("edit.not_recorded");
  if (field === "weight")
    return facts.weightGramsDecimal || t("edit.not_recorded");
  if (field === "purity") return facts.purityCode || t("edit.not_recorded");
  if (field === "purchasePrice")
    return facts.purchasePriceDecimal || t("edit.not_recorded");
  if (field === "purchaseCurrency")
    return facts.purchaseCurrency ?? t("edit.not_recorded");
  if (field === "purchaseDate")
    return facts.purchaseDate ?? t("edit.not_recorded");
  if (field === "physicalForm")
    return facts.physicalForm
      ? t(`form.${facts.physicalForm.toLowerCase()}`)
      : t("edit.not_recorded");
  return t("edit.not_recorded");
}
function localizeErrors(
  errors: Readonly<Record<string, string>>,
  t: ReturnType<typeof useTranslation<"metals">>["t"]
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(errors).map(([field, code]) => [
      field,
      t(`add.validation.${code}`),
    ])
  );
}
function getCairoTodayDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}
