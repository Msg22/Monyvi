/**
 * #395 T070 — B1 account-default star/track shared by Add and Edit.
 * A controlled presentation only: no account reads or persistence.
 */
import { Ionicons } from "@expo/vector-icons";
import type { AccountType } from "@monyvi/db";
import { useTranslation } from "react-i18next";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { palette } from "@/constants/colors";

export interface AccountDefaultFieldProps {
  readonly accountType: AccountType;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly firstOwnedAccount?: boolean;
  readonly previousDefaultName?: string | null;
  readonly onChange: (nextValue: boolean) => void;
}

const styles = StyleSheet.create({
  thumbShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
});

function AccountDefaultHelp(
  props: AccountDefaultFieldProps
): React.JSX.Element {
  const { t } = useTranslation("accounts");
  const isCash = props.accountType === "CASH";
  const showPrevious =
    !props.firstOwnedAccount &&
    props.checked &&
    props.previousDefaultName !== null &&
    props.previousDefaultName !== undefined;
  const previousName = props.previousDefaultName ?? "";

  return (
    <View className="gap-0.5">
      <Text className="text-xs leading-[18px] text-text-secondary dark:text-text-secondary-dark">
        {t(
          isCash ? "default_account_cash_helper" : "default_account_bank_helper"
        )}
      </Text>
      {isCash ? (
        <Text className="text-xs leading-[18px] text-text-secondary dark:text-text-secondary-dark">
          {t("default_account_cash_sms_restriction")}
        </Text>
      ) : null}
      {props.firstOwnedAccount ? (
        <Text className="text-xs leading-[18px] text-nileGreen-700 dark:text-nileGreen-400">
          {t("default_account_first_helper")}
        </Text>
      ) : null}
      {showPrevious ? (
        <Text className="text-xs leading-[18px] text-nileGreen-700 dark:text-nileGreen-400">
          {previousName === "Cash" || previousName === "كاش"
            ? t("default_account_replace_cash")
            : t("default_account_replace_named", {
                defaultAccountName: previousName,
              })}
        </Text>
      ) : null}
    </View>
  );
}

export function AccountDefaultField(
  props: AccountDefaultFieldProps
): React.JSX.Element {
  const { t } = useTranslation("accounts");
  const { isDark } = useTheme();
  const label = t("default_account");

  return (
    <TouchableOpacity
      testID="account-default-switch"
      accessible
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{
        checked: props.checked,
        disabled: props.disabled,
      }}
      disabled={props.disabled}
      activeOpacity={0.8}
      onPress={() => {
        if (!props.disabled) props.onChange(!props.checked);
      }}
      className="mb-3 min-h-11 flex-row items-center justify-between px-1 py-4"
    >
      <View className="min-w-0 flex-1 flex-row items-start">
        <Ionicons
          name={props.checked ? "star" : "star-outline"}
          size={22}
          color={
            props.checked
              ? palette.nileGreen[500]
              : isDark
                ? palette.slate[400]
                : palette.slate[500]
          }
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View className="ms-3 min-w-0 flex-1 gap-0.5">
          <Text className="text-base font-semibold leading-6 text-text-primary dark:text-text-primary-dark">
            {label}
          </Text>
          <AccountDefaultHelp {...props} />
        </View>
      </View>
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className={
          "ms-3 h-7 w-12 justify-center rounded-full px-0.5 " +
          (props.checked
            ? "bg-nileGreen-500"
            : "bg-slate-200 dark:bg-slate-700")
        }
      >
        <View
          className={
            "h-6 w-6 rounded-full bg-white " +
            (props.checked ? "self-end" : "self-start")
          }
          style={styles.thumbShadow}
        />
      </View>
    </TouchableOpacity>
  );
}

/** Existing friendly recovery/error vocabulary; no invented accounting status. */
export function AccountDefaultRecoveryNotice({
  onRetry,
}: {
  readonly onRetry: () => void;
}): React.JSX.Element {
  const { t } = useTranslation("common");
  return (
    <View
      testID="account-default-recovery"
      accessibilityRole="alert"
      className="mb-3 gap-2 rounded-xl border border-border bg-surface p-3 dark:border-border-dark dark:bg-surface-dark"
    >
      <Text className="text-sm leading-5 text-text-secondary dark:text-text-secondary-dark">
        {t("error_generic")}
      </Text>
      <TouchableOpacity
        testID="account-default-retry"
        accessible
        accessibilityRole="button"
        accessibilityLabel={t("retry")}
        onPress={onRetry}
        className="min-h-11 self-start justify-center rounded-lg border border-border px-4 dark:border-border-dark"
      >
        <Text className="text-sm font-semibold text-nileGreen-700 dark:text-nileGreen-400">
          {t("retry")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
