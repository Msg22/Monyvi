import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { render, screen } from "@testing-library/react-native";
import React from "react";
import { processColor, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import {
  colorScheme, registerCSS, render as renderWithInterop, setupAllComponents,
} from "react-native-css-interop/test";

import {
  getTestInstanceParent,
  getTestInstanceProps,
  getTestInstances,
} from "../../test-utils/test-instance-props";
import { ScrollView } from "react-native";

import { palette } from "@/constants/colors";

import { VoiceTransactionEntry } from "@/components/add-transaction/VoiceTransactionEntry";

let mockLanguage: "en" | "ar" = "en";
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
  useLocale: () => {
    const fonts = jest.requireActual<typeof import("@/constants/typography")>(
      "@/constants/typography"
    );
    return {
      language: mockLanguage,
      isRTL: mockLanguage === "ar",
      fontFamily: mockLanguage === "ar" ? fonts.arabicFontFamily : fonts.fontFamily,
    };
  },
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { readonly name: string }): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View testID={"ionicon-" + name} />;
  },
}));

// Native-gradient double forwards only style, never className. A class-only
// gradient must not appear circular merely because the Jest mock supports CSS.
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({
    children,
    style,
  }: {
    readonly children: React.ReactNode;
    readonly style?: StyleProp<ViewStyle>;
  }): React.JSX.Element => {
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
      const className =
        typeof props.className === "string" ? props.className : "";
      const shape = className + JSON.stringify(props.style ?? {});
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
    expect(
      screen.getByTestId("ionicon-mic", { includeHiddenElements: true })
    ).toBeOnTheScreen();
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
    expect(
      screen.getByTestId("ionicon-mic", { includeHiddenElements: true })
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole("button", { name: "voice_idle_title" })
    ).toBeNull();
  });
});

const MOBILE_ROOT = path.resolve(__dirname, "../../..");
const REPOSITORY_ROOT = path.resolve(MOBILE_ROOT, "../..");
const TAILWIND_CLI = require.resolve("tailwindcss/lib/cli/index.js", {
  paths: [MOBILE_ROOT, REPOSITORY_ROOT],
});
let cachedVoiceCss: string | null = null;

function compiledVoiceCss(): string {
  if (cachedVoiceCss !== null) return cachedVoiceCss;
  const directory = mkdtempSync(path.join(os.tmpdir(), "monyvi-voice-css-"));
  try {
    const input = path.join(directory, "input.css");
    const fixture = path.join(directory, "fixture.html");
    const output = path.join(directory, "output.css");
    const classes = [
      "absolute", "h-[172px]", "w-[172px]", "rounded-[86px]",
      "h-[140px]", "w-[140px]", "rounded-[70px]",
      "h-[104px]", "w-[104px]", "rounded-[52px]",
      "overflow-hidden", "items-center", "justify-center",
      "bg-nileGreen-50/60", "dark:bg-nileGreen-900/50",
      "bg-nileGreen-100/50", "dark:bg-nileGreen-900/60",
      "bg-slate-200/20", "dark:bg-slate-700/25",
      "dark:bg-slate-700/30",
    ];
    writeFileSync(input, "@tailwind base;\n@tailwind utilities;\n", "utf8");
    writeFileSync(
      fixture, '<div class="' + classes.join(" ") + '"></div>\n', "utf8"
    );
    execFileSync(
      process.execPath,
      [TAILWIND_CLI, "-c", path.join(MOBILE_ROOT, "tailwind.config.js"),
        "-i", input, "-o", output, "--content", fixture],
      { cwd: REPOSITORY_ROOT, stdio: "pipe", env: { ...process.env, NATIVEWIND_OS: "android" } }
    );
    cachedVoiceCss = readFileSync(output, "utf8");
    return cachedVoiceCss;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** NativeWind CSS must be actually registered and translated, not string-matched. */
function resolvedVoiceStyle(node: unknown, pressed = false): ViewStyle {
  const raw: unknown = getTestInstanceProps(node).style;
  const evaluated: unknown =
    typeof raw === "function" ? raw({ pressed }) : raw;
  if (
    evaluated !== undefined &&
    evaluated !== null &&
    typeof evaluated !== "object"
  ) {
    throw new Error("Expected a native style object or array");
  }
  return StyleSheet.flatten(evaluated as StyleProp<ViewStyle>) ?? {};
}

function hasNativeCircularClip(gradient: unknown, pressed: boolean): boolean {
  let current: unknown = getTestInstanceParent(gradient);
  for (let i = 0; i < 12 && current !== null; i++) {
    if (typeof current !== "object") break;
    const style = resolvedVoiceStyle(current, pressed);
    if (style.overflow === "hidden" && style.width === 104 &&
        style.height === 104 && style.borderRadius === 52) {
      return true;
    }
    current = getTestInstanceParent(current);
  }
  return false;
}

function expectPaletteHalo(actual: unknown, paletteColor: string): void {
  if (typeof actual !== "string") {
    throw new Error("Expected native resolved halo color");
  }
  const native = processColor(actual);
  const expected = processColor(paletteColor);
  if (typeof native !== "number" || typeof expected !== "number") {
    throw new Error("Expected valid React Native color values");
  }
  expect(native & 0xffffff).toBe(expected & 0xffffff);
  const alpha = (native >>> 24) & 0xff;
  expect(alpha).toBeGreaterThan(0);
  expect(alpha).toBeLessThan(255);
}

describe("real Tailwind/CSS Interop Voice native shape", () => {
  beforeAll(() => setupAllComponents());
  beforeEach(() => registerCSS(compiledVoiceCss(), {
    grouping: ["^group(/.*)?"],
    ignorePropertyWarningRegex: ["^--tw-"],
  }));

  it.each([
    ["en", "light"], ["ar", "light"],
    ["en", "dark"], ["ar", "dark"],
  ] as const)(
    "renders a genuine 104dp circular mic in %s %s",
    (language, theme) => {
      mockLanguage = language;
      colorScheme.set(theme);
      renderWithInterop(<VoiceTransactionEntry {...baseProps} />);
      const gradient: unknown = screen.getByTestId("voice-gradient");
      const style = resolvedVoiceStyle(gradient);
      const roundedGradient =
        style.width === 104 && style.height === 104 &&
        style.borderRadius === 52;
      // Either converted Expo gradient styles or an actual clipped
      // ancestor (BudgetPrimaryAction pattern) prevents square gradients.
      expect(
        roundedGradient ||
        (hasNativeCircularClip(gradient, false) &&
         hasNativeCircularClip(gradient, true))
      ).toBe(true);
      expect(getTestInstanceProps(
        screen.getByTestId("voice-mic-target")
      ).accessibilityRole).toBe("button");
    }
  );

  it.each([
    ["en", "light", "idle"], ["ar", "light", "idle"],
    ["en", "dark", "idle"], ["ar", "dark", "idle"],
    ["en", "light", "daily-limit"], ["ar", "light", "daily-limit"],
    ["en", "dark", "daily-limit"], ["ar", "dark", "daily-limit"],
  ] as const)(
    "resolves %s %s %s halos through native theme styles",
    (language, theme, state) => {
      mockLanguage = language;
      colorScheme.set(theme);
      renderWithInterop(
        <VoiceTransactionEntry
          {...baseProps}
          state={state}
          remaining={state === "daily-limit" ? 0 : 3}
        />
      );
      for (const [name, size, radius] of [
        ["outer", 172, 86],
        ["inner", 140, 70],
      ] as const) {
        const halo: unknown = screen.getByTestId("voice-halo-" + name, {
          includeHiddenElements: true,
        });
        const style = resolvedVoiceStyle(halo);
        expect(style).toEqual(expect.objectContaining({
          position: "absolute", width: size, height: size,
          borderRadius: radius,
        }));
        const approvedColor =
          state === "daily-limit"
            ? theme === "dark" ? palette.slate[700] : palette.slate[200]
            : theme === "dark" ? palette.nileGreen[900]
            : name === "outer" ? palette.nileGreen[50] : palette.nileGreen[100];
        expectPaletteHalo(style.backgroundColor, approvedColor);
        const props = getTestInstanceProps(halo);
        expect(props.pointerEvents).toBe("none");
        expect(props.importantForAccessibility).toBe("no-hide-descendants");
      }
      if (state === "daily-limit") {
        const disabled: unknown = screen.getByTestId("voice-mic-target", {
          includeHiddenElements: true,
        });
        expect(getTestInstanceProps(disabled).accessible).toBe(false);
      }
    }
  );
});
