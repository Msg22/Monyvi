/**
 * #395 post-implementation compact AccountReviewPanel regression coverage.
 * Exercises real presentation with current translations and approved fixtures.
 * Parent supplies authoritative counts/row IDs and command callbacks.
 * Jest is NOT native layout, keyboard, focus or screen-reader evidence.
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
import { Modal, TouchableOpacity } from "react-native";
import enTransactions from "@/locales/en/transactions.json";
import arTransactions from "@/locales/ar/transactions.json";
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
type ReviewVisibleTab = ReviewFilter | "account_needed";

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
          issueLabels: ["Account needed", "Check amount", "Choose a category"],
          issues: [
            {
              key: "account_review_issue_account",
              label: "Account needed",
              count: 2,
            },
            {
              key: "account_review_issue_amount",
              label: "Check amount",
              count: 1,
            },
            {
              key: "account_review_issue_category",
              label: "Choose a category",
              count: 1,
            },
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
  | "onDiscardRemoved"
  | "onViewLinked"
  | "onIssuePress"
  | "onAccountNeededPress"
  | "onShowAll"
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
    onDiscardRemoved: jest.fn<void, [groupId: string]>(),
    onViewLinked: jest.fn<void, [groupId: string]>(),
    onIssuePress: jest.fn(),
    onAccountNeededPress: jest.fn<void, []>(),
    onShowAll: jest.fn<void, []>(),
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
    // Source-row union, not the sum of overlapping currency/account issue counts.
    accountNeededCount:
      view.summary.issues?.find(
        (issue) => issue.key === "account_review_issue_account"
      )?.count ?? 0,
    accountNeededActive: false,
    temporaryScopeActive: false,
    linkedGroupName: null,
    temporaryRowCount: 0,
    defaultAccountName: view.summary.defaultAssignmentCount > 0 ? "Cash" : null,
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

function openDetails(): void {
  const toggle = screen.getByTestId("account-review-compact-summary-toggle");
  expect(toggle).toHaveProp("accessibilityState", { expanded: false });
  fireEvent.press(toggle);
  expect(toggle).toHaveProp("accessibilityState", { expanded: true });
}

function assertFourTabs(
  current: ReviewVisibleTab | null,
  temporarilyFiltered = false
): void {
  const filters: readonly ReviewVisibleTab[] = [
    "all",
    "needs_review",
    "account_needed",
    "selected",
  ];
  for (const tab of filters) {
    const button = screen.getByTestId("account-review-filter-" + tab);
    expect(button).toHaveProp("accessibilityRole", "button");
    expect(button.props.accessibilityLabel).toEqual(expect.any(String));
    const selected =
      tab === current && (!temporarilyFiltered || tab === "account_needed");
    if (selected) expect(button).toBeSelected();
    else expect(button).not.toBeSelected();
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
      en: { transactions: enTransactions },
      ar: { transactions: arTransactions },
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
  it("R3-05 starts collapsed, then shows QNB3/CIB1 with Account needed in the fourth tab", () => {
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
    expect(screen.getByTestId("account-review-details-panel")).toBeTruthy();
    expect(screen.getByText("2 accounts need review")).toBeTruthy();
    expect(
      screen.queryByTestId("account-review-group-card-" + qnb.groupId)
    ).toBeNull();
    openDetails();
    expect(
      screen.getByTestId("account-review-group-card-" + qnb.groupId)
    ).toBeTruthy();
    expect(
      screen.getByTestId("account-review-group-card-" + cib.groupId)
    ).toBeTruthy();
    expect(screen.queryByTestId("account-review-compact-issues")).toBeNull();
    expect(props.accountNeededCount).toBe(1);
    expect(
      screen.getByTestId("account-review-filter-account_needed")
    ).toHaveProp("accessibilityLabel", "Account needed (1)");
    expect(screen.getByTestId("account-review-default-info")).toBeTruthy();
    assertFourTabs("all");
    expect(screen.getByTestId("account-review-clear-selection")).toBeTruthy();
    expect(
      screen.getByTestId("account-review-visible-count")
    ).toHaveTextContent("7 transactions");
    expect(screen.queryByTestId("account-review-group-view-all")).toBeNull();
  });

  it("default-only keeps quiet Why with a collapsed reviewed summary", () => {
    const props = show("r3-default-only");
    expect(props.summary).toMatchObject({
      totalCount: 2,
      distinctNeedsReviewCount: 0,
      selectedCount: 2,
      defaultAssignmentCount: 2,
    });
    expect(screen.getByText("Accounts reviewed")).toBeTruthy();
    expect(screen.getByTestId("account-review-default-info")).toBeTruthy();
    fireEvent.press(screen.getByTestId("account-review-default-why-trigger"));
    expect(props.onDefaultWhyPress).toHaveBeenCalledTimes(1);
    expect(props.onSelectReady).not.toHaveBeenCalled();
  });

  it("issues-only keeps amount/category inline while account/currency recovery belongs to fourth tab", () => {
    const props = show("r3-issues-only");
    expect(props.groups).toEqual([]);
    expect(props.summary).toMatchObject({
      totalCount: 4,
      distinctNeedsReviewCount: 4,
      selectedCount: 0,
    });
    expect(screen.getByText("2 transactions need an account")).toBeTruthy();
    openDetails();
    const issues = within(screen.getByTestId("account-review-compact-issues"));
    expect(issues.getByText("Check amount")).toBeTruthy();
    expect(issues.getByText("Choose a category")).toBeTruthy();
    expect(issues.queryByText("Account needed")).toBeNull();
    expect(issues.queryByText("Confirm currency")).toBeNull();
    expect(props.accountNeededCount).toBe(2);
    expect(
      screen.getByTestId("account-review-filter-account_needed")
    ).toHaveProp("accessibilityLabel", "Account needed (2)");
    expect(screen.queryByTestId("account-review-default-info")).toBeNull();
    expect(screen.queryByTestId("account-review-group-view-all")).toBeNull();
  });

  it("fourth-tab account recovery and inline category recovery invoke distinct scoped callbacks", () => {
    const props = show("r3-issues-only");
    openDetails();
    const accountTab = screen.getByTestId(
      "account-review-filter-account_needed"
    );
    expect(accountTab).toHaveProp("accessibilityRole", "button");
    expect(accountTab).toHaveProp("accessibilityLabel", "Account needed (2)");
    fireEvent.press(accountTab);
    expect(props.onAccountNeededPress).toHaveBeenCalledTimes(1);
    expect(props.onIssuePress).not.toHaveBeenCalled();
    const issues = within(screen.getByTestId("account-review-compact-issues"));
    expect(issues.queryByLabelText("Account needed")).toBeNull();
    const categoryAction = issues.getByLabelText("Choose a category");
    expect(categoryAction).toHaveProp("accessibilityRole", "button");
    fireEvent.press(categoryAction);
    expect(props.onIssuePress).toHaveBeenCalledTimes(1);
    expect(props.onIssuePress).toHaveBeenCalledWith(
      "account_review_issue_category"
    );
    expect(props.onFilterChange).not.toHaveBeenCalled();
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(props.onSelectReady).not.toHaveBeenCalled();
    expect(props.onClearSelection).not.toHaveBeenCalled();
  });

  it("clean state has reviewed summary and filters without invented groups/default", () => {
    const props = show("r3-clean");
    expect(props.summary).toMatchObject({
      totalCount: 2,
      selectedCount: 2,
      distinctNeedsReviewCount: 0,
      defaultAssignmentCount: 0,
    });
    expect(screen.getByText("Accounts reviewed")).toBeTruthy();
    expect(screen.queryByTestId("account-review-default-info")).toBeNull();
    expect(screen.queryByTestId("account-review-filter-empty")).toBeNull();
    assertFourTabs("all");
  });

  it("confirmed QNB/CIB expose direct Change without reopening group confirmation", () => {
    const props = show("r3-confirmed-feedback");
    expect(props.summary).toMatchObject({
      totalCount: 4,
      selectedCount: 1,
      confirmedGroupCount: 2,
    });
    openDetails();
    for (const group of props.groups) {
      expect(
        screen.getByTestId("account-review-group-status-" + group.groupId)
      ).toHaveTextContent("Confirmed");
      expect(
        screen.queryByTestId("account-review-group-confirm-" + group.groupId)
      ).toBeNull();
      fireEvent.press(
        screen.getByTestId("account-review-group-change-" + group.groupId)
      );
      expect(props.onReplace).toHaveBeenLastCalledWith(group.groupId);
    }
    expect(props.onSelectReady).not.toHaveBeenCalled();
  });

  it("removed ghost keeps other group, Undo and real Discard callback distinct", () => {
    const props = show("r3-removed-undo");
    const removed = props.groups.find((g) => g.isRemoved);
    const pending = props.groups.find((g) => !g.isRemoved);
    if (!removed || !pending) throw new Error("Missing removed/pending pair");
    openDetails();
    expect(
      screen.getByTestId("account-review-group-card-" + pending.groupId)
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId("account-review-group-undo"));
    expect(props.onUndo).toHaveBeenCalledTimes(1);
    expect(props.onUndo).toHaveBeenCalledWith(removed.groupId);
    fireEvent.press(
      screen.getByTestId("account-review-group-discard-" + removed.groupId)
    );
    expect(props.onDiscardRemoved).toHaveBeenCalledWith(removed.groupId);
    expect(props.onRemove).not.toHaveBeenCalled();
  });

  it("fourth Account needed tab is a temporary scoped action and keeps canonical filters untouched", () => {
    const props = show("r3-combined-en");
    const accountNeeded = screen.getByTestId(
      "account-review-filter-account_needed"
    );
    expect(accountNeeded).toHaveProp(
      "accessibilityLabel",
      "Account needed (1)"
    );
    assertFourTabs("all");
    fireEvent.press(accountNeeded);
    expect(props.onAccountNeededPress).toHaveBeenCalledTimes(1);
    expect(props.onFilterChange).not.toHaveBeenCalled();
    expect(props.onSelectReady).not.toHaveBeenCalled();
    expect(props.onClearSelection).not.toHaveBeenCalled();
  });

  it("temporary Account needed uses distinct source-row union, hides toolbar, and preserves global Selected count", () => {
    const original = propsFor("r3-issues-only");
    const props = show("r3-issues-only", {
      accountNeededActive: true,
      temporaryScopeActive: true,
      accountNeededCount: 2,
      temporaryRowCount: 2,
      selectedVisibleCount: 0,
      summary: {
        ...original.summary,
        selectedCount: 1,
        issues: [
          {
            key: "account_review_issue_account",
            label: "Account needed",
            count: 2,
          },
          {
            key: "account_review_issue_currency",
            label: "Confirm currency",
            count: 1,
          },
          {
            key: "account_review_issue_category",
            label: "Choose a category",
            count: 1,
          },
        ],
      },
    });
    assertFourTabs("account_needed", true);
    expect(
      screen.getByTestId("account-review-filter-account_needed")
    ).toHaveProp("accessibilityLabel", "Account needed (2)");
    expect(screen.getByTestId("account-review-filter-selected")).toHaveProp(
      "accessibilityLabel",
      "Selected (1)"
    );
    expect(screen.getByText("2 transactions need an account")).toBeTruthy();
    expect(screen.queryByTestId("account-review-selection-toolbar")).toBeNull();
    openDetails();
    expect(screen.queryByText("Account needed")).toBeNull();
    expect(
      within(screen.getByTestId("account-review-compact-issues")).getByText(
        "Choose a category"
      )
    ).toBeTruthy();
    expect(props.onSelectReady).not.toHaveBeenCalled();
    expect(props.onClearSelection).not.toHaveBeenCalled();
  });

  it("zero Account needed count has an honest empty state and does not offer a false selection", () => {
    const props = show("r3-clean", {
      accountNeededActive: true,
      temporaryScopeActive: true,
      accountNeededCount: 0,
      temporaryRowCount: 0,
    });
    assertFourTabs("account_needed", true);
    expect(
      screen.getByTestId("account-review-filter-account_needed")
    ).toHaveProp("accessibilityLabel", "Account needed (0)");
    expect(
      screen.getByTestId("account-review-account-needed-empty")
    ).toHaveTextContent("No transactions need an account right now.");
    expect(screen.queryByTestId("account-review-selection-toolbar")).toBeNull();
    expect(props.onSelectReady).not.toHaveBeenCalled();
  });

  it("linked-group temporary scope discloses its own count and Show all restores via parent", () => {
    const props = show("r3-combined-en", {
      temporaryScopeActive: true,
      accountNeededActive: false,
      linkedGroupName: "QNB",
      temporaryRowCount: 3,
    });
    assertFourTabs(null, true);
    const header = screen.getByTestId(
      "account-review-linked-transactions-only"
    );
    expect(
      within(header).getByText("Showing 3 transactions linked to QNB")
    ).toBeTruthy();
    expect(screen.queryByTestId("account-review-selection-toolbar")).toBeNull();
    fireEvent.press(
      within(header).getByTestId("account-review-account-needed-show-all")
    );
    expect(props.onShowAll).toHaveBeenCalledTimes(1);
    expect(props.onFilterChange).not.toHaveBeenCalled();
    expect(props.onSelectReady).not.toHaveBeenCalled();
    expect(props.onClearSelection).not.toHaveBeenCalled();
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
    assertFourTabs("selected");
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
    assertFourTabs("all");
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

  it("renders all six groups inline without View all and scopes one menu callback", () => {
    const view = makeSixGroupViewAll();
    const props = show("r3-combined-en", {
      groups: view.groups,
      summary: view.summary,
    });
    openDetails();
    for (const group of view.groups) {
      expect(
        screen.getByTestId("account-review-group-card-" + group.groupId)
      ).toBeTruthy();
    }
    expect(screen.queryByTestId("account-review-group-all-sheet")).toBeNull();
    const target = view.groups[1];
    const other = view.groups[2];
    if (!target || !other) throw new Error("Missing synthetic group pair");
    fireEvent.press(
      screen.getByTestId("account-review-group-actions-" + target.groupId)
    );
    fireEvent.press(
      within(
        screen.getByTestId("account-review-group-inline-menu")
      ).getByTestId("account-review-group-edit")
    );
    expect(props.onEdit).toHaveBeenCalledTimes(1);
    expect(props.onEdit).toHaveBeenCalledWith(target.groupId);
    expect(props.onEdit).not.toHaveBeenCalledWith(other.groupId);
  });

  it("one group Confirm is a callback only; no transaction check or Save side effect", () => {
    const props = show("r3-combined-en");
    const qnb = requireGroup(
      { groups: props.groups, summary: props.summary },
      "QNB"
    );
    openDetails();
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
      openDetails();
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
    assertFourTabs("all");
    expect(screen.getByText("حسابان يحتاجان مراجعة")).toBeTruthy();
    openDetails();
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
