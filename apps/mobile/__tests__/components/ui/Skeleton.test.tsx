import React from "react";
import { render, screen } from "@testing-library/react-native";

let mockIsReducedMotion = false;
const mockCancelAnimation = jest.fn();
const mockWithRepeat = jest.fn((value: unknown): unknown => value);

jest.mock("react-native-reanimated", () => {
  const ReactNative =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: { View: ReactNative.View },
    cancelAnimation: (...args: readonly unknown[]): void => {
      mockCancelAnimation(...args);
    },
    useAnimatedStyle: (factory: () => object): object => factory(),
    useReducedMotion: (): boolean => mockIsReducedMotion,
    useSharedValue: (value: number): { value: number } => ({ value }),
    withRepeat: (value: unknown): unknown => mockWithRepeat(value),
    withTiming: (value: number): number => value,
  };
});

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: (): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <ReactNative.View testID="skeleton-gradient" />;
  },
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

import { Skeleton } from "@/components/ui/Skeleton";

describe("Skeleton", () => {
  beforeEach(() => {
    mockIsReducedMotion = false;
    mockCancelAnimation.mockClear();
    mockWithRepeat.mockClear();
  });

  it("renders a decorative shimmer and cancels its repeat on cleanup", () => {
    const view = render(<Skeleton width="100%" height={24} borderRadius={12} />);

    expect(screen.getByTestId("skeleton-shimmer")).toBeOnTheScreen();
    expect(screen.getByTestId("skeleton-block")).toHaveProp(
      "importantForAccessibility",
      "no"
    );
    expect(mockWithRepeat).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(mockCancelAnimation).toHaveBeenCalledTimes(1);
  });

  it("renders a static block when the system requests reduced motion", () => {
    mockIsReducedMotion = true;

    render(<Skeleton width={120} height={20} />);

    expect(screen.queryByTestId("skeleton-shimmer")).toBeNull();
    expect(mockWithRepeat).not.toHaveBeenCalled();
  });
});
