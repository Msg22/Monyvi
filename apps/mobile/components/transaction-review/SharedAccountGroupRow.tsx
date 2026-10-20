/**
 * #395 owned group-row presentation: readable responsive identity and group
 * controls. The parent continues to own selection, commands and menu state.
 */
import { Ionicons } from "@expo/vector-icons";
import { t } from "i18next";
import React, { useState } from "react";
import { Text, TouchableOpacity, View, type TextStyle } from "react-native";
import { useColorScheme } from "nativewind";
import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";
import type { SharedSuggestedGroupView } from "./SharedAccountSuggestions";
import {
  displayIdentity,
  presentReviewLinkedCount,
  ReviewActionButton,
  reviewCopy,
  type ReviewDisplayLanguage,
} from "./shared-account-presentation";

interface SharedAccountGroupRowProps {
  readonly group: SharedSuggestedGroupView;
  readonly language: ReviewDisplayLanguage;
  readonly showDivider: boolean;
  readonly disabled: boolean;
  readonly onConfirm: () => void;
  readonly onMenu: () => void;
  readonly onUndo: () => void;
}
function groupIcon(
  input: string
):
  | "business-outline"
  | "wallet-outline"
  | "cash-outline"
  | "help-circle-outline" {
  if (input === "wallet-outline") return "wallet-outline";
  if (input === "cash-outline") return "cash-outline";
  if (input === "business-outline") return "business-outline";
  return "help-circle-outline";
}
/** Show the separator only when status, separator and count share a line. */
function GroupStatusCount({
  group,
  language,
}: Pick<SharedAccountGroupRowProps, "group" | "language">): React.JSX.Element {
  const [statusTop, setStatusTop] = useState<number | null>(null);
  const [dotTop, setDotTop] = useState<number | null>(null);
  const [countTop, setCountTop] = useState<number | null>(null);
  const inline =
    statusTop !== null &&
    dotTop !== null &&
    countTop !== null &&
    Math.abs(statusTop - dotTop) < 2 &&
    Math.abs(statusTop - countTop) < 2;
  const rtl = language === "ar";
  const statusTone = group.isRemoved
    ? "text-red-600 dark:text-red-500"
    : group.isConfirmed
      ? "text-nileGreen-700 dark:text-nileGreen-400"
      : "text-gold-800 dark:text-gold-400";
  const status =
    group.statusLabel ||
    (group.isRemoved
      ? t("account_review_group_removed", { lng: language, ns: "transactions" })
      : "");
  return (
    <View
      className={
        "min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 " +
        (rtl ? "flex-row-reverse" : "flex-row")
      }
    >
      <Text
        testID={"account-review-group-status-" + group.groupId}
        onLayout={({ nativeEvent }) =>
          setStatusTop((old) =>
            old === nativeEvent.layout.y ? old : nativeEvent.layout.y
          )
        }
        className={"shrink text-sm font-semibold leading-5 " + statusTone}
      >
        {status}
      </Text>
      <View
        onLayout={({ nativeEvent }) =>
          setDotTop((old) =>
            old === nativeEvent.layout.y ? old : nativeEvent.layout.y
          )
        }
        className="w-2 shrink-0 items-center"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        <Text
          style={{ opacity: inline ? 1 : 0 }}
          className="text-sm leading-5 text-text-secondary dark:text-text-secondary-dark"
        >
          {"·"}
        </Text>
      </View>
      <Text
        onLayout={({ nativeEvent }) =>
          setCountTop((old) =>
            old === nativeEvent.layout.y ? old : nativeEvent.layout.y
          )
        }
        className="min-w-0 shrink text-sm leading-5 text-text-secondary dark:text-text-secondary-dark"
      >
        {presentReviewLinkedCount(group.linkedCount, language)}
      </Text>
    </View>
  );
}
function GroupIdentity({
  group,
  language,
}: Pick<SharedAccountGroupRowProps, "group" | "language">): React.JSX.Element {
  const { colorScheme } = useColorScheme();
  const rtl = language === "ar";
  const direction: TextStyle["writingDirection"] = rtl ? "rtl" : "ltr";
  return (
    <View
      className={
        "min-w-[148px] flex-1 items-start gap-2 " +
        (rtl ? "flex-row-reverse" : "flex-row")
      }
    >
      <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
        <Ionicons
          name={groupIcon(group.typeIconName)}
          size={22}
          color={
            colorScheme === "dark" ? palette.slate[300] : palette.slate[600]
          }
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text
          className={
            "text-base font-semibold leading-6 text-text-primary dark:text-text-primary-dark " +
            (rtl ? "text-right" : "text-left")
          }
          style={{ writingDirection: direction }}
        >
          {displayIdentity(group.displayName, language)} ·{" "}
          {displayIdentity(group.currencyLabel, language)}
        </Text>
        <GroupStatusCount group={group} language={language} />
        {group.identitySummary.trim().length > 0 ? (
          <Text
            className={
              "text-xs leading-[18px] text-text-secondary dark:text-text-secondary-dark " +
              (rtl ? "text-right" : "text-left")
            }
            style={{ writingDirection: direction }}
          >
            {displayIdentity(group.identitySummary, language)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
function GroupMenuTrigger({
  group,
  language,
  disabled,
  onPress,
}: {
  readonly group: SharedSuggestedGroupView;
  readonly language: ReviewDisplayLanguage;
  readonly disabled: boolean;
  readonly onPress: () => void;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      testID={"account-review-group-actions-" + group.groupId}
      accessible
      accessibilityRole="button"
      accessibilityLabel={
        reviewCopy("account_review_group_change", language) +
        " " +
        group.displayName +
        ", " +
        group.linkedCount
      }
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.75}
      className="h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border dark:border-border-dark"
    >
      <Ionicons
        name="ellipsis-vertical"
        size={20}
        color={palette.slate[500]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </TouchableOpacity>
  );
}
/** A scoped compact presentation of the existing group action; no new command path. */
/** Smaller visual action chrome inside the unchanged 48 dp hit area. */
function GroupAction(
  props: React.ComponentProps<typeof ReviewActionButton>
): React.JSX.Element {
  const { colorScheme } = useColorScheme();
  const rtl = useLocale().language === "ar";
  const disabled = props.disabled === true;
  const isQuiet = props.tone === "quiet";
  const ink = disabled
    ? "text-text-muted dark:text-text-muted-dark"
    : "text-nileGreen-700 dark:text-nileGreen-400";
  const surface = disabled
    ? "bg-slate-200 dark:bg-slate-700"
    : isQuiet
      ? "bg-transparent"
      : "border border-border dark:border-border-dark";
  return (
    <TouchableOpacity
      testID={props.testID}
      accessible
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={props.onPress}
      activeOpacity={0.8}
      className={
        "min-h-12 min-w-11 shrink-0 items-center justify-center gap-1 rounded-lg px-2 " +
        (rtl ? "flex-row-reverse " : "flex-row ") +
        surface
      }
    >
      {props.iconName ? (
        <Ionicons
          name={props.iconName}
          size={16}
          color={
            colorScheme === "dark"
              ? palette.nileGreen[400]
              : palette.nileGreen[700]
          }
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      <Text className={"shrink text-sm font-semibold leading-5 " + ink}>
        {props.label}
      </Text>
    </TouchableOpacity>
  );
}
function GroupControls(props: SharedAccountGroupRowProps): React.JSX.Element {
  const { group, language, disabled } = props;
  const rtl = language === "ar";
  const canAct = !disabled && !group.isRemoved;
  const direction = rtl ? "flex-row-reverse " : "flex-row ";
  return (
    <View
      className={
        direction + "max-w-full shrink-0 flex-wrap items-center gap-1.5"
      }
    >
      {!group.isRemoved && group.canConfirm && !group.isConfirmed ? (
        <GroupAction
          testID={"account-review-group-confirm-" + group.groupId}
          iconName="checkmark-circle-outline"
          tone="outline"
          label={reviewCopy("account_review_group_confirm", language)}
          accessibilityLabel={
            reviewCopy("account_review_group_confirm", language) +
            " " +
            group.displayName +
            ", " +
            group.linkedCount
          }
          disabled={disabled}
          onPress={props.onConfirm}
        />
      ) : null}
      {group.isRemoved && group.canUndo ? (
        <GroupAction
          testID="account-review-group-undo"
          iconName="arrow-undo-outline"
          tone="quiet"
          label={reviewCopy("account_review_group_undo", language)}
          accessibilityLabel={
            reviewCopy("account_review_group_undo", language) +
            " " +
            group.displayName +
            ", " +
            group.linkedCount
          }
          disabled={disabled}
          onPress={props.onUndo}
        />
      ) : null}
      {!group.isRemoved && group.isConfirmed && group.canEdit ? (
        <GroupAction
          testID={"account-review-group-change-" + group.groupId}
          tone="outline"
          label={reviewCopy("account_review_group_change", language)}
          disabled={disabled}
          onPress={props.onMenu}
        />
      ) : null}
      {!group.isRemoved ? (
        <GroupMenuTrigger
          group={group}
          language={language}
          disabled={!canAct}
          onPress={props.onMenu}
        />
      ) : null}
    </View>
  );
}
export function SharedAccountGroupRow(
  props: SharedAccountGroupRowProps
): React.JSX.Element {
  const { group, language } = props;
  const rtl = language === "ar";
  const direction: TextStyle["writingDirection"] = rtl ? "rtl" : "ltr";
  return (
    <View
      testID={"account-review-group-card-" + group.groupId}
      className={
        "w-full min-h-[68px] gap-2 py-3 dark:border-border-dark " +
        (props.showDivider ? "border-b border-border" : "")
      }
    >
      <View
        className={
          "flex-wrap items-start gap-x-2 gap-y-1 " +
          (rtl ? "flex-row-reverse" : "flex-row")
        }
      >
        <GroupIdentity group={group} language={language} />
        <GroupControls {...props} />
      </View>
      {!group.isRemoved && group.disclosureText.trim().length > 0 ? (
        <Text
          testID={"account-review-group-disclosure-" + group.groupId}
          className={
            "text-xs leading-[18px] text-text-secondary dark:text-text-secondary-dark " +
            (rtl ? "text-right" : "text-left")
          }
          style={{ writingDirection: direction }}
        >
          {group.disclosureText}
        </Text>
      ) : null}
    </View>
  );
}
