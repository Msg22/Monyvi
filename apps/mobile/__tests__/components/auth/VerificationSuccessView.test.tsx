import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { VerificationSuccessView } from "@/components/auth/VerificationSuccessView";

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): {
    fontFamily: {
      regular: string;
      medium: string;
      semiBold: string;
      bold: string;
    };
  } => ({
    fontFamily: {
      regular: "Inter_400Regular",
      medium: "Inter_500Medium",
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

describe("VerificationSuccessView", () => {
  it("requires an explicit Continue action after successful verification", () => {
    const onContinue = jest.fn();

    render(
      <VerificationSuccessView
        email="mohamed@example.com"
        onContinue={onContinue}
      />
    );

    expect(
      screen.getByRole("header", { name: "email_verified_title" })
    ).toBeOnTheScreen();
    expect(screen.getByText("mohamed@example.com")).toBeOnTheScreen();

    fireEvent.press(
      screen.getByRole("button", { name: "continue_to_dashboard" })
    );
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
