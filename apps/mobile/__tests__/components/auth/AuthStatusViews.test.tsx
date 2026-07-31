import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { ResetSentView } from "@/components/auth/ResetSentView";
import { VerificationPendingView } from "@/components/auth/VerificationPendingView";

const COPY: Readonly<Record<string, string>> = {
  check_your_inbox: "Check your inbox",
  verification_sent_message: "We sent a verification link to {{email}}.",
  resend_email: "Resend email",
  resending_email: "Resending email…",
  back_to_sign_in: "Back to sign in",
  reset_link_sent: "Reset link sent",
  reset_link_message: "We sent a password reset link to {{email}}.",
};

jest.mock("react-i18next", () => ({
  useTranslation: (): { t: (key: string, values?: { email?: string }) => string } => ({
    t: (key: string, values?: { email?: string }): string =>
      (COPY[key] ?? key).replace("{{email}}", values?.email ?? ""),
  }),
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): {
    isRTL: boolean;
    fontFamily: {
      regular: string;
      medium: string;
      semiBold: string;
      bold: string;
    };
  } => ({
    isRTL: false,
    fontFamily: {
      regular: "Inter_400Regular",
      medium: "Inter_500Medium",
      semiBold: "Inter_600SemiBold",
      bold: "Inter_700Bold",
    },
  }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { isDark: boolean } => ({ isDark: false }),
}));

describe("auth status views", () => {
  it("announces the verification resend state and blocks conflicting actions", () => {
    const onResend = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
    const onBack = jest.fn();

    render(
      <VerificationPendingView
        email="user@example.com"
        isResending
        onResend={onResend}
        onBack={onBack}
      />
    );

    expect(screen.getByRole("header", { name: "Check your inbox" })).toBeOnTheScreen();
    expect(screen.getByText(/user@example.com/)).toBeOnTheScreen();
    expect(
      screen.getByRole("button", {
        name: "Resending email…",
        disabled: true,
        busy: true,
      })
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Back to sign in", disabled: true })
    ).toBeOnTheScreen();
  });

  it("returns from reset confirmation to sign in", () => {
    const onBack = jest.fn();

    render(<ResetSentView email="user@example.com" onBack={onBack} />);

    expect(screen.getByRole("header", { name: "Reset link sent" })).toBeOnTheScreen();
    expect(screen.getByText(/user@example.com/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Back to sign in" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
