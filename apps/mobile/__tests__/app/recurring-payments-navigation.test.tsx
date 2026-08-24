import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-router", () => ({
  __esModule: true,
  router: { push: jest.fn() },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 0 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (): null => null,
}));

jest.mock("@/context/CategoriesContext", () => ({
  useCategoryLookup: (): ReadonlyMap<string, unknown> => new Map(),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: false } => ({ isDark: false }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { readonly preferredCurrency: "EGP" } => ({
    preferredCurrency: "EGP",
  }),
}));

jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: (): { readonly latestRates: null } => ({ latestRates: null }),
}));

jest.mock("@/hooks/useRecurringPayments", () => ({
  useRecurringPayments: (): unknown => ({
    filteredPayments: [
      {
        id: "payment-1",
        name: "Netflix",
        amount: 250,
        currency: "EGP",
        type: "EXPENSE",
        categoryId: "category-1",
        frequency: "MONTHLY",
        nextDueDate: new Date("2026-07-01T00:00:00.000Z"),
        isIncome: false,
        isOverdue: false,
      },
    ],
    counts: { ACTIVE: 1, PAUSED: 0, COMPLETED: 0 },
    next7DaysTotal: 0,
    totalDueThisMonth: 250,
    isLoading: false,
    statusFilter: "ACTIVE",
    setStatusFilter: jest.fn(),
  }),
}));

jest.mock("@/components/dashboard/upcoming-payments", () => ({
  PayNowModal: (): null => null,
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({
    showToast: jest.fn(),
  }),
}));

jest.mock("@monyvi/logic", () => ({
  calculateCalendarDaysUntil: (): number => 1,
  formatCurrency: (): string => "EGP 250",
}));

import RecurringPaymentsScreen from "@/app/(private)/recurring-payments";

interface MockExpoRouter {
  readonly router: {
    readonly push: jest.Mock;
  };
}

describe("RecurringPaymentsScreen navigation", () => {
  beforeEach(() => {
    jest.requireMock<MockExpoRouter>("expo-router").router.push.mockClear();
  });

  it("opens the edit recurring payment route when a payment card is pressed", () => {
    render(<RecurringPaymentsScreen />);

    fireEvent.press(screen.getByText("Netflix"));

    expect(
      jest.requireMock<MockExpoRouter>("expo-router").router.push
    ).toHaveBeenCalledWith("/edit-recurring-payment?id=payment-1");
  });
});
