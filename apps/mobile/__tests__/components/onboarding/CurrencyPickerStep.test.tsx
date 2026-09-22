/**
 * Unit tests for CurrencyPickerStep (T030).
 *
 * Scope: this is a pure presentational component. It surfaces the
 * user's pick via `onCurrencySelected(currency)` — persistence (profile
 * update + cash-account creation) is the parent's job.
 *
 * Tests:
 * - The suggested currency (from timezone) is pre-selected on mount.
 * - Tapping a different currency row updates the selection.
 * - Tapping Continue forwards the currently-selected currency via the
 *   `onCurrencySelected` prop — the service write is not invoked here.
 */

import React from "react";
import { TouchableOpacity } from "react-native";

interface ReactTestRendererInstance {
  root: {
    findAllByType: (type: unknown) => Array<{
      props: Record<string, unknown>;
      children: unknown[];
    }>;
  };
  toJSON: () => unknown;
  unmount: () => void;
}
interface ReactTestRendererModule {
  act: (fn: () => void | Promise<void>) => void;
  create: (element: React.ReactElement) => ReactTestRendererInstance;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
const RTR: ReactTestRendererModule = require("react-test-renderer");

// =============================================================================
// Mocks
// =============================================================================

const mockDetectCurrency = jest.fn();
// Mirror the persistence contract so we can guard against the component
// ever importing it by mistake — this step must delegate persistence
// upwards via `onCurrencySelected`, never call a service directly.
const mockConfirmCurrencyAndOnboard = jest.fn();

jest.mock("@/utils/currency-detection", () => ({
  detectCurrencyFromTimezone: (): unknown => mockDetectCurrency(),
}));

jest.mock("@/services/profile-service", () => ({
  confirmCurrencyAndOnboard: (...args: unknown[]): Promise<void> =>
    mockConfirmCurrencyAndOnboard(...args) as Promise<void>,
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): {
    theme: { backgroundGradient: string[] };
    isDark: boolean;
  } => ({
    theme: { backgroundGradient: ["#000", "#111"] },
    isDark: false,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { top: number; bottom: number } => ({
    top: 0,
    bottom: 0,
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    t: (key: string) => string;
    i18n: { language: string };
  } => ({
    t: (key: string): string => key,
    i18n: { language: "en" },
  }),
}));

jest.mock("expo-linear-gradient", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const RN = require("react-native");
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const ReactMod = require("react");
  return {
    LinearGradient: (props: Record<string, unknown>): unknown =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      ReactMod.createElement(RN.View, props),
  };
});

// =============================================================================
// Under test
// =============================================================================

import { CurrencyPickerStep } from "@/components/onboarding/CurrencyPickerStep";

// =============================================================================
// Helpers
// =============================================================================

const activeRenderers: ReactTestRendererInstance[] = [];

function renderCurrencyPicker(
  onCurrencySelected: (currency: string) => void
): ReactTestRendererInstance {
  const renderer = RTR.create(
    React.createElement(CurrencyPickerStep, { onCurrencySelected })
  );
  activeRenderers.push(renderer);
  return renderer;
}

// =============================================================================
// Tests
// =============================================================================

describe("CurrencyPickerStep", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDetectCurrency.mockReturnValue("EGP");
  });

  afterEach(() => {
    for (const renderer of activeRenderers.splice(0)) {
      RTR.act(() => {
        renderer.unmount();
      });
    }
  });

  it("forwards the pre-selected (detected) currency via onCurrencySelected when Continue is tapped", () => {
    mockDetectCurrency.mockReturnValue("EGP");
    const onCurrencySelected = jest.fn();

    const renderer = renderCurrencyPicker(onCurrencySelected);

    // Continue is the last TouchableOpacity (after each currency row).
    const buttons = renderer.root.findAllByType(TouchableOpacity);
    const continueBtn = buttons[buttons.length - 1];
    RTR.act(() => {
      (continueBtn?.props.onPress as () => void | undefined)?.();
    });

    expect(onCurrencySelected).toHaveBeenCalledTimes(1);
    expect(onCurrencySelected).toHaveBeenCalledWith("EGP");
  });

  it("forwards whichever currency the detection returns — swapping the detected code flows through", () => {
    mockDetectCurrency.mockReturnValue("USD");
    const onCurrencySelected = jest.fn();

    const renderer = renderCurrencyPicker(onCurrencySelected);

    const buttons = renderer.root.findAllByType(TouchableOpacity);
    const continueBtn = buttons[buttons.length - 1];
    RTR.act(() => {
      (continueBtn?.props.onPress as () => void | undefined)?.();
    });

    expect(onCurrencySelected).toHaveBeenCalledWith("USD");
  });

  it("uses the row the user tapped — not the pre-selected detection — when Continue fires", () => {
    // Detection pre-selects EGP; the user then taps a different row (the
    // FlatList renders the first ~10 rows under react-test-renderer, with
    // the suggested currency sorted to index 0). `buttons[1]` is the first
    // non-suggested row. This guards against a regression where tapping a
    // row is ignored and Continue forwards the detection instead.
    mockDetectCurrency.mockReturnValue("EGP");
    const onCurrencySelected = jest.fn();

    const renderer = renderCurrencyPicker(onCurrencySelected);

    const buttons = renderer.root.findAllByType(TouchableOpacity);
    // Find the first row whose children don't include the suggested code.
    // We collect text leaves from the button's subtree and pick the first
    // non-EGP row so the assertion below is tolerant of the exact sort
    // order of the SUPPORTED_CURRENCIES list.
    function textsOf(node: unknown, out: string[]): void {
      if (node === null || node === undefined) return;
      if (typeof node === "string") {
        out.push(node);
        return;
      }
      if (Array.isArray(node)) {
        for (const c of node) textsOf(c, out);
        return;
      }
      if (typeof node === "object") {
        textsOf((node as { children?: unknown }).children, out);
      }
    }

    let tappedCode: string | undefined;
    for (const btn of buttons.slice(0, -1)) {
      const texts: string[] = [];
      textsOf(
        (btn as unknown as { children: unknown[] }).children ?? [],
        texts
      );
      const code = texts.find((t) => /^[A-Z]{3}$/.test(t) && t !== "EGP");
      if (code) {
        RTR.act(() => {
          (btn.props.onPress as () => void)();
        });
        tappedCode = code;
        break;
      }
    }
    expect(tappedCode).toBeDefined();

    const continueBtn = buttons[buttons.length - 1];
    RTR.act(() => {
      (continueBtn?.props.onPress as () => void | undefined)?.();
    });

    expect(onCurrencySelected).toHaveBeenCalledTimes(1);
    expect(onCurrencySelected).toHaveBeenCalledWith(tappedCode);
  });

  it("never calls confirmCurrencyAndOnboard directly — persistence is the parent's job", () => {
    mockDetectCurrency.mockReturnValue("EGP");

    const renderer = renderCurrencyPicker(jest.fn());

    // Tap Continue.
    const buttons = renderer.root.findAllByType(TouchableOpacity);
    const continueBtn = buttons[buttons.length - 1];
    RTR.act(() => {
      (continueBtn?.props.onPress as () => void | undefined)?.();
    });

    expect(mockConfirmCurrencyAndOnboard).not.toHaveBeenCalled();
  });
});
