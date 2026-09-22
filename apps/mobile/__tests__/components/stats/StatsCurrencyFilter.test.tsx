import { fireEvent, render, screen } from "@testing-library/react-native";
import i18next from "i18next";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";

import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";

let mockViewportWidth = 390;
let mockViewportFontScale = 1;
let mockLanguage = "en";

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: (): {
    readonly width: number;
    readonly height: number;
    readonly scale: number;
    readonly fontScale: number;
  } => ({
    width: mockViewportWidth,
    height: 844,
    scale: 3,
    fontScale: mockViewportFontScale,
  }),
}));

function mockViewport(width: number, fontScale: number): void {
  mockViewportWidth = width;
  mockViewportFontScale = fontScale;
}

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

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: string } => ({ language: mockLanguage }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

import { StatsCurrencyFilter } from "@/components/stats/StatsCurrencyFilter";

describe("StatsCurrencyFilter", () => {
  beforeEach(() => {
    mockViewport(390, 1);
    mockLanguage = "en";
  });

  it("shows only currencies with transaction data and selects another currency", () => {
    const onSelectCurrency = jest.fn();

    render(
      <StatsCurrencyFilter
        availableCurrencies={["EGP", "USD"]}
        selectedCurrency="EGP"
        onSelectCurrency={onSelectCurrency}
      />
    );

    fireEvent.press(screen.getByTestId("stats-currency-trigger"));

    expect(screen.getByTestId("stats-currency-option-EGP")).toBeOnTheScreen();
    expect(screen.getByTestId("stats-currency-option-USD")).toBeOnTheScreen();
    expect(screen.queryByTestId("stats-currency-option-EUR")).toBeNull();

    fireEvent.press(screen.getByTestId("stats-currency-option-USD"));
    expect(onSelectCurrency).toHaveBeenCalledWith("USD");
    expect(screen.queryByTestId("stats-currency-menu")).toBeNull();
  });

  it("replaces the two-line currency block with a single localized label", () => {
    render(
      <StatsCurrencyFilter
        availableCurrencies={["EGP", "USD"]}
        selectedCurrency="EGP"
        onSelectCurrency={jest.fn()}
      />
    );

    expect(screen.getByTestId("stats-currency-label")).toHaveTextContent(
      "transaction_currency"
    );
    expect(screen.queryByTestId("stats-currency-scope")).toBeNull();
    expect(screen.queryByText(/transactions · EGP/)).toBeNull();
  });

  it("renders names from the shared localized catalogue in Arabic", async () => {
    mockLanguage = "ar";
    if (!i18next.isInitialized) {
      await i18next.init({
        resources: { en: { common: enCommon }, ar: { common: arCommon } },
        lng: "ar",
        fallbackLng: "en",
        ns: "common",
        defaultNS: "common",
        interpolation: { escapeValue: false },
      });
    } else {
      await i18next.changeLanguage("ar");
    }

    render(
      <StatsCurrencyFilter
        availableCurrencies={["EGP", "USD"]}
        selectedCurrency="EGP"
        onSelectCurrency={jest.fn()}
      />
    );

    fireEvent.press(screen.getByTestId("stats-currency-trigger"));

    expect(screen.getByText("الجنيه المصري")).toBeOnTheScreen();
    expect(screen.getByText("الدولار الأمريكي")).toBeOnTheScreen();
    expect(screen.queryByText("Egyptian Pound")).toBeNull();

    await i18next.changeLanguage("en");
  });

  it("keeps the flag and selected currency code inside the selector only", () => {
    render(
      <StatsCurrencyFilter
        availableCurrencies={["EGP", "USD"]}
        selectedCurrency="EGP"
        onSelectCurrency={jest.fn()}
      />
    );

    expect(screen.getByText("🇪🇬")).toBeOnTheScreen();
    expect(screen.getAllByText("EGP")).toHaveLength(1);
  });

  it("renders label and selector on one vertically centered row on ordinary phones", () => {
    mockViewport(390, 1);

    render(
      <StatsCurrencyFilter
        availableCurrencies={["EGP", "USD"]}
        selectedCurrency="EGP"
        onSelectCurrency={jest.fn()}
      />
    );

    expect(screen.getByTestId("stats-currency-filter-row")).toHaveProp(
      "className",
      expect.stringContaining("flex-row")
    );
    expect(screen.getByTestId("stats-currency-filter-row")).toHaveProp(
      "className",
      expect.stringContaining("items-center")
    );
    expect(screen.getByTestId("stats-currency-filter-row")).toHaveProp(
      "className",
      expect.not.stringContaining("flex-col")
    );
  });

  it("stacks label and selector cleanly on compact phones", () => {
    mockViewport(320, 1);

    render(
      <StatsCurrencyFilter
        availableCurrencies={["EGP", "USD"]}
        selectedCurrency="EGP"
        onSelectCurrency={jest.fn()}
      />
    );

    expect(screen.getByTestId("stats-currency-filter-row")).toHaveProp(
      "className",
      expect.stringContaining("flex-col")
    );
    expect(screen.getByTestId("stats-currency-filter-row")).toHaveProp(
      "className",
      expect.stringContaining("items-start")
    );
    expect(screen.getByTestId("stats-currency-filter-row")).toHaveProp(
      "className",
      expect.not.stringContaining("flex-row")
    );
  });

  it("stacks label and selector under enlarged font scale", () => {
    mockViewport(390, 2);

    render(
      <StatsCurrencyFilter
        availableCurrencies={["EGP", "USD"]}
        selectedCurrency="EGP"
        onSelectCurrency={jest.fn()}
      />
    );

    expect(screen.getByTestId("stats-currency-filter-row")).toHaveProp(
      "className",
      expect.stringContaining("flex-col")
    );
    expect(screen.getByTestId("stats-currency-filter-row")).toHaveProp(
      "className",
      expect.not.stringContaining("flex-row")
    );
  });

  it("uses logical spacing classes only so the row mirrors correctly in RTL", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../../../components/stats/StatsCurrencyFilter.tsx"
      ),
      "utf8"
    );

    expect(source).not.toMatch(/\bml-\d/);
    expect(source).not.toMatch(/\bmr-\d/);
    expect(source).toMatch(/\bme-\d/);
  });

  it("preserves the accessible label and 44pt-class touch target on the selector", () => {
    render(
      <StatsCurrencyFilter
        availableCurrencies={["EGP", "USD"]}
        selectedCurrency="EGP"
        onSelectCurrency={jest.fn()}
      />
    );

    expect(screen.getByTestId("stats-currency-trigger")).toHaveProp(
      "accessibilityLabel",
      "select_currency"
    );

    const source = readFileSync(
      resolve(
        __dirname,
        "../../../components/stats/StatsCurrencyFilter.tsx"
      ),
      "utf8"
    );
    expect(source).toContain("min-h-11");
  });

  it("positions the menu below the measured filter row height", () => {
    render(
      <StatsCurrencyFilter
        availableCurrencies={["EGP", "USD"]}
        selectedCurrency="EGP"
        onSelectCurrency={jest.fn()}
      />
    );

    fireEvent(screen.getByTestId("stats-currency-filter-row"), "layout", {
      nativeEvent: {
        layout: { x: 0, y: 0, width: 320, height: 72 },
      },
    });
    fireEvent.press(screen.getByTestId("stats-currency-trigger"));

    expect(screen.getByTestId("stats-currency-menu")).toHaveStyle({ top: 72 });
  });

  it("keeps valid transaction currencies that are missing from the fiat catalog", () => {
    render(
      <StatsCurrencyFilter
        availableCurrencies={["BTC", "EGP"]}
        selectedCurrency="BTC"
        onSelectCurrency={jest.fn()}
      />
    );

    expect(screen.getByTestId("stats-currency-trigger")).not.toBeDisabled();
    fireEvent.press(screen.getByTestId("stats-currency-trigger"));
    expect(screen.getByTestId("stats-currency-option-BTC")).toBeOnTheScreen();
    expect(screen.getByTestId("stats-currency-option-EGP")).toBeOnTheScreen();
    expect(screen.getByTestId("stats-currency-option-BTC")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true })
    );
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
