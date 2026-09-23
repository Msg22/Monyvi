import { render, screen } from "@testing-library/react-native";
import type { CurrencyType } from "@monyvi/db";
import i18n from "i18next";
import React from "react";
import { initReactI18next } from "react-i18next";

import { WealthBreakdownSection } from "@/components/dashboard/WealthBreakdownSection";
import type { WealthBreakdownReadModel } from "@/services/net-worth-read-model-service";

import arMetals from "../../locales/ar/metals.json";
import enMetals from "../../locales/en/metals.json";

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

const currency: CurrencyType = "EGP";

const breakdown: WealthBreakdownReadModel = {
  accounts: { amountDecimal: "1062237.75", shareOfNetWorth: "85.4" },
  metals: {
    amountDecimal: "181426.17",
    shareOfNetWorth: "14.6",
    gold: {
      amountDecimal: "162317.87",
      holdingCount: 1,
      shareOfMetals: "89.5",
    },
    silver: {
      amountDecimal: "19108.30",
      holdingCount: 1,
      shareOfMetals: "10.5",
    },
  },
  totalNetWorthDecimal: "1243663.92",
};

function renderBreakdown(): void {
  render(
    <WealthBreakdownSection
      currency={currency}
      isLoading={false}
      breakdown={breakdown}
      onAccountsPress={jest.fn()}
      onMetalsPress={jest.fn()}
    />
  );
}

// Real i18next resources — no injected translations. This proves the Home
// wealth breakdown genuinely reads the `metals` namespace in both languages.
beforeAll(async (): Promise<void> => {
  await i18n.use(initReactI18next).init({
    resources: { en: { metals: enMetals }, ar: { metals: arMetals } },
    lng: "en",
    fallbackLng: "en",
    compatibilityJSON: "v4",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
});

afterEach(async (): Promise<void> => {
  await i18n.changeLanguage("en");
});

describe("WealthBreakdownSection real i18n integration", () => {
  it("renders friendly Arabic wealth copy from the metals namespace when Arabic is selected", async () => {
    await i18n.changeLanguage("ar");
    renderBreakdown();

    expect(screen.getByText("فلوسك موزّعة فين")).toBeTruthy();
    expect(screen.getByText("الفلوس في الحسابات")).toBeTruthy();
    expect(screen.getByText("الذهب والفضة")).toBeTruthy();
    expect(screen.getByText("تفاصيل الذهب والفضة")).toBeTruthy();
    expect(screen.getByText("ذهب")).toBeTruthy();
    expect(screen.getByText("فضة")).toBeTruthy();

    // No generic "المعادن" and no English leakage while Arabic is active.
    expect(screen.queryByText("المعادن")).toBeNull();
    expect(screen.queryByText("Where your money is")).toBeNull();
    expect(screen.queryByText("Inside gold & silver")).toBeNull();

    // Shared Metals Arabic/Latin-numeral locale policy keeps readable digits.
    expect(screen.getByLabelText(/85\.4/)).toBeTruthy();
  });

  it("renders English wealth copy from the metals namespace when English is selected", () => {
    renderBreakdown();

    expect(screen.getByText("Where your money is")).toBeTruthy();
    expect(screen.getByText("Accounts")).toBeTruthy();
    expect(screen.getByText("Gold & silver")).toBeTruthy();
    expect(screen.getByText("Inside gold & silver")).toBeTruthy();

    expect(screen.queryByText("فلوسك موزّعة فين")).toBeNull();
    expect(screen.queryByText("المعادن")).toBeNull();
  });
});
