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
  "wealth_breakdown.metals": "Gold & silver",
  "wealth_breakdown.gold": "Gold",
  "wealth_breakdown.silver": "Silver",
  "wealth_breakdown.of_net_worth": "{{share}} of net worth",
  "wealth_breakdown.of_metals": "{{share}} of gold & silver",
  "wealth_breakdown.net_worth": "Net worth",
  "wealth_breakdown.inside_metals": "Inside gold & silver",
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
    i18n: { resolvedLanguage: mockLanguage },
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
  const createElement =
    jest.requireActual<typeof import("react")>("react").createElement;
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
let mockLanguage = "en";

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
  afterEach(() => {
    mockLanguage = "en";
  });
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
    expect(screen.getAllByText("Gold & silver")).toHaveLength(1);
    expect(screen.getByText("Gold")).toBeTruthy();
    expect(screen.getByText("Silver")).toBeTruthy();
    expect(screen.getByLabelText(/Accounts.*85.4/)).toBeTruthy();
    expect(screen.getByLabelText(/Gold & silver.*14.6/)).toBeTruthy();
    expect(screen.queryByText("1,243,663.92 EGP")).toBeNull();
    expect(screen.getByTestId("wealth-breakdown-gold-detail")).toHaveProp(
      "className",
      expect.stringContaining("rounded-2xl")
    );
    expect(screen.getByTestId("wealth-breakdown-silver-detail")).toHaveProp(
      "className",
      expect.stringContaining("rounded-2xl")
    );

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

    expect(screen.getByText("9,007,199,254,740,993.24 EGP")).toBeTruthy();
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

    expect(screen.getByText("Inside gold & silver")).toBeTruthy();
    expect(screen.getByText(/2 holdings/)).toBeTruthy();
    expect(screen.getByText(/1 holdings/)).toBeTruthy();
  });

  it("hides the gold-and-silver breakdown only when both holding counts are zero", () => {
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
              holdingCount: 0,
              shareOfMetals: null,
            },
            silver: {
              amountDecimal: null,
              holdingCount: 0,
              shareOfMetals: null,
            },
          },
        }}
        onAccountsPress={jest.fn()}
        onMetalsPress={jest.fn()}
      />
    );

    expect(screen.queryByText("Inside gold & silver")).toBeNull();
    expect(screen.queryByText("Gold")).toBeNull();
    expect(screen.queryByText("Silver")).toBeNull();
    // The Metals tile remains because net worth still has a Metals contributor.
    expect(screen.getByText("Gold & silver")).toBeTruthy();
  });

  it("keeps the gold-and-silver breakdown for held metals with zero or unavailable value", () => {
    render(
      <WealthBreakdownSection
        currency={currency}
        isLoading={false}
        breakdown={{
          ...breakdown,
          metals: {
            ...breakdown.metals,
            amountDecimal: "0",
            gold: {
              amountDecimal: "0",
              holdingCount: 1,
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

    expect(screen.getByText("Inside gold & silver")).toBeTruthy();
    expect(screen.getByText("Gold")).toBeTruthy();
    expect(screen.getByText("Silver")).toBeTruthy();
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
