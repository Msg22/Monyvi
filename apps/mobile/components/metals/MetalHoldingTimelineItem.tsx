import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  formatCanonicalDecimalForDisplay,
  isSupportedMetalsIsoCurrencyCode,
  resolvePuritySelection,
} from "@monyvi/logic";
import type {
  MetalDetailCorrectionChange,
  MetalDetailTimelineItem,
} from "@/services/metal-detail-read-model-service";
import { formatLocalizedMoneyAmount } from "@/utils/localized-money-display";

export interface MetalHoldingTimelineItemProps {
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly item: MetalDetailTimelineItem;
}

export function MetalHoldingTimelineItem({
  isFirst,
  isLast,
  item,
}: MetalHoldingTimelineItemProps): React.JSX.Element {
  const { t, i18n } = useTranslation("metals");
  const locale = resolveLocale(i18n.resolvedLanguage);

  const changeLines =
    item.kind === "correct" && item.correctionChanges
      ? item.correctionChanges.map((change) => {
          const before = formatCorrectionValue(change, "before", locale, t);
          const after = formatCorrectionValue(change, "after", locale, t);
          return before === null || after === null
            ? null
            : t("timeline.change", {
                field: t("edit.fields." + change.field),
                before,
                after,
              });
        })
      : null;

  const verifiedLines =
    changeLines?.length && changeLines.every((line) => line !== null)
      ? (changeLines as string[])
      : null;

  const details =
    item.kind === "correct"
      ? (verifiedLines ?? [t("timeline.change_unavailable")])
      : [];

  return (
    <View
      className="flex-row px-5"
      accessible
      accessibilityLabel={[
        t("timeline." + item.kind),
        formatShortDate(item.occurredAt, locale),
        ...details,
      ].join(". ")}
    >
      <View className="relative w-8 items-center self-stretch">
        {isFirst ? null : (
          <View className="absolute -top-1 h-4 w-px bg-nileGreen-600 dark:bg-nileGreen-400" />
        )}
        {isLast ? null : (
          <View className="absolute bottom-0 top-4 w-px bg-nileGreen-600 dark:bg-nileGreen-400" />
        )}
        <View className="mt-2 h-3 w-3 rounded-full bg-nileGreen-700 dark:bg-nileGreen-400" />
      </View>
      <View className="min-w-0 flex-1 py-1">
        <Text className="text-sm text-text-primary dark:text-text-primary-dark">
          {t("timeline." + item.kind)}
          <Text className="text-text-secondary dark:text-text-secondary-dark">
            {" · " + formatShortDate(item.occurredAt, locale)}
          </Text>
        </Text>
        {details.map((line, index) => (
          <Text
            key={index}
            testID={"metal-history-change-" + item.id + "-" + index}
            className="mt-1 text-sm text-text-secondary dark:text-text-secondary-dark"
          >
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

function formatCorrectionValue(
  change: MetalDetailCorrectionChange,
  side: "before" | "after",
  locale: string,
  t: (key: string) => string
): string | null {
  const value = change[side];
  if (value === null) return t("edit.not_recorded");
  if (change.field === "weight") {
    const formatted = formatWeight(value, locale, t("weight_unit"));
    return formatted === "—" ? null : formatted;
  }
  if (change.field === "purity") {
    const metal = value.startsWith("gold-")
      ? "GOLD"
      : value.startsWith("silver-")
        ? "SILVER"
        : null;
    if (!metal) return null;
    const purity = resolvePuritySelection(metal, value);
    return purity.available ? t(purity.entry.labelKey) : null;
  }
  if (change.field === "physicalForm") {
    if (!["COIN", "BAR", "JEWELRY"].includes(value)) return null;
    return t("form." + value.toLowerCase());
  }
  if (change.field === "purchasePrice") {
    const currency =
      side === "before" ? change.beforeCurrency : change.afterCurrency;
    if (!currency || !isSupportedMetalsIsoCurrencyCode(currency)) return null;
    const formatted = displayAmount(value, currency, locale);
    return formatted === "—" ? null : formatted;
  }
  if (change.field === "purchaseCurrency") {
    return isSupportedMetalsIsoCurrencyCode(value) ? value : null;
  }
  if (change.field === "purchaseDate") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      return null;
    }
    return date.toLocaleDateString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return null;
}

function resolveLocale(language: string | undefined): string {
  return language?.startsWith("ar") ? "ar-EG-u-nu-latn" : "en-GB";
}

function formatWeight(value: string, locale: string, unit: string): string {
  try {
    return `${formatCanonicalDecimalForDisplay(value, {
      locale,
      maximumFractionDigits: 3,
    })} ${unit}`;
  } catch {
    return "—";
  }
}

function displayAmount(
  value: string,
  currency: string,
  locale: string
): string {
  const normalizedCurrency = isSupportedMetalsIsoCurrencyCode(currency)
    ? currency
    : "EGP";
  return formatLocalizedMoneyAmount({
    amount: value,
    currency: normalizedCurrency,
    language: locale.toLowerCase().startsWith("ar") ? "ar" : "en",
    signDisplay: "never",
    englishPresentation: "code-prefix",
  });
}

function formatShortDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
