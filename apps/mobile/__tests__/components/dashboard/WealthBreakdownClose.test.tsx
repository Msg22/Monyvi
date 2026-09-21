import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import type { CurrencyType } from "@monyvi/db";
import type { WealthBreakdownReadModel } from "@/services/net-worth-read-model-service";
import { WealthBreakdownSection } from "@/components/dashboard/WealthBreakdownSection";

const translations: Readonly<Record<string, string>> = {
  "wealth_breakdown.title": "Where your money is",
  "wealth_breakdown.accounts": "Accounts",
  "wealth_breakdown.metals": "Gold & silver",
  "wealth_breakdown.gold": "Gold",
  "wealth_breakdown.silver": "Silver",
  "wealth_breakdown.of_net_worth": "{{share}} of net worth",
  "wealth_breakdown.of_metals": "{{share}} of gold & silver",
  "wealth_breakdown.net_worth": "Net worth",
  "wealth_breakdown.inside_metals": "Inside gold & silver",
  "wealth_breakdown.metals_summary": "Amounts in {{currency}} · share of {{metals}}",
  "wealth_breakdown.tile_accessibility": "{{label}}. {{amount}}. {{share}}",
  holding: "{{count}} holdings",
};

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Record<string, unknown>): string =>
      Object.entries(values ?? {}).reduce(
        (result, [name, value]) =>
          result.replace(`{{${name}}}`, String(value)),
        translations[key] ?? key
      ),
  }),
}));

jest.mock("@expo/vector-icons", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Ionicons: ({ name }: { readonly name: string }): React.JSX.Element =>
      ReactActual.createElement(View, { testID: `icon-${name}` }),
  };
});

const currency: CurrencyType = "EGP";
const breakdown: WealthBreakdownReadModel = {
  accounts: { amountDecimal: "100", shareOfNetWorth: "80" },
  metals: {
    amountDecimal: "25",
    shareOfNetWorth: "20",
    gold: { amountDecimal: "20", holdingCount: 1, shareOfMetals: "80" },
    silver: { amountDecimal: "5", holdingCount: 1, shareOfMetals: "20" },
  },
  totalNetWorthDecimal: "125",
};

describe("WealthBreakdownSection close control", () => {
  it("uses a labeled 44dp close control and a non-glowing slate panel", () => {
    const onClose = jest.fn();
    render(
      <WealthBreakdownSection
        breakdown={breakdown}
        closeAccessibilityLabel="Close wealth breakdown"
        currency={currency}
        isLoading={false}
        onAccountsPress={jest.fn()}
        onClose={onClose}
        onMetalsPress={jest.fn()}
      />
    );

    expect(screen.getByLabelText("Close wealth breakdown")).toHaveProp(
      "accessibilityRole",
      "button"
    );
    expect(screen.getByLabelText("Close wealth breakdown")).toHaveProp(
      "className",
      expect.stringContaining("min-h-11")
    );
    expect(screen.getByTestId("icon-close")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Close wealth breakdown"));
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(screen.getByTestId("wealth-breakdown-root")).toHaveProp(
      "className",
      expect.stringContaining("border-slate-200")
    );
    expect(screen.getByTestId("wealth-breakdown-root")).toHaveProp(
      "className",
      expect.not.stringMatching(/glow|shadow|drop-shadow/)
    );
  });
});
