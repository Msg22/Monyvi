import { Ionicons } from "@expo/vector-icons";
import { I18nManager, Text, useWindowDimensions, View } from "react-native";
import { useTranslation } from "react-i18next";
import { formatCanonicalDecimalForDisplay } from "@monyvi/logic";

import {
  getCurrencyDisplaySign,
  resolveCurrencyDisplayDecimalPlaces,
  type CurrencyDisplaySign,
} from "@/components/metals/portfolio-presentation";
import { palette } from "@/constants/colors";
import { shouldUseCompactLayout } from "@/constants/ui";
import { useTheme } from "@/context/ThemeContext";
import type { MetalDetailReadModel } from "@/services/metal-detail-read-model-service";
import { MetalSoldRateTrust } from "./MetalSoldRateTrust";

interface MetalTerminalDetailProps {
  readonly model: MetalDetailReadModel;
}

export function MetalTerminalDetail({
  model,
}: MetalTerminalDetailProps): React.JSX.Element {
  const { t, i18n } = useTranslation("metals");
  const terminalFacts = model.terminalFacts;
  const locale = resolveLocale(i18n.resolvedLanguage);

  if (terminalFacts === null || terminalFacts.kind !== model.status) {
    return (
      <TerminalStory
        model={model}
        terminalDate={null}
        terminalLabel={t("detail.terminal_facts_unavailable")}
      />
    );
  }

  if (terminalFacts.kind === "sold") {
    const unavailableAmount = t("detail.terminal_facts_unavailable");
    const resultSign =
      terminalFacts.realizedResultDecimal === null ||
      terminalFacts.realizedResultCurrency === null
        ? null
        : getCurrencyDisplaySign(
            terminalFacts.realizedResultDecimal,
            terminalFacts.realizedResultCurrency
          );
    const resultAmount =
      terminalFacts.realizedResultDecimal === null ||
      terminalFacts.realizedResultCurrency === null
        ? null
        : tryDisplayAmount(
            absoluteDecimal(terminalFacts.realizedResultDecimal),
            terminalFacts.realizedResultCurrency,
            locale
          );
    const grossAmount =
      tryDisplayAmount(
        terminalFacts.grossProceedsDecimal,
        terminalFacts.proceedsCurrency,
        locale
      ) ?? unavailableAmount;
    const netAmount =
      tryDisplayAmount(
        terminalFacts.netProceedsDecimal,
        terminalFacts.proceedsCurrency,
        locale
      ) ?? unavailableAmount;
    const feeSign = getCurrencyDisplaySign(
      terminalFacts.feeDecimal,
      terminalFacts.proceedsCurrency
    );
    const feeAmount = tryDisplayAmount(
      terminalFacts.feeDecimal,
      terminalFacts.proceedsCurrency,
      locale
    );

    return (
      <View testID="metal-sold-terminal-details">
        <View className="border-t border-slate-200 pt-6 dark:border-slate-800">
          <Text className="text-base text-text-secondary dark:text-text-secondary-dark">
            {t("detail.net_proceeds")}
          </Text>
          <Text
            testID="metal-sold-net-proceeds"
            className="mt-1 text-[40px] font-semibold leading-[48px] text-nileGreen-800 dark:text-nileGreen-400"
            style={{ writingDirection: "ltr" }}
          >
            {netAmount}
          </Text>
          {resultAmount === null || resultSign === null ? (
            <Text
              testID="metal-sold-realized-result"
              className="mt-1 text-base text-text-secondary dark:text-text-secondary-dark"
            >
              {t("detail.sale_result_unavailable")}
            </Text>
          ) : (
            <Text
              testID="metal-sold-realized-result"
              className={`mt-1 text-base ${getGainTextClass(resultSign)}`}
            >
              {t(
                resultSign === "negative"
                  ? "detail.sale_loss"
                  : resultSign === "positive"
                    ? "detail.sale_profit"
                    : "detail.sale_even",
                { amount: resultAmount }
              )}
            </Text>
          )}
          <MetalSoldRateTrust rates={terminalFacts.displayRateTrust ?? []} />
        </View>
        <TerminalStory
          model={model}
          terminalDate={terminalFacts.terminalDate}
          terminalLabel={t("status.sold")}
        />
        <View className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
          <SectionTitle>{t("detail.financial_facts")}</SectionTitle>
          <View className="mt-3">
            <TerminalFactRow
              icon="pricetag-outline"
              isLtrValue
              label={t("detail.gross_sale_proceeds")}
              value={grossAmount}
            />
            {feeSign === null ||
            feeSign === "zero" ||
            feeAmount === null ? null : (
              <TerminalFactRow
                icon="remove-circle-outline"
                isLtrValue
                label={t("detail.sale_fee")}
                value={`− ${feeAmount}`}
              />
            )}
            <TerminalFactRow
              emphasized
              icon="wallet-outline"
              isLtrValue
              label={t("detail.net_proceeds")}
              value={netAmount}
            />
            {terminalFacts.notes === null ? null : (
              <TerminalFactRow
                icon="document-text-outline"
                label={t("detail.notes")}
                value={terminalFacts.notes}
              />
            )}
          </View>
        </View>
      </View>
    );
  }

  const reason = disposalReasonLabel(
    terminalFacts.reason,
    terminalFacts.treatment,
    t
  );
  return (
    <View testID="metal-disposed-terminal-details">
      <TerminalStory
        model={model}
        terminalDate={terminalFacts.terminalDate}
        terminalLabel={t("detail.no_longer_possession")}
      />
      <View className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
        <SectionTitle>{t("detail.what_happened")}</SectionTitle>
        <Text className="mt-3 text-base leading-6 text-text-secondary dark:text-text-secondary-dark">
          {t("detail.disposal_explanation", { reason })}
        </Text>
        <View className="mt-3">
          <TerminalFactRow
            icon="gift-outline"
            label={t("detail.reason")}
            testID="metal-disposal-reason"
            value={reason}
          />
          <TerminalFactRow
            icon="ban-outline"
            label={t("detail.money_from_sale")}
            value={t("detail.none")}
          />
          <TerminalFactRow
            icon="shield-checkmark-outline"
            label={t("detail.account_change")}
            value={t("detail.no_change")}
          />
          {terminalFacts.notes === null ? null : (
            <TerminalFactRow
              icon="document-text-outline"
              label={t("detail.notes")}
              value={terminalFacts.notes}
            />
          )}
        </View>
      </View>
    </View>
  );
}

function TerminalStory({
  model,
  terminalDate,
  terminalLabel,
}: {
  readonly model: MetalDetailReadModel;
  readonly terminalDate: string | null;
  readonly terminalLabel: string;
}): React.JSX.Element {
  const { t, i18n } = useTranslation("metals");
  const locale = resolveLocale(i18n.resolvedLanguage);
  const purchaseAmount =
    model.purchasePriceDecimal === null || model.purchaseCurrency === null
      ? null
      : tryDisplayAmount(
          model.purchasePriceDecimal,
          model.purchaseCurrency,
          locale
        );
  return (
    <View className="mt-7">
      <SectionTitle>{t("detail.holding_story")}</SectionTitle>
      <View className="mt-4 flex-row gap-4">
        <View className="relative w-6 items-center">
          <View className="absolute bottom-3 top-3 w-px bg-nileGreen-600 dark:bg-nileGreen-400" />
          <View className="z-10 h-4 w-4 rounded-full bg-nileGreen-700 dark:bg-nileGreen-400" />
          <View className="flex-1" />
          <View className="z-10 h-4 w-4 rounded-full border-4 border-slate-100 bg-nileGreen-700 dark:border-slate-800 dark:bg-nileGreen-400" />
        </View>
        <View className="min-w-0 flex-1 gap-6">
          <View>
            <Text className="text-base font-medium text-nileGreen-800 dark:text-nileGreen-400">
              {t("detail.acquired")}
            </Text>
            {model.purchaseDate === null ? null : (
              <Text className="mt-1 text-sm text-text-secondary dark:text-text-secondary-dark">
                {formatShortDate(model.purchaseDate, locale)}
              </Text>
            )}
            {purchaseAmount === null ? null : (
              <Text className="mt-1 text-base text-text-primary dark:text-text-primary-dark">
                {t("detail.paid", {
                  amount: purchaseAmount,
                })}
              </Text>
            )}
          </View>
          <View>
            <Text
              testID={
                terminalDate === null
                  ? "metal-terminal-facts-unavailable"
                  : undefined
              }
              className="text-base font-medium text-nileGreen-800 dark:text-nileGreen-400"
            >
              {terminalLabel}
            </Text>
            {terminalDate === null ? null : (
              <Text className="mt-1 text-sm text-text-secondary dark:text-text-secondary-dark">
                {formatTerminalDate(terminalDate, locale)}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

function SectionTitle({
  children,
}: {
  readonly children: string;
}): React.JSX.Element {
  return (
    <Text
      accessibilityRole="header"
      className="text-xl font-semibold text-text-primary dark:text-text-primary-dark"
    >
      {children}
    </Text>
  );
}

function TerminalFactRow({
  emphasized = false,
  icon,
  isLtrValue = false,
  label,
  testID,
  value,
}: {
  readonly emphasized?: boolean;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly isLtrValue?: boolean;
  readonly label: string;
  readonly testID?: string;
  readonly value: string;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  const { isDark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const isCompact = shouldUseCompactLayout(width, fontScale);
  const iconColor = isDark ? palette.slate[300] : palette.slate[500];
  const textClassName = emphasized
    ? "text-nileGreen-800 dark:text-nileGreen-400"
    : "text-text-primary dark:text-text-primary-dark";
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={t("detail.fact_accessibility", { label, value })}
      className={`min-h-12 gap-3 border-b border-slate-200 py-2 last:border-b-0 dark:border-slate-800 ${
        isCompact ? "flex-col items-start" : "flex-row items-center"
      }`}
    >
      <Ionicons
        accessibilityElementsHidden
        importantForAccessibility="no"
        name={icon}
        size={20}
        color={iconColor}
      />
      <Text className={`min-w-0 flex-1 text-base ${textClassName}`}>
        {label}
      </Text>
      <Text
        className={`${
          isCompact
            ? "w-full"
            : `max-w-[48%] ${I18nManager.isRTL ? "text-left" : "text-right"}`
        } text-base ${textClassName}`}
        style={isLtrValue ? { writingDirection: "ltr" } : undefined}
      >
        {value}
      </Text>
    </View>
  );
}

function tryDisplayAmount(
  value: string,
  currency: string,
  locale: string
): string | null {
  try {
    const decimalPlaces = resolveCurrencyDisplayDecimalPlaces(currency);
    return `${currency} ${formatCanonicalDecimalForDisplay(value, {
      locale,
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    })}`;
  } catch {
    return null;
  }
}

function getGainTextClass(value: CurrencyDisplaySign | null): string {
  if (value === "negative") return "text-red-600 dark:text-red-500";
  if (value === "positive") {
    return "text-nileGreen-800 dark:text-nileGreen-400";
  }
  return "text-text-secondary dark:text-text-secondary-dark";
}

function resolveLocale(language: string | undefined): string {
  return language?.startsWith("ar") ? "ar-EG-u-nu-latn" : "en-GB";
}

function formatShortDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTerminalDate(value: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return "—";
  const [, year, month, day] = match;
  return formatShortDate(
    new Date(Number(year), Number(month) - 1, Number(day)),
    locale
  );
}

function absoluteDecimal(value: string): string {
  return value.startsWith("-") ? value.slice(1) : value;
}

function disposalReasonLabel(
  reason:
    | "lost_or_stolen"
    | "destroyed_or_damaged"
    | "given_away"
    | "donated"
    | "other",
  treatment: "write_off" | "external_transfer",
  t: (key: string) => string
): string {
  if (reason !== "other") return t(`disposal.reason_${reason}`);
  return `${t("disposal.reason_other")} · ${t(
    `disposal.treatment_${treatment}`
  )}`;
}
