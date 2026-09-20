/**
 * Localization coverage for the onboarding currency picker.
 *
 * Proves the onboarding surface renders names from the shared currency
 * catalogue (not the English-first metadata) in both languages, and that
 * search works by ISO code, localized name, and canonical English name.
 */

import { fireEvent, render, screen } from "@testing-library/react-native";
import i18next from "i18next";
import React from "react";
import { initReactI18next } from "react-i18next";

import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";
import { CurrencyPickerStep } from "@/components/onboarding/CurrencyPickerStep";

jest.mock("@/utils/currency-detection", () => ({
  detectCurrencyFromTimezone: (): string => "EGP",
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): {
    theme: { backgroundGradient: string[] };
    isDark: boolean;
  } => ({
    theme: { backgroundGradient: ["#000", "#111"] },
    isDark: false,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { top: number; bottom: number } => ({
    top: 0,
    bottom: 0,
  }),
}));

jest.mock("expo-linear-gradient", () => {
  const RN = jest.requireActual<typeof import("react-native")>("react-native");
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  return {
    LinearGradient: (props: Record<string, unknown>): unknown =>
      ReactModule.createElement(RN.View, props),
  };
});

async function prepareI18n(language: "en" | "ar"): Promise<void> {
  if (!i18next.isInitialized) {
    await i18next.use(initReactI18next).init({
      resources: {
        en: { common: enCommon },
        ar: { common: arCommon },
      },
      lng: language,
      fallbackLng: "en",
      ns: "common",
      defaultNS: "common",
      interpolation: { escapeValue: false },
    });
    return;
  }
  await i18next.changeLanguage(language);
}

describe("CurrencyPickerStep localization", () => {
  afterEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("renders Arabic currency names and finds them by English name", async () => {
    await prepareI18n("ar");
    render(<CurrencyPickerStep onCurrencySelected={jest.fn()} />);

    fireEvent.changeText(
      screen.getByPlaceholderText("search_currency"),
      "US Dollar"
    );

    expect(screen.getByText("الدولار الأمريكي")).toBeOnTheScreen();
    expect(screen.getByText("USD")).toBeOnTheScreen();
  });

  it("finds a currency by its localized Arabic name", async () => {
    await prepareI18n("ar");
    render(<CurrencyPickerStep onCurrencySelected={jest.fn()} />);

    fireEvent.changeText(
      screen.getByPlaceholderText("search_currency"),
      "الجنيه المصري"
    );

    expect(screen.getByText("الجنيه المصري")).toBeOnTheScreen();
    expect(screen.getByText("EGP")).toBeOnTheScreen();
  });

  it("renders English currency names while English is active", async () => {
    await prepareI18n("en");
    render(<CurrencyPickerStep onCurrencySelected={jest.fn()} />);

    fireEvent.changeText(screen.getByPlaceholderText("search_currency"), "SAR");

    expect(screen.getByText("Saudi Riyal")).toBeOnTheScreen();
    expect(screen.getByText("SAR")).toBeOnTheScreen();
  });
});
