import { Ionicons } from "@expo/vector-icons";
import type { AccountType } from "@monyvi/db";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

import { ACCOUNT_TYPES } from "@/constants/accounts";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import {
  FieldLabel,
  composeFieldAccessibleName,
} from "@/components/ui/FieldLabel";

interface AccountTypeSelectorProps {
  readonly value: AccountType;
  readonly onChange: (value: AccountType) => void;
  readonly disabled?: boolean;
  readonly required?: boolean;
}

const ACCOUNT_TYPE_LABEL_KEYS = {
  CASH: "type_cash",
  BANK: "type_bank",
  DIGITAL_WALLET: "type_digital_wallet",
} as const;

function getSelectedRowStyle(
  isSelected: boolean,
  isDark: boolean
): ViewStyle | undefined {
  if (!isSelected || !isDark) {
    return undefined;
  }

  return { backgroundColor: `${palette.nileGreen[900]}33` };
}

export function AccountTypeSelector({
  value,
  onChange,
  disabled = false,
  required = false,
}: AccountTypeSelectorProps): JSX.Element {
  const { isDark } = useTheme();
  const { t } = useTranslation("accounts");
  const { t: tCommon } = useTranslation("common");
  const typeLabel = t("account_type");
  const groupAccessibleName = composeFieldAccessibleName({
    label: typeLabel,
    required,
    requiredText: tCommon("required_field"),
  });

  return (
    <View
      className="mb-4"
      accessibilityRole="radiogroup"
      accessibilityLabel={groupAccessibleName}
    >
      <FieldLabel
        label={typeLabel}
        required={required}
        className="input-label mb-2"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 pe-4"
      >
        {ACCOUNT_TYPES.map((type) => {
          const isSelected = value === type.id;
          const accountTypeLabel = t(ACCOUNT_TYPE_LABEL_KEYS[type.id]);

          return (
            <TouchableOpacity
              key={type.id}
              onPress={() => onChange(type.id)}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ disabled, selected: isSelected }}
              accessibilityLabel={
                isSelected
                  ? `${accountTypeLabel}, ${tCommon("selected")}`
                  : accountTypeLabel
              }
              disabled={disabled}
              className={`h-14 flex-none flex-row items-center rounded-3xl border px-2.5 ${
                isSelected
                  ? "border-nileGreen-500 bg-nileGreen-50 "
                  : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
              }`}
              style={getSelectedRowStyle(isSelected, isDark)}
            >
              <View
                className={`h-8 w-8 items-center justify-center rounded-xl ${
                  isSelected
                    ? "bg-nileGreen-100 dark:bg-nileGreen-600"
                    : "bg-slate-100 dark:bg-slate-800"
                }`}
              >
                <Ionicons
                  name={type.icon}
                  size={17}
                  color={
                    isSelected
                      ? palette.nileGreen[800]
                      : isDark
                        ? palette.slate[400]
                        : palette.slate[600]
                  }
                />
              </View>
              <Text
                className="flex-1 px-1 text-sm font-semibold text-text-primary dark:text-text-primary-dark"
                numberOfLines={2}
              >
                {accountTypeLabel}
              </Text>
              {isSelected ? (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={palette.nileGreen[500]}
                />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
