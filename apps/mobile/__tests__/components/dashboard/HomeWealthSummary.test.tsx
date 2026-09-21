import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import type { CurrencyType } from "@monyvi/db";
import type { WealthBreakdownReadModel } from "@/services/net-worth-read-model-service";
import {
  getWealthRevealDuration,
  HomeWealthSummary,
} from "@/components/dashboard/HomeWealthSummary";

let mockFocusCallback: (() => void | (() => void)) | null = null;

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (callback: () => void | (() => void)): void => {
    mockFocusCallback = callback;
  },
}));

jest.mock("@/components/dashboard/TotalNetWorthCard", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { Pressable, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    TotalNetWorthCard: ({
      isBreakdownExpanded,
      onBreakdownDisclosurePress,
      showBreakdownDisclosure,
    }: {
      readonly isBreakdownExpanded: boolean;
      readonly onBreakdownDisclosurePress: () => void;
      readonly showBreakdownDisclosure: boolean;
    }): React.JSX.Element =>
      ReactActual.createElement(
        View,
        { testID: "mock-net-worth-card" },
        showBreakdownDisclosure
          ? ReactActual.createElement(Pressable, {
              accessibilityRole: "button",
              accessibilityState: { expanded: isBreakdownExpanded },
              onPress: onBreakdownDisclosurePress,
              testID: "mock-wealth-disclosure",
            })
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
      onClose,
    }: {
      readonly onClose: () => void;
    }): React.JSX.Element =>
      ReactActual.createElement(
        View,
        { testID: "mock-wealth-breakdown" },
        ReactActual.createElement(Pressable, {
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

function renderSummary(totalNetWorth: string | null = "1243663.92") {
  return render(
    <HomeWealthSummary
      breakdown={breakdown}
      currency={currency}
      isBreakdownLoading={false}
      isLoading={false}
      monthlyPercentageChange={2.4}
      onAccountsPress={jest.fn()}
      onMetalsPress={jest.fn()}
      totalNetWorth={totalNetWorth}
      totalNetWorthUsd="23848.78"
    />
  );
}

describe("HomeWealthSummary", () => {
  beforeEach(() => {
    mockFocusCallback = null;
  });

  it("starts collapsed and expands or closes through either control", () => {
    renderSummary();

    expect(screen.queryByTestId("mock-wealth-breakdown")).toBeNull();
    fireEvent.press(screen.getByTestId("mock-wealth-disclosure"));
    expect(screen.getByTestId("mock-wealth-breakdown")).toBeTruthy();
    expect(screen.getByTestId("home-wealth-breakdown-reveal")).toBeTruthy();

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
      screen.getByTestId("mock-wealth-disclosure").props.accessibilityState
    ).toEqual({ expanded: false });
  });

  it("shows the disclosure for positive and negative nonzero canonical values", () => {
    const { rerender } = renderSummary("0.01");
    expect(screen.getByTestId("mock-wealth-disclosure")).toBeTruthy();

    rerender(
      <HomeWealthSummary
        breakdown={breakdown}
        currency={currency}
        isBreakdownLoading={false}
        isLoading={false}
        monthlyPercentageChange={null}
        onAccountsPress={jest.fn()}
        onMetalsPress={jest.fn()}
        totalNetWorth="-0.01"
        totalNetWorthUsd={null}
      />
    );
    expect(screen.getByTestId("mock-wealth-disclosure")).toBeTruthy();
  });

  it.each(["0", "0.00", "1e3", null])(
    "hides the disclosure when net worth is %p",
    (totalNetWorth) => {
      renderSummary(totalNetWorth);
      expect(screen.queryByTestId("mock-wealth-disclosure")).toBeNull();
    }
  );

  it("hides and collapses the disclosure while net worth is loading", () => {
    const { rerender } = renderSummary();
    fireEvent.press(screen.getByTestId("mock-wealth-disclosure"));

    rerender(
      <HomeWealthSummary
        breakdown={breakdown}
        currency={currency}
        isBreakdownLoading
        isLoading
        monthlyPercentageChange={null}
        onAccountsPress={jest.fn()}
        onMetalsPress={jest.fn()}
        totalNetWorth="1243663.92"
        totalNetWorthUsd={null}
      />
    );

    expect(screen.queryByTestId("mock-wealth-disclosure")).toBeNull();
    expect(screen.queryByTestId("mock-wealth-breakdown")).toBeNull();
  });

  it("uses no reveal duration when Reduce Motion is enabled", () => {
    expect(getWealthRevealDuration(false)).toBe(180);
    expect(getWealthRevealDuration(true)).toBe(0);
  });
});
