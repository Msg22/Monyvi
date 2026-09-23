import { fireEvent, render, screen, within } from "@testing-library/react-native";
import i18next from "i18next";
import React from "react";

import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";
import { CurrencyPicker } from "@/components/currency/CurrencyPicker";
import { palette } from "@/constants/colors";

interface MockIconProps {
  readonly color?: string;
  readonly name: string;
  readonly testID?: string;
}

function MockIonicons({
  color,
  name,
  testID,
}: MockIconProps): React.JSX.Element {
  const ReactNative =
    jest.requireActual<typeof import("react-native")>("react-native");

  return (
    <ReactNative.Text
      testID={testID}
    >{`${name}:${color ?? ""}`}</ReactNative.Text>
  );
}

jest.mock("@expo/vector-icons", () => ({
  Ionicons: MockIonicons,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 0 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly t: (key: string) => string;
    readonly i18n: { readonly language: string };
  } => ({
    t: (key: string): string => key,
    i18n: { language: "en" },
  }),
}));

const SEARCH_PLACEHOLDER = "search_currency_name_code";

async function prepareI18n(language: "en" | "ar"): Promise<void> {
  if (!i18next.isInitialized) {
    await i18next.init({
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

function renderPicker(): void {
  render(
    <CurrencyPicker
      visible
      selectedCurrency="EGP"
      onSelect={jest.fn()}
      onClose={jest.fn()}
    />
  );
}

function search(query: string): void {
  fireEvent.changeText(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), query);
}

describe("CurrencyPicker", () => {
  afterEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("shows a selected checkmark after the currency code only for the selected currency", async () => {
    await prepareI18n("en");
    renderPicker();

    const selectedCodeRow = within(screen.getByTestId("currency-code-row-EGP"));

    expect(selectedCodeRow.getByTestId("currency-code-EGP")).toHaveTextContent(
      "EGP"
    );
    expect(
      selectedCodeRow.getByTestId("currency-selected-checkmark-EGP")
    ).toHaveTextContent(`checkmark-circle:${palette.nileGreen[500]}`);
    expect(screen.getByTestId("currency-row-highlight-EGP")).toBeOnTheScreen();
    expect(screen.queryByTestId("currency-selected-checkmark-AED")).toBeNull();
  });

  it("renders localized names in Arabic while keeping the ISO code visible", async () => {
    await prepareI18n("ar");
    renderPicker();
    search("EGP");

    expect(screen.getByText("الجنيه المصري")).toBeOnTheScreen();
    expect(screen.getByTestId("currency-code-EGP")).toHaveTextContent("EGP");
  });

  it("renders English names while English is active", async () => {
    await prepareI18n("en");
    renderPicker();
    search("EGP");

    expect(screen.getByText("Egyptian Pound")).toBeOnTheScreen();
  });

  it("finds a currency by its localized Arabic name", async () => {
    await prepareI18n("ar");
    renderPicker();
    search("الدولار الأمريكي");

    expect(screen.getByTestId("currency-code-USD")).toHaveTextContent("USD");
    expect(screen.getByText("الدولار الأمريكي")).toBeOnTheScreen();
  });

  it("finds a currency by its canonical English name while Arabic is active", async () => {
    await prepareI18n("ar");
    renderPicker();
    search("Egyptian Pound");

    expect(screen.getByTestId("currency-code-EGP")).toHaveTextContent("EGP");
    expect(screen.getByText("الجنيه المصري")).toBeOnTheScreen();
  });

  it("finds a currency by ISO code", async () => {
    await prepareI18n("en");
    renderPicker();
    search("zar");

    expect(screen.getByTestId("currency-code-ZAR")).toHaveTextContent("ZAR");
  });

  it("forwards the selected ISO code unchanged", async () => {
    await prepareI18n("ar");
    const onSelect = jest.fn();
    render(
      <CurrencyPicker
        visible
        selectedCurrency="EGP"
        onSelect={onSelect}
        onClose={jest.fn()}
      />
    );
    search("EGP");

    fireEvent.press(screen.getByTestId("currency-code-row-EGP"));

    expect(onSelect).toHaveBeenCalledWith("EGP");
  });
});
