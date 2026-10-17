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
import {
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { shouldUseCompactLayout } from "@/constants/ui";
import { useLocale } from "@/context/LocaleContext";
import {
  DefaultAccountInfo,
  DefaultAccountWhySheet,
} from "./DefaultAccountInfo";
import {
  SharedAccountSuggestions,
  type SharedAccountSuggestionsProps,
  type SharedReviewSummaryView,
} from "./SharedAccountSuggestions";

type ReviewFilter = AccountReviewSession["filter"];
type ReviewRowId = AccountReviewRow["rowId"];

export interface AccountReviewPanelProps extends SharedAccountSuggestionsProps {
  readonly filter: ReviewFilter;
  readonly visibleRowIds: readonly ReviewRowId[];
  readonly readyVisibleRowIds: readonly ReviewRowId[];
  readonly defaultAccountName: string | null;
  readonly isWhySheetOpen: boolean;
  readonly onFilterChange: (filter: ReviewFilter) => void;
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
  readonly value: ReviewFilter;
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
  readonly disabled: boolean;
  readonly onChange: (filter: ReviewFilter) => void;
}

function FilterButton(props: FilterButtonProps): React.JSX.Element {
  const color = props.active
    ? "border-gold-800 bg-gold-50 dark:border-gold-400 dark:bg-surface-dark"
    : "border-border bg-surface dark:border-border-dark dark:bg-surface-dark";
  const ink = props.active
    ? "text-gold-800 dark:text-gold-400"
    : "text-text-secondary dark:text-text-secondary-dark";
  return (
    <TouchableOpacity
      testID={"account-review-filter-" + props.value}
      accessible
      accessibilityRole="button"
      accessibilityLabel={props.label + ", " + props.count}
      accessibilityState={{ selected: props.active, disabled: props.disabled }}
      disabled={props.disabled}
      onPress={() => props.onChange(props.value)}
      activeOpacity={0.8}
      className={
        "min-h-12 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-2 " +
        color
      }
    >
      <Text className={"text-center text-sm font-semibold leading-5 " + ink}>
        {props.label}
      </Text>
      <Text className={"text-center text-xs leading-[18px] " + ink}>
        {props.count}
      </Text>
    </TouchableOpacity>
  );
}

interface FilterBarProps {
  readonly filter: ReviewFilter;
  readonly summary: SharedReviewSummaryView;
  readonly isBusy: boolean;
  readonly onFilterChange: (filter: ReviewFilter) => void;
}

function ReviewFilterBar(props: FilterBarProps): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const { language } = useLocale();
  const labels: Record<ReviewFilter, string> = {
    all: t("review_mode_all", {
      defaultValue: language === "ar" ? "الكل" : "All",
    }),
    needs_review: t("review_mode_needs_review", {
      defaultValue: language === "ar" ? "تحتاج مراجعة" : "Needs review",
    }),
    selected: t("account_review_filter_selected", {
      defaultValue: approvedCopy[language].selected,
    }),
  };
  const counts: Record<ReviewFilter, number> = {
    all: props.summary.totalCount,
    needs_review: props.summary.distinctNeedsReviewCount,
    selected: props.summary.selectedCount,
  };
  const filters: readonly ReviewFilter[] = ["all", "needs_review", "selected"];
  return (
    <View
      testID="account-review-filter-bar"
      className={
        "w-full max-w-[350px] self-center gap-2 " +
        (language === "ar" ? "flex-row-reverse" : "flex-row")
      }
    >
      {filters.map((value) => (
        <FilterButton
          key={value}
          value={value}
          label={labels[value]}
          count={counts[value]}
          active={props.filter === value}
          disabled={props.isBusy}
          onChange={props.onFilterChange}
        />
      ))}
    </View>
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
        "min-h-12 min-w-0 flex-1 items-center justify-center rounded-lg px-3 py-2 " +
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
  readonly selectedCount: number;
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
  const { width, fontScale } = useWindowDimensions();
  const stacked = shouldUseCompactLayout(width, fontScale);
  return (
    <View
      testID="account-review-selection-toolbar"
      className={
        "w-full max-w-[350px] self-center gap-3 " +
        (stacked
          ? "flex-col"
          : language === "ar"
            ? "flex-row-reverse"
            : "flex-row")
      }
    >
      <ToolbarButton
        testID="account-review-select-ready"
        label={t("account_review_select_ready", {
          defaultValue: approvedCopy[language].selectReady,
        })}
        primary
        disabled={props.isBusy || props.readyVisibleRowIds.length === 0}
        onPress={props.onSelectReady}
      />
      <ToolbarButton
        testID="account-review-clear-selection"
        label={t("account_review_clear_selection", {
          defaultValue: approvedCopy[language].clearSelection,
        })}
        primary={false}
        disabled={props.isBusy || props.selectedCount === 0}
        onPress={props.onClearSelection}
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
      className="w-full max-w-[350px] self-center items-center gap-3 rounded-xl border border-border bg-surface px-4 py-5 dark:border-border-dark dark:bg-surface-dark"
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
  readonly isAllGroupsSheetOpen: boolean;
  readonly onDefaultWhyPress: () => void;
  readonly onCloseWhy: () => void;
}

function DefaultDisclosure(
  props: DefaultDisclosureProps
): React.JSX.Element | null {
  if (props.count === 0 || props.name === null) return null;
  return (
    <>
      <DefaultAccountInfo
        defaultAccountName={props.name}
        assignmentCount={props.count}
        onWhyPress={props.onDefaultWhyPress}
      />
      <DefaultAccountWhySheet
        visible={props.isWhySheetOpen && !props.isAllGroupsSheetOpen}
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
        isAllGroupsSheetOpen={props.isAllGroupsSheetOpen}
        isBusy={props.isBusy}
        onConfirm={props.onConfirm}
        onEdit={props.onEdit}
        onReplace={props.onReplace}
        onRemove={props.onRemove}
        onUndo={props.onUndo}
        onViewAll={props.onViewAll}
        onCloseAllGroups={props.onCloseAllGroups}
      />
      <DefaultDisclosure
        name={props.defaultAccountName}
        count={props.summary.defaultAssignmentCount}
        isWhySheetOpen={props.isWhySheetOpen}
        isAllGroupsSheetOpen={props.isAllGroupsSheetOpen}
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
  return (
    <View testID="account-review-panel" className="w-full gap-3 px-5">
      <ReviewDetails {...props} />
      <ReviewFilterBar
        filter={props.filter}
        summary={props.summary}
        isBusy={props.isBusy}
        onFilterChange={props.onFilterChange}
      />
      <ReviewSelectionToolbar
        selectedCount={props.summary.selectedCount}
        readyVisibleRowIds={props.readyVisibleRowIds}
        isBusy={props.isBusy}
        onSelectReady={props.onSelectReady}
        onClearSelection={props.onClearSelection}
      />
      {props.filter !== "all" && props.visibleRowIds.length === 0 ? (
        <ReviewFilterEmpty
          filter={props.filter}
          isBusy={props.isBusy}
          onFilterChange={props.onFilterChange}
        />
      ) : null}
    </View>
  );
}
