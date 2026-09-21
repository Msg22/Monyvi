import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import {
  hasNonZeroCanonicalNetWorth,
  WealthDisclosure,
} from "@/components/dashboard/WealthDisclosure";

let mockLanguage = "en";

const translations: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  en: {
    "wealth_breakdown.show": "See where your money is",
    "wealth_breakdown.hide": "Hide breakdown",
  },
  ar: {
    "wealth_breakdown.show": "شوف فلوسك موزّعة فين",
    "wealth_breakdown.hide": "إخفاء التفاصيل",
  },
};

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly i18n: { readonly resolvedLanguage: string };
    readonly t: (key: string) => string;
  } => ({
    i18n: { resolvedLanguage: mockLanguage },
    t: (key: string): string => translations[mockLanguage]?.[key] ?? key,
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

describe("hasNonZeroCanonicalNetWorth", () => {
  it.each([
    ["1", true],
    ["-1", true],
    ["9007199254740993.245", true],
    ["-9007199254740993.245", true],
    ["0", false],
    ["0.00", false],
    ["-0", false],
    [null, false],
    [undefined, false],
    ["", false],
    ["1e3", false],
    ["1,000", false],
    [Number.POSITIVE_INFINITY, false],
  ])("classifies %p without floating-point coercion", (value, expected) => {
    expect(hasNonZeroCanonicalNetWorth(value)).toBe(expected);
  });
});

describe("WealthDisclosure", () => {
  afterEach(() => {
    mockLanguage = "en";
  });

  it("announces and opens the collapsed wealth breakdown", () => {
    const onPress = jest.fn();
    render(<WealthDisclosure isExpanded={false} onPress={onPress} />);

    const disclosure = screen.getByTestId("wealth-breakdown-disclosure");
    expect(screen.getByText("See where your money is")).toBeTruthy();
    expect(screen.getByLabelText("See where your money is")).toBeTruthy();
    expect(disclosure.props.accessibilityRole).toBe("button");
    expect(disclosure.props.accessibilityState).toEqual({ expanded: false });
    expect(screen.getByTestId("icon-chevron-down")).toBeTruthy();

    fireEvent.press(disclosure);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("announces the expanded state and upward chevron", () => {
    render(<WealthDisclosure isExpanded onPress={jest.fn()} />);

    const disclosure = screen.getByTestId("wealth-breakdown-disclosure");
    expect(screen.getByText("Hide breakdown")).toBeTruthy();
    expect(disclosure.props.accessibilityState).toEqual({ expanded: true });
    expect(screen.getByTestId("icon-chevron-up")).toBeTruthy();
  });

  it("uses the approved Arabic disclosure copy", () => {
    mockLanguage = "ar";
    render(<WealthDisclosure isExpanded={false} onPress={jest.fn()} />);

    expect(screen.getByText("شوف فلوسك موزّعة فين")).toBeTruthy();
    expect(screen.getByLabelText("شوف فلوسك موزّعة فين")).toBeTruthy();
  });
});
