import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import {
  processColor,
  ScrollView,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  colorScheme,
  registerCSS,
  render as renderWithInterop,
  setupAllComponents,
} from "react-native-css-interop/test";

import {
  getTestInstanceProps,
  getTestInstances,
} from "../../test-utils/test-instance-props";

import { palette } from "@/constants/colors";
import {
  compiledVoiceCss,
  resolvedVoiceStyle,
  resolvedActionLabelStyle,
  expectRecorderActionColorBindings,
  recorderActionRow,
  hasNativeCircularClip,
  expectPaletteHalo,
} from "./voice-r2-native-style-test-helpers";

import { VoiceTransactionEntry } from "@/components/add-transaction/VoiceTransactionEntry";

let mockLanguage: "en" | "ar" = "en";
let mockWidth = 390;
let mockHeight = 844;
let mockFontScale = 1;
let mockBottomInset = 34;
let mockReducedMotion = false;
const mockCancelAnimation = jest.fn();
const mockWithRepeat = jest.fn((animation: unknown): unknown => animation);
const mockWithTiming = jest.fn(
  (value: number, _config?: { readonly duration?: number }): number => value
);
const mockWithDelay = jest.fn(
  (_delay: number, animation: unknown): unknown => animation
);
const mockReduceMotionListeners = new Set<(enabled: boolean) => void>();
const mockReduceMotionRemove = jest.fn();

beforeEach(() => {
  mockReduceMotionListeners.clear();
});
jest.mock("@/services/reduced-motion-service", () => ({
  readReducedMotion: (): Promise<boolean> => Promise.resolve(mockReducedMotion),
  subscribeReducedMotion: (
    callback: (enabled: boolean) => void
  ): (() => void) => {
    mockReduceMotionListeners.add(callback);
    return (): void => {
      mockReduceMotionListeners.delete(callback);
      mockReduceMotionRemove();
    };
  },
}));

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
  useLocale: () => {
    const fonts = jest.requireActual<typeof import("@/constants/typography")>(
      "@/constants/typography"
    );
    return {
      language: mockLanguage,
      isRTL: mockLanguage === "ar",
      fontFamily:
        mockLanguage === "ar" ? fonts.arabicFontFamily : fonts.fontFamily,
    };
  },
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string): string => key,
  }),
}));

interface MockIoniconsRender {
  readonly name: string;
  readonly size?: number;
  readonly color?: string;
  readonly accessible?: boolean;
}

const mockIoniconsRenders: MockIoniconsRender[] = [];

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({
    name,
    size,
    color,
    accessible,
    accessibilityElementsHidden,
    importantForAccessibility,
  }: {
    readonly name: string;
    readonly size?: number;
    readonly color?: string;
    readonly accessible?: boolean;
    readonly accessibilityElementsHidden?: boolean;
    readonly importantForAccessibility?:
      | "auto"
      | "yes"
      | "no"
      | "no-hide-descendants";
  }): React.JSX.Element => {
    mockIoniconsRenders.push({ name, size, color, accessible });
    const { Text } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return (
      <Text
        testID={"ionicon-" + name}
        accessible={accessible}
        accessibilityElementsHidden={accessibilityElementsHidden}
        importantForAccessibility={importantForAccessibility}
      />
    );
  },
}));

const mockGradientRenders: Array<{ readonly colors?: readonly string[] }> = [];

// Native-gradient forwards only style, never className. The owning component
// must therefore reach it through the real cssInterop adapter mapping.
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({
    children,
    style,
    colors,
  }: {
    readonly children: React.ReactNode;
    readonly style?: StyleProp<ViewStyle>;
    readonly colors?: readonly string[];
  }): React.JSX.Element => {
    mockGradientRenders.push({ colors });
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return (
      <View testID="voice-gradient" style={style}>
        {children}
      </View>
    );
  },
}));

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View testID="voice-loading-skeleton" />;
  },
}));

jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>(
    "react-native-reanimated/mock"
  ),
  useReducedMotion: () => mockReducedMotion,
  withRepeat: (...args: readonly unknown[]): unknown => mockWithRepeat(args[0]),
  withTiming: (
    value: number,
    config?: { readonly duration?: number }
  ): number => mockWithTiming(value, config),
  withDelay: (delay: number, animation: unknown): unknown =>
    mockWithDelay(delay, animation),
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
  onDismissExamples: jest.fn(),
};

function renderLayout(
  overrides: Partial<React.ComponentProps<typeof VoiceTransactionEntry>> = {}
): ReturnType<typeof render> {
  return render(<VoiceTransactionEntry {...baseProps} {...overrides} />);
}

describe("VoiceTransactionEntry responsive, animation and unboxed layout", () => {
  beforeEach(() => {
    mockLanguage = "en";
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

  it("centers content at tablet 768×1024 and remains scrollable in landscape", () => {
    mockWidth = 768;
    mockHeight = 1024;
    const view = renderLayout();
    expect(
      getTestInstanceProps(screen.UNSAFE_getByType(ScrollView))
        .contentContainerStyle
    ).toEqual(expect.objectContaining({ paddingHorizontal: 16 }));
    expect(
      getTestInstanceProps(screen.getByTestId("voice-content")).className
    ).toEqual(expect.stringContaining("max-w-[560px]"));

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

  it.each(["idle", "starting", "recording", "paused"] as const)(
    "keeps the clipped 104dp mic with no ordinary static filled halos in %s",
    (state): void => {
      renderLayout({ state });
      const area: unknown = screen.getByTestId("voice-action-surface");
      expect(String(getTestInstanceProps(area).className)).not.toMatch(
        /rounded-2xl border|bg-slate-25/
      );
      const mic: unknown = screen.getByTestId("voice-mic-target", {
        includeHiddenElements: true,
      });
      expect(String(getTestInstanceProps(mic).className)).toContain("104px");
      // A transparent decorative wrapper is allowed; the former solid
      // 140/172px background circles are not.
      for (const id of ["voice-halo-outer", "voice-halo-inner"]) {
        const halo: unknown = screen.queryByTestId(id, { includeHiddenElements: true });
        if (halo !== null) {
          expect(String(getTestInstanceProps(halo).className)).not.toMatch(
            /bg-nileGreen-|bg-slate-/
          );
        }
      }
      expect(
        screen.getByTestId(
          state === "paused" ? "ionicon-pause" : "ionicon-mic",
          { includeHiddenElements: true }
        )
      ).toBeOnTheScreen();
    }
  );

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

  it("recording uses two staggered outward ripples and decorative activity bars", (): void => {
    const view = renderLayout({ state: "recording" });
    for (const id of [
      "voice-recording-ripple-first",
      "voice-recording-ripple-second",
      "voice-recording-activity",
    ]) {
      const decoration: unknown = screen.getByTestId(id, {
        includeHiddenElements: true,
      });
      expect(getTestInstanceProps(decoration).importantForAccessibility).toBe(
        "no-hide-descendants"
      );
      expect(getTestInstanceProps(decoration).pointerEvents).toBe("none");
    }
    expect(mockWithTiming).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ duration: 1400 })
    );
    expect(mockWithTiming).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ duration: 1200 })
    );
    expect(mockWithDelay).toHaveBeenCalledWith(700, expect.anything());
    expect(mockWithRepeat).toHaveBeenCalled();
    jest.clearAllMocks();
    view.rerender(<VoiceTransactionEntry {...baseProps} state="paused" />);
    expect(mockWithRepeat).not.toHaveBeenCalled();
    expect(mockCancelAnimation).toHaveBeenCalled();
    expect(
      screen.getByTestId("voice-recording-activity", {
        includeHiddenElements: true,
      })
    ).toBeTruthy();
  });

  it("parsing animates toward a blank receipt and cancels every loop on unmount", (): void => {
    const view = renderLayout({ state: "processing" });
    const illustration: unknown = screen.getByTestId(
      "voice-parsing-illustration",
      { includeHiddenElements: true }
    );
    expect(getTestInstanceProps(illustration).importantForAccessibility).toBe(
      "no-hide-descendants"
    );
    expect(mockWithTiming).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ duration: 1600 })
    );
    expect(mockWithRepeat).toHaveBeenCalled();
    expect(screen.queryByTestId("voice-loading-skeleton")).toBeNull();
    jest.clearAllMocks();
    view.unmount();
    expect(mockCancelAnimation).toHaveBeenCalled();
  });

  it("hides the parsing illustration from both platform a11y trees and marks the receipt glyph non-accessible", (): void => {
    renderLayout({ state: "processing" });
    const illustration: unknown = screen.getByTestId(
      "voice-parsing-illustration",
      { includeHiddenElements: true }
    );
    const wrapperProps = getTestInstanceProps(illustration);
    expect(wrapperProps.accessible).toBe(false);
    expect(wrapperProps.accessibilityElementsHidden).toBe(true);
    expect(wrapperProps.importantForAccessibility).toBe("no-hide-descendants");
    const receipt: unknown = screen.getByTestId("ionicon-receipt-outline", {
      includeHiddenElements: true,
    });
    expect(getTestInstanceProps(receipt).accessible).toBe(false);
    expect(screen.getByText("voice_ui_parsing_title")).toBeOnTheScreen();
  });

  it.each(["recording", "processing"] as const)(
    "keeps %s decoration static under reduced motion",
    (state): void => {
      mockReducedMotion = true;
      renderLayout({ state });
      expect(mockWithRepeat).not.toHaveBeenCalled();
      expect(
        screen.getByTestId(
          state === "recording"
            ? "voice-recording-activity"
            : "voice-parsing-illustration",
          { includeHiddenElements: true }
        )
      ).toBeTruthy();
    }
  );

  it.each(["recording", "processing"] as const)(
    "reacts to real reduced-motion setting events during %s and removes listeners",
    async (state): Promise<void> => {
      const view = renderLayout({ state });
      await act(async (): Promise<void> => {
        await Promise.resolve();
      });
      expect(mockWithRepeat).toHaveBeenCalled();
      expect(mockReduceMotionListeners.size).toBeGreaterThan(0);
      jest.clearAllMocks();
      act((): void => {
        mockReduceMotionListeners.forEach((listener) => listener(true));
      });
      expect(mockCancelAnimation).toHaveBeenCalled();
      expect(mockWithRepeat).not.toHaveBeenCalled();
      act((): void => {
        mockReduceMotionListeners.forEach((listener) => listener(false));
      });
      expect(mockWithRepeat).toHaveBeenCalled();
      view.unmount();
      expect(mockReduceMotionListeners.size).toBe(0);
      expect(mockReduceMotionRemove).toHaveBeenCalled();
    }
  );

  it("renders disabled daily-limit status unboxed, never as an interactive recording target", () => {
    renderLayout({ state: "daily-limit", remaining: 0, dailyLimit: 5 });
    const surface: unknown = screen.getByTestId("voice-action-surface");
    expect(String(getTestInstanceProps(surface).className)).not.toMatch(
      /rounded-2xl border/
    );
    expect(
      screen.getByTestId("ionicon-mic", { includeHiddenElements: true })
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole("button", { name: "voice_idle_title" })
    ).toBeNull();
  });
});

describe("real Tailwind/CSS Interop Voice native shape", () => {
  it("reflows at font scale 2 while retaining scroll and 48dp recovery targets", () => {
    mockFontScale = 2;
    mockWidth = 390;
    renderWithInterop(
      <VoiceTransactionEntry
        {...baseProps}
        state="unavailable"
        remaining={null}
        dailyLimit={null}
      />
    );
    const scroll: unknown = screen.UNSAFE_getByType(ScrollView);
    const scrollProps = getTestInstanceProps(scroll);
    expect(scrollProps.contentContainerStyle).toEqual(
      expect.objectContaining({ paddingHorizontal: 12 })
    );
    expect(getTestInstances(screen.getAllByRole("button"))).toHaveLength(2);
    for (const control of getTestInstances(screen.getAllByRole("button"))) {
      expect(resolvedVoiceStyle(control).minHeight).toBeGreaterThanOrEqual(48);
    }
  });

  beforeAll(() => setupAllComponents());
  beforeEach(() => {
    mockFontScale = 1;
    mockIoniconsRenders.length = 0;
    mockGradientRenders.length = 0;
    registerCSS(compiledVoiceCss(), {
      grouping: ["^group(/.*)?"],
      ignorePropertyWarningRegex: ["^--tw-"],
    });
  });

  it("gives examples dismissal an actual native 48dp minimum target", (): void => {
    renderWithInterop(<VoiceTransactionEntry {...baseProps} />);
    const style = resolvedVoiceStyle(
      screen.getByTestId("voice-examples-dismiss")
    );
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
  });

  it.each([
    ["starting", "voice-starting-cancel"],
    ["permission-explanation", "voice-permission-primary"],
    ["recording", "voice-action-submit"],
  ] as const)(
    "gives %s action an actual native 48dp minimum height",
    (state, id): void => {
      renderWithInterop(<VoiceTransactionEntry {...baseProps} state={state} />);
      expect(
        resolvedVoiceStyle(screen.getByTestId(id)).minHeight
      ).toBeGreaterThanOrEqual(48);
    }
  );

  it.each(["light", "dark"] as const)(
    "resolves approved allowance mic badge in %s theme",
    (theme): void => {
      colorScheme.set(theme);
      renderWithInterop(<VoiceTransactionEntry {...baseProps} />);
      const badgeStyle = resolvedVoiceStyle(
        screen.getByTestId("voice-allowance-icon-badge", {
          includeHiddenElements: true,
        })
      );
      expect(processColor(badgeStyle.backgroundColor)).toBe(
        processColor(
          theme === "dark" ? palette.slate[700] : palette.nileGreen[100]
        )
      );
      expect(
        mockIoniconsRenders.find((icon) => icon.name === "mic-outline")?.color
      ).toBe(palette.nileGreen[600]);
    }
  );

  it.each(["light", "dark"] as const)(
    "retains colorful English example glyphs in %s theme",
    (theme): void => {
      colorScheme.set(theme);
      renderWithInterop(<VoiceTransactionEntry {...baseProps} />);
      for (const [name, color] of [
        ["restaurant-outline", palette.orange[500]],
        ["car-outline", palette.blue[500]],
        ["cafe-outline", palette.gold[500]],
      ] as const) {
        expect(
          mockIoniconsRenders.find((icon) => icon.name === name)?.color
        ).toBe(color);
      }
    }
  );

  it("keeps Arabic examples quote-only after the colorful English change", (): void => {
    mockLanguage = "ar";
    renderWithInterop(<VoiceTransactionEntry {...baseProps} />);
    expect(
      mockIoniconsRenders.some((icon) =>
        ["restaurant-outline", "car-outline", "cafe-outline"].includes(
          icon.name
        )
      )
    ).toBe(false);
  });

  it.each([
    ["en", "light"],
    ["ar", "light"],
    ["en", "dark"],
    ["ar", "dark"],
  ] as const)(
    "renders a genuine 104dp circular mic in %s %s",
    (language, theme) => {
      mockLanguage = language;
      colorScheme.set(theme);
      renderWithInterop(<VoiceTransactionEntry {...baseProps} />);
      // Requery on every native event. A static pre-press circle must
      // not hide a clipped-to-square regression while the control is held.
      const nativeMaskIsPresent = (): boolean => {
        const gradient: unknown = screen.getByTestId("voice-gradient");
        const style = resolvedVoiceStyle(gradient);
        const roundedGradient =
          style.width === 104 &&
          style.height === 104 &&
          style.borderRadius === 52;
        return roundedGradient || hasNativeCircularClip(gradient);
      };
      expect(
        getTestInstanceProps(screen.getByTestId("voice-mic-target"))
          .accessibilityRole
      ).toBe("button");
      expect(nativeMaskIsPresent()).toBe(true);
      fireEvent(screen.getByTestId("voice-mic-target"), "pressIn");
      expect(nativeMaskIsPresent()).toBe(true);
      fireEvent(screen.getByTestId("voice-mic-target"), "pressOut");
      expect(nativeMaskIsPresent()).toBe(true);
    }
  );

  it("keeps mic pressed feedback as static inline opacity instead of a style callback", () => {
    renderWithInterop(<VoiceTransactionEntry {...baseProps} />);
    const mic = (): unknown => screen.getByTestId("voice-mic-target");

    expect(typeof getTestInstanceProps(mic()).style).not.toBe("function");
    expect(resolvedVoiceStyle(mic())).toEqual(
      expect.objectContaining({ opacity: 1 })
    );

    fireEvent(mic(), "pressIn");
    expect(resolvedVoiceStyle(mic())).toEqual(
      expect.objectContaining({ opacity: 0.88 })
    );

    fireEvent(mic(), "pressOut");
    expect(resolvedVoiceStyle(mic())).toEqual(
      expect.objectContaining({ opacity: 1 })
    );
  });

  it("fills the native 104dp circular mic mask through the real gradient interop adapter", () => {
    renderWithInterop(<VoiceTransactionEntry {...baseProps} />);
    const gradient: unknown = screen.getByTestId("voice-gradient");
    const style = resolvedVoiceStyle(gradient);

    // flex-1/items-center/justify-center must arrive as native style through
    // the adapter, because the gradient mock never forwards className.
    expect(style).toEqual(
      expect.objectContaining({
        flexGrow: 1,
        flexShrink: 1,
        alignItems: "center",
        justifyContent: "center",
      })
    );
    expect(hasNativeCircularClip(gradient)).toBe(true);
    expect(mockGradientRenders.at(-1)?.colors).toEqual([
      palette.nileGreen[500],
      palette.nileGreen[600],
    ]);
    const icon: unknown = screen.getByTestId("ionicon-mic", {
      includeHiddenElements: true,
    });
    expect(icon).toBeTruthy();
    expect(mockIoniconsRenders.find((r) => r.name === "mic")).toEqual({
      name: "mic",
      size: 42,
      color: palette.slate[25],
    });
  });

  it.each([
    ["en", "light", "idle"],
    ["ar", "light", "idle"],
    ["en", "dark", "idle"],
    ["ar", "dark", "idle"],
    ["en", "light", "starting"],
    ["ar", "dark", "starting"],
    ["en", "light", "recording"],
    ["ar", "dark", "recording"],
    ["en", "light", "paused"],
    ["ar", "dark", "paused"],
  ] as const)(
    "R2 %s %s %s has no resolved opaque ordinary mic halo",
    (language, theme, state): void => {
      mockLanguage = language;
      colorScheme.set(theme);
      renderWithInterop(<VoiceTransactionEntry {...baseProps} state={state} />);
      for (const id of ["voice-halo-outer", "voice-halo-inner"]) {
        const halo: unknown = screen.queryByTestId(id, { includeHiddenElements: true });
        if (halo === null) continue;
        const native = resolvedVoiceStyle(halo);
        const background = native.backgroundColor;
        if (background !== undefined) {
          const rgba = processColor(background);
          expect(rgba).toBe(processColor("transparent"));
        }
      }
      // The native-clipped mic is intentionally hidden from the a11y tree
      // while Starting/recording/paused. Inspect the rendered decoration.
      expect(
        screen.getByTestId("voice-gradient", {
          includeHiddenElements: true,
        })
      ).toBeOnTheScreen();
    }
  );

  it.each(["daily-limit", "unavailable"] as const)(
    "preserves original disabled mic 140/172 gray artwork for %s",
    (state): void => {
      colorScheme.set("dark");
      renderWithInterop(
        <VoiceTransactionEntry
          {...baseProps}
          state={state}
          remaining={state === "daily-limit" ? 0 : null}
          dailyLimit={state === "daily-limit" ? 5 : null}
        />
      );
      for (const [name, size, radius] of [
        ["outer", 172, 86],
        ["inner", 140, 70],
      ] as const) {
        const halo: unknown = screen.getByTestId("voice-halo-" + name, {
          includeHiddenElements: true,
        });
        expect(resolvedVoiceStyle(halo)).toEqual(
          expect.objectContaining({
            width: size,
            height: size,
            borderRadius: radius,
            position: "absolute",
          })
        );
        const alpha = expectPaletteHalo(
          resolvedVoiceStyle(halo).backgroundColor,
          palette.slate[700]
        );
        expect(alpha).toBeGreaterThanOrEqual(0.15);
        expect(alpha).toBeLessThan(0.45);
      }
      const target: unknown = screen.getByTestId("voice-mic-target", {
        includeHiddenElements: true,
      });
      expect(getTestInstanceProps(target).accessible).toBe(false);
      expect(processColor(resolvedVoiceStyle(target).backgroundColor)).toBe(
        processColor(palette.slate[700])
      );
    }
  );

  it.each(["recording", "paused", "completed"] as const)(
    "resolves approved R2 green/gray/red 20dp actions in real native styles (%s)",
    (state): void => {
      mockWidth = 390;
      mockFontScale = 1;
      mockLanguage = "en";
      colorScheme.set("light");
      renderWithInterop(<VoiceTransactionEntry {...baseProps} state={state} durationMs={30_000} />);
      const submit: unknown = screen.getByTestId("voice-action-submit");
      const center: unknown = screen.getByTestId(
        state === "paused" ? "voice-action-resume" : "voice-action-pause"
      );
      const discard: unknown = screen.getByTestId("voice-action-discard");
      for (const action of [submit, center, discard]) {
        const style = resolvedVoiceStyle(action);
        expect(style.minHeight).toBeGreaterThanOrEqual(48);
        expect(style.borderWidth).toBeGreaterThanOrEqual(1);
      }

      for (const action of [submit, center, discard]) {
        const label = resolvedActionLabelStyle(action);
        expect(label.fontSize).toBe(14);
        expect(label.lineHeight).toBe(22);
        expect(label.fontWeight).toBe("600");
      }
      expectRecorderActionColorBindings(submit, center, discard);
      expect(getTestInstanceProps(center).accessibilityState).toEqual(
        expect.objectContaining({ disabled: state === "completed" })
      );
      expect(
        mockIoniconsRenders.find((icon) => icon.name === "send")
      ).toEqual({
        name: "send",
        size: 20,
        color: palette.slate[25],
        accessible: undefined,
      });
      expect(
        mockIoniconsRenders.find((icon) =>
          icon.name === (state === "paused" ? "play" : "pause")
        )?.size
      ).toBe(20);
      expect(mockIoniconsRenders.find((icon) => icon.name === "close")?.size).toBe(20);
      const row = recorderActionRow(submit, center, discard);
      expect(resolvedVoiceStyle(row).flexDirection).toBe("row");
      expect(resolvedVoiceStyle(row).direction).toBe("ltr");
    }
  );

  it.each([320, 390] as const)(
    "keeps responsive R2 controls accessible without font shrinking at %sdp",
    (width): void => {
      mockWidth = width;
      mockHeight = width === 320 ? 640 : 844;
      mockFontScale = 2;
      mockBottomInset = width === 320 ? 22 : 34;
      renderWithInterop(<VoiceTransactionEntry {...baseProps} state="completed" durationMs={30_000} />);
      const scroll: unknown = screen.UNSAFE_getByType(ScrollView);
      expect(resolvedVoiceStyle(screen.getByTestId("voice-action-surface")).minHeight)
        .toBeGreaterThanOrEqual(260);
      expect(getTestInstanceProps(scroll).contentContainerStyle).toEqual(
        expect.objectContaining({
          paddingBottom: mockBottomInset + 24,
          paddingHorizontal: 12,
        })
      );
      for (const id of ["voice-action-submit", "voice-action-pause", "voice-action-discard"]) {
        const control: unknown = screen.getByTestId(id);
        expect(resolvedVoiceStyle(control).minHeight).toBeGreaterThanOrEqual(48);
        expect(resolvedActionLabelStyle(control).fontSize).toBe(14);
      }
      expect(screen.getByText("00:30 / 00:30")).toBeOnTheScreen();
    }
  );

  it.each([
    ["en", "light"],
    ["ar", "light"],
    ["en", "dark"],
    ["ar", "dark"],
  ] as const)(
    "resolves two thin outward recording rings through native styles in %s %s",
    (language, theme) => {
      mockLanguage = language;
      mockReducedMotion = false;
      colorScheme.set(theme);
      renderWithInterop(
        <VoiceTransactionEntry {...baseProps} state="recording" />
      );
      expect(mockWithRepeat).toHaveBeenCalled();
      for (const id of [
        "voice-recording-ripple-first",
        "voice-recording-ripple-second",
      ]) {
        const ring: unknown = screen.getByTestId(id, {
          includeHiddenElements: true,
        });
        const style = resolvedVoiceStyle(ring);
        expect(style).toEqual(
          expect.objectContaining({
            width: 104,
            height: 104,
            borderRadius: 52,
            borderWidth: 1,
          })
        );
        expect(processColor(style.borderColor)).toBe(
          processColor(palette.nileGreen[500])
        );
        expect(getTestInstanceProps(ring).pointerEvents).toBe("none");
        expect(getTestInstanceProps(ring).importantForAccessibility).toBe(
          "no-hide-descendants"
        );
      }
    }
  );
});
