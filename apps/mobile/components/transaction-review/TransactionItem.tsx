/**
 * TransactionItem Component
 *
 * A single row in the transaction review list. Displays:
 * - Selection checkbox
 * - Colour-coded amount (green for income, red for expense)
 * - Sender name and counterparty
 * - Detected category with edit icon
 * - Tap-to-expand for original SMS body
 *
 * Architecture & Design Rationale:
 * - Pattern: Presentational Component + React.memo
 * - Why: Memoized to prevent re-renders when sibling items change.
 *   With 150+ items the parent re-renders frequently (modal open/close,
 *   selection toggle) and every un-memoized item re-renders too.
 * - SOLID: SRP — only renders a single transaction row
 *
 * Performance notes:
 * - No layout animations (LinearTransition) — too expensive at 150+ items
 * - Callbacks receive `index` so the parent can use stable useCallback refs
 *   instead of inline arrows that break React.memo
 *
 * @module TransactionItem
 */

import { palette } from "@/constants/colors";
import type { MatchReason } from "@/services/sms-account-matcher";
import { isSameDay } from "@/utils/dateHelpers";
import { useLocale } from "@/context/LocaleContext";
import { formatCurrency, type ReviewableTransaction } from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import React, { memo, useCallback, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import type { TransactionReviewMeta } from "@/services/transaction-review-selection";
import {
  type BadgeColor,
  getTransactionBadges,
  type TransactionBadgeData,
} from "./get-transaction-badges";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TransactionItemProps {
  /** The parsed transaction data */
  readonly transaction: ReviewableTransaction;
  /** The original index in the flat transactions array */
  readonly index: number;
  /** Whether this item is selected for saving */
  readonly isSelected: boolean;
  /** Matched account name (or null if unmatched) */
  readonly accountName: string | null;
  /** How the match was determined (used for fallback display) */
  readonly matchReason?: MatchReason;
  /** Optional expanded content (SMS body, voice note, etc.) */
  readonly expandedContent?: React.ReactNode;
  /** Toggle selection — receives index so parent can use a stable ref */
  readonly onToggleSelect: (index: number) => void;
  /** Called when user taps the item to edit — receives index */
  readonly onPress: (index: number) => void;
  /** Whether this item has missing required info (no account, etc.) */
  readonly hasMissingInfo?: boolean;
  /** Auto-selection status and reasons for rows that need review */
  readonly reviewMeta?: TransactionReviewMeta;
  readonly isSmsWorkspace?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BADGE_BG_COLORS: Record<BadgeColor, string> = {
  amber: "bg-gold-600/20 border border-gold-600/50",
  red: "bg-red-500/20",
  emerald: "bg-emerald-500/20",
  blue: "bg-blue-500/20",
};

const BADGE_TEXT_COLORS: Record<BadgeColor, string> = {
  amber: "text-gold-400",
  red: "text-red-400",
  emerald: "text-emerald-400",
  blue: "text-blue-400",
};

function TransactionBadge({
  data,
  label,
}: {
  readonly data: TransactionBadgeData;
  readonly label: string;
}): React.JSX.Element {
  return (
    <View className={`${BADGE_BG_COLORS[data.color]} rounded-lg px-3 py-1`}>
      <Text
        className={`text-sm font-semibold ${BADGE_TEXT_COLORS[data.color]}`}
      >
        {label}
      </Text>
    </View>
  );
}

function formatReviewDateTime(
  date: Date,
  todayLabel: string,
  yesterdayLabel: string,
  language: "en" | "ar"
): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dayLabel = isSameDay(date, today)
    ? todayLabel
    : isSameDay(date, yesterday)
      ? yesterdayLabel
      : date.toLocaleDateString(
          language === "ar" ? "ar-EG-u-nu-latn" : "en-EG",
          {
            month: "short",
            day: "numeric",
          }
        );
  const timeLabel = date.toLocaleTimeString(
    language === "ar" ? "ar-EG-u-nu-latn" : "en-EG",
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  );
  return `${dayLabel} · ${timeLabel}`;
}

function getReviewIcon(
  reviewMeta: TransactionReviewMeta | undefined,
  isSelected: boolean,
  isSmsWorkspace: boolean
): {
  readonly name: keyof typeof Ionicons.glyphMap;
  readonly circleClassName: string;
  readonly color: string;
} {
  if (reviewMeta?.isAutoSelectable && isSelected) {
    return {
      name: "checkmark",
      circleClassName: "border-nileGreen-500/50 bg-nileGreen-500/15",
      color: palette.nileGreen[400],
    };
  }
  if (reviewMeta?.reasons.includes("account_needed")) {
    return {
      name: "business-outline",
      circleClassName: "border-red-500/50 bg-red-500/10",
      color: palette.red[500],
    };
  }
  if (reviewMeta?.reasons.includes("cash_transfer")) {
    return {
      name: "receipt-outline",
      circleClassName: "border-gold-600/50 bg-gold-600/10",
      color: palette.gold[400],
    };
  }
  if (reviewMeta?.reasons.includes("category_needed")) {
    return {
      name: "pricetag-outline",
      circleClassName: "border-red-500/50 bg-red-500/10",
      color: palette.red[500],
    };
  }
  if (reviewMeta?.reasons.includes("low_confidence")) {
    return {
      name: "help-outline",
      circleClassName: "border-gold-600/50 bg-gold-600/10",
      color: palette.gold[400],
    };
  }
  if (reviewMeta?.reasons.includes("parser_review")) {
    return {
      name: "alert-circle-outline",
      circleClassName: "border-gold-600/50 bg-gold-600/10",
      color: palette.gold[400],
    };
  }
  return {
    name: "card-outline",
    circleClassName: isSmsWorkspace
      ? "border-slate-600 bg-slate-800"
      : "border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800",
    color: palette.slate[400],
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function TransactionItemInner({
  transaction,
  index,
  isSelected,
  accountName,
  expandedContent,
  onToggleSelect,
  onPress,
  hasMissingInfo = false,
  reviewMeta,
  isSmsWorkspace = false,
}: TransactionItemProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const { language } = useLocale();
  const { t } = useTranslation("transactions");
  const isExpense = transaction.type === "EXPENSE";
  const isVoice = transaction.source === "VOICE";
  const hasExpandableContent = !isVoice && !!expandedContent;

  const badges = getTransactionBadges(hasMissingInfo, reviewMeta, isSelected);
  const reviewIcon = getReviewIcon(reviewMeta, isSelected, isSmsWorkspace);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handlePress = useCallback(() => {
    onPress(index);
  }, [onPress, index]);

  const handleToggle = useCallback(() => {
    onToggleSelect(index);
  }, [onToggleSelect, index]);

  const counterpartyText = isVoice
    ? transaction.counterparty
    : transaction.counterparty || "Unknown";

  return (
    <View
      testID="transaction-review-row"
      className={`overflow-hidden border-b ${
        isSmsWorkspace
          ? "border-slate-800 bg-slate-950"
          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
      }`}
    >
      <TouchableOpacity
        onPress={handlePress}
        className="flex-row items-center px-7 py-5"
        activeOpacity={0.7}
        accessible
        accessibilityRole="button"
        accessibilityLanguage={language}
        accessibilityLabel={`${transaction.originLabel}, ${isExpense ? "expense" : "income"} ${formatCurrency({ amount: transaction.amount, currency: transaction.currency })}, ${counterpartyText ?? ""}, ${transaction.categoryDisplayName}${accountName ? `, ${accountName}` : ""}`}
        accessibilityHint={t("tap_to_edit_transaction")}
        accessibilityState={{ selected: isSelected }}
      >
        {/* Checkbox */}
        <TouchableOpacity
          onPress={handleToggle}
          hitSlop={8}
          className="me-5"
          activeOpacity={0.7}
          accessible={false}
          importantForAccessibility="no"
        >
          <View
            className={`w-6 h-6 rounded-lg items-center justify-center border-2 ${
              isSelected
                ? "bg-emerald-500 border-emerald-500"
                : "border-slate-500"
            }`}
          >
            {isSelected && (
              <Ionicons name="checkmark" size={16} color="white" />
            )}
          </View>
        </TouchableOpacity>

        <View
          className={`me-5 h-16 w-16 items-center justify-center rounded-full border ${reviewIcon.circleClassName}`}
        >
          <Ionicons name={reviewIcon.name} size={30} color={reviewIcon.color} />
        </View>

        {/* Content */}
        <View className="flex-1 me-4">
          {/* Top row: origin label + amount */}
          <Text
            className={`text-xl font-extrabold ${
              isSmsWorkspace ? "text-white" : "text-slate-900 dark:text-white"
            }`}
            numberOfLines={1}
          >
            {isVoice && "note" in transaction
              ? (transaction as { note: string }).note ||
                transaction.counterparty ||
                transaction.originLabel
              : transaction.originLabel}
          </Text>

          {/* Middle row: counterparty + date */}
          <View className="mt-1 flex-row items-center justify-between gap-3">
            {counterpartyText ? (
              <Text
                className={`flex-1 text-base ${
                  isSmsWorkspace
                    ? "text-slate-400"
                    : "text-slate-600 dark:text-slate-400"
                }`}
                numberOfLines={1}
              >
                {counterpartyText}
              </Text>
            ) : (
              <View className="flex-1" />
            )}
            <Text
              className={`text-base ${
                isSmsWorkspace
                  ? "text-slate-400"
                  : "text-slate-600 dark:text-slate-400"
              }`}
              numberOfLines={1}
            >
              {formatReviewDateTime(
                transaction.date,
                t("review_date_today"),
                t("review_date_yesterday"),
                language
              )}
            </Text>
          </View>

          {/* Bottom row: category + account chips */}
          <View className="mt-2 flex-row items-center flex-wrap gap-2">
            <View
              className={`rounded-lg border px-3 py-1 ${
                isSmsWorkspace
                  ? "border-slate-700 bg-slate-800/80"
                  : "border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80"
              }`}
            >
              <Text
                className={`text-base ${
                  isSmsWorkspace
                    ? "text-slate-300"
                    : "text-slate-700 dark:text-slate-300"
                }`}
              >
                {transaction.categoryDisplayName}
              </Text>
            </View>

            {accountName && (
              <View
                testID="transaction-account-match"
                className={`rounded-lg border px-3 py-1 ${
                  isSmsWorkspace
                    ? "border-slate-700 bg-slate-800/80"
                    : "border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80"
                }`}
              >
                <Text
                  className={`text-base ${
                    isSmsWorkspace
                      ? "text-slate-300"
                      : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {accountName}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View className="items-end">
          <Text
            testID="transaction-review-amount"
            className={`text-xl font-semibold ${
              isExpense ? "text-red-400" : "text-nileGreen-400"
            }`}
          >
            {isExpense ? "-" : "+"}
            {formatCurrency({
              amount: transaction.amount,
              currency: transaction.currency,
            })}
          </Text>
          <View className="mt-3 items-end gap-2">
            {badges.map((badge, idx) => (
              <TransactionBadge
                key={`${badge.labelKey}-${idx}`}
                data={badge}
                label={t(badge.labelKey)}
              />
            ))}
          </View>
          {hasExpandableContent && (
            <TouchableOpacity
              onPress={handleToggleExpand}
              hitSlop={14}
              className="mt-2 p-1"
              activeOpacity={0.7}
            >
              <Ionicons
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={18}
                color={palette.slate[500]}
              />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>

      {/* Expanded: source-specific content */}
      {isExpanded && hasExpandableContent && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          className="px-7 pb-5 pt-0"
        >
          {expandedContent}
        </Animated.View>
      )}
    </View>
  );
}

/** Memoized to avoid re-rendering all 150+ items on every parent state change. */
export const TransactionItem = memo(TransactionItemInner);
