import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthCallbackFailureView } from "@/components/auth/AuthCallbackFailureView";
import { ResetSentView } from "@/components/auth/ResetSentView";
import { VerificationPendingView } from "@/components/auth/VerificationPendingView";

const COPY: Readonly<Record<string, string>> = {
  check_your_inbox: "Check your inbox",
  verification_sent_message: "We sent a verification link to",
  resend_email: "Resend email",
  resending_email: "Resending email…",
  back_to_sign_in: "Back to sign in",
  private_by_design: "Private by design.",
  privacy: "Privacy",
  terms: "Terms",
  verification_link_failed_title: "Verification link didn’t work",
  verification_link_failed_message:
    "This link may have expired or already been used. Go back to sign in and request a new email.",
  reset_link_sent: "Reset link sent",
  reset_link_message: "We sent a password reset link to {{email}}.",
};

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    t: (key: string, values?: { email?: string }) => string;
  } => ({
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
  it("renders the approved full-page verification composition without a card", () => {
    const onResend = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
    const onBack = jest.fn();

    render(
      <VerificationPendingView
        email="user@example.com"
        isResending={false}
        onResend={onResend}
        onBack={onBack}
      />
    );

    expect(screen.getByTestId("verification-pending-view")).toBeOnTheScreen();
    expect(screen.getByTestId("verification-state-content")).toBeOnTheScreen();
    expect(screen.getByTestId("verification-email-chip")).toHaveTextContent(
      "user@example.com"
    );
    expect(screen.getByTestId("auth-privacy-footer")).toBeOnTheScreen();
    expect(screen.getByText("Privacy")).toBeOnTheScreen();
    expect(screen.getByText("Terms")).toBeOnTheScreen();
    expect(screen.queryByRole("link")).not.toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Resend email" }));
    fireEvent.press(screen.getByRole("button", { name: "Back to sign in" }));
    expect(onResend).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("verification-card")).not.toBeOnTheScreen();
  });

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

    expect(
      screen.getByRole("header", { name: "Check your inbox" })
    ).toBeOnTheScreen();
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

  it("renders failed-link recovery with safe-area-aware action spacing", () => {
    const onBack = jest.fn();

    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, right: 0, bottom: 34, left: 0 },
        }}
      >
        <AuthCallbackFailureView onBack={onBack} />
      </SafeAreaProvider>
    );

    expect(
      screen.getByRole("header", { name: "Verification link didn’t work" })
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "This link may have expired or already been used. Go back to sign in and request a new email."
      )
    ).toBeOnTheScreen();
    expect(screen.getByTestId("auth-callback-failure-view")).toHaveStyle({
      paddingBottom: 58,
    });

    fireEvent.press(screen.getByRole("button", { name: "Back to sign in" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("returns from reset confirmation to sign in", () => {
    const onBack = jest.fn();

    render(<ResetSentView email="user@example.com" onBack={onBack} />);

    expect(
      screen.getByRole("header", { name: "Reset link sent" })
    ).toBeOnTheScreen();
    expect(screen.getByText(/user@example.com/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Back to sign in" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
