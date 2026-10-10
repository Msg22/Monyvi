import { render, screen } from "@testing-library/react-native";
import React from "react";

import {
  getTestInstanceProps,
  getTestInstances,
} from "../../test-utils/test-instance-props";
import { ScrollView } from "react-native";

import { VoiceTransactionEntry } from "@/components/add-transaction/VoiceTransactionEntry";

let mockWidth = 390;
let mockHeight = 844;
let mockFontScale = 1;
let mockBottomInset = 34;
let mockReducedMotion = false;
const mockCancelAnimation = jest.fn();
const mockWithRepeat = jest.fn((animation: unknown): unknown => animation);

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({
    width: mockWidth,
    height: mockHeight,
    scale: 1,
    fontScale: mockFontScale,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({
    top: 24,
    bottom: mockBottomInset,
    left: 0,
    right: 0,
  }),
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => ({
    language: "en",
    isRTL: false,
    fontFamily: jest.requireActual<
      typeof import("@/constants/typography")
    >("@/constants/typography").fontFamily,
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { readonly name: string }): React.JSX.Element => {
    const { View } = jest.requireActual<typeof import("react-native")>(
      "react-native"
    );
    return <View testID={"ionicon-" + name} />;
  },
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({
    children,
  }: {
    readonly children: React.ReactNode;
  }): React.JSX.Element => {
    const { View } = jest.requireActual<typeof import("react-native")>(
      "react-native"
    );
    return <View testID="voice-gradient">{children}</View>;
  },
}));

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): React.JSX.Element => {
    const { View } = jest.requireActual<typeof import("react-native")>(
      "react-native"
    );
    return <View testID="voice-loading-skeleton" />;
  },
}));

jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock"),
  useReducedMotion: () => mockReducedMotion,
  withRepeat: (...args: readonly unknown[]): unknown => mockWithRepeat(args[0]),
  cancelAnimation: (...args: readonly unknown[]): void => {
    mockCancelAnimation(...args);
  },
}));

const baseProps: React.ComponentProps<typeof VoiceTransactionEntry> = {
  state: "idle",
  remaining: 3,
  dailyLimit: 5,
  durationMs: 0,
  errorMessage: null,
  onStart: jest.fn(),
  onPause: jest.fn(),
  onResume: jest.fn(),
  onSubmit: jest.fn(),
  onDiscard: jest.fn(),
  onTryAgain: jest.fn(),
  onUseManual: jest.fn(),
  onRefreshAvailability: jest.fn(),
  onOpenSettings: jest.fn(),
  onPermissionContinue: jest.fn(),
  onPermissionCancel: jest.fn(),
};

function renderLayout(
  overrides: Partial<React.ComponentProps<typeof VoiceTransactionEntry>> = {}
): ReturnType<typeof render> {
  return render(<VoiceTransactionEntry {...baseProps} {...overrides} />);
}

describe("VoiceTransactionEntry responsive, animation and unboxed layout", () => {
  beforeEach(() => {
    mockWidth = 390;
    mockHeight = 844;
    mockFontScale = 1;
    mockBottomInset = 34;
    mockReducedMotion = false;
    jest.clearAllMocks();
  });

  it("uses one actual bottom safe inset plus content gutter at 390×844", () => {
    renderLayout();
    const scroll: unknown = screen.UNSAFE_getByType(ScrollView);
    const scrollProps = getTestInstanceProps(scroll);
    expect(scrollProps.contentContainerStyle).toEqual(
      expect.objectContaining({ paddingHorizontal: 16, paddingBottom: 58 })
    );
    expect(scrollProps.showsVerticalScrollIndicator).toBe(false);
  });

  it("scrolls compact 320×640 without shrinking text, and keeps content above the inset", () => {
    mockWidth = 320;
    mockHeight = 640;
    mockBottomInset = 22;
    renderLayout();
    const scroll: unknown = screen.UNSAFE_getByType(ScrollView);
    const scrollProps = getTestInstanceProps(scroll);
    expect(scrollProps.contentContainerStyle).toEqual(
      expect.objectContaining({ paddingHorizontal: 12, paddingBottom: 46 })
    );
    expect(scrollProps.className).toContain("flex-1");
  });

  it("reflows at font scale 2 while retaining scroll and 48dp recovery targets", () => {
    mockFontScale = 2;
    mockWidth = 390;
    renderLayout({ state: "unavailable", remaining: null, dailyLimit: null });
    const scroll: unknown = screen.UNSAFE_getByType(ScrollView);
    const scrollProps = getTestInstanceProps(scroll);
    expect(scrollProps.contentContainerStyle).toEqual(
      expect.objectContaining({ paddingHorizontal: 12 })
    );
    expect(getTestInstances(screen.getAllByRole("button"))).toHaveLength(2);
    for (const control of getTestInstances(screen.getAllByRole("button"))) {
      const props = getTestInstanceProps(control);
      const shape = String(props.className ?? "") +
        JSON.stringify(props.style ?? {});
      expect(shape).toMatch(/min-h-12|minHeight[^0-9]*48/);
    }
  });

  it("centers content at tablet 768×1024 and remains scrollable in landscape", () => {
    mockWidth = 768;
    mockHeight = 1024;
    const view = renderLayout();
    expect(
      getTestInstanceProps(screen.UNSAFE_getByType(ScrollView))
        .contentContainerStyle
    ).toEqual(expect.objectContaining({ paddingHorizontal: 16 }));
    expect(getTestInstanceProps(screen.getByTestId("voice-content")).className)
      .toEqual(expect.stringContaining("max-w-[560px]"));

    mockWidth = 844;
    mockHeight = 390;
    view.rerender(<VoiceTransactionEntry {...baseProps} />);
    const landscapeScroll: unknown = screen.UNSAFE_getByType(ScrollView);
    const landscapeProps = getTestInstanceProps(landscapeScroll);
    expect(landscapeProps.contentContainerStyle).toEqual(
      expect.objectContaining({ paddingHorizontal: 16 })
    );
    expect(landscapeProps.showsVerticalScrollIndicator).toBe(false);
    expect(screen.getByTestId("voice-content")).toBeOnTheScreen();
  });

  it("keeps the 104dp mic and decorative 140/172dp halos in an unboxed Voice surface", () => {
    renderLayout();
    const area: unknown = screen.getByTestId("voice-action-surface");
    expect(String(getTestInstanceProps(area).className)).not.toMatch(
      /rounded-2xl border|bg-slate-25/
    );
    const mic: unknown = screen.getByTestId("voice-mic-target");
    expect(String(getTestInstanceProps(mic).className)).toContain("104px");
    const outer: unknown = screen.getByTestId("voice-halo-outer", {
      includeHiddenElements: true,
    });
    const inner: unknown = screen.getByTestId("voice-halo-inner", {
      includeHiddenElements: true,
    });
    expect(String(getTestInstanceProps(outer).className)).toContain("172px");
    expect(String(getTestInstanceProps(inner).className)).toContain("140px");
    expect(getTestInstanceProps(outer).pointerEvents).toBe("none");
    expect(getTestInstanceProps(inner).pointerEvents).toBe("none");
    expect(screen.getByTestId("ionicon-mic", { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it("suppresses pulse when reduced motion is enabled and tears down on unmount", () => {
    mockReducedMotion = true;
    const reduced = renderLayout({ state: "recording" });
    expect(mockWithRepeat).not.toHaveBeenCalled();
    reduced.unmount();
    expect(mockCancelAnimation).toHaveBeenCalled();

    jest.clearAllMocks();
    mockReducedMotion = false;
    const animated = renderLayout({ state: "recording" });
    expect(mockWithRepeat).toHaveBeenCalled();
    animated.unmount();
    expect(mockCancelAnimation).toHaveBeenCalled();
  });

  it("renders disabled daily-limit status unboxed, never as an interactive recording target", () => {
    renderLayout({ state: "daily-limit", remaining: 0, dailyLimit: 5 });
    const surface: unknown = screen.getByTestId("voice-action-surface");
    expect(String(getTestInstanceProps(surface).className)).not.toMatch(
      /rounded-2xl border/
    );
    expect(screen.getByTestId("ionicon-mic", { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "voice_idle_title" })).toBeNull();
  });
});
