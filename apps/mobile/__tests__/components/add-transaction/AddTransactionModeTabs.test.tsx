import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { processColor, StyleSheet, type ViewStyle } from "react-native";
import {
  colorScheme,
  registerCSS,
  render as renderWithInterop,
  setupAllComponents,
} from "react-native-css-interop/test";

import {
  getTestInstanceChildren,
  getTestInstanceProps,
  getTestInstances,
} from "../../test-utils/test-instance-props";

import { AddTransactionModeTabs } from "@/components/add-transaction/AddTransactionModeTabs";
import { palette } from "@/constants/colors";
import { arabicFontFamily, fontFamily } from "@/constants/typography";

let mockIsRTL = false;

jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => {
    const { arabicFontFamily, fontFamily } = jest.requireActual<
      typeof import("@/constants/typography")
    >("@/constants/typography");
    return {
      language: mockIsRTL ? "ar" : "en",
      isRTL: mockIsRTL,
      fontFamily: mockIsRTL ? arabicFontFamily : fontFamily,
    };
  },
}));

function renderTabs(
  mode: "manual" | "voice",
  disabled = false,
  onModeChange = jest.fn()
): void {
  render(
    <AddTransactionModeTabs
      mode={mode}
      disabled={disabled}
      onModeChange={onModeChange}
      manualLabel={mockIsRTL ? "يدوي" : "Manual"}
      voiceLabel={mockIsRTL ? "صوتي" : "Voice"}
    />
  );
}

describe("AddTransactionModeTabs approved underline contract", () => {
  beforeEach(() => {
    mockIsRTL = false;
    jest.clearAllMocks();
  });

  it("exposes two equally selectable labeled tabs and changes only to the other mode", () => {
    const onModeChange = jest.fn();
    renderTabs("manual", false, onModeChange);

    const manual: unknown = screen.getByRole("tab", { name: "Manual" });
    const voice: unknown = screen.getByRole("tab", { name: "Voice" });

    expect(getTestInstanceProps(manual).accessibilityState).toEqual({
      selected: true,
      disabled: false,
    });
    expect(getTestInstanceProps(voice).accessibilityState).toEqual({
      selected: false,
      disabled: false,
    });
    fireEvent.press(screen.getByRole("tab", { name: "Manual" }));
    expect(onModeChange).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole("tab", { name: "Voice" }));
    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith("voice");
  });

  it("renders an independent selected-only underline instead of a filled tab pill", () => {
    renderTabs("voice");
    const selected: unknown = screen.getByRole("tab", { name: "Voice" });
    const selectedProps = getTestInstanceProps(selected);
    expect(selectedProps.className).toEqual(
      expect.stringContaining("relative")
    );
    expect(selectedProps.className).not.toEqual(
      expect.stringContaining("rounded-xl")
    );
    const indicator: unknown = screen.getByTestId(
      "add-transaction-mode-voice-indicator",
      { includeHiddenElements: true }
    );
    const indicatorProps = getTestInstanceProps(indicator);
    expect(indicatorProps.className).toEqual(
      expect.stringContaining("h-[2px]")
    );
    expect(indicatorProps.pointerEvents).toBe("none");
    expect(indicatorProps.accessible).toBe(false);
    expect(indicatorProps.importantForAccessibility).toBe(
      "no-hide-descendants"
    );
    expect(
      screen.queryByTestId("add-transaction-mode-manual-indicator", {
        includeHiddenElements: true,
      })
    ).toBeNull();
    expect(selectedProps.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
  });

  it.each([false, true])(
    "keeps tab opacity as static inline style, never as Pressable opacity utilities (disabled=%s)",
    (disabled) => {
      renderTabs("voice", disabled);

      for (const label of ["Manual", "Voice"]) {
        const tab: unknown = screen.getByRole("tab", { name: label });
        const props = getTestInstanceProps(tab);
        // opacity utilities on a Pressable hit the NativeWind v4 crash exception.
        expect(String(props.className)).not.toMatch(
          /(^|\s)opacity-|active:opacity/
        );
        expect(typeof props.style).not.toBe("function");
        expect(props.style).toEqual(
          expect.objectContaining({ opacity: disabled ? 0.5 : 1 })
        );
      }
    }
  );

  it("keeps both tabs disabled while the Voice flow or consent start is locked", () => {
    const onModeChange = jest.fn();
    renderTabs("voice", true, onModeChange);

    for (const label of ["Manual", "Voice"]) {
      const tab: unknown = screen.getByRole("tab", { name: label });
      expect(getTestInstanceProps(tab).accessibilityState).toEqual(
        expect.objectContaining({ disabled: true })
      );
      fireEvent.press(screen.getByRole("tab", { name: label }));
    }
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it.each([
    ["English", false, "Manual", "Voice", fontFamily.semiBold],
    ["Arabic", true, "يدوي", "صوتي", arabicFontFamily.semiBold],
  ] as const)(
    "uses the declared %s semibold font for both tab labels",
    (_locale, rtl, manual, voice, expectedFamily) => {
      mockIsRTL = rtl;
      renderTabs("manual");
      expect(screen.getByText(manual)).toHaveStyle({
        fontFamily: expectedFamily,
      });
      expect(screen.getByText(voice)).toHaveStyle({
        fontFamily: expectedFamily,
      });
    }
  );

  it.each([false, true])(
    "keeps 16dp outer gutters and centers the max-560dp tab row (RTL=%s)",
    (rtl) => {
      mockIsRTL = rtl;
      renderTabs("voice");
      const voiceLabel = rtl ? "صوتي" : "Voice";
      const tab: unknown = screen.getByRole("tab", { name: voiceLabel });
      const tablist: unknown = screen.getByTestId(
        "add-transaction-modes-tablist"
      );
      const outerFrame: unknown = screen.getByTestId(
        "add-transaction-modes-frame"
      );

      const tablistProps = getTestInstanceProps(tablist);
      const outerProps = getTestInstanceProps(outerFrame);
      expect(tablistProps.accessibilityRole).toBe("tablist");
      expect(getTestInstanceChildren(tablist).length).toBeGreaterThan(0);
      expect(getTestInstanceProps(tab).accessibilityLabel).toBe(voiceLabel);
      expect(tablistProps.className).toEqual(
        expect.stringContaining("max-w-[560px]")
      );
      expect(tablistProps.className).toEqual(
        expect.stringContaining("self-center")
      );
      expect(tablistProps.className).toEqual(expect.stringContaining("w-full"));
      expect(outerProps.className).toEqual(expect.stringContaining("px-4"));
      expect(outerProps.className).toEqual(expect.stringContaining("w-full"));
    }
  );

  it("reverses visual/accessible order for Arabic while preserving selection", () => {
    mockIsRTL = true;
    renderTabs("voice");
    expect(
      getTestInstances(screen.getAllByRole("tab")).map(
        (tab) => getTestInstanceProps(tab).accessibilityLabel
      )
    ).toEqual(["صوتي", "يدوي"]);
    expect(
      getTestInstanceProps(screen.getByRole("tab", { name: "صوتي" }))
        .accessibilityState
    ).toEqual(expect.objectContaining({ selected: true }));
  });
});

/**
 * Compile the real mobile Tailwind config, then let the pinned CSS Interop
 * runtime convert that output to native styles. No manually invented rules.
 */
const MOBILE_ROOT = path.resolve(__dirname, "../../..");
const REPOSITORY_ROOT = path.resolve(MOBILE_ROOT, "../..");
const TAILWIND_CLI = require.resolve("tailwindcss/lib/cli/index.js", {
  paths: [MOBILE_ROOT, REPOSITORY_ROOT],
});
let cachedModeTabCss: string | null = null;

function compiledModeTabCss(): string {
  if (cachedModeTabCss !== null) return cachedModeTabCss;
  const temporary = mkdtempSync(path.join(os.tmpdir(), "monyvi-tabs-css-"));
  try {
    const input = path.join(temporary, "input.css");
    const componentSource = path.join(
      MOBILE_ROOT,
      "components",
      "add-transaction",
      "AddTransactionModeTabs.tsx"
    );
    const output = path.join(temporary, "output.css");
    writeFileSync(input, "@tailwind base;\n@tailwind utilities;\n", "utf8");
    execFileSync(
      process.execPath,
      [
        TAILWIND_CLI,
        "-c",
        path.join(MOBILE_ROOT, "tailwind.config.js"),
        "-i",
        input,
        "-o",
        output,
        "--content",
        componentSource,
      ],
      {
        cwd: REPOSITORY_ROOT,
        stdio: "pipe",
        env: { ...process.env, NATIVEWIND_OS: "android" },
      }
    );
    cachedModeTabCss = readFileSync(output, "utf8");
    return cachedModeTabCss;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

/** Observe styles already resolved on native nodes, never fabricate pressed=true. */
function tabNativeStyle(node: unknown): ViewStyle {
  const raw: unknown = getTestInstanceProps(node).style;
  if (typeof raw === "function") {
    // A Pressable callback is not itself evidence of native styling.
    // Continue into its rendered native View descendants.
    return {};
  }
  if (raw !== undefined && raw !== null && typeof raw !== "object") {
    throw new Error("Expected a resolved native style object or array");
  }
  return StyleSheet.flatten(raw) ?? {};
}

function expectNativeSelectedIndicator(expectedColor: string): void {
  const indicator: unknown = screen.getByTestId(
    "add-transaction-mode-voice-indicator",
    { includeHiddenElements: true }
  );
  const props = getTestInstanceProps(indicator);
  const nativeStyle = tabNativeStyle(indicator);
  expect(props.accessible).toBe(false);
  expect(props.pointerEvents).toBe("none");
  expect(props.importantForAccessibility).toBe("no-hide-descendants");
  expect(nativeStyle).toEqual(
    expect.objectContaining({
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 2,
    })
  );
  const actual = processColor(nativeStyle.backgroundColor);
  const approved = processColor(expectedColor);
  expect(typeof actual).toBe("number");
  expect(actual).toBe(approved);
}

function resolvedTabOpacity(node: unknown): number | undefined {
  const style = tabNativeStyle(node);
  if (typeof style.opacity === "number") return style.opacity;
  for (const child of getTestInstanceChildren(node)) {
    if (typeof child === "object" && child !== null) {
      const childOpacity = resolvedTabOpacity(child);
      if (childOpacity !== undefined) return childOpacity;
    }
  }
  return undefined;
}

describe("compiled NativeWind mode-tab underline regression", () => {
  beforeAll(() => {
    setupAllComponents();
  });

  beforeEach(() => {
    registerCSS(compiledModeTabCss(), {
      grouping: ["^group(/.*)?"],
      ignorePropertyWarningRegex: ["^--tw-"],
    });
  });

  it.each([
    ["English", false, "light", false],
    ["English", false, "light", true],
    ["English", false, "dark", false],
    ["English", false, "dark", true],
    ["Arabic", true, "light", false],
    ["Arabic", true, "light", true],
    ["Arabic", true, "dark", false],
    ["Arabic", true, "dark", true],
  ] as const)(
    "keeps %s Voice underline native (RTL=%s, theme=%s, disabled=%s)",
    (_language, rtl, theme, disabled) => {
      mockIsRTL = rtl;
      colorScheme.set(theme);
      const voiceLabel = rtl ? "صوتي" : "Voice";
      const manualLabel = rtl ? "يدوي" : "Manual";
      const onModeChange = jest.fn();
      renderWithInterop(
        <AddTransactionModeTabs
          mode="voice"
          disabled={disabled}
          manualLabel={manualLabel}
          voiceLabel={voiceLabel}
          onModeChange={onModeChange}
        />
      );

      const selected: unknown = screen.getByRole("tab", { name: voiceLabel });
      const other: unknown = screen.getByRole("tab", { name: manualLabel });
      const green =
        theme === "dark" ? palette.nileGreen[400] : palette.nileGreen[600];

      const selectedNode = (): unknown =>
        screen.getByRole("tab", { name: voiceLabel });
      expectNativeSelectedIndicator(green);
      expect(
        screen.queryByTestId("add-transaction-mode-manual-indicator", {
          includeHiddenElements: true,
        })
      ).toBeNull();
      expect(getTestInstanceProps(selected).accessibilityState).toEqual(
        expect.objectContaining({ selected: true, disabled })
      );
      expect(getTestInstanceProps(other).accessibilityState).toEqual(
        expect.objectContaining({ selected: false, disabled })
      );
      // Normal native opacity may be omitted; the default is exactly 1.
      expect(resolvedTabOpacity(selectedNode()) ?? 1).toBe(disabled ? 0.5 : 1);

      fireEvent(screen.getByRole("tab", { name: voiceLabel }), "pressIn");
      expectNativeSelectedIndicator(green);
      expect(resolvedTabOpacity(selectedNode()) ?? 1).toBeCloseTo(
        disabled ? 0.5 : 0.72
      );
      fireEvent(screen.getByRole("tab", { name: voiceLabel }), "pressOut");
      expectNativeSelectedIndicator(green);
      expect(resolvedTabOpacity(selectedNode()) ?? 1).toBe(disabled ? 0.5 : 1);

      if (!disabled) {
        fireEvent.press(screen.getByRole("tab", { name: manualLabel }));
        expect(onModeChange).toHaveBeenCalledTimes(1);
        expect(onModeChange).toHaveBeenCalledWith("manual");
      } else {
        fireEvent.press(screen.getByRole("tab", { name: manualLabel }));
        expect(onModeChange).not.toHaveBeenCalled();
      }
    }
  );
});
