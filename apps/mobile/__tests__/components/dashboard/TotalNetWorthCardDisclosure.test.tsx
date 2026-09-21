import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { TotalNetWorthCard } from "@/components/dashboard/TotalNetWorthCard";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string): string =>
      key === "total_net_worth"
        ? "Total net worth"
        : key === "month"
          ? "this month"
          : key,
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

describe("TotalNetWorthCard wealth disclosure", () => {
  it("renders the disclosure inside the card and forwards its interaction", () => {
    const onPress = jest.fn();
    render(
      <TotalNetWorthCard
        breakdownDisclosure={{
          isExpanded: false,
          label: "See where your money is",
          onPress,
        }}
        isLoading={false}
        monthlyPercentageChange={2.4}
        preferredCurrency="EGP"
        totalNetWorth="1243663.92"
        totalNetWorthUsd="23848.78"
      />
    );

    expect(screen.getByTestId("total-net-worth-card")).toBeTruthy();
    expect(screen.getByText("EGP 1,243,663.92")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "See where your money is",
        expanded: false,
      })
    ).toBeTruthy();
    fireEvent.press(
      screen.getByRole("button", {
        name: "See where your money is",
        expanded: false,
      })
    );
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not render disclosure chrome when the controller omits it", () => {
    render(
      <TotalNetWorthCard
        isLoading={false}
        monthlyPercentageChange={null}
        preferredCurrency="EGP"
        totalNetWorth="0"
        totalNetWorthUsd="0"
      />
    );

    expect(screen.queryByTestId("wealth-breakdown-disclosure")).toBeNull();
  });
});
