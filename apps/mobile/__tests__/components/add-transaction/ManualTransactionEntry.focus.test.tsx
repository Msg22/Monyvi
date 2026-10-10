import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";
import { Keyboard, Pressable } from "react-native";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockCreateTransaction = jest.fn();
const mockCreateTransfer = jest.fn();
const mockCreateRecurringPayment = jest.fn();
const mockDeleteRecurringPayment = jest.fn();
const mockShowToast = jest.fn();

interface MockAccount {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly type: "CASH" | "BANK";
  readonly balance: number;
  readonly currency: "EGP" | "USD";
}

const mockAccounts: readonly MockAccount[] = [
  {
    id: "cash-1",
    name: "Cash",
    isDefault: true,
    type: "CASH",
    balance: 1000,
    currency: "EGP",
  },
  {
    id: "usd-1",
    name: "USD account",
    isDefault: false,
    type: "BANK",
    balance: 1000,
    currency: "USD",
  },
];

const mockExpenseCategories = [
  {
    id: "food",
    displayName: "Food",
    color: "#16a34a",
    icon: "restaurant-outline",
    iconLibrary: "ionicons",
    isExpense: true,
  },
] as const;

const mockIncomeCategories = [
  {
    id: "salary",
    displayName: "Salary",
    color: "#16a34a",
    icon: "cash-outline",
    iconLibrary: "ionicons",
    isIncome: true,
  },
] as const;

jest.mock("expo-router", () => ({
  useRouter: (): {
    readonly back: jest.Mock;
    readonly push: jest.Mock;
  } => ({
    back: mockBack,
    push: mockPush,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 24 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly t: (key: string, options?: Record<string, unknown>) => string;
  } => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: false } => ({ isDark: false }),
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => ({
    language: "en",
    isRTL: false,
    fontFamily: {
      regular: "Inter_400Regular",
      medium: "Inter_500Medium",
      semiBold: "Inter_600SemiBold",
      bold: "Inter_700Bold",
    },
  }),
}));

jest.mock("@/hooks/useAccounts", () => ({
  useAccounts: (): { readonly accounts: readonly MockAccount[] } => ({
    accounts: mockAccounts,
  }),
}));

jest.mock("@/hooks/useCategories", () => ({
  useCategories: (): {
    readonly expenseCategories: typeof mockExpenseCategories;
    readonly incomeCategories: typeof mockIncomeCategories;
    readonly isLoading: false;
  } => ({
    expenseCategories: mockExpenseCategories,
    incomeCategories: mockIncomeCategories,
    isLoading: false,
  }),
}));

jest.mock("@/hooks/useCategoryChildren", () => ({
  useCategoryChildren: (): { readonly children: readonly [] } => ({
    children: [],
  }),
}));

jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: (): { readonly selectedSnapshot: null } => ({
    selectedSnapshot: null,
  }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { readonly preferredCurrency: "EGP" } => ({
    preferredCurrency: "EGP",
  }),
}));

jest.mock("@/hooks/useBudgetAlert", () => ({
  useBudgetAlert: () => ({
    alert: null,
    isVisible: false,
    checkAfterTransaction: jest.fn((): Promise<boolean> => Promise.resolve(false)),
    dismiss: jest.fn(),
    viewBudget: jest.fn(),
  }),
}));

jest.mock("@/hooks/useFormScroll", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  return {
    useFormScroll: () => ({
      scrollViewRef: ReactActual.createRef(),
      getFieldRef: (): React.RefObject<null> => ReactActual.createRef(),
      onScroll: jest.fn(),
      scrollToFirstError: jest.fn(),
    }),
  };
});

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({
    showToast: mockShowToast,
  }),
}));

jest.mock("@/context/CategoriesContext", () => ({
  useCategoryLookup: (): ReadonlyMap<string, Record<string, unknown>> =>
    new Map([
      [
        "food",
        {
          id: "food",
          displayName: "Food",
          color: "#16a34a",
          icon: "restaurant-outline",
          iconLibrary: "ionicons",
        },
      ],
      [
        "salary",
        {
          id: "salary",
          displayName: "Salary",
          color: "#16a34a",
          icon: "cash-outline",
          iconLibrary: "ionicons",
        },
      ],
    ]),
}));

jest.mock("@/components/add-transaction/CategoryPicker", () => ({
  CategoryPicker: (): null => null,
}));

jest.mock("@/components/add-transaction/OptionalSection", () => ({
  OptionalSection: ({
    expanded,
    onToggleExpand,
    fields,
    onChange,
  }: {
    readonly expanded: boolean;
    readonly onToggleExpand: () => void;
    readonly fields: {
      readonly note?: string;
      readonly isRecurring: boolean;
      readonly recurringName?: string;
    };
    readonly onChange: (updates: {
      readonly note?: string;
      readonly isRecurring?: boolean;
      readonly recurringName?: string;
    }) => void;
  }): React.JSX.Element => {
    const Native =
      jest.requireActual<typeof import("react-native")>("react-native");

    return (
      <Native.View>
        <Native.Pressable
          testID="manual-optional-details-toggle"
          onPress={onToggleExpand}
        >
          <Native.Text>
            {expanded ? "hide_details" : "add_more_details"}
          </Native.Text>
        </Native.Pressable>
        {expanded ? (
          <>
            <Native.TextInput
              testID="manual-note-input"
              value={fields.note ?? ""}
              onChangeText={(note) => onChange({ note })}
            />
            <Native.Pressable
              testID="manual-enable-recurring"
              onPress={() =>
                onChange({
                  isRecurring: true,
                  recurringName: "Monthly food",
                })
              }
            >
              <Native.Text>enable recurring</Native.Text>
            </Native.Pressable>
          </>
        ) : null}
      </Native.View>
    );
  },
}));

jest.mock("@/components/common/CategoryIcon", () => ({
  CategoryIcon: (): null => null,
  CategoryIconFromModel: (): null => null,
  IconLibrary: {},
}));

jest.mock("@/components/modals/AccountSelectorModal", () => ({
  AccountSelectorModal: (): null => null,
}));

jest.mock("@/components/modals/CategorySelectorModal", () => ({
  CategorySelectorModal: (): null => null,
}));

jest.mock("@/components/ui/EmptyStateCard", () => ({
  EmptyStateCard: (): null => null,
}));

jest.mock("@/components/budget/BudgetAlertModal", () => ({
  BudgetAlertModal: (): null => null,
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (): null => null,
}));

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: {
    Light: "Light",
    Medium: "Medium",
  },
  impactAsync: jest.fn((): Promise<void> => Promise.resolve()),
}));

jest.mock("@/services/recurring-payment-service", () => ({
  createRecurringPayment: (...args: unknown[]): unknown =>
    mockCreateRecurringPayment(...args),
  deleteRecurringPayment: (...args: unknown[]): unknown =>
    mockDeleteRecurringPayment(...args),
  RECURRING_PAYMENT_SERVICE_ERROR_CODES: {
    ACCOUNT_UNAVAILABLE: "RECURRING_PAYMENT_ACCOUNT_UNAVAILABLE",
    CATEGORY_UNAVAILABLE: "RECURRING_PAYMENT_CATEGORY_UNAVAILABLE",
    INVALID_START_DATE: "RECURRING_PAYMENT_INVALID_START_DATE",
  },
}));

jest.mock("@/services/transaction-service", () => ({
  createTransaction: (...args: unknown[]): unknown =>
    mockCreateTransaction(...args),
}));

jest.mock("@/services/transfer-service", () => ({
  createTransfer: (...args: unknown[]): unknown => mockCreateTransfer(...args),
}));

import {
  ManualTransactionEntry,
  type ManualTransactionEntryHandle,
} from "@/components/add-transaction/ManualTransactionEntry";

function ManualWithHeader({
  isActive = true,
}: {
  readonly isActive?: boolean;
}): React.JSX.Element {
  const manualRef = React.useRef<ManualTransactionEntryHandle>(null);

  return (
    <>
      <Pressable
        testID="header-save"
        onPress={() => {
          void manualRef.current?.save();
        }}
      />
      <ManualTransactionEntry ref={manualRef} isActive={isActive} />
    </>
  );
}

function focusAmount(): void {
  fireEvent(screen.getByTestId("manual-amount-input"), "focus", {});
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function beginTwoSaves(
  manualRef: React.RefObject<ManualTransactionEntryHandle | null>
): Promise<void>[] {
  const saves: Promise<void>[] = [];
  act(() => {
    if (!manualRef.current) {
      throw new Error("Manual transaction handle is not mounted");
    }
    saves.push(manualRef.current.save());
    saves.push(manualRef.current.save());
  });
  return saves;
}

describe("ManualTransactionEntry compact focus contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateTransaction.mockResolvedValue({ id: "transaction-1" });
    mockCreateTransfer.mockResolvedValue(undefined);
    mockCreateRecurringPayment.mockResolvedValue({ id: "recurring-1" });
    mockDeleteRecurringPayment.mockResolvedValue(undefined);
  });

  it("starts with a regular amount field and no calculator", () => {
    render(<ManualTransactionEntry />);

    expect(screen.getByTestId("manual-amount-input")).toHaveProp(
      "showSoftInputOnFocus",
      false
    );
    expect(screen.queryByTestId("calculator-key-1")).toBeNull();
  });

  it("keeps amount focus active without dismissing the native keyboard, while closing expanded details", () => {
    const dismissSpy = jest
      .spyOn(Keyboard, "dismiss")
      .mockImplementation((): void => undefined);
    render(<ManualTransactionEntry />);

    fireEvent.press(screen.getByText("add_more_details"));
    expect(screen.getByText("hide_details")).toBeTruthy();
    expect(screen.queryByTestId("calculator-key-1")).toBeNull();

    focusAmount();

    expect(dismissSpy).not.toHaveBeenCalled();
    expect(screen.getByText("add_more_details")).toBeTruthy();
    expect(screen.getByTestId("calculator-key-1")).toBeTruthy();

    dismissSpy.mockRestore();
  });

  it("keeps direct input and calculator edits synchronized while focused", async () => {
    render(<ManualTransactionEntry />);

    focusAmount();
    fireEvent.changeText(screen.getByTestId("manual-amount-input"), "1234.5");

    expect(screen.getByTestId("manual-amount-input")).toHaveDisplayValue(
      "1,234.5"
    );
    expect(screen.getByTestId("calculator-key-1")).toBeTruthy();

    fireEvent.press(screen.getByTestId("calculator-key-plus"));
    fireEvent.press(screen.getByTestId("calculator-key-2"));
    fireEvent.press(screen.getByTestId("calculator-key-equals"));

    await waitFor(() =>
      expect(screen.getByTestId("manual-amount-input")).toHaveDisplayValue(
        "1,236.5"
      )
    );
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it("evaluates on Done, dismisses the calculator, and never saves", async () => {
    render(<ManualTransactionEntry />);

    focusAmount();
    fireEvent.press(screen.getByTestId("calculator-key-2"));
    fireEvent.press(screen.getByTestId("calculator-key-plus"));
    fireEvent.press(screen.getByTestId("calculator-key-3"));
    fireEvent.press(screen.getByTestId("calculator-key-done"));

    await waitFor(() =>
      expect(screen.getByTestId("manual-amount-input")).toHaveDisplayValue("5")
    );
    expect(screen.queryByTestId("calculator-key-1")).toBeNull();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockCreateTransfer).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("keeps header Save as the only persistence action", async () => {
    render(<ManualWithHeader />);

    fireEvent.changeText(screen.getByTestId("manual-amount-input"), "1");
    fireEvent.press(screen.getByTestId("header-save"));

    await waitFor(() =>
      expect(mockCreateTransaction).toHaveBeenCalledTimes(1)
    );
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1,
        currency: "EGP",
        accountId: "cash-1",
        categoryId: "food",
        source: "MANUAL",
        type: "EXPENSE",
      })
    );
  });

  it("coalesces rapid imperative ordinary transaction saves while the first write is pending", async () => {
    const write = createDeferred<{ readonly id: string }>();
    mockCreateTransaction.mockImplementation(() => write.promise);
    const manualRef = React.createRef<ManualTransactionEntryHandle>();
    render(<ManualTransactionEntry ref={manualRef} />);

    fireEvent.changeText(screen.getByTestId("manual-amount-input"), "1");
    const saves = beginTwoSaves(manualRef);

    await waitFor(() => expect(mockCreateTransaction).toHaveBeenCalled());
    await act(async () => {
      write.resolve({ id: "transaction-1" });
      await Promise.all(saves);
    });

    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
  });

  it("coalesces rapid imperative transfer saves while the first write is pending", async () => {
    const write = createDeferred<void>();
    mockCreateTransfer.mockImplementation(() => write.promise);
    const manualRef = React.createRef<ManualTransactionEntryHandle>();
    render(<ManualTransactionEntry ref={manualRef} />);

    fireEvent.press(screen.getByTestId("type-tab-TRANSFER"));
    fireEvent.changeText(screen.getByTestId("manual-amount-input"), "10");
    const targetInput = await screen.findByTestId(
      "manual-transfer-target-amount-input"
    );
    fireEvent.changeText(targetInput, "20");

    const saves = beginTwoSaves(manualRef);

    await waitFor(() => expect(mockCreateTransfer).toHaveBeenCalled());
    await act(async () => {
      write.resolve(undefined);
      await Promise.all(saves);
    });

    expect(mockCreateTransfer).toHaveBeenCalledTimes(1);
  });

  it("coalesces recurring creation and its linked transaction during rapid imperative saves", async () => {
    const recurringWrite = createDeferred<{ readonly id: string }>();
    mockCreateRecurringPayment.mockImplementation(() => recurringWrite.promise);
    const manualRef = React.createRef<ManualTransactionEntryHandle>();
    render(<ManualTransactionEntry ref={manualRef} />);

    fireEvent.changeText(screen.getByTestId("manual-amount-input"), "1");
    fireEvent.press(screen.getByText("add_more_details"));
    fireEvent.press(screen.getByTestId("manual-enable-recurring"));

    const saves = beginTwoSaves(manualRef);

    await waitFor(() =>
      expect(mockCreateRecurringPayment).toHaveBeenCalled()
    );
    await act(async () => {
      recurringWrite.resolve({ id: "recurring-1" });
      await Promise.all(saves);
    });

    expect(mockCreateRecurringPayment).toHaveBeenCalledTimes(1);
    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ linkedRecurringId: "recurring-1" })
    );
  });

  it("releases the save lock after a rejected write so an explicit retry can succeed", async () => {
    mockCreateTransaction
      .mockRejectedValueOnce(new Error("transaction write failed"))
      .mockResolvedValueOnce({ id: "transaction-2" });
    const manualRef = React.createRef<ManualTransactionEntryHandle>();
    render(<ManualTransactionEntry ref={manualRef} />);

    fireEvent.changeText(screen.getByTestId("manual-amount-input"), "1");

    await act(async () => {
      await manualRef.current?.save();
    });
    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();

    await act(async () => {
      await manualRef.current?.save();
    });

    expect(mockCreateTransaction).toHaveBeenCalledTimes(2);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("dismisses the ordinary keyboard on deactivation while retaining the optional draft and never saving", async () => {
    const dismissSpy = jest
      .spyOn(Keyboard, "dismiss")
      .mockImplementation((): void => undefined);
    const view = render(<ManualTransactionEntry isActive />);

    fireEvent.press(screen.getByText("add_more_details"));
    const noteInput = screen.getByTestId("manual-note-input");
    fireEvent(noteInput, "focus", {});
    fireEvent.changeText(noteInput, "Coffee note");

    expect(noteInput).toHaveDisplayValue("Coffee note");

    view.rerender(<ManualTransactionEntry isActive={false} />);

    await waitFor(() => expect(dismissSpy).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("manual-note-input")).toHaveDisplayValue(
      "Coffee note"
    );
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockCreateTransfer).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();

    dismissSpy.mockRestore();
  });

  it("dismisses focus when Manual deactivates without destroying the draft", async () => {
    const view = render(<ManualTransactionEntry isActive />);

    focusAmount();
    fireEvent.changeText(screen.getByTestId("manual-amount-input"), "12");
    expect(screen.getByTestId("calculator-key-1")).toBeTruthy();

    view.rerender(<ManualTransactionEntry isActive={false} />);

    await waitFor(() =>
      expect(screen.queryByTestId("calculator-key-1")).toBeNull()
    );
    expect(screen.getByTestId("manual-amount-input")).toHaveDisplayValue("12");

    view.rerender(<ManualTransactionEntry isActive />);

    expect(screen.getByTestId("manual-amount-input")).toHaveDisplayValue("12");
    expect(screen.queryByTestId("calculator-key-1")).toBeNull();
  });

  it("keeps source and target transfer focus independent and saves the edited conversion", async () => {
    render(<ManualWithHeader />);

    fireEvent.press(screen.getByTestId("type-tab-TRANSFER"));

    const sourceInput = screen.getByTestId("manual-amount-input");
    expect(
      screen.getByTestId("manual-amount-input-trailing-adornment")
    ).toHaveTextContent("EGP");

    fireEvent(sourceInput, "focus", {});
    fireEvent.changeText(sourceInput, "10");
    fireEvent.press(screen.getByTestId("calculator-key-done"));

    const targetInput = await screen.findByTestId(
      "manual-transfer-target-amount-input"
    );
    expect(targetInput).toHaveProp("showSoftInputOnFocus", false);
    expect(
      screen.getByTestId(
        "manual-transfer-target-amount-input-trailing-adornment"
      )
    ).toHaveTextContent("USD");

    fireEvent(targetInput, "focus", {});
    fireEvent.press(screen.getByTestId("calculator-key-2"));
    fireEvent.press(screen.getByTestId("calculator-key-0"));
    fireEvent.press(screen.getByTestId("calculator-key-done"));

    await waitFor(() => expect(targetInput).toHaveDisplayValue("20"));
    expect(sourceInput).toHaveDisplayValue("10");
    expect(mockCreateTransfer).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("header-save"));

    await waitFor(() => expect(mockCreateTransfer).toHaveBeenCalledTimes(1));
    expect(mockCreateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10,
        currency: "EGP",
        fromAccountId: "cash-1",
        toAccountId: "usd-1",
        convertedAmount: 20,
        exchangeRate: 2,
      })
    );
  });
});
