import { fireEvent, render } from "@testing-library/react-native";

import { TransactionEditModal } from "@/components/transaction-review/edit-modal/TransactionEditModal";

const mockSetIsAccountPickerOpen = jest.fn();
const mockSetIsCategoryPickerOpen = jest.fn();
const mockSetIsCurrencyPickerOpen = jest.fn();
const mockHandleSave = jest.fn();
const mockHandleSelectAccount = jest.fn();

jest.mock("@/hooks/useModalBottomInset", () => ({
  useModalBottomInset: (): number => 16,
}));

jest.mock("@/hooks/useTransactionEditState", () => ({
  useTransactionEditState: () => ({
    state: {
      amount: "490",
      note: "",
      counterparty: "Fawry Market",
      txType: "EXPENSE",
      selectedAccountId: "account-1",
      selectedAccountName: "QNB Savings Account",
      isAccountPickerOpen: false,
      formErrors: {},
      isCreatingNew: false,
      newAccountName: "QNB EGYPT",
      newAccountError: null,
      selectedToAccountId: null,
      selectedToAccountName: "",
      newToAccountName: "Cash",
      isToAccountPickerOpen: false,
      isCreatingNewToAccount: false,
      isCategoryPickerOpen: false,
      selectedCategoryId: "category-1",
      selectedCategoryDisplayName: "Shopping",
      relevantCategories: [],
      accountOptions: [
        {
          id: "account-1",
          name: "QNB Savings Account",
          currency: "EGP",
          isPending: false,
          type: "BANK",
        },
      ],
      hasBankAccounts: true,
      cashAccountOptions: [],
      hasCashAccounts: false,
      selectedAccountCurrency: "EGP",
      hasCurrencyMismatch: false,
      formConfig: {
        showTypeToggle: true,
        showCategory: true,
        showCounterparty: true,
        showToAccount: false,
        sourceTypeBadge: null,
      },
      matchingAccounts: [],
      otherAccounts: [],
      showSectionHeaders: false,
      isCurrencyLocked: false,
      isCurrencyPickerOpen: false,
      newAccountCurrency: "EGP",
    },
    setters: {
      setAmount: jest.fn(),
      setNote: jest.fn(),
      setCounterparty: jest.fn(),
      setTxType: jest.fn(),
      setIsAccountPickerOpen: mockSetIsAccountPickerOpen,
      setNewAccountName: jest.fn(),
      setIsCategoryPickerOpen: mockSetIsCategoryPickerOpen,
      setSelectedCategoryId: jest.fn(),
      setSelectedToAccountId: jest.fn(),
      setSelectedToAccountName: jest.fn(),
      setIsToAccountPickerOpen: jest.fn(),
      setNewToAccountName: jest.fn(),
      setFormErrors: jest.fn(),
      setIsCurrencyPickerOpen: mockSetIsCurrencyPickerOpen,
    },
    accountHandlers: {
      handleStartNew: jest.fn(),
      handleCancelNew: jest.fn(),
      handleStartNewToAccount: jest.fn(),
      handleCancelNewToAccount: jest.fn(),
      handleSave: mockHandleSave,
      handleSelectAccount: mockHandleSelectAccount,
      handleCurrencySelect: jest.fn(),
    },
  }),
}));

jest.mock("@/components/add-transaction/TypeTabs", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { TypeTabs: () => <View testID="legacy-type-tabs" /> };
});

jest.mock("@/components/transaction-review/edit-modal/AccountSelector", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { AccountSelector: () => <View testID="legacy-account-selector" /> };
});

jest.mock("@/components/modals/CategorySelectorModal", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { CategorySelectorModal: () => <Text>category-sheet</Text> };
});

jest.mock("@/components/currency/CurrencyPicker", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { CurrencyPicker: () => <Text>currency-sheet</Text> };
});

const transaction = {
  amount: 490,
  currency: "EGP",
  type: "EXPENSE",
  counterparty: "Fawry Market",
  date: new Date("2026-07-20T09:12:00.000Z"),
  smsFingerprint: "fp-1",
  senderDisplayName: "QNB EGYPT",
  categoryId: "category-1",
  categoryDisplayName: "Shopping",
  rawSmsBody: "Purchase EGP 490 at Fawry Market",
  confidence: 0.95,
  source: "SMS",
  originLabel: "QNB EGYPT",
} as const;

const baseProps = {
  visible: true,
  transaction,
  currentAccountName: "QNB Savings Account",
  currentAccountId: "account-1",
  accounts: [],
  pendingAccounts: [],
  latestRates: null,
  categoryMap: new Map(),
  expenseCategories: [],
  incomeCategories: [],
  onSave: jest.fn(),
  onCreatePendingAccount: jest.fn(),
  onClose: jest.fn(),
} as const;

describe("TransactionEditModal SMS workspace", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders the approved bounded grouped fields without type tabs", () => {
    const view = render(
      <TransactionEditModal {...baseProps} sourceVariant="sms" />
    );

    expect(view.getByTestId("sms-edit-provider-identity")).toBeTruthy();
    expect(view.getByTestId("sms-edit-fields")).toBeTruthy();
    expect(view.getByTestId("sms-edit-amount")).toBeTruthy();
    expect(view.getByTestId("sms-edit-merchant")).toBeTruthy();
    expect(view.getByTestId("sms-edit-category")).toBeTruthy();
    expect(view.getByTestId("sms-edit-account")).toBeTruthy();
    expect(view.getByTestId("sms-edit-currency")).toBeTruthy();
    expect(view.queryByTestId("legacy-type-tabs")).toBeNull();
    expect(view.queryByTestId("legacy-account-selector")).toBeNull();
  });

  it("opens selector sheets from the visible grouped rows", () => {
    const view = render(
      <TransactionEditModal {...baseProps} sourceVariant="sms" />
    );

    fireEvent.press(view.getByTestId("sms-edit-category"));
    fireEvent.press(view.getByTestId("sms-edit-account"));
    fireEvent.press(view.getByTestId("sms-edit-currency"));

    expect(mockSetIsCategoryPickerOpen).toHaveBeenCalledWith(true);
    expect(mockSetIsAccountPickerOpen).toHaveBeenCalledWith(true);
    expect(mockSetIsCurrencyPickerOpen).toHaveBeenCalledWith(true);
  });
});

describe("TransactionEditModal existing voice workspace", () => {
  it("preserves the existing type tabs and account editor", () => {
    const voiceTransaction = {
      ...transaction,
      source: "VOICE",
      note: "Weekly groceries",
    } as const;
    const view = render(
      <TransactionEditModal {...baseProps} transaction={voiceTransaction} />
    );

    expect(view.getByTestId("legacy-type-tabs")).toBeTruthy();
    expect(view.getByTestId("legacy-account-selector")).toBeTruthy();
    expect(view.queryByTestId("sms-edit-fields")).toBeNull();
    expect(view.getByPlaceholderText("note_edit_placeholder")).toBeTruthy();
  });
});
