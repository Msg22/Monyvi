import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { TotalNetWorthCard } from "@/components/dashboard/TotalNetWorthCard";

let mockLanguage: "en" | "ar" = "en";
let mockWidth = 390;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: (): unknown => ({
    width: mockWidth,
    height: 844,
    scale: 1,
    fontScale: 1,
  }),
}));

it("resizes the card glow after a window size change", () => {
  const props = {
    isLoading: false,
    monthlyPercentageChange: null,
    preferredCurrency: "EGP" as const,
    totalNetWorth: "100",
    totalNetWorthUsd: "2",
  };
  const { rerender } = render(<TotalNetWorthCard {...props} />);
  expect(screen.getByTestId("total-net-worth-glow")).toHaveStyle({
    width: 390,
  });
  mockWidth = 844;
  rerender(<TotalNetWorthCard {...props} totalNetWorth="101" />);
  expect(screen.getByTestId("total-net-worth-glow")).toHaveStyle({
    width: 844,
  });
});

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      dir: (lng?: string): "rtl" | "ltr" =>
        (lng ?? mockLanguage) === "ar" ? "rtl" : "ltr",
      language: mockLanguage,
      resolvedLanguage: mockLanguage,
    },
    t: (key: string): string => {
      if (key === "total_net_worth") {
        return mockLanguage === "ar" ? "إجمالي صافي الثروة" : "Total net worth";
      }
      if (key === "month") {
        return mockLanguage === "ar" ? "هذا الشهر" : "this month";
      }
      return key;
    },
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

jest.mock("react-native-svg", () => {
  const NullSvg = (): null => null;
  return {
    __esModule: true,
    default: NullSvg,
    Defs: NullSvg,
    RadialGradient: NullSvg,
    Rect: NullSvg,
    Stop: NullSvg,
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
    expect(screen.getByLabelText("See where your money is")).toHaveProp(
      "accessibilityRole",
      "button"
    );
    expect(screen.getByLabelText("See where your money is")).toHaveProp(
      "accessibilityState",
      { expanded: false }
    );
    fireEvent.press(screen.getByLabelText("See where your money is"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  beforeEach(() => {
    mockLanguage = "en";
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

  it("aligns English net-worth values to start/left while retaining LTR writing direction", () => {
    mockLanguage = "en";
    render(
      <TotalNetWorthCard
        isLoading={false}
        monthlyPercentageChange={2.4}
        preferredCurrency="EGP"
        totalNetWorth="1243663.92"
        totalNetWorthUsd="23848.78"
      />
    );

    expect(screen.getByTestId("total-net-worth-values")).toHaveProp(
      "className",
      expect.stringContaining("items-start")
    );

    expect(screen.getByTestId("total-net-worth-primary-value")).toHaveStyle({
      textAlign: "left",
      writingDirection: "ltr",
    });
    expect(screen.getByTestId("total-net-worth-primary-value")).toHaveProp(
      "numberOfLines",
      1
    );
    expect(screen.getByTestId("total-net-worth-primary-value")).toHaveProp(
      "adjustsFontSizeToFit",
      true
    );
    expect(screen.getByTestId("total-net-worth-primary-value")).toHaveProp(
      "minimumFontScale",
      0.5
    );

    expect(screen.getByTestId("total-net-worth-usd-equivalent")).toHaveStyle({
      textAlign: "left",
      writingDirection: "ltr",
    });
    expect(screen.getByTestId("total-net-worth-usd-equivalent")).toHaveProp(
      "numberOfLines",
      1
    );
    expect(screen.getByTestId("total-net-worth-usd-equivalent")).toHaveProp(
      "adjustsFontSizeToFit",
      true
    );
    expect(screen.getByTestId("total-net-worth-usd-equivalent")).toHaveProp(
      "minimumFontScale",
      0.75
    );
  });

  it("aligns Arabic net-worth values to end/right while retaining LTR financial writing direction", () => {
    mockLanguage = "ar";
    render(
      <TotalNetWorthCard
        isLoading={false}
        monthlyPercentageChange={2.4}
        preferredCurrency="EGP"
        totalNetWorth="1243663.92"
        totalNetWorthUsd="23848.78"
      />
    );

    expect(screen.getByTestId("total-net-worth-values")).toHaveProp(
      "className",
      expect.stringContaining("items-end")
    );

    expect(screen.getByTestId("total-net-worth-primary-value")).toHaveStyle({
      textAlign: "right",
      writingDirection: "ltr",
    });

    expect(screen.getByTestId("total-net-worth-usd-equivalent")).toHaveStyle({
      textAlign: "right",
      writingDirection: "ltr",
    });
  });

  it("aligns zero net-worth values correctly for both English and Arabic", () => {
    mockLanguage = "ar";
    const { unmount } = render(
      <TotalNetWorthCard
        isLoading={false}
        monthlyPercentageChange={null}
        preferredCurrency="EGP"
        totalNetWorth="0"
        totalNetWorthUsd="0"
      />
    );

    expect(screen.getByTestId("total-net-worth-values")).toHaveProp(
      "className",
      expect.stringContaining("items-end")
    );
    expect(screen.getByTestId("total-net-worth-primary-value")).toHaveStyle({
      textAlign: "right",
      writingDirection: "ltr",
    });
    expect(screen.getByTestId("total-net-worth-usd-equivalent")).toHaveStyle({
      textAlign: "right",
      writingDirection: "ltr",
    });

    unmount();
    mockLanguage = "en";
    render(
      <TotalNetWorthCard
        isLoading={false}
        monthlyPercentageChange={null}
        preferredCurrency="EGP"
        totalNetWorth="0"
        totalNetWorthUsd="0"
      />
    );

    expect(screen.getByTestId("total-net-worth-values")).toHaveProp(
      "className",
      expect.stringContaining("items-start")
    );
    expect(screen.getByTestId("total-net-worth-primary-value")).toHaveStyle({
      textAlign: "left",
      writingDirection: "ltr",
    });
    expect(screen.getByTestId("total-net-worth-usd-equivalent")).toHaveStyle({
      textAlign: "left",
      writingDirection: "ltr",
    });
  });
});
