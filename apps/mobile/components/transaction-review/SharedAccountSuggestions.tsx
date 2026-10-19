/**
 * #395 T031 B1 — shaped, independent shared-account group presentation.
 * Counts, permissions, statuses, selection and mutations are parent-owned.
 * Local state owns only a visible menu, never account/reducer state.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { t } from "i18next";
import {
  FlatList,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type TextStyle,
} from "react-native";
import { useColorScheme } from "nativewind";
import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";
import { DefaultAccountInfo } from "./DefaultAccountInfo";
import { SharedAccountGroupRow } from "./SharedAccountGroupRow";
import {
  displayIdentity,
  ReviewActionButton,
  ReviewPointerBackdrop,
  ReviewSheetHandle,
  reviewCopy,
  type ReviewDisplayLanguage,
  type ReviewIssueEntry,
  type ReviewIssueKey,
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
  readonly isAllGroupsSheetOpen: boolean;
  readonly isBusy: boolean;
  readonly onConfirm: (groupId: string) => void;
  readonly onEdit: (groupId: string) => void;
  readonly onReplace: (groupId: string) => void;
  readonly onRemove: (groupId: string) => void;
  readonly onUndo: (groupId: string) => void;
  readonly onViewAll: () => void;
  readonly onCloseAllGroups: () => void;
  readonly defaultAccountName?: string | null;
  readonly onDefaultWhyPress?: () => void;
  readonly onIssuePress?: (key: ReviewIssueKey) => void;
}
type GroupCommandAction = "edit" | "replace" | "remove";
function GroupActionChoices({
  group,
  language,
  disabled,
  onAction,
}: {
  readonly group: SharedSuggestedGroupView;
  readonly language: ReviewDisplayLanguage;
  readonly disabled: boolean;
  readonly onAction: (action: GroupCommandAction) => void;
}): React.JSX.Element {
  return (
    <View className="gap-3">
      <ReviewActionButton
        testID="account-review-group-edit"
        tone="outline"
        iconName="pencil-outline"
        label={reviewCopy("account_review_group_edit", language)}
        disabled={disabled || !group.canEdit}
        onPress={() => onAction("edit")}
      />
      <ReviewActionButton
        testID="account-review-group-replace"
        tone="outline"
        iconName="swap-horizontal-outline"
        label={reviewCopy("account_review_group_replace", language)}
        disabled={disabled || !group.canReplace}
        onPress={() => onAction("replace")}
      />
      <ReviewActionButton
        testID="account-review-group-remove"
        tone="danger"
        iconName="trash-outline"
        label={reviewCopy("account_review_group_remove", language)}
        disabled={disabled || !group.canRemove}
        onPress={() => onAction("remove")}
      />
    </View>
  );
}
function GroupMenuContent({
  group,
  language,
  disabled,
  onAction,
}: {
  readonly group: SharedSuggestedGroupView;
  readonly language: ReviewDisplayLanguage;
  readonly disabled: boolean;
  readonly onAction: (action: GroupCommandAction) => void;
}): React.JSX.Element {
  const rtl = language === "ar";
  const direction: TextStyle["writingDirection"] = rtl ? "rtl" : "ltr";
  return (
    <View
      testID="account-review-group-action-sheet"
      className="w-full max-w-[350px] self-center gap-3 px-5 pb-3"
    >
      <Text
        accessibilityRole="header"
        className="text-xl font-bold leading-7 text-text-primary dark:text-text-primary-dark"
      >
        {reviewCopy("account_review_group_actions_title", language)}
      </Text>
      <Text
        style={{ writingDirection: direction }}
        className={
          "text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
          (rtl ? "text-right" : "text-left")
        }
      >
        {displayIdentity(group.displayName, language)} · {group.linkedCount}{" "}
        {reviewCopy("account_review_group_linked", language)}
      </Text>
      <GroupActionChoices
        group={group}
        language={language}
        disabled={disabled}
        onAction={onAction}
      />
    </View>
  );
}

interface GroupMenuModalProps {
  readonly group: SharedSuggestedGroupView;
  readonly language: ReviewDisplayLanguage;
  readonly disabled: boolean;
  readonly onAction: (action: GroupCommandAction) => void;
  readonly onClose: () => void;
}
function GroupMenuModal(props: GroupMenuModalProps): React.JSX.Element {
  const bottomInset = useModalBottomInset();
  const { height } = useWindowDimensions();
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={props.onClose}
    >
      <View className="flex-1 justify-end">
        <ReviewPointerBackdrop onPress={props.onClose} />
        <View
          accessibilityViewIsModal
          importantForAccessibility="yes"
          className="w-full rounded-t-[32px] border-t border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
          style={{
            maxHeight: Math.max(0, (height - bottomInset) * 0.8),
            paddingBottom: bottomInset,
          }}
        >
          <ReviewSheetHandle />
          <ScrollView keyboardShouldPersistTaps="handled">
            <GroupMenuContent
              group={props.group}
              language={props.language}
              disabled={props.disabled}
              onAction={props.onAction}
            />
            <View className="mx-5 mb-3">
              <ReviewActionButton
                tone="quiet"
                label={reviewCopy("account_review_group_close", props.language)}
                onPress={props.onClose}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
interface AllGroupsSheetProps {
  readonly open: boolean;
  readonly groups: readonly SharedSuggestedGroupView[];
  readonly language: ReviewDisplayLanguage;
  readonly renderGroup: (item: SharedSuggestedGroupView) => React.JSX.Element;
  readonly onClose: () => void;
  readonly activeMenu: SharedSuggestedGroupView | null;
  readonly onMenuAction: (action: GroupCommandAction) => void;
  readonly disabled: boolean;
}
function AllGroupsHeader({
  language,
  onClose,
}: {
  readonly language: ReviewDisplayLanguage;
  readonly onClose: () => void;
}): React.JSX.Element {
  return (
    <View
      className={
        language === "ar"
          ? "mx-5 mb-2 flex-row-reverse items-center justify-between"
          : "mx-5 mb-2 flex-row items-center justify-between"
      }
    >
      <Text
        accessibilityRole="header"
        className="text-xl font-bold leading-7 text-text-primary dark:text-text-primary-dark"
      >
        {reviewCopy("account_review_group_view_all", language)}
      </Text>
      <ReviewActionButton
        tone="quiet"
        label={reviewCopy("account_review_group_close", language)}
        onPress={onClose}
      />
    </View>
  );
}
function FullGroupsList({
  groups,
  renderGroup,
}: {
  readonly groups: readonly SharedSuggestedGroupView[];
  readonly renderGroup: (group: SharedSuggestedGroupView) => React.JSX.Element;
}): React.JSX.Element {
  return (
    <FlatList
      data={groups}
      keyExtractor={(group) => group.groupId}
      className="shrink"
      renderItem={({ item }) => renderGroup(item)}
      initialNumToRender={10}
      removeClippedSubviews={false}
      contentContainerClassName="px-5 pb-3"
      showsVerticalScrollIndicator={false}
    />
  );
}
function AllGroupsSheet(props: AllGroupsSheetProps): React.JSX.Element | null {
  const bottomInset = useModalBottomInset();
  const { height } = useWindowDimensions();
  if (!props.open) return null;
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={props.onClose}
    >
      <View className="flex-1 justify-end">
        <ReviewPointerBackdrop onPress={props.onClose} />
        <View
          testID="account-review-group-all-sheet"
          accessibilityViewIsModal
          importantForAccessibility="yes"
          className="w-full rounded-t-[32px] border-t border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
          style={{
            maxHeight: Math.max(0, (height - bottomInset) * 0.8),
            paddingBottom: bottomInset,
          }}
        >
          <ReviewSheetHandle />
          <AllGroupsHeader language={props.language} onClose={props.onClose} />
          <FullGroupsList
            groups={props.groups}
            renderGroup={props.renderGroup}
          />
          {props.activeMenu ? (
            <GroupMenuContent
              group={props.activeMenu}
              language={props.language}
              disabled={props.disabled}
              onAction={props.onMenuAction}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
interface OverviewPanelProps {
  readonly groups: readonly SharedSuggestedGroupView[];
  readonly summary: SharedReviewSummaryView;
  readonly language: ReviewDisplayLanguage;
  readonly renderGroup: (group: SharedSuggestedGroupView) => React.JSX.Element;
  readonly onViewAll: () => void;
  readonly disabled: boolean;
  readonly defaultAccountName?: string | null;
  readonly onDefaultWhyPress?: () => void;
  readonly onIssuePress?: (key: ReviewIssueKey) => void;
}
function GroupIssues({
  labels,
  issues,
  language,
  disabled,
  onIssuePress,
}: {
  readonly labels: readonly string[];
  readonly issues?: readonly ReviewIssueEntry[];
  readonly language: ReviewDisplayLanguage;
  readonly disabled: boolean;
  readonly onIssuePress?: (key: ReviewIssueKey) => void;
}): React.JSX.Element | null {
  const { colorScheme } = useColorScheme();
  const rtl = language === "ar";
  const displayed: ReadonlyArray<{
    readonly key: ReviewIssueKey | null;
    readonly label: string;
    readonly count: number | null;
  }> = issues ?? labels.map((label) => ({ key: null, label, count: null }));
  if (displayed.length === 0) return null;
  return (
    <View className="mt-3 gap-2">
      {displayed.map((issue, index) => {
        const actionLabel = t(
          issue.key === "account_review_issue_account" ||
            issue.key === "account_review_issue_category"
            ? "account_review_issue_choose"
            : "account_review_issue_review",
          { ns: "transactions", lng: language }
        );
        const inactive = disabled || issue.key === null || !onIssuePress;
        return (
          <View
            key={issue.key ?? String(index)}
            testID={"account-review-issue-" + (issue.key ?? index)}
            className={
              "min-h-[68px] flex-wrap items-center gap-2 border-b border-border py-3 dark:border-border-dark " +
              (rtl ? "flex-row-reverse" : "flex-row")
            }
          >
            <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-50 dark:bg-surface-dark">
              <Ionicons
                name="alert-circle-outline"
                size={22}
                color={
                  colorScheme === "dark" ? palette.gold[400] : palette.gold[800]
                }
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text
                className={
                  "text-sm font-semibold leading-5 text-text-primary dark:text-text-primary-dark " +
                  (rtl ? "text-right" : "text-left")
                }
              >
                {issue.label}
              </Text>
              {issue.count !== null ? (
                <Text
                  testID="account-review-issue-count"
                  className={
                    "text-xs leading-[18px] text-text-secondary dark:text-text-secondary-dark " +
                    (rtl ? "text-right" : "text-left")
                  }
                >
                  {t("account_review_issue_count", {
                    ns: "transactions",
                    lng: language,
                    count: issue.count,
                  })}
                </Text>
              ) : null}
            </View>
            {issue.key !== null && onIssuePress ? (
              <TouchableOpacity
                testID={"account-review-issue-action-" + issue.key}
                accessible
                accessibilityRole="button"
                accessibilityLabel={actionLabel + ", " + issue.label}
                accessibilityState={{ disabled: inactive }}
                disabled={inactive}
                onPress={() => {
                  if (!inactive && issue.key) onIssuePress(issue.key);
                }}
                className={
                  "min-h-12 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-border px-3 dark:border-border-dark " +
                  (rtl ? "flex-row-reverse" : "flex-row")
                }
              >
                <Text className="text-sm font-semibold text-nileGreen-700 dark:text-nileGreen-400">
                  {actionLabel}
                </Text>
                <Ionicons
                  name={
                    rtl ? "chevron-back-outline" : "chevron-forward-outline"
                  }
                  size={18}
                  color={
                    colorScheme === "dark"
                      ? palette.nileGreen[400]
                      : palette.nileGreen[700]
                  }
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function OverviewPanel(props: OverviewPanelProps): React.JSX.Element {
  const { summary, groups, language } = props;
  const rtl = language === "ar";
  return (
    <View
      testID="account-review-details-panel"
      className="w-full self-center rounded-xl border border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark"
    >
      <Text
        accessibilityRole="header"
        className="text-xl font-bold leading-7 text-text-primary dark:text-text-primary-dark"
      >
        {reviewCopy("account_review_details_title", language)}
      </Text>
      <Text
        className={
          "mt-1 text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
          (rtl ? "text-right" : "text-left")
        }
      >
        {groups.length === 0
          ? t("account_review_details_needs", {
              ns: "transactions",
              lng: language,
              count: summary.distinctNeedsReviewCount,
            })
          : [
              summary.pendingGroupCount > 0
                ? t("account_review_details_pending", {
                    ns: "transactions",
                    lng: language,
                    count: summary.pendingGroupCount,
                  })
                : null,
              (summary.issues?.find(
                (issue) => issue.key === "account_review_issue_currency"
              )?.count ?? 0) > 0
                ? t("account_review_details_currency", {
                    ns: "transactions",
                    lng: language,
                    count:
                      summary.issues?.find(
                        (issue) => issue.key === "account_review_issue_currency"
                      )?.count ?? 0,
                  })
                : null,
              summary.confirmedGroupCount > 0
                ? t("account_review_details_confirmed", {
                    ns: "transactions",
                    lng: language,
                    count: summary.confirmedGroupCount,
                  })
                : null,
            ]
              .filter((part): part is string => part !== null)
              .join(" · ")}{" "}
      </Text>
      <View className="mt-3">
        {groups.slice(0, 2).map((group) => (
          <React.Fragment key={group.groupId}>
            {props.renderGroup(group)}
          </React.Fragment>
        ))}
      </View>
      <GroupIssues
        labels={summary.issueLabels}
        issues={summary.issues}
        language={language}
        disabled={props.disabled}
        onIssuePress={props.onIssuePress}
      />
      {props.defaultAccountName &&
      summary.defaultAssignmentCount > 0 &&
      props.onDefaultWhyPress ? (
        <DefaultAccountInfo
          defaultAccountName={props.defaultAccountName}
          assignmentCount={summary.defaultAssignmentCount}
          onWhyPress={props.onDefaultWhyPress}
        />
      ) : null}
      {groups.length > 1 ? (
        <View className="mt-3">
          <ReviewActionButton
            testID="account-review-group-view-all"
            tone="quiet"
            label={reviewCopy("account_review_group_view_all", language)}
            disabled={props.disabled}
            onPress={props.onViewAll}
          />
        </View>
      ) : null}
    </View>
  );
}
interface GroupSurfaceCompositionProps {
  readonly source: SharedAccountSuggestionsProps;
  readonly renderGroup: (group: SharedSuggestedGroupView) => React.JSX.Element;
  readonly menu: SharedSuggestedGroupView | null;
  readonly language: ReviewDisplayLanguage;
  readonly disabled: boolean;
  readonly onAction: (action: GroupCommandAction) => void;
  readonly dismissMenu: () => void;
}
function GroupSurfaceComposition(
  p: GroupSurfaceCompositionProps
): React.JSX.Element {
  const source = p.source;
  return (
    <>
      <OverviewPanel
        groups={source.groups}
        summary={source.summary}
        language={p.language}
        renderGroup={p.renderGroup}
        disabled={source.isBusy}
        onViewAll={source.onViewAll}
        defaultAccountName={source.defaultAccountName}
        onDefaultWhyPress={source.onDefaultWhyPress}
        onIssuePress={source.onIssuePress}
      />
      <AllGroupsSheet
        open={source.isAllGroupsSheetOpen}
        groups={source.groups}
        language={p.language}
        renderGroup={p.renderGroup}
        onClose={source.onCloseAllGroups}
        activeMenu={p.menu}
        onMenuAction={p.onAction}
        disabled={p.disabled}
      />
      {p.menu && !source.isAllGroupsSheetOpen ? (
        <GroupMenuModal
          group={p.menu}
          language={p.language}
          disabled={p.disabled}
          onAction={p.onAction}
          onClose={p.dismissMenu}
        />
      ) : null}
    </>
  );
}
export function SharedAccountSuggestions(
  props: SharedAccountSuggestionsProps
): React.JSX.Element | null {
  const { language } = useLocale();
  const { width, fontScale } = useWindowDimensions();
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);
  const menu =
    props.groups.find((group) => group.groupId === menuGroupId) ?? null;
  const disabled = props.isBusy || (menu?.isBusy ?? false);
  const perform = (action: GroupCommandAction): void => {
    if (!menu || disabled) return;
    setMenuGroupId(null);
    if (action === "edit" && menu.canEdit) {
      if (props.isAllGroupsSheetOpen) props.onCloseAllGroups();
      props.onEdit(menu.groupId);
    }
    if (action === "replace" && menu.canReplace) {
      if (props.isAllGroupsSheetOpen) props.onCloseAllGroups();
      props.onReplace(menu.groupId);
    }
    if (action === "remove" && menu.canRemove) props.onRemove(menu.groupId);
  };
  const renderGroup = (group: SharedSuggestedGroupView): React.JSX.Element => (
    <SharedAccountGroupRow
      group={group}
      language={language}
      viewportWidth={width}
      fontScale={fontScale}
      disabled={props.isBusy || group.isBusy}
      onConfirm={() => props.onConfirm(group.groupId)}
      onMenu={() => setMenuGroupId(group.groupId)}
      onUndo={() => props.onUndo(group.groupId)}
    />
  );
  if (props.groups.length === 0 && props.summary.issueLabels.length === 0)
    return null;
  return (
    <GroupSurfaceComposition
      source={props}
      renderGroup={renderGroup}
      menu={menu}
      language={language}
      disabled={disabled}
      onAction={perform}
      dismissMenu={() => setMenuGroupId(null)}
    />
  );
}
