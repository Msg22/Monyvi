import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Text as NativeText } from "react-native";

import {
  CalculatorKeypad,
  type CalculatorKey,
} from "@/components/add-transaction/CalculatorKeypad";

let mockLocaleFontFamily = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

const mockUseLocale = jest.fn(() => ({
  language: "en",
  isRTL: false,
  fontFamily: mockLocaleFontFamily,
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => mockUseLocale(),
}));


jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 24 }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: false } => ({ isDark: false }),
}));

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: {
    Light: "Light",
    Medium: "Medium",
  },
  impactAsync: jest.fn((): Promise<void> => Promise.resolve()),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (): null => null,
}));

function getNativeTextProps(content: string): Record<string, unknown> {
  const node = screen
    .UNSAFE_getAllByType(NativeText)
    .find((candidate) => candidate.props.children === content);
  if (!node) throw new Error(`Native Text "${content}" not found`);
  return node.props as Record<string, unknown>;
}

const KEY_IDS = [
  "calculator-key-1",
  "calculator-key-2",
  "calculator-key-3",
  "calculator-key-divide",
  "calculator-key-4",
  "calculator-key-5",
  "calculator-key-6",
  "calculator-key-multiply",
  "calculator-key-7",
  "calculator-key-8",
  "calculator-key-9",
  "calculator-key-minus",
  "calculator-key-dot",
  "calculator-key-0",
  "calculator-key-del",
  "calculator-key-plus",
  "calculator-key-done",
  "calculator-key-equals",
] as const;

describe("CalculatorKeypad compact Manual contract", () => {
  beforeEach(() => {
    mockLocaleFontFamily = {
      regular: "Inter_400Regular",
      medium: "Inter_500Medium",
      semiBold: "Inter_600SemiBold",
      bold: "Inter_700Bold",
    };
    mockUseLocale.mockReset();
    mockUseLocale.mockImplementation(() => ({
      language: "en",
      isRTL: false,
      fontFamily: mockLocaleFontFamily,
    }));
  });

  it("keeps every calculator action at least 48dp high", () => {
    render(<CalculatorKeypad compact onKeyPress={jest.fn()} actionLabel="Done" />);

    for (const testID of KEY_IDS) {
      expect(screen.getByTestId(testID)).toHaveStyle({ height: 48 });
    }
  });

  it("adds the actual bottom inset plus the approved 12dp keypad clearance", () => {
    render(<CalculatorKeypad compact onKeyPress={jest.fn()} actionLabel="Done" />);

    expect(screen.getByTestId("calculator-keypad")).toHaveStyle({
      paddingBottom: 36,
    });
  });

  it("uses locale bold fonts on compact digits, operators, Done and equals", () => {
    const { rerender } = render(
      <CalculatorKeypad compact onKeyPress={jest.fn()} actionLabel="Done" />
    );

    for (const label of ["1", "÷", "="]) {
      const text = screen.getByText(label);
      expect(text).toHaveStyle({ fontFamily: "Inter_700Bold" });
      expect(getNativeTextProps(label).className as string).toContain(
        "text-xl"
      );
    }

    const done = screen.getByText("Done");
    expect(done).toHaveStyle({ fontFamily: "Inter_700Bold" });
    expect(getNativeTextProps("Done").className as string).toContain(
      "text-base"
    );

    mockLocaleFontFamily = {
      regular: "NotoSansArabic_400Regular",
      medium: "NotoSansArabic_500Medium",
      semiBold: "NotoSansArabic_600SemiBold",
      bold: "NotoSansArabic_700Bold",
    };

    rerender(
      <CalculatorKeypad compact onKeyPress={jest.fn()} actionLabel="تم" />
    );

    expect(screen.getByText("1")).toHaveStyle({
      fontFamily: "NotoSansArabic_700Bold",
    });
    expect(screen.getByText("÷")).toHaveStyle({
      fontFamily: "NotoSansArabic_700Bold",
    });
    expect(screen.getByText("=")).toHaveStyle({
      fontFamily: "NotoSansArabic_700Bold",
    });
    expect(screen.getByText("تم")).toHaveStyle({
      fontFamily: "NotoSansArabic_700Bold",
    });
  });

  it("keeps the legacy keypad independent from LocaleContext", () => {
    mockUseLocale.mockImplementation(() => {
      throw new Error("Legacy keypad must not consume LocaleContext");
    });

    expect(() =>
      render(<CalculatorKeypad onKeyPress={jest.fn()} actionLabel="Done" />)
    ).not.toThrow();
    expect(mockUseLocale).not.toHaveBeenCalled();
  });

  it("keeps operators, equals, delete and Done as distinct calculator actions", () => {
    const onKeyPress = jest.fn<void, [CalculatorKey]>();
    render(<CalculatorKeypad compact onKeyPress={onKeyPress} actionLabel="Done" />);

    fireEvent.press(screen.getByTestId("calculator-key-plus"));
    fireEvent.press(screen.getByTestId("calculator-key-del"));
    fireEvent.press(screen.getByTestId("calculator-key-equals"));
    fireEvent.press(screen.getByTestId("calculator-key-done"));

    expect(onKeyPress.mock.calls.map(([key]) => key)).toEqual([
      "+",
      "DEL",
      "=",
      "DONE",
    ]);
  });
});
