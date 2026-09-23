import { cleanup, render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import {
  useIsQuickActionFabSuppressed,
  useSuppressQuickActionFabWhenFocused,
} from "@/hooks/useQuickActionFabVisibility";

jest.mock("expo-router", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  return {
    useFocusEffect: (callback: () => void | (() => void)): void => {
      ReactActual.useEffect(callback, [callback]);
    },
  };
});

function Suppressor({ active }: { readonly active: boolean }): null {
  useSuppressQuickActionFabWhenFocused(active);
  return null;
}

function Observer(): React.JSX.Element {
  const isSuppressed = useIsQuickActionFabSuppressed();
  return <Text>{isSuppressed ? "suppressed" : "visible"}</Text>;
}

describe("useQuickActionFabVisibility", () => {
  afterEach(() => {
    cleanup();
  });

  it("suppresses while the focused owner requests it and clears on unmount", () => {
    const view = render(
      <>
        <Suppressor active />
        <Observer />
      </>
    );
    expect(screen.getByText("suppressed")).toBeTruthy();

    view.unmount();
    render(<Observer />);
    expect(screen.getByText("visible")).toBeTruthy();
  });
});
