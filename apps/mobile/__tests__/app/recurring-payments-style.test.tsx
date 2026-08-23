import { fireEvent, render, screen } from "@testing-library/react-native";
import type { CurrencyType, RecurringPayment } from "@monyvi/db";
import React from "react";
import { groupPaymentsByDueDate } from "@/services/recurring-payments-dashboard-read-model";

const mockSetStatusFilter = jest.fn();
const mockPayNowModal = jest.fn();
const mockShowToast = jest.fn();
let mockUsesCompactLayout = false;

interface MockPageHeaderProps {
  readonly title: string;
  readonly rightAction?: unknown;
}

const mockPageHeader = jest.fn<void, [MockPageHeaderProps]>();

interface MockRecurringPayment {
  readonly id: string;
  readonly name: string;
  readonly amount: number;
  readonly currency: CurrencyType;
  readonly type: "EXPENSE" | "INCOME";
  readonly categoryId: string;
  readonly frequency: "MONTHLY" | "YEARLY";
  readonly nextDueDate: Date;
  readonly status: "ACTIVE" | "PAUSED" | "COMPLETED";
  readonly isIncome: boolean;
  readonly isExpense: boolean;
  readonly isOverdue: boolean;
  readonly isActive: boolean;
  readonly isCompleted: boolean;
}

interface MockRecurringPaymentsState {
  readonly allPayments: readonly RecurringPayment[];
  readonly filteredPayments: readonly RecurringPayment[];
  readonly counts: {
    readonly ACTIVE: number;
    readonly PAUSED: number;
    readonly COMPLETED: number;
  };
  readonly next7DaysTotal: number;
  readonly totalDueThisMonth: number;
  readonly isLoading: boolean;
  readonly statusFilter: "ACTIVE" | "PAUSED" | "COMPLETED";
  readonly setStatusFilter: jest.Mock;
}

const createPayment = (
  overrides: Partial<MockRecurringPayment>
): RecurringPayment => {
  const payment: MockRecurringPayment = {
    id: "payment-1",
    name: "Netflix",
    amount: 250,
    currency: "EGP",
    type: "EXPENSE",
    categoryId: "category-1",
    frequency: "MONTHLY",
    nextDueDate: new Date("2026-07-01T00:00:00.000Z"),
    status: "ACTIVE",
    isIncome: overrides.type === "INCOME",
    isExpense: overrides.type !== "INCOME",
    isOverdue: false,
    isActive: overrides.status !== "PAUSED" && overrides.status !== "COMPLETED",
    isCompleted: overrides.status === "COMPLETED",
    ...overrides,
  };

  return payment as unknown as RecurringPayment;
};

const netflix = createPayment({
  id: "payment-1",
  name: "Netflix",
  amount: 250,
  nextDueDate: new Date("2026-07-01T00:00:00.000Z"),
});

const rent = createPayment({
  id: "payment-2",
  name: "Rent",
  amount: 8200,
  nextDueDate: new Date("2026-07-03T00:00:00.000Z"),
});

let mockRecurringPaymentsState: MockRecurringPaymentsState = {
  allPayments: [netflix, rent],
  filteredPayments: [netflix, rent],
  counts: { ACTIVE: 2, PAUSED: 1, COMPLETED: 0 },
  next7DaysTotal: 250,
  totalDueThisMonth: 8450,
  isLoading: false,
  statusFilter: "ACTIVE",
  setStatusFilter: mockSetStatusFilter,
};

jest.mock("expo-router", () => ({
  __esModule: true,
  router: { push: jest.fn() },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 0 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly t: (key: string, options?: { readonly value?: string }) => string;
  } => ({
    t: (key: string, options?: { readonly value?: string }): string =>
      options?.value ? `${key}: ${options.value}` : key,
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (props: MockPageHeaderProps): React.JSX.Element => {
    mockPageHeader(props);
    const { Text } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <Text>{props.title}</Text>;
  },
}));

jest.mock("@/components/common/CategoryIcon", () => ({
  CategoryIcon: (): React.JSX.Element => {
    const { Text } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <Text>category-icon</Text>;
  },
}));

jest.mock("@/components/ui/EmptyStateCard", () => ({
  EmptyStateCard: ({
    title,
  }: {
    readonly title: string;
  }): React.JSX.Element => {
    const { Text } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <Text>{title}</Text>;
  },
}));

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: ({ height }: { readonly height: number }): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View testID={`skeleton-${height}`} />;
  },
}));

jest.mock("@/components/dashboard/upcoming-payments", () => ({
  PayNowModal: (props: {
    readonly payment: RecurringPayment | null;
    readonly visible: boolean;
  }): null => {
    mockPayNowModal(props);
    return null;
  },
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({
    showToast: mockShowToast,
  }),
}));

jest.mock("@/constants/ui", () => ({
  shouldUseCompactLayout: (): boolean => mockUsesCompactLayout,
}));

jest.mock("@/context/CategoriesContext", () => ({
  useCategoryLookup: (): ReadonlyMap<string, unknown> => new Map(),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: false } => ({ isDark: false }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { readonly preferredCurrency: CurrencyType } => ({
    preferredCurrency: "EGP",
  }),
}));

jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: (): {
    readonly latestRates: { readonly egpUsd: number };
  } => ({
    latestRates: {
      egpUsd: 0.02,
    },
  }),
}));

jest.mock("@/hooks/useRecurringPayments", () => ({
  useRecurringPayments: (): MockRecurringPaymentsState =>
    mockRecurringPaymentsState,
}));

jest.mock("@monyvi/logic", () => ({
  calculateCalendarDaysUntil: (date: Date): number => {
    const now = new Date();
    return (
      (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
        Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      (1000 * 60 * 60 * 24)
    );
  },
  convertCurrency: (
    amount: number,
    fromCurrency: CurrencyType,
    toCurrency: CurrencyType
  ): number => {
    if (fromCurrency === "USD" && toCurrency === "EGP") return amount * 50;
    return amount;
  },
  formatCurrency: ({
    amount,
    currency,
  }: {
    readonly amount: number;
    readonly currency: string;
  }): string => `${currency} ${amount.toLocaleString("en-US")}`,
}));

import RecurringPaymentsScreen from "@/app/(private)/recurring-payments";

interface MockExpoRouter {
  readonly router: {
    readonly push: jest.Mock;
  };
}

describe("RecurringPaymentsScreen dashboard", () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date("2026-06-20T00:00:00.000Z"),
    });
    jest.requireMock<MockExpoRouter>("expo-router").router.push.mockClear();
    mockPageHeader.mockClear();
    mockSetStatusFilter.mockClear();
    mockPayNowModal.mockClear();
    mockShowToast.mockClear();
    mockUsesCompactLayout = false;
    mockRecurringPaymentsState = {
      allPayments: [netflix, rent],
      filteredPayments: [netflix, rent],
      counts: { ACTIVE: 2, PAUSED: 1, COMPLETED: 0 },
      next7DaysTotal: 250,
      totalDueThisMonth: 8450,
      isLoading: false,
      statusFilter: "ACTIVE",
      setStatusFilter: mockSetStatusFilter,
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("uses the themed app background on the dashboard root", () => {
    render(<RecurringPaymentsScreen />);

    expect(screen.getByTestId("recurring-payments-screen")).toHaveProp(
      "className",
      expect.stringContaining("bg-background dark:bg-background-dark")
    );
  });

  it("renders the Concept A summary, insight, explicit sort chip, and groups", () => {
    render(<RecurringPaymentsScreen />);

    expect(screen.getByText("due_this_month")).toBeTruthy();
    expect(screen.getByText("EGP 8,450")).toBeTruthy();
    expect(screen.getByText("next_7_days")).toBeTruthy();
    expect(screen.getByText("overdue")).toBeTruthy();
    expect(screen.getByText("renews_next")).toBeTruthy();
    expect(screen.getByText("upcoming")).toBeTruthy();
    expect(
      screen.getByTestId("recurring-payments-sort-chip")
    ).toHaveTextContent("sort_by: next_due");
    expect(screen.getByText("Jul 1")).toBeTruthy();
    expect(screen.getByText("Jul 3")).toBeTruthy();
  });

  it("keeps the summary compact and lets the next insight title wrap before the amount", () => {
    render(<RecurringPaymentsScreen />);

    expect(screen.getByTestId("recurring-payments-summary-card")).toHaveProp(
      "className",
      expect.stringContaining("py-3")
    );
    expect(
      screen.getByTestId("recurring-payments-next-insight-title")
    ).toHaveProp("numberOfLines", 2);
    expect(
      screen.getByTestId("recurring-payments-next-insight-title")
    ).toHaveProp("className", expect.stringContaining("flex-1"));
    expect(
      screen.getByTestId("recurring-payments-next-insight-amount")
    ).toHaveProp("className", expect.stringContaining("shrink-0"));
  });

  it("includes the year in due groups outside the current year", () => {
    const currentYearPayment = createPayment({
      id: "payment-current-year",
      name: "Current Year",
      nextDueDate: new Date("2026-07-01T00:00:00.000Z"),
    });
    const nextYearPayment = createPayment({
      id: "payment-next-year",
      name: "Next Year",
      nextDueDate: new Date("2027-07-01T00:00:00.000Z"),
    });
    mockRecurringPaymentsState = {
      ...mockRecurringPaymentsState,
      allPayments: [currentYearPayment, nextYearPayment],
      filteredPayments: [currentYearPayment, nextYearPayment],
      counts: { ACTIVE: 2, PAUSED: 0, COMPLETED: 0 },
    };

    render(<RecurringPaymentsScreen />);

    expect(screen.getByText("Jul 1")).toBeTruthy();
    expect(screen.getByText("Jul 1, 2027")).toBeTruthy();
  });

  it("keys due groups by calendar date instead of display label", () => {
    const currentYearPayment = createPayment({
      id: "payment-current-year-key",
      name: "Current Year Key",
      nextDueDate: new Date("2026-07-01T00:00:00.000Z"),
    });
    const nextYearPayment = createPayment({
      id: "payment-next-year-key",
      name: "Next Year Key",
      nextDueDate: new Date("2027-07-01T00:00:00.000Z"),
    });

    const sections = groupPaymentsByDueDate([
      currentYearPayment,
      nextYearPayment,
    ]);

    expect(sections.map((section) => section.key)).toEqual([
      "2026-7-1",
      "2027-7-1",
    ]);
  });

  it("uses expenses only for bill-focused insight and overdue metrics", () => {
    const incomePayment = createPayment({
      id: "payment-income",
      name: "Salary",
      amount: 5000,
      type: "INCOME",
      nextDueDate: new Date("2026-06-21T00:00:00.000Z"),
      isOverdue: true,
    });
    const expensePayment = createPayment({
      id: "payment-expense",
      name: "Gym",
      amount: 350,
      nextDueDate: new Date("2026-07-01T00:00:00.000Z"),
    });
    mockRecurringPaymentsState = {
      ...mockRecurringPaymentsState,
      allPayments: [incomePayment, expensePayment],
      filteredPayments: [incomePayment, expensePayment],
      counts: { ACTIVE: 2, PAUSED: 0, COMPLETED: 0 },
    };

    render(<RecurringPaymentsScreen />);

    expect(
      screen.getByTestId("recurring-payments-next-insight")
    ).toHaveTextContent(/EGP 350/);
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("opens a sort sheet that clearly labels sorting, not filtering", () => {
    render(<RecurringPaymentsScreen />);

    fireEvent.press(screen.getByTestId("recurring-payments-sort-chip"));

    expect(screen.getByText("sort_payments")).toBeTruthy();
    expect(screen.getByText("sort_payments_description")).toBeTruthy();
    expect(screen.getByText("highest_amount")).toBeTruthy();
    expect(screen.getByText("lowest_amount")).toBeTruthy();
    expect(screen.getByText("name_a_z")).toBeTruthy();
  });

  it("reorders payments when a sort option is selected", () => {
    render(<RecurringPaymentsScreen />);

    fireEvent.press(screen.getByTestId("recurring-payments-sort-chip"));
    fireEvent.press(
      screen.getByTestId("recurring-payments-sort-highest_amount")
    );

    const rows = screen.getAllByTestId("recurring-payment-row");
    expect(rows[0]).toHaveTextContent(/Rent/);
    expect(
      screen.getByTestId("recurring-payments-sort-chip")
    ).toHaveTextContent("sort_by: highest_amount");
  });

  it("sorts mixed-currency amounts by preferred-currency value", () => {
    const localPayment = createPayment({
      id: "payment-egp",
      name: "Local Bill",
      amount: 200,
      currency: "EGP",
    });
    const usdPayment = createPayment({
      id: "payment-usd",
      name: "USD Subscription",
      amount: 100,
      currency: "USD",
    });
    mockRecurringPaymentsState = {
      ...mockRecurringPaymentsState,
      allPayments: [localPayment, usdPayment],
      filteredPayments: [localPayment, usdPayment],
      counts: { ACTIVE: 2, PAUSED: 0, COMPLETED: 0 },
    };

    render(<RecurringPaymentsScreen />);

    fireEvent.press(screen.getByTestId("recurring-payments-sort-chip"));
    fireEvent.press(
      screen.getByTestId("recurring-payments-sort-highest_amount")
    );

    const rows = screen.getAllByTestId("recurring-payment-row");
    expect(rows[0]).toHaveTextContent(/USD Subscription/);
    expect(rows[1]).toHaveTextContent(/Local Bill/);
  });

  it("keeps the selected amount sort order when due dates would regroup rows", () => {
    const highest = createPayment({
      id: "payment-highest",
      name: "A High",
      amount: 100,
      nextDueDate: new Date("2026-07-01T00:00:00.000Z"),
    });
    const middle = createPayment({
      id: "payment-middle",
      name: "B Middle",
      amount: 90,
      nextDueDate: new Date("2026-07-02T00:00:00.000Z"),
    });
    const lowest = createPayment({
      id: "payment-lowest",
      name: "C Low",
      amount: 80,
      nextDueDate: new Date("2026-07-01T00:00:00.000Z"),
    });
    mockRecurringPaymentsState = {
      ...mockRecurringPaymentsState,
      allPayments: [highest, middle, lowest],
      filteredPayments: [highest, middle, lowest],
      counts: { ACTIVE: 3, PAUSED: 0, COMPLETED: 0 },
    };

    render(<RecurringPaymentsScreen />);

    fireEvent.press(screen.getByTestId("recurring-payments-sort-chip"));
    fireEvent.press(
      screen.getByTestId("recurring-payments-sort-highest_amount")
    );

    const rows = screen.getAllByTestId("recurring-payment-row");
    expect(rows[0]).toHaveTextContent(/A High/);
    expect(rows[1]).toHaveTextContent(/B Middle/);
    expect(rows[2]).toHaveTextContent(/C Low/);
  });

  it("keeps add payment on the floating action button instead of the icon header action", () => {
    render(<RecurringPaymentsScreen />);

    const firstHeaderProps = mockPageHeader.mock.calls[0]?.[0];
    expect(firstHeaderProps).not.toHaveProperty("rightAction");
    expect(screen.getByTestId("recurring-payments-add-button")).toBeTruthy();
  });

  it("keeps status tabs functional", () => {
    render(<RecurringPaymentsScreen />);

    fireEvent.press(screen.getByTestId("recurring-status-tab-PAUSED"));

    expect(mockSetStatusFilter).toHaveBeenCalledWith("PAUSED");
  });

  it("navigates to add and edit flows from dashboard actions", () => {
    render(<RecurringPaymentsScreen />);

    fireEvent.press(screen.getByTestId("recurring-payment-row-payment-1"));
    fireEvent.press(screen.getByTestId("recurring-payments-add-button"));

    const routerPush =
      jest.requireMock<MockExpoRouter>("expo-router").router.push;
    expect(routerPush).toHaveBeenCalledWith(
      "/edit-recurring-payment?id=payment-1"
    );
    expect(routerPush).toHaveBeenCalledWith("/create-recurring-payment");
  });

  it("renders skeleton blocks instead of a spinner while loading content", () => {
    mockRecurringPaymentsState = {
      ...mockRecurringPaymentsState,
      filteredPayments: [],
      isLoading: true,
    };

    render(<RecurringPaymentsScreen />);

    expect(screen.getByTestId("recurring-payments-loading")).toBeTruthy();
    expect(screen.queryByTestId("recurring-payments-spinner")).toBeNull();
    expect(screen.queryByText("no_status_payments")).toBeNull();
  });

  it("does not render overdue due text for completed payments", () => {
    const completedPayment = createPayment({
      id: "payment-completed",
      name: "Phone Installment",
      nextDueDate: new Date("2026-06-15T00:00:00.000Z"),
      status: "COMPLETED",
      isActive: false,
      isCompleted: true,
      isOverdue: true,
    });

    mockRecurringPaymentsState = {
      ...mockRecurringPaymentsState,
      allPayments: [completedPayment],
      filteredPayments: [completedPayment],
      counts: { ACTIVE: 0, PAUSED: 0, COMPLETED: 1 },
      statusFilter: "COMPLETED",
    };

    render(<RecurringPaymentsScreen />);

    expect(
      screen.getByTestId("recurring-payment-row-payment-completed")
    ).toHaveTextContent(/Jun 15/);
    expect(
      screen.getByTestId("recurring-payment-row-payment-completed")
    ).not.toHaveTextContent(/overdue/i);
  });

  it("opens Pay Now for an unpaid final overdue payment", () => {
    const unpaidFinalPayment = createPayment({
      id: "payment-final-overdue",
      name: "Phone Installment",
      nextDueDate: new Date("2026-06-15T00:00:00.000Z"),
      status: "ACTIVE",
      isActive: true,
      isCompleted: false,
      isOverdue: true,
    });

    mockRecurringPaymentsState = {
      ...mockRecurringPaymentsState,
      allPayments: [unpaidFinalPayment],
      filteredPayments: [unpaidFinalPayment],
      statusFilter: "ACTIVE",
    };

    render(<RecurringPaymentsScreen />);

    expect(
      screen.getByTestId("recurring-payment-row-payment-final-overdue")
    ).toHaveTextContent(/status_active/i);

    fireEvent.press(
      screen.getByTestId(
        "recurring-payment-pay-now-payment-final-overdue"
      )
    );

    expect(mockPayNowModal).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payment: unpaidFinalPayment,
        visible: true,
      })
    );
  });

  it("does not offer expense Pay Now flow for overdue income", () => {
    const overdueIncome = createPayment({
      id: "payment-overdue-income",
      name: "Salary",
      type: "INCOME",
      isOverdue: true,
      isActive: true,
      isCompleted: false,
    });
    mockRecurringPaymentsState = {
      ...mockRecurringPaymentsState,
      allPayments: [overdueIncome],
      filteredPayments: [overdueIncome],
    };

    render(<RecurringPaymentsScreen />);

    expect(
      screen.queryByTestId("recurring-payment-pay-now-payment-overdue-income")
    ).toBeNull();
  });

  it("keeps overdue Pay Now inline at an ordinary layout width", () => {
    const overduePayment = createPayment({
      id: "payment-inline-pay-now",
      nextDueDate: new Date("2026-06-15T00:00:00.000Z"),
      isOverdue: true,
    });
    mockRecurringPaymentsState = {
      ...mockRecurringPaymentsState,
      allPayments: [overduePayment],
      filteredPayments: [overduePayment],
    };

    render(<RecurringPaymentsScreen />);

    expect(
      screen.getByTestId(
        "recurring-payment-pay-now-layout-payment-inline-pay-now"
      )
    ).toHaveProp("className", expect.stringContaining("ms-3"));
  });

  it("stacks overdue Pay Now at compact layout widths", () => {
    mockUsesCompactLayout = true;
    const overduePayment = createPayment({
      id: "payment-stacked-pay-now",
      nextDueDate: new Date("2026-06-15T00:00:00.000Z"),
      isOverdue: true,
    });
    mockRecurringPaymentsState = {
      ...mockRecurringPaymentsState,
      allPayments: [overduePayment],
      filteredPayments: [overduePayment],
    };

    render(<RecurringPaymentsScreen />);

    expect(
      screen.getByTestId(
        "recurring-payment-pay-now-layout-payment-stacked-pay-now"
      )
    ).toHaveProp(
      "className",
      expect.stringContaining("mt-3 self-stretch")
    );
  });
});
