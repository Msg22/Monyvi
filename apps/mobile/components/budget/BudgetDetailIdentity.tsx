import { CategoryIcon } from "@/components/common/CategoryIcon";
import { palette } from "@/constants/colors";
import type {
  BudgetDetailIcon,
  BudgetDetailLifecycleAction,
  BudgetDetailIdentity as BudgetIdentity,
} from "@/contracts/budget-detail-presentation";
import { useLocale } from "@/context/LocaleContext";
import { useTheme } from "@/context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

interface BudgetDetailIdentityProps {
  readonly identity: BudgetIdentity;
  readonly onLifecycleAction: (
    action: Exclude<BudgetDetailLifecycleAction, null>
  ) => void;
  readonly isActionDisabled?: boolean;
}

interface BudgetDetailIconViewProps {
  readonly icon: BudgetDetailIcon;
  readonly size?: number;
}

const toneClasses = {
  GREEN: "bg-nileGreen-500/15 border-nileGreen-600 dark:border-nileGreen-400",
  GOLD: "bg-gold-500/15 border-gold-800 dark:border-gold-400",
  RED: "bg-red-500/15 border-red-600 dark:border-red-500",
  BLUE: "bg-blue-500/15 border-blue-600 dark:border-blue-500",
  VIOLET: "bg-violet-500/15 border-violet-600 dark:border-violet-500",
  SLATE: "bg-slate-500/15 border-slate-500 dark:border-slate-400",
} as const;

const toneColors = {
  GREEN: palette.nileGreen[700],
  GOLD: palette.gold[800],
  RED: palette.red[600],
  BLUE: palette.blue[600],
  VIOLET: palette.violet[700],
  SLATE: palette.slate[500],
} as const;

const darkToneColors = {
  GREEN: palette.nileGreen[400],
  GOLD: palette.gold[400],
  RED: palette.red[500],
  BLUE: palette.blue[500],
  VIOLET: palette.violet[500],
  SLATE: palette.slate[400],
} as const;

export function BudgetDetailIconView({
  icon,
  size = 22,
}: BudgetDetailIconViewProps): React.JSX.Element {
  const { isDark } = useTheme();
  if (icon.kind === "CATEGORY") {
    return (
      <View
        testID="budget-detail-category-icon"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className={`h-12 w-12 items-center justify-center rounded-full border ${toneClasses[icon.tone]}`}
      >
        <CategoryIcon
          iconName={icon.iconName}
          iconLibrary={icon.iconLibrary}
          size={size}
          color={(isDark ? darkToneColors : toneColors)[icon.tone]}
        />
      </View>
    );
  }

  const fallback =
    icon.kind === "GLOBAL"
      ? { testID: "budget-detail-global-icon", name: "wallet-outline" as const }
      : icon.kind === "DELETED_CATEGORY"
        ? {
            testID: "budget-detail-deleted-category-icon",
            name: "help-circle-outline" as const,
          }
        : {
            testID: "budget-detail-transaction-fallback-icon",
            name: "receipt-outline" as const,
          };

  return (
    <View
      testID={fallback.testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={`h-12 w-12 items-center justify-center rounded-full border ${icon.kind === "DELETED_CATEGORY" ? "border-slate-500 bg-slate-500/15 dark:border-slate-400" : "border-nileGreen-600 bg-nileGreen-500/15 dark:border-nileGreen-400"}`}
    >
      <Ionicons
        name={fallback.name}
        size={size}
        color={
          icon.kind === "DELETED_CATEGORY"
            ? isDark
              ? palette.slate[400]
              : palette.slate[500]
            : isDark
              ? palette.nileGreen[400]
              : palette.nileGreen[700]
        }
      />
    </View>
  );
}

export function BudgetDetailIdentity({
  identity,
  onLifecycleAction,
  isActionDisabled = false,
}: BudgetDetailIdentityProps): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const { language } = useLocale();
  const { isDark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const isConstrained = width < 390 || fontScale > 1.2;
  const locale = language === "ar" ? "ar-EG" : "en-US";
  const includesYear =
    identity.periodStart.getFullYear() !== identity.periodEnd.getFullYear();
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(includesYear ? { year: "numeric" as const } : {}),
  });
  const dateRange = `${dateFormatter.format(identity.periodStart)} – ${dateFormatter.format(identity.periodEnd)}`;
  const action = identity.availableLifecycleAction;
  const lifecycleLabel = t(
    `detail.lifecycle.${identity.lifecycle.toLowerCase()}`,
    {
      defaultValue:
        identity.lifecycle === "ACTIVE"
          ? "Active"
          : identity.lifecycle === "PAUSED"
            ? "Paused"
            : "Expired",
    }
  );
  const periodLabel = t(`detail.period.${identity.period.toLowerCase()}`, {
    defaultValue:
      identity.period === "WEEKLY"
        ? "Weekly"
        : identity.period === "MONTHLY"
          ? "Monthly"
          : "Custom",
  });
  const identityAccessibilityLabel = t("detail.accessibility.identity", {
    defaultValue: `${identity.name}, ${lifecycleLabel}, ${periodLabel}, ${dateRange}`,
    name: identity.name,
    lifecycle: lifecycleLabel,
    period: periodLabel,
    dateRange,
  });
  const lifecycleClass =
    identity.lifecycle === "ACTIVE"
      ? "text-nileGreen-700 dark:text-nileGreen-400"
      : identity.lifecycle === "EXPIRED"
        ? "text-red-600 dark:text-red-500"
        : "text-gold-800 dark:text-gold-400";
  const lifecycleAction = action ? (
    <TouchableOpacity
      testID="budget-detail-lifecycle-action"
      accessibilityRole="button"
      accessibilityLabel={t(
        `detail.accessibility.${action === "PAUSE" ? "pause_budget" : "resume_budget"}`,
        {
          defaultValue: `${action === "PAUSE" ? "Pause" : "Resume"} budget: ${identity.name}`,
          name: identity.name,
        }
      )}
      accessibilityState={{ disabled: isActionDisabled }}
      disabled={isActionDisabled}
      onPress={() => onLifecycleAction(action)}
      activeOpacity={0.75}
      className="min-h-11 min-w-11 flex-row items-center justify-center gap-2 rounded-full border border-nileGreen-600 px-3 dark:border-nileGreen-400"
    >
      <Ionicons
        name={action === "PAUSE" ? "pause" : "play"}
        size={18}
        color={isDark ? palette.nileGreen[400] : palette.nileGreen[700]}
      />
      <Text className="text-sm font-semibold text-nileGreen-700 dark:text-nileGreen-400">
        {t(`detail.actions.${action.toLowerCase()}`, {
          defaultValue: action === "PAUSE" ? "Pause" : "Resume",
        })}
      </Text>
    </TouchableOpacity>
  ) : null;

  return (
    <View testID="budget-detail-identity" className="mx-5 mb-4">
      <View className="flex-row items-center gap-3">
        <BudgetDetailIconView icon={identity.icon} size={24} />
        <View
          className="min-w-0 flex-1"
          accessible
          importantForAccessibility="yes"
          accessibilityLabel={identityAccessibilityLabel}
        >
          <Text className="text-xl font-semibold text-text-primary dark:text-text-primary-dark">
            {identity.name}
          </Text>
          <View className="mt-1 flex-row flex-wrap items-center gap-x-2">
            <Text className={`text-sm font-semibold ${lifecycleClass}`}>
              {lifecycleLabel}
            </Text>
            <Text className="text-sm text-text-muted">•</Text>
            <Text className="text-sm font-semibold text-nileGreen-700 dark:text-nileGreen-400">
              {periodLabel}
            </Text>
            <Text className="text-sm text-text-muted">•</Text>
            <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
              {dateRange}
            </Text>
          </View>
        </View>
        {!isConstrained ? lifecycleAction : null}
      </View>
      {isConstrained && lifecycleAction ? (
        <View className="mt-3 items-end">{lifecycleAction}</View>
      ) : null}
    </View>
  );
}
