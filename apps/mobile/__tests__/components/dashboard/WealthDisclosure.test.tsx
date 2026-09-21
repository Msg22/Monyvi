import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { WealthDisclosure } from "@/components/dashboard/WealthDisclosure";

jest.mock("@expo/vector-icons", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Ionicons: ({ name }: { readonly name: string }): React.JSX.Element =>
      ReactActual.createElement(View, { testID: `icon-${name}` }),
  };
});

describe("WealthDisclosure", () => {
  it("exposes the collapsed label, role, state, touch target, and chevron", () => {
    const onPress = jest.fn();
    render(
      <WealthDisclosure
        isExpanded={false}
        label="See where your money is"
        onPress={onPress}
      />
    );

    const disclosure = screen.getByTestId("wealth-breakdown-disclosure");
    expect(screen.getByText("See where your money is")).toBeTruthy();
    expect(disclosure.props.accessibilityRole).toBe("button");
    expect(disclosure.props.accessibilityState).toEqual({ expanded: false });
    expect(disclosure.props.className).toContain("min-h-11");
    expect(screen.getByTestId("icon-chevron-down")).toBeTruthy();

    fireEvent.press(disclosure);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("exposes the expanded state and upward chevron", () => {
    render(
      <WealthDisclosure
        isExpanded
        label="Hide breakdown"
        onPress={jest.fn()}
      />
    );

    const disclosure = screen.getByTestId("wealth-breakdown-disclosure");
    expect(screen.getByText("Hide breakdown")).toBeTruthy();
    expect(disclosure.props.accessibilityState).toEqual({ expanded: true });
    expect(screen.getByTestId("icon-chevron-up")).toBeTruthy();
  });
});
