import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  processColor,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { palette } from "@/constants/colors";

import {
  getTestInstanceParent,
  getTestInstanceProps,
  getTestInstanceChildren,
} from "../../test-utils/test-instance-props";

/**
 * Shared deterministic R2 CSS-Interop oracles.
 * A native resolved style, not a class-string comparison, establishes fidelity.
 */
const MOBILE_ROOT = path.resolve(__dirname, "../../..");
const REPOSITORY_ROOT = path.resolve(MOBILE_ROOT, "../..");
const TAILWIND_CLI = require.resolve("tailwindcss/lib/cli/index.js", {
  paths: [MOBILE_ROOT, REPOSITORY_ROOT],
});
let cachedVoiceCss: string | null = null;

export function compiledVoiceCss(): string {
  if (cachedVoiceCss !== null) return cachedVoiceCss;
  const directory = mkdtempSync(path.join(os.tmpdir(), "monyvi-voice-css-"));
  try {
    const input = path.join(directory, "input.css");
    const componentSource = path.join(
      MOBILE_ROOT,
      "components",
      "add-transaction",
      "VoiceTransactionEntry.tsx"
    );
    const adapterSource = path.join(
      MOBILE_ROOT,
      "components",
      "add-transaction",
      "voice-ui",
      "*.tsx"
    );
    const output = path.join(directory, "output.css");
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
        componentSource + "," + adapterSource,
      ],
      {
        cwd: REPOSITORY_ROOT,
        stdio: "pipe",
        env: { ...process.env, NATIVEWIND_OS: "android" },
      }
    );
    cachedVoiceCss = readFileSync(output, "utf8");
    return cachedVoiceCss;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** NativeWind CSS must be actually registered and translated, not string-matched. */
export function resolvedVoiceStyle(node: unknown): ViewStyle {
  const raw: unknown = getTestInstanceProps(node).style;
  if (typeof raw === "function") {
    // Only native flattened props can prove clipping. Do not call the
    // Pressable callback with a fabricated pressed state.
    return {};
  }
  if (raw !== undefined && raw !== null && typeof raw !== "object") {
    throw new Error("Expected a resolved native style object or array");
  }
  return StyleSheet.flatten(raw) ?? {};
}

/** Validate native style representation before passing it to StyleSheet.flatten. */
function isResolvedTextStyle(value: unknown): value is StyleProp<TextStyle> {
  if (typeof value !== "object" || value === null) return false;
  if (!Array.isArray(value)) return true;
  return value.every(
    (entry: unknown): boolean =>
      entry === null ||
      entry === undefined ||
      entry === false ||
      typeof entry === "object"
  );
}

/** Find the action's actual translated Text label, never the icon mock Text. */
function findActionLabel(action: unknown): unknown {
  const label: unknown = getTestInstanceProps(action).accessibilityLabel;
  if (typeof label !== "string" || label.length === 0) {
    throw new Error("Recorder action requires a nonempty accessible label");
  }
  const result = findActionLabelOrNull(action, label);
  if (result === null) {
    throw new Error(
      "Recorder control is missing its matching visible Text label"
    );
  }
  return result;
}

function findActionLabelOrNull(parent: unknown, label: string): unknown {
  for (const child of getTestInstanceChildren(parent)) {
    if (typeof child !== "object" || child === null) continue;
    const nativeDescendant = findActionLabelOrNull(child, label);
    if (nativeDescendant !== null) return nativeDescendant;
    if (
      "type" in child &&
      typeof child.type === "string" &&
      getTestInstanceProps(child).children === label
    ) {
      return child;
    }
  }
  return null;
}

export function resolvedActionLabelStyle(action: unknown): TextStyle {
  const raw: unknown = getTestInstanceProps(findActionLabel(action)).style;
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object") {
    throw new Error("Expected NativeWind-resolved Text style");
  }
  if (!isResolvedTextStyle(raw)) {
    throw new Error("Expected an object or array of native Text styles");
  }
  return StyleSheet.flatten(raw) ?? {};
}

export function recorderActionRow(
  submit: unknown,
  center: unknown,
  discard: unknown
): unknown {
  const ancestors = (value: unknown): readonly unknown[] => {
    const chain: unknown[] = [];
    let node: unknown = value;
    while (node !== null && node !== undefined) {
      chain.push(node);
      node = getTestInstanceParent(node);
    }
    return chain;
  };
  const middle = ancestors(center);
  const right = ancestors(discard);
  const row = ancestors(submit).find(
    (node) => middle.includes(node) && right.includes(node)
  );
  if (row === undefined) {
    throw new Error("R2 action buttons must share one physical row");
  }
  return row;
}

export function hasNativeCircularClip(gradient: unknown): boolean {
  let current: unknown = getTestInstanceParent(gradient);
  for (let i = 0; i < 12 && current !== null; i++) {
    if (typeof current !== "object") break;
    const style = resolvedVoiceStyle(current);
    if (
      style.overflow === "hidden" &&
      style.width === 104 &&
      style.height === 104 &&
      style.borderRadius === 52
    ) {
      return true;
    }
    current = getTestInstanceParent(current);
  }
  return false;
}

export function expectPaletteHalo(
  actual: unknown,
  paletteColor: string
): number {
  if (typeof actual !== "string") {
    throw new Error("Expected native resolved halo color");
  }
  const native = processColor(actual);
  const expected = processColor(paletteColor);
  if (typeof native !== "number" || typeof expected !== "number") {
    throw new Error("Expected valid React Native color values");
  }
  const nativeUint = ((native % 4294967296) + 4294967296) % 4294967296;
  const expectedUint = ((expected % 4294967296) + 4294967296) % 4294967296;
  expect(nativeUint % 16777216).toBe(expectedUint % 16777216);
  const alpha = Math.floor(nativeUint / 16777216);
  expect(alpha).toBeGreaterThan(0);
  expect(alpha).toBeLessThan(255);
  return alpha / 255;
}

/** Assert approved native label, border and background colors for all R2 actions. */
export function expectRecorderActionColorBindings(
  submit: unknown,
  center: unknown,
  discard: unknown
): void {
  expect(processColor(resolvedActionLabelStyle(submit).color)).toBe(
    processColor(palette.slate[25])
  );
  const submitStyle = resolvedVoiceStyle(submit);
  expect(processColor(submitStyle.backgroundColor)).toBe(
    processColor(palette.nileGreen[500])
  );
  expect(processColor(submitStyle.borderColor)).toBe(
    processColor(palette.nileGreen[500])
  );
  const centerStyle = resolvedVoiceStyle(center);
  const gray = [palette.slate[400], palette.slate[500], palette.slate[600]];
  expect(gray.map(processColor)).toContain(
    processColor(centerStyle.borderColor)
  );
  expect(gray.map(processColor)).toContain(
    processColor(resolvedActionLabelStyle(center).color)
  );
  expect(
    centerStyle.backgroundColor === undefined ||
      processColor(centerStyle.backgroundColor) === processColor("transparent")
  ).toBe(true);

  const discardStyle = resolvedVoiceStyle(discard);
  expect([palette.red[500], palette.red[600]].map(processColor)).toContain(
    processColor(discardStyle.borderColor)
  );
  expect([palette.red[500], palette.red[600]].map(processColor)).toContain(
    processColor(resolvedActionLabelStyle(discard).color)
  );
  expect(
    discardStyle.backgroundColor === undefined ||
      processColor(discardStyle.backgroundColor) === processColor("transparent")
  ).toBe(true);
}
