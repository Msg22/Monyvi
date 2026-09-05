import * as Crypto from "expo-crypto";
import { router } from "expo-router";
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
  resolveMetalsCurrencyMinorUnits,
} from "@monyvi/logic";

import {
  MetalHoldingForm,
  type MetalHoldingFormCopy,
} from "@/components/metals/MetalHoldingForm";
import { useTheme } from "@/context/ThemeContext";
import {
  useAddMetalHoldingForm,
  useMetalAddPreviewRates,
} from "@/hooks/useAddMetalHolding";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { addMetalHoldingFromForm } from "@/services/add-metal-holding-facade-service";

const SAFE_RANGE = {
  maximumWeightGramsDecimal: "999999999.999",
  maximumPurchasePriceDecimal: "999999999999999.99",
} as const;

export default function AddMetalHoldingRoute(): React.JSX.Element {
  const { t, i18n } = useTranslation("metals");
  const { isDark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { preferredCurrency, isLoading } = usePreferredCurrency();
  const { getPreviewRates } = useMetalAddPreviewRates();
  const [isExitGuardVisible, setIsExitGuardVisible] = useState(false);
  const activeLanguage = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const locale = activeLanguage.startsWith("ar") ? "ar" : "en";
  const initialCurrency = isSupportedMetalsIsoCurrencyCode(preferredCurrency)
    ? preferredCurrency
    : "EGP";
  const today = useMemo(getCairoTodayDate, []);
  const copy = useMemo(() => createCopy(t), [t]);
  const form = useAddMetalHoldingForm({
    locale,
    preferredCurrency: initialCurrency,
    today,
    currencyMinorUnits:
      resolveMetalsCurrencyMinorUnits(`currency:${initialCurrency}`) ?? 2,
    safeRange: SAFE_RANGE,
    previewRates: getPreviewRates,
    isUnusualValue: () => false,
    createId: Crypto.randomUUID,
    addHolding: addMetalHoldingFromForm,
  });
  const currencyOptions = useMemo(
    () =>
      SUPPORTED_CURRENCIES.filter(({ code }) =>
        isSupportedMetalsIsoCurrencyCode(code)
      ).map(({ code }) => ({ value: code, label: code })),
    []
  );
  const validationErrors = useMemo(
    () => localizeValidationErrors(form.validationErrors, t),
    [form.validationErrors, t]
  );

  const requestExit = useCallback((): void => {
    if (form.isSubmitting) return;
    if (form.isDirty) {
      setIsExitGuardVisible(true);
      return;
    }
    router.back();
  }, [form.isDirty, form.isSubmitting]);
  const submit = useCallback((): void => {
    void form.submit().then((holdingId) => {
      if (holdingId) router.replace(`/metals/${holdingId}`);
    });
  }, [form]);

  return (
    <View
      testID="metal-holding-add-screen"
      className="flex-1 bg-slate-25 dark:bg-slate-950"
    >
      <MetalHoldingForm
        locale={locale}
        isRtl={I18nManager.isRTL}
        colorScheme={isDark ? "dark" : "light"}
        width={width}
        fontScale={fontScale}
        bottomInset={insets.bottom}
        isLoading={isLoading}
        isSubmitting={form.isSubmitting}
        values={form.values}
        copy={copy}
        purityOptions={form.purityOptions}
        currencyOptions={currencyOptions}
        validationErrors={validationErrors}
        submitError={form.submitError}
        preview={form.preview}
        requiresUnusualValueAcknowledgment={
          form.requiresUnusualValueAcknowledgment
        }
        unusualValueAcknowledged={form.unusualValueAcknowledged}
        onAcknowledgeUnusualValue={form.acknowledgeUnusualValue}
        onChange={form.updateField}
        onSubmit={submit}
        onRequestExit={requestExit}
      />
      <DirtyExitGuard
        isVisible={isExitGuardVisible}
        bottomInset={insets.bottom}
        onKeepEditing={() => setIsExitGuardVisible(false)}
        onDiscard={() => {
          setIsExitGuardVisible(false);
          router.back();
        }}
        copy={{
          title: t("add.exit_title"),
          message: t("add.exit_message"),
          keepEditing: t("add.keep_editing"),
          discard: t("add.discard"),
        }}
      />
    </View>
  );
}

function DirtyExitGuard({
  isVisible,
  bottomInset,
  onKeepEditing,
  onDiscard,
  copy,
}: {
  readonly isVisible: boolean;
  readonly bottomInset: number;
  readonly onKeepEditing: () => void;
  readonly onDiscard: () => void;
  readonly copy: {
    readonly title: string;
    readonly message: string;
    readonly keepEditing: string;
    readonly discard: string;
  };
}): React.JSX.Element {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={isVisible}
      onRequestClose={onKeepEditing}
    >
      <View
        testID="metal-holding-dirty-exit-guard"
        className="flex-1 justify-end bg-black/50"
      >
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
              onPress={onKeepEditing}
              className="min-h-12 items-center justify-center rounded-2xl bg-nileGreen-700 px-4 dark:bg-nileGreen-500"
            >
              <Text className="font-bold text-slate-25 dark:text-slate-950">
                {copy.keepEditing}
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
    name: t("name"),
    namePlaceholder: t("name_placeholder"),
    metal: t("add.metal"),
    gold: t("gold"),
    silver: t("silver"),
    weight: t("weight_grams"),
    purity: t("purity"),
    purchasePrice: t("add.total_purchase_price"),
    purchasePriceHint: t("add.purchase_price_hint"),
    purchaseCurrency: t("add.purchase_currency"),
    purchaseDate: t("purchase_date"),
    physicalForm: t("form_optional"),
    coin: t("form_coin"),
    bar: t("form_bar"),
    jewelry: t("form_jewelry"),
    notes: t("add.notes"),
    notesPlaceholder: t("add.notes_placeholder"),
    preview: t("add.estimated_value"),
    valuationUnavailable: t("add.estimate_unavailable"),
    savedLocally: t("add.local_first"),
    submit: t("add.submit"),
    submitting: t("add.submitting"),
    unusualValue: t("add.unusual_value"),
    acknowledge: t("add.acknowledge"),
    submitFailed: t("error_save_failed"),
    rateFresh: t("add.rate_fresh"),
    rateStale: t("add.rate_stale"),
    rateUnknown: t("add.rate_unknown"),
    rateUnavailable: t("add.rate_unavailable"),
  };
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

function localizeValidationErrors(
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
