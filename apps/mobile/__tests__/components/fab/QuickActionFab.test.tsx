import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { QuickActionFab } from "@/components/fab/QuickActionFab";

let mockSuppressed = false;

jest.mock("@/hooks/useQuickActionFabVisibility", () => ({
  useIsQuickActionFabSuppressed: () => mockSuppressed,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
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
});
