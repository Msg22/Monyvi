/**
 * #395 T031 — private B1 presentation primitives. No review/domain reducer.
 * The T072 locale owner will install the same keys in the EN/AR dictionaries.
 * Localized approved fallbacks keep this view-only slice usable until then.
 */
import { Ionicons } from "@expo/vector-icons";
import type { AccountReviewRow } from "@monyvi/logic";
import type { AccountChoiceCandidateView } from "./AccountChoiceSheet";
import { t } from "i18next";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useColorScheme } from "nativewind";
import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";

export type ReviewDisplayLanguage = "en" | "ar";
const approvedCopy = {
  en: {
    account_review_details_title: "Review details",
    account_review_group_confirm: "Confirm",
    account_review_group_confirmed: "Confirmed",
    account_review_group_view_all: "View all",
    account_review_group_edit: "Edit",
    account_review_group_replace: "Use existing account",
    account_review_group_remove: "Remove",
    account_review_group_undo: "Undo",
    account_review_group_edit_submit: "Confirm account",
    account_review_group_edit_cancel: "Cancel",
    account_review_group_change: "Change",
    account_review_group_locked_currency: "Currency",
    account_review_group_edit_title: "Edit suggested account",
    account_review_group_name: "Account name",
    account_review_group_type: "Account type",
    account_review_group_linked: "Linked transactions",
    account_review_group_close: "Close",
    account_review_group_actions_title: "Account actions",
    account_review_group_editor_close_a11y: "Close suggested account editor",
    account_review_group_needs_review: "need review",
    account_review_group_selected: "selected",
  },
  ar: {
    account_review_details_title: "تفاصيل للمراجعة",
    account_review_group_confirm: "تأكيد",
    account_review_group_confirmed: "تم التأكيد",
    account_review_group_view_all: "عرض الكل",
    account_review_group_edit: "تعديل",
    account_review_group_replace: "استخدام حساب موجود",
    account_review_group_remove: "إزالة",
    account_review_group_undo: "تراجع",
    account_review_group_edit_submit: "تأكيد الحساب",
    account_review_group_edit_cancel: "إلغاء",
    account_review_group_change: "تغيير",
    account_review_group_locked_currency: "العملة",
    account_review_group_edit_title: "تعديل الحساب المقترح",
    account_review_group_name: "اسم الحساب",
    account_review_group_type: "نوع الحساب",
    account_review_group_linked: "المعاملات المرتبطة",
    account_review_group_close: "إغلاق",
    account_review_group_actions_title: "إجراءات الحساب",
    account_review_group_editor_close_a11y: "إغلاق تعديل الحساب المقترح",
    account_review_group_needs_review: "تحتاج إلى مراجعة",
    account_review_group_selected: "محددة",
  },
} as const;

export type ReviewCopyKey = keyof typeof approvedCopy.en;
export function reviewCopy(
  key: ReviewCopyKey,
  language: ReviewDisplayLanguage
): string {
  return t(key, {
    ns: "transactions",
    lng: language,
    defaultValue: approvedCopy[language][key],
  });
}

/** Show only the actual existing default from the scoped account choices. */
export function presentReviewDefaultAccountName(
  rows: readonly AccountReviewRow[],
  accounts: ReadonlyArray<{ readonly id: string; readonly name: string }>
): string | null {
  const assigned = rows.find(
    (row) =>
      row.assignment.state === "existing" && row.assignment.origin === "default"
  );
  if (!assigned || assigned.assignment.state !== "existing") return null;
  return (
    accounts.find((account) => account.id === assigned.assignment.accountId)
      ?.name ?? null
  );
}

/** Keep compact blocker keys distinct, preserving the caller's locale function. */
type ReviewIssueKey =
  | "account_review_issue_amount"
  | "account_review_issue_category"
  | "account_review_issue_currency"
  | "account_review_issue_account"
  | "account_review_group_needs_review";

export function presentReviewIssueKeys(
  visibleRows: readonly AccountReviewRow[],
  distinctNeedsReviewCount: number
): readonly ReviewIssueKey[] {
  const reasons = new Set(visibleRows.flatMap((row) => row.reviewReasons));
  const issueKeys: ReviewIssueKey[] = [];
  if (reasons.has("ambiguous_amount") || reasons.has("low_confidence"))
    issueKeys.push("account_review_issue_amount");
  if (reasons.has("category_needed"))
    issueKeys.push("account_review_issue_category");
  if (
    visibleRows.some((row) => row.currency.state === "unconfirmed") ||
    reasons.has("currency_confirmation_needed")
  )
    issueKeys.push("account_review_issue_currency");
  if (
    visibleRows.some(
      (row) =>
        row.assignment.state === "unresolved" ||
        (row.source === "SMS" &&
          row.transaction.isAtmWithdrawal === true &&
          row.toAssignment?.state !== "existing")
    ) ||
    [...reasons].some((reason) =>
      [
        "account_needed",
        "account_match_ambiguous",
        "account_identity_uncertain",
        "account_unavailable",
        "account_group_removed",
        "account_group_unconfirmed",
        "cash_transfer_review",
        "account_evidence_invalid",
      ].includes(reason)
    )
  )
    issueKeys.push("account_review_issue_account");
  if (issueKeys.length === 0 && distinctNeedsReviewCount > 0)
    issueKeys.push("account_review_group_needs_review");
  return issueKeys;
}

/** Present only the eligible accounts supplied by the guarded facade. */
export function presentReviewAccountChoices(
  candidates: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly providerDisplayName: string | null;
    readonly cardLast4: string | null;
    readonly currency: string;
  }>
): readonly AccountChoiceCandidateView[] {
  return candidates.map((account) => ({
    id: account.id,
    displayName: account.name,
    identityDetails: [
      account.providerDisplayName,
      account.cardLast4,
      account.currency,
    ]
      .filter((text) => text !== null && text.length > 0)
      .join(" · "),
    accessibilityLabel: account.name + " " + account.currency,
    isEligible: true,
  }));
}

/** Preserve original alternatives and show a separately validated picker choice. */
export function presentReviewCurrencyOptions(
  currency: AccountReviewRow["currency"] | null | undefined,
  selected: AccountReviewRow["transaction"]["currency"] | null
): readonly string[] {
  const originals =
    currency?.state === "unconfirmed"
      ? currency.candidateCodes
      : currency?.state === "known"
        ? [currency.code]
        : [];
  return selected !== null && !originals.includes(selected)
    ? [...originals, selected]
    : originals;
}

/** Isolate foreign-script codes without ever mutating an account identity. */
export function displayIdentity(
  value: string,
  language: ReviewDisplayLanguage
): string {
  const needsIsolation = language === "ar" && /[A-Za-z0-9]/u.test(value);
  return needsIsolation
    ? String.fromCodePoint(0x2068) + value + String.fromCodePoint(0x2069)
    : value;
}

export interface ReviewActionButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
  readonly accessibilityLabel?: string;
  readonly disabled?: boolean;
  readonly tone?: "primary" | "outline" | "danger" | "quiet";
  readonly iconName?:
    | "checkmark-circle-outline"
    | "pencil-outline"
    | "swap-horizontal-outline"
    | "trash-outline"
    | "arrow-undo-outline";
}

interface ActionAppearance {
  readonly iconColor: string;
  readonly surface: string;
  readonly labelClass: string;
}
function actionAppearance(
  tone: ReviewActionButtonProps["tone"],
  disabled: boolean,
  isDark: boolean
): ActionAppearance {
  const active = tone ?? "outline";
  return {
    iconColor:
      active === "danger"
        ? isDark
          ? palette.red[500]
          : palette.red[600]
        : active === "primary"
          ? palette.slate[25]
          : isDark
            ? palette.nileGreen[400]
            : palette.nileGreen[700],
    surface: disabled
      ? "bg-slate-200 dark:bg-slate-700"
      : active === "primary"
        ? "bg-nileGreen-600"
        : active === "danger"
          ? "border border-red-500"
          : active === "quiet"
            ? "bg-transparent"
            : "border border-border dark:border-border-dark",
    labelClass: disabled
      ? "text-text-muted dark:text-text-muted-dark"
      : active === "primary"
        ? "text-white"
        : active === "danger"
          ? "text-red-600 dark:text-red-500"
          : "text-nileGreen-700 dark:text-nileGreen-400",
  };
}
export function ReviewActionButton(
  props: ReviewActionButtonProps
): React.JSX.Element {
  const disabled = props.disabled === true;
  const { colorScheme } = useColorScheme();
  const rtl = useLocale().language === "ar";
  const appearance = actionAppearance(
    props.tone,
    disabled,
    colorScheme === "dark"
  );
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
        "min-h-12 items-center justify-center gap-2 rounded-lg px-3 " +
        (rtl ? "flex-row-reverse " : "flex-row ") +
        appearance.surface
      }
    >
      {props.iconName ? (
        <Ionicons
          name={props.iconName}
          size={20}
          color={appearance.iconColor}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      <Text
        className={"text-base font-semibold leading-6 " + appearance.labelClass}
      >
        {props.label}
      </Text>
    </TouchableOpacity>
  );
}

export function ReviewSheetHandle(): React.JSX.Element {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="mt-3 mb-2 h-1 w-10 self-center rounded-full bg-slate-300 dark:bg-slate-600"
    />
  );
}

export function ReviewPointerBackdrop({
  onPress,
}: {
  readonly onPress: () => void;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onPress={onPress}
      activeOpacity={1}
      className="absolute inset-0"
    >
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        className="flex-1 bg-black/60"
      />
    </TouchableOpacity>
  );
}
