import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import React from "react";

import {
  VerificationCodeView,
  formatVerificationDigit,
} from "@/components/auth/VerificationCodeView";

let mockLanguage = "en";
let mockIsRTL = false;
let mockViewportWidth = 390;

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: (): {
    readonly width: number;
    readonly height: number;
    readonly scale: number;
    readonly fontScale: number;
  } => ({
    width: mockViewportWidth,
    height: 844,
    scale: 1,
    fontScale: 1,
  }),
}));

jest.mock("@expo/vector-icons", () => {
  const ReactMod = jest.requireActual<typeof import("react")>("react");
  const RN = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Ionicons: ({ name }: { readonly name: string }): React.ReactElement =>
      ReactMod.createElement(
        RN.Text,
        { testID: `verification-icon-${name}` },
        name
      ),
  };
});

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): {
    isRTL: boolean;
    language: string;
    fontFamily: {
      regular: string;
      medium: string;
      semiBold: string;
      bold: string;
    };
  } => ({
    isRTL: mockIsRTL,
    language: mockLanguage,
    fontFamily: {
      regular: "Inter_400Regular",
      medium: "Inter_500Medium",
      semiBold: "Inter_600SemiBold",
      bold: "Inter_700Bold",
    },
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    t: (key: string, options?: Record<string, unknown>) => string;
  } => ({
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

function renderCodeView(
  overrides: Partial<React.ComponentProps<typeof VerificationCodeView>> = {}
): ReturnType<typeof render> {
  return render(
    <VerificationCodeView
      email="mohamed@example.com"
      code=""
      verificationError={null}
      verificationExpiresAtMs={Date.now() + 10 * 60_000}
      resendAvailableAtMs={null}
      resendLimitUntilMs={null}
      isVerifying={false}
      isResending={false}
      onCodeChange={jest.fn()}
      onResend={jest.fn()}
      onBack={jest.fn()}
      {...overrides}
    />
  );
}

describe("VerificationCodeView", () => {
  beforeEach(() => {
    mockLanguage = "en";
    mockIsRTL = false;
    mockViewportWidth = 390;
  });

  it("keeps canonical OTP digits Western for both English and Arabic display", () => {
    expect(formatVerificationDigit("1", "ar")).toBe("1");
    expect(formatVerificationDigit("6", "ar")).toBe("6");
    expect(formatVerificationDigit("1", "en")).toBe("1");
    expect(formatVerificationDigit(undefined, "ar")).toBe("");
  });

  it("renders Arabic canonical 123456 as Western digits in LTR cell order", () => {
    mockLanguage = "ar";
    mockIsRTL = true;
    renderCodeView({ code: "123456" });

    for (const [index, digit] of ["1", "2", "3", "4", "5", "6"].entries()) {
      expect(
        within(
          screen.getByTestId(`verification-code-cell-${index}`, {
            includeHiddenElements: true,
          })
        ).getByText(digit, { includeHiddenElements: true })
      ).toBeOnTheScreen();
    }
  });

  it("uses a left-pointing Back icon in Arabic", () => {
    mockLanguage = "ar";
    mockIsRTL = true;
    renderCodeView();

    expect(
      screen.getByTestId("verification-icon-arrow-back")
    ).toBeOnTheScreen();
    expect(
      screen.queryByTestId("verification-icon-arrow-forward")
    ).not.toBeOnTheScreen();
  });

  it("keeps code entry mounted and disables OTP, Resend, and Back while verifying", () => {
    renderCodeView({ isVerifying: true });

    expect(screen.getByTestId("verification-code-view")).toBeOnTheScreen();
    expect(screen.getByTestId("verification-code-input")).toHaveProp(
      "editable",
      false
    );
    expect(screen.getByRole("button", { name: "resend_email" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "back_to_sign_in" })
    ).toBeDisabled();
    expect(
      screen.getByTestId("verification-code-busy-feedback")
    ).toBeOnTheScreen();
    expect(
      screen.queryByTestId("verification-processing-indicator")
    ).not.toBeOnTheScreen();
  });

  it("uses six square 48pt cells at the approved 390pt baseline", () => {
    renderCodeView({ code: "123456" });

    for (let index = 0; index < 6; index += 1) {
      expect(
        screen.getByTestId(`verification-code-cell-${index}`, {
          includeHiddenElements: true,
        })
      ).toHaveStyle({
        width: 48,
        height: 48,
      });
    }
  });

  it("shrinks six square cells to the measured compact available width", () => {
    mockViewportWidth = 320;
    renderCodeView({ code: "123456" });
    const expectedCellSize = (320 - 2 * 16 - 5 * 6) / 6;

    for (let index = 0; index < 6; index += 1) {
      expect(
        screen.getByTestId(`verification-code-cell-${index}`, {
          includeHiddenElements: true,
        })
      ).toHaveStyle({
        width: expectedCellSize,
        height: expectedCellSize,
      });
    }
  });

  it("uses registered red palette classes for invalid-code errors in light and dark mode", () => {
    renderCodeView({ verificationError: "verification_code_invalid" });

    expect(screen.getByTestId("verification-code-error")).toHaveProp(
      "className",
      expect.stringContaining("text-red-600")
    );
    expect(screen.getByTestId("verification-code-error")).toHaveProp(
      "className",
      expect.stringContaining("dark:text-red-500")
    );
  });

  it("renders the cooldown Resend action as the approved filled 52pt rounded disabled control", () => {
    renderCodeView({
      resendAvailableAtMs: Date.now() + 2 * 60_000,
    });

    const resend = screen.getByRole("button", { name: /Resend in/ });
    expect(resend).toBeDisabled();
    expect(resend).toHaveProp(
      "className",
      expect.stringContaining("h-[52px]")
    );
    expect(resend).toHaveProp(
      "className",
      expect.stringContaining("rounded-[14px]")
    );
    expect(resend).toHaveProp(
      "className",
      expect.stringContaining("bg-slate-100")
    );
    expect(resend).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-slate-800")
    );
    expect(resend).toHaveStyle({ opacity: 0.6 });
  });

  it("uses generic ten-minute expiry copy when the device has no known send timestamp", () => {
    renderCodeView({ verificationExpiresAtMs: null });

    expect(
      screen.getByText("verification_code_expires_generic")
    ).toBeOnTheScreen();
  });

  it("locks code editing while a resend request is in flight", () => {
    renderCodeView({ isResending: true });

    expect(screen.getByTestId("verification-code-input")).toHaveProp(
      "editable",
      false
    );
  });

  it("renders six visual cells backed by one paste-capable OTP input", () => {
    const onCodeChange = jest.fn();

    renderCodeView({
      code: "123",
      resendAvailableAtMs: Date.now() + 2 * 60_000,
      onCodeChange,
    });

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
