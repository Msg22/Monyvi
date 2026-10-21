/**
 * #395 T031 — private B1 presentation primitives. No review/domain reducer.
 * The T072 locale owner will install the same keys in the EN/AR dictionaries.
 * Localized approved fallbacks keep this view-only slice usable until then.
 */
import { Ionicons } from "@expo/vector-icons";
import type {
  AccountReviewRow,
  AccountReviewSession,
  ReviewableTransaction,
} from "@monyvi/logic";
import type { SharedSuggestedGroupView } from "./SharedAccountSuggestions";
import { getCurrencyName } from "@/utils/currency-localization";
import { currencyCode } from "../../../../packages/logic/src/account-review/schema-primitives";
import type { AccountChoiceCandidateView } from "./AccountChoiceSheet";
import type { AccountIdentitySource } from "@/components/institutions/AccountIdentityMark";
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
    account_review_group_new_account: "New account",
    account_review_group_saved_on_save:
      "This account is created when you save selected transactions.",
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
    account_review_group_new_account: "حساب جديد",
    account_review_group_saved_on_save:
      "سيُنشأ هذا الحساب عند حفظ المعاملات المحددة.",
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
export function presentReviewGroup(
  group: AccountReviewSession["groups"][number],
  linkedCount: number,
  busy: boolean,
  canUndo: boolean,
  language: ReviewDisplayLanguage
): SharedSuggestedGroupView {
  const removed = group.status === "removed";
  return {
    groupId: group.groupId,
    displayName: group.name,
    identitySummary: [
      group.providerDisplayName,
      group.institutionId,
      group.cardLast4,
      ...group.senderNames,
    ]
      .filter((part) => part !== null && part.length > 0)
      .join(" · "),
    currencyLabel: group.currency,
    accountType: group.type,
    institutionId: group.institutionId,
    providerDisplayName: group.providerDisplayName,
    typeIconName:
      group.type === "CASH"
        ? "cash-outline"
        : group.type === "DIGITAL_WALLET"
          ? "wallet-outline"
          : group.type === "BANK"
            ? "business-outline"
            : "help-circle-outline",
    linkedCount,
    statusLabel: removed
      ? t("account_review_group_removed", {
          ns: "transactions",
          lng: language,
        })
      : group.status === "confirmed"
        ? reviewCopy("account_review_group_confirmed", language)
        : reviewCopy("account_review_group_new_account", language),
    disclosureText: removed
      ? ""
      : group.status === "confirmed"
        ? reviewCopy("account_review_group_saved_on_save", language)
        : presentReviewSharedDisclosure(group.name, linkedCount, language),
    isConfirmed: group.status === "confirmed",
    isRemoved: removed,
    isBusy: busy,
    canConfirm: !removed && group.status === "pending" && group.type !== null,
    canEdit: !removed,
    canReplace: !removed && linkedCount > 0,
    canRemove: !removed,
    canUndo,
  };
}

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
export type ReviewIssueKey =
  | "account_review_issue_amount"
  | "account_review_issue_category"
  | "account_review_issue_currency"
  | "account_review_issue_account"
  | "account_review_group_needs_review";

export function presentReviewRowIssueKeys(
  row: AccountReviewRow
): readonly ReviewIssueKey[] {
  const reasons = new Set(row.reviewReasons);
  const result: ReviewIssueKey[] = [];
  if (reasons.has("ambiguous_amount") || reasons.has("low_confidence"))
    result.push("account_review_issue_amount");
  if (reasons.has("category_needed"))
    result.push("account_review_issue_category");
  if (
    row.currency.state === "unconfirmed" ||
    reasons.has("currency_confirmation_needed")
  )
    result.push("account_review_issue_currency");
  const accountProblemReasons: ReadonlyArray<
    AccountReviewRow["reviewReasons"][number]
  > = [
    "account_needed",
    "account_match_ambiguous",
    "account_identity_uncertain",
    "account_unavailable",
    "account_group_removed",
    "cash_transfer_review",
    "account_evidence_invalid",
    "account_group_unconfirmed",
  ];
  const missingDestination =
    row.source === "SMS" &&
    row.transaction.isAtmWithdrawal === true &&
    (row.toAssignment === null ||
      row.toAssignment.state === "unresolved" ||
      (row.toAssignment.state === "suggested" &&
        row.toAssignment.confirmation === "pending"));
  const actualAccountProblem =
    row.assignment.state !== "suggested" &&
    accountProblemReasons.some(
      (reason) =>
        reasons.has(reason) &&
        (reason !== "cash_transfer_review" || missingDestination)
    );
  // Currency must be confirmed before account eligibility has meaning.
  // Preserve overlapping actual account issues once that prerequisite is met.
  if (
    row.currency.state !== "unconfirmed" &&
    (row.assignment.state === "unresolved" ||
      missingDestination ||
      actualAccountProblem)
  )
    result.push("account_review_issue_account");
  return result;
}

/** R2 presentation combines account and currency blockers, not domain reasons. */
function hasAccountResolutionIssue(row: AccountReviewRow): boolean {
  const issues = presentReviewRowIssueKeys(row);
  return (
    issues.includes("account_review_issue_account") ||
    issues.includes("account_review_issue_currency")
  );
}

export function presentReviewIssueKeys(
  rows: readonly AccountReviewRow[],
  distinctNeedsReviewCount: number
): readonly ReviewIssueKey[] {
  const found = new Set(rows.flatMap(presentReviewRowIssueKeys));
  const ordered: ReviewIssueKey[] = [
    "account_review_issue_amount",
    "account_review_issue_category",
    "account_review_issue_account",
  ];
  // A currency-only row is still account-needed in the R2 summary/recovery;
  // the original currency reason remains on the canonical row for guarded Save.
  const issues = ordered.filter((key) =>
    key === "account_review_issue_account"
      ? found.has(key) || found.has("account_review_issue_currency")
      : found.has(key)
  );
  // Pending shared groups have their own Confirm action, not a duplicate
  // row-level Choose account issue or generic recovery.
  if (
    issues.length === 0 &&
    distinctNeedsReviewCount > 0 &&
    rows.some(
      (row) =>
        row.assignment.state !== "suggested" && row.reviewReasons.length > 0
    )
  )
    issues.push("account_review_group_needs_review");
  return issues;
}

export function presentIssueRecoveryTarget(
  rows: readonly AccountReviewRow[],
  key: ReviewIssueKey
): AccountReviewRow | null {
  return (
    rows.find((row) =>
      key === "account_review_group_needs_review"
        ? row.assignment.state !== "suggested" && row.reviewReasons.length > 0
        : key === "account_review_issue_account"
          ? hasAccountResolutionIssue(row)
          : presentReviewRowIssueKeys(row).includes(key)
    ) ?? null
  );
}

/** A modal may only edit its original owned review and entity revision. */
export interface ReviewChoiceStamp {
  readonly ownerId: string;
  readonly sessionId: string;
  readonly reviewRevision: string;
  readonly operationGeneration: string;
  readonly entityRevision: string;
}
export function reviewChoiceStamp(
  session: AccountReviewSession,
  entityRevision: string
): ReviewChoiceStamp {
  return {
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    reviewRevision: session.revision,
    operationGeneration: session.operationGeneration,
    entityRevision,
  };
}
export function isReviewChoiceFresh(
  choice: ReviewChoiceStamp,
  session: AccountReviewSession,
  currentEntityRevision: string | null
): boolean {
  return (
    currentEntityRevision !== null &&
    choice.ownerId === session.ownerId &&
    choice.sessionId === session.sessionId &&
    choice.reviewRevision === session.revision &&
    choice.operationGeneration === session.operationGeneration &&
    choice.entityRevision === currentEntityRevision
  );
}

/** Global issue rows use the canonical row set, not the currently filtered list.
 * One row can have multiple blockers but counts once in the unified account issue.
 */
export interface ReviewIssueEntry {
  readonly key: ReviewIssueKey;
  readonly label: string;
  readonly count: number;
}
export function presentReviewIssues(
  rows: readonly AccountReviewRow[],
  distinctNeedsReviewCount: number,
  language: ReviewDisplayLanguage
): readonly ReviewIssueEntry[] {
  return presentReviewIssueKeys(rows, distinctNeedsReviewCount).map((key) => {
    const affectedRows = rows.filter((row) =>
      key === "account_review_group_needs_review"
        ? row.assignment.state !== "suggested" && row.reviewReasons.length > 0
        : key === "account_review_issue_account"
          ? hasAccountResolutionIssue(row)
          : presentReviewRowIssueKeys(row).includes(key)
    );
    // Only the unified account/currency union has distinct-by-ID semantics.
    // Amount, category and generic pending counts retain their old behavior.
    const count =
      key === "account_review_issue_account"
        ? new Set(affectedRows.map((row) => row.rowId)).size
        : affectedRows.length;
    return {
      key,
      label:
        key === "account_review_group_needs_review"
          ? reviewCopy(key, language)
          : t(
              key === "account_review_issue_account"
                ? "account_review_issue_account_needed"
                : key,
              {
                ns: "transactions",
                lng: language,
                defaultValue:
                  key === "account_review_issue_account"
                    ? language === "ar"
                      ? "مطلوب اختيار حساب"
                      : "Account needed"
                    : key,
              }
            ),
      count: count === 0 ? distinctNeedsReviewCount : count,
    };
  });
}

/** Intersect guarded per-row candidates for an explicitly disclosed group replacement.
 * No inferred accounts, new payload, or expanded domain resolver.
 */
export function intersectGuardedGroupAccountChoices<
  T extends { readonly id: string; readonly type: string },
>(
  linkedRowIds: readonly string[],
  groupType: string | null,
  getCandidates: (
    rowId: string,
    role: "source" | "destination"
  ) => readonly T[],
  role: "source" | "destination" = "source"
): readonly T[] {
  const first = linkedRowIds[0];
  if (!first) return [];
  return getCandidates(first, role).filter(
    (candidate) =>
      candidate.type === groupType &&
      linkedRowIds.every((rowId) =>
        getCandidates(rowId, role).some((other) => other.id === candidate.id)
      )
  );
}

/** Transaction identity and the real merchant, never a generic "Currency". */
export function presentReviewTransactionContext(
  transaction: ReviewableTransaction,
  language: ReviewDisplayLanguage
): string {
  const note =
    "note" in transaction && typeof transaction.note === "string"
      ? transaction.note.trim()
      : "";
  const subject =
    note || transaction.categoryDisplayName?.trim() || transaction.originLabel;
  const merchant = (transaction.merchant || transaction.counterparty)?.trim();
  const identity =
    merchant &&
    !subject.toLocaleLowerCase().includes(merchant.toLocaleLowerCase())
      ? language === "ar"
        ? subject + " لدى " + merchant
        : subject + " at " + merchant
      : subject || merchant || transaction.originLabel;
  return language === "ar" ? "لـ" + identity : "For " + identity;
}

/** An approved shared effect, with the live name/count rather than a fixture. */
export function presentReviewSharedDisclosure(
  name: string,
  count: number,
  language: ReviewDisplayLanguage
): string {
  return t("account_review_group_effect", {
    ns: "transactions",
    lng: language,
    count,
    accountName: displayIdentity(name, language),
    defaultValue:
      language === "ar"
        ? "اختيار معاملة من {{accountName}} يؤكد الحساب للمعاملات المرتبطة ({{count}})."
        : "Selecting a {{accountName}} transaction confirms this account for all {{count}} linked transactions.",
  });
}

export function presentReviewLinkedCount(
  count: number,
  language: ReviewDisplayLanguage
): string {
  return t("account_review_group_linked_count", {
    ns: "transactions",
    lng: language,
    count,
    defaultValue:
      language === "ar"
        ? "{{count}} معاملات مرتبطة"
        : "{{count}} linked transactions",
  });
}

export function presentReviewReplaceScope(
  name: string,
  count: number,
  language: ReviewDisplayLanguage
): string {
  return t("account_review_group_replace_scope", {
    ns: "transactions",
    lng: language,
    count,
    accountName: displayIdentity(name, language),
    defaultValue:
      language === "ar"
        ? "استبدال {{accountName}} لجميع المعاملات المرتبطة ({{count}})."
        : "Replace {{accountName}} for all {{count}} linked transactions.",
  });
}

/** A conflict candidate is always shown with its friendly name and ISO code. */
export function presentReviewCurrencyLabel(
  candidate: string,
  language: ReviewDisplayLanguage
): string {
  const checked = currencyCode.safeParse(candidate);
  return checked.success ? getCurrencyName(checked.data, language) : candidate;
}

/** UI-only presentation of already-scoped canonical account and currency choices. */
export interface CanonicalRowDetails {
  readonly accountName: string | null;
  readonly accountType: AccountReviewSession["groups"][number]["type"];
  readonly accountIdentity: AccountIdentitySource;
  readonly accountActionLabel: string | null;
  readonly accountStatusLabel: string | null;
  readonly accountStatusTone?: "pending" | "confirmed" | "removed";
  readonly currencyActionLabel: string | null;
  readonly currencyContextLabel: string;
  readonly isSmsAtm: boolean;
  readonly destinationName: string | null;
}
export function presentCanonicalRowDetails(
  row: AccountReviewRow,
  group: AccountReviewSession["groups"][number] | null,
  accounts: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly type: AccountReviewSession["groups"][number]["type"];
    readonly institutionId?: string | null;
    readonly providerDisplayName?: string | null;
  }>,
  language: ReviewDisplayLanguage,
  destinationGroup: AccountReviewSession["groups"][number] | null = null
): CanonicalRowDetails {
  const assigned =
    row.assignment.state === "existing"
      ? (accounts.find((a) => a.id === row.assignment.accountId) ?? null)
      : null;
  const isSmsAtm =
    row.source === "SMS" && row.transaction.isAtmWithdrawal === true;
  const currencyUnknown = row.currency.state === "unconfirmed";
  const accountActionLabel = isSmsAtm
    ? t("from_account", { ns: "transactions", lng: language })
    : row.assignment.state === "unresolved"
      ? t("account_review_issue_account", {
          ns: "transactions",
          lng: language,
        })
      : reviewCopy("account_review_group_change", language);
  const status =
    assigned?.id &&
    row.assignment.state === "existing" &&
    row.assignment.origin === "default"
      ? t("default_account", {
          ns: "accounts",
          lng: language,
          defaultValue:
            language === "ar" ? "الحساب الافتراضي" : "Default account",
        })
      : group?.status === "confirmed"
        ? reviewCopy("account_review_group_confirmed", language)
        : group?.status === "pending"
          ? reviewCopy("account_review_group_new_account", language)
          : group?.status === "removed"
            ? t("account_review_group_removed", {
                ns: "transactions",
                lng: language,
              })
            : null;
  const toAssignment = row.toAssignment;
  const destination =
    toAssignment?.state === "existing"
      ? (accounts.find((a) => a.id === toAssignment.accountId) ?? null)
      : null;
  return {
    accountName: assigned?.name ?? group?.name ?? null,
    accountType: assigned?.type ?? group?.type ?? null,
    accountIdentity: {
      type: assigned?.type ?? group?.type ?? null,
      institutionId: assigned?.institutionId ?? group?.institutionId ?? null,
      providerDisplayName:
        assigned?.providerDisplayName ?? group?.providerDisplayName ?? null,
    },
    accountActionLabel,
    accountStatusLabel: status,
    accountStatusTone:
      group?.status === "pending"
        ? "pending"
        : group?.status === "confirmed"
          ? "confirmed"
          : group?.status === "removed"
            ? "removed"
            : undefined,
    currencyActionLabel: currencyUnknown
      ? t("account_review_issue_currency", {
          ns: "transactions",
          lng: language,
        })
      : null,
    currencyContextLabel: presentReviewTransactionContext(
      row.transaction,
      language
    ),
    isSmsAtm,
    destinationName:
      destination?.name ??
      (toAssignment?.state === "suggested" &&
      destinationGroup?.groupId === toAssignment.groupId &&
      destinationGroup.status !== "removed"
        ? destinationGroup.name +
          " · " +
          reviewCopy("account_review_group_new_account", language)
        : null),
  };
}

/** Present only the eligible accounts supplied by the guarded facade. */
export function presentReviewAccountChoices(
  candidates: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly providerDisplayName: string | null;
    readonly institutionId?: string | null;
    readonly cardLast4: string | null;
    readonly type?: string;
    readonly currency: string;
    readonly isDefault?: boolean;
  }>,
  language: ReviewDisplayLanguage = "en"
): readonly AccountChoiceCandidateView[] {
  return candidates.map((account) => {
    const typeLabel = account.type
      ? t("type_" + account.type.toLowerCase(), {
          ns: "accounts",
          lng: language,
          defaultValue: account.type,
        })
      : null;
    const defaultBadgeLabel = account.isDefault
      ? t("default_account_short_badge", { ns: "accounts", lng: language })
      : undefined;
    const identityDetails = [
      typeLabel,
      account.providerDisplayName ?? account.institutionId ?? null,
      account.cardLast4 ? "•••• " + account.cardLast4 : null,
    ]
      .filter((text) => text !== null && text.length > 0)
      .join(" · ");
    return {
      id: account.id,
      displayName: account.name,
      identityDetails,
      currencyCode: account.currency,
      accountType:
        account.type === "BANK" ||
        account.type === "DIGITAL_WALLET" ||
        account.type === "CASH"
          ? account.type
          : null,
      institutionId: account.institutionId ?? null,
      providerDisplayName: account.providerDisplayName,
      defaultBadgeLabel,
      iconName:
        account.type === "CASH"
          ? "cash-outline"
          : account.type === "DIGITAL_WALLET"
            ? "wallet-outline"
            : account.type === "BANK"
              ? "business-outline"
              : "help-circle-outline",
      accessibilityLabel: [
        account.name,
        defaultBadgeLabel ?? "",
        identityDetails,
        account.currency,
      ]
        .filter((text) => text.length > 0)
        .join(", "),
      isEligible: true,
    };
  });
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
