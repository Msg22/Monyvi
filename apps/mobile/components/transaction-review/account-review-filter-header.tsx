/** Temporary account-needed list header; JSX ensures NativeWind transforms its styles. */
import React from "react";
import { useTranslation } from "react-i18next";
import { Text, TouchableOpacity, View } from "react-native";

interface AccountNeededTemporaryHeaderProps {
  readonly count: number;
  readonly disabled: boolean;
  readonly onShowAll: () => void;
}

/** Only the temporary list is scoped; Save always receives the full session. */
export function AccountNeededTemporaryHeader(
  props: AccountNeededTemporaryHeaderProps
): React.JSX.Element {
  const { t, i18n } = useTranslation("transactions");
  const rtl = i18n.language.startsWith("ar");
  const accountNeededLabel = t("account_review_issue_account_needed", {
    defaultValue: rtl ? "مطلوب اختيار حساب" : "Account needed",
  });

  return (
    <View
      testID="account-review-account-needed-only"
      className="mx-5 mb-3 gap-2 rounded-xl border border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark"
    >
      <Text
        className={
          "text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
          (rtl ? "text-right" : "text-left")
        }
      >
        {accountNeededLabel}
        {" · "}
        {props.count}
      </Text>
      <TouchableOpacity
        testID="account-review-account-needed-show-all"
        accessibilityRole="button"
        accessibilityLabel={t("account_review_group_view_all")}
        accessibilityState={{ disabled: props.disabled }}
        disabled={props.disabled}
        onPress={props.onShowAll}
        className={
          "min-h-12 justify-center rounded-lg border border-border px-4 dark:border-border-dark " +
          (rtl ? "self-end" : "self-start")
        }
      >
        <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-400">
          {t("account_review_group_view_all")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
