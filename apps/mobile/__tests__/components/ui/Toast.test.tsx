import { fireEvent, render, screen, act } from "@testing-library/react-native";
import React from "react";
import { Pressable, Text } from "react-native";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ToastProvider, useToast } from "@/components/ui/Toast";

type BuilderDuration = (durationMs: number) => ReanimatedBuilderMock;
type BuilderEasing = (easing: unknown) => ReanimatedBuilderMock;
type BuilderInitialValues = (values: unknown) => ReanimatedBuilderMock;

interface ReanimatedBuilderMock {
  readonly duration: jest.MockedFunction<BuilderDuration>;
  readonly easing: jest.MockedFunction<BuilderEasing>;
  readonly withInitialValues: jest.MockedFunction<BuilderInitialValues>;
}

interface ReanimatedToastMock {
  readonly FadeIn: ReanimatedBuilderMock;
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
}

declare global {
  // eslint-disable-next-line no-var
  var __toastReanimatedMock: ReanimatedToastMock | undefined;
}

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
    FadeIn: createBuilder(),
    FadeOut: createBuilder(),
    SlideInUp: { springify: jest.fn(createSpringBuilder) },
    SlideOutUp: { springify: jest.fn(createSpringBuilder) },
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
    FadeIn: mock.FadeIn,
    FadeOut: mock.FadeOut,
    SlideInUp: mock.SlideInUp,
    SlideOutUp: mock.SlideOutUp,
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

describe("ToastProvider", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    const reanimated = getReanimatedMock();
    reanimated.FadeIn.duration.mockClear();
    reanimated.FadeIn.easing.mockClear();
    reanimated.FadeIn.withInitialValues.mockClear();
    reanimated.FadeOut.duration.mockClear();
    reanimated.FadeOut.easing.mockClear();
    reanimated.FadeOut.withInitialValues.mockClear();
    reanimated.SlideInUp.springify.mockClear();
    reanimated.SlideOutUp.springify.mockClear();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it("uses calm timed fade motion instead of spring slide motion", () => {
    renderToastHarness();

    fireEvent.press(screen.getByTestId("show-success-toast"));

    expect(screen.getByText("Transaction saved")).toBeTruthy();

    const reanimated = getReanimatedMock();
    expect(reanimated.SlideInUp.springify).not.toHaveBeenCalled();
    expect(reanimated.SlideOutUp.springify).not.toHaveBeenCalled();
    expect(reanimated.FadeIn.duration).toHaveBeenCalledWith(180);
    expect(reanimated.FadeIn.withInitialValues).toHaveBeenCalledWith({
      opacity: 0,
      transform: [{ translateY: -8 }],
    });
    expect(reanimated.FadeOut.duration).toHaveBeenCalledWith(140);
  });

  it("replaces an active toast without stacking or hiding the new toast early", () => {
    renderToastHarness();

    fireEvent.press(screen.getByTestId("show-success-toast"));
    expect(screen.getByText("Transaction saved")).toBeTruthy();

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
