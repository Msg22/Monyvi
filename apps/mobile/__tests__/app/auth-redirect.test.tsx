import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React, { Children } from "react";

/* eslint-disable @typescript-eslint/no-require-imports */

interface MockAuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface MockNavigationContainerRef {
  isReady: () => boolean;
}

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockCompleteAuthSessionFromUrl = jest.fn();
let mockCallbackUrl: string | null;
let mockIsNavigationReady: boolean;
let mockAuthState: MockAuthState;
let mockSafeAreaInsets: {
  top: number;
  right: number;
  bottom: number;
  left: number;
};
let mockFontScale: number;
let mockLocalSearchParams: Record<string, string | string[]> = {};

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: (): {
    readonly width: number;
    readonly height: number;
    readonly scale: number;
    readonly fontScale: number;
  } => ({ width: 400, height: 900, scale: 1, fontScale: mockFontScale }),
}));

jest.mock("expo-linking", () => ({
  useURL: (): string | null => mockCallbackUrl,
}));

jest.mock("expo-router", () => ({
  useRouter: (): { replace: typeof mockReplace; push: typeof mockPush } => ({
    replace: mockReplace,
    push: mockPush,
  }),
  useNavigationContainerRef: (): MockNavigationContainerRef => ({
    isReady: (): boolean => mockIsNavigationReady,
  }),
  useLocalSearchParams: (): Record<string, string | string[]> =>
    mockLocalSearchParams,
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: (): MockAuthState => mockAuthState,
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): {
    isRTL: boolean;
    fontFamily: {
      regular: string;
      semiBold: string;
      bold: string;
    };
  } => ({
    isRTL: false,
    fontFamily: {
      regular: "Inter_400Regular",
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

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): {
    top: number;
    right: number;
    bottom: number;
    left: number;
  } => mockSafeAreaInsets,
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { showToast: jest.Mock } => ({ showToast: jest.fn() }),
}));

jest.mock("@/components/auth/FormView", () => ({
  FormView: (): React.ReactElement => {
    const ReactMod = require("react") as typeof React;
    const RN = require("react-native") as typeof import("react-native");
    return ReactMod.createElement(RN.View, { testID: "auth-form" });
  },
}));

jest.mock("@/components/onboarding/LanguageSwitcherPill", () => ({
  LanguageSwitcherPill: (): React.ReactElement => {
    const ReactMod = require("react") as typeof React;
    const RN = require("react-native") as typeof import("react-native");
    return ReactMod.createElement(RN.View, { testID: "language-switcher" });
  },
}));

jest.mock("@/components/auth/VerificationCodeView", () => ({
  VerificationCodeView: (): React.ReactElement => {
    const ReactMod = require("react") as typeof React;
    const RN = require("react-native") as typeof import("react-native");
    return ReactMod.createElement(RN.View, {
      testID: "verification-code",
    });
  },
}));

jest.mock("@/components/auth/VerificationSuccessView", () => ({
  VerificationSuccessView: ({
    email,
    onContinue,
  }: {
    readonly email?: string;
    readonly onContinue: () => void;
  }): React.ReactElement => {
    const ReactMod = require("react") as typeof React;
    const RN = require("react-native") as typeof import("react-native");
    return ReactMod.createElement(
      RN.View,
      { testID: "verification-success" },
      ReactMod.createElement(RN.Text, { testID: "verification-success-email" }, email ?? ""),
      ReactMod.createElement(
        RN.Pressable,
        {
          accessibilityRole: "button",
          accessibilityLabel: "continue_to_dashboard",
          onPress: onContinue,
        },
        ReactMod.createElement(RN.Text, null, "continue_to_dashboard")
      )
    );
  },
}));

jest.mock("@/components/auth/ResetSentView", () => ({
  ResetSentView: (): React.ReactElement => {
    const ReactMod = require("react") as typeof React;
    const RN = require("react-native") as typeof import("react-native");
    return ReactMod.createElement(RN.View, { testID: "reset-sent" });
  },
}));

jest.mock("@/services/auth-service", () => ({
  completeAuthSessionFromUrl: (...args: unknown[]): Promise<unknown> =>
    mockCompleteAuthSessionFromUrl(...args) as Promise<unknown>,
  signInWithOAuth: jest.fn(),
  signUpWithEmail: jest.fn(),
  signInWithEmail: jest.fn(),
  requestPasswordReset: jest.fn(),
}));

const AuthModule = require("../../app/auth") as {
  default: () => React.JSX.Element;
  getAuthBottomPadding: (
    bottomInset: number,
    isCompactViewport: boolean
  ) => number;
  shouldEnableAuthScroll: (
    fontScale: number,
    viewportHeight?: number,
    viewportWidth?: number
  ) => boolean;
};
const AuthScreen = AuthModule.default;
const { getAuthBottomPadding } = AuthModule;
const { shouldEnableAuthScroll } = AuthModule;
const AuthCallbackScreen = (
  require("../../app/auth-callback") as {
    default: () => React.JSX.Element;
  }
).default;

describe("AuthScreen redirect", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReplace.mockClear();
    mockCompleteAuthSessionFromUrl.mockReset();
    mockCallbackUrl = null;
    mockIsNavigationReady = false;
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
    };
    mockSafeAreaInsets = { top: 24, right: 0, bottom: 34, left: 0 };
    mockFontScale = 1;
  });

  it("waits for the navigation container ref before redirecting authenticated users", () => {
    render(<AuthScreen />);
    expect(mockReplace).not.toHaveBeenCalled();

    mockIsNavigationReady = true;
    act(() => {
      jest.advanceTimersByTime(50);
    });

    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("keeps approved language-first header ordering", () => {
    render(<AuthScreen />);

    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
    const header = screen.getByTestId("auth-topbar");
    const children = Children.toArray(
      header.props.children
    ) as React.ReactElement[];

    expect(children[0]).toHaveProperty("props.testID", "auth-language-slot");
    expect(children[1]).toHaveProperty("props.testID", "auth-logo-slot");
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
  });

  it("adds top and bottom safe-area insets exactly once", () => {
    render(<AuthScreen />);

    expect(screen.getByTestId("auth-scroll")).toHaveProp(
      "contentContainerStyle",
      expect.objectContaining({
        paddingTop: 30,
        paddingBottom: 56,
      })
    );
  });

  it("preserves the Android bottom inset while tightening compact design padding", () => {
    expect(getAuthBottomPadding(34, false)).toBe(56);
    expect(getAuthBottomPadding(34, true)).toBe(42);
  });

  it("keeps the auth surface fixed without user scrolling or overscroll", () => {
    render(<AuthScreen />);

    expect(screen.getByTestId("auth-scroll")).toHaveProp(
      "scrollEnabled",
      false
    );
    expect(screen.getByTestId("auth-scroll")).toHaveProp("bounces", false);
    expect(screen.getByTestId("auth-scroll")).toHaveProp(
      "overScrollMode",
      "never"
    );
  });

  it("enables recovery scrolling for enlarged text scales, short viewports, and landscape", () => {
    expect(shouldEnableAuthScroll(1)).toBe(false);
    expect(shouldEnableAuthScroll(1.34)).toBe(false);
    expect(shouldEnableAuthScroll(1.35)).toBe(true);
    expect(shouldEnableAuthScroll(1, 800)).toBe(true);
    expect(shouldEnableAuthScroll(1, 850)).toBe(true);
    expect(shouldEnableAuthScroll(1, 900, 1000)).toBe(true);
    expect(shouldEnableAuthScroll(1, 900, 400)).toBe(false);

    mockFontScale = 1.35;
    render(<AuthScreen />);
    expect(screen.getByTestId("auth-scroll")).toHaveProp("scrollEnabled", true);
  });
});

describe("AuthCallbackScreen verification lifecycle", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockCompleteAuthSessionFromUrl.mockReset();
    mockLocalSearchParams = {};
    mockCallbackUrl =
      "monyvi://auth-callback#access_token=verification-access&refresh_token=verification-refresh&type=signup";
    mockIsNavigationReady = true;
    mockAuthState = {
      isAuthenticated: false,
      isLoading: false,
    };
    mockCompleteAuthSessionFromUrl.mockResolvedValue({
      success: true,
      email: "verified@example.com",
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("renders the approved bounded progress UI while processing callback completion", async () => {
    let resolveSession: ((value: { success: boolean }) => void) | undefined;
    mockCompleteAuthSessionFromUrl.mockImplementation(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          resolveSession = resolve;
        })
    );

    render(<AuthCallbackScreen />);

    expect(
      screen.getByTestId("auth-callback-processing-view")
    ).toBeOnTheScreen();

    await act(async () => {
      resolveSession?.({ success: true });
      await Promise.resolve();
    });
  });

  it("bounds the waiting state when the native callback URL never arrives", async () => {
    jest.useFakeTimers();
    mockCallbackUrl = null;

    render(<AuthCallbackScreen />);

    expect(
      screen.getByTestId("auth-callback-processing-view")
    ).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(10_001);
      await Promise.resolve();
    });

    expect(
      screen.getByRole("header", { name: "verification_link_failed_title" })
    ).toBeOnTheScreen();
    expect(
      screen.queryByTestId("auth-callback-processing-view")
    ).not.toBeOnTheScreen();
  });

  it("bounds callback processing and exposes recovery instead of an infinite skeleton", async () => {
    jest.useFakeTimers();
    mockCompleteAuthSessionFromUrl.mockImplementation(
      () => new Promise(() => undefined)
    );

    render(<AuthCallbackScreen />);

    expect(
      screen.getByTestId("auth-callback-processing-view")
    ).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(10_001);
      await Promise.resolve();
    });

    expect(
      screen.getByRole("header", { name: "callback_network_failed_title" })
    ).toBeOnTheScreen();
    expect(
      screen.queryByTestId("auth-callback-processing-view")
    ).not.toBeOnTheScreen();
  });

  it("shows explicit verification success after a signup callback instead of waiting on AuthContext", async () => {
    render(<AuthCallbackScreen />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockCompleteAuthSessionFromUrl).toHaveBeenCalledWith(
      mockCallbackUrl
    );
    expect(screen.getByTestId("verification-success")).toBeOnTheScreen();
    expect(screen.getByTestId("verification-success-email")).toHaveTextContent(
      "verified@example.com"
    );
    expect(mockReplace).not.toHaveBeenCalledWith("/");

    fireEvent.press(
      screen.getByRole("button", { name: "continue_to_dashboard" })
    );
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("does not auto-skip verification success on an already-authenticated warm start", async () => {
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
    };

    render(<AuthCallbackScreen />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockCompleteAuthSessionFromUrl).toHaveBeenCalledWith(
      mockCallbackUrl
    );
    expect(screen.getByTestId("verification-success")).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalledWith("/");
  });
});

describe("AuthCallbackScreen completed non-signup routing", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockCompleteAuthSessionFromUrl.mockReset();
    mockIsNavigationReady = true;
    mockAuthState = {
      isAuthenticated: false,
      isLoading: true,
    };
    mockCompleteAuthSessionFromUrl.mockResolvedValue({ success: true });
  });

  it("routes a validated OAuth callback without waiting indefinitely on AuthContext", async () => {
    mockLocalSearchParams = { provider: "google" };
    mockCallbackUrl =
      "monyvi://auth-callback#access_token=oauth-access&refresh_token=oauth-refresh";

    render(<AuthCallbackScreen />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("routes a validated password-recovery callback to settings without waiting on AuthContext", async () => {
    mockLocalSearchParams = { type: "recovery" };
    mockCallbackUrl =
      "monyvi://auth-callback#access_token=recovery-access&refresh_token=recovery-refresh&type=recovery";

    render(<AuthCallbackScreen />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockReplace).toHaveBeenCalledWith("/settings");
  });
});

describe("AuthCallbackScreen failed verification recovery", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReplace.mockClear();
    mockCompleteAuthSessionFromUrl.mockReset();
    mockLocalSearchParams = {};
    mockCallbackUrl = "monyvi://auth-callback?error=access_denied";
    mockIsNavigationReady = true;
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
    };
    mockCompleteAuthSessionFromUrl.mockResolvedValue({
      success: false,
      error: "Authentication could not be completed. Please try again.",
      errorCode: "provider_error",
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("shows public recovery before leaving a failed warm callback", async () => {
    render(<AuthCallbackScreen />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockCompleteAuthSessionFromUrl).toHaveBeenCalledWith(
      mockCallbackUrl
    );
    expect(
      screen.getByRole("header", { name: "verification_link_failed_title" })
    ).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith("/");

    fireEvent.press(screen.getByRole("button", { name: "back_to_sign_in" }));
    expect(mockReplace).toHaveBeenCalledWith("/auth");
  });

  it("shows password recovery failure copy when the callback is for password reset", async () => {
    mockLocalSearchParams = { type: "recovery" };

    render(<AuthCallbackScreen />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByRole("header", { name: "recovery_link_failed_title" })
    ).toBeOnTheScreen();
    expect(
      screen.getByText("recovery_link_failed_message")
    ).toBeOnTheScreen();
  });

  it("shows connection error copy with a retry action for network failure", async () => {
    mockCompleteAuthSessionFromUrl.mockResolvedValue({
      success: false,
      error: "No internet connection.",
      errorCode: "network",
    });

    render(<AuthCallbackScreen />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByRole("header", { name: "callback_network_failed_title" })
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "retry" })
    ).toBeOnTheScreen();

    fireEvent.press(screen.getByRole("button", { name: "retry" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockCompleteAuthSessionFromUrl).toHaveBeenCalledTimes(2);
  });

  it("shows the same safe recovery for an unexpected callback rejection", async () => {
    mockCompleteAuthSessionFromUrl.mockRejectedValue(
      new Error("unexpected callback failure")
    );

    render(<AuthCallbackScreen />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByText("verification_link_failed_message")
    ).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith("/");
  });
});
