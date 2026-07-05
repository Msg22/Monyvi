import { palette } from "@/constants/colors";
import { fireEvent, render, screen, act } from "@testing-library/react-native";
import React from "react";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ToastProvider, useToast } from "@/components/ui/Toast";

type BuilderDuration = (durationMs: number) => ReanimatedBuilderMock;
type BuilderEasing = (easing: unknown) => ReanimatedBuilderMock;
type BuilderInitialValues = (values: unknown) => ReanimatedBuilderMock;
type WithTimingMock = (value: number, config: unknown) => object;

interface ReanimatedBuilderMock {
  readonly duration: jest.MockedFunction<BuilderDuration>;
  readonly easing: jest.MockedFunction<BuilderEasing>;
  readonly withInitialValues: jest.MockedFunction<BuilderInitialValues>;
}

interface ReanimatedToastMock {
  readonly FadeOut: ReanimatedBuilderMock;
  readonly SlideInUp: {
    readonly springify: jest.MockedFunction<
      () => { readonly damping: jest.MockedFunction<(value: number) => object> }
    >;
  };
  readonly SlideOutUp: {
    readonly springify: jest.MockedFunction<
      () => { readonly damping: jest.MockedFunction<(value: number) => object> }
    >;
  };
  readonly withTiming: jest.MockedFunction<WithTimingMock>;
}

interface ToastAnimationResult {
  readonly animations: {
    readonly opacity: unknown;
    readonly transform: readonly unknown[];
  };
  readonly initialValues: {
    readonly opacity: number;
    readonly transform: readonly unknown[];
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __toastReanimatedMock: ReanimatedToastMock | undefined;
}

const mockUseTheme = jest.fn(() => ({ isDark: false }));

jest.mock("@expo/vector-icons", () => {
  const ReactNative =
    jest.requireActual<typeof import("react-native")>("react-native");
  const ReactActual = jest.requireActual<typeof import("react")>("react");

  return {
    Ionicons: (props: Record<string, unknown>): React.JSX.Element =>
      ReactActual.createElement(ReactNative.View, props),
  };
});

jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => mockUseTheme(),
}));

jest.mock("react-native-reanimated", () => {
  const ReactNative =
    jest.requireActual<typeof import("react-native")>("react-native");

  function createBuilder(): ReanimatedBuilderMock {
    const builder: ReanimatedBuilderMock = {
      duration: jest.fn(
        (_durationMs: number): ReanimatedBuilderMock => builder
      ),
      easing: jest.fn((_easing: unknown): ReanimatedBuilderMock => builder),
      withInitialValues: jest.fn(
        (_values: unknown): ReanimatedBuilderMock => builder
      ),
    };
    return builder;
  }

  function createSpringBuilder(): {
    readonly damping: jest.MockedFunction<(value: number) => object>;
  } {
    return { damping: jest.fn((_value: number): object => ({})) };
  }

  const mock: ReanimatedToastMock = {
    FadeOut: createBuilder(),
    SlideInUp: { springify: jest.fn(createSpringBuilder) },
    SlideOutUp: { springify: jest.fn(createSpringBuilder) },
    withTiming: jest.fn((value: number, config: unknown): object => ({
      config,
      value,
    })),
  };

  global.__toastReanimatedMock = mock;

  return {
    __esModule: true,
    default: { View: ReactNative.View },
    Easing: {
      cubic: jest.fn(),
      in: jest.fn((easing: unknown) => easing),
      out: jest.fn((easing: unknown) => easing),
    },
    FadeOut: mock.FadeOut,
    SlideInUp: mock.SlideInUp,
    SlideOutUp: mock.SlideOutUp,
    withTiming: mock.withTiming,
  };
});

function getReanimatedMock(): ReanimatedToastMock {
  if (!global.__toastReanimatedMock) {
    throw new Error("Missing Reanimated toast mock");
  }
  return global.__toastReanimatedMock;
}

function ToastHarness(): React.JSX.Element {
  const { showToast } = useToast();

  return (
    <>
      <Pressable
        testID="show-success-toast"
        onPress={() =>
          showToast({
            type: "success",
            title: "Transaction saved",
            message: "Your balance is updated",
            duration: 1000,
          })
        }
      >
        <Text>Show success</Text>
      </Pressable>
      <Pressable
        testID="show-error-toast"
        onPress={() =>
          showToast({
            type: "error",
            title: "Save failed",
            duration: 1000,
          })
        }
      >
        <Text>Show error</Text>
      </Pressable>
    </>
  );
}

function renderToastHarness(): void {
  const initialMetrics: Metrics = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 44, right: 0, bottom: 34, left: 0 },
  };

  render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    </SafeAreaProvider>
  );
}

interface ToastTestInstance {
  readonly props?: unknown;
}

function getFlattenedViewStyle(instance: unknown): ViewStyle {
  const props = getReactTestInstanceProps(instance);
  return StyleSheet.flatten(props.style as StyleProp<ViewStyle>) ?? {};
}

function getReactTestInstanceProps(instance: unknown): Record<string, unknown> {
  const instanceWithProps = instance as ToastTestInstance;
  return instanceWithProps.props &&
    typeof instanceWithProps.props === "object" &&
    !Array.isArray(instanceWithProps.props)
    ? (instanceWithProps.props as Record<string, unknown>)
    : {};
}

describe("ToastProvider", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUseTheme.mockReturnValue({ isDark: false });
    const reanimated = getReanimatedMock();
    reanimated.FadeOut.duration.mockClear();
    reanimated.FadeOut.easing.mockClear();
    reanimated.FadeOut.withInitialValues.mockClear();
    reanimated.SlideInUp.springify.mockClear();
    reanimated.SlideOutUp.springify.mockClear();
    reanimated.withTiming.mockClear();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it("uses calm timed fade and top-drop motion instead of spring slide motion", () => {
    renderToastHarness();

    fireEvent.press(screen.getByTestId("show-success-toast"));

    expect(screen.getByText("Transaction saved")).toBeTruthy();

    const reanimated = getReanimatedMock();
    expect(reanimated.SlideInUp.springify).not.toHaveBeenCalled();
    expect(reanimated.SlideOutUp.springify).not.toHaveBeenCalled();
    const props = getReactTestInstanceProps(
      screen.getByTestId("toast-container")
    );
    const entering = props.entering as () => ToastAnimationResult;
    const animation = entering();

    expect(animation.initialValues).toEqual({
      opacity: 0,
      transform: [{ translateY: -10 }, { scale: 0.98 }],
    });
    expect(animation.animations.transform).toHaveLength(2);
    expect(reanimated.withTiming).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ duration: 180 })
    );
    expect(reanimated.withTiming).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ duration: 180 })
    );
    expect(reanimated.FadeOut.duration).toHaveBeenCalledWith(140);
  });

  it("positions the toast at the traditional top app feedback position", () => {
    renderToastHarness();

    fireEvent.press(screen.getByTestId("show-success-toast"));

    const toastContainerStyle = getFlattenedViewStyle(
      screen.getByTestId("toast-container")
    );

    expect(toastContainerStyle.top).toBe(56);
    expect(toastContainerStyle.bottom).toBeUndefined();
  });

  it("uses bottom keyboard placement when a keyboard is already visible", () => {
    const keyboardMetricsSpy = jest.spyOn(Keyboard, "metrics").mockReturnValue({
      height: 280,
      screenX: 0,
      screenY: 564,
      width: 390,
    });

    renderToastHarness();

    fireEvent.press(screen.getByTestId("show-success-toast"));

    const toastContainerStyle = getFlattenedViewStyle(
      screen.getByTestId("toast-container")
    );

    expect(toastContainerStyle.bottom).toBe(296);
    keyboardMetricsSpy.mockRestore();
  });

  it("moves the toast above the keyboard when text input is focused", () => {
    const keyboardListeners = new Map<
      string,
      (event: { readonly endCoordinates: { readonly height: number } }) => void
    >();
    const keyboardSpy = jest
      .spyOn(Keyboard, "addListener")
      .mockImplementation((eventName, listener) => {
        keyboardListeners.set(
          eventName,
          listener as (event: {
            readonly endCoordinates: { readonly height: number };
          }) => void
        );
        return {
          remove: jest.fn(),
        } as unknown as ReturnType<typeof Keyboard.addListener>;
      });

    renderToastHarness();

    fireEvent.press(screen.getByTestId("show-success-toast"));
    act(() => {
      keyboardListeners.get("keyboardDidShow")?.({
        endCoordinates: { height: 320 },
      });
    });

    const toastContainerStyle = getFlattenedViewStyle(
      screen.getByTestId("toast-container")
    );

    expect(toastContainerStyle.bottom).toBe(336);
    keyboardSpy.mockRestore();
  });

  it("uses a premium light success treatment", () => {
    mockUseTheme.mockReturnValue({ isDark: false });
    renderToastHarness();

    fireEvent.press(screen.getByTestId("show-success-toast"));

    const toastSurfaceStyle = getFlattenedViewStyle(
      screen.getByTestId("toast-surface")
    );
    const toastAccentStyle = getFlattenedViewStyle(
      screen.getByTestId("toast-accent")
    );
    const iconShellStyle = getFlattenedViewStyle(
      screen.getByTestId("toast-icon-shell")
    );

    expect(toastSurfaceStyle.backgroundColor).toBe(`${palette.slate[25]}F2`);
    expect(toastSurfaceStyle.borderColor).toBe(`${palette.nileGreen[500]}66`);
    expect(toastAccentStyle.backgroundColor).toBe(palette.nileGreen[500]);
    expect(iconShellStyle.backgroundColor).toBe(palette.nileGreen[50]);
    expect(iconShellStyle.borderColor).toBe(palette.nileGreen[100]);
    expect(
      getReactTestInstanceProps(screen.getByTestId("toast-icon-shell"))
        .className
    ).toContain("h-10 w-10");
    expect(
      getReactTestInstanceProps(screen.getByTestId("toast-icon-shell"))
        .className
    ).toContain("ms-1");
    expect(
      getReactTestInstanceProps(screen.getByTestId("toast-icon")).name
    ).toBe("checkmark");
  });

  it("replaces an active toast without stacking or hiding the new toast early", () => {
    renderToastHarness();

    fireEvent.press(screen.getByTestId("show-success-toast"));
    expect(screen.getByText("Transaction saved")).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(700);
    });

    fireEvent.press(screen.getByTestId("show-error-toast"));

    expect(screen.queryByText("Transaction saved")).toBeNull();
    expect(screen.getByText("Save failed")).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(999);
    });

    expect(screen.getByText("Save failed")).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.queryByText("Save failed")).toBeNull();
  });
});
