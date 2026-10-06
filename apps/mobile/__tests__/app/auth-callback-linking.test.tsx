import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

interface CallbackSuccess {
  readonly success: true;
  readonly email?: string;
}

interface CallbackFailure {
  readonly success: false;
  readonly error: string;
  readonly errorCode:
    | "invalid_callback"
    | "provider_error"
    | "network"
    | "timeout"
    | "unknown";
}

type CallbackResult = CallbackSuccess | CallbackFailure;

interface UrlEvent {
  readonly url: string;
}

type UrlListener = (event: UrlEvent) => void;

interface MockAuthUser {
  readonly email?: string;
}

let mockExpoLatestUrl: string | null = null;
let mockRnInitialUrl: string | null = null;
let mockLocalSearchParams: Record<string, string | string[]> = {};
let mockAuthUser: MockAuthUser | null = {
  email: "already-authenticated@example.test",
};

const mockReplace = jest.fn<void, [string]>();
const mockCompleteAuthSessionFromUrl = jest.fn<
  Promise<CallbackResult>,
  [string]
>();
const mockCancelAuthSessionCompletion = jest.fn<void, [string]>();
const mockExpoLinkingListeners = new Set<UrlListener>();
const mockRnLinkingListeners = new Set<UrlListener>();

const mockExpoAddListener = jest.fn<
  { remove(): void },
  [eventName: string, listener: UrlListener]
>((eventName, listener) => {
  if (eventName !== "onURLReceived") {
    throw new Error(`Unexpected Expo Linking event: ${eventName}`);
  }

  mockExpoLinkingListeners.add(listener);
  return {
    remove: (): void => {
      mockExpoLinkingListeners.delete(listener);
    },
  };
});

const mockRnAddEventListener = jest.fn<
  { remove(): void },
  [eventName: string, listener: UrlListener]
>((eventName, listener) => {
  if (eventName !== "url") {
    throw new Error(`Unexpected React Native Linking event: ${eventName}`);
  }

  mockRnLinkingListeners.add(listener);
  return {
    remove: (): void => {
      mockRnLinkingListeners.delete(listener);
    },
  };
});

jest.mock("expo-linking/build/ExpoLinking", () => ({
  __esModule: true,
  default: {
    getLinkingURL: (): string | null => mockExpoLatestUrl,
    addListener: mockExpoAddListener,
    clearInitialURL: (): void => {
      mockExpoLatestUrl = null;
    },
  },
}));

jest.mock("expo-linking/build/RNLinking", () => ({
  __esModule: true,
  default: {
    getInitialURL: (): Promise<string | null> => Promise.resolve(mockRnInitialUrl),
    addEventListener: mockRnAddEventListener,
    openSettings: jest.fn<Promise<void>, []>(() => Promise.resolve()),
    openURL: jest.fn<Promise<true>, [string]>(() => Promise.resolve(true)),
    canOpenURL: jest.fn<Promise<boolean>, [string]>(() => Promise.resolve(true)),
    sendIntent: jest.fn<Promise<void>, [string]>(() => Promise.resolve()),
  },
}));

jest.mock("expo-router", () => ({
  useRouter: (): { replace: typeof mockReplace } => ({
    replace: mockReplace,
  }),
  useLocalSearchParams: (): Record<string, string | string[]> =>
    Object.fromEntries(Object.entries(mockLocalSearchParams)),
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: (): { user: MockAuthUser | null } => ({
    user: mockAuthUser,
  }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/hooks/useDeferredRouterReplace", () => ({
  useDeferredRouterReplace: (): void => undefined,
}));

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: (): {
    readonly width: number;
    readonly height: number;
    readonly scale: number;
    readonly fontScale: number;
  } => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  } => ({ top: 24, right: 0, bottom: 34, left: 0 }),
}));

jest.mock("@/components/auth/AuthCallbackProcessingView", () => ({
  AuthCallbackProcessingView: (): React.ReactElement => {
    const ReactMod = jest.requireActual<typeof import("react")>("react");
    const RN = jest.requireActual<typeof import("react-native")>("react-native");
    return ReactMod.createElement(
      RN.Text,
      { testID: "callback-processing" },
      "processing"
    );
  },
}));

jest.mock("@/components/auth/AuthCallbackFailureView", () => ({
  AuthCallbackFailureView: ({
    failureType,
  }: {
    readonly failureType: string;
  }): React.ReactElement => {
    const ReactMod = jest.requireActual<typeof import("react")>("react");
    const RN = jest.requireActual<typeof import("react-native")>("react-native");
    return ReactMod.createElement(
      RN.Text,
      { testID: `callback-failure-${failureType}` },
      failureType
    );
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
    const ReactMod = jest.requireActual<typeof import("react")>("react");
    const RN = jest.requireActual<typeof import("react-native")>("react-native");
    return ReactMod.createElement(
      RN.View,
      { testID: "verification-success" },
      ReactMod.createElement(
        RN.Text,
        { testID: "verification-success-email" },
        email ?? ""
      ),
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

jest.mock("@/components/onboarding/LanguageSwitcherPill", () => ({
  LanguageSwitcherPill: (): null => null,
}));

jest.mock("@/components/ui/MonyviLogo", () => ({
  MonyviLogo: (): null => null,
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: (): null => null,
}));

jest.mock("@/services/auth-service", () => ({
  cancelAuthSessionCompletion: (url: string): void =>
    mockCancelAuthSessionCompletion(url),
  completeAuthSessionFromUrl: (url: string): Promise<CallbackResult> =>
    mockCompleteAuthSessionFromUrl(url),
}));

const actualExpoLinking = jest.requireActual<typeof import("expo-linking")>(
  "expo-linking"
);
const AuthCallbackScreen = jest.requireActual<
  typeof import("../../app/auth-callback")
>("../../app/auth-callback").default;

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (value: T): void => {
      if (!resolvePromise) {
        throw new Error("Deferred promise was not initialized");
      }
      resolvePromise(value);
    },
  };
}

function emitExpoUrl(url: string): void {
  mockExpoLatestUrl = url;
  for (const listener of [...mockExpoLinkingListeners]) {
    listener({ url });
  }
}

function emitRnUrl(url: string): void {
  for (const listener of [...mockRnLinkingListeners]) {
    listener({ url });
  }
}

function LinkingProbe(): React.JSX.Element {
  const url = actualExpoLinking.useLinkingURL();
  return <Text testID="linking-url-probe">{url ?? "none"}</Text>;
}

function renderCallback(): ReturnType<typeof render> {
  return render(<AuthCallbackScreen />);
}

describe("AuthCallbackScreen Expo Linking lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExpoLatestUrl = null;
    mockRnInitialUrl = null;
    mockLocalSearchParams = {};
    mockAuthUser = {
      email: "already-authenticated@example.test",
    };
    mockExpoLinkingListeners.clear();
    mockRnLinkingListeners.clear();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    mockExpoLinkingListeners.clear();
    mockRnLinkingListeners.clear();
  });

  it("proves the real installed useLinkingURL hook reads the cached native URL synchronously", () => {
    const warmUrl =
      "monyvi://auth-callback?code=fake-warm-cache&type=signup";
    mockExpoLatestUrl = warmUrl;
    mockRnInitialUrl = null;

    const view = render(<LinkingProbe />);

    expect(screen.getByTestId("linking-url-probe")).toHaveTextContent(warmUrl);
    expect(mockExpoLinkingListeners).toHaveSize(1);

    view.unmount();
    expect(mockExpoLinkingListeners).toHaveSize(0);
  });

  it("uses the latest warm native callback even when React Native initialURL is stale", async () => {
    const warmUrl =
      "monyvi://auth-callback?code=fake-warm-latest&type=signup";
    const staleLaunchUrl =
      "monyvi://auth-callback?code=fake-stale-launch&type=signup";
    mockExpoLatestUrl = warmUrl;
    mockRnInitialUrl = staleLaunchUrl;
    mockLocalSearchParams = { type: "signup" };
    mockCompleteAuthSessionFromUrl.mockImplementation((url) =>
      Promise.resolve(
        url === warmUrl
          ? { success: true, email: "verified@example.test" }
          : {
              success: false,
              error: "stale callback",
              errorCode: "invalid_callback",
            }
      )
    );

    renderCallback();

    await waitFor(() => {
      expect(mockCompleteAuthSessionFromUrl).toHaveBeenCalledWith(warmUrl);
    });
    expect(mockCompleteAuthSessionFromUrl).not.toHaveBeenCalledWith(
      staleLaunchUrl
    );
    expect(screen.getByTestId("verification-success")).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("keeps a deferred successful completion alive across processing rerenders with fresh route params", async () => {
    const callbackUrl =
      "monyvi://auth-callback?code=fake-deferred&type=signup";
    const deferred = createDeferred<CallbackResult>();
    mockExpoLatestUrl = callbackUrl;
    mockRnInitialUrl = callbackUrl;
    mockLocalSearchParams = { type: "signup" };
    mockCompleteAuthSessionFromUrl.mockReturnValue(deferred.promise);

    renderCallback();

    await waitFor(() => {
      expect(mockCompleteAuthSessionFromUrl).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("callback-processing")).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => {
      deferred.resolve({
        success: true,
        email: "verified@example.test",
      });
      await deferred.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId("verification-success")).toBeOnTheScreen();
    });
    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.press(
      screen.getByRole("button", { name: "continue_to_dashboard" })
    );
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("completes a valid cold callback when native cache and initialURL agree", async () => {
    const callbackUrl =
      "monyvi://auth-callback?code=fake-cold&type=signup";
    mockExpoLatestUrl = callbackUrl;
    mockRnInitialUrl = callbackUrl;
    mockLocalSearchParams = { type: "signup" };
    mockCompleteAuthSessionFromUrl.mockResolvedValue({
      success: true,
      email: "verified@example.test",
    });

    renderCallback();

    await waitFor(() => {
      expect(screen.getByTestId("verification-success")).toBeOnTheScreen();
    });
    expect(mockCompleteAuthSessionFromUrl).toHaveBeenCalledTimes(1);
  });

  it("accepts a native URL delivered after the callback route mounts", async () => {
    const callbackUrl =
      "monyvi://auth-callback?code=fake-late-native&type=signup";
    mockLocalSearchParams = { type: "signup" };
    mockCompleteAuthSessionFromUrl.mockResolvedValue({
      success: true,
      email: "verified@example.test",
    });

    renderCallback();
    expect(screen.getByTestId("callback-processing")).toBeOnTheScreen();

    act(() => {
      emitExpoUrl(callbackUrl);
    });

    await waitFor(() => {
      expect(mockCompleteAuthSessionFromUrl).toHaveBeenCalledWith(callbackUrl);
    });
    expect(screen.getByTestId("verification-success")).toBeOnTheScreen();
  });

  it("does not complete the same callback URL twice when duplicate native deliveries arrive", async () => {
    const callbackUrl =
      "monyvi://auth-callback?code=fake-duplicate&type=signup";
    const deferred = createDeferred<CallbackResult>();
    mockExpoLatestUrl = callbackUrl;
    mockRnInitialUrl = callbackUrl;
    mockLocalSearchParams = { type: "signup" };
    mockCompleteAuthSessionFromUrl.mockReturnValue(deferred.promise);

    const view = renderCallback();

    await waitFor(() => {
      expect(mockCompleteAuthSessionFromUrl).toHaveBeenCalledTimes(1);
    });

    act(() => {
      emitExpoUrl(callbackUrl);
      emitRnUrl(callbackUrl);
    });
    expect(mockCompleteAuthSessionFromUrl).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve({
        success: true,
        email: "verified@example.test",
      });
      await deferred.promise;
    });
    view.unmount();
  });

  it("treats a genuinely missing callback URL as failure even when AuthContext already has a user", async () => {
    jest.useFakeTimers();
    mockAuthUser = {
      email: "verified-but-no-link@example.test",
    };

    renderCallback();

    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(10_001);
      await Promise.resolve();
    });

    expect(mockCompleteAuthSessionFromUrl).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("callback-failure-verification")
    ).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "invalid callback",
      callbackUrl:
        "monyvi://auth-callback?code=fake-invalid&type=signup",
      params: { type: "signup" },
      result: {
        success: false,
        error: "invalid callback",
        errorCode: "invalid_callback",
      } satisfies CallbackFailure,
      expectedFailureType: "verification",
    },
    {
      label: "provider failure",
      callbackUrl:
        "monyvi://auth-callback?error=access_denied&provider=google",
      params: { provider: "google" },
      result: {
        success: false,
        error: "provider failure",
        errorCode: "provider_error",
      } satisfies CallbackFailure,
      expectedFailureType: "oauth",
    },
  ])(
    "preserves $label recovery classification",
    async ({ callbackUrl, params, result, expectedFailureType }) => {
      mockExpoLatestUrl = callbackUrl;
      mockRnInitialUrl = callbackUrl;
      mockLocalSearchParams = params;
      mockCompleteAuthSessionFromUrl.mockResolvedValue(result);

      renderCallback();

      await waitFor(() => {
        expect(
          screen.getByTestId(`callback-failure-${expectedFailureType}`)
        ).toBeOnTheScreen();
      });
      expect(mockReplace).not.toHaveBeenCalled();
    }
  );

  it("removes the supported native URL listener on unmount and ignores later delivery", () => {
    const view = renderCallback();

    expect(mockExpoLinkingListeners).toHaveSize(1);
    view.unmount();
    expect(mockExpoLinkingListeners).toHaveSize(0);

    act(() => {
      emitExpoUrl(
        "monyvi://auth-callback?code=fake-after-unmount&type=signup"
      );
    });

    expect(mockCompleteAuthSessionFromUrl).not.toHaveBeenCalled();
  });
});
