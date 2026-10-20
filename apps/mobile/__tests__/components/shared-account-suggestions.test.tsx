/**
 * #395 shared account presentation after compact interactive implementation.
 * The real group and editor components are tested; callbacks do not simulate
 * reducer, database, Save, Undo persistence or native rendered geometry.
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
import { KeyboardAvoidingView, Modal, ScrollView } from "react-native";
import { SharedAccountSuggestions } from "@/components/transaction-review/SharedAccountSuggestions";
import { EditSuggestedAccountSheet } from "@/components/transaction-review/EditSuggestedAccountSheet";
import { TransactionItem } from "@/components/transaction-review/TransactionItem";
import enTransactions from "@/locales/en/transactions.json";
import arTransactions from "@/locales/ar/transactions.json";
import enCommon from "@/locales/en/common.json";
import arCommon from "@/locales/ar/common.json";
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
  useCategoryLookup: (): ReturnType<
    (typeof import("@/context/CategoriesContext"))["useCategoryLookup"]
  > => new Map<string, never>(),
}));
jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: "en" | "ar" } => ({
    language: mockLocale,
  }),
}));

type GroupActions = Pick<
  ComponentProps<typeof SharedAccountSuggestions>,
  | "onConfirm"
  | "onEdit"
  | "onReplace"
  | "onRemove"
  | "onUndo"
  | "onDiscardRemoved"
  | "onViewLinked"
>;
function makeActions(): GroupActions {
  return {
    onConfirm: jest.fn<void, [string]>(),
    onEdit: jest.fn<void, [string]>(),
    onReplace: jest.fn<void, [string]>(),
    onRemove: jest.fn<void, [string]>(),
    onUndo: jest.fn<void, [string]>(),
    onDiscardRemoved: jest.fn<void, [string]>(),
    onViewLinked: jest.fn<void, [string]>(),
  };
}
function renderGroups(
  view: SharedPresentationFixture,
  actions: GroupActions = makeActions()
): GroupActions {
  render(
    <SharedAccountSuggestions
      groups={view.groups}
      summary={view.summary}
      isBusy={false}
      {...actions}
    />
  );
  return actions;
}
function openDetails(): void {
  const toggle = screen.getByTestId("account-review-compact-summary-toggle");
  expect(toggle).toHaveProp("accessibilityState", { expanded: false });
  fireEvent.press(toggle);
  expect(toggle).toHaveProp("accessibilityState", { expanded: true });
}

type EditProps = ComponentProps<typeof EditSuggestedAccountSheet>;
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
    ns: ["transactions", "common"],
    defaultNS: "transactions",
    resources: {
      en: { transactions: enTransactions, common: enCommon },
      ar: { transactions: arTransactions, common: arCommon },
    },
    interpolation: { escapeValue: false },
  });
});
afterEach(async (): Promise<void> => {
  mockLocale = "en";
  await changeLanguage("en");
  jest.clearAllMocks();
});

describe("#395 compact inline account groups — parent callbacks only", () => {
  it("starts collapsed with truthful pending count and reveals independent QNB3/CIB1 without View all", () => {
    const view = makeSharedPresentation("r3-combined-en");
    const qnb = requireGroup(view, "QNB");
    const cib = requireGroup(view, "CIB");
    expect(view.summary).toMatchObject({
      totalCount: 7,
      distinctNeedsReviewCount: 5,
      selectedCount: 2,
      pendingGroupCount: 2,
      defaultAssignmentCount: 2,
    });
    renderGroups(view);
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
    expect(screen.getByText("3 linked transactions")).toBeTruthy();
    expect(screen.getByText("1 linked transaction")).toBeTruthy();
    expect(
      screen.getByTestId("account-review-compact-save-explanation")
    ).toHaveTextContent(
      "New accounts are created only when you save their selected transactions."
    );
    expect(screen.queryByTestId("account-review-group-view-all")).toBeNull();
    expect(screen.queryByTestId("account-review-group-all-sheet")).toBeNull();
  });

  it("Confirm invokes only QNB without selecting rows, creating accounts or confirming CIB", () => {
    const view = makeSharedPresentation("r3-combined-en");
    const qnb = requireGroup(view, "QNB");
    const cib = requireGroup(view, "CIB");
    const actions = renderGroups(view);
    openDetails();
    const confirm = screen.getByTestId(
      "account-review-group-confirm-" + qnb.groupId
    );
    expect(confirm).toHaveProp("accessibilityRole", "button");
    expect(confirm).toHaveProp("accessibilityLabel", "Confirm");
    fireEvent.press(confirm);
    expect(actions.onConfirm).toHaveBeenCalledTimes(1);
    expect(actions.onConfirm).toHaveBeenCalledWith(qnb.groupId);
    expect(actions.onConfirm).not.toHaveBeenCalledWith(cib.groupId);
    expect(actions.onEdit).not.toHaveBeenCalled();
    expect(actions.onRemove).not.toHaveBeenCalled();
    expect(actions.onReplace).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("account-review-group-confirm-" + cib.groupId)
    ).toBeTruthy();
  });

  it("a transaction checkbox remains separate from pending-group Confirm", () => {
    const view = makeSharedPresentation("r3-combined-en");
    const actions = makeActions();
    const onToggleSelect = jest.fn<void, [number]>();
    render(
      <>
        <SharedAccountSuggestions
          groups={view.groups}
          summary={view.summary}
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
    openDetails();
    fireEvent.press(screen.getByRole("checkbox"));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith(0);
    expect(actions.onConfirm).not.toHaveBeenCalled();
    // This legacy independent TransactionItem is not the canonical pending
    // checkbox; the canonical UI must intercept and show explicit choice.
  });

  it.each([
    ["edit", "account-review-group-edit", "onEdit"],
    ["replace", "account-review-group-replace", "onReplace"],
    ["remove", "account-review-group-remove", "onRemove"],
  ] as const)(
    "%s acts only on the opened QNB inline menu",
    (_label, id, key) => {
      const view = makeSharedPresentation("r3-combined-en");
      const qnb = requireGroup(view, "QNB");
      const cib = requireGroup(view, "CIB");
      const actions = renderGroups(view);
      openDetails();
      expect(
        screen.queryByTestId("account-review-group-inline-menu")
      ).toBeNull();
      fireEvent.press(
        screen.getByTestId("account-review-group-actions-" + qnb.groupId)
      );
      expect(
        screen.getByTestId("account-review-group-inline-menu")
      ).toBeTruthy();
      fireEvent.press(screen.getByTestId(id));
      expect(actions[key]).toHaveBeenCalledTimes(1);
      expect(actions[key]).toHaveBeenCalledWith(qnb.groupId);
      expect(actions[key]).not.toHaveBeenCalledWith(cib.groupId);
      expect(actions.onConfirm).not.toHaveBeenCalled();
      expect(screen.queryByTestId("account-review-group-all-sheet")).toBeNull();
    }
  );

  it("CIB inline menu does not reuse QNB group scope", () => {
    const view = makeSharedPresentation("r3-combined-en");
    const qnb = requireGroup(view, "QNB");
    const cib = requireGroup(view, "CIB");
    const actions = renderGroups(view);
    openDetails();
    fireEvent.press(
      screen.getByTestId("account-review-group-actions-" + qnb.groupId)
    );
    fireEvent.press(
      screen.getByTestId("account-review-group-actions-" + cib.groupId)
    );
    expect(
      screen.getAllByTestId("account-review-group-inline-menu")
    ).toHaveLength(1);
    fireEvent.press(screen.getByTestId("account-review-group-edit"));
    expect(actions.onEdit).toHaveBeenCalledWith(cib.groupId);
    expect(actions.onEdit).not.toHaveBeenCalledWith(qnb.groupId);
  });

  it("keeps pending group Confirm while account/currency recovery moves to the dedicated tab", () => {
    const view = makeSharedPresentation("r3-combined-en");
    const actions = renderGroups(view);
    openDetails();
    expect(screen.getByText("2 accounts need review")).toBeTruthy();
    expect(screen.queryByTestId("account-review-compact-issues")).toBeNull();
    fireEvent.press(
      screen.getByTestId(
        "account-review-group-confirm-" + requireGroup(view, "QNB").groupId
      )
    );
    expect(actions.onConfirm).toHaveBeenCalledTimes(1);
    expect(actions.onConfirm).toHaveBeenCalledWith(
      requireGroup(view, "QNB").groupId
    );
    expect(
      screen.getByTestId(
        "account-review-group-confirm-" + requireGroup(view, "CIB").groupId
      )
    ).toBeTruthy();
    expect(screen.queryByTestId("account-review-compact-issues")).toBeNull();
  });

  it("rerenders confirmed status from parent and keeps explicit Change", () => {
    const view = makeSharedPresentation("r3-combined-en");
    const qnb = requireGroup(view, "QNB");
    const actions = makeActions();
    const rendered = render(
      <SharedAccountSuggestions
        groups={view.groups}
        summary={view.summary}
        isBusy={false}
        {...actions}
      />
    );
    openDetails();
    const confirmed = withGroup(view, qnb.groupId, {
      isConfirmed: true,
      canConfirm: false,
      statusLabel: "Confirmed",
      canReplace: true,
    });
    rendered.rerender(
      <SharedAccountSuggestions
        groups={confirmed.groups}
        summary={confirmed.summary}
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
    fireEvent.press(
      screen.getByTestId("account-review-group-change-" + qnb.groupId)
    );
    expect(actions.onReplace).toHaveBeenCalledWith(qnb.groupId);
    expect(actions.onConfirm).not.toHaveBeenCalled();
  });

  it("removed QNB ghost has scoped Undo and Discard without touching CIB", () => {
    const view = makeSharedPresentation("r3-removed-undo");
    const qnb = requireGroup(view, "QNB");
    const cib = requireGroup(view, "CIB");
    const actions = renderGroups(view);
    openDetails();
    expect(
      screen.getByTestId("account-review-group-card-" + cib.groupId)
    ).toBeTruthy();
    expect(
      screen.getByTestId("account-review-group-name-" + qnb.groupId)
    ).toHaveTextContent("QNB · " + qnb.currencyLabel);
    fireEvent.press(screen.getByTestId("account-review-group-undo"));
    expect(actions.onUndo).toHaveBeenCalledTimes(1);
    expect(actions.onUndo).toHaveBeenCalledWith(qnb.groupId);
    fireEvent.press(
      screen.getByTestId("account-review-group-discard-" + qnb.groupId)
    );
    expect(actions.onDiscardRemoved).toHaveBeenCalledTimes(1);
    expect(actions.onDiscardRemoved).toHaveBeenCalledWith(qnb.groupId);
    expect(actions.onRemove).not.toHaveBeenCalled();
    // Actual revocation of a stale service-level Undo lease is verified in
    // B's domain tests; a view callback is not that authority.
  });

  it("revokes the visible Undo affordance when parent marks the lease ineligible", () => {
    const base = makeSharedPresentation("r3-removed-undo");
    const qnb = requireGroup(base, "QNB");
    const view = withGroup(base, qnb.groupId, { canUndo: false });
    const actions = renderGroups(view);
    openDetails();
    expect(screen.queryByTestId("account-review-group-undo")).toBeNull();
    expect(
      screen.getByTestId("account-review-group-discard-" + qnb.groupId)
    ).toBeTruthy();
    expect(actions.onUndo).not.toHaveBeenCalled();
  });

  it("renders all six groups inline, no modal and no first-N truncation", () => {
    const view = makeSixGroupViewAll();
    const actions = renderGroups(view);
    expect(view.groups).toHaveLength(6);
    openDetails();
    for (const group of view.groups) {
      expect(
        screen.getByTestId("account-review-group-card-" + group.groupId)
      ).toBeTruthy();
    }
    expect(
      screen.getAllByTestId(
        "account-review-group-card-" + view.groups[5]?.groupId
      )
    ).toHaveLength(1);
    expect(screen.queryByTestId("account-review-group-all-sheet")).toBeNull();
    expect(actions.onConfirm).not.toHaveBeenCalled();
  });

  it("one inline Remove targets its own group and leaves other inline groups", () => {
    const view = makeSixGroupViewAll();
    const chosen = view.groups[1];
    const other = view.groups[2];
    if (!chosen || !other) throw new Error("Missing six-group fixture");
    const actions = renderGroups(view);
    openDetails();
    fireEvent.press(
      screen.getByTestId("account-review-group-actions-" + chosen.groupId)
    );
    const menu = within(screen.getByTestId("account-review-group-inline-menu"));
    fireEvent.press(menu.getByTestId("account-review-group-remove"));
    expect(actions.onRemove).toHaveBeenCalledTimes(1);
    expect(actions.onRemove).toHaveBeenCalledWith(chosen.groupId);
    expect(actions.onRemove).not.toHaveBeenCalledWith(other.groupId);
    expect(
      screen.getByTestId("account-review-group-card-" + other.groupId)
    ).toBeTruthy();
    expect(screen.queryByTestId("account-review-group-all-sheet")).toBeNull();
  });

  it("default-only and clean states have reviewed collapsed summary, no invented groups", () => {
    for (const id of ["r3-default-only", "r3-clean"] as const) {
      const view = makeSharedPresentation(id);
      const rendered = render(
        <SharedAccountSuggestions
          groups={view.groups}
          summary={view.summary}
          isBusy={false}
          {...makeActions()}
        />
      );
      expect(screen.getByTestId("account-review-details-panel")).toBeTruthy();
      expect(screen.getByText("Accounts reviewed")).toBeTruthy();
      openDetails();
      expect(
        screen.queryByTestId("account-review-group-inline-menu")
      ).toBeNull();
      expect(screen.queryByTestId("account-review-group-card-")).toBeNull();
      rendered.unmount();
    }
  });

  it("currency-only unresolved state counts account needed, but has no duplicate inline action", () => {
    const view = makeSharedPresentation("r3-currency-conflict");
    const actions = renderGroups(view);
    expect(view.groups).toHaveLength(0);
    expect(view.summary.distinctNeedsReviewCount).toBe(1);
    expect(screen.getByText("1 transaction needs an account")).toBeTruthy();
    openDetails();
    expect(screen.queryByTestId("account-review-compact-issues")).toBeNull();
    expect(actions.onConfirm).not.toHaveBeenCalled();
  });

  it("authoritative account-needed row union overrides overlapping issue counts without creating duplicate inline action", () => {
    const original = makeSharedPresentation("r3-currency-conflict");
    const view = {
      ...original,
      summary: {
        ...original.summary,
        issues: [
          {
            key: "account_review_issue_account" as const,
            label: "Account needed",
            count: 2,
          },
          {
            key: "account_review_issue_currency" as const,
            label: "Confirm currency",
            count: 3,
          },
          {
            key: "account_review_issue_category" as const,
            label: "Choose a category",
            count: 1,
          },
        ],
      },
    };
    const actions = makeActions();
    render(
      <SharedAccountSuggestions
        {...actions}
        groups={view.groups}
        summary={view.summary}
        accountNeededCount={2}
        isBusy={false}
      />
    );
    expect(screen.getByText("2 transactions need an account")).toBeTruthy();
    openDetails();
    const issues = within(screen.getByTestId("account-review-compact-issues"));
    expect(issues.getByText("Choose a category")).toBeTruthy();
    expect(issues.queryByText("Account needed")).toBeNull();
    expect(issues.queryByText("Confirm currency")).toBeNull();
    expect(actions.onConfirm).not.toHaveBeenCalled();
  });

  it("incomplete group has no actionable Confirm even after expansion", () => {
    const base = makeSharedPresentation("r3-combined-en");
    const qnb = requireGroup(base, "QNB");
    const view = withGroup(base, qnb.groupId, { canConfirm: false });
    const actions = renderGroups(view);
    openDetails();
    expect(
      screen.queryByTestId("account-review-group-confirm-" + qnb.groupId)
    ).toBeNull();
    expect(actions.onConfirm).not.toHaveBeenCalled();
  });

  it("long name, masked card identity and effective menu accessibility survive render", () => {
    const base = makeSharedPresentation("r3-combined-en");
    const qnb = requireGroup(base, "QNB");
    const name = "QNB Everyday - اسم حساب طويل للغاية for account ending 0007";
    const view = withGroup(base, qnb.groupId, { displayName: name });
    renderGroups(view);
    openDetails();
    expect(
      screen.getByTestId("account-review-group-name-" + qnb.groupId)
    ).toHaveTextContent(name + " · " + qnb.currencyLabel);
    expect(screen.getByText(/•••• 0007/)).toBeTruthy();
    expect(
      screen.getByTestId("account-review-group-actions-" + qnb.groupId)
    ).toHaveProp("accessibilityRole", "button");
    // Native clipping/geometry/font scaling cannot be asserted from Jest.
  });

  it("linked-row action is scoped to its group without changing selection", () => {
    const view = makeSharedPresentation("r3-combined-en");
    const qnb = requireGroup(view, "QNB");
    const cib = requireGroup(view, "CIB");
    const actions = renderGroups(view);
    openDetails();
    fireEvent.press(
      screen.getByTestId("account-review-group-linked-" + qnb.groupId)
    );
    expect(actions.onViewLinked).toHaveBeenCalledTimes(1);
    expect(actions.onViewLinked).toHaveBeenCalledWith(qnb.groupId);
    expect(actions.onViewLinked).not.toHaveBeenCalledWith(cib.groupId);
    expect(actions.onConfirm).not.toHaveBeenCalled();
  });

  it("Arabic compact summary and group actions retain localized labels and group identity", async () => {
    mockLocale = "ar";
    await changeLanguage("ar");
    const view = makeSharedPresentation("r3-combined-ar", "ar");
    const qnb = requireGroup(view, "QNB");
    renderGroups(view);
    const summary = screen.getByTestId("account-review-compact-summary-toggle");
    expect(summary).toHaveProp(
      "accessibilityLabel",
      arTransactions.compact_review_pending_two
    );
    expect(summary).toHaveProp("accessibilityState", { expanded: false });
    openDetails();
    const menu = screen.getByTestId(
      "account-review-group-actions-" + qnb.groupId
    );
    expect(menu).toHaveProp("accessibilityRole", "button");
    expect(menu).toHaveProp(
      "accessibilityLabel",
      expect.stringContaining("QNB")
    );
    const groupName = screen.getByTestId(
      "account-review-group-name-" + qnb.groupId
    );
    expect(groupName).toHaveTextContent(
      "\u2068QNB\u2069 · \u2068" + qnb.currencyLabel + "\u2069"
    );
    // The directional isolates are intentional. Native RTL placement and
    // TalkBack focus still require actual device evidence.
  });
});

describe("T026 US2: R1-07 edit sheet and R2-02 menu boundaries", () => {
  it("preselects current EGP in the shared searchable picker and returns to the same uncommitted editor", () => {
    const onSubmit = jest.fn<void, Parameters<EditProps["onSubmit"]>>();
    showEdit(makeEditProps({ onSubmit }));
    expect(screen.getByTestId("account-review-group-edit-sheet")).toBeTruthy();
    expect(screen.getByTestId("account-review-group-edit-name")).toBeTruthy();
    expect(screen.getByTestId("account-review-group-edit-type")).toBeTruthy();
    const currency = screen.getByTestId("account-review-group-edit-currency");
    expect(currency).toHaveProp("accessibilityRole", "button");
    expect(currency).toHaveProp("accessibilityLabel", "Currency, EGP");
    expect(
      screen.UNSAFE_getAllByType(Modal).filter((modal) => modal.props.visible)
    ).toHaveLength(1);
    fireEvent.press(currency);
    const picker = screen.getByTestId(
      "account-review-group-edit-currency-picker"
    );
    expect(picker).toHaveProp("visible", true);
    expect(
      screen.UNSAFE_getAllByType(Modal).filter((modal) => modal.props.visible)
    ).toHaveLength(1);
    expect(screen.getByTestId("currency-row-highlight-EGP")).toBeTruthy();
    const search = screen.getByPlaceholderText(
      enCommon.search_currency_name_code
    );
    fireEvent.changeText(search, "USD");
    expect(screen.getByTestId("currency-code-row-USD")).toBeTruthy();
    expect(screen.queryByTestId("currency-code-row-EGP")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent(picker, "requestClose");
    expect(screen.getByTestId("account-review-group-edit-currency")).toHaveProp(
      "accessibilityLabel",
      "Currency, EGP"
    );
    expect(screen.getByTestId("account-review-group-edit-name")).toHaveProp(
      "value",
      "QNB"
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits only an explicit changed name and selected type option, not a persisted account", () => {
    const onSubmit = jest.fn<void, Parameters<EditProps["onSubmit"]>>();
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
      currency: "EGP",
    });
  });

  it("allows selecting a different permitted account type before confirming edit", () => {
    const onSubmit = jest.fn<void, Parameters<EditProps["onSubmit"]>>();
    showEdit(makeEditProps({ onSubmit }));
    fireEvent.press(screen.getByTestId("account-review-group-edit-type"));
    fireEvent.press(screen.getByText("Digital wallet"));
    fireEvent.press(screen.getByTestId("account-review-group-edit-submit"));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "QNB",
      typeOptionId: "DIGITAL_WALLET",
      currency: "EGP",
    });
  });

  it("stages USD using searchable CurrencyPicker while preserving edited name/type and no FX or early command", () => {
    const onSubmit = jest.fn<void, Parameters<EditProps["onSubmit"]>>();
    const onReplace = jest.fn<void, []>();
    showEdit(makeEditProps({ onSubmit, onReplace }));
    fireEvent.changeText(
      screen.getByTestId("account-review-group-edit-name"),
      "QNB Office"
    );
    fireEvent.press(screen.getByTestId("account-review-group-edit-type"));
    fireEvent.press(
      screen.getByTestId("account-review-group-edit-type-option-DIGITAL_WALLET")
    );
    fireEvent.press(screen.getByTestId("account-review-group-edit-currency"));
    const picker = screen.getByTestId(
      "account-review-group-edit-currency-picker"
    );
    expect(picker).toHaveProp("visible", true);
    expect(
      screen.UNSAFE_getAllByType(Modal).filter((modal) => modal.props.visible)
    ).toHaveLength(1);
    fireEvent.changeText(
      screen.getByPlaceholderText(enCommon.search_currency_name_code),
      "usd"
    );
    expect(screen.getByTestId("currency-code-row-USD")).toBeTruthy();
    expect(screen.queryByTestId("currency-code-row-EGP")).toBeNull();
    fireEvent.press(screen.getByTestId("currency-code-row-USD"));
    expect(screen.getByTestId("account-review-group-edit-currency")).toHaveProp(
      "accessibilityLabel",
      "Currency, USD"
    );
    expect(screen.getByTestId("account-review-group-edit-name")).toHaveProp(
      "value",
      "QNB Office"
    );
    expect(
      screen.getByTestId("account-review-group-edit-type")
    ).toHaveTextContent("Digital wallet");
    expect(
      screen.getByTestId("account-review-group-currency-no-conversion")
    ).toHaveTextContent(
      "The amount stays the same number. This changes its currency without conversion."
    );
    expect(
      screen.UNSAFE_getAllByType(Modal).filter((modal) => modal.props.visible)
    ).toHaveLength(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onReplace).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("account-review-group-edit-submit"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: "QNB Office",
      typeOptionId: "DIGITAL_WALLET",
      currency: "USD",
    });
    expect(onReplace).not.toHaveBeenCalled();
  });

  it("picker Back preserves local draft and Cancel dismisses without submitting", () => {
    const onSubmit = jest.fn<void, Parameters<EditProps["onSubmit"]>>();
    const onCancel = jest.fn<void, []>();
    showEdit(makeEditProps({ onSubmit, onCancel }));
    fireEvent.changeText(
      screen.getByTestId("account-review-group-edit-name"),
      "QNB Office"
    );
    fireEvent.press(screen.getByTestId("account-review-group-edit-currency"));
    expect(
      screen.getByTestId("account-review-group-edit-currency-picker")
    ).toHaveProp("visible", true);
    fireEvent(
      screen.getByTestId("account-review-group-edit-currency-picker"),
      "requestClose"
    );
    expect(screen.getByTestId("account-review-group-edit-name")).toHaveProp(
      "value",
      "QNB Office"
    );
    expect(screen.getByTestId("account-review-group-edit-currency")).toHaveProp(
      "accessibilityLabel",
      "Currency, EGP"
    );
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
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
    const visibleModals = screen
      .UNSAFE_getAllByType(Modal)
      .filter((modal) => modal.props.visible === true);
    expect(visibleModals).toHaveLength(1);
    const activeModal = visibleModals[0];
    if (!activeModal) throw new Error("Missing visible edit modal");
    fireEvent(activeModal, "requestClose");
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
