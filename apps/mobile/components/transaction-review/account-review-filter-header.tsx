/** #395 temporary drilldown header; canonical Save still owns the full session. */
import React from "react";
import { useTranslation } from "react-i18next";
import { Text, TouchableOpacity, View } from "react-native";

interface AccountNeededTemporaryHeaderProps {
  readonly count: number;
  readonly linkedGroupName?: string | null;
  readonly disabled: boolean;
  readonly onShowAll: () => void;
}

export function AccountNeededTemporaryHeader(
  props: AccountNeededTemporaryHeaderProps
): React.JSX.Element {
  const { t, i18n } = useTranslation("transactions");
  const rtl = i18n.language.startsWith("ar");
  const isLinked = props.linkedGroupName !== undefined;
  const heading = isLinked
    ? t("compact_review_linked_scope", {
        count: props.count,
        name: props.linkedGroupName ?? "",
      })
    : t("account_review_issue_account_needed") + " · " + props.count;

  return (
    <View
      testID={
        isLinked
          ? "account-review-linked-transactions-only"
          : "account-review-account-needed-only"
      }
      className="mx-4 mb-3 gap-2 rounded-xl border border-border bg-surface px-3 py-2 dark:border-border-dark dark:bg-surface-dark"
    >
      <Text
        accessibilityRole="header"
        className={
          "text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
          (rtl ? "text-right" : "text-left")
        }
      >
        {heading}
      </Text>
      <TouchableOpacity
        testID="account-review-account-needed-show-all"
        accessibilityRole="button"
        accessibilityLabel={t("compact_review_show_all")}
        accessibilityState={{ disabled: props.disabled }}
        disabled={props.disabled}
        onPress={props.onShowAll}
        className={
          "min-h-11 min-w-11 justify-center px-1 " +
          (rtl ? "self-end" : "self-start")
        }
      >
        <Text className="text-sm font-semibold text-nileGreen-700 dark:text-nileGreen-400">
          {t("compact_review_show_all")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
