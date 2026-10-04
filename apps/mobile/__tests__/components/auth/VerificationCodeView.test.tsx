import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import {
  VerificationCodeView,
  formatVerificationDigit,
} from "@/components/auth/VerificationCodeView";

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
      const time = typeof options?.time === "string" ? options.time : "";
      if (key === "verification_code_expires_in") {
        return `Code expires in ${time}`;
      }
      if (key === "resend_in") {
        return `Resend in ${time}`;
      }
      return key;
    },
  }),
}));

describe("VerificationCodeView", () => {
  it("renders Arabic-Indic display digits without changing the canonical OTP", () => {
    expect(formatVerificationDigit("1", "ar")).toBe("١");
    expect(formatVerificationDigit("6", "ar")).toBe("٦");
    expect(formatVerificationDigit("1", "en")).toBe("1");
    expect(formatVerificationDigit(undefined, "ar")).toBe("");
  });


  it("uses generic ten-minute expiry copy when the device has no known send timestamp", () => {
    render(
      <VerificationCodeView
        email="mohamed@example.com"
        code=""
        verificationError={null}
        verificationExpiresAtMs={null}
        resendAvailableAtMs={null}
        resendLimitUntilMs={null}
        isVerifying={false}
        isResending={false}
        onCodeChange={jest.fn()}
        onResend={jest.fn()}
        onBack={jest.fn()}
      />
    );

    expect(
      screen.getByText("verification_code_expires_generic")
    ).toBeOnTheScreen();
  });

  it("locks code editing while a resend request is in flight", () => {
    render(
      <VerificationCodeView
        email="mohamed@example.com"
        code=""
        verificationError={null}
        verificationExpiresAtMs={Date.now() + 10 * 60_000}
        resendAvailableAtMs={null}
        resendLimitUntilMs={null}
        isVerifying={false}
        isResending
        onCodeChange={jest.fn()}
        onResend={jest.fn()}
        onBack={jest.fn()}
      />
    );

    expect(screen.getByTestId("verification-code-input")).toHaveProp(
      "editable",
      false
    );
  });

  it("renders six visual cells backed by one paste-capable OTP input", () => {
    const onCodeChange = jest.fn();

    render(
      <VerificationCodeView
        email="mohamed@example.com"
        code="123"
        verificationError={null}
        verificationExpiresAtMs={Date.now() + 10 * 60_000}
        resendAvailableAtMs={Date.now() + 2 * 60_000}
        resendLimitUntilMs={null}
        isVerifying={false}
        isResending={false}
        onCodeChange={onCodeChange}
        onResend={jest.fn()}
        onBack={jest.fn()}
      />
    );

    expect(screen.getByTestId("verification-code-cells")).toBeOnTheScreen();
    expect(screen.getByTestId("verification-code-input")).toHaveProp(
      "maxLength",
      6
    );
    expect(screen.getByTestId("verification-code-input")).toHaveProp(
      "textContentType",
      "oneTimeCode"
    );

    fireEvent.changeText(
      screen.getByTestId("verification-code-input"),
      "12 3-456"
    );
    expect(onCodeChange).toHaveBeenCalledWith("12 3-456");

    expect(screen.queryByText(/paste the code/i)).not.toBeOnTheScreen();
    expect(screen.queryByText(/auto-submits/i)).not.toBeOnTheScreen();
    expect(screen.queryByText(/resends left/i)).not.toBeOnTheScreen();
  });
});
