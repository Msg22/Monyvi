import { Ionicons } from "@expo/vector-icons";
import type { TransactionType } from "@monyvi/db";
import * as Haptics from "expo-haptics";
import type { JSX } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";

type TabType = TransactionType | "TRANSFER";

interface TypeTabsProps {
  readonly selectedType: TabType;
  readonly onSelect: (type: TabType) => void;
  readonly hideTransfer?: boolean;
  readonly compact?: boolean;
  readonly containerClassName?: string;
  readonly tabClassName?: string;
}

interface TabConfig {
  readonly value: TabType;
  readonly legacyLabel: string;
  readonly labelKey: "expense" | "income" | "transfer";
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly iconColor: string;
  readonly selectedBorderClassName: string;
  readonly selectedBackgroundClassName: string;
  readonly selectedTextClassName: string;
}

const TAB_CONFIG: readonly TabConfig[] = [
  {
    value: "EXPENSE",
    legacyLabel: "EXPENSE",
    labelKey: "expense",
    icon: "remove-circle",
    iconColor: palette.red[500],
    selectedBorderClassName: "border-red-500",
    selectedBackgroundClassName: "bg-red-500/10",
    selectedTextClassName: "text-red-500",
  },
  {
    value: "INCOME",
    legacyLabel: "INCOME",
    labelKey: "income",
    icon: "arrow-up-circle",
    iconColor: palette.nileGreen[500],
    selectedBorderClassName: "border-nileGreen-500",
    selectedBackgroundClassName: "bg-nileGreen-500/10",
    selectedTextClassName: "text-nileGreen-500",
  },
  {
    value: "TRANSFER",
    legacyLabel: "TRANSFER",
    labelKey: "transfer",
    icon: "swap-horizontal",
    iconColor: palette.blue[500],
    selectedBorderClassName: "border-blue-500",
    selectedBackgroundClassName: "bg-blue-500/10",
    selectedTextClassName: "text-blue-500",
  },
];

export function TypeTabs({
  selectedType,
  onSelect,
  hideTransfer = false,
  compact = false,
  containerClassName,
  tabClassName,
}: TypeTabsProps): JSX.Element {
  const tabs = hideTransfer
    ? TAB_CONFIG.filter((tab) => tab.value !== "TRANSFER")
    : TAB_CONFIG;

  if (compact) {
    return (
      <CompactTypeTabs
        tabs={tabs}
        selectedType={selectedType}
        onSelect={onSelect}
        containerClassName={containerClassName}
        tabClassName={tabClassName}
      />
    );
  }

  return (
    <View
      className={`mx-6 mb-4 flex-row rounded-full border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-700 dark:bg-slate-800/80 ${
        containerClassName ?? ""
      }`}
    >
      {tabs.map((tab) => {
        const isSelected = selectedType === tab.value;
        return (
          <TouchableOpacity
            key={tab.value}
            testID={`type-tab-${tab.value}`}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                console.error
              );
              onSelect(tab.value);
            }}
            activeOpacity={0.8}
            className={`flex-1 items-center justify-center rounded-full py-2.5 ${
              tabClassName ?? ""
            }`}
            style={{
              backgroundColor: isSelected ? tab.iconColor : undefined,
            }}
          >
            <Text
              className={`text-xs font-extrabold tracking-widest ${
                isSelected
                  ? "text-white"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {tab.legacyLabel}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function CompactTypeTabs({
  tabs,
  selectedType,
  onSelect,
  containerClassName,
  tabClassName,
}: {
  readonly tabs: readonly TabConfig[];
  readonly selectedType: TabType;
  readonly onSelect: (type: TabType) => void;
  readonly containerClassName?: string;
  readonly tabClassName?: string;
}): JSX.Element {
  const { t } = useTranslation("transactions");
  const { fontFamily } = useLocale();

  return (
    <View
      className={`mx-4 mb-3 flex-row gap-1.5 rounded-xl border border-slate-200 bg-slate-25 p-1 dark:border-slate-700 dark:bg-slate-900 ${
        containerClassName ?? ""
      }`}
    >
      {tabs.map((tab) => {
        const isSelected = selectedType === tab.value;
        const label = t(tab.labelKey);

        return (
          <TouchableOpacity
            key={tab.value}
            testID={`type-tab-${tab.value}`}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: isSelected }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                console.error
              );
              onSelect(tab.value);
            }}
            activeOpacity={0.8}
            className={`relative min-h-12 flex-1 flex-row items-center justify-center rounded-lg border px-2 ${
              isSelected ? tab.selectedBorderClassName : "border-transparent"
            } ${tabClassName ?? ""}`}
          >
            {isSelected ? (
              <View
                pointerEvents="none"
                className={`absolute inset-0 rounded-lg ${tab.selectedBackgroundClassName}`}
              />
            ) : null}
            <Ionicons
              name={tab.icon}
              size={18}
              color={isSelected ? tab.iconColor : palette.slate[400]}
            />
            <Text
              className={`ms-2 text-base leading-[26px] font-semibold ${
                isSelected
                  ? tab.selectedTextClassName
                  : "text-text-secondary dark:text-text-secondary-dark"
              }`}
              style={{ fontFamily: fontFamily.semiBold }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
