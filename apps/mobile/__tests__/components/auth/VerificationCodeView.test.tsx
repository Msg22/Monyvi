import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { VerificationCodeView } from "@/components/auth/VerificationCodeView";

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { isDark: boolean } => ({ isDark: false }),
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

jest.mock("react-i18next", () => ({
  useTranslation: (): { t: (key: string, options?: Record<string, unknown>) => string } => ({
    t: (key: string, options?: Record<string, unknown>): string => {
      if (key === "verification_code_expires_in") return `Code expires in ${String(options?.time ?? "")}`;
      if (key === "resend_in") return `Resend in ${String(options?.time ?? "")}`;
      return key;
    },
  }),
}));

describe("VerificationCodeView", () => {
  it("renders six visual cells backed by one paste-capable OTP input", () => {
    const onCodeChange = jest.fn();

    render(
      <VerificationCodeView
        email="mohamed@example.com"
        code="123"
        verificationError={null}
        verificationExpiresAtMs={Date.now() + 10 * 60_000}
        resendAvailableAtMs={Date.now() + 2 * 60_000}
        isVerifying={false}
        isResending={false}
        onCodeChange={onCodeChange}
        onResend={jest.fn()}
        onBack={jest.fn()}
      />
    );

    expect(screen.getAllByTestId(/verification-code-cell-/)).toHaveLength(6);
    const input = screen.getByTestId("verification-code-input");
    expect(input).toHaveProp("maxLength", 6);
    expect(input).toHaveProp("textContentType", "oneTimeCode");

    fireEvent.changeText(input, "12 3-456");
    expect(onCodeChange).toHaveBeenCalledWith("12 3-456");

    expect(screen.queryByText(/paste the code/i)).not.toBeOnTheScreen();
    expect(screen.queryByText(/auto-submits/i)).not.toBeOnTheScreen();
    expect(screen.queryByText(/resends left/i)).not.toBeOnTheScreen();
  });
});
