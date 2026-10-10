import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import {
  CalculatorKeypad,
  type CalculatorKey,
} from "@/components/add-transaction/CalculatorKeypad";

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
