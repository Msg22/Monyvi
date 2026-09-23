import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

import { palette } from "@/constants/colors";

import { MetalHoldingRender } from "./MetalHoldingRender";
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
  const facts = [
    preview.weightGramsDecimal ? `${preview.weightGramsDecimal} g` : null,
    preview.purityLabel,
  ]
    .filter((value): value is string => value !== null)
    .join(" · ");
  const currency = preview.displayCurrency ?? "";
  const result = formatResult(preview, locale);
  const rateSources = preview.rateSources?.join(" + ") ?? null;

  return (
    <View
      testID="metal-holding-live-preview"
      className="rounded-3xl border border-nileGreen-700 bg-nileGreen-50 p-4 dark:border-nileGreen-500 dark:bg-nileGreen-950"
      {...previewMetadata}
    >
      <Text className="mb-3 text-sm font-semibold text-nileGreen-800 dark:text-nileGreen-300">
        {copy.preview}
      </Text>
      <View className={isStacked ? "gap-3" : "flex-row items-center gap-3"}>
        <View
          testID="metal-holding-item-render"
          className="h-24 w-24 items-center justify-center"
          {...renderMetadata}
        >
          <MetalHoldingRender
            itemForm={toRenderPhysicalForm(preview.physicalForm)}
            metalType={preview.metal}
          />
        </View>
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
                  className={`text-end text-sm font-semibold ${preview.resultDirection === "negative" ? "text-red-500" : "text-nileGreen-700 dark:text-nileGreen-300"}`}
                >
                  {result}
                </Text>
                <Text className="text-end text-xs text-text-secondary dark:text-text-secondary-dark">
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
      <View className="mt-4 gap-2 border-t border-nileGreen-200 pt-3 dark:border-nileGreen-800">
        {preview.purityPercentDecimal ? (
          <DisclosureRow
            icon="shield-checkmark-outline"
            text={`${preview.purityLabel} · ${preview.purityPercentDecimal}% ${copy.pure}`}
          />
        ) : null}
        {preview.metalUsdPerPureGramDecimal ? (
          <DisclosureRow
            icon="trending-up-outline"
            text={`${metalLabel} · USD ${formatDecimal(preview.metalUsdPerPureGramDecimal, locale)} ${copy.perPureGram}`}
          />
        ) : null}
        {rateSources ? (
          <DisclosureRow
            icon="time-outline"
            text={
              preview.providerObservedAt
                ? `${rateSources} · ${copy.ratesUpdated} ${formatObservedAt(preview.providerObservedAt, locale)}`
                : rateSources
            }
          />
        ) : preview.rateFreshness ? (
          <DisclosureRow
            icon="time-outline"
            text={getRateFreshnessLabel(preview.rateFreshness, copy)}
          />
        ) : null}
      </View>
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
  return (
    <View className="flex-row items-center gap-2">
      <Ionicons name={icon} size={18} color={palette.nileGreen[700]} />
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
  const sign =
    preview.resultDirection === "positive"
      ? "+"
      : preview.resultDirection === "negative"
        ? "-"
        : "";
  const absolute = preview.resultSincePurchaseDecimal.replace(/^-/, "");
  return `${sign} ${formatAmount(preview.displayCurrency ?? "", absolute, locale)}`.trim();
}

function formatAmount(
  currency: string,
  value: string,
  locale: "en" | "ar"
): string {
  return `${currency} ${formatDecimal(value, locale)}`.trim();
}

function formatDecimal(value: string, locale: "en" | "ar"): string {
  const fractionDigits = value.split(".")[1]?.length ?? 0;
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number(value));
}

function formatObservedAt(value: Date, locale: "en" | "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function getRateFreshnessLabel(
  value: NonNullable<MetalHoldingFormPreview["rateFreshness"]>,
  copy: MetalHoldingFormCopy
): string {
  if (value === "fresh") return copy.rateFresh;
  if (value === "stale") return copy.rateStale;
  if (value === "unknown") return copy.rateUnknown;
  return copy.rateUnavailable;
}

function toRenderPhysicalForm(
  value: MetalHoldingFormPreview["physicalForm"]
): "coin" | "bar" | "jewelry" | null {
  if (value === "COIN") return "coin";
  if (value === "BAR") return "bar";
  if (value === "JEWELRY") return "jewelry";
  return null;
}
