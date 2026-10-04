import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";

const COPY: Readonly<Record<string, string>> = {
  email_address: "البريد الإلكتروني",
  email_address_placeholder: "you@example.com",
  password: "كلمة المرور",
  password_placeholder_label: "أدخل كلمة المرور",
  forgot_password: "نسيت كلمة المرور؟",
  validation_email_required: "يرجى إدخال بريدك الإلكتروني.",
  validation_email_invalid: "يرجى إدخال بريد إلكتروني صحيح.",
  validation_password_required: "يرجى إدخال كلمة المرور.",
  validation_password_min: "يجب أن تكون كلمة المرور 6 أحرف على الأقل.",
  sign_in: "تسجيل الدخول",
  create_account: "إنشاء حساب",
  signing_in: "جارٍ تسجيل الدخول…",
  creating_account: "جارٍ إنشاء الحساب…",
  show_password: "إظهار كلمة المرور",
  hide_password: "إخفاء كلمة المرور",
};

jest.mock("react-i18next", () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => COPY[key] ?? key,
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
    isRTL: true,
    fontFamily: {
      regular: "NotoSansArabic_400Regular",
      medium: "NotoSansArabic_500Medium",
      semiBold: "NotoSansArabic_600SemiBold",
      bold: "NotoSansArabic_700Bold",
    },
  }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { isDark: boolean } => ({ isDark: false }),
}));

const mockSubmit = jest.fn<
  Promise<void>,
  [string, string, "signIn" | "signUp"]
>();
const mockForgot = jest.fn<Promise<void>, [string]>();

describe("EmailPasswordForm RTL", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmit.mockResolvedValue(undefined);
    mockForgot.mockResolvedValue(undefined);
  });

  it("keeps email LTR while password starts from RTL side", () => {
    render(
      <EmailPasswordForm
        mode="signIn"
        pendingAction={null}
        errorMessage={null}
        onSubmit={mockSubmit}
        onForgotPassword={mockForgot}
      />
    );

    expect(screen.getByLabelText("البريد الإلكتروني")).toHaveStyle({
      writingDirection: "ltr",
      textAlign: "left",
    });
    expect(screen.getByLabelText("كلمة المرور")).toHaveStyle({
      writingDirection: "rtl",
      textAlign: "right",
      paddingStart: 43,
      paddingEnd: 48,
    });
  });

  it("preserves exact mixed-script password while toggling visibility", () => {
    render(
      <EmailPasswordForm
        mode="signIn"
        pendingAction={null}
        errorMessage={null}
        onSubmit={mockSubmit}
        onForgotPassword={mockForgot}
      />
    );
    const exactValue = "سرّي-ABC-١٢٣-$x";
    fireEvent.changeText(screen.getByLabelText("كلمة المرور"), exactValue);

    fireEvent.press(screen.getByRole("button", { name: "إظهار كلمة المرور" }));

    expect(screen.getByLabelText("كلمة المرور")).toHaveDisplayValue(exactValue);
    expect(screen.getByLabelText("كلمة المرور")).toHaveProp(
      "secureTextEntry",
      false
    );
    expect(
      screen.getByRole("button", { name: "إخفاء كلمة المرور" })
    ).toHaveStyle({ minWidth: 44, minHeight: 44 });
  });
});
