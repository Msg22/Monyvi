import { render, screen } from "@testing-library/react-native";
import React from "react";
import type { VerificationCodeViewProps } from "@/components/auth/VerificationCodeView";

const mockVerificationCodeProps = jest.fn<void, [VerificationCodeViewProps]>();

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

function createControllerBase(): {
  screenState:
    | "form"
    | "verificationCode"
    | "verificationSuccess"
    | "resetSent";
  pendingEmail: string;
  pendingAction:
    | "email"
    | "oauth"
    | "passwordReset"
    | "verificationCode"
    | "verificationResend"
    | null;
  emailError: string | null;
  networkError: string | null;
  verificationCode: string;
  verificationError: string | null;
  verificationExpiresAtMs: number | null;
  resendAvailableAtMs: number | null;
  resendLimitUntilMs: number | null;
  isResendLimitReached: boolean;
  handleOAuth: jest.Mock<Promise<void>, []>;
  handleEmailSubmit: jest.Mock<Promise<void>, []>;
  handleForgotPassword: jest.Mock<Promise<void>, []>;
  handleVerificationCodeChange: jest.Mock<void, []>;
  handleResendVerification: jest.Mock<Promise<void>, []>;
  handleContinueAfterVerification: jest.Mock<void, []>;
  handleBackToForm: jest.Mock<void, []>;
  clearEmailError: jest.Mock<void, []>;
  clearNetworkError: jest.Mock<void, []>;
} {
  return {
    screenState: "verificationCode",
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
    isResendLimitReached: false,
    handleOAuth: jest.fn<Promise<void>, []>(() => Promise.resolve()),
    handleEmailSubmit: jest.fn<Promise<void>, []>(() => Promise.resolve()),
    handleForgotPassword: jest.fn<Promise<void>, []>(() => Promise.resolve()),
    handleVerificationCodeChange: jest.fn<void, []>(),
    handleResendVerification: jest.fn<Promise<void>, []>(() =>
      Promise.resolve()
    ),
    handleContinueAfterVerification: jest.fn<void, []>(),
    handleBackToForm: jest.fn<void, []>(),
    clearEmailError: jest.fn<void, []>(),
    clearNetworkError: jest.fn<void, []>(),
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
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactMod.createElement(RN.View, { testID: "auth-form" });
  },
}));

jest.mock("@/components/auth/VerificationCodeView", () => ({
  VerificationCodeView: (props: VerificationCodeViewProps) => {
    mockVerificationCodeProps(props);
    const ReactMod = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactMod.createElement(RN.View, { testID: "verification-code" });
  },
}));

jest.mock("@/components/auth/VerificationSuccessView", () => ({
  VerificationSuccessView: () => {
    const ReactMod = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactMod.createElement(RN.View, { testID: "verification-success" });
  },
}));

jest.mock("@/components/auth/ResetSentView", () => ({
  ResetSentView: () => {
    const ReactMod = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactMod.createElement(RN.View, { testID: "reset-sent" });
  },
}));

jest.mock("@/components/onboarding/LanguageSwitcherPill", () => ({
  LanguageSwitcherPill: () => {
    const ReactMod = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactMod.createElement(RN.View, { testID: "language-switcher" });
  },
}));

jest.mock("@/components/ui/MonyviLogo", () => ({
  MonyviLogo: () => {
    const ReactMod = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactMod.createElement(RN.View, { testID: "monyvi-logo" });
  },
}));

const AuthScreen =
  jest.requireActual<typeof import("../../app/auth")>("../../app/auth").default;

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function readHeaderChildTestIds(value: unknown): readonly [string, string] {
  if (typeof value !== "object" || value === null || !("props" in value)) {
    throw new Error("Expected a rendered header with props");
  }

  const props: unknown = value.props;
  if (typeof props !== "object" || props === null || !("children" in props)) {
    throw new Error("Expected rendered header props with children");
  }

  const children: unknown = props.children;
  if (!isUnknownArray(children) || children.length !== 2) {
    throw new Error("Expected exactly two direct header children");
  }

  const firstChild: unknown = children[0];
  const secondChild: unknown = children[1];
  if (
    !React.isValidElement<{ readonly testID?: unknown }>(firstChild) ||
    !React.isValidElement<{ readonly testID?: unknown }>(secondChild)
  ) {
    throw new Error(
      "Expected both direct header children to be React elements"
    );
  }

  const firstTestID: unknown = firstChild.props.testID;
  const secondTestID: unknown = secondChild.props.testID;
  if (typeof firstTestID !== "string" || typeof secondTestID !== "string") {
    throw new Error("Expected both direct header children to have testIDs");
  }

  return [firstTestID, secondTestID];
}

function expectLanguageThenLogoHeader(): void {
  const header: unknown = screen.getByTestId("auth-topbar");

  expect(readHeaderChildTestIds(header)).toEqual([
    "auth-language-slot",
    "auth-logo-slot",
  ]);
}

describe("auth verification presentation shell", () => {
  beforeEach(() => {
    mockViewportWidth = 390;
    mockViewportHeight = 844;
    mockFontScale = 1;
    mockIsRTL = false;
    mockSafeAreaInsets = { top: 24, right: 0, bottom: 34, left: 0 };
    mockController = createController();
    mockVerificationCodeProps.mockClear();
  });

  it("passes an explicit exhausted limit independently from its optional expiry", () => {
    mockController = createController({
      isResendLimitReached: true,
      resendLimitUntilMs: null,
    });
    render(<AuthScreen />);
    expect(mockVerificationCodeProps).toHaveBeenCalledWith(
      expect.objectContaining({
        isResendLimitReached: true,
        resendLimitUntilMs: null,
      })
    );
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
    // NativeWind class contract is authoritative here; this Jest harness does
    // not materialize min-h-10 into native style pixels.
    expect(screen.getByTestId("auth-topbar")).toHaveProp(
      "className",
      expect.stringContaining("min-h-10")
    );
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

    expect(screen.getByTestId("auth-verification-content")).toHaveProp(
      "className",
      expect.stringContaining("w-full max-w-[400px] self-center")
    );
    expect(screen.getByTestId("verification-code")).toBeOnTheScreen();

    first.unmount();
    mockController = createController({ screenState: "verificationSuccess" });
    render(<AuthScreen />);

    expect(screen.getByTestId("auth-verification-content")).toHaveProp(
      "className",
      expect.stringContaining("w-full max-w-[400px] self-center")
    );
    expect(screen.getByTestId("verification-success")).toBeOnTheScreen();
  });

  it("keeps stable language-then-logo JSX order and lets native RTL mirror it", () => {
    const english = render(<AuthScreen />);
    expectLanguageThenLogoHeader();

    english.unmount();
    mockIsRTL = true;
    render(<AuthScreen />);

    // React Native/Yoga mirrors flex-row under forceRTL; reversing JSX would
    // double-mirror the approved Arabic header.
    expectLanguageThenLogoHeader();
  });
});
