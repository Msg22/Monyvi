import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import type { CurrencyType } from "@monyvi/db";
import type { WealthBreakdownReadModel } from "@/services/net-worth-read-model-service";
import {
  getWealthRevealDuration,
  hasNonZeroCanonicalNetWorth,
  HomeWealthSummary,
} from "@/components/dashboard/HomeWealthSummary";

let mockFocusCallback: (() => void | (() => void)) | null = null;
let mockLanguage: "en" | "ar" = "en";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)): void => {
    mockFocusCallback = callback;
  },
}));

jest.mock("@/hooks/useUiPolishCopy", () => ({
  useUiPolishCopy: () =>
    mockLanguage === "ar"
      ? {
          wealth_breakdown: {
            show: "شوف فلوسك موزّعة فين",
            hide: "إخفاء التفاصيل",
            close: "إغلاق تفاصيل توزيع الفلوس",
          },
          metals_empty: {},
        }
      : {
          wealth_breakdown: {
            show: "See where your money is",
            hide: "Hide breakdown",
            close: "Close wealth breakdown",
          },
          metals_empty: {},
        },
}));

jest.mock("@/components/dashboard/TotalNetWorthCard", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    TotalNetWorthCard: ({
      breakdownDisclosure,
    }: {
      readonly breakdownDisclosure?: {
        readonly isExpanded: boolean;
        readonly label: string;
        readonly onPress: () => void;
      };
    }): React.JSX.Element =>
      ReactActual.createElement(
        View,
        { testID: "mock-net-worth-card" },
        breakdownDisclosure
          ? ReactActual.createElement(
              Pressable,
              {
                accessibilityLabel: breakdownDisclosure.label,
                accessibilityRole: "button",
                accessibilityState: {
                  expanded: breakdownDisclosure.isExpanded,
                },
                onPress: breakdownDisclosure.onPress,
                testID: "mock-wealth-disclosure",
              },
              ReactActual.createElement(Text, null, breakdownDisclosure.label)
            )
          : null
      ),
  };
});

jest.mock("@/components/dashboard/WealthBreakdownSection", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { Pressable, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    WealthBreakdownSection: ({
      closeAccessibilityLabel,
      onClose,
    }: {
      readonly closeAccessibilityLabel?: string;
      readonly onClose?: () => void;
    }): React.JSX.Element =>
      ReactActual.createElement(
        View,
        { testID: "mock-wealth-breakdown" },
        ReactActual.createElement(Pressable, {
          accessibilityLabel: closeAccessibilityLabel,
          onPress: onClose,
          testID: "mock-wealth-breakdown-close",
        })
      ),
  };
});

const currency: CurrencyType = "EGP";
const breakdown = {
  totalNetWorthDecimal: "1243663.92",
} as unknown as WealthBreakdownReadModel;

function renderSummary({
  isLoading = false,
  totalNetWorth = "1243663.92",
}: {
  readonly isLoading?: boolean;
  readonly totalNetWorth?: number | string | null;
} = {}): ReturnType<typeof render> {
  return render(
    <HomeWealthSummary
      breakdown={breakdown}
      currency={currency}
      isBreakdownLoading={false}
      isLoading={isLoading}
      monthlyPercentageChange={2.4}
      onAccountsPress={jest.fn()}
      onMetalsPress={jest.fn()}
      totalNetWorth={totalNetWorth}
      totalNetWorthUsd="23848.78"
    />
  );
}

describe("hasNonZeroCanonicalNetWorth", () => {
  it.each([
    ["1", true],
    ["-1", true],
    ["9007199254740993.245", true],
    ["-9007199254740993.245", true],
    [1, true],
    [-1, true],
    ["0", false],
    ["0.00", false],
    ["-0", false],
    [0, false],
    [null, false],
    [undefined, false],
    ["", false],
    ["1e3", false],
    ["1,000", false],
    [Number.POSITIVE_INFINITY, false],
  ])("classifies %p without coercing canonical strings", (value, expected) => {
    expect(hasNonZeroCanonicalNetWorth(value)).toBe(expected);
  });
});

describe("HomeWealthSummary", () => {
  beforeEach(() => {
    mockFocusCallback = null;
    mockLanguage = "en";
  });

  it("starts collapsed, then expands and collapses through both controls", () => {
    renderSummary();

    expect(
      screen.getByRole("button", {
        name: "See where your money is",
        expanded: false,
      })
    ).toBeTruthy();
    expect(screen.queryByTestId("mock-wealth-breakdown")).toBeNull();

    fireEvent.press(
      screen.getByRole("button", {
        name: "See where your money is",
        expanded: false,
      })
    );
    expect(screen.getByTestId("mock-wealth-breakdown")).toBeTruthy();
    expect(screen.getByTestId("home-wealth-breakdown-reveal")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Hide breakdown",
        expanded: true,
      })
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId("mock-wealth-breakdown-close"));
    expect(screen.queryByTestId("mock-wealth-breakdown")).toBeNull();
  });

  it("returns to the collapsed state whenever Home receives focus", () => {
    renderSummary();
    fireEvent.press(screen.getByTestId("mock-wealth-disclosure"));
    expect(screen.getByTestId("mock-wealth-breakdown")).toBeTruthy();

    act(() => {
      mockFocusCallback?.();
    });

    expect(screen.queryByTestId("mock-wealth-breakdown")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "See where your money is",
        expanded: false,
      })
    ).toBeTruthy();
  });

  it.each(["0.01", "-0.01"])(
    "shows the disclosure for nonzero value %s",
    (totalNetWorth) => {
      renderSummary({ totalNetWorth });
      expect(screen.getByTestId("mock-wealth-disclosure")).toBeTruthy();
    }
  );

  it.each(["0", "0.00", "1e3", null])(
    "hides the disclosure when net worth is %p",
    (totalNetWorth) => {
      renderSummary({ totalNetWorth });
      expect(screen.queryByTestId("mock-wealth-disclosure")).toBeNull();
    }
  );

  it("hides the disclosure while the net-worth card is loading", () => {
    renderSummary({ isLoading: true });
    expect(screen.queryByTestId("mock-wealth-disclosure")).toBeNull();
  });

  it("uses the approved Arabic disclosure and close labels", () => {
    mockLanguage = "ar";
    renderSummary();

    expect(screen.getByText("شوف فلوسك موزّعة فين")).toBeTruthy();
    fireEvent.press(screen.getByTestId("mock-wealth-disclosure"));
    expect(screen.getByText("إخفاء التفاصيل")).toBeTruthy();
    expect(
      screen.getByLabelText("إغلاق تفاصيل توزيع الفلوس")
    ).toBeTruthy();
  });

  it("uses no animation duration under Reduce Motion", () => {
    expect(getWealthRevealDuration(false)).toBe(180);
    expect(getWealthRevealDuration(true)).toBe(0);
  });
});
