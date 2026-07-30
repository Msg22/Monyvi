import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { View } from "react-native";

import { FormView } from "@/components/auth/FormView";
import type { OAuthProvider } from "@/services/supabase";

const COPY: Readonly<Record<string, string>> = {
  welcome_title: "Welcome to Monyvi",
  welcome_headline: "Your money, understood.",
  welcome_support: "Track spending, savings, and every move in between.",
  sign_in: "Sign in",
  sign_up: "Create account",
  create_account: "Create account",
  continue_with_google: "Continue with Google",
  or_continue_with_email: "or continue with email",
  email_address: "Email",
  email_address_placeholder: "you@example.com",
  password: "Password",
  password_placeholder_label: "Enter your password",
  forgot_password: "Forgot password?",
  validation_email_required: "Please enter your email address.",
  validation_email_invalid: "Please enter a valid email address.",
  validation_password_required: "Please enter your password.",
  validation_password_min: "Password must be at least 6 characters.",
  signing_in: "Signing in…",
  creating_account: "Creating account…",
  opening_google: "Opening Google…",
  private_by_design: "Private by design.",
  privacy: "Privacy",
  terms: "Terms",
  show_password: "Show password",
  hide_password: "Hide password",
};

let mockIsRTL = false;
jest.mock("react-i18next", () => ({
  useTranslation: (): {
    t: (key: string, values?: { min?: number }) => string;
  } => ({
    t: (key: string, values?: { min?: number }): string =>
      COPY[key] ?? (values?.min ? `${key}:${values.min}` : key),
  }),
}));

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
    isRTL: mockIsRTL,
    fontFamily: {
      regular: "Inter_400Regular",
      medium: "Inter_500Medium",
      semiBold: "Inter_600SemiBold",
      bold: "Inter_700Bold",
    },
  }),
}));

const mockOAuth = jest.fn<Promise<void>, [OAuthProvider]>();
const mockEmailSubmit = jest.fn<
  Promise<void>,
  [string, string, "signIn" | "signUp"]
>();
const mockForgotPassword = jest.fn<Promise<void>, [string]>();
const mockClearError = jest.fn();
const mockClearNetworkError = jest.fn();
const mockPrivacy = jest.fn();
const mockTerms = jest.fn();

function renderForm(
  overrides: Partial<React.ComponentProps<typeof FormView>> = {}
): void {
  render(
    <FormView
      isKeyboardVisible={false}
      isCompactViewport={false}
      pendingAction={null}
      emailError={null}
      networkError={null}
      onOAuth={mockOAuth}
      onEmailSubmit={mockEmailSubmit}
      onForgotPassword={mockForgotPassword}
      onClearError={mockClearError}
      onClearNetworkError={mockClearNetworkError}
      onPrivacyPress={mockPrivacy}
      onTermsPress={mockTerms}
      {...overrides}
    />
  );
}

describe("FormView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsRTL = false;
    mockOAuth.mockResolvedValue(undefined);
    mockEmailSubmit.mockResolvedValue(undefined);
    mockForgotPassword.mockResolvedValue(undefined);
  });

  it("renders approved sign-in composition by default", () => {
    renderForm();

    expect(
      screen.getByRole("header", { name: "Your money, understood." })
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId("financial-flow-ltr", { includeHiddenElements: true })
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Continue with Google" })
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Sign in", selected: true })
    ).toBeOnTheScreen();
    expect(screen.getByTestId("auth-mode-sign-in")).toBeOnTheScreen();
    expect(screen.getByTestId("auth-mode-sign-up")).toBeOnTheScreen();
    expect(screen.getByTestId("auth-google-button")).toBeOnTheScreen();
    expect(screen.getByTestId("auth-email-input")).toBeOnTheScreen();
    expect(screen.getByTestId("auth-password-input")).toBeOnTheScreen();
    expect(screen.getByTestId("auth-submit-button")).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Privacy" })).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Terms" })).toBeOnTheScreen();
  });

  it("matches the approved standard hero and legal-footer layout", () => {
    renderForm({ isCompactViewport: false });

    expect(screen.getByTestId("auth-form-root")).toHaveProp(
      "className",
      expect.stringContaining("flex-1")
    );
    expect(screen.getByTestId("auth-hero")).toHaveStyle({
      minHeight: 300,
      paddingTop: 42,
      paddingBottom: 12,
    });
    expect(screen.getByTestId("auth-hero-copy")).toHaveStyle({ width: 225 });
    expect(screen.getByTestId("auth-illustration-container")).toHaveStyle({
      top: 35,
      end: -8,
    });
    expect(
      screen.getByTestId("financial-flow-ltr", { includeHiddenElements: true })
    ).toHaveProp("width", 205);
    expect(
      screen.getByTestId("financial-flow-ltr", { includeHiddenElements: true })
    ).toHaveProp("height", 245);
    expect(screen.getByTestId("auth-mode-switch")).toHaveStyle({
      height: 46,
      marginTop: 8,
      marginBottom: 22,
      borderRadius: 14,
      padding: 3,
    });
    expect(screen.getByTestId("auth-google-button")).toHaveStyle({
      height: 49,
      borderRadius: 14,
    });
    expect(screen.getByTestId("auth-email-divider")).toHaveStyle({
      height: 46,
    });
    expect(screen.getByTestId("auth-email-input")).toHaveStyle({
      height: 52,
      borderRadius: 14,
    });
    expect(screen.getByTestId("auth-submit-button")).toHaveStyle({
      height: 51,
      marginTop: 16,
      borderRadius: 14,
    });
    expect(screen.getByTestId("auth-forgot-password")).toHaveStyle({
      marginTop: 11,
    });
    expect(screen.getByTestId("auth-privacy-footer")).toHaveStyle({
      marginTop: 34,
      paddingTop: 14,
      gap: 9,
    });
    expect(screen.getByTestId("auth-trust-row")).toBeOnTheScreen();
    expect(screen.getByTestId("auth-legal-row")).toBeOnTheScreen();
  });

  it("uses the approved compact hero dimensions on small phones", () => {
    renderForm({ isCompactViewport: true });

    expect(screen.getByTestId("auth-hero")).toHaveStyle({
      minHeight: 191,
      paddingTop: 0,
      paddingBottom: 0,
    });
    expect(screen.getByTestId("auth-hero-copy")).toHaveStyle({ width: 210 });
    expect(screen.getByTestId("auth-illustration-container")).toHaveStyle({
      top: 0,
      end: -8,
    });
    expect(
      screen.getByTestId("financial-flow-ltr", { includeHiddenElements: true })
    ).toHaveProp("width", 160);
    expect(
      screen.getByTestId("financial-flow-ltr", { includeHiddenElements: true })
    ).toHaveProp("height", 191);
    expect(screen.getByTestId("auth-email-divider")).toHaveStyle({
      height: 31,
    });
    expect(screen.getByTestId("auth-privacy-footer")).toHaveStyle({
      marginTop: 19,
    });
  });

  it("uses the approved RTL illustration geometry and offset", () => {
    mockIsRTL = true;
    renderForm({ isCompactViewport: false });

    expect(
      screen.getByTestId("financial-flow-rtl", { includeHiddenElements: true })
    ).toBeOnTheScreen();
    expect(screen.getByTestId("auth-illustration-container")).toHaveStyle({
      top: 35,
      end: -36,
    });
  });

  it("anchors compact Arabic copy right and keeps geometry away from the edge", () => {
    mockIsRTL = true;
    renderForm({ isCompactViewport: true });

    expect(screen.getByTestId("auth-hero-copy")).toHaveStyle({
      alignSelf: "flex-start",
    });
    expect(screen.getByTestId("auth-illustration-container")).toHaveStyle({
      end: -8,
    });
    expect(screen.getByRole("header")).toHaveStyle({ textAlign: "right" });
  });

  it("switches to create-account mode while preserving entered values", () => {
    renderForm({ isCompactViewport: true });
    fireEvent.changeText(screen.getByLabelText("Email"), "user@example.com");
    fireEvent.changeText(screen.getByLabelText("Password"), "secret");

    fireEvent.press(screen.getByRole("button", { name: "Create account" }));

    expect(
      screen.getByRole("button", { name: "Create account", selected: true })
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Email")).toHaveDisplayValue(
      "user@example.com"
    );
    expect(screen.getByLabelText("Password")).toHaveDisplayValue("secret");
    expect(
      screen.queryByRole("link", { name: "Forgot password?" })
    ).not.toBeOnTheScreen();
    expect(screen.getByTestId("auth-submit-button")).toHaveStyle({
      marginTop: 16,
    });
    expect(screen.getByTestId("auth-privacy-footer")).toHaveStyle({
      marginTop: 20,
    });
    expect(screen.getByTestId("auth-email-divider")).toHaveStyle({
      height: 46,
    });
  });

  it("validates fields before delegating submission", () => {
    renderForm();

    fireEvent.press(screen.getAllByRole("button", { name: "Sign in" })[1]);

    expect(
      screen.getByRole("alert", {
        name: "Please enter your email address.",
      })
    ).toBeOnTheScreen();
    expect(mockEmailSubmit).not.toHaveBeenCalled();
  });

  it("submits normalized email and exact password", () => {
    renderForm();
    fireEvent.changeText(screen.getByLabelText("Email"), " user@example.com ");
    fireEvent.changeText(screen.getByLabelText("Password"), "سري-123-ABC");

    fireEvent.press(screen.getAllByRole("button", { name: "Sign in" })[1]);

    expect(mockEmailSubmit).toHaveBeenCalledWith(
      "user@example.com",
      "سري-123-ABC",
      "signIn"
    );
  });

  it("uses explicit loading labels and disables conflicting actions", () => {
    renderForm({ pendingAction: "email" });

    expect(
      screen.getByRole("button", { name: "Signing in…", disabled: true })
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", {
        name: "Continue with Google",
        disabled: true,
      })
    ).toBeOnTheScreen();
  });

  it("hides decorative and legal content in keyboard compact mode", () => {
    renderForm({ isKeyboardVisible: true });

    expect(screen.queryByTestId("financial-flow-ltr")).not.toBeOnTheScreen();
    expect(
      screen.queryByRole("button", { name: "Continue with Google" })
    ).not.toBeOnTheScreen();
    expect(screen.queryByText("or continue with email")).not.toBeOnTheScreen();
    expect(
      screen.queryByRole("link", { name: "Privacy" })
    ).not.toBeOnTheScreen();
    expect(
      screen.getByRole("header", { name: "Your money, understood." })
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Email")).toBeOnTheScreen();
    expect(screen.getByLabelText("Password")).toBeOnTheScreen();
  });

  it("anchors keyboard scrolling to each focused field group", () => {
    const emailFieldRef = React.createRef<View>();
    const passwordFieldRef = React.createRef<View>();

    renderForm({ emailFieldRef, passwordFieldRef });

    expect(emailFieldRef.current).not.toBeNull();
    expect(passwordFieldRef.current).not.toBeNull();
  });

  it("announces network errors and lets user dismiss them", () => {
    renderForm({ networkError: "Check your connection." });

    expect(
      screen.getByRole("alert", { name: "Check your connection." })
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "dismiss" }));
    expect(mockClearNetworkError).toHaveBeenCalledTimes(1);
  });

  it("opens legal destinations through functional links", () => {
    renderForm();

    fireEvent.press(screen.getByRole("link", { name: "Privacy" }));
    fireEvent.press(screen.getByRole("link", { name: "Terms" }));

    expect(mockPrivacy).toHaveBeenCalledTimes(1);
    expect(mockTerms).toHaveBeenCalledTimes(1);
  });
});
