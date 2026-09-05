import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { StatsCurrencyFilter } from "@/components/stats/StatsCurrencyFilter";

function MockIonicons(): React.JSX.Element {
  const ReactNative =
    jest.requireActual<typeof import("react-native")>("react-native");
  return <ReactNative.Text>icon</ReactNative.Text>;
}

jest.mock("@expo/vector-icons", () => ({
  Ionicons: MockIonicons,
}));

jest.mock("@monyvi/logic", () => ({
  SORTED_SUPPORTED_CURRENCIES: [
    { code: "EGP", name: "Egyptian Pound", symbol: "E£", flag: "🇪🇬" },
    { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸" },
    { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺" },
  ],
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

describe("StatsCurrencyFilter", () => {
  it("shows only currencies with transaction data and selects another currency", () => {
    const onSelectCurrency = jest.fn();

    render(
      <StatsCurrencyFilter
        availableCurrencies={["EGP", "USD"]}
        selectedCurrency="EGP"
        onSelectCurrency={onSelectCurrency}
      />
    );

    expect(screen.getByTestId("stats-currency-scope")).toHaveTextContent(
      "transactions · EGP"
    );

    fireEvent.press(screen.getByTestId("stats-currency-trigger"));

    expect(screen.getByTestId("stats-currency-option-EGP")).toBeOnTheScreen();
    expect(screen.getByTestId("stats-currency-option-USD")).toBeOnTheScreen();
    expect(screen.queryByTestId("stats-currency-option-EUR")).toBeNull();

    fireEvent.press(screen.getByTestId("stats-currency-option-USD"));
    expect(onSelectCurrency).toHaveBeenCalledWith("USD");
    expect(screen.queryByTestId("stats-currency-menu")).toBeNull();
  });

  it("disables the selector when only one transaction currency exists", () => {
    render(
      <StatsCurrencyFilter
        availableCurrencies={["EGP"]}
        selectedCurrency="EGP"
        onSelectCurrency={jest.fn()}
      />
    );

    expect(screen.getByTestId("stats-currency-trigger")).toBeDisabled();
    fireEvent.press(screen.getByTestId("stats-currency-trigger"));
    expect(screen.queryByTestId("stats-currency-menu")).toBeNull();
  });

  it("renders no selector before any transaction currency exists", () => {
    render(
      <StatsCurrencyFilter
        availableCurrencies={[]}
        selectedCurrency="EGP"
        onSelectCurrency={jest.fn()}
      />
    );

    expect(screen.queryByTestId("stats-currency-trigger")).toBeNull();
  });
});
