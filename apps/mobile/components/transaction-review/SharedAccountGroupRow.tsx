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
  readonly viewportWidth: number;
  readonly fontScale: number;
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
function GroupIdentity({
  group,
  language,
  compact,
  stacked,
}: Pick<SharedAccountGroupRowProps, "group" | "language"> & {
  readonly compact: boolean;
  readonly stacked: boolean;
}): React.JSX.Element {
  const { colorScheme } = useColorScheme();
  const rtl = language === "ar";
  const direction: TextStyle["writingDirection"] = rtl ? "rtl" : "ltr";
  return (
    <View
      className={
        (stacked ? "w-full " : "min-w-0 flex-1 ") +
        (rtl ? "flex-row-reverse " : "flex-row ") +
        (compact ? "items-start gap-2" : "items-start gap-3")
      }
    >
      <View
        className={
          (compact ? "h-8 w-8 " : "h-10 w-10 ") +
          "shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700"
        }
      >
        <Ionicons
          name={groupIcon(group.typeIconName)}
          size={compact ? 18 : 22}
          color={
            colorScheme === "dark" ? palette.slate[300] : palette.slate[600]
          }
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
      <View className="min-w-0 grow shrink gap-1">
        <Text
          className={
            (compact
              ? "text-sm font-semibold leading-5 "
              : "text-base font-semibold leading-6 ") +
            "text-text-primary dark:text-text-primary-dark " +
            (rtl ? "text-right" : "text-left")
          }
          style={{ writingDirection: direction }}
        >
          {displayIdentity(group.displayName, language)} ·{" "}
          {displayIdentity(group.currencyLabel, language)}
        </Text>
        <View
          className={
            (rtl ? "flex-row-reverse " : "flex-row ") +
            "flex-wrap items-center gap-1"
          }
        >
          <Text
            testID={"account-review-group-status-" + group.groupId}
            className={
              (compact ? "text-xs leading-[18px] " : "text-sm leading-5 ") +
              "font-semibold " +
              (group.isRemoved
                ? "text-red-600 dark:text-red-500"
                : group.isConfirmed
                  ? "text-nileGreen-700 dark:text-nileGreen-400"
                  : "text-gold-800 dark:text-gold-400")
            }
          >
            {group.statusLabel ||
              (group.isRemoved
                ? t("account_review_group_removed", {
                    lng: language,
                    ns: "transactions",
                  })
                : "")}
          </Text>
          <Text
            className={
              (compact ? "text-xs leading-[18px] " : "text-sm leading-5 ") +
              "text-text-secondary dark:text-text-secondary-dark"
            }
          >
            {" · "}
            {presentReviewLinkedCount(group.linkedCount, language)}
          </Text>
        </View>
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
  compact,
  onPress,
}: {
  readonly group: SharedSuggestedGroupView;
  readonly language: ReviewDisplayLanguage;
  readonly disabled: boolean;
  readonly compact: boolean;
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
        size={compact ? 18 : 22}
        color={palette.slate[500]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </TouchableOpacity>
  );
}
/** A scoped compact presentation of the existing group action; no new command path. */
function GroupAction(
  props: React.ComponentProps<typeof ReviewActionButton> & {
    readonly compact: boolean;
  }
): React.JSX.Element {
  const { colorScheme } = useColorScheme();
  const rtl = useLocale().language === "ar";
  if (!props.compact) return <ReviewActionButton {...props} />;
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
      <Text className={"text-sm font-semibold leading-5 " + ink}>
        {props.label}
      </Text>
    </TouchableOpacity>
  );
}
function GroupControls(
  props: SharedAccountGroupRowProps & {
    readonly compact: boolean;
    readonly stackActions: boolean;
  }
): React.JSX.Element {
  const { group, language, disabled } = props;
  const rtl = language === "ar";
  const canAct = !disabled && !group.isRemoved;
  const direction = rtl ? "flex-row-reverse " : "flex-row ";
  return (
    <View
      className={
        props.stackActions
          ? "w-full " + direction + "flex-wrap items-center gap-2"
          : direction +
            "shrink-0 flex-nowrap items-center " +
            (props.compact ? "gap-1.5" : "gap-2")
      }
    >
      {!group.isRemoved && group.canConfirm && !group.isConfirmed ? (
        <GroupAction
          compact={props.compact}
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
          compact={props.compact}
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
          compact={props.compact}
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
          compact={props.compact}
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
  const { group, language, viewportWidth, fontScale } = props;
  const rtl = language === "ar";
  const direction: TextStyle["writingDirection"] = rtl ? "rtl" : "ltr";
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);

  // The panel uses 20 dp page gutters and 16 dp internal gutters (R3-05).
  // This fallback applies only before onLayout supplies this card's real width.
  const available = measuredWidth ?? Math.max(0, viewportWidth - 2 * (20 + 16));
  const primaryLabel = group.isRemoved
    ? group.canUndo
      ? reviewCopy("account_review_group_undo", language)
      : null
    : group.canConfirm && !group.isConfirmed
      ? reviewCopy("account_review_group_confirm", language)
      : group.isConfirmed && group.canEdit
        ? reviewCopy("account_review_group_change", language)
        : null;
  const hasActionIcon =
    primaryLabel !== null && (!group.isConfirmed || group.isRemoved);
  const hasMenu = !group.isRemoved;

  // Preserve readable identity beside nonshrinking action hit targets. Compact
  // tokens are tried before reflow; scaled labels may still require stacking.
  const requiredWidth = (compact: boolean): number => {
    const labelWidth = primaryLabel
      ? Math.ceil(primaryLabel.length * (compact ? 7 : 8) * fontScale) +
        (hasActionIcon ? (compact ? 20 : 28) : 0) +
        (compact ? 16 : 24)
      : 0;
    return (
      (compact ? 32 + 8 + 64 : 40 + 12 + 76) * fontScale +
      8 +
      labelWidth +
      (hasMenu ? 44 : 0) +
      (labelWidth > 0 && hasMenu ? (compact ? 6 : 8) : 0)
    );
  };
  const compact = fontScale > 1.35 || available < requiredWidth(false);
  const stackActions = available < requiredWidth(compact);
  return (
    <View
      testID={"account-review-group-card-" + group.groupId}
      className="w-full min-h-[68px] gap-2 border-b border-border py-3 dark:border-border-dark"
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        setMeasuredWidth((previous) => (previous === next ? previous : next));
      }}
    >
      <View
        className={
          stackActions
            ? "items-stretch gap-2"
            : rtl
              ? "flex-row-reverse items-start gap-2"
              : "flex-row items-start gap-2"
        }
      >
        <GroupIdentity
          group={group}
          language={language}
          compact={compact}
          stacked={stackActions}
        />
        <GroupControls
          {...props}
          compact={compact}
          stackActions={stackActions}
        />
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
