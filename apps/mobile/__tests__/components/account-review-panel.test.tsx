/**
 * #395 T058 TESTS FIRST — the AccountReviewPanel SUT is absent at bde7c628.
 * Real T020/T031 children, approved B1 descriptor fixtures and parent callbacks
 * are used; this file neither mocks the missing panel nor dispatches commands.
 * Jest semantics are NOT native screenshots, font, focus or screen-reader proof.
 */
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import {
  changeLanguage,
  init as initializeI18next,
  use as registerI18nextPlugin,
} from "i18next";
import { initReactI18next } from "react-i18next";
import React, { type ComponentProps } from "react";
import { FlatList, Modal, TouchableOpacity } from "react-native";
import type { AccountReviewSession } from "@monyvi/logic";
import { AccountReviewPanel } from "@/components/transaction-review/AccountReviewPanel";
import {
  makeSharedPresentation,
  makeSixGroupViewAll,
  requireGroup,
  type SharedPresentationFixture,
} from "./shared-account-suggestions-test-fixtures";
import descriptorCatalog from "../../e2e/fixtures/shared-account-review.json";

let mockLanguage: "en" | "ar" = "en";
let mockWindow = { width: 390, height: 844, fontScale: 1, scale: 1 };

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: "en" | "ar" } => ({
    language: mockLanguage,
  }),
}));
jest.mock("@/hooks/useModalBottomInset", () => ({
  useModalBottomInset: (): number => 28,
}));
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: (): typeof mockWindow => mockWindow,
}));

type PanelProps = ComponentProps<typeof AccountReviewPanel>;
type ReviewFilter = AccountReviewSession["filter"];

const copy = {
  en: {
    account_review_details_title: "Review details",
    account_review_default_note:
      "Using {defaultAccountName} for {count} transactions",
    account_review_default_why_trigger: "Why?",
    account_review_group_confirm: "Confirm",
    account_review_group_confirmed: "Confirmed",
    account_review_group_view_all: "View all",
    account_review_group_edit: "Edit",
    account_review_group_replace: "Use existing account",
    account_review_group_remove: "Remove",
    account_review_group_undo: "Undo",
    account_review_group_change: "Change",
    account_review_issue_choose: "Choose",
    account_review_issue_review: "Review",
    account_review_toolbar_count_one: "1 transaction",
    account_review_toolbar_count_other: "{{count}} transactions",
    account_review_issue_count_one: "1 transaction",
    account_review_issue_count_other: "{{count}} transactions",
  },
  ar: {
    account_review_details_title: "تفاصيل للمراجعة",
    account_review_default_note:
      "استخدام {defaultAccountName} لـ {count} معاملات",
    account_review_default_why_trigger: "لماذا؟",
    account_review_group_confirm: "تأكيد",
    account_review_group_confirmed: "تم التأكيد",
    account_review_group_view_all: "عرض الكل",
    account_review_group_edit: "تعديل",
    account_review_group_replace: "استخدام حساب موجود",
    account_review_group_remove: "إزالة",
    account_review_group_undo: "تراجع",
    account_review_group_change: "تغيير",
    account_review_issue_choose: "اختيار",
    account_review_issue_review: "مراجعة",
    account_review_toolbar_count_one: "معاملة واحدة",
    account_review_toolbar_count_other: "{{count}} معاملة",
    account_review_issue_count_one: "معاملة واحدة",
    account_review_issue_count_other: "{{count}} معاملة",
  },
} as const;

function requireScene(id: string): (typeof descriptorCatalog.scenes)[number] {
  const result = descriptorCatalog.scenes.find((scene) => scene.id === id);
  if (!result) throw new Error("Missing approved B1 scene: " + id);
  return result;
}

/**
 * Existing T026 fixture owns shared group shaping. Only states without an
 * exported T026 scenario receive local display-only summaries from their
 * approved descriptor; no derived domain readiness or new business vocabulary.
 */
function scenePresentation(id: string): SharedPresentationFixture {
  switch (id) {
    case "r3-combined-en":
      return makeSharedPresentation("r3-combined-en");
    case "r3-combined-ar":
      return makeSharedPresentation("r3-combined-ar", "ar");
    case "r3-default-only":
      return makeSharedPresentation("r3-default-only");
    case "r3-confirmed-feedback":
      return makeSharedPresentation("r3-confirmed-feedback");
    case "r3-removed-undo":
      return makeSharedPresentation("r3-removed-undo");
    case "r3-clean":
      return makeSharedPresentation("r3-clean");
    case "r3-selected-empty": {
      const descriptor = requireScene(id);
      const confirmed = makeSharedPresentation("r3-confirmed-feedback");
      const group = confirmed.groups[0];
      const originalGroup = descriptor.groups[0];
      if (!group || !originalGroup)
        throw new Error("Missing confirmed group fixture");
      return {
        groups: [
          {
            ...group,
            groupId: originalGroup.groupId,
            linkedCount: originalGroup.linkedRowIds.length,
          },
        ],
        summary: {
          ...confirmed.summary,
          totalCount: descriptor.expectedCounts.total,
          distinctNeedsReviewCount: descriptor.expectedCounts.needsReview,
          selectedCount: descriptor.expectedCounts.selected,
          defaultAssignmentCount: 0,
          pendingGroupCount: 0,
          confirmedGroupCount: 1,
          issueLabels: [],
        },
      };
    }
    case "r3-issues-only": {
      const descriptor = requireScene(id);
      const clean = makeSharedPresentation("r3-clean");
      return {
        groups: [],
        summary: {
          ...clean.summary,
          totalCount: descriptor.expectedCounts.total,
          distinctNeedsReviewCount: descriptor.expectedCounts.needsReview,
          selectedCount: descriptor.expectedCounts.selected,
          defaultAssignmentCount: 0,
          pendingGroupCount: 0,
          confirmedGroupCount: 0,
          issueLabels: [
            "Choose an account",
            "Confirm currency",
            "Check amount",
            "Choose a category",
          ],
        },
      };
    }
    default:
      throw new Error("Scene is outside T058: " + id);
  }
}

function callbacks(): Pick<
  PanelProps,
  | "onConfirm"
  | "onEdit"
  | "onReplace"
  | "onRemove"
  | "onUndo"
  | "onViewAll"
  | "onCloseAllGroups"
  | "onFilterChange"
  | "onSelectReady"
  | "onClearSelection"
  | "onDefaultWhyPress"
  | "onCloseWhy"
> {
  return {
    onConfirm: jest.fn<void, [groupId: string]>(),
    onEdit: jest.fn<void, [groupId: string]>(),
    onReplace: jest.fn<void, [groupId: string]>(),
    onRemove: jest.fn<void, [groupId: string]>(),
    onUndo: jest.fn<void, [groupId: string]>(),
    onViewAll: jest.fn<void, []>(),
    onCloseAllGroups: jest.fn<void, []>(),
    onFilterChange: jest.fn<void, [filter: ReviewFilter]>(),
    onSelectReady: jest.fn<void, []>(),
    onClearSelection: jest.fn<void, []>(),
    onDefaultWhyPress: jest.fn<void, []>(),
    onCloseWhy: jest.fn<void, []>(),
  };
}

function propsFor(id: string, overrides: Partial<PanelProps> = {}): PanelProps {
  const descriptor = requireScene(id);
  const view = scenePresentation(id);
  return {
    groups: view.groups,
    summary: view.summary,
    filter: "all",
    visibleRowIds: descriptor.rows.map((row) => row.rowId),
    // Readiness is injected by the parent from T059/reducer, never inferred
    // from a row label or an unconfirmed group inside the panel.
    readyVisibleRowIds: [],
    selectedVisibleCount: view.summary.selectedCount,
    defaultAccountName: view.summary.defaultAssignmentCount > 0 ? "Cash" : null,
    isAllGroupsSheetOpen: false,
    isWhySheetOpen: false,
    isBusy: false,
    ...callbacks(),
    ...overrides,
  };
}

function show(id: string, overrides: Partial<PanelProps> = {}): PanelProps {
  const props = propsFor(id, overrides);
  render(<AccountReviewPanel {...props} />);
  return props;
}

function assertThreeFilters(current: ReviewFilter): void {
  const filters: readonly ReviewFilter[] = ["all", "needs_review", "selected"];
  for (const filter of filters) {
    const button = screen.getByTestId("account-review-filter-" + filter);
    expect(button.props.accessibilityRole).toBe("button");
    if (filter === current) {
      expect(button).toBeSelected();
    } else {
      expect(button).not.toBeSelected();
    }
    expect(button.props.accessibilityLabel).toEqual(expect.any(String));
  }
}

beforeAll(async (): Promise<void> => {
  registerI18nextPlugin(initReactI18next);
  await initializeI18next({
    lng: "en",
    fallbackLng: "en",
    ns: ["transactions"],
    defaultNS: "transactions",
    resources: {
      en: { transactions: copy.en },
      ar: { transactions: copy.ar },
    },
    interpolation: { escapeValue: false },
  });
});
afterEach(async (): Promise<void> => {
  mockLanguage = "en";
  mockWindow = { width: 390, height: 844, fontScale: 1, scale: 1 };
  await changeLanguage("en");
  jest.clearAllMocks();
});

describe("#395 T058 — B1 R3 conditional panel composition", () => {
  it("R3-05 shows one compact region, QNB3/CIB1, currency issue and quiet default2", () => {
    const props = show("r3-combined-en");
    const qnb = requireGroup(
      { groups: props.groups, summary: props.summary },
      "QNB"
    );
    const cib = requireGroup(
      { groups: props.groups, summary: props.summary },
      "CIB"
    );
    expect(props.summary).toMatchObject({
      totalCount: 7,
      distinctNeedsReviewCount: 5,
      selectedCount: 2,
      pendingGroupCount: 2,
      defaultAssignmentCount: 2,
    });
    expect(screen.getAllByTestId("account-review-details-panel")).toHaveLength(
      1
    );
    expect(
      screen.getByTestId("account-review-group-card-" + qnb.groupId)
    ).toBeTruthy();
    expect(
      screen.getByTestId("account-review-group-card-" + cib.groupId)
    ).toBeTruthy();
    expect(screen.getByText("Confirm currency")).toBeTruthy();
    expect(screen.getByTestId("account-review-default-info")).toBeTruthy();
    expect(screen.queryByText("Confirm all")).toBeNull();
    assertThreeFilters("all");
    expect(screen.queryByTestId("account-review-select-ready")).toBeNull();
    expect(screen.getByTestId("account-review-clear-selection")).toBeTruthy();
    expect(
      screen.getByTestId("account-review-visible-count")
    ).toHaveTextContent("7 transactions");
  });

  it("R3-07 default-only has the quiet note without an empty details panel", () => {
    const props = show("r3-default-only");
    expect(props.summary).toMatchObject({
      totalCount: 2,
      distinctNeedsReviewCount: 0,
      selectedCount: 2,
      defaultAssignmentCount: 2,
    });
    expect(screen.queryByTestId("account-review-details-panel")).toBeNull();
    expect(screen.getByTestId("account-review-default-info")).toBeTruthy();
    fireEvent.press(screen.getByTestId("account-review-default-why-trigger"));
    expect(props.onDefaultWhyPress).toHaveBeenCalledTimes(1);
    expect(props.onSelectReady).not.toHaveBeenCalled();
  });

  it("R3-08 issues-only keeps four independent recoveries without blank group banners", () => {
    const props = show("r3-issues-only");
    expect(props.groups).toEqual([]);
    expect(props.summary).toMatchObject({
      totalCount: 4,
      distinctNeedsReviewCount: 4,
      selectedCount: 0,
    });
    expect(screen.getAllByTestId("account-review-details-panel")).toHaveLength(
      1
    );
    for (const issue of props.summary.issueLabels) {
      expect(screen.getByText(issue)).toBeTruthy();
    }
    expect(screen.queryByTestId("account-review-default-info")).toBeNull();
    expect(screen.queryByTestId("account-review-group-view-all")).toBeNull();
  });

  it("shows per-issue overlapping counts and sends a precise review recovery callback", () => {
    const base = propsFor("r3-issues-only");
    const onIssuePress = jest.fn();
    render(
      <AccountReviewPanel
        {...base}
        onIssuePress={onIssuePress}
        summary={{
          ...base.summary,
          issues: [
            {
              key: "account_review_issue_account",
              label: "Choose an account",
              count: 2,
            },
            {
              key: "account_review_issue_currency",
              label: "Confirm currency",
              count: 1,
            },
          ],
        }}
      />
    );
    const account = screen.getByTestId(
      "account-review-issue-account_review_issue_account"
    );
    expect(
      within(account).getByTestId("account-review-issue-count")
    ).toHaveTextContent("2 transactions");
    const action = screen.getByTestId(
      "account-review-issue-action-account_review_issue_account"
    );
    expect(action.props.accessibilityLabel).toContain("Choose");
    fireEvent.press(action);
    expect(onIssuePress).toHaveBeenCalledWith("account_review_issue_account");
    expect(base.onConfirm).not.toHaveBeenCalled();
  });

  it("R3-10 clean has no details or empty default container, but retains filter controls", () => {
    const props = show("r3-clean");
    expect(props.summary).toMatchObject({
      totalCount: 2,
      selectedCount: 2,
      distinctNeedsReviewCount: 0,
      defaultAssignmentCount: 0,
    });
    expect(screen.queryByTestId("account-review-details-panel")).toBeNull();
    expect(screen.queryByTestId("account-review-default-info")).toBeNull();
    expect(screen.queryByTestId("account-review-filter-empty")).toBeNull();
    assertThreeFilters("all");
  });

  it("R3-09 confirmed QNB/CIB displays read-only statuses, still independent changes", () => {
    const props = show("r3-confirmed-feedback");
    expect(props.summary).toMatchObject({
      totalCount: 4,
      distinctNeedsReviewCount: 0,
      selectedCount: 1,
      confirmedGroupCount: 2,
    });
    for (const group of props.groups) {
      expect(
        screen.getByTestId("account-review-group-status-" + group.groupId)
      ).toHaveTextContent("Confirmed");
      expect(
        screen.queryByTestId("account-review-group-confirm-" + group.groupId)
      ).toBeNull();
      fireEvent.press(
        screen.getByTestId("account-review-group-actions-" + group.groupId)
      );
      expect(
        screen.getByTestId("account-review-group-action-sheet")
      ).toBeTruthy();
      fireEvent.press(screen.getByTestId("account-review-group-edit"));
      expect(props.onEdit).toHaveBeenLastCalledWith(group.groupId);
    }
    expect(props.onSelectReady).not.toHaveBeenCalled();
  });

  it("R3-06 removal preserves the other group and exposes only its own Undo", () => {
    const props = show("r3-removed-undo");
    const removed = props.groups.find((group) => group.isRemoved);
    const pending = props.groups.find((group) => !group.isRemoved);
    if (!removed || !pending)
      throw new Error("Missing approved removed/pending pair");
    expect(
      screen.getByTestId("account-review-group-card-" + pending.groupId)
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId("account-review-group-undo"));
    expect(props.onUndo).toHaveBeenCalledTimes(1);
    expect(props.onUndo).toHaveBeenCalledWith(removed.groupId);
    expect(props.onRemove).not.toHaveBeenCalled();
    expect(props.summary.pendingGroupCount).toBe(1);
  });

  it("R3-11 empty Selected filter offers Show all, not the recorder no-result UI", () => {
    const props = show("r3-selected-empty", {
      filter: "selected",
      visibleRowIds: [],
    });
    expect(props.summary).toMatchObject({
      totalCount: 3,
      selectedCount: 0,
      distinctNeedsReviewCount: 0,
    });
    assertThreeFilters("selected");
    // Filtering does not hide the real unfiltered summary.
    expect(screen.getByTestId("account-review-details-panel")).toBeTruthy();
    expect(screen.getByTestId("account-review-filter-empty")).toBeTruthy();
    expect(screen.queryByTestId("voice-no-transactions")).toBeNull();
    expect(screen.queryByText("No transactions detected")).toBeNull();
    fireEvent.press(screen.getByTestId("account-review-show-all"));
    expect(props.onFilterChange).toHaveBeenCalledWith("all");
    expect(props.onSelectReady).not.toHaveBeenCalled();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});

describe("#395 T058 — parent-owned filters, selections and group actions", () => {
  it("one contextual bulk action selects ready rows, then becomes Clear after the parent updates", () => {
    const first = requireScene("r3-confirmed-feedback");
    const readyId = first.rows[1]?.rowId;
    if (!readyId) throw new Error("Missing confirmed unchecked fixture row");
    const props = propsFor("r3-confirmed-feedback", {
      readyVisibleRowIds: [readyId],
    });
    const view = render(<AccountReviewPanel {...props} />);
    fireEvent.press(screen.getByTestId("account-review-filter-needs_review"));
    fireEvent.press(screen.getByTestId("account-review-filter-selected"));
    expect(props.onFilterChange).toHaveBeenNthCalledWith(1, "needs_review");
    expect(props.onFilterChange).toHaveBeenNthCalledWith(2, "selected");
    assertThreeFilters("all");
    expect(screen.queryByTestId("account-review-clear-selection")).toBeNull();
    fireEvent.press(screen.getByTestId("account-review-select-ready"));
    expect(props.onSelectReady).toHaveBeenCalledTimes(1);
    // The parent/reducer owns selection readiness; no speculative local toggle.
    view.rerender(
      <AccountReviewPanel
        {...props}
        readyVisibleRowIds={[]}
        selectedVisibleCount={1}
      />
    );
    expect(screen.queryByTestId("account-review-select-ready")).toBeNull();
    fireEvent.press(screen.getByTestId("account-review-clear-selection"));
    expect(props.onClearSelection).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(props.onRemove).not.toHaveBeenCalled();
  });

  it("never offers Select ready merely because groups are pending", () => {
    const props = show("r3-combined-en", { readyVisibleRowIds: [] });
    expect(screen.queryByTestId("account-review-select-ready")).toBeNull();
    expect(screen.getByTestId("account-review-clear-selection")).toBeTruthy();
    expect(props.onSelectReady).not.toHaveBeenCalled();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("keeps the bulk action disabled when no rows are eligible or selected", () => {
    const props = show("r3-issues-only", { readyVisibleRowIds: [] });
    const button = screen.getByTestId("account-review-select-ready");
    expect(button).toBeDisabled();
    fireEvent.press(button);
    expect(props.onSelectReady).not.toHaveBeenCalled();
    expect(screen.queryByTestId("account-review-clear-selection")).toBeNull();
  });

  it("View all forwards only the parent callback and renders a scrollable six-group sheet", () => {
    const view = makeSixGroupViewAll();
    const props = propsFor("r3-combined-en", {
      groups: view.groups,
      summary: view.summary,
    });
    const rendered = render(<AccountReviewPanel {...props} />);
    fireEvent.press(screen.getByTestId("account-review-group-view-all"));
    expect(props.onViewAll).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("account-review-group-all-sheet")).toBeNull();
    rendered.rerender(<AccountReviewPanel {...props} isAllGroupsSheetOpen />);
    const sheet = screen.getByTestId("account-review-group-all-sheet");
    expect(sheet.props.accessibilityViewIsModal).toBe(true);
    expect(screen.UNSAFE_getAllByType(FlatList).length).toBeGreaterThan(0);
    expect(sheet.props.style).toEqual(
      expect.objectContaining({ paddingBottom: 28 })
    );
    fireEvent.press(within(sheet).getByText("Close"));
    expect(props.onCloseAllGroups).toHaveBeenCalledTimes(1);
  });

  it("one group Confirm is a callback only; no transaction check or Save side effect", () => {
    const props = show("r3-combined-en");
    const qnb = requireGroup(
      { groups: props.groups, summary: props.summary },
      "QNB"
    );
    fireEvent.press(
      screen.getByTestId("account-review-group-confirm-" + qnb.groupId)
    );
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).toHaveBeenCalledWith(qnb.groupId);
    expect(props.onSelectReady).not.toHaveBeenCalled();
    expect(props.summary.selectedCount).toBe(2);
    expect(
      screen.queryByTestId("account-review-group-confirmed-" + qnb.groupId)
    ).toBeNull();
  });
});

describe("#395 T058 — responsive, RTL, long-list and semantic-only coverage", () => {
  it.each([
    [390, 1],
    [340, 1],
    [390, 1.35],
    [600, 1.35],
  ])(
    "keeps actionable filters and long-group names at width %i font %s",
    (width, fontScale) => {
      mockWindow = { width, height: 844, fontScale, scale: 1 };
      const scene = makeSixGroupViewAll();
      const longName =
        "Synthetic Bank with long account nickname 1234 — groceries";
      const groups = scene.groups.map((group, index) =>
        index === 1 ? { ...group, displayName: longName } : group
      );
      show("r3-combined-en", { groups, summary: scene.summary });
      expect(
        screen.getByText(longName + " · " + groups[1]?.currencyLabel)
      ).toBeTruthy();
      expect(screen.getByTestId("account-review-filter-selected")).toBeTruthy();
      expect(screen.getByTestId("account-review-clear-selection")).toBeTruthy();
      expect(
        screen.getByTestId("account-review-group-actions-" + groups[0]?.groupId)
      ).toHaveProp("accessibilityRole", "button");
      // Layout geometry and real overflow remain owner-rendered NOT RUN.
    }
  );

  it("R3-15 Arabic mirrors controlled filters and retains scoped group labels", async () => {
    mockLanguage = "ar";
    await changeLanguage("ar");
    const props = show("r3-combined-ar");
    expect(props.summary).toMatchObject({
      totalCount: 7,
      distinctNeedsReviewCount: 5,
      selectedCount: 2,
    });
    assertThreeFilters("all");
    expect(screen.getByText("تفاصيل للمراجعة")).toBeTruthy();
    for (const group of props.groups) {
      expect(
        screen.getByTestId("account-review-group-card-" + group.groupId)
      ).toBeTruthy();
    }
    fireEvent.press(screen.getByTestId("account-review-filter-selected"));
    expect(props.onFilterChange).toHaveBeenCalledWith("selected");
  });

  it("keeps bottom-inset sheet semantics without putting alpha NativeWind classes on TouchableOpacity", () => {
    const props = show("r3-default-only", { isWhySheetOpen: true });
    const modal = screen.UNSAFE_getAllByType(Modal);
    expect(modal.length).toBeGreaterThan(0);
    const scrollable = screen.getByTestId("account-review-default-why-sheet");
    expect(scrollable.props.style).toEqual(
      expect.objectContaining({ paddingBottom: 28 })
    );
    for (const target of screen.UNSAFE_getAllByType(TouchableOpacity)) {
      const styles = String(target.props.className ?? "");
      expect(styles).not.toMatch(
        /\b(?:bg-[\w-]+\/\d+|opacity-\d+|shadow-[\w-]+)/
      );
    }
    expect(props.onDefaultWhyPress).not.toHaveBeenCalled();
  });
});
