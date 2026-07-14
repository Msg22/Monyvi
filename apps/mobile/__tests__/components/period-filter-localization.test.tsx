import { act, render, screen } from "@testing-library/react-native";
import i18next, { type i18n } from "i18next";
import React from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";

import { ThisMonth } from "@/components/dashboard/ThisMonth";
import { UpcomingPayments } from "@/components/dashboard/UpcomingPayments";
import { TransactionFiltersBar } from "@/components/transactions/TransactionFiltersBar";
import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: "Svg",
  Circle: "Circle",
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { readonly preferredCurrency: "EGP" } => ({
    preferredCurrency: "EGP",
  }),
}));

jest.mock("@/hooks/usePeriodSummary", () => ({
  usePeriodSummary: (): {
    readonly data: {
      readonly totalIncome: number;
      readonly totalExpenses: number;
      readonly savings: number;
      readonly savingsPercentage: number;
      readonly spentPercentage: number;
    };
    readonly isLoading: boolean;
  } => ({
    data: {
      totalIncome: 100,
      totalExpenses: 40,
      savings: 60,
      savingsPercentage: 60,
      spentPercentage: 40,
    },
    isLoading: false,
  }),
}));

jest.mock("@/hooks/useRecurringPayments", () => ({
  getBillsPeriodDateRange: (): {
    readonly start: Date;
    readonly end: Date;
  } => ({
    start: new Date("2026-07-01T00:00:00.000Z"),
    end: new Date("2026-07-31T23:59:59.999Z"),
  }),
  useRecurringPayments: (): {
    readonly filteredPayments: ReadonlyArray<{ readonly id: string }>;
    readonly totalDueFiltered: number;
    readonly isLoading: boolean;
  } => ({
    filteredPayments: [{ id: "payment-1" }],
    totalDueFiltered: 250,
    isLoading: false,
  }),
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({
    showToast: jest.fn(),
  }),
}));

jest.mock("@/components/dashboard/upcoming-payments", () => ({
  FeaturedPaymentCard: (): null => null,
  MiniPaymentItem: (): null => null,
  PayNowModal: (): null => null,
}));

async function createTestI18n(): Promise<i18n> {
  const instance = i18next.createInstance();
  await instance.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    resources: {
      en: { common: enCommon },
      ar: { common: arCommon },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}

async function switchToArabic(instance: i18n): Promise<void> {
  await act(async (): Promise<void> => {
    await instance.changeLanguage("ar");
  });
}

describe("period filter localization", () => {
  it("ships a one-year translation in both common locales", () => {
    expect(enCommon.period_one_year).toBe("1 Year");
    expect(arCommon.period_one_year).toBe("سنة واحدة");
  });

  it("updates the dashboard summary title and chips without remounting", async () => {
    const instance = await createTestI18n();
    render(
      <I18nextProvider i18n={instance}>
        <ThisMonth />
      </I18nextProvider>
    );

    expect(screen.getAllByText(enCommon.period_this_month)).toHaveLength(2);
    expect(screen.getByText(enCommon.period_six_months)).toBeTruthy();

    await switchToArabic(instance);

    expect(screen.queryByText(enCommon.period_this_month)).toBeNull();
    expect(screen.getAllByText(arCommon.period_this_month)).toHaveLength(2);
    for (const key of [
      "period_today",
      "period_this_week",
      "period_last_month",
      "period_six_months",
      "period_this_year",
    ] as const) {
      expect(screen.getByText(arCommon[key])).toBeTruthy();
    }
  });

  it("updates every upcoming-bills period chip without remounting", async () => {
    const instance = await createTestI18n();
    render(
      <I18nextProvider i18n={instance}>
        <UpcomingPayments />
      </I18nextProvider>
    );

    expect(screen.getByText(enCommon.period_one_year)).toBeTruthy();

    await switchToArabic(instance);

    for (const key of [
      "period_this_week",
      "period_this_month",
      "period_six_months",
      "period_one_year",
    ] as const) {
      expect(screen.getByText(arCommon[key])).toBeTruthy();
    }
    expect(screen.queryByText(enCommon.period_one_year)).toBeNull();
  });

  it("updates the transaction period filter without remounting", async () => {
    const instance = await createTestI18n();
    render(
      <I18nextProvider i18n={instance}>
        <TransactionFiltersBar
          period="this_month"
          onPeriodPress={jest.fn()}
          selectedTypes={["All"]}
          allTypesCount={1}
          onTypePress={jest.fn()}
          searchQuery=""
          onSearchChange={jest.fn()}
        />
      </I18nextProvider>
    );

    expect(screen.getByText(enCommon.period_this_month)).toBeTruthy();

    await switchToArabic(instance);

    expect(screen.queryByText(enCommon.period_this_month)).toBeNull();
    expect(screen.getByText(arCommon.period_this_month)).toBeTruthy();
  });
});
