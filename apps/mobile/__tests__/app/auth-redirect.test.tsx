import { act, render, screen } from "@testing-library/react-native";
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
  useLocalSearchParams: (): Record<string, string | string[]> => ({}),
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: (): MockAuthState => mockAuthState,
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { isDark: boolean } => ({ isDark: false }),
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

jest.mock("@/components/auth/VerificationPendingView", () => ({
  VerificationPendingView: (): React.ReactElement => {
    const ReactMod = require("react") as typeof React;
    const RN = require("react-native") as typeof import("react-native");
    return ReactMod.createElement(RN.View, {
      testID: "verification-pending",
    });
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

jest.mock("@/services/supabase", () => ({
  resendVerificationEmail: jest.fn(),
}));

const AuthModule = require("../../app/auth") as {
  default: () => React.JSX.Element;
  getAuthBottomPadding: (
    bottomInset: number,
    isCompactViewport: boolean
  ) => number;
  shouldEnableAuthScroll: (fontScale: number) => boolean;
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

  it("enables recovery scrolling only at the shared enlarged-text threshold", () => {
    expect(shouldEnableAuthScroll(1)).toBe(false);
    expect(shouldEnableAuthScroll(1.34)).toBe(false);
    expect(shouldEnableAuthScroll(1.35)).toBe(true);

    mockFontScale = 1.35;
    render(<AuthScreen />);
    expect(screen.getByTestId("auth-scroll")).toHaveProp("scrollEnabled", true);
  });
});

describe("AuthCallbackScreen verification lifecycle", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockCompleteAuthSessionFromUrl.mockReset();
    mockCallbackUrl =
      "monyvi://auth-callback#access_token=verification-access&refresh_token=verification-refresh&type=signup";
    mockIsNavigationReady = true;
    mockAuthState = {
      isAuthenticated: false,
      isLoading: false,
    };
    mockCompleteAuthSessionFromUrl.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("completes a cold-start verification callback before authenticated routing", async () => {
    const { rerender } = render(<AuthCallbackScreen />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockCompleteAuthSessionFromUrl).toHaveBeenCalledWith(
      mockCallbackUrl
    );
    expect(mockReplace).not.toHaveBeenCalledWith("/auth");
    expect(mockReplace).not.toHaveBeenCalledWith("/");

    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
    };
    rerender(<AuthCallbackScreen />);

    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("still processes the callback when the app is already authenticated on warm start", async () => {
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
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});

describe("AuthCallbackScreen failed verification recovery", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReplace.mockClear();
    mockCompleteAuthSessionFromUrl.mockReset();
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

  it("routes a failed callback to auth recovery even when a previous auth state exists", async () => {
    render(<AuthCallbackScreen />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockCompleteAuthSessionFromUrl).toHaveBeenCalledWith(
      mockCallbackUrl
    );
    expect(mockReplace).toHaveBeenCalledWith("/auth");
    expect(mockReplace).not.toHaveBeenCalledWith("/");
  });

  it("routes an unexpected callback rejection to auth recovery", async () => {
    mockCompleteAuthSessionFromUrl.mockRejectedValue(
      new Error("unexpected callback failure")
    );

    render(<AuthCallbackScreen />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockReplace).toHaveBeenCalledWith("/auth");
    expect(mockReplace).not.toHaveBeenCalledWith("/");
  });
});
