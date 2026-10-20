/**
 * #395 post-implementation canonical/legacy TransactionItem row regression.
 * Exercises real row/pencil behavior and pure pending checkbox classification.
 * Parent callbacks do not stand in for financial Save or native geometry.
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
import React from "react";
import { TouchableOpacity } from "react-native";

import { TransactionItem } from "@/components/transaction-review/TransactionItem";
import { SharedAccountSuggestions } from "@/components/transaction-review/SharedAccountSuggestions";
import { compactReviewCheckboxAction } from "@/components/transaction-review/compact-review-checkbox-action";
import { makeDefaultInfoSession } from "./account-review-default-info-test-fixtures";
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
import { makeT025ReviewSession } from "../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";

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

/** React Native press handlers receive an event; fireEvent does not create it. */
function pressNative(
  target: ReturnType<typeof screen.getByTestId>
): jest.Mock<void, []> {
  const stopPropagation = jest.fn<void, []>();
  fireEvent.press(target, { stopPropagation });
  return stopPropagation;
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
      within(
        screen.getByTestId("account-review-account-type-icon", {
          includeHiddenElements: true,
        })
      ).UNSAFE_getByProps({ name: "business-outline" }).props.name
    ).toBe("business-outline");
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
    const accountStopPropagation = pressNative(accountAction);
    expect(accountStopPropagation).toHaveBeenCalledTimes(1);
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledTimes(1);
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledWith(
      props.accountReview.rowId
    );
    expect(props.onPress).not.toHaveBeenCalled();
    expect(props.onToggleSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("transaction-review-amount")).toBeTruthy();
  });

  it("canonical SMS close keeps its original index and selection, and ignores a busy row", () => {
    const sms = makeT025ReviewSession().rows[0];
    if (!sms || sms.source !== "SMS")
      throw new Error("Missing canonical SMS source row");
    const onDiscard = jest.fn<void, [number, boolean]>();
    const props = makeDefaultItem({
      transaction: sms.transaction,
      index: 4,
      isSelected: true,
      isSmsWorkspace: true,
      onDiscard,
    });
    const rendered = renderRow(props);
    const close = screen.getByTestId("sms-review-discard-4");
    expect(close).toHaveProp("accessibilityRole", "button");
    expect(close.props.accessibilityLabel).toEqual(expect.any(String));
    expect(close).toHaveProp("accessibilityState", { disabled: false });
    const stopPropagation = jest.fn<void, []>();
    fireEvent.press(close, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledWith(4, true);
    expect(props.onPress).not.toHaveBeenCalled();
    expect(props.onToggleSelect).not.toHaveBeenCalled();

    rendered.rerender(
      <TransactionItem
        {...props}
        accountReview={{ ...props.accountReview, isBusy: true }}
      />
    );
    const busyClose = screen.getByTestId("sms-review-discard-4");
    expect(busyClose).toHaveProp("accessibilityState", { disabled: true });
    fireEvent.press(busyClose, { stopPropagation: jest.fn<void, []>() });
    expect(onDiscard).toHaveBeenCalledTimes(1);

    rendered.rerender(
      <TransactionItem
        {...makeDefaultItem({ isSmsWorkspace: true, onDiscard })}
      />
    );
    expect(screen.queryByTestId("sms-review-discard-4")).toBeNull();
  });

  it("canonical account icon is not guessed from Voice or SMS origin", () => {
    const sourceActions = {
      accountType: "CASH" as const,
      accountActionLabel: "Change",
    };
    const props = makeDefaultItem({}, sourceActions);
    renderRow(props);
    expect(
      within(
        screen.getByTestId("account-review-account-type-icon", {
          includeHiddenElements: true,
        })
      ).UNSAFE_getByProps({ name: "cash-outline" }).props.name
    ).toBe("cash-outline");
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
    pressNative(getAccountAction());
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
    pressNative(getAccountAction());
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
    pressNative(getAccountAction());
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
    pressNative(getAccountAction());
    expect(props.onPress).toHaveBeenCalledTimes(1);
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledTimes(1);
  });
});

describe("#395 T021 — independently shaped pending/confirmed/removed group rows", () => {
  it("canonical checkbox eligibility routes pending group to explicit confirmation, not selection", () => {
    const session = makeDefaultInfoSession("r3-combined-en");
    const pending = session.groups.find((group) => group.status === "pending");
    const row = session.rows.find(
      (item) =>
        pending &&
        item.assignment.state === "suggested" &&
        item.assignment.groupId === pending.groupId
    );
    if (!pending || !row)
      throw new Error("Missing canonical pending shared group");
    const groups = new Map(
      session.groups.map((group) => [group.groupId, group])
    );
    expect(compactReviewCheckboxAction(row, groups)).toBe("confirm_group");
    expect(row.selected).toBe(false);
    expect(
      session.groups.find((group) => group.groupId === pending.groupId)?.status
    ).toBe("pending");

    const defaultSession = makeDefaultInfoSession("r3-default-only");
    const eligible = defaultSession.rows.find(
      (item) =>
        item.assignment.state === "existing" && item.reviewReasons.length === 0
    );
    if (!eligible) throw new Error("Missing default-origin eligible row");
    expect(compactReviewCheckboxAction(eligible, new Map())).toBe("select");
  });

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
      onDiscardRemoved: jest.fn<void, [groupId: string]>(),
      onViewLinked: jest.fn<void, [groupId: string]>(),
    };
    const overview = makeSharedPresentation("r3-combined-en");
    render(
      <>
        <SharedAccountSuggestions
          groups={overview.groups}
          summary={overview.summary}
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
    // New compact details stay collapsed until the user expands them.
    const summary = screen.getByTestId("account-review-compact-summary-toggle");
    expect(summary).toHaveProp("accessibilityState", { expanded: false });
    expect(
      screen.queryByTestId("account-review-group-confirm-" + group.groupId)
    ).toBeNull();
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
    fireEvent.press(summary);
    expect(summary).toHaveProp("accessibilityState", { expanded: true });
    expect(
      screen.getByTestId("account-review-group-confirm-" + group.groupId)
    ).toBeTruthy();
    expect(groupActions.onConfirm).not.toHaveBeenCalled();
    fireEvent.press(
      screen.getByTestId("account-review-group-confirm-" + group.groupId)
    );
    expect(groupActions.onConfirm).toHaveBeenCalledTimes(1);
    expect(groupActions.onConfirm).toHaveBeenCalledWith(group.groupId);
    expect(onSelect).toHaveBeenCalledTimes(1);
    // This legacy TransactionItem callback does not itself issue a canonical
    // select_row command. The canonical pending-checkbox interception is
    // separately guarded by the review container.
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
    pressNative(getAccountAction());
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
    pressNative(getAccountAction());
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledTimes(1);
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledWith(
      props.accountReview.rowId
    );
    expect(props.accountReview.onChooseCurrency).not.toHaveBeenCalled();
    expect(props.onToggleSelect).not.toHaveBeenCalled();
  });

  it("an unresolved currency uses one account pencil, never a standalone currency action", () => {
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
    expect(
      screen.queryByTestId("account-review-row-currency-action")
    ).toBeNull();
    pressNative(getAccountAction());
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledWith(
      props.accountReview.rowId
    );
    expect(props.accountReview.onChooseCurrency).not.toHaveBeenCalled();
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
    pressNative(getAccountAction());
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledWith(
      props.accountReview.rowId
    );
    expect(props.accountReview.onChooseCurrency).not.toHaveBeenCalled();
  });
});

describe("#395 isolated account and category pencil interactions", () => {
  it("only the quiet adjacent pencil opens the account", () => {
    const props = makeDefaultItem();
    renderRow(props);
    const pair = screen.getByTestId("account-review-account-name-and-pencil");
    expect(within(pair).getByTestId("transaction-account-match")).toBeTruthy();
    expect(
      within(pair).getByTestId("account-review-row-account-action")
    ).toHaveProp("accessibilityRole", "button");
    fireEvent.press(screen.getByTestId("transaction-account-match"), {
      stopPropagation: jest.fn<void, []>(),
    });
    expect(props.accountReview.onChooseAccount).not.toHaveBeenCalled();
    // The static label still belongs to the parent row; isolate its tap from
    // the pencil so we check that only the pencil stops parent propagation.
    expect(props.onPress).toHaveBeenCalledTimes(1);
    jest.mocked(props.onPress).mockClear();
    const stopped = pressNative(getAccountAction());
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(props.accountReview.onChooseAccount).toHaveBeenCalledTimes(1);
    expect(props.onToggleSelect).not.toHaveBeenCalled();
    expect(props.onPress).not.toHaveBeenCalled();
  });

  it("category pencil forwards only this canonical row ID without editing or selecting", () => {
    const props = makeCombinedItem(1);
    const onEditCategory = jest.fn();
    renderRow({
      ...props,
      accountReview: {
        ...props.accountReview,
        canEditCategory: true,
        onEditCategory,
      },
    });
    const categoryPair = screen.getByTestId(
      "account-review-category-name-and-pencil"
    );
    const action = within(categoryPair).getByTestId(
      "account-review-row-category-pencil"
    );
    expect(action).toHaveProp("accessibilityRole", "button");
    const stopped = pressNative(action);
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(onEditCategory).toHaveBeenCalledTimes(1);
    expect(onEditCategory).toHaveBeenCalledWith(props.accountReview.rowId);
    expect(props.onPress).not.toHaveBeenCalled();
    expect(props.onToggleSelect).not.toHaveBeenCalled();
    expect(props.accountReview.onChooseAccount).not.toHaveBeenCalled();
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
    const checkbox = screen.getByRole("checkbox");
    expect(
      screen.queryByTestId("account-review-row-currency-action")
    ).toBeNull();
    for (const button of [account, checkbox]) {
      expect(button).toHaveProp(
        "accessibilityState",
        expect.objectContaining({ disabled: true })
      );
      expect(button).toBeDisabled();
      pressNative(button);
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
    pressNative(getAccountAction());
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
    pressNative(getAccountAction());
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
