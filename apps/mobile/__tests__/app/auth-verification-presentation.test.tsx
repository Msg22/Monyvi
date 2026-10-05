import { render, screen } from "@testing-library/react-native";
import React, { Children } from "react";

let mockViewportWidth = 390;
let mockViewportHeight = 844;
let mockFontScale = 1;
let mockIsRTL = false;
let mockSafeAreaInsets = { top: 24, right: 0, bottom: 34, left: 0 };
let mockController = createController();

function createController(
  overrides: Partial<ReturnType<typeof createControllerBase>> = {}
): ReturnType<typeof createControllerBase> {
  return { ...createControllerBase(), ...overrides };
}

function createControllerBase() {
  return {
    screenState: "verificationCode" as
      | "form"
      | "verificationCode"
      | "verificationSuccess"
      | "resetSent",
    pendingEmail: "mohamed@example.com",
    pendingAction: null as
      | "email"
      | "oauth"
      | "passwordReset"
      | "verificationCode"
      | "verificationResend"
      | null,
    emailError: null as string | null,
    networkError: null as string | null,
    verificationCode: "123456",
    verificationError: null as string | null,
    verificationExpiresAtMs: Date.now() + 10 * 60_000,
    resendAvailableAtMs: Date.now() + 2 * 60_000,
    resendLimitUntilMs: null as number | null,
    handleOAuth: jest.fn(() => Promise.resolve()),
    handleEmailSubmit: jest.fn(() => Promise.resolve()),
    handleForgotPassword: jest.fn(() => Promise.resolve()),
    handleVerificationCodeChange: jest.fn(),
    handleResendVerification: jest.fn(() => Promise.resolve()),
    handleContinueAfterVerification: jest.fn(),
    handleBackToForm: jest.fn(),
    clearEmailError: jest.fn(),
    clearNetworkError: jest.fn(),
  };
}

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({
    width: mockViewportWidth,
    height: mockViewportHeight,
    scale: 1,
    fontScale: mockFontScale,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockSafeAreaInsets,
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => ({
    isRTL: mockIsRTL,
    language: mockIsRTL ? "ar" : "en",
    fontFamily: {
      regular: "Inter_400Regular",
      medium: "Inter_500Medium",
      semiBold: "Inter_600SemiBold",
      bold: "Inter_700Bold",
    },
  }),
}));

jest.mock("@/hooks/useKeyboardVisibility", () => ({
  useKeyboardVisibility: () => false,
}));

jest.mock("@/hooks/useFormScroll", () => ({
  useFormScroll: () => ({
    scrollViewRef: { current: null },
    getFieldRef: jest.fn(),
    onScroll: jest.fn(),
    scrollToField: jest.fn(),
  }),
}));

jest.mock("@/hooks/useAuthScreenController", () => ({
  useAuthScreenController: () => mockController,
}));

jest.mock("@/components/auth/FormView", () => ({
  FormView: () => {
    const ReactMod = jest.requireActual<typeof import("react")>("react");
    const RN = jest.requireActual<typeof import("react-native")>("react-native");
    return ReactMod.createElement(RN.View, { testID: "auth-form" });
  },
}));

jest.mock("@/components/auth/VerificationCodeView", () => ({
  VerificationCodeView: () => {
    const ReactMod = jest.requireActual<typeof import("react")>("react");
    const RN = jest.requireActual<typeof import("react-native")>("react-native");
    return ReactMod.createElement(RN.View, { testID: "verification-code" });
  },
}));

jest.mock("@/components/auth/VerificationProcessingView", () => ({
  VerificationProcessingView: () => {
    const ReactMod = jest.requireActual<typeof import("react")>("react");
    const RN = jest.requireActual<typeof import("react-native")>("react-native");
    return ReactMod.createElement(RN.View, {
      testID: "verification-processing-view",
    });
  },
}));

jest.mock("@/components/auth/VerificationSuccessView", () => ({
  VerificationSuccessView: () => {
    const ReactMod = jest.requireActual<typeof import("react")>("react");
    const RN = jest.requireActual<typeof import("react-native")>("react-native");
    return ReactMod.createElement(RN.View, { testID: "verification-success" });
  },
}));

jest.mock("@/components/auth/ResetSentView", () => ({
  ResetSentView: () => {
    const ReactMod = jest.requireActual<typeof import("react")>("react");
    const RN = jest.requireActual<typeof import("react-native")>("react-native");
    return ReactMod.createElement(RN.View, { testID: "reset-sent" });
  },
}));

jest.mock("@/components/onboarding/LanguageSwitcherPill", () => ({
  LanguageSwitcherPill: () => {
    const ReactMod = jest.requireActual<typeof import("react")>("react");
    const RN = jest.requireActual<typeof import("react-native")>("react-native");
    return ReactMod.createElement(RN.View, { testID: "language-switcher" });
  },
}));

jest.mock("@/components/ui/MonyviLogo", () => ({
  MonyviLogo: () => {
    const ReactMod = jest.requireActual<typeof import("react")>("react");
    const RN = jest.requireActual<typeof import("react-native")>("react-native");
    return ReactMod.createElement(RN.View, { testID: "monyvi-logo" });
  },
}));

const AuthScreen = jest.requireActual<typeof import("../../app/auth")>(
  "../../app/auth"
).default;

function headerChildTestIds(): string[] {
  const header = screen.getByTestId("auth-topbar");
  const children = Children.toArray(header.props.children) as React.ReactElement[];
  return children.map((child) => String(child.props.testID));
}

describe("auth verification presentation shell", () => {
  beforeEach(() => {
    mockViewportWidth = 390;
    mockViewportHeight = 844;
    mockFontScale = 1;
    mockIsRTL = false;
    mockSafeAreaInsets = { top: 24, right: 0, bottom: 34, left: 0 };
    mockController = createController();
  });

  it("keeps VerificationCodeView mounted during a pending verification request", () => {
    mockController = createController({
      screenState: "verificationCode",
      pendingAction: "verificationCode",
    });

    render(<AuthScreen />);

    expect(screen.getByTestId("verification-code")).toBeOnTheScreen();
    expect(
      screen.queryByTestId("verification-processing-view")
    ).not.toBeOnTheScreen();
  });

  it("uses approved 390pt shell padding, 40pt header, and bottom inset plus 16 once", () => {
    render(<AuthScreen />);

    expect(screen.getByTestId("auth-scroll")).toHaveProp(
      "contentContainerStyle",
      expect.objectContaining({
        paddingHorizontal: 24,
        paddingBottom: 50,
      })
    );
    expect(screen.getByTestId("auth-topbar")).toHaveStyle({
      minHeight: 40,
    });
  });

  it("uses 16pt horizontal padding on compact phones", () => {
    mockViewportWidth = 320;
    render(<AuthScreen />);

    expect(screen.getByTestId("auth-scroll")).toHaveProp(
      "contentContainerStyle",
      expect.objectContaining({
        paddingHorizontal: 16,
      })
    );
  });

  it("centers both entry and success in one 400pt verification shell on tablets", () => {
    mockViewportWidth = 768;
    mockViewportHeight = 1024;
    const first = render(<AuthScreen />);

    expect(screen.getByTestId("auth-verification-content")).toHaveStyle({
      width: "100%",
      maxWidth: 400,
      alignSelf: "center",
    });
    expect(screen.getByTestId("verification-code")).toBeOnTheScreen();

    first.unmount();
    mockController = createController({ screenState: "verificationSuccess" });
    render(<AuthScreen />);

    expect(screen.getByTestId("auth-verification-content")).toHaveStyle({
      width: "100%",
      maxWidth: 400,
      alignSelf: "center",
    });
    expect(screen.getByTestId("verification-success")).toBeOnTheScreen();
  });

  it("mirrors header ordering for Arabic while preserving English ordering", () => {
    const english = render(<AuthScreen />);
    expect(headerChildTestIds()).toEqual([
      "auth-language-slot",
      "auth-logo-slot",
    ]);

    english.unmount();
    mockIsRTL = true;
    render(<AuthScreen />);

    expect(headerChildTestIds()).toEqual([
      "auth-logo-slot",
      "auth-language-slot",
    ]);
  });
});
