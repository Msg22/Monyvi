import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import type { CurrencyType } from "@monyvi/db";
import type { WealthBreakdownReadModel } from "@/services/net-worth-read-model-service";
import { WealthBreakdownSection } from "@/components/dashboard/WealthBreakdownSection";

const translations: Readonly<Record<string, string>> = {
  "wealth_breakdown.title": "Where your money is",
  "wealth_breakdown.close": "Close wealth breakdown",
  "wealth_breakdown.accounts": "Accounts",
  "wealth_breakdown.metals": "Gold & silver",
  "wealth_breakdown.gold": "Gold",
  "wealth_breakdown.silver": "Silver",
  "wealth_breakdown.of_net_worth": "{{share}} of net worth",
  "wealth_breakdown.of_metals": "{{share}} of gold & silver",
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
  it("uses a labeled 44dp close control and an ordinary non-glowing panel", () => {
    const onClose = jest.fn();
    render(
      <WealthBreakdownSection
        breakdown={breakdown}
        currency={currency}
        isLoading={false}
        onAccountsPress={jest.fn()}
        onClose={onClose}
        onMetalsPress={jest.fn()}
      />
    );

    const close = screen.getByTestId("wealth-breakdown-close");
    expect(close.props.accessibilityRole).toBe("button");
    expect(close.props.accessibilityLabel).toBe("Close wealth breakdown");
    expect(close.props.className).toContain("min-h-11");
    fireEvent.press(close);
    expect(onClose).toHaveBeenCalledTimes(1);

    const panelClassName = screen.getByTestId("wealth-breakdown-root").props
      .className as string;
    expect(panelClassName).toContain("border-slate-200");
    expect(panelClassName).not.toMatch(/glow|shadow|drop-shadow/);
  });
});
