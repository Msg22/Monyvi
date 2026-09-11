import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import type { CurrencyType } from "@monyvi/db";
import type { WealthBreakdownReadModel } from "@/services/net-worth-read-model-service";
import {
  getWealthTilesLayoutClass,
  WealthBreakdownSection,
} from "@/components/dashboard/WealthBreakdownSection";

const mockWealthTranslations: Readonly<Record<string, string>> = {
  "wealth_breakdown.title": "Where your money is",
  "wealth_breakdown.accounts": "Accounts",
  "wealth_breakdown.metals": "Metals",
  "wealth_breakdown.gold": "Gold",
  "wealth_breakdown.silver": "Silver",
  "wealth_breakdown.of_net_worth": "{{share}} of net worth",
  "wealth_breakdown.of_metals": "{{share}} of Metals",
  "wealth_breakdown.net_worth": "Net worth",
  "wealth_breakdown.inside_metals": "Inside metals",
  "wealth_breakdown.metals_summary":
    "Amounts in {{currency}} · share of {{metals}}",
  "wealth_breakdown.tile_accessibility": "{{label}}. {{amount}}. {{share}}",
  holding: "{{count}} holdings",
};

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly i18n: { readonly resolvedLanguage: string };
    readonly t: (key: string, values?: Record<string, string>) => string;
  } => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Record<string, string>): string => {
      const template = mockWealthTranslations[key] ?? key;
      return Object.entries(values ?? {}).reduce(
        (result, [name, value]) => result.replace(`{{${name}}}`, String(value)),
        template
      );
    },
  }),
}));

jest.mock("@expo/vector-icons", () => {
  const createElement = jest.requireActual<typeof import("react")>("react")
    .createElement;
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Ionicons: ({ name }: { readonly name: string }): React.JSX.Element =>
      createElement(View, { testID: `icon-${name}` }),
  };
});

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

describe("WealthBreakdownSection", () => {
  it("renders approved additive Concept C below the net-worth hero contract", () => {
    const onAccountsPress = jest.fn();
    const onMetalsPress = jest.fn();

    render(
      <WealthBreakdownSection
        currency={currency}
        isLoading={false}
        breakdown={breakdown}
        onAccountsPress={onAccountsPress}
        onMetalsPress={onMetalsPress}
      />
    );

    expect(screen.getByText("Where your money is")).toBeTruthy();
    expect(screen.getByText("Accounts")).toBeTruthy();
    expect(screen.getAllByText("Metals")).toHaveLength(1);
    expect(screen.getByText("Gold")).toBeTruthy();
    expect(screen.getByText("Silver")).toBeTruthy();
    expect(screen.getByLabelText(/Accounts.*85.4/)).toBeTruthy();
    expect(screen.getByLabelText(/Metals.*14.6/)).toBeTruthy();

    fireEvent.press(screen.getByTestId("wealth-breakdown-accounts"));
    fireEvent.press(screen.getByTestId("wealth-breakdown-metals"));
    expect(onAccountsPress).toHaveBeenCalledTimes(1);
    expect(onMetalsPress).toHaveBeenCalledTimes(1);
  });

  it("preserves exact canonical decimals in the Home breakdown", () => {
    const exactValue = "9007199254740993.245";
    render(
      <WealthBreakdownSection
        currency={currency}
        isLoading={false}
        breakdown={{
          ...breakdown,
          accounts: { ...breakdown.accounts, amountDecimal: exactValue },
          totalNetWorthDecimal: exactValue,
        }}
        onAccountsPress={jest.fn()}
        onMetalsPress={jest.fn()}
      />
    );

    expect(screen.getAllByText("9,007,199,254,740,993.24 EGP")).toHaveLength(2);
    expect(screen.queryByText(/9,007,199,254,740,992/)).toBeNull();
  });

  it.each([
    [390, 1, "flex-row"],
    [320, 1, "flex-col"],
    [390, 1.5, "flex-col"],
  ])(
    "uses responsive Home tile layout at width %s and font scale %s",
    (width, fontScale, expectedClass) =>
      expect(getWealthTilesLayoutClass(width, fontScale)).toBe(expectedClass)
  );

  it("keeps owned-metal counts visible when valuation rates are unavailable", () => {
    render(
      <WealthBreakdownSection
        currency={currency}
        isLoading={false}
        breakdown={{
          ...breakdown,
          metals: {
            ...breakdown.metals,
            amountDecimal: null,
            gold: {
              amountDecimal: null,
              holdingCount: 2,
              shareOfMetals: null,
            },
            silver: {
              amountDecimal: null,
              holdingCount: 1,
              shareOfMetals: null,
            },
          },
        }}
        onAccountsPress={jest.fn()}
        onMetalsPress={jest.fn()}
      />
    );

    expect(screen.getByText("Inside metals")).toBeTruthy();
    expect(screen.getByText(/2 holdings/)).toBeTruthy();
    expect(screen.getByText(/1 holdings/)).toBeTruthy();
  });

  it("speaks tile amounts and shares for screen readers", () => {
    render(
      <WealthBreakdownSection
        currency={currency}
        isLoading={false}
        breakdown={breakdown}
        onAccountsPress={jest.fn()}
        onMetalsPress={jest.fn()}
      />
    );

    expect(
      screen.getByLabelText(
        /Accounts\. 1,062,237\.75 EGP\. 85\.4% of net worth/
      )
    ).toBeTruthy();
  });

  it("shows the semantic skeleton while reads settle", () => {
    render(
      <WealthBreakdownSection
        currency={currency}
        isLoading
        breakdown={null}
        onAccountsPress={jest.fn()}
        onMetalsPress={jest.fn()}
      />
    );
    expect(screen.getByTestId("wealth-breakdown-skeleton")).toBeTruthy();
  });
});
