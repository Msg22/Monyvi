import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { t } from "i18next";
import { Text, View } from "react-native";

import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import {
  calculateDisplayPerPureGramPrice,
  isSupportedMetalsIsoCurrencyCode,
} from "@monyvi/logic";
import { formatLocalizedMoneyAmount } from "@/utils/localized-money-display";

import { MetalHoldingRender } from "./MetalHoldingRender";
import { getMetalHoldingFormPurityLabel } from "./metal-holding-purity-options";
import { getPurityCatalogEntry } from "@/validation/metal-holding-form-validation";
import type {
  MetalHoldingFormCopy,
  MetalHoldingFormPreview,
} from "./MetalHoldingForm";

interface MetalHoldingLivePreviewProps {
  readonly copy: MetalHoldingFormCopy;
  readonly preview: MetalHoldingFormPreview;
  readonly isStacked: boolean;
  readonly locale: "en" | "ar";
}

export function MetalHoldingLivePreview({
  copy,
  preview,
  isStacked,
  locale,
}: MetalHoldingLivePreviewProps): React.JSX.Element {
  const valuationState = preview.valuation.available
    ? "available"
    : "unavailable";
  const previewMetadata: {
    readonly metal: "GOLD" | "SILVER";
    readonly purityCode: string;
    readonly valuationState: "available" | "unavailable";
  } = {
    metal: preview.metal,
    purityCode: preview.purityCode,
    valuationState,
  };
  const renderMetadata: { readonly metal: "GOLD" | "SILVER" } = {
    metal: preview.metal,
  };
  const metalLabel = preview.metal === "GOLD" ? copy.gold : copy.silver;
  const formLabel = getPhysicalFormLabel(preview.physicalForm, copy);
  const identity = formLabel ? `${metalLabel} · ${formLabel}` : metalLabel;
  const purityLabel = getMetalHoldingFormPurityLabel(
    preview.metal,
    preview.purityCode,
    t(
      `metals:${getPurityCatalogEntry(preview.purityCode)?.labelKey ?? ""}`,
      { defaultValue: preview.purityLabel }
    )
  );
  const facts = [
    preview.weightGramsDecimal ? `${preview.weightGramsDecimal} g` : null,
    purityLabel,
  ]
    .filter((value): value is string => value !== null)
    .join(" · ");
  const currency = preview.displayCurrency ?? "";
  const result = formatResult(preview, locale);
  const renderForm = toRenderPhysicalForm(preview.physicalForm);
  // Preferred currency owns the per-gram row: purchase valuation stays
  // canonical, while the estimated gram price follows the user's preferred
  // display currency. Legacy previews without preferred shape fall back to
  // the purchase-currency derivation; a null preferred value hides the row
  // instead of fabricating FX.
  const usePreferredPerGram =
    preview.preferredCurrency !== undefined ||
    preview.metalPerPureGramInPreferredCurrencyDecimal !== undefined;
  const perGramCurrency = usePreferredPerGram
    ? (preview.preferredCurrency ?? "")
    : currency;
  const perGramInDisplayCurrency = usePreferredPerGram
    ? preview.metalPerPureGramInPreferredCurrencyDecimal ?? null
    : preview.metalPerPureGramInDisplayCurrencyDecimal !== undefined
      ? preview.metalPerPureGramInDisplayCurrencyDecimal
      : calculateDisplayPerPureGramPrice({
          metalUsdPerPureGramDecimal: preview.metalUsdPerPureGramDecimal ?? null,
          currencyUsdPerUnitDecimal:
            preview.fxRateTrust?.valueDecimal ?? null,
          displayCurrency: preview.displayCurrency,
        });

  return (
    <View
      testID="metal-holding-live-preview"
      className="rounded-lg border border-nileGreen-700 bg-slate-25 p-3 dark:border-nileGreen-400 dark:bg-slate-900"
      {...previewMetadata}
    >
      <Text className="mb-3 text-sm font-semibold text-nileGreen-800 dark:text-nileGreen-400">
        {copy.preview}
      </Text>
      <View className={isStacked ? "gap-3" : "flex-row items-center gap-3"}>
        {renderForm === null ? null : (
          <View
            testID="metal-holding-item-render"
            className="h-12 w-12 items-center justify-center"
            {...renderMetadata}
          >
            <MetalHoldingRender
              size="form"
              itemForm={renderForm}
              metalType={preview.metal}
            />
          </View>
        )}
        <View className="min-w-0 flex-1">
          {preview.name ? (
            <Text className="text-base font-semibold text-text-primary dark:text-text-primary-dark">
              {preview.name}
            </Text>
          ) : null}
          <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
            {identity}
          </Text>
          {facts ? (
            <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
              {facts}
            </Text>
          ) : null}
        </View>
        {preview.valuation.available ? (
          <View className={`${isStacked ? "w-full" : "max-w-[48%]"} items-end`}>
            <Text className="text-end text-xl font-bold text-text-primary dark:text-text-primary-dark">
              {formatAmount(currency, preview.valuation.valueDecimal, locale)}
            </Text>
            {result ? (
              <>
                <Text
                  className={`text-end text-sm font-semibold ${preview.resultDirection === "negative" ? "text-red-500" : "text-nileGreen-700 dark:text-nileGreen-400"}`}
                >
                  {result}
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  className="text-end text-xs text-text-secondary dark:text-text-secondary-dark"
                >
                  {preview.resultDirection === "negative"
                    ? copy.estimatedLossSincePurchase
                    : copy.estimatedGainSincePurchase}
                </Text>
              </>
            ) : null}
          </View>
        ) : (
          <Text
            testID="metal-holding-valuation-unavailable"
            className={`${isStacked ? "w-full" : "max-w-[45%]"} text-end text-base font-bold text-text-primary dark:text-text-primary-dark`}
          >
            {copy.valuationUnavailable}
          </Text>
        )}
      </View>
      {perGramInDisplayCurrency !== null &&
      perGramInDisplayCurrency !== undefined &&
      isSupportedMetalsIsoCurrencyCode(perGramCurrency) ? (
        <View className="mt-3 gap-2">
          <DisclosureRow
            icon="trending-up-outline"
            text={`${metalLabel} · ${formatRateAmount(perGramCurrency, perGramInDisplayCurrency, locale)} ${copy.perPureGram}`}
          />
        </View>
      ) : null}
    </View>
  );
}

function DisclosureRow({
  icon,
  text,
}: {
  readonly icon: React.ComponentProps<typeof Ionicons>["name"];
  readonly text: string;
}): React.JSX.Element {
  const { isDark } = useTheme();
  return (
    <View className="flex-row items-center gap-2">
      <Ionicons
        name={icon}
        size={18}
        color={isDark ? palette.nileGreen[400] : palette.nileGreen[700]}
      />
      <Text className="min-w-0 flex-1 text-xs text-text-secondary dark:text-text-secondary-dark">
        {text}
      </Text>
    </View>
  );
}

function getPhysicalFormLabel(
  value: MetalHoldingFormPreview["physicalForm"],
  copy: MetalHoldingFormCopy
): string | null {
  if (value === "COIN") return copy.coin;
  if (value === "BAR") return copy.bar;
  if (value === "JEWELRY") return copy.jewelry;
  return null;
}

function formatResult(
  preview: MetalHoldingFormPreview,
  locale: "en" | "ar"
): string | null {
  if (
    !preview.resultSincePurchaseDecimal ||
    !preview.resultDirection ||
    preview.resultDirection === "unavailable"
  ) {
    return null;
  }
  return formatAmount(
    preview.displayCurrency ?? "",
    preview.resultSincePurchaseDecimal,
    locale,
    preview.resultDirection === "zero" ? "never" : "always"
  );
}

export function formatAmount(
  currency: string,
  value: string,
  locale: "en" | "ar",
  signDisplay: "auto" | "always" | "never" = "auto",
  precision?: {
    readonly minimumFractionDigits?: number;
    readonly maximumFractionDigits?: number;
  }
): string {
  if (!isSupportedMetalsIsoCurrencyCode(currency)) {
    return formatDecimal(value, locale, precision);
  }
  return formatLocalizedMoneyAmount({
    amount: value,
    currency,
    language: locale,
    englishPresentation: "code-prefix",
    signDisplay,
    minimumFractionDigits: precision?.minimumFractionDigits,
    maximumFractionDigits: precision?.maximumFractionDigits,
  });
}

export function formatRateAmount(
  currency: string,
  value: string,
  locale: "en" | "ar"
): string {
  const fractionDigits = value.includes(".")
    ? (value.split(".")[1]?.length ?? 0)
    : 0;
  return formatAmount(
    currency,
    value,
    locale,
    "never",
    fractionDigits > 2
      ? {
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        }
      : undefined
  );
}

function formatDecimal(
  value: string,
  locale: "en" | "ar",
  precision?: {
    readonly minimumFractionDigits?: number;
    readonly maximumFractionDigits?: number;
  }
): string {
  const fractionDigits =
    precision?.maximumFractionDigits ?? value.split(".")[1]?.length ?? 0;
  const minDigits = precision?.minimumFractionDigits ?? fractionDigits;
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number(value));
}

function toRenderPhysicalForm(
  value: MetalHoldingFormPreview["physicalForm"]
): "coin" | "bar" | "jewelry" | null {
  if (value === "COIN") return "coin";
  if (value === "BAR") return "bar";
  if (value === "JEWELRY") return "jewelry";
  return null;
}
