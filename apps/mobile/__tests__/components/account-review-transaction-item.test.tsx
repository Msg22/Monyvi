/**
 * #395 T021/T039 TESTS FIRST: real TransactionItem row integration.
 * The canonical account-review choice/reducer/service layers are not mocked.
 * This file tests proposed DISPLAY-ONLY props; missing source integration
 * produces behavioral Red, not fake SUT Green or a new account policy.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import {
  changeLanguage,
  init as initializeI18next,
  use as registerI18nextPlugin,
} from "i18next";
import { initReactI18next } from "react-i18next";
import React from "react";
import { TouchableOpacity } from "react-native";

import { TransactionItem } from "@/components/transaction-review/TransactionItem";
import { SharedAccountSuggestions } from "@/components/transaction-review/SharedAccountSuggestions";
import enTransactions from "../../locales/en/transactions.json";
import arTransactions from "../../locales/ar/transactions.json";
import {
  makeCombinedItem,
  makeDefaultItem,
  requireArabicQnb,
  requireReviewGroup,
  type ReviewItemProps,
  type ShapedAccountReviewRow,
} from "./account-review-transaction-item-test-fixtures";
import { makeSharedPresentation } from "./shared-account-suggestions-test-fixtures";

let mockLanguage: "en" | "ar" = "en";
let mockWindow = { width: 390, height: 844, fontScale: 1, scale: 1 };
let mockCategories = new Map<
  string,
  {
    readonly icon: string;
    readonly iconLibrary: string;
    readonly color: string;
    readonly isExpense: boolean;
  }
>();

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: "en" | "ar" } => ({
    language: mockLanguage,
  }),
}));
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: (): typeof mockWindow => mockWindow,
}));
jest.mock("@/components/institutions/InstitutionLogoMark", () => ({
  InstitutionLogoMark: (): null => null,
}));
jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): null => null,
}));
jest.mock("@/context/CategoriesContext", () => ({
  useCategoryLookup: () => mockCategories,
}));
// The shared Jest setup makes decorative vector icons null; preserve their
// actual props locally so the hidden-visual name assertions remain meaningful.
jest.mock("@expo/vector-icons", () => ({
  Ionicons: (props: Readonly<Record<string, unknown>>): React.JSX.Element => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactActual.createElement(RN.View, {
      testID: typeof props.testID === "string" ? props.testID : undefined,
      ...props,
    });
  },
}));
jest.mock("@/components/common/CategoryIcon", () => ({
  CategoryIcon: ({ iconName }: { readonly iconName: string }) => {
    const react = jest.requireActual<typeof import("react")>("react");
    const rn =
      jest.requireActual<typeof import("react-native")>("react-native");
    return react.createElement(
      rn.Text,
      {
        testID: "account-review-resolved-category-icon",
      },
      iconName
    );
  },
}));

function renderRow(props: ReviewItemProps): ReturnType<typeof render> {
  // Additional presentation props flow through actual JSX, not a mock or cast.
  return render(<TransactionItem {...props} />);
}

function getAccountAction(): ReturnType<typeof screen.getByTestId> {
  return screen.getByTestId("account-review-row-account-action");
}

function getCurrencyAction(): ReturnType<typeof screen.getByTestId> {
  return screen.getByTestId("account-review-row-currency-action");
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
  mockCategories = new Map();
  await changeLanguage("en");
  jest.clearAllMocks();
});

describe("#395 T021 — accepted default is an editable account label, not an account blocker", () => {
  it("retains the complete legacy row when no account-review presentation was supplied", () => {
    const { accountReview, ...legacy } = makeDefaultItem();
    expect(accountReview).toBeDefined();
    render(<TransactionItem {...legacy} />);
    expect(screen.getByTestId("transaction-review-row")).toBeTruthy();
    expect(screen.getByTestId("transaction-review-amount")).toBeTruthy();
    expect(screen.getByTestId("transaction-review-edit-action")).toBeTruthy();
    expect(screen.getByTestId("transaction-account-match")).toHaveTextContent(
      "Cash"
    );
    expect(
      screen.queryByTestId("account-review-row-account-action")
    ).toBeNull();
    expect(
      screen.queryByTestId("account-review-row-currency-action")
    ).toBeNull();
  });

  it("canonical rows place account-type and category details beneath the title with inline recovery", () => {
    const sourceActions = {
      accountType: "BANK" as const,
      accountStatusLabel: "New account",
      accountActionLabel: "Change",
      sharedSelectionDisclosure:
        "Selecting a QNB transaction confirms the linked group.",
    };
    const props = makeCombinedItem(0, { accountName: "QNB" }, sourceActions);
    mockCategories.set(props.transaction.categoryId, {
      icon: "restaurant-outline",
      iconLibrary: "Ionicons",
      color: "#497A64",
      isExpense: true,
    });
    renderRow(props);
    expect(
      screen.getByTestId("account-review-account-type-icon", {
        includeHiddenElements: true,
      })
    ).toHaveProp("name", "business-outline");
    expect(screen.getByTestId("account-review-row-category")).toBeTruthy();
    expect(
      screen.getByTestId("account-review-resolved-category-icon")
    ).toHaveTextContent("restaurant-outline");
    expect(screen.getByTestId("account-review-row-metadata")).toHaveProp(
      "className",
      expect.stringContaining("flex-row")
    );
    expect(
      screen.getByTestId("account-review-row-edit-chevron", {
        includeHiddenElements: true,
      })
    ).toBeTruthy();
    expect(screen.queryByTestId("account-review-transaction-type")).toBeNull();
    expect(screen.queryByTestId("transaction-review-provider-logo")).toBeNull();
    expect(screen.queryByText("Review details")).toBeNull();
    const selection = screen.getByRole("checkbox");
    expect(selection).not.toBeChecked();
    expect(selection).not.toBeDisabled();
    fireEvent.press(selection);
    expect(props.onToggleSelect).toHaveBeenCalledTimes(1);
    expect(props.onToggleSelect).toHaveBeenCalledWith(props.index);
    expect(props.onPress).not.toHaveBeenCalled();
    expect(props.accountReview.onChooseAccount).not.toHaveBeenCalled();
    const accountAction = getAccountAction();
    expect(accountAction).toHaveProp("accessibilityRole", "button");
    expect(accountAction.props.accessibilityLabel).toContain("QNB");
    fireEvent.press(accountAction);
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledTimes(1);
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledWith(
      props.accountReview.rowId
    );
    expect(props.onPress).not.toHaveBeenCalled();
    expect(props.onToggleSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("transaction-review-amount")).toBeTruthy();
  });

  it("canonical account icon is not guessed from Voice or SMS origin", () => {
    const sourceActions = {
      accountType: "CASH" as const,
      accountActionLabel: "Change",
    };
    const props = makeDefaultItem({}, sourceActions);
    renderRow(props);
    expect(
      screen.getByTestId("account-review-account-type-icon", {
        includeHiddenElements: true,
      })
    ).toHaveProp("name", "cash-outline");
    expect(screen.queryByTestId("transaction-review-provider-logo")).toBeNull();
  });

  it("falls back to a neutral category icon only when owned category metadata is absent", () => {
    const props = makeDefaultItem();
    renderRow(props);
    expect(
      screen.getByTestId("account-review-resolved-category-icon")
    ).toHaveTextContent("pricetag-outline");
    expect(screen.getByTestId("account-review-row-metadata")).toHaveProp(
      "className",
      expect.stringContaining("flex-row")
    );
  });

  it("R3-07 exposes Change on an eligible default with no redundant Review account warning", () => {
    const props = makeDefaultItem();
    renderRow(props);
    expect(screen.getByTestId("transaction-account-match")).toHaveTextContent(
      "Cash"
    );
    expect(getAccountAction()).toHaveProp("accessibilityRole", "button");
    expect(getAccountAction().props.accessibilityLabel).toMatch(/Change|Cash/);
    expect(screen.queryByText("Review account")).toBeNull();
    fireEvent.press(getAccountAction());
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledWith(
      props.accountReview.rowId
    );
    expect(props.onPress).not.toHaveBeenCalled();
    expect(props.onToggleSelect).not.toHaveBeenCalled();
  });

  it("R3-07 preserves existing amount/category edit information after account-only blocker clears", () => {
    const props = makeDefaultItem({
      isSelected: false,
      hasMissingInfo: false,
      reviewMeta: {
        isAutoSelectable: false,
        reasons: ["category_needed", "amount_review"],
      },
    });
    const original = props.transaction;
    renderRow(props);
    expect(screen.queryByText("Review details")).toBeNull();
    expect(screen.queryByText("Review account")).toBeNull();
    expect(
      screen.getByText(props.transaction.categoryDisplayName)
    ).toBeTruthy();
    expect(screen.getByTestId("transaction-review-amount")).toBeTruthy();
    fireEvent.press(getAccountAction());
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledTimes(1);
    expect(props.onToggleSelect).not.toHaveBeenCalled();
    expect(props.transaction).toBe(original);
    expect(props.reviewMeta?.reasons).toEqual([
      "category_needed",
      "amount_review",
    ]);
  });

  it("R3-05 default label changes only when new parent props arrive; row amount and source survive", () => {
    const original = makeDefaultItem();
    const view = renderRow(original);
    const chosen = {
      ...original,
      accountName: "QNB Everyday",
      accountReview: {
        ...original.accountReview,
        accountActionLabel: "Change",
      },
    };
    view.rerender(<TransactionItem {...chosen} />);
    expect(screen.getByTestId("transaction-account-match")).toHaveTextContent(
      "QNB Everyday"
    );
    expect(screen.queryByText("Cash")).toBeNull();
    expect(screen.getByTestId("transaction-review-amount")).toBeTruthy();
    fireEvent.press(getAccountAction());
    expect(chosen.accountReview.onChooseAccount).toHaveBeenCalledWith(
      original.accountReview.rowId
    );
    expect(chosen.transaction).toBe(original.transaction);
  });

  it("a row edit remains independent of account choice and selection", () => {
    const props = makeDefaultItem();
    renderRow(props);
    fireEvent.press(screen.getByTestId("transaction-review-edit-action"));
    expect(props.onPress).toHaveBeenCalledWith(props.index);
    expect(props.accountReview.onChooseAccount).not.toHaveBeenCalled();
    expect(props.onToggleSelect).not.toHaveBeenCalled();
    fireEvent.press(getAccountAction());
    expect(props.onPress).toHaveBeenCalledTimes(1);
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledTimes(1);
  });
});

describe("#395 T021 — independently shaped pending/confirmed/removed group rows", () => {
  it("R3-05 displays canonical QNB3 pending identity and complete shared-effect disclosure", () => {
    const group = requireReviewGroup("QNB");
    const props = makeCombinedItem(
      0,
      { accountName: group.displayName },
      {
        accountActionLabel: "Change",
        accountStatusLabel: group.statusLabel,
        sharedSelectionDisclosure: group.disclosureText,
      }
    );
    renderRow(props);
    expect(screen.getByTestId("transaction-account-match")).toHaveTextContent(
      "QNB"
    );
    expect(screen.getByTestId("account-review-row-status")).toHaveTextContent(
      "Pending"
    );
    expect(
      screen.getByTestId("account-review-row-shared-disclosure")
    ).toHaveTextContent(/all 3/);
    expect(screen.queryByText("Confirm all")).toBeNull();
    expect(screen.queryByText("QNB Savings")).toBeNull();
    expect(props.isSelected).toBe(false);
    expect(props.accountReview.onChooseAccount).not.toHaveBeenCalled();
  });

  it("selecting one of QNB3 invokes only that row's callback, not group confirmation", () => {
    const group = requireReviewGroup("QNB");
    const onSelect = jest.fn<void, [index: number]>();
    const groupActions = {
      onConfirm: jest.fn<void, [groupId: string]>(),
      onEdit: jest.fn<void, [groupId: string]>(),
      onReplace: jest.fn<void, [groupId: string]>(),
      onRemove: jest.fn<void, [groupId: string]>(),
      onUndo: jest.fn<void, [groupId: string]>(),
      onViewAll: jest.fn<void, []>(),
      onCloseAllGroups: jest.fn<void, []>(),
    };
    const overview = makeSharedPresentation("r3-combined-en");
    render(
      <>
        <SharedAccountSuggestions
          groups={overview.groups}
          summary={overview.summary}
          isAllGroupsSheetOpen={false}
          isBusy={false}
          {...groupActions}
        />
        {[0, 1, 2].map((index) => {
          const props = makeCombinedItem(
            index,
            { accountName: group.displayName, onToggleSelect: onSelect },
            {
              accountStatusLabel: group.statusLabel,
              sharedSelectionDisclosure: group.disclosureText,
            }
          );
          return <TransactionItem key={props.accountReview.rowId} {...props} />;
        })}
      </>
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    fireEvent.press(screen.getAllByRole("checkbox")[1]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(groupActions.onConfirm).not.toHaveBeenCalled();
    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).not.toBeChecked();
    }
    expect(
      screen.getAllByTestId("account-review-row-shared-disclosure")
    ).toHaveLength(3);
  });

  it("R3-09 confirmation arrives from parent and changes only status, never checked state", () => {
    const pending = requireReviewGroup("QNB");
    const confirmed = requireReviewGroup("QNB", "r3-confirmed-feedback");
    const before = makeCombinedItem(
      0,
      { accountName: pending.displayName, isSelected: false },
      { accountStatusLabel: pending.statusLabel }
    );
    const view = renderRow(before);
    expect(screen.getByTestId("account-review-row-status")).toHaveTextContent(
      "Pending"
    );
    const after = {
      ...before,
      accountReview: {
        ...before.accountReview,
        accountStatusLabel: confirmed.statusLabel,
      },
    };
    view.rerender(<TransactionItem {...after} />);
    expect(screen.getByTestId("account-review-row-status")).toHaveTextContent(
      "Confirmed"
    );
    expect(screen.queryByText("Pending")).toBeNull();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(after.accountReview.onChooseAccount).not.toHaveBeenCalled();
  });

  it("R3-06 removed explicit QNB row stays unassigned with Choose account; no implicit Cash", () => {
    const props = makeCombinedItem(
      0,
      { accountName: null, isSelected: false },
      {
        accountActionLabel: "Choose an account",
        accountStatusLabel: "QNB suggestion removed",
        sharedSelectionDisclosure: null,
      }
    );
    renderRow(props);
    expect(screen.queryByTestId("transaction-account-match")).toBeNull();
    expect(screen.queryByText("Cash")).toBeNull();
    expect(screen.getByTestId("account-review-row-status")).toHaveTextContent(
      "QNB suggestion removed"
    );
    fireEvent.press(getAccountAction());
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledWith(
      props.accountReview.rowId
    );
    expect(props.onToggleSelect).not.toHaveBeenCalled();
    expect(screen.queryByTestId("account-review-row-undo")).toBeNull();
  });
});

describe("#395 T039 — per-row account/currency choice delegates to the parent", () => {
  it("R1-03 ambiguous matching offers a compact row Choose action, not invented candidate choices", () => {
    const props = makeCombinedItem(
      0,
      { accountName: null, hasMissingInfo: true },
      {
        accountActionLabel: "Choose an account",
        accountStatusLabel: null,
        sharedSelectionDisclosure: null,
      }
    );
    renderRow(props);
    expect(getAccountAction()).toHaveProp("accessibilityRole", "button");
    expect(screen.queryByTestId("transaction-account-match")).toBeNull();
    expect(screen.queryByText("QNB Everyday")).toBeNull();
    expect(screen.queryByText("QNB Savings")).toBeNull();
    fireEvent.press(getAccountAction());
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledTimes(1);
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledWith(
      props.accountReview.rowId
    );
    expect(props.accountReview.onChooseCurrency).not.toHaveBeenCalled();
    expect(props.onToggleSelect).not.toHaveBeenCalled();
  });

  it("R3-03/04 conflicting currency uses the row's parent callback with transaction context", () => {
    const props = makeCombinedItem(
      6,
      { accountName: null, isSelected: false },
      {
        accountActionLabel: "Choose an account",
        currencyActionLabel: "Confirm currency",
        currencyContextLabel: "For Lunch at Talabat",
      }
    );
    const amount = props.transaction.amount;
    renderRow(props);
    expect(getCurrencyAction()).toHaveProp("accessibilityRole", "button");
    expect(getCurrencyAction()).toHaveTextContent("Confirm currency");
    expect(screen.queryByTestId("transaction-account-match")).toBeNull();
    expect(screen.queryByTestId("currency-picker")).toBeNull();
    fireEvent.press(getCurrencyAction());
    expect(props.accountReview.onChooseCurrency).toHaveBeenCalledWith(
      props.accountReview.rowId,
      "For Lunch at Talabat"
    );
    expect(props.accountReview.onChooseAccount).not.toHaveBeenCalled();
    expect(props.onToggleSelect).not.toHaveBeenCalled();
    expect(props.transaction.amount).toBe(amount);
  });

  it("cancel or unchanged parent props never imply a currency choice or account reassignment", () => {
    const props = makeCombinedItem(
      6,
      { accountName: null },
      {
        currencyActionLabel: "Confirm currency",
        currencyContextLabel: "For Lunch at Talabat",
      }
    );
    const view = renderRow(props);
    view.rerender(<TransactionItem {...props} />);
    expect(props.accountReview.onChooseCurrency).not.toHaveBeenCalled();
    expect(props.accountReview.onChooseAccount).not.toHaveBeenCalled();
    expect(screen.queryByTestId("transaction-account-match")).toBeNull();
    expect(screen.getByTestId("transaction-review-amount")).toBeTruthy();
  });

  it("R1-12 Arabic localized account action affects one initiating row, not a group", async () => {
    mockLanguage = "ar";
    await changeLanguage("ar");
    const props = makeCombinedItem(
      0,
      { accountName: null },
      { accountActionLabel: "اختيار حساب", accountStatusLabel: null }
    );
    renderRow(props);
    expect(getAccountAction()).toHaveProp("accessibilityRole", "button");
    expect(getAccountAction().props.accessibilityLabel).toContain(
      "اختيار حساب"
    );
    fireEvent.press(getAccountAction());
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledWith(
      props.accountReview.rowId
    );
    expect(props.accountReview.onChooseCurrency).not.toHaveBeenCalled();
  });
});

describe("#395 T021/T039 — lifecycle, accessibility, viewport and memo regressions", () => {
  it("disables choice and checkbox while Save is busy, retaining visible original details", () => {
    const props = makeCombinedItem(
      6,
      { accountName: null },
      {
        accountActionLabel: "Choose an account",
        currencyActionLabel: "Confirm currency",
        currencyContextLabel: "For Lunch at Talabat",
        isBusy: true,
      }
    );
    renderRow(props);
    const account = getAccountAction();
    const currency = getCurrencyAction();
    const checkbox = screen.getByRole("checkbox");
    for (const button of [account, currency, checkbox]) {
      expect(button).toHaveProp(
        "accessibilityState",
        expect.objectContaining({ disabled: true })
      );
      expect(button).toBeDisabled();
      fireEvent.press(button);
    }
    expect(props.accountReview.onChooseAccount).not.toHaveBeenCalled();
    expect(props.accountReview.onChooseCurrency).not.toHaveBeenCalled();
    expect(props.onToggleSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId("transaction-review-amount")).toBeTruthy();
    expect(screen.getByTestId("transaction-review-edit-action")).toBeTruthy();
  });

  it("re-enables choice when parent Save state clears without reinterpreting row source", () => {
    const busy = makeDefaultItem({}, { isBusy: true });
    const view = renderRow(busy);
    expect(getAccountAction()).toBeDisabled();
    const ready = {
      ...busy,
      accountReview: { ...busy.accountReview, isBusy: false },
    };
    view.rerender(<TransactionItem {...ready} />);
    expect(getAccountAction()).not.toBeDisabled();
    fireEvent.press(getAccountAction());
    expect(ready.accountReview.onChooseAccount).toHaveBeenCalledTimes(1);
    expect(ready.transaction).toBe(busy.transaction);
  });

  it("clears stale group status/disclosure when the parent resolves a row independently", () => {
    const group = requireReviewGroup("QNB");
    const props = makeCombinedItem(
      0,
      { accountName: group.displayName },
      {
        accountStatusLabel: group.statusLabel,
        sharedSelectionDisclosure: group.disclosureText,
      }
    );
    const view = renderRow(props);
    expect(screen.getByTestId("account-review-row-status")).toHaveTextContent(
      "Pending"
    );
    const updated = {
      ...props,
      accountName: "QNB Everyday",
      accountReview: {
        ...props.accountReview,
        accountStatusLabel: null,
        sharedSelectionDisclosure: null,
      },
    };
    view.rerender(<TransactionItem {...updated} />);
    expect(screen.queryByTestId("account-review-row-status")).toBeNull();
    expect(
      screen.queryByTestId("account-review-row-shared-disclosure")
    ).toBeNull();
    expect(screen.getByTestId("transaction-account-match")).toHaveTextContent(
      "QNB Everyday"
    );
  });

  it.each([
    [390, 1],
    [340, 1],
    [390, 1.35],
  ])(
    "keeps separate labelled account control and readable disclosure at width %i / scale %s",
    (width, fontScale) => {
      mockWindow = { width, height: 844, fontScale, scale: 1 };
      const group = requireReviewGroup("QNB");
      const props = makeCombinedItem(
        0,
        { accountName: "QNB راتب 0007 extremely long mixed-script nickname" },
        {
          accountActionLabel: "Change",
          accountStatusLabel: group.statusLabel,
          sharedSelectionDisclosure: group.disclosureText,
        }
      );
      renderRow(props);
      expect(getAccountAction()).toHaveProp("accessibilityRole", "button");
      expect(getAccountAction().props.accessibilityLabel).toEqual(
        expect.any(String)
      );
      expect(
        screen.getByTestId("account-review-row-shared-disclosure")
      ).not.toHaveProp("numberOfLines", 1);
      expect(
        screen.getByText("QNB راتب 0007 extremely long mixed-script nickname")
      ).toBeTruthy();
      expect(screen.getByTestId("transaction-review-amount")).toBeTruthy();
      // Actual row geometry/overflow at these DP values is owner-rendered NOT RUN.
    }
  );

  it("R3-15 Arabic disclosure retains QNB and three linked rows without truncated copy", async () => {
    mockLanguage = "ar";
    await changeLanguage("ar");
    const qnb = requireArabicQnb();
    const props = makeCombinedItem(
      0,
      { accountName: "QNB راتب 0007" },
      {
        accountActionLabel: "تغيير",
        accountStatusLabel: "قيد المراجعة",
        sharedSelectionDisclosure: qnb.disclosureText,
      }
    );
    renderRow(props);
    expect(
      screen.getByTestId("account-review-row-shared-disclosure")
    ).toHaveTextContent(qnb.disclosureText);
    expect(
      screen.getByTestId("account-review-row-shared-disclosure")
    ).not.toHaveProp("numberOfLines", 1);
    expect(getAccountAction().props.accessibilityLabel).toContain("تغيير");
    expect(props.accountReview.onChooseAccount).not.toHaveBeenCalled();
  });

  it("React.memo must react to a shaped status and callback replacement with legacy props stable", () => {
    const before = makeDefaultItem();
    const view = renderRow(before);
    const newChoose = jest.fn<void, [rowId: ShapedAccountReviewRow["rowId"]]>();
    const after = {
      ...before,
      accountReview: {
        ...before.accountReview,
        accountStatusLabel: "Confirmed",
        onChooseAccount: newChoose,
      },
    };
    view.rerender(<TransactionItem {...after} />);
    expect(screen.getByTestId("account-review-row-status")).toHaveTextContent(
      "Confirmed"
    );
    fireEvent.press(getAccountAction());
    expect(newChoose).toHaveBeenCalledWith(before.accountReview.rowId);
    expect(before.accountReview.onChooseAccount).not.toHaveBeenCalled();
  });

  it("keeps the original presentation and does not add invented account options or forbidden alpha touchables", () => {
    const props = makeDefaultItem();
    renderRow(props);
    expect(screen.getByTestId("transaction-review-row")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-background-dark")
    );
    expect(screen.getByTestId("transaction-review-edit-action")).toBeTruthy();
    expect(screen.queryByText("QNB Savings")).toBeNull();
    for (const target of screen.UNSAFE_getAllByType(TouchableOpacity)) {
      expect(String(target.props.className ?? "")).not.toMatch(
        /\b(?:opacity-\d+|shadow-[\w-]+|bg-[\w-]+\/\d+)/
      );
    }
  });
});
