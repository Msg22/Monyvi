import { render, screen } from "@testing-library/react-native";
import React from "react";

import { VerificationProcessingView } from "@/components/auth/VerificationProcessingView";

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): {
    fontFamily: {
      regular: string;
      semiBold: string;
      bold: string;
    };
  } => ({
    fontFamily: {
      regular: "Inter_400Regular",
      semiBold: "Inter_600SemiBold",
      bold: "Inter_700Bold",
    },
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

describe("VerificationProcessingView", () => {
  it("renders the approved dedicated verifying state instead of leaving the code cells interactive", () => {
    render(<VerificationProcessingView />);

    expect(
      screen.getByRole("header", { name: "verifying_code_title" })
    ).toBeOnTheScreen();
    expect(screen.getByText("verifying_code_message")).toBeOnTheScreen();
    expect(screen.getByTestId("verification-processing-indicator")).toBeOnTheScreen();
    expect(screen.queryByTestId("verification-code-input")).not.toBeOnTheScreen();
  });
});
