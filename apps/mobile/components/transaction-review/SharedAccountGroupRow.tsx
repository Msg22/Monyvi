/** #395: compact responsive group identity, menu, linked-row and removed-ghost UI. */
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Text, TouchableOpacity, View, type TextStyle } from "react-native";
import { useColorScheme } from "nativewind";
import { palette } from "@/constants/colors";
import { useTranslation } from "react-i18next";
import type { SharedSuggestedGroupView } from "./SharedAccountSuggestions";
import {
  displayIdentity,
  presentReviewLinkedCount,
  reviewCopy,
  type ReviewDisplayLanguage,
} from "./shared-account-presentation";

interface SharedAccountGroupRowProps {
  readonly group: SharedSuggestedGroupView;
  readonly language: ReviewDisplayLanguage;
  readonly showDivider: boolean;
  readonly disabled: boolean;
  readonly isMenuOpen: boolean;
  readonly onConfirm: () => void;
  readonly onMenu: () => void;
  readonly onEdit: () => void;
  readonly onReplace: () => void;
  readonly onRemove: () => void;
  readonly onUndo: () => void;
  readonly onViewLinked?: () => void;
  readonly onDiscard?: () => void;
}
function groupIcon(
  value: string
):
  | "business-outline"
  | "wallet-outline"
  | "cash-outline"
  | "help-circle-outline" {
  if (value === "business-outline") return "business-outline";
  if (value === "wallet-outline") return "wallet-outline";
  if (value === "cash-outline") return "cash-outline";
  return "help-circle-outline";
}

function GroupStatusCount({
  group,
  language,
}: Pick<SharedAccountGroupRowProps, "group" | "language">): React.JSX.Element {
  const [statusLine, setStatusLine] = useState<number | null>(null);
  const [dotLine, setDotLine] = useState<number | null>(null);
  const [countLine, setCountLine] = useState<number | null>(null);
  const inline =
    statusLine !== null &&
    dotLine !== null &&
    countLine !== null &&
    Math.abs(statusLine - dotLine) < 2 &&
    Math.abs(statusLine - countLine) < 2;
  const tone = group.isRemoved
    ? "text-red-600 dark:text-red-500"
    : group.isConfirmed
      ? "text-nileGreen-700 dark:text-nileGreen-400"
      : "text-gold-800 dark:text-gold-400";
  return (
    <View
      className={
        "min-w-0 flex-row flex-wrap items-center gap-x-1 gap-y-0.5 " +
        (language === "ar" ? "flex-row-reverse" : "")
      }
    >
      <Text
        testID={"account-review-group-status-" + group.groupId}
        onLayout={(event) => setStatusLine(event.nativeEvent.layout.y)}
        className={"shrink text-xs font-semibold leading-5 " + tone}
      >
        {group.statusLabel}
      </Text>
      {!group.isRemoved ? (
        <View
          onLayout={(event) => setDotLine(event.nativeEvent.layout.y)}
          className="w-2 shrink-0 items-center"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          <Text
            style={{ opacity: inline ? 1 : 0 }}
            className="text-xs leading-5 text-text-secondary dark:text-text-secondary-dark"
          >
            {"·"}
          </Text>
        </View>
      ) : null}
      {!group.isRemoved ? (
        <Text
          onLayout={(event) => setCountLine(event.nativeEvent.layout.y)}
          className="min-w-0 shrink text-xs leading-5 text-text-secondary dark:text-text-secondary-dark"
        >
          {presentReviewLinkedCount(group.linkedCount, language)}
        </Text>
      ) : null}
    </View>
  );
}

function CompactGroupAction({
  label,
  onPress,
  disabled,
  iconName,
  testID,
  tone = "default",
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled: boolean;
  readonly iconName?: keyof typeof Ionicons.glyphMap;
  readonly testID?: string;
  readonly tone?: "default" | "danger";
}): React.JSX.Element {
  const { colorScheme } = useColorScheme();
  const ink =
    tone === "danger"
      ? colorScheme === "dark"
        ? palette.red[400]
        : palette.red[600]
      : colorScheme === "dark"
        ? palette.nileGreen[400]
        : palette.nileGreen[700];
  return (
    <TouchableOpacity
      testID={testID}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.8}
      className="min-h-11 min-w-11 flex-row items-center justify-center gap-1 rounded-lg px-1"
    >
      {iconName ? (
        <Ionicons
          name={iconName}
          size={16}
          color={ink}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      <Text
        className={
          "text-xs font-semibold leading-5 " +
          (tone === "danger"
            ? "text-red-600 dark:text-red-400"
            : "text-nileGreen-700 dark:text-nileGreen-400")
        }
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function InlineGroupMenu(
  props: SharedAccountGroupRowProps
): React.JSX.Element | null {
  const { group, language } = props;
  if (!props.isMenuOpen || group.isRemoved) return null;
  return (
    <View
      testID="account-review-group-inline-menu"
      className={
        "w-full flex-row flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-border pt-1 dark:border-border-dark " +
        (language === "ar" ? "flex-row-reverse" : "")
      }
    >
      {group.canEdit ? (
        <CompactGroupAction
          testID="account-review-group-edit"
          label={reviewCopy("account_review_group_edit", language)}
          iconName="create-outline"
          onPress={props.onEdit}
          disabled={props.disabled}
        />
      ) : null}
      {group.canReplace ? (
        <CompactGroupAction
          testID="account-review-group-replace"
          label={reviewCopy("account_review_group_replace", language)}
          iconName="swap-horizontal-outline"
          onPress={props.onReplace}
          disabled={props.disabled}
        />
      ) : null}
      {group.canRemove ? (
        <CompactGroupAction
          testID="account-review-group-remove"
          label={reviewCopy("account_review_group_remove", language)}
          iconName="trash-outline"
          tone="danger"
          onPress={props.onRemove}
          disabled={props.disabled}
        />
      ) : null}
    </View>
  );
}

export function SharedAccountGroupRow(
  props: SharedAccountGroupRowProps
): React.JSX.Element {
  const { group, language } = props;
  const { t } = useTranslation("transactions");
  const { colorScheme } = useColorScheme();
  const rtl = language === "ar";
  const direction: TextStyle["writingDirection"] = rtl ? "rtl" : "ltr";
  const iconInk =
    colorScheme === "dark" ? palette.slate[300] : palette.slate[600];
  return (
    <View
      testID={"account-review-group-card-" + group.groupId}
      className={
        "min-w-0 gap-1.5 py-3 " +
        (props.showDivider
          ? "border-b border-border dark:border-border-dark"
          : "")
      }
    >
      <View
        className={
          "min-w-0 flex-row flex-wrap items-start gap-x-2 gap-y-1 " +
          (rtl ? "flex-row-reverse" : "")
        }
      >
        <View className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
          <Ionicons
            name={groupIcon(group.typeIconName)}
            size={20}
            color={iconInk}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            testID={"account-review-group-name-" + group.groupId}
            style={{ writingDirection: direction }}
            className={
              "text-sm font-semibold leading-5 " +
              (group.isRemoved
                ? "text-text-secondary line-through dark:text-text-secondary-dark"
                : "text-text-primary dark:text-text-primary-dark") +
              (rtl ? " text-right" : " text-left")
            }
          >
            {displayIdentity(group.displayName, language)} {"·"}{" "}
            {displayIdentity(group.currencyLabel, language)}
          </Text>
          <GroupStatusCount group={group} language={language} />
          {group.identitySummary.trim() ? (
            <Text
              style={{ writingDirection: direction }}
              className={
                "text-xs leading-[18px] text-text-secondary dark:text-text-secondary-dark " +
                (rtl ? "text-right" : "text-left")
              }
            >
              {displayIdentity(group.identitySummary, language)}
            </Text>
          ) : null}
        </View>
        <View
          className={
            "max-w-full shrink-0 flex-row flex-wrap items-center " +
            (rtl ? "flex-row-reverse" : "")
          }
        >
          {!group.isRemoved && group.canConfirm && !group.isConfirmed ? (
            <CompactGroupAction
              testID={"account-review-group-confirm-" + group.groupId}
              label={reviewCopy("account_review_group_confirm", language)}
              onPress={props.onConfirm}
              disabled={props.disabled}
              iconName="checkmark-circle-outline"
            />
          ) : null}
          {!group.isRemoved && group.isConfirmed && group.canReplace ? (
            <CompactGroupAction
              testID={"account-review-group-change-" + group.groupId}
              label={reviewCopy("account_review_group_change", language)}
              iconName="create-outline"
              onPress={props.onReplace}
              disabled={props.disabled}
            />
          ) : null}
          {group.isRemoved ? (
            <>
              {group.canUndo ? (
                <CompactGroupAction
                  testID="account-review-group-undo"
                  label={reviewCopy("account_review_group_undo", language)}
                  onPress={props.onUndo}
                  disabled={props.disabled}
                  iconName="arrow-undo-outline"
                />
              ) : null}
              {props.onDiscard ? (
                <TouchableOpacity
                  testID={"account-review-group-discard-" + group.groupId}
                  accessibilityRole="button"
                  accessibilityLabel={t("compact_review_discard_suggestion")}
                  accessibilityState={{ disabled: props.disabled }}
                  disabled={props.disabled}
                  onPress={props.onDiscard}
                  className="min-h-11 min-w-11 items-center justify-center"
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={palette.red[600]}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <TouchableOpacity
              testID={"account-review-group-actions-" + group.groupId}
              accessibilityRole="button"
              accessibilityLabel={t("compact_review_group_actions", {
                name: group.displayName,
              })}
              accessibilityState={{
                expanded: props.isMenuOpen,
                disabled: props.disabled,
              }}
              disabled={props.disabled}
              onPress={props.onMenu}
              className="min-h-11 min-w-11 items-center justify-center"
            >
              <Ionicons
                name="ellipsis-vertical"
                size={20}
                color={iconInk}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
      {!group.isRemoved && props.onViewLinked && group.linkedCount > 0 ? (
        <View
          testID={"account-review-group-linked-wrap-" + group.groupId}
          className={
            rtl
              ? "ps-10 flex-row-reverse justify-start"
              : "ps-10 flex-row justify-start"
          }
        >
          <TouchableOpacity
            testID={"account-review-group-linked-" + group.groupId}
            accessible
            accessibilityRole="button"
            accessibilityLabel={t("compact_review_view_linked")}
            accessibilityState={{ disabled: props.disabled }}
            disabled={props.disabled}
            onPress={props.onViewLinked}
            className={
              rtl
                ? "min-h-11 min-w-11 flex-row-reverse items-center gap-1"
                : "min-h-11 min-w-11 flex-row items-center gap-1"
            }
          >
            <Text className="text-xs font-semibold leading-5 text-nileGreen-700 dark:text-nileGreen-400">
              {t("compact_review_view_linked")}
            </Text>
            <Ionicons
              name={rtl ? "chevron-back-outline" : "chevron-forward-outline"}
              size={16}
              color={
                colorScheme === "dark"
                  ? palette.nileGreen[400]
                  : palette.nileGreen[700]
              }
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </TouchableOpacity>
        </View>
      ) : null}
      <InlineGroupMenu {...props} />
    </View>
  );
}
