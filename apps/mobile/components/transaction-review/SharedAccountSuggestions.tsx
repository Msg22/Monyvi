/**
 * #395 compact inline account-review presentation. The canonical session owns
 * status, selection and all mutations; only disclosure/menu state is local.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useLocale } from "@/context/LocaleContext";
import { useTranslation } from "react-i18next";
import { palette } from "@/constants/colors";
import { useColorScheme } from "nativewind";
import { CompactReviewSummary } from "./CompactReviewSummary";
import { DefaultAccountInfo } from "./DefaultAccountInfo";
import { SharedAccountGroupRow } from "./SharedAccountGroupRow";
import type {
  ReviewIssueEntry,
  ReviewIssueKey,
} from "./shared-account-presentation";

export interface SharedSuggestedGroupView {
  readonly groupId: string;
  readonly displayName: string;
  readonly identitySummary: string;
  readonly currencyLabel: string;
  readonly typeIconName: string;
  readonly linkedCount: number;
  readonly statusLabel: string;
  readonly disclosureText: string;
  readonly isConfirmed: boolean;
  readonly isRemoved: boolean;
  readonly isBusy: boolean;
  readonly canConfirm: boolean;
  readonly canEdit: boolean;
  readonly canReplace: boolean;
  readonly canRemove: boolean;
  readonly canUndo: boolean;
}
export interface SharedReviewSummaryView {
  readonly totalCount: number;
  readonly distinctNeedsReviewCount: number;
  readonly pendingGroupCount: number;
  readonly confirmedGroupCount: number;
  readonly defaultAssignmentCount: number;
  readonly selectedCount: number;
  readonly issueLabels: readonly string[];
  readonly issues?: readonly ReviewIssueEntry[];
}
export interface SharedAccountSuggestionsProps {
  readonly groups: readonly SharedSuggestedGroupView[];
  readonly summary: SharedReviewSummaryView;
  /** Authoritative distinct source-row union from the same temporary filter. */
  readonly accountNeededCount?: number;
  readonly isBusy: boolean;
  readonly onConfirm: (groupId: string) => void;
  readonly onEdit: (groupId: string) => void;
  readonly onReplace: (groupId: string) => void;
  readonly onRemove: (groupId: string) => void;
  readonly onUndo: (groupId: string) => void;
  readonly onDiscardRemoved?: (groupId: string) => void;
  readonly onViewLinked?: (groupId: string) => void;
  readonly revealGroupsKey?: number;
  readonly defaultAccountName?: string | null;
  readonly onDefaultWhyPress?: () => void;
  readonly onIssuePress?: (key: ReviewIssueKey) => void;
}

function InlineReviewIssues({
  issues,
  disabled,
  onIssuePress,
}: {
  readonly issues: readonly ReviewIssueEntry[];
  readonly disabled: boolean;
  readonly onIssuePress?: (key: ReviewIssueKey) => void;
}): React.JSX.Element | null {
  const { language } = useLocale();
  const { t } = useTranslation("transactions");
  if (issues.length === 0) return null;
  return (
    <View testID="account-review-compact-issues" className="gap-1">
      {issues.map((issue) => (
        <View
          key={issue.key}
          className={
            "min-h-11 min-w-0 flex-wrap items-center gap-2 border-t border-border py-2 dark:border-border-dark " +
            (language === "ar" ? "flex-row-reverse" : "flex-row")
          }
        >
          <Ionicons
            name="alert-circle-outline"
            size={18}
            color={palette.gold[600]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text
            className={
              "min-w-0 flex-1 text-sm text-text-primary dark:text-text-primary-dark " +
              (language === "ar" ? "text-right" : "text-left")
            }
          >
            {issue.label}
          </Text>
          {onIssuePress ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={issue.label}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => onIssuePress(issue.key)}
              className="min-h-11 min-w-11 items-center justify-center px-1"
            >
              <Text className="text-sm font-semibold text-nileGreen-700 dark:text-nileGreen-400">
                {t("account_review_issue_review")}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function SharedAccountSuggestions(
  props: SharedAccountSuggestionsProps
): React.JSX.Element {
  const { language } = useLocale();
  const { t } = useTranslation("transactions");
  const { colorScheme } = useColorScheme();
  const [expanded, setExpanded] = useState(false);
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);
  useEffect(() => {
    if (props.revealGroupsKey && props.revealGroupsKey > 0) {
      setExpanded(true);
    }
  }, [props.revealGroupsKey]);
  const accountNeededCount =
    props.accountNeededCount ??
    props.summary.issues?.find(
      (issue) => issue.key === "account_review_issue_account"
    )?.count ??
    props.summary.issues?.find(
      (issue) => issue.key === "account_review_issue_currency"
    )?.count ??
    0;
  const reviewed =
    props.summary.pendingGroupCount === 0 && accountNeededCount === 0;
  // Account/currency-needed rows have their own truthful temporary filter tab.
  // Keep category/amount recovery in details without duplicating that action.
  const issues = (props.summary.issues ?? []).filter(
    (issue) =>
      issue.key !== "account_review_issue_account" &&
      issue.key !== "account_review_issue_currency"
  );
  return (
    <View
      testID="account-review-details-panel"
      className="w-full overflow-hidden rounded-xl border border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
    >
      <CompactReviewSummary
        expanded={expanded}
        pendingCount={props.summary.pendingGroupCount}
        accountNeededCount={accountNeededCount}
        isReviewed={reviewed}
        onToggle={() => {
          setExpanded((current) => !current);
          setMenuGroupId(null);
        }}
      />
      {expanded ? (
        <View className="gap-1 px-3 pb-3">
          {props.groups.map((group, index) => (
            <SharedAccountGroupRow
              key={group.groupId}
              group={group}
              language={language}
              showDivider={index < props.groups.length - 1}
              disabled={props.isBusy || group.isBusy}
              isMenuOpen={menuGroupId === group.groupId}
              onMenu={() =>
                setMenuGroupId((current) =>
                  current === group.groupId ? null : group.groupId
                )
              }
              onConfirm={() => props.onConfirm(group.groupId)}
              onEdit={() => {
                setMenuGroupId(null);
                props.onEdit(group.groupId);
              }}
              onReplace={() => {
                setMenuGroupId(null);
                props.onReplace(group.groupId);
              }}
              onRemove={() => {
                setMenuGroupId(null);
                props.onRemove(group.groupId);
              }}
              onUndo={() => props.onUndo(group.groupId)}
              onDiscard={
                props.onDiscardRemoved
                  ? () => props.onDiscardRemoved?.(group.groupId)
                  : undefined
              }
              onViewLinked={
                props.onViewLinked
                  ? () => props.onViewLinked?.(group.groupId)
                  : undefined
              }
            />
          ))}
          <InlineReviewIssues
            issues={issues}
            disabled={props.isBusy}
            onIssuePress={props.onIssuePress}
          />
          {props.defaultAccountName &&
          props.summary.defaultAssignmentCount > 0 &&
          props.onDefaultWhyPress &&
          (props.groups.length > 0 || issues.length > 0) ? (
            <DefaultAccountInfo
              defaultAccountName={props.defaultAccountName}
              assignmentCount={props.summary.defaultAssignmentCount}
              onWhyPress={props.onDefaultWhyPress}
            />
          ) : null}
          {props.groups.some((group) => !group.isRemoved) ? (
            <View
              testID="account-review-compact-save-explanation"
              className={
                "w-full max-w-[350px] self-center items-center gap-2 py-1 " +
                (language === "ar" ? "flex-row-reverse" : "flex-row")
              }
            >
              <View className="h-6 w-6 shrink-0 items-center justify-center">
                <Ionicons
                  name="information-circle-outline"
                  size={20}
                  color={
                    colorScheme === "dark"
                      ? palette.slate[400]
                      : palette.slate[500]
                  }
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              </View>
              <Text
                className={
                  "min-w-0 flex-1 shrink text-xs leading-[18px] text-text-secondary dark:text-text-secondary-dark " +
                  (language === "ar" ? "text-right" : "text-left")
                }
              >
                {t("compact_review_creation_explanation")}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
