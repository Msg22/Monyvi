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
import type { InstitutionLogo } from "@/constants/egyptian-institution-assets";
import { InstitutionLogoMark } from "@/components/institutions/InstitutionLogoMark";
import { Skeleton } from "@/components/ui/Skeleton";
import type { MatchReason } from "@/services/sms-account-matcher";
import { isSameDay } from "@/utils/dateHelpers";
import { useLocale } from "@/context/LocaleContext";
import { formatCurrency, type ReviewableTransaction } from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import React, { memo, useCallback, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import type { TransactionReviewMeta } from "@/contracts/transaction-review";
import {
  type BadgeColor,
  getPrimaryTransactionBadge,
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
  readonly institutionLogo?: InstitutionLogo | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BADGE_BG_COLORS: Record<BadgeColor, string> = {
  amber:
    "border border-gold-100 bg-gold-50 dark:border-gold-600/50 dark:bg-gold-600/20",
  red: "bg-red-100 dark:bg-red-500/20",
  emerald: "bg-nileGreen-100 dark:bg-emerald-500/20",
  blue: "bg-blue-100 dark:bg-blue-500/20",
};

const BADGE_TEXT_COLORS: Record<BadgeColor, string> = {
  amber: "text-gold-800 dark:text-gold-400",
  red: "text-red-600 dark:text-red-400",
  emerald: "text-nileGreen-700 dark:text-emerald-400",
  blue: "text-blue-600 dark:text-blue-400",
};

function TransactionBadge({
  data,
  label,
}: {
  readonly data: TransactionBadgeData;
  readonly label: string;
}): React.JSX.Element {
  return (
    <View
      className={`${BADGE_BG_COLORS[data.color]} max-w-32 rounded-md px-2 py-1`}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        className={`text-xs font-semibold ${BADGE_TEXT_COLORS[data.color]}`}
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReviewTransactionItemSkeleton(): React.JSX.Element {
  return (
    <View
      testID="transaction-review-row-skeleton"
      className="h-20 flex-row items-center border-b border-border bg-background px-4 dark:border-border-dark dark:bg-background-dark"
    >
      <View className="me-2">
        <Skeleton width={24} height={24} borderRadius={6} />
      </View>
      <View className="me-2">
        <Skeleton width={44} height={44} borderRadius={12} />
      </View>
      <View className="flex-1">
        <Skeleton width="55%" height={16} borderRadius={4} />
        <View className="mt-1.5">
          <Skeleton width="42%" height={10} borderRadius={4} />
        </View>
        <View className="mt-1.5 flex-row gap-1.5">
          <Skeleton width={58} height={18} borderRadius={5} />
          <Skeleton width={88} height={18} borderRadius={5} />
        </View>
      </View>
      <View className="ms-2 items-end">
        <Skeleton width={76} height={16} borderRadius={4} />
        <View className="mt-2">
          <Skeleton width={72} height={20} borderRadius={5} />
        </View>
      </View>
    </View>
  );
}

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
  institutionLogo = null,
}: TransactionItemProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const { language } = useLocale();
  const { t } = useTranslation("transactions");
  const isExpense = transaction.type === "EXPENSE";
  const isVoice = transaction.source === "VOICE";
  const hasExpandableContent = !isVoice && !!expandedContent;

  const primaryBadge = getPrimaryTransactionBadge(
    hasMissingInfo,
    reviewMeta,
    isSelected
  );

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
      className="overflow-hidden border-b border-border bg-background dark:border-border-dark dark:bg-background-dark"
    >
      <TouchableOpacity
        onPress={handlePress}
        className="flex-row items-center px-4 py-2"
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
          className="me-2"
          activeOpacity={0.7}
          accessible={false}
          importantForAccessibility="no"
        >
          <View
            className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
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

        <InstitutionLogoMark
          logo={institutionLogo}
          size="compact"
          testID="transaction-review-provider-logo"
          accessibilityLabel={`${transaction.originLabel} logo`}
          containerClassName="me-2"
          defaultSurfaceClassName="border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
          fallback={
            <Ionicons
              name={
                transaction.source === "VOICE" ? "mic-outline" : "card-outline"
              }
              size={22}
              color={palette.slate[400]}
            />
          }
        />

        {/* Content */}
        <View className="flex-1">
          <View className="flex-row items-start gap-2">
            <View className="min-w-0 flex-1">
              <Text
                className="text-base font-bold text-slate-900 dark:text-white"
                numberOfLines={1}
              >
                {isVoice && "note" in transaction
                  ? (transaction as { note: string }).note ||
                    transaction.counterparty ||
                    transaction.originLabel
                  : transaction.originLabel}
              </Text>

              <Text
                className="mt-0.5 text-xs text-text-secondary dark:text-text-secondary-dark"
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

            <View className="max-w-32 items-end">
              <Text
                testID="transaction-review-amount"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                className={`text-base font-semibold ${
                  isExpense
                    ? "text-red-600 dark:text-red-400"
                    : "text-nileGreen-600 dark:text-nileGreen-400"
                }`}
              >
                {isExpense ? "-" : "+"}
                {formatCurrency({
                  amount: transaction.amount,
                  currency: transaction.currency,
                })}
              </Text>
              {primaryBadge && (
                <View className="mt-1.5 items-end">
                  <TransactionBadge
                    data={primaryBadge}
                    label={t(primaryBadge.labelKey)}
                  />
                </View>
              )}
            </View>
          </View>

          <View className="mt-1.5 flex-row items-center gap-1.5 overflow-hidden">
            <View className="max-w-24 shrink-0 rounded-md border border-border bg-surface px-2 py-0.5 dark:border-border-dark dark:bg-surface-dark">
              <Text
                numberOfLines={1}
                className="text-xs text-text-secondary dark:text-text-secondary-dark"
              >
                {transaction.categoryDisplayName}
              </Text>
            </View>

            {accountName && (
              <View
                testID="transaction-account-match"
                className="min-w-0 shrink rounded-md border border-border bg-surface px-2 py-0.5 dark:border-border-dark dark:bg-surface-dark"
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  className="text-xs text-text-secondary dark:text-text-secondary-dark"
                >
                  {accountName}
                </Text>
              </View>
            )}

            {hasExpandableContent && (
              <TouchableOpacity
                onPress={handleToggleExpand}
                hitSlop={14}
                className="h-6 w-6 items-center justify-center"
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
        </View>
      </TouchableOpacity>

      {/* Expanded: source-specific content */}
      {isExpanded && hasExpandableContent && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          className="px-5 pb-3 pt-0"
        >
          {expandedContent}
        </Animated.View>
      )}
    </View>
  );
}

/** Memoized to avoid re-rendering all 150+ items on every parent state change. */
export const TransactionItem = memo(TransactionItemInner);
