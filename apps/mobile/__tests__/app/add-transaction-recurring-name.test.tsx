import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { Dimensions, ScrollView, Switch, View } from "react-native";

const mockBack = jest.fn();
const mockShowToast = jest.fn();
const mockNativeScrollTo = jest.fn<void, Parameters<ScrollView["scrollTo"]>>();
const mockViewportRef = React.createRef<View>();
let mockFormScroll: ReturnType<typeof import("@/hooks/useFormScroll").useFormScroll> | undefined;

// Keep the real scrolling logic; only native measurement is supplied by the tests.
jest.mock("@/hooks/useFormScroll", () => {
  const actual = jest.requireActual<typeof import("@/hooks/useFormScroll")>("@/hooks/useFormScroll");
  return {
    useFormScroll: (
      options: Parameters<typeof actual.useFormScroll>[0]
    ): ReturnType<typeof actual.useFormScroll> => {
      const result = actual.useFormScroll(options);
      mockFormScroll = result;
      return result;
    },
  };
});

jest.mock("expo-router", () => ({
  useRouter: (): { readonly back: jest.Mock; readonly push: jest.Mock } => ({
    back: mockBack,
    push: jest.fn(),
  }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 0 }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));
jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: (): null => null,
}));
jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: false } => ({ isDark: false }),
}));
jest.mock("@/hooks/useAccounts", () => {
  const accounts = [{
    id: "account-1", name: "Cash", isDefault: true,
    type: "CASH", balance: 1000, currency: "EGP",
  }];
  return { useAccounts: (): { readonly accounts: typeof accounts } => ({ accounts }) };
});
jest.mock("@/hooks/useCategories", () => {
  const expenseCategories = [{
    id: "category-1", displayName: "Internet", icon: "wifi-outline",
    iconLibrary: "Ionicons", color: null, isExpense: true,
  }];
  return {
    useCategories: (): {
      readonly expenseCategories: typeof expenseCategories;
      readonly incomeCategories: readonly [];
      readonly isLoading: false;
    } => ({ expenseCategories, incomeCategories: [], isLoading: false }),
  };
});
jest.mock("@/context/CategoriesContext", () => ({
  useCategoryLookup: (): ReadonlyMap<string, never> => new Map<string, never>(),
}));
jest.mock("@/hooks/useCategoryChildren", () => ({
  useCategoryChildren: (): { readonly children: readonly [] } => ({ children: [] }),
}));
jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: (): { readonly latestRates: null } => ({ latestRates: null }),
}));
jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { readonly preferredCurrency: "EGP" } => ({ preferredCurrency: "EGP" }),
}));
jest.mock("@/hooks/useBudgetAlert", () => ({
  useBudgetAlert: (): {
    readonly alert: null;
    readonly isVisible: false;
    readonly checkAfterTransaction: () => Promise<boolean>;
    readonly dismiss: () => void;
    readonly viewBudget: () => void;
  } => ({
    alert: null, isVisible: false,
    checkAfterTransaction: (): Promise<boolean> => Promise.resolve(false),
    dismiss: (): void => undefined,
    viewBudget: (): void => undefined,
  }),
}));
jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({ showToast: mockShowToast }),
}));
jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (props: React.ComponentProps<typeof import("@/components/navigation/PageHeader").PageHeader>): React.JSX.Element => {
    const Native = jest.requireActual<typeof import("react-native")>("react-native");
    return <Native.Pressable testID="header-save" onPress={props.rightAction?.onPress} />;
  },
}));
jest.mock("@/components/add-transaction/CalculatorKeypad", () => ({
  CalculatorKeypad: (props: React.ComponentProps<typeof import("@/components/add-transaction/CalculatorKeypad").CalculatorKeypad>): React.JSX.Element => {
    const Native = jest.requireActual<typeof import("react-native")>("react-native");
    return <Native.View>
      <Native.Pressable testID="key-1" onPress={() => void props.onKeyPress("1")} />
      <Native.Pressable testID="key-done" onPress={() => void props.onKeyPress("DONE")} />
    </Native.View>;
  },
}));
jest.mock("@/components/add-transaction/AmountDisplay", () => ({ AmountDisplay: (): null => null }));
jest.mock("@/components/add-transaction/TypeTabs", () => ({ TypeTabs: (): null => null }));
jest.mock("@/components/add-transaction/CategoryPicker", () => ({ CategoryPicker: (): null => null }));
jest.mock("@/components/add-transaction/TransferFields", () => ({ TransferFields: (): null => null }));
jest.mock("@/components/common/CategoryIcon", () => ({ CategoryIcon: (): null => null }));
jest.mock("@/components/modals/AccountSelectorModal", () => ({ AccountSelectorModal: (): null => null }));
jest.mock("@/components/modals/CategorySelectorModal", () => ({ CategorySelectorModal: (): null => null }));
jest.mock("@/components/ui/EmptyStateCard", () => ({ EmptyStateCard: (): null => null }));
jest.mock("@/components/budget/BudgetAlertModal", () => ({ BudgetAlertModal: (): null => null }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: (): null => null }));
jest.mock("@/services/recurring-payment-service", () => ({
  createRecurringPayment: jest.fn(),
  deleteRecurringPayment: jest.fn(),
  RECURRING_PAYMENT_SERVICE_ERROR_CODES: {
    ACCOUNT_UNAVAILABLE: "RECURRING_PAYMENT_ACCOUNT_UNAVAILABLE",
    CATEGORY_UNAVAILABLE: "RECURRING_PAYMENT_CATEGORY_UNAVAILABLE",
    INVALID_START_DATE: "RECURRING_PAYMENT_INVALID_START_DATE",
  },
}));
jest.mock("@/services/transaction-service", () => ({ createTransaction: jest.fn() }));
jest.mock("@/services/transfer-service", () => ({ createTransfer: jest.fn() }));

import AddTransaction from "@/app/(private)/add-transaction";

const recurring = jest.requireMock<{ readonly createRecurringPayment: jest.Mock }>("@/services/recurring-payment-service");
const transactions = jest.requireMock<{ readonly createTransaction: jest.Mock }>("@/services/transaction-service");

function enableRecurring(): void {
  fireEvent.press(screen.getByText("add_more_details"));
  fireEvent(screen.UNSAFE_getAllByType(Switch)[0], "valueChange", true);
}

function enterRecurringName(name: string): void {
  fireEvent.changeText(screen.getByPlaceholderText("recurring_name_placeholder"), name);
}

function renderScrollableForm(): void {
  render(<View ref={mockViewportRef}><AddTransaction /></View>);
}

function measureField(
  field: "amount" | "recurringName",
  y: number,
  viewport?: { readonly top: number; readonly height: number }
): void {
  const scrollView = mockFormScroll?.scrollViewRef.current;
  const fieldView = mockFormScroll?.getFieldRef(field).current;
  const viewportView = mockViewportRef.current;
  if (scrollView && viewportView) {
    jest.spyOn(scrollView, "scrollTo").mockImplementation(mockNativeScrollTo);
    // Supply native layout through the public ScrollView host-ref contract.
    scrollView.getNativeScrollRef = (): ReturnType<ScrollView["getNativeScrollRef"]> => viewportView;
    jest.spyOn(viewportView, "measureInWindow").mockImplementation((callback): void => {
      callback(0, viewport?.top ?? 0, 300, viewport?.height ?? Dimensions.get("window").height);
    });
  }
  if (fieldView) {
    jest.spyOn(fieldView, "measureInWindow").mockImplementation((callback) => {
      callback(0, y, 300, 100);
    });
  }
}

function flushScrollFrames(): void {
  act(() => { jest.advanceTimersByTime(50); });
}

describe("Add Transaction recurring-name QA", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    recurring.createRecurringPayment.mockReset().mockResolvedValue({ id: "recurring-1" });
    transactions.createTransaction.mockReset().mockResolvedValue({ id: "transaction-1" });
  });

  it.each(["", "   "])("blocks both writes for blank recurring name %p", async (name) => {
    render(<AddTransaction />);
    fireEvent.press(screen.getByTestId("key-1"));
    enableRecurring();
    enterRecurringName(name);
    fireEvent.press(screen.getByTestId("header-save"));

    await waitFor(() => expect(screen.getByText("recurring_name_required")).toBeTruthy());
    expect(recurring.createRecurringPayment).not.toHaveBeenCalled();
    expect(transactions.createTransaction).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("marks the visible recurring name as required", () => {
    render(<AddTransaction />);
    enableRecurring();
    expect(screen.getByText("recurring_name_label *")).toBeTruthy();
  });

  it("clears the error after correction and creates a linked transaction exactly once", async () => {
    render(<AddTransaction />);
    fireEvent.press(screen.getByTestId("key-1"));
    enableRecurring();
    fireEvent.press(screen.getByTestId("header-save"));
    await waitFor(() => expect(screen.getByText("recurring_name_required")).toBeTruthy());

    enterRecurringName("  Internet bill  ");
    expect(screen.queryByText("recurring_name_required")).toBeNull();
    fireEvent.press(screen.getByTestId("header-save"));

    await waitFor(() => expect(transactions.createTransaction).toHaveBeenCalledTimes(1));
    expect(recurring.createRecurringPayment).toHaveBeenCalledTimes(1);
    expect(recurring.createRecurringPayment).toHaveBeenCalledWith(expect.objectContaining({
      name: "Internet bill", initialOccurrenceRecorded: true,
    }));
    expect(transactions.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      amount: 1, linkedRecurringId: "recurring-1",
    }));
  });

  it("reopens collapsed details when DONE finds a missing recurring name", async () => {
    render(<AddTransaction />);
    fireEvent.press(screen.getByTestId("key-1"));
    enableRecurring();
    fireEvent.press(screen.getByText("hide_details"));
    expect(screen.queryByPlaceholderText("recurring_name_placeholder")).toBeNull();
    fireEvent.press(screen.getByTestId("key-done"));

    await waitFor(() => expect(screen.getByText("recurring_name_required")).toBeTruthy());
    expect(screen.getByPlaceholderText("recurring_name_placeholder")).toBeTruthy();
    expect(recurring.createRecurringPayment).not.toHaveBeenCalled();
    expect(transactions.createTransaction).not.toHaveBeenCalled();
  });

  it("allows a normal unnamed transaction after recurring is disabled", async () => {
    render(<AddTransaction />);
    fireEvent.press(screen.getByTestId("key-1"));
    enableRecurring();
    fireEvent.press(screen.getByTestId("header-save"));
    await waitFor(() => expect(screen.getByText("recurring_name_required")).toBeTruthy());
    fireEvent(screen.UNSAFE_getAllByType(Switch)[0], "valueChange", false);
    expect(screen.queryByText("recurring_name_required")).toBeNull();
    fireEvent.press(screen.getByTestId("header-save"));

    await waitFor(() => expect(transactions.createTransaction).toHaveBeenCalledTimes(1));
    expect(recurring.createRecurringPayment).not.toHaveBeenCalled();
    expect(transactions.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      linkedRecurringId: undefined,
    }));
  });

  describe("validation viewport recovery", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockFormScroll = undefined;
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    it("scrolls to an offscreen recurring name after header Save, including repeated attempts", () => {
      renderScrollableForm();
      fireEvent.press(screen.getByTestId("key-1"));
      enableRecurring();
      fireEvent.press(screen.getByTestId("header-save"));
      measureField("recurringName", Dimensions.get("window").height + 100);
      flushScrollFrames();

      expect(screen.getByText("recurring_name_required")).toBeTruthy();
      expect(mockNativeScrollTo).toHaveBeenCalledWith({ y: 224, animated: true });
      expect(recurring.createRecurringPayment).not.toHaveBeenCalled();
      expect(transactions.createTransaction).not.toHaveBeenCalled();

      mockNativeScrollTo.mockClear();
      fireEvent.press(screen.getByTestId("header-save"));
      flushScrollFrames();
      expect(mockNativeScrollTo).toHaveBeenCalledWith({ y: 224, animated: true });
    });

    it.each(["header-save", "key-done"])("reveals and scrolls to a collapsed recurring name after %s", (button) => {
      renderScrollableForm();
      fireEvent.press(screen.getByTestId("key-1"));
      enableRecurring();
      fireEvent.press(screen.getByText("hide_details"));
      fireEvent.press(screen.getByTestId(button));
      measureField("recurringName", Dimensions.get("window").height + 100);
      flushScrollFrames();

      expect(screen.getByPlaceholderText("recurring_name_placeholder")).toBeTruthy();
      expect(screen.getByText("recurring_name_required")).toBeTruthy();
      expect(mockNativeScrollTo).toHaveBeenCalledWith({ y: 224, animated: true });
      expect(recurring.createRecurringPayment).not.toHaveBeenCalled();
      expect(transactions.createTransaction).not.toHaveBeenCalled();
    });

    it("scrolls to the earlier amount error rather than the later recurring name", () => {
      renderScrollableForm();
      enableRecurring();
      fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), {
        nativeEvent: { contentOffset: { x: 0, y: 500 } },
      });
      fireEvent.press(screen.getByTestId("header-save"));
      measureField("amount", -200);
      measureField("recurringName", Dimensions.get("window").height + 100);
      flushScrollFrames();

      expect(screen.getByText("amount_required")).toBeTruthy();
      expect(mockNativeScrollTo).toHaveBeenCalledWith({ y: 276, animated: true });
      expect(mockNativeScrollTo).not.toHaveBeenCalledWith({ y: 724, animated: true });
      expect(transactions.createTransaction).not.toHaveBeenCalled();
    });

    it("places an error below the header instead of behind the ScrollView top edge", () => {
      renderScrollableForm();
      fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), {
        nativeEvent: { contentOffset: { x: 0, y: 500 } },
      });
      fireEvent.press(screen.getByTestId("header-save"));
      measureField("amount", 80, { top: 120, height: 400 });
      flushScrollFrames();

      expect(screen.getByText("amount_required")).toBeTruthy();
      expect(mockNativeScrollTo).toHaveBeenCalledWith({ y: 436, animated: true });
    });

    it("brings the error above a fixed footer using the actual scroll viewport", () => {
      renderScrollableForm();
      fireEvent.press(screen.getByTestId("key-1"));
      enableRecurring();
      fireEvent.press(screen.getByTestId("header-save"));
      measureField("recurringName", 550, { top: 120, height: 400 });
      flushScrollFrames();

      expect(mockNativeScrollTo).toHaveBeenCalledWith({ y: 154, animated: true });
      expect(transactions.createTransaction).not.toHaveBeenCalled();
    });

    it("does not scroll when the invalid field is already visible or after correction", () => {
      renderScrollableForm();
      fireEvent.press(screen.getByTestId("key-1"));
      enableRecurring();
      fireEvent.press(screen.getByTestId("header-save"));
      measureField("recurringName", 100);
      flushScrollFrames();
      expect(mockNativeScrollTo).not.toHaveBeenCalled();

      enterRecurringName("Internet bill");
      measureField("recurringName", Dimensions.get("window").height + 100);
      flushScrollFrames();
      expect(screen.queryByText("recurring_name_required")).toBeNull();
      expect(mockNativeScrollTo).not.toHaveBeenCalled();
    });
  });
});
