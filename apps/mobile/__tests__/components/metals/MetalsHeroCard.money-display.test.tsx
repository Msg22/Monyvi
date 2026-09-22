import { render, screen } from "@testing-library/react-native";
import React from "react";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (): null => null,
}));

jest.mock("expo-linear-gradient", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { LinearGradient: View };
});

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/components/ui/Tooltip", () => ({
  Tooltip: (): null => null,
}));

import { MetalsHeroCard } from "@/components/metals/MetalsHeroCard";

describe("MetalsHeroCard money display", () => {
  it("hides a zero-only fractional total", () => {
    render(
      <MetalsHeroCard
        totalValue={35500}
        profitLossAmount={500}
        profitLossPercent={1.4}
        currency="EGP"
      />
    );

    expect(screen.getByText("35,500 EGP")).toBeTruthy();
    expect(screen.queryByText("35,500.00 EGP")).toBeNull();
  });

  it("retains meaningful fractional digits for the total", () => {
    render(
      <MetalsHeroCard
        totalValue={35500.01}
        profitLossAmount={0.01}
        profitLossPercent={0}
        currency="EGP"
      />
    );

    expect(screen.getByText("35,500.01 EGP")).toBeTruthy();
  });

  it("keeps the trailing fractional zero when the fraction is meaningful", () => {
    render(
      <MetalsHeroCard
        totalValue={35500.1}
        profitLossAmount={0.1}
        profitLossPercent={0}
        currency="EGP"
      />
    );

    expect(screen.getByText("35,500.10 EGP")).toBeTruthy();
  });
});
