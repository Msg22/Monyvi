import React from "react";
import { BackHandler, Text as MockText } from "react-native";
import { render, screen } from "@testing-library/react-native";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 16 }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string): string => key }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { readonly name: string }) => (
    <MockText>{name}</MockText>
  ),
}));

import { BudgetActionsSheet } from "@/components/budget/BudgetActionsSheet";

describe("BudgetActionsSheet", () => {
  beforeEach(() => {
    jest
      .spyOn(BackHandler, "addEventListener")
      .mockReturnValue({ remove: jest.fn() });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("omits the unusable pause toggle for expired budget detail", () => {
    const { rerender } = render(
      <BudgetActionsSheet
        visible={true}
        isPaused={true}
        canTogglePause={false}
        onClose={jest.fn()}
        onAction={jest.fn()}
      />
    );

    expect(screen.queryByRole("switch")).toBeNull();

    rerender(
      <BudgetActionsSheet
        visible={true}
        isPaused={true}
        canTogglePause={true}
        onClose={jest.fn()}
        onAction={jest.fn()}
      />
    );

    expect(
      screen.getByRole("switch", { name: "accessibility_resume_budget" })
    ).toBeOnTheScreen();
  });
});
