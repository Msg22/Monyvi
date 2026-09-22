import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { QuickActionFab } from "@/components/fab/QuickActionFab";
import { TAB_BAR_HEIGHT } from "@/constants/ui";

let mockSuppressed = false;
let mockBottomInset = 0;

jest.mock("@/hooks/useQuickActionFabVisibility", () => ({
  useIsQuickActionFabSuppressed: () => mockSuppressed,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({
    bottom: mockBottomInset,
    top: 0,
    left: 0,
    right: 0,
  }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
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

describe("QuickActionFab expansion and suppression lifecycle", () => {
  beforeEach(() => {
    mockSuppressed = false;
    mockBottomInset = 0;
  });

  it("resets expansion state when suppression becomes active while open", () => {
    const { rerender } = render(<QuickActionFab isRecordingActive={false} />);

    expect(screen.getByLabelText("Quick actions")).toBeTruthy();
    expect(screen.queryByTestId("fab-transaction")).toBeNull();

    fireEvent.press(screen.getByLabelText("Quick actions"));
    expect(screen.getByTestId("fab-transaction")).toBeTruthy();

    mockSuppressed = true;
    rerender(<QuickActionFab isRecordingActive={false} />);

    expect(screen.queryByLabelText("Quick actions")).toBeNull();
    expect(screen.queryByTestId("fab-transaction")).toBeNull();

    mockSuppressed = false;
    rerender(<QuickActionFab isRecordingActive={false} />);

    expect(screen.getByLabelText("Quick actions")).toBeTruthy();
    expect(screen.queryByTestId("fab-transaction")).toBeNull();
  });

  it("keeps the expanded actions above the device bottom inset", () => {
    mockBottomInset = 24;
    render(<QuickActionFab />);
    fireEvent.press(screen.getByLabelText("Quick actions"));
    expect(screen.getByTestId("fab-position")).toHaveStyle({
      bottom: TAB_BAR_HEIGHT + 24,
    });
  });
});
