import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import DashboardScreen from "../../app/(private)/(tabs)/index";

const mockRefreshNetWorth = jest.fn();
const mockRefreshPortfolio = jest.fn();
let mockNetWorthError: Error | null = null;
let mockPortfolioError: Error | null = null;
let mockBreakdown: { totalNetWorthDecimal: string } | null = null;
const mockPortfolio = jest.fn(
  (
    _input: unknown
  ): {
    wealthBreakdown: typeof mockBreakdown;
    isSummaryLoading: boolean;
    error: Error | null;
    refresh: typeof mockRefreshPortfolio;
  } => ({
    wealthBreakdown: mockBreakdown,
    isSummaryLoading: false,
    error: mockPortfolioError,
    refresh: mockRefreshPortfolio,
  })
);
jest.mock("@/hooks/useNetWorth", (): unknown => ({
  useNetWorth: (): unknown => ({
    totalAccounts: 1500,
    totalAccountsDecimal: "1500.000000000000000123",
    isLoading: false,
    error: mockNetWorthError,
    refresh: mockRefreshNetWorth,
  }),
  useMonthlyPercentageChange: (): unknown => ({
    monthlyPercentageChange: null,
  }),
}));
jest.mock("@/hooks/useMetalPortfolio", (): unknown => ({
  useMetalPortfolio: (input: unknown): unknown => mockPortfolio(input),
}));
jest.mock("@/hooks/useAccounts", (): unknown => ({
  useAccounts: (): unknown => ({ accounts: [], isLoading: false }),
}));
jest.mock("@/hooks/useMarketRates", (): unknown => ({
  useMarketRates: (): unknown => ({ selectedSnapshot: null, isLoading: false }),
}));
jest.mock("@/hooks/useTransactions", (): unknown => ({
  useRecentTransactions: (): unknown => ({ transactions: [] }),
}));
jest.mock("@/hooks/useProfile", (): unknown => ({
  useProfile: (): unknown => ({ profile: null }),
}));
jest.mock("@/hooks/usePreferredCurrency", (): unknown => ({
  usePreferredCurrency: (): unknown => ({
    preferredCurrency: "EGP",
    setPreferredCurrency: jest.fn(),
  }),
}));
jest.mock("@/hooks/useSmsPermission", (): unknown => ({
  useSmsPermission: (): unknown => ({ requestPermission: jest.fn() }),
}));
jest.mock("@/hooks/useSmsSync", (): unknown => ({
  useSmsSync: (): unknown => ({ shouldShowPrompt: false }),
}));
jest.mock("@/providers/DatabaseProvider", (): unknown => ({
  useDatabaseReady: (): boolean => true,
}));
jest.mock("@/providers/SyncProvider", (): unknown => ({
  useSync: (): unknown => ({ sync: jest.fn() }),
}));
jest.mock("@/context/PayNowOverlayContext", (): unknown => ({
  usePayNowOverlay: (): unknown => ({ openPayNow: jest.fn() }),
}));
jest.mock("@/components/ui/Toast", (): unknown => ({
  useToast: (): unknown => ({ showToast: jest.fn() }),
}));
jest.mock("@react-navigation/bottom-tabs", (): unknown => ({
  useBottomTabBarHeight: (): number => 64,
}));
jest.mock("expo-router", (): unknown => ({
  useRouter: (): unknown => ({ push: jest.fn() }),
}));
jest.mock("react-i18next", (): unknown => ({
  useTranslation: (): unknown => ({ t: (key: string): string => key }),
}));
jest.mock("@/utils/account-institution-presentation", (): unknown => ({
  resolveAccountInstitutionPresentation: jest.fn(),
}));
jest.mock("@/components/currency/CurrencyPicker", (): unknown => ({
  CurrencyPicker: (): null => null,
}));
jest.mock("@/components/dashboard/AccountsSection", (): unknown => ({
  AccountsSection: (): null => null,
}));
jest.mock("@/components/dashboard/CashAccountTooltip", (): unknown => ({
  CashAccountTooltip: (): null => null,
}));
jest.mock("@/components/dashboard/HomeWealthSummary", (): unknown => ({
  HomeWealthSummary: (): null => null,
}));
jest.mock("@/components/dashboard/LiveRates", (): unknown => ({
  LiveRates: (): null => null,
}));
jest.mock("@/components/dashboard/MicButtonTooltip", (): unknown => ({
  MicButtonTooltip: (): null => null,
}));
jest.mock("@/components/dashboard/OnboardingGuideCard", (): unknown => ({
  OnboardingGuideCard: (): null => null,
}));
jest.mock("@/components/dashboard/RecentTransactions", (): unknown => ({
  RecentTransactions: (): null => null,
}));
jest.mock(
  "@/components/dashboard/skeletons/DashboardSkeleton",
  (): unknown => ({
    DashboardSkeleton: (): null => null,
  })
);
jest.mock("@/components/dashboard/ThisMonth", (): unknown => ({
  ThisMonth: (): null => null,
}));
jest.mock("@/components/dashboard/TopNav", (): unknown => ({
  TopNav: (): null => null,
}));
jest.mock("@/components/dashboard/UpcomingPayments", (): unknown => ({
  UpcomingPayments: (): null => null,
}));
jest.mock("@/components/navigation/AppDrawer", (): unknown => ({
  AppDrawer: (): null => null,
}));
jest.mock("@/components/sms-sync/SmsPermissionPrompt", (): unknown => ({
  SmsPermissionPrompt: (): null => null,
}));
jest.mock("@/components/ui/StarryBackground", (): unknown => ({
  StarryBackground: ({
    children,
  }: {
    children: React.ReactNode;
  }): React.ReactNode => children,
}));
jest.mock("@/components/ui/SectionErrorBoundary", (): unknown => ({
  SectionErrorBoundary: ({
    children,
  }: {
    children: React.ReactNode;
  }): React.ReactNode => children,
}));

beforeEach((): void => {
  jest.clearAllMocks();
  mockNetWorthError = null;
  mockPortfolioError = null;
  mockBreakdown = null;
});

it("passes the unrounded account decimal into the Home wealth projection", (): void => {
  render(<DashboardScreen />);
  expect(mockPortfolio).toHaveBeenLastCalledWith({
    accountsValueDecimal: "1500.000000000000000123",
  });
});

it.each(["accounts", "portfolio"] as const)(
  "retries both data sources after a %s failure",
  (source): void => {
    if (source === "accounts")
      mockNetWorthError = new Error("Account observation failed");
    else mockPortfolioError = new Error("Portfolio read failed");
    const { rerender } = render(<DashboardScreen />);
    expect(screen.getByTestId("home-money-summary-error")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "retry" }));
    expect(mockRefreshNetWorth).toHaveBeenCalledTimes(1);
    expect(mockRefreshPortfolio).toHaveBeenCalledTimes(1);
    mockNetWorthError = null;
    mockPortfolioError = null;
    rerender(<DashboardScreen />);
    expect(screen.queryByTestId("home-money-summary-error")).toBeNull();
  }
);

it("keeps the loaded wealth section and offers retry after an account error", (): void => {
  mockBreakdown = { totalNetWorthDecimal: "1500" };
  mockNetWorthError = new Error("Account observation failed");
  render(<DashboardScreen />);
  expect(screen.queryByTestId("home-money-summary-error")).toBeNull();
  expect(screen.getByTestId("home-money-summary-retry-notice")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "retry" }));
  expect(mockRefreshNetWorth).toHaveBeenCalledTimes(1);
});
