/**
 * #395 T060 — approved B1 compact review presentation only.
 *
 * Canonical eligibility, counts, group membership, selection, filter state,
 * modal visibility and commands are shaped by the parent (T059/T030/T061).
 * This component never reads accounts, runs a reducer or persists a change.
 */
import type { AccountReviewRow, AccountReviewSession } from "@monyvi/logic";
import React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

import { useLocale } from "@/context/LocaleContext";
import {
  DefaultAccountInfo,
  DefaultAccountWhySheet,
} from "./DefaultAccountInfo";
import { AccountNeededTemporaryHeader } from "./account-review-filter-header";
import {
  SharedAccountSuggestions,
  type SharedAccountSuggestionsProps,
  type SharedReviewSummaryView,
} from "./SharedAccountSuggestions";

type ReviewFilter = AccountReviewSession["filter"];
type ReviewVisibleTab = ReviewFilter | "account_needed";
type ReviewRowId = AccountReviewRow["rowId"];

export interface AccountReviewPanelProps extends SharedAccountSuggestionsProps {
  readonly filter: ReviewFilter;
  readonly visibleRowIds: readonly ReviewRowId[];
  readonly readyVisibleRowIds: readonly ReviewRowId[];
  readonly selectedVisibleCount: number;
  readonly defaultAccountName: string | null;
  readonly isWhySheetOpen: boolean;
  readonly onFilterChange: (filter: ReviewFilter) => void;
  readonly onAccountNeededPress: () => void;
  readonly accountNeededCount: number;
  readonly accountNeededActive: boolean;
  readonly temporaryScopeActive: boolean;
  readonly linkedGroupName: string | null;
  readonly temporaryRowCount: number;
  readonly onShowAll: () => void;
  readonly onSelectReady: () => void;
  readonly onClearSelection: () => void;
  readonly onDefaultWhyPress: () => void;
  readonly onCloseWhy: () => void;
}

/** Approved R3 additions awaiting the shared T072 dictionary-owner lane. */
const approvedCopy = {
  en: {
    selected: "Selected",
    selectReady: "Select ready",
    clearSelection: "Clear selection",
    emptySelected: "No selected transactions",
    selectFromAll: "Choose transactions from All to save them.",
  },
  ar: {
    selected: "المحددة",
    selectReady: "اختيار الجاهز",
    clearSelection: "إلغاء التحديد",
    emptySelected: "لا توجد معاملات محددة",
    selectFromAll: "اختر المعاملات من «الكل» لحفظها.",
  },
} as const;

interface FilterButtonProps {
  readonly value: ReviewVisibleTab;
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
  readonly disabled: boolean;
  readonly onChange: (filter: ReviewVisibleTab) => void;
  readonly language: "en" | "ar";
}

function FilterButton(props: FilterButtonProps): React.JSX.Element {
  const ink = props.active
    ? "text-slate-900 dark:text-slate-900"
    : "text-text-secondary dark:text-text-secondary-dark";
  const count = new Intl.NumberFormat(
    props.language === "ar" ? "ar-EG" : "en-EG"
  ).format(props.count);
  return (
    <TouchableOpacity
      testID={"account-review-filter-" + props.value}
      accessible
      accessibilityRole="button"
      accessibilityLabel={props.label + " (" + count + ")"}
      accessibilityState={{ selected: props.active, disabled: props.disabled }}
      disabled={props.disabled}
      onPress={() => props.onChange(props.value)}
      activeOpacity={0.8}
      className={
        "min-h-11 min-w-11 flex-grow shrink-0 items-center justify-center rounded-lg px-3 py-2 " +
        (props.active ? "bg-gold-400 dark:bg-gold-400" : "bg-transparent")
      }
    >
      <Text className={"text-center text-sm font-semibold leading-5 " + ink}>
        {props.label}
        {" ("}
        {count}
        {")"}
      </Text>
    </TouchableOpacity>
  );
}

interface FilterBarProps {
  readonly filter: ReviewFilter;
  readonly summary: SharedReviewSummaryView;
  readonly accountNeededActive: boolean;
  readonly accountNeededCount: number;
  readonly temporaryScopeActive: boolean;
  readonly isBusy: boolean;
  readonly onAccountNeededPress: () => void;
  readonly onFilterChange: (filter: ReviewFilter) => void;
}

function ReviewFilterBar(props: FilterBarProps): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const { language } = useLocale();
  const labels: Record<ReviewVisibleTab, string> = {
    all: t("review_mode_all", {
      defaultValue: language === "ar" ? "الكل" : "All",
    }),
    needs_review: t("review_mode_needs_review", {
      defaultValue: language === "ar" ? "تحتاج مراجعة" : "Needs review",
    }),
    selected: t("account_review_filter_selected", {
      defaultValue: approvedCopy[language].selected,
    }),
    account_needed: t("account_review_issue_account_needed"),
  };
  const counts: Record<ReviewVisibleTab, number> = {
    all: props.summary.totalCount,
    needs_review: props.summary.distinctNeedsReviewCount,
    selected: props.summary.selectedCount,
    account_needed: props.accountNeededCount,
  };
  const filters: readonly ReviewVisibleTab[] = [
    "all",
    "needs_review",
    "account_needed",
    "selected",
  ];
  return (
    <ScrollView
      testID="account-review-filter-scroll"
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexGrow: 1 }}
      className="w-full self-center"
    >
      <View
        testID="account-review-filter-bar"
        className={
          "min-w-full flex-grow shrink-0 items-center gap-1 rounded-xl border border-border bg-surface p-1 dark:border-border-dark dark:bg-surface-dark " +
          (language === "ar" ? "flex-row-reverse" : "flex-row")
        }
      >
        {filters.map((value) => (
          <FilterButton
            key={value}
            value={value}
            label={labels[value]}
            count={counts[value]}
            active={
              value === "account_needed"
                ? props.accountNeededActive
                : !props.temporaryScopeActive && props.filter === value
            }
            language={language}
            disabled={props.isBusy}
            onChange={(tab) => {
              if (tab === "account_needed") props.onAccountNeededPress();
              else props.onFilterChange(tab);
            }}
          />
        ))}
      </View>
    </ScrollView>
  );
}

interface ToolbarButtonProps {
  readonly testID: string;
  readonly label: string;
  readonly primary: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}

function ToolbarButton(props: ToolbarButtonProps): React.JSX.Element {
  const surface = props.disabled
    ? "bg-slate-200 dark:bg-slate-700"
    : props.primary
      ? "bg-nileGreen-600"
      : "border border-border bg-surface dark:border-border-dark dark:bg-surface-dark";
  const ink = props.disabled
    ? "text-text-muted dark:text-text-muted-dark"
    : props.primary
      ? "text-white"
      : "text-nileGreen-700 dark:text-nileGreen-400";
  return (
    <TouchableOpacity
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      activeOpacity={0.8}
      className={
        "min-h-12 min-w-0 items-center justify-center rounded-lg px-3 py-2 " +
        surface
      }
    >
      <Text className={"text-center text-sm font-semibold leading-5 " + ink}>
        {props.label}
      </Text>
    </TouchableOpacity>
  );
}

interface SelectionToolbarProps {
  readonly visibleRowCount: number;
  readonly selectedVisibleCount: number;
  readonly readyVisibleRowIds: readonly ReviewRowId[];
  readonly isBusy: boolean;
  readonly onSelectReady: () => void;
  readonly onClearSelection: () => void;
}

function ReviewSelectionToolbar(
  props: SelectionToolbarProps
): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const { language } = useLocale();
  const offerClear =
    props.readyVisibleRowIds.length === 0 && props.selectedVisibleCount > 0;
  return (
    <View
      testID="account-review-selection-toolbar"
      className={
        "w-full self-center flex-wrap items-center justify-between gap-2 " +
        (language === "ar" ? "flex-row-reverse" : "flex-row")
      }
    >
      <Text
        testID="account-review-visible-count"
        className="text-sm leading-5 text-text-secondary dark:text-text-secondary-dark"
      >
        {t("account_review_toolbar_count", { count: props.visibleRowCount })}
      </Text>
      <ToolbarButton
        testID={
          offerClear
            ? "account-review-clear-selection"
            : "account-review-select-ready"
        }
        label={
          offerClear
            ? t("account_review_clear_selection", {
                defaultValue: approvedCopy[language].clearSelection,
              })
            : t("account_review_select_ready", {
                defaultValue: approvedCopy[language].selectReady,
              })
        }
        primary={false}
        disabled={
          props.isBusy || (!offerClear && props.readyVisibleRowIds.length === 0)
        }
        onPress={offerClear ? props.onClearSelection : props.onSelectReady}
      />
    </View>
  );
}

interface EmptyFilterProps {
  readonly filter: ReviewFilter;
  readonly isBusy: boolean;
  readonly onFilterChange: (filter: ReviewFilter) => void;
}

function FilterEmptyMessage({
  filter,
}: Pick<EmptyFilterProps, "filter">): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const { language } = useLocale();
  const selected = filter === "selected";
  const title = selected
    ? t("account_review_empty_selected", {
        defaultValue: approvedCopy[language].emptySelected,
      })
    : t("no_transactions_to_review", {
        defaultValue:
          language === "ar"
            ? "لا توجد معاملات للمراجعة"
            : "No transactions to review",
      });
  return (
    <>
      <Text className="text-center text-base font-semibold leading-6 text-text-primary dark:text-text-primary-dark">
        {title}
      </Text>
      {selected ? (
        <Text className="text-center text-sm leading-5 text-text-secondary dark:text-text-secondary-dark">
          {t("account_review_empty_selected_help", {
            defaultValue: approvedCopy[language].selectFromAll,
          })}
        </Text>
      ) : null}
    </>
  );
}

function ReviewFilterEmpty(props: EmptyFilterProps): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const { language } = useLocale();
  const showAll = t("show_all", {
    defaultValue: language === "ar" ? "عرض الكل" : "Show all",
  });
  return (
    <View
      testID="account-review-filter-empty"
      className="w-full self-center items-center gap-3 px-4 py-6"
    >
      <FilterEmptyMessage filter={props.filter} />
      <TouchableOpacity
        testID="account-review-show-all"
        accessible
        accessibilityRole="button"
        accessibilityLabel={showAll}
        accessibilityState={{ disabled: props.isBusy }}
        disabled={props.isBusy}
        onPress={() => props.onFilterChange("all")}
        activeOpacity={0.8}
        className="min-h-12 min-w-11 items-center justify-center rounded-lg border border-border bg-surface px-4 dark:border-border-dark dark:bg-surface-dark"
      >
        <Text className="text-base font-semibold text-nileGreen-700 dark:text-nileGreen-400">
          {showAll}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

interface DefaultDisclosureProps {
  readonly name: string | null;
  readonly count: number;
  readonly isWhySheetOpen: boolean;
  readonly onDefaultWhyPress: () => void;
  readonly onCloseWhy: () => void;
}

function DefaultDisclosure(
  props: DefaultDisclosureProps & { readonly standalone: boolean }
): React.JSX.Element | null {
  if (props.count === 0 || props.name === null) return null;
  return (
    <>
      {props.standalone ? (
        <DefaultAccountInfo
          defaultAccountName={props.name}
          assignmentCount={props.count}
          onWhyPress={props.onDefaultWhyPress}
        />
      ) : null}
      <DefaultAccountWhySheet
        visible={props.isWhySheetOpen}
        defaultAccountName={props.name}
        assignmentCount={props.count}
        onClose={props.onCloseWhy}
      />
    </>
  );
}

function ReviewDetails(props: AccountReviewPanelProps): React.JSX.Element {
  return (
    <>
      <SharedAccountSuggestions
        groups={props.groups}
        summary={props.summary}
        accountNeededCount={props.accountNeededCount}
        isBusy={props.isBusy}
        onConfirm={props.onConfirm}
        onEdit={props.onEdit}
        onReplace={props.onReplace}
        onRemove={props.onRemove}
        onUndo={props.onUndo}
        onViewLinked={props.onViewLinked}
        onDiscardRemoved={props.onDiscardRemoved}
        revealGroupsKey={props.revealGroupsKey}
        defaultAccountName={props.defaultAccountName}
        onDefaultWhyPress={props.onDefaultWhyPress}
        onIssuePress={props.onIssuePress}
      />
      <DefaultDisclosure
        standalone={
          props.groups.length === 0 && props.summary.issueLabels.length === 0
        }
        name={props.defaultAccountName}
        count={props.summary.defaultAssignmentCount}
        isWhySheetOpen={props.isWhySheetOpen}
        onDefaultWhyPress={props.onDefaultWhyPress}
        onCloseWhy={props.onCloseWhy}
      />
    </>
  );
}

/**
 * Filters and the independent selection toolbar are always siblings of the
 * conditional details/default views; the parent renders actual transaction rows.
 */
export function AccountReviewPanel(
  props: AccountReviewPanelProps
): React.JSX.Element {
  const { t } = useTranslation("transactions");
  return (
    <View testID="account-review-panel" className="w-full gap-3 px-5">
      <ReviewDetails {...props} />
      <ReviewFilterBar
        filter={props.filter}
        summary={props.summary}
        accountNeededActive={props.accountNeededActive}
        accountNeededCount={props.accountNeededCount}
        temporaryScopeActive={props.temporaryScopeActive}
        isBusy={props.isBusy}
        onAccountNeededPress={props.onAccountNeededPress}
        onFilterChange={props.onFilterChange}
      />
      {props.linkedGroupName !== null ? (
        <AccountNeededTemporaryHeader
          count={props.temporaryRowCount}
          linkedGroupName={props.linkedGroupName}
          disabled={props.isBusy}
          onShowAll={props.onShowAll}
        />
      ) : null}
      {!props.temporaryScopeActive ? (
        <ReviewSelectionToolbar
          visibleRowCount={props.visibleRowIds.length}
          selectedVisibleCount={props.selectedVisibleCount}
          readyVisibleRowIds={props.readyVisibleRowIds}
          isBusy={props.isBusy}
          onSelectReady={props.onSelectReady}
          onClearSelection={props.onClearSelection}
        />
      ) : null}
      {props.accountNeededActive && props.accountNeededCount === 0 ? (
        <Text
          testID="account-review-account-needed-empty"
          className="text-sm text-text-secondary dark:text-text-secondary-dark"
        >
          {t("compact_review_account_needed_empty")}
        </Text>
      ) : null}
      {!props.temporaryScopeActive &&
      props.filter !== "all" &&
      props.visibleRowIds.length === 0 ? (
        <ReviewFilterEmpty
          filter={props.filter}
          isBusy={props.isBusy}
          onFilterChange={props.onFilterChange}
        />
      ) : null}
    </View>
  );
}
