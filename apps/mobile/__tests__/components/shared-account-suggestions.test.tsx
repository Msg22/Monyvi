/**
 * #395 T026/T031 B1 shared-group presentation/action tests.
 * Exercises the real T031 presentation components; never mocks the SUT.
 * Callback assertions do not claim a canonical reducer, DB, or Save effect.
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
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
} from "react-native";
import { SharedAccountSuggestions } from "@/components/transaction-review/SharedAccountSuggestions";
import { EditSuggestedAccountSheet } from "@/components/transaction-review/EditSuggestedAccountSheet";
import { TransactionItem } from "@/components/transaction-review/TransactionItem";
import {
  B1_TYPE_OPTIONS,
  makeSharedPresentation,
  makeSixGroupViewAll,
  makeTestReviewTransaction,
  requireGroup,
  withGroup,
  type SharedPresentationFixture,
} from "./shared-account-suggestions-test-fixtures";

jest.mock("@/hooks/useModalBottomInset", () => ({
  useModalBottomInset: (): number => 28,
}));
jest.mock("@/components/institutions/InstitutionLogoMark", () => ({
  InstitutionLogoMark: (): null => null,
}));
jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): null => null,
}));
let mockLocale: "en" | "ar" = "en";
jest.mock("@/context/CategoriesContext", () => ({
  useCategoryLookup: (): ReadonlyMap<string, never> => new Map<string, never>(),
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: "en" | "ar" } => ({
    language: mockLocale,
  }),
}));

const messages = {
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
  },
} as const;

type GroupActions = Pick<
  ComponentProps<typeof SharedAccountSuggestions>,
  | "onConfirm"
  | "onEdit"
  | "onReplace"
  | "onRemove"
  | "onUndo"
  | "onViewAll"
  | "onCloseAllGroups"
>;

function makeActions(): GroupActions {
  return {
    onConfirm: jest.fn<void, [groupId: string]>(),
    onEdit: jest.fn<void, [groupId: string]>(),
    onReplace: jest.fn<void, [groupId: string]>(),
    onRemove: jest.fn<void, [groupId: string]>(),
    onUndo: jest.fn<void, [groupId: string]>(),
    onViewAll: jest.fn<void, []>(),
    onCloseAllGroups: jest.fn<void, []>(),
  };
}

function renderGroups(
  view: SharedPresentationFixture,
  actions: GroupActions = makeActions(),
  isAllGroupsSheetOpen = false
): GroupActions {
  render(
    <SharedAccountSuggestions
      groups={view.groups}
      summary={view.summary}
      isAllGroupsSheetOpen={isAllGroupsSheetOpen}
      isBusy={false}
      {...actions}
    />
  );
  return actions;
}

interface EditProps {
  readonly visible: boolean;
  readonly groupId: string;
  readonly groupName: string;
  readonly currentTypeOptionId: string;
  readonly allowedTypeOptions: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
  }>;
  readonly lockedCurrencyLabel: string;
  readonly identitySummary: string;
  readonly linkedCount: number;
  readonly canSubmit: boolean;
  readonly isBusy: boolean;
  readonly validationMessage: string | null;
  readonly onSubmit: (value: {
    readonly name: string;
    readonly typeOptionId: string;
  }) => void;
  readonly onReplace: () => void;
  readonly onCancel: () => void;
}
function makeEditProps(overrides: Partial<EditProps> = {}): EditProps {
  const qnb = requireGroup(makeSharedPresentation("r3-combined-en"), "QNB");
  return {
    visible: true,
    groupId: qnb.groupId,
    groupName: qnb.displayName,
    currentTypeOptionId: "BANK",
    allowedTypeOptions: B1_TYPE_OPTIONS,
    lockedCurrencyLabel: "EGP",
    identitySummary: qnb.identitySummary,
    linkedCount: 3,
    canSubmit: true,
    isBusy: false,
    validationMessage: null,
    onSubmit: jest.fn(),
    onReplace: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
}
function showEdit(props: EditProps = makeEditProps()): void {
  render(<EditSuggestedAccountSheet {...props} />);
}

beforeAll(async (): Promise<void> => {
  registerI18nextPlugin(initReactI18next);
  await initializeI18next({
    lng: "en",
    fallbackLng: "en",
    ns: ["transactions"],
    defaultNS: "transactions",
    resources: {
      en: { transactions: messages.en },
      ar: { transactions: messages.ar },
    },
    interpolation: { escapeValue: false },
  });
});
afterEach(async (): Promise<void> => {
  mockLocale = "en";
  await changeLanguage("en");
  jest.clearAllMocks();
});

describe("T026 US2: R3-05 combined independent group cards", () => {
  it("renders 7 total, 5 distinct review rows, 2 selected and QNB3/CIB1 separately", () => {
    const view = makeSharedPresentation("r3-combined-en");
    const qnb = requireGroup(view, "QNB");
    const cib = requireGroup(view, "CIB");
    expect(view.summary).toEqual(
      expect.objectContaining({
        totalCount: 7,
        distinctNeedsReviewCount: 5,
        selectedCount: 2,
        defaultAssignmentCount: 2,
        pendingGroupCount: 2,
      })
    );
    renderGroups(view);
    expect(screen.getByTestId("account-review-details-panel")).toBeTruthy();
    expect(
      screen.getByTestId("account-review-group-card-" + qnb.groupId)
    ).toBeTruthy();
    expect(
      screen.getByTestId("account-review-group-card-" + cib.groupId)
    ).toBeTruthy();
    expect(
      screen.getByTestId("account-review-group-disclosure-" + qnb.groupId)
    ).toHaveTextContent(/\ball 3\b/);
    expect(
      screen.getByTestId("account-review-group-disclosure-" + cib.groupId)
    ).toHaveTextContent(/\b1 transaction\b/);
    expect(screen.getByText("Confirm currency")).toBeTruthy();
    expect(screen.queryByText("Confirm all")).toBeNull();
  });

  it("QNB Confirm invokes only the QNB callback without touching CIB or row selection", () => {
    const view = makeSharedPresentation("r3-combined-en");
    const qnb = requireGroup(view, "QNB");
    const cib = requireGroup(view, "CIB");
    const actions = renderGroups(view);
    const confirm = screen.getByTestId(
      "account-review-group-confirm-" + qnb.groupId
    );
    expect(confirm).toHaveProp("accessibilityRole", "button");
    expect(confirm).toHaveProp(
      "accessibilityLabel",
      expect.stringContaining("QNB")
    );
    fireEvent.press(confirm);
    expect(actions.onConfirm).toHaveBeenCalledTimes(1);
    expect(actions.onConfirm).toHaveBeenCalledWith(qnb.groupId);
    expect(actions.onConfirm).not.toHaveBeenCalledWith(cib.groupId);
    expect(actions.onEdit).not.toHaveBeenCalled();
    expect(actions.onRemove).not.toHaveBeenCalled();
    expect(actions.onReplace).not.toHaveBeenCalled();
  });

  it("shows confirmed read-only status only after new shaped props; Change stays available", () => {
    const first = makeSharedPresentation("r3-combined-en");
    const qnb = requireGroup(first, "QNB");
    const actions = makeActions();
    const original = render(
      <SharedAccountSuggestions
        groups={first.groups}
        summary={first.summary}
        isAllGroupsSheetOpen={false}
        isBusy={false}
        {...actions}
      />
    );
    const confirmed = withGroup(first, qnb.groupId, {
      isConfirmed: true,
      isRemoved: false,
      canConfirm: false,
      statusLabel: "Confirmed",
      canEdit: true,
      canReplace: true,
    });
    original.rerender(
      <SharedAccountSuggestions
        groups={confirmed.groups}
        summary={confirmed.summary}
        isAllGroupsSheetOpen={false}
        isBusy={false}
        {...actions}
      />
    );
    expect(
      screen.getByTestId("account-review-group-status-" + qnb.groupId)
    ).toHaveTextContent("Confirmed");
    expect(
      screen.queryByTestId("account-review-group-confirm-" + qnb.groupId)
    ).toBeNull();
    expect(
      screen.getByTestId("account-review-group-actions-" + qnb.groupId)
    ).toBeTruthy();
    expect(actions.onConfirm).not.toHaveBeenCalled();
  });

  it("keeps existing row checkbox independent from group-confirm and group menu actions", () => {
    const view = makeSharedPresentation("r3-combined-en");
    const qnb = requireGroup(view, "QNB");
    const actions = makeActions();
    const onToggleSelect = jest.fn<void, [number]>();
    render(
      <>
        <SharedAccountSuggestions
          groups={view.groups}
          summary={view.summary}
          isAllGroupsSheetOpen={false}
          isBusy={false}
          {...actions}
        />
        <TransactionItem
          transaction={makeTestReviewTransaction()}
          index={0}
          isSelected={false}
          accountName="QNB Everyday"
          onToggleSelect={onToggleSelect}
          onPress={jest.fn()}
        />
      </>
    );
    fireEvent.press(
      screen.getByTestId("account-review-group-confirm-" + qnb.groupId)
    );
    expect(actions.onConfirm).toHaveBeenCalledWith(qnb.groupId);
    expect(onToggleSelect).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole("checkbox"));
    expect(onToggleSelect).toHaveBeenCalledWith(0);
    expect(actions.onConfirm).toHaveBeenCalledTimes(1);
    // T024/T025/T030 must prove the real combined reducer transition.
  });

  it.each([
    ["edit", "account-review-group-edit", "onEdit"],
    ["replace", "account-review-group-replace", "onReplace"],
    ["remove", "account-review-group-remove", "onRemove"],
  ] as const)(
    "QNB %s menu action invokes only its scoped callback",
    (_name, targetId, key) => {
      const view = makeSharedPresentation("r3-combined-en");
      const qnb = requireGroup(view, "QNB");
      const cib = requireGroup(view, "CIB");
      const actions = renderGroups(view);
      fireEvent.press(
        screen.getByTestId("account-review-group-actions-" + qnb.groupId)
      );
      expect(
        screen.getByTestId("account-review-group-action-sheet")
      ).toBeTruthy();
      fireEvent.press(screen.getByTestId(targetId));
      expect(actions[key]).toHaveBeenCalledTimes(1);
      expect(actions[key]).toHaveBeenCalledWith(qnb.groupId);
      expect(actions[key]).not.toHaveBeenCalledWith(cib.groupId);
      expect(actions.onConfirm).not.toHaveBeenCalled();
    }
  );

  it("CIB menu retains a separate group scope and never invokes QNB action", () => {
    const view = makeSharedPresentation("r3-combined-en");
    const qnb = requireGroup(view, "QNB");
    const cib = requireGroup(view, "CIB");
    const actions = renderGroups(view);
    fireEvent.press(
      screen.getByTestId("account-review-group-actions-" + cib.groupId)
    );
    fireEvent.press(screen.getByTestId("account-review-group-edit"));
    expect(actions.onEdit).toHaveBeenCalledWith(cib.groupId);
    expect(actions.onEdit).not.toHaveBeenCalledWith(qnb.groupId);
    expect(actions.onConfirm).not.toHaveBeenCalled();
  });

  it("keeps a multi-reason category/amount/currency issue visible after confirmation callback", () => {
    const base = makeSharedPresentation("r3-combined-en");
    const view = {
      ...base,
      summary: {
        ...base.summary,
        issueLabels: ["Confirm currency", "Check amount", "Choose a category"],
      },
    };
    const actions = renderGroups(view);
    fireEvent.press(
      screen.getByTestId(
        "account-review-group-confirm-" + requireGroup(view, "QNB").groupId
      )
    );
    expect(actions.onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Confirm currency")).toBeTruthy();
    expect(screen.getByText("Check amount")).toBeTruthy();
    expect(screen.getByText("Choose a category")).toBeTruthy();
  });
});

describe("T026 US2: distinct confirmed, removed, blocked and full-list states", () => {
  it("uses R3-09 4/0/1 rather than mutating the combined 7/5/2 fixture", () => {
    const view = makeSharedPresentation("r3-confirmed-feedback");
    expect(view.summary).toEqual(
      expect.objectContaining({
        totalCount: 4,
        distinctNeedsReviewCount: 0,
        selectedCount: 1,
        confirmedGroupCount: 2,
      })
    );
    const qnb = requireGroup(view, "QNB");
    const cib = requireGroup(view, "CIB");
    renderGroups(view);
    expect(
      screen.getByTestId("account-review-group-status-" + qnb.groupId)
    ).toHaveTextContent("Confirmed");
    expect(
      screen.getByTestId("account-review-group-status-" + cib.groupId)
    ).toHaveTextContent("Confirmed");
    expect(screen.queryByText("Confirm all")).toBeNull();
  });

  it("shows R3-06 removed QNB2 recovery without hiding CIB1 or Cash1 selection", () => {
    const view = makeSharedPresentation("r3-removed-undo");
    const qnb = requireGroup(view, "QNB");
    const cib = requireGroup(view, "CIB");
    expect(view.summary).toEqual(
      expect.objectContaining({
        totalCount: 4,
        distinctNeedsReviewCount: 3,
        selectedCount: 1,
      })
    );
    expect(qnb.linkedCount).toBe(2);
    expect(qnb.isRemoved).toBe(true);
    expect(cib.canConfirm).toBe(true);
    const actions = renderGroups(view);
    expect(
      screen.getByTestId("account-review-group-status-" + qnb.groupId)
    ).toHaveTextContent("Removed");
    expect(
      screen.getByTestId("account-review-group-card-" + cib.groupId)
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId("account-review-group-undo"));
    expect(actions.onUndo).toHaveBeenCalledWith(qnb.groupId);
    expect(actions.onConfirm).not.toHaveBeenCalled();
  });

  it("withdraws outdated Undo when the facade marks its token ineligible", () => {
    const base = makeSharedPresentation("r3-removed-undo");
    const qnb = requireGroup(base, "QNB");
    const view = withGroup(base, qnb.groupId, { canUndo: false });
    const actions = renderGroups(view);
    expect(
      screen.getByTestId("account-review-group-status-" + qnb.groupId)
    ).toHaveTextContent("Removed");
    const undo = screen.queryByTestId("account-review-group-undo");
    if (undo) {
      expect(undo).toHaveProp(
        "accessibilityState",
        expect.objectContaining({ disabled: true })
      );
      fireEvent.press(undo);
    }
    expect(actions.onUndo).not.toHaveBeenCalled();
    // Actual stale-token reject and atomic row rollback belong T024/T025.
  });

  it("exposes six R2-03 groups through a scrollable View all sheet without a first-N cutoff", () => {
    const view = makeSixGroupViewAll();
    expect(view.groups).toHaveLength(6);
    expect(
      view.groups
        .map((group) => group.linkedCount)
        .reduce((sum, n) => sum + n, 0)
    ).toBe(10);
    const actions = makeActions();
    const renderResult = render(
      <SharedAccountSuggestions
        groups={view.groups}
        summary={view.summary}
        isAllGroupsSheetOpen={false}
        isBusy={false}
        {...actions}
      />
    );
    fireEvent.press(screen.getByTestId("account-review-group-view-all"));
    expect(actions.onViewAll).toHaveBeenCalledTimes(1);
    renderResult.rerender(
      <SharedAccountSuggestions
        groups={view.groups}
        summary={view.summary}
        isAllGroupsSheetOpen
        isBusy={false}
        {...actions}
      />
    );
    expect(screen.getByTestId("account-review-group-all-sheet")).toBeTruthy();
    expect(
      screen
        .UNSAFE_getAllByType(FlatList)
        .some(
          (list) =>
            Array.isArray(list.props.data) && list.props.data.length === 6
        )
    ).toBe(true);
    const last = view.groups[5];
    if (!last) throw new Error("Missing sixth approved test group");
    expect(
      screen.getAllByTestId("account-review-group-card-" + last.groupId).length
    ).toBeGreaterThan(0);
    expect(actions.onConfirm).not.toHaveBeenCalled();
  });

  it("Remove from a View all group menu calls onRemove without closing the sheet", () => {
    const view = makeSixGroupViewAll();
    const targetGroup = view.groups[1];
    if (!targetGroup) throw new Error("Missing target group");
    const otherGroup = view.groups[2];
    if (!otherGroup) throw new Error("Missing other group");
    const actions = makeActions();
    render(
      <SharedAccountSuggestions
        groups={view.groups}
        summary={view.summary}
        isAllGroupsSheetOpen={true}
        isBusy={false}
        {...actions}
      />
    );
    const allSheet = screen.getByTestId("account-review-group-all-sheet");
    expect(allSheet).toBeTruthy();
    const sheetQuery = within(allSheet);
    fireEvent.press(
      sheetQuery.getByTestId(
        "account-review-group-actions-" + targetGroup.groupId
      )
    );
    fireEvent.press(sheetQuery.getByTestId("account-review-group-remove"));
    expect(actions.onRemove).toHaveBeenCalledTimes(1);
    expect(actions.onRemove).toHaveBeenCalledWith(targetGroup.groupId);
    expect(actions.onRemove).not.toHaveBeenCalledWith(otherGroup.groupId);
    expect(actions.onCloseAllGroups).not.toHaveBeenCalled();
    expect(screen.getByTestId("account-review-group-all-sheet")).toBeTruthy();
    expect(
      sheetQuery.getByTestId("account-review-group-card-" + otherGroup.groupId)
    ).toBeTruthy();
  });

  it("does not show an empty shared-group details region for default-only or clean state", () => {
    const emptyStates = [
      makeSharedPresentation("r3-default-only"),
      makeSharedPresentation("r3-clean"),
    ];
    for (const view of emptyStates) {
      const rendered = render(
        <SharedAccountSuggestions
          groups={view.groups}
          summary={view.summary}
          isAllGroupsSheetOpen={false}
          isBusy={false}
          {...makeActions()}
        />
      );
      expect(screen.queryByTestId("account-review-details-panel")).toBeNull();
      rendered.unmount();
    }
  });

  it("keeps unresolved currency issue actionable without suggesting or auto-confirming an account", () => {
    const view = makeSharedPresentation("r3-currency-conflict");
    const actions = renderGroups(view);
    expect(view.groups).toHaveLength(0);
    expect(view.summary.distinctNeedsReviewCount).toBe(1);
    expect(screen.getByText("Confirm currency")).toBeTruthy();
    expect(screen.queryByText("Confirm all")).toBeNull();
    expect(actions.onConfirm).not.toHaveBeenCalled();
  });

  it("never enables Confirm for a group with incomplete/currency-blocked evidence", () => {
    const first = makeSharedPresentation("r3-combined-en");
    const qnb = requireGroup(first, "QNB");
    const view = withGroup(first, qnb.groupId, {
      canConfirm: false,
      isBusy: false,
      statusLabel: "Needs currency confirmation",
    });
    const actions = renderGroups(view);
    expect(
      screen.getByTestId("account-review-group-card-" + qnb.groupId)
    ).toBeTruthy();
    const confirm = screen.queryByTestId(
      "account-review-group-confirm-" + qnb.groupId
    );
    if (confirm) {
      expect(confirm).toHaveProp(
        "accessibilityState",
        expect.objectContaining({ disabled: true })
      );
      fireEvent.press(confirm);
    }
    expect(actions.onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm currency")).toBeTruthy();
  });

  it("retains masked identity, wraps long names and uses semantic dark theme classes", () => {
    const base = makeSharedPresentation("r3-combined-en");
    const qnb = requireGroup(base, "QNB");
    const name = "QNB Everyday - اسم حساب طويل للغاية for account ending 0007";
    const view = withGroup(base, qnb.groupId, { displayName: name });
    renderGroups(view);
    expect(screen.getByText(name + " · " + qnb.currencyLabel)).toBeTruthy();
    expect(screen.getByText(/•••• 0007/)).toBeTruthy();
    expect(screen.getByTestId("account-review-details-panel")).toHaveProp(
      "className",
      expect.stringContaining("dark:")
    );
    // This is only semantic coverage, NOT native 340dp/390dp/600dp/font 1.35 proof.
  });

  it("confirmed group exposes a compact Change action and neutral type circle without implicit selection", () => {
    const view = makeSharedPresentation("r3-confirmed-feedback");
    const qnb = requireGroup(view, "QNB");
    const actions = makeActions();
    renderGroups(view, actions);
    expect(
      screen.queryByTestId("account-review-group-confirm-" + qnb.groupId)
    ).toBeNull();
    const change = screen.getByTestId(
      "account-review-group-change-" + qnb.groupId
    );
    fireEvent.press(change);
    expect(
      screen.getByTestId("account-review-group-action-sheet")
    ).toBeTruthy();
    expect(actions.onConfirm).not.toHaveBeenCalled();
    expect(actions.onReplace).not.toHaveBeenCalled();
  });

  it("renders approved Arabic three-link disclosure and accessible group-specific actions", async () => {
    mockLocale = "ar";
    await changeLanguage("ar");
    const view = makeSharedPresentation("r3-combined-ar", "ar");
    const qnb = requireGroup(view, "QNB");
    renderGroups(view);
    expect(
      screen.getByText("اختيار معاملة من QNB يؤكد الحساب للمعاملات الثلاث.")
    ).toBeTruthy();
    const menu = screen.getByTestId(
      "account-review-group-actions-" + qnb.groupId
    );
    expect(menu).toHaveProp("accessibilityRole", "button");
    expect(menu).toHaveProp(
      "accessibilityLabel",
      expect.stringContaining("QNB")
    );
    // Native RTL placement/bidi glyphs and screen-reader focus require owner device.
  });
});

describe("T026 US2: R1-07 edit sheet and R2-02 menu boundaries", () => {
  it("shows name and type editable, but keeps EGP group currency locked with linked-three scope", () => {
    showEdit();
    expect(screen.getByTestId("account-review-group-edit-sheet")).toBeTruthy();
    expect(screen.getByTestId("account-review-group-edit-name")).toBeTruthy();
    expect(screen.getByTestId("account-review-group-edit-type")).toBeTruthy();
    const currency = screen.getByTestId("account-review-group-locked-currency");
    expect(currency).toHaveTextContent("EGP");
    expect(currency).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
    expect(screen.getByText(/3/)).toBeTruthy();
  });

  it("submits only an explicit changed name and selected type option, not a persisted account", () => {
    const onSubmit = jest.fn<
      void,
      [{ readonly name: string; readonly typeOptionId: string }]
    >();
    showEdit(makeEditProps({ onSubmit }));
    fireEvent.changeText(
      screen.getByTestId("account-review-group-edit-name"),
      "QNB Office"
    );
    fireEvent.press(screen.getByTestId("account-review-group-edit-submit"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: "QNB Office",
      typeOptionId: "BANK",
    });
  });

  it("allows selecting a different permitted account type before confirming edit", () => {
    const onSubmit = jest.fn<
      void,
      [{ readonly name: string; readonly typeOptionId: string }]
    >();
    showEdit(makeEditProps({ onSubmit }));
    fireEvent.press(screen.getByTestId("account-review-group-edit-type"));
    fireEvent.press(screen.getByText("Digital wallet"));
    fireEvent.press(screen.getByTestId("account-review-group-edit-submit"));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "QNB",
      typeOptionId: "DIGITAL_WALLET",
    });
  });

  it("shows validation and disabled submit for invalid identity instead of making a fake command", () => {
    const onSubmit = jest.fn();
    showEdit(
      makeEditProps({
        onSubmit,
        canSubmit: false,
        validationMessage: "Name conflicts with another account",
      })
    );
    expect(
      screen.getByText("Name conflicts with another account")
    ).toBeTruthy();
    const submit = screen.getByTestId("account-review-group-edit-submit");
    expect(submit).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
    fireEvent.press(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables competing actions while the facade has an in-flight group operation", () => {
    const onSubmit = jest.fn();
    const onReplace = jest.fn();
    showEdit(makeEditProps({ onSubmit, onReplace, isBusy: true }));
    expect(screen.getByTestId("account-review-group-edit-submit")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
    fireEvent.press(screen.getByTestId("account-review-group-edit-submit"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onReplace).not.toHaveBeenCalled();
  });

  it("Cancel closes without submitting or opening the existing account chooser", () => {
    const onCancel = jest.fn();
    const onSubmit = jest.fn();
    const onReplace = jest.fn();
    showEdit(makeEditProps({ onCancel, onSubmit, onReplace }));
    fireEvent.press(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onReplace).not.toHaveBeenCalled();
  });

  it("Android Back closes the sheet without committing the current edit", () => {
    const onCancel = jest.fn();
    const onSubmit = jest.fn();
    showEdit(makeEditProps({ onCancel, onSubmit }));
    fireEvent(screen.UNSAFE_getByType(Modal), "requestClose");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("accessible outside dismissal cancels a draft without a group mutation", () => {
    const onCancel = jest.fn();
    const onSubmit = jest.fn();
    showEdit(makeEditProps({ onCancel, onSubmit }));
    fireEvent.press(screen.getByLabelText("Close suggested account editor"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Replace asks for the all-three group action, never submits an unchosen account", () => {
    const onReplace = jest.fn();
    const onSubmit = jest.fn();
    showEdit(makeEditProps({ onReplace, onSubmit }));
    expect(screen.getByText(/3/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("account-review-group-replace"));
    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    // T035/T038 own the existing chooser with nullable initial candidate.
  });

  it("uses scrollable keyboard-safe modal and a single dynamic bottom inset", () => {
    showEdit();
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView)).toBeTruthy();
    expect(screen.UNSAFE_getByType(ScrollView)).toBeTruthy();
    expect(screen.getByTestId("account-review-group-edit-sheet")).toHaveStyle({
      paddingBottom: 28,
    });
    expect(screen.getByTestId("account-review-group-edit-sheet")).toHaveProp(
      "accessibilityViewIsModal",
      true
    );
    // Actual keyboard reachability, 340/390/600, font1.35/focus is owner evidence.
  });

  it("never renders an active edit dialog while visible is false", () => {
    showEdit(makeEditProps({ visible: false }));
    expect(screen.queryByTestId("account-review-group-edit-sheet")).toBeNull();
    expect(screen.queryByTestId("account-review-group-edit-submit")).toBeNull();
  });
});
