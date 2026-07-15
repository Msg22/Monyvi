/* eslint-disable max-lines -- Settings permission regression tests share one screen-level mock harness. */
import React, { type ReactNode } from "react";
import { AppState, ScrollView, type AppStateStatus } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

type SmsPermissionStatus = "undetermined" | "granted" | "denied" | "blocked";
type NotificationPermissionStatus =
  | "undetermined"
  | "granted"
  | "denied"
  | "blocked";

const mockRequestPermission = jest.fn<Promise<SmsPermissionStatus>, []>();
const mockRequestLiveDetectionPermission = jest.fn<
  Promise<SmsPermissionStatus>,
  []
>();
const mockOpenSettings = jest.fn<Promise<void>, []>();
const mockRecheckPermission = jest.fn<Promise<void>, []>();
const mockSetLiveDetectionEnabled = jest.fn<Promise<void>, [boolean]>();
const mockReconcileLiveDetectionPreference = jest.fn<Promise<boolean>, []>();
const mockStartSmsListener = jest.fn<void, []>();
const mockStopSmsListener = jest.fn<void, []>();
const mockRequestNotificationPermissionStatus = jest.fn<
  Promise<NotificationPermissionStatus>,
  []
>();
const mockOpenNotificationSettings = jest.fn<Promise<void>, []>();
const mockGetNotificationPermissionStatus = jest.fn<
  Promise<NotificationPermissionStatus>,
  []
>();
const mockRouterPush = jest.fn<void, [string]>();
const mockGrantAiConsent = jest.fn<Promise<void>, []>();
const mockRevokeAiConsent = jest.fn<Promise<void>, []>();
const SAFE_AREA_BOTTOM = 24;

let mockSmsPermissionStatus: SmsPermissionStatus = "denied";
let mockLiveDetectionPermissionStatus: SmsPermissionStatus = "denied";
let mockIsAiConsented = true;
let mockHasRevokedAiConsentRecord = false;
let mockIsAiConsentLoading = false;
let mockHasSynced = false;
let mockQaSmsPatternIntakeAvailable = false;
let appStateChangeHandlers: Array<(status: AppStateStatus) => void> = [];

jest.mock("react-native/Libraries/Modal/Modal", () => {
  function MockModal({
    visible,
    children,
  }: {
    readonly visible: boolean;
    readonly children?: ReactNode;
  }): ReactNode {
    return visible ? children : null;
  }

  MockModal.displayName = "Modal";

  return { __esModule: true, default: MockModal };
});

jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  router: {
    back: jest.fn(),
    push: (path: string) => mockRouterPush(path),
    replace: jest.fn(),
  },
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => ({ language: "en" }),
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { email: "user@example.com" } }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
    theme: { text: { primary: "#111827", secondary: "#6b7280" } },
    isDark: false,
    toggleTheme: jest.fn(),
  }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: () => ({
    preferredCurrency: "EGP",
    setPreferredCurrency: jest.fn(),
  }),
}));

jest.mock("@/hooks/useAiProcessingConsent", () => ({
  useAiProcessingConsent: () => ({
    consent:
      mockIsAiConsented || mockHasRevokedAiConsentRecord
        ? {
            consentedAt: "2026-07-04T10:00:00.000Z",
            revokedAt: mockIsAiConsented
              ? undefined
              : "2026-07-05T10:00:00.000Z",
            version: "2026-07-ai-processing-v1",
          }
        : null,
    isConsented: mockIsAiConsented,
    isLoading: mockIsAiConsentLoading,
    grantConsent: mockGrantAiConsent,
    revokeConsent: mockRevokeAiConsent,
  }),
}));

jest.mock("@/providers/DatabaseProvider", () => ({
  useDatabase: () => ({}),
}));

jest.mock("@/services/logout-service", () => ({
  performLogout: jest.fn(),
}));

jest.mock("@/services/intro-flag-service", () => ({
  setIntroLocaleOverride: jest.fn(),
}));

jest.mock("@/services/profile-service", () => ({
  setPreferredLanguage: jest.fn(),
}));

jest.mock("@/hooks/useSmsPermission", () => ({
  useSmsPermission: () => ({
    status: mockSmsPermissionStatus,
    liveDetectionStatus: mockLiveDetectionPermissionStatus,
    isAndroid: true,
    isLoading: false,
    requestPermission: mockRequestPermission,
    requestLiveDetectionPermission: mockRequestLiveDetectionPermission,
    openSettings: mockOpenSettings,
    recheckPermission: mockRecheckPermission,
  }),
}));

jest.mock("@/hooks/useSmsSync", () => ({
  useSmsSync: () => ({
    hasSynced: mockHasSynced,
    lastSyncTimestamp: null,
  }),
}));

jest.mock("@/context/SmsScanContext", () => ({
  useSmsScanContext: () => ({
    setScanMode: jest.fn(),
  }),
}));

jest.mock("@/services/sms-live-detection-handler", () => ({
  isLiveDetectionEnabled: jest.fn(() => Promise.resolve(false)),
  reconcileLiveDetectionPreference: () =>
    mockReconcileLiveDetectionPreference(),
  setLiveDetectionEnabled: (value: boolean) =>
    mockSetLiveDetectionEnabled(value),
  isAutoConfirmEnabled: jest.fn(() => Promise.resolve(false)),
  setAutoConfirm: jest.fn(() => Promise.resolve()),
}));

jest.mock("@/services/sms-live-listener-service", () => ({
  startSmsListener: () => mockStartSmsListener(),
  stopSmsListener: () => mockStopSmsListener(),
}));

jest.mock("@/services/notification-service", () => ({
  getNotificationPermissionStatus: () => mockGetNotificationPermissionStatus(),
  requestNotificationPermissionStatus: () =>
    mockRequestNotificationPermissionStatus(),
  openNotificationSettings: () => mockOpenNotificationSettings(),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({
    bottom: SAFE_AREA_BOTTOM,
  }),
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock("@/config/qa-sms-pattern-intake-config", () => ({
  getQaSmsPatternIntakeAvailability: () =>
    mockQaSmsPatternIntakeAvailable
      ? { isAvailable: true }
      : { isAvailable: false, reason: "release_build" },
}));

jest.mock("@/components/ui/GradientBackground", () => {
  return {
    GradientBackground: ({
      children,
    }: {
      readonly children?: ReactNode;
    }): ReactNode => children,
  };
});

jest.mock("@/components/currency/CurrencyPicker", () => ({
  CurrencyPicker: () => null,
}));

jest.mock("@/components/ui/Dropdown", () => ({
  Dropdown: () => null,
}));

jest.mock("@/utils/dateHelpers", () => ({
  formatToLocalDateString: () => "2026-05-10",
}));

jest.mock("@monyvi/logic", () => ({
  CURRENCY_INFO_MAP: {
    EGP: { flag: "EG", name: "Egyptian Pound" },
  },
}));

import SettingsScreen from "@/app/(private)/settings";

function renderSettings(): ReturnType<typeof render> {
  return render(<SettingsScreen />);
}

async function renderReadySettings(): Promise<ReturnType<typeof render>> {
  const screen = renderSettings();
  await screen.findByTestId("live-sms-detection-switch");
  return screen;
}

function emitAppStateChange(status: AppStateStatus): void {
  act(() => {
    for (const handler of [...appStateChangeHandlers]) {
      handler(status);
    }
  });
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

function getLiveDetectionSwitchValue(
  screen: ReturnType<typeof render>
): boolean {
  const switchNode = screen.getByTestId(
    "live-sms-detection-switch"
  ) as unknown as {
    readonly props: {
      readonly value?: boolean;
    };
  };

  return switchNode.props.value === true;
}

function getLiveDetectionSwitchDisabled(
  screen: ReturnType<typeof render>
): boolean {
  const switchNode = screen.getByTestId(
    "live-sms-detection-switch"
  ) as unknown as {
    readonly props: {
      readonly disabled?: boolean;
    };
  };

  return switchNode.props.disabled === true;
}

describe("Settings live SMS permission recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appStateChangeHandlers = [];
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, handler): { remove: () => void } => {
        const typedHandler = handler;
        appStateChangeHandlers.push(typedHandler);
        return {
          remove: jest.fn(() => {
            appStateChangeHandlers = appStateChangeHandlers.filter(
              (registeredHandler) => registeredHandler !== typedHandler
            );
          }),
        };
      });
    mockSmsPermissionStatus = "denied";
    mockLiveDetectionPermissionStatus = "undetermined";
    mockRequestPermission.mockResolvedValue("granted");
    mockRequestLiveDetectionPermission.mockResolvedValue("granted");
    mockRecheckPermission.mockResolvedValue();
    mockReconcileLiveDetectionPreference.mockResolvedValue(false);
    mockOpenSettings.mockResolvedValue();
    mockSetLiveDetectionEnabled.mockResolvedValue();
    mockGetNotificationPermissionStatus.mockResolvedValue("granted");
    mockRequestNotificationPermissionStatus.mockResolvedValue("granted");
    mockOpenNotificationSettings.mockResolvedValue();
    mockIsAiConsented = true;
    mockHasRevokedAiConsentRecord = false;
    mockIsAiConsentLoading = false;
    mockHasSynced = false;
    mockQaSmsPatternIntakeAvailable = false;
    mockGrantAiConsent.mockResolvedValue();
    mockRevokeAiConsent.mockResolvedValue();
  });

  it("opens QA SMS pattern intake from Settings when the dev tool is available", async () => {
    mockQaSmsPatternIntakeAvailable = true;
    const screen = await renderReadySettings();

    fireEvent.press(screen.getByTestId("qa-sms-pattern-intake-settings-link"));

    expect(mockRouterPush).toHaveBeenCalledWith("/qa-sms-pattern-intake");
  });

  it("does not expose QA SMS pattern intake when the dev tool is unavailable", async () => {
    const screen = await renderReadySettings();

    expect(
      screen.queryByTestId("qa-sms-pattern-intake-settings-link")
    ).toBeNull();
  });

  it("waits for stored live detection state before rendering the switch", async () => {
    const initialReconcile = createDeferred<boolean>();
    mockReconcileLiveDetectionPreference.mockReturnValue(
      initialReconcile.promise
    );

    const screen = renderSettings();

    expect(screen.queryByTestId("live-sms-detection-switch")).toBeNull();
    await act(async () => {
      initialReconcile.resolve(true);
      await Promise.resolve();
    });

    await screen.findByTestId("live-sms-detection-switch");
    expect(getLiveDetectionSwitchValue(screen)).toBe(true);
  });

  it("adds bottom safe-area padding to keep lower settings rows scrollable", async () => {
    const screen = await renderReadySettings();

    const scrollView = screen.UNSAFE_getByType(ScrollView) as unknown as {
      readonly props: {
        readonly contentContainerStyle?: { readonly paddingBottom?: number };
      };
    };

    expect(
      scrollView.props.contentContainerStyle?.paddingBottom
    ).toBeGreaterThan(SAFE_AREA_BOTTOM);
  });

  it("opens the custom SMS permission modal instead of enabling live detection immediately", async () => {
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );

    expect(
      await screen.findByText("sms_permission_request_title")
    ).toBeTruthy();
    expect(screen.getByText("sms_permission_allow")).toBeTruthy();
    expect(mockSetLiveDetectionEnabled).not.toHaveBeenCalledWith(true);
    expect(mockStartSmsListener).not.toHaveBeenCalled();
  });

  it("keeps the switch off when stored live detection is no longer allowed by permissions", async () => {
    mockReconcileLiveDetectionPreference.mockResolvedValue(false);
    const screen = await renderReadySettings();

    await waitFor(() => {
      expect(mockReconcileLiveDetectionPreference).toHaveBeenCalledTimes(1);
    });

    expect(getLiveDetectionSwitchValue(screen)).toBe(false);
    expect(mockStopSmsListener).toHaveBeenCalledTimes(1);
  });

  it("turns off stored live detection when AI consent is absent", async () => {
    mockIsAiConsented = false;
    mockReconcileLiveDetectionPreference.mockResolvedValue(true);
    const screen = await renderReadySettings();
    await waitFor(() =>
      expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(false)
    );
    expect(getLiveDetectionSwitchValue(screen)).toBe(false);
    expect(mockReconcileLiveDetectionPreference).not.toHaveBeenCalled();
    expect(mockStopSmsListener).toHaveBeenCalled();
  });

  it("opens the custom SMS sync permission modal before requesting Android permission", async () => {
    mockSmsPermissionStatus = "undetermined";
    const screen = await renderReadySettings();

    fireEvent.press(screen.getByText("sync_new"));

    expect(
      await screen.findByText("sms_sync_permission_request_title")
    ).toBeTruthy();
    expect(
      screen.getByText("sms_sync_permission_request_message")
    ).toBeTruthy();
    expect(screen.getByText("sms_permission_allow")).toBeTruthy();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalledWith("/sms-scan");
  });

  it("opens SMS scan after allowing SMS sync permission", async () => {
    mockSmsPermissionStatus = "undetermined";
    mockRequestPermission.mockResolvedValue("granted");
    const screen = await renderReadySettings();

    fireEvent.press(screen.getByText("sync_new"));
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/sms-scan");
    });
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    expect(mockRequestLiveDetectionPermission).not.toHaveBeenCalled();
  });

  it("opens SMS scan only once when permission state updates before the request resolves", async () => {
    let resolvePermissionRequest: (status: "granted") => void = () => {};
    mockSmsPermissionStatus = "undetermined";
    mockRequestPermission.mockReturnValueOnce(
      new Promise<"granted">((resolve) => {
        resolvePermissionRequest = resolve;
      })
    );
    const screen = await renderReadySettings();

    fireEvent.press(screen.getByText("sync_new"));
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));
    await waitFor(() => expect(mockRequestPermission).toHaveBeenCalledTimes(1));

    mockSmsPermissionStatus = "granted";
    screen.rerender(<SettingsScreen />);

    await act(async () => {
      resolvePermissionRequest("granted");
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/sms-scan");
    });
    expect(
      mockRouterPush.mock.calls.filter(([route]) => route === "/sms-scan")
    ).toHaveLength(1);
  });

  it("does not replay a dismissed AI consent SMS action when enabling AI later", async () => {
    mockIsAiConsented = false;
    mockSmsPermissionStatus = "granted";
    const screen = await renderReadySettings();

    fireEvent.press(screen.getByText("sync_new"));
    fireEvent.press(await screen.findByTestId("ai-consent-not-now"));

    expect(mockRouterPush).not.toHaveBeenCalledWith("/sms-scan");

    fireEvent(
      screen.getByTestId("ai-processing-consent-switch"),
      "valueChange",
      true
    );
    fireEvent.press(await screen.findByTestId("ai-consent-continue"));

    await waitFor(() => {
      expect(mockGrantAiConsent).toHaveBeenCalledTimes(1);
    });
    expect(mockRouterPush).not.toHaveBeenCalledWith("/sms-scan");
  });

  it("does not ask for AI consent again when live SMS is enabled after consenting in Settings", async () => {
    mockIsAiConsented = false;
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "undetermined";
    const screen = await renderReadySettings();
    mockReconcileLiveDetectionPreference.mockReturnValue(
      new Promise<boolean>(() => undefined)
    );
    fireEvent(
      screen.getByTestId("ai-processing-consent-switch"),
      "valueChange",
      true
    );
    await act(async () => {
      fireEvent.press(await screen.findByTestId("ai-consent-continue"));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(mockGrantAiConsent).toHaveBeenCalledTimes(1));
    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );
    expect(screen.queryByText("ai_consent_title")).toBeNull();
    expect(
      await screen.findByText("sms_permission_request_title")
    ).toBeTruthy();
  });

  it("re-enables AI consent directly after the user has already accepted the current consent", async () => {
    mockIsAiConsented = false;
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("ai-processing-consent-switch"),
      "valueChange",
      true
    );
    await act(async () => {
      fireEvent.press(await screen.findByTestId("ai-consent-continue"));
      await Promise.resolve();
    });
    await waitFor(() => expect(mockGrantAiConsent).toHaveBeenCalledTimes(1));

    mockIsAiConsented = true;
    screen.rerender(<SettingsScreen />);
    fireEvent(
      screen.getByTestId("ai-processing-consent-switch"),
      "valueChange",
      false
    );
    fireEvent.press(await screen.findByTestId("modal-confirm"));
    await waitFor(() => expect(mockRevokeAiConsent).toHaveBeenCalledTimes(1));

    mockIsAiConsented = false;
    mockHasRevokedAiConsentRecord = true;
    screen.rerender(<SettingsScreen />);
    fireEvent(
      screen.getByTestId("ai-processing-consent-switch"),
      "valueChange",
      true
    );

    await waitFor(() => expect(mockGrantAiConsent).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("ai_consent_title")).toBeNull();
  });

  it("uses the general AI consent sheet for SMS sync when AI consent is missing", async () => {
    mockIsAiConsented = false;
    mockSmsPermissionStatus = "granted";
    const screen = await renderReadySettings();
    fireEvent.press(screen.getByText("sync_new"));
    expect(await screen.findByText("ai_consent_title")).toBeTruthy();
    expect(screen.getByText("ai_consent_privacy_details")).toBeTruthy();
    expect(await screen.findByTestId("ai-consent-continue")).toBeTruthy();
  });

  it("waits for AI consent to load before gating SMS sync", async () => {
    mockIsAiConsented = false;
    mockIsAiConsentLoading = true;
    mockSmsPermissionStatus = "granted";
    const screen = renderSettings();

    fireEvent.press(await screen.findByText("sync_new"));

    expect(screen.queryByText("ai_consent_title")).toBeNull();
    expect(mockRouterPush).not.toHaveBeenCalledWith("/sms-scan");
  });

  it("dismisses the full rescan confirmation before opening AI consent", async () => {
    mockHasSynced = true;
    mockIsAiConsented = false;
    mockSmsPermissionStatus = "granted";
    const screen = await renderReadySettings();

    fireEvent.press(screen.getByText("full_rescan"));
    expect(await screen.findByText("rescan_title")).toBeTruthy();

    fireEvent.press(screen.getByTestId("modal-confirm"));

    expect(screen.queryByText("rescan_title")).toBeNull();
    expect(await screen.findByText("ai_consent_title")).toBeTruthy();
  });

  it("shows SMS permission recovery after general AI consent for SMS sync", async () => {
    mockIsAiConsented = false;
    mockSmsPermissionStatus = "undetermined";
    const screen = await renderReadySettings();
    fireEvent.press(screen.getByText("sync_new"));
    fireEvent.press(await screen.findByTestId("ai-consent-continue"));
    await waitFor(() => expect(mockGrantAiConsent).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("sms_sync_permission_request_title")
    ).toBeTruthy();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalledWith("/sms-scan");
  });

  it("preserves pending SMS sync consent while live detection cleanup runs", async () => {
    mockIsAiConsented = false;
    mockSmsPermissionStatus = "granted";
    const screen = await renderReadySettings();

    fireEvent.press(screen.getByText("sync_new"));
    expect(await screen.findByTestId("ai-consent-continue")).toBeTruthy();

    emitAppStateChange("background");
    emitAppStateChange("active");
    fireEvent.press(screen.getByTestId("ai-consent-continue"));

    await waitFor(() => {
      expect(mockGrantAiConsent).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/sms-scan");
    });
  });

  it("keeps SMS sync recovery actionable when SMS permission can still be requested", async () => {
    mockSmsPermissionStatus = "undetermined";
    mockRequestPermission.mockResolvedValue("denied");
    const screen = await renderReadySettings();

    fireEvent.press(screen.getByText("sync_new"));
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    expect(
      await screen.findByText("sms_sync_permission_request_title")
    ).toBeTruthy();
    expect(
      screen.getByText("sms_sync_permission_request_message")
    ).toBeTruthy();
    expect(screen.getByText("sms_permission_allow")).toBeTruthy();
    expect(mockRouterPush).not.toHaveBeenCalledWith("/sms-scan");
  });

  it("opens settings from blocked SMS sync recovery", async () => {
    mockSmsPermissionStatus = "blocked";
    const screen = await renderReadySettings();

    fireEvent.press(screen.getByText("sync_new"));

    expect(
      await screen.findByText("sms_sync_permission_blocked_title")
    ).toBeTruthy();
    expect(
      screen.getByText("sms_sync_permission_blocked_message")
    ).toBeTruthy();
    expect(screen.getByText("permission_open_settings")).toBeTruthy();

    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    });
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it("continues the pending SMS sync after returning from settings with SMS permission granted", async () => {
    mockSmsPermissionStatus = "blocked";
    const screen = await renderReadySettings();

    fireEvent.press(screen.getByText("sync_new"));
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    });

    mockSmsPermissionStatus = "granted";
    screen.rerender(<SettingsScreen />);

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/sms-scan");
    });
  });

  it("enables live detection after retrying SMS permission successfully", async () => {
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(true);
    });
    expect(mockRequestLiveDetectionPermission).toHaveBeenCalledTimes(1);
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockGetNotificationPermissionStatus).toHaveBeenCalledTimes(1);
    expect(mockRequestNotificationPermissionStatus).not.toHaveBeenCalled();
    expect(mockStartSmsListener).toHaveBeenCalledTimes(1);
  });

  it("opens the Allow notifications modal when notifications are not requested yet", async () => {
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "granted";
    mockGetNotificationPermissionStatus.mockResolvedValue("undetermined");
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );

    expect(
      await screen.findByText("notification_permission_request_title")
    ).toBeTruthy();
    expect(
      screen.getByText("notification_permission_request_message")
    ).toBeTruthy();
    expect(screen.getByText("notification_permission_allow")).toBeTruthy();
    expect(mockRequestNotificationPermissionStatus).not.toHaveBeenCalled();
    expect(mockSetLiveDetectionEnabled).not.toHaveBeenCalledWith(true);
    expect(mockStartSmsListener).not.toHaveBeenCalled();
  });

  it("keeps notification recovery actionable when notifications were denied but can be requested again", async () => {
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "granted";
    mockGetNotificationPermissionStatus.mockResolvedValue("denied");
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );

    expect(
      await screen.findByText("notification_permission_request_title")
    ).toBeTruthy();
    expect(
      screen.getByText("notification_permission_request_message")
    ).toBeTruthy();
    expect(screen.getByText("notification_permission_allow")).toBeTruthy();
    expect(mockRequestNotificationPermissionStatus).not.toHaveBeenCalled();
    expect(mockSetLiveDetectionEnabled).not.toHaveBeenCalledWith(true);
    expect(mockStartSmsListener).not.toHaveBeenCalled();
  });

  it("keeps the live detection switch on while enable work is pending", async () => {
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "granted";
    const notificationCheck = createDeferred<NotificationPermissionStatus>();
    mockGetNotificationPermissionStatus.mockReturnValue(
      notificationCheck.promise
    );
    const screen = await renderReadySettings();

    expect(getLiveDetectionSwitchValue(screen)).toBe(false);

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );

    expect(getLiveDetectionSwitchValue(screen)).toBe(true);
    expect(getLiveDetectionSwitchDisabled(screen)).toBe(true);
    expect(mockSetLiveDetectionEnabled).not.toHaveBeenCalledWith(true);

    notificationCheck.resolve("granted");

    await waitFor(() => {
      expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(true);
    });
    expect(getLiveDetectionSwitchValue(screen)).toBe(true);
    expect(getLiveDetectionSwitchDisabled(screen)).toBe(false);
  });

  it("enables live detection after retrying notification permission successfully", async () => {
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "granted";
    mockGetNotificationPermissionStatus.mockResolvedValue("undetermined");
    mockRequestNotificationPermissionStatus.mockResolvedValue("granted");
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(true);
    });
    expect(mockStartSmsListener).toHaveBeenCalledTimes(1);
  });

  it("switches notification recovery to Open Settings when notifications are blocked", async () => {
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "granted";
    mockGetNotificationPermissionStatus.mockResolvedValue("undetermined");
    mockRequestNotificationPermissionStatus.mockResolvedValue("blocked");
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );

    expect(
      await screen.findByText("notification_permission_request_title")
    ).toBeTruthy();
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    expect(
      await screen.findByText("notification_permission_blocked_title")
    ).toBeTruthy();
    expect(
      screen.getByText("notification_permission_blocked_message")
    ).toBeTruthy();
    expect(screen.getByText("permission_open_settings")).toBeTruthy();
  });

  it("opens settings from blocked notification recovery", async () => {
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "granted";
    mockGetNotificationPermissionStatus.mockResolvedValue("undetermined");
    mockRequestNotificationPermissionStatus.mockResolvedValue("blocked");
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockOpenNotificationSettings).toHaveBeenCalledTimes(1);
    });
  });

  it("enables live detection after returning from settings with notification permission granted", async () => {
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "granted";
    mockGetNotificationPermissionStatus
      .mockResolvedValueOnce("blocked")
      .mockResolvedValue("granted");
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockOpenNotificationSettings).toHaveBeenCalledTimes(1);
      expect(appStateChangeHandlers.length).toBeGreaterThan(0);
    });

    emitAppStateChange("background");
    emitAppStateChange("active");

    await waitFor(() => {
      expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(true);
    });
    expect(mockStartSmsListener).toHaveBeenCalledTimes(1);
  });

  it("does not let stored-state reconciliation turn the switch off during notification settings recovery", async () => {
    const staleReconcile = createDeferred<boolean>();
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "granted";
    mockReconcileLiveDetectionPreference
      .mockResolvedValueOnce(false)
      .mockReturnValue(staleReconcile.promise);
    mockGetNotificationPermissionStatus
      .mockResolvedValueOnce("blocked")
      .mockResolvedValue("granted");
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockOpenNotificationSettings).toHaveBeenCalledTimes(1);
    });

    emitAppStateChange("background");
    emitAppStateChange("active");

    await waitFor(() => {
      expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(true);
    });

    staleReconcile.resolve(false);

    await waitFor(() => {
      expect(getLiveDetectionSwitchValue(screen)).toBe(true);
    });
  });

  it("does not let stale stored-state reconciliation re-enable live detection after the user turns it off", async () => {
    const staleReconcile = createDeferred<boolean>();
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "granted";
    mockReconcileLiveDetectionPreference
      .mockResolvedValueOnce(true)
      .mockReturnValue(staleReconcile.promise);
    const screen = await renderReadySettings();

    await waitFor(() => {
      expect(getLiveDetectionSwitchValue(screen)).toBe(true);
    });

    emitAppStateChange("background");
    emitAppStateChange("active");

    await waitFor(() => {
      expect(mockReconcileLiveDetectionPreference).toHaveBeenCalledTimes(2);
    });

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      false
    );

    await waitFor(() => {
      expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(false);
    });

    await act(async () => {
      staleReconcile.resolve(true);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getLiveDetectionSwitchValue(screen)).toBe(false);
    });
  });

  it("cancels pending live detection enable work when AI consent is revoked", async () => {
    const notificationCheck = createDeferred<NotificationPermissionStatus>();
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "granted";
    mockGetNotificationPermissionStatus.mockReturnValue(
      notificationCheck.promise
    );
    const screen = await renderReadySettings();
    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );
    fireEvent(
      screen.getByTestId("ai-processing-consent-switch"),
      "valueChange",
      false
    );
    expect(await screen.findByText("ai_disable_confirm_title")).toBeTruthy();
    expect(mockRevokeAiConsent).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("modal-confirm"));
    await waitFor(() => expect(mockRevokeAiConsent).toHaveBeenCalledTimes(1));
    await act(async () => {
      notificationCheck.resolve("granted");
      await Promise.resolve();
    });
    expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(false);
    expect(mockSetLiveDetectionEnabled).not.toHaveBeenCalledWith(true);
    expect(mockStartSmsListener).not.toHaveBeenCalled();
    expect(getLiveDetectionSwitchValue(screen)).toBe(false);
  });

  it("cancels pending live detection settings return when AI consent syncs off", async () => {
    mockLiveDetectionPermissionStatus = "blocked";
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    });

    const enableCallCountBeforeConsentLoss =
      mockSetLiveDetectionEnabled.mock.calls.filter(
        ([value]) => value === true
      ).length;

    mockIsAiConsented = false;
    mockLiveDetectionPermissionStatus = "granted";
    await act(async () => {
      screen.rerender(<SettingsScreen />);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(false);
    });

    emitAppStateChange("background");
    emitAppStateChange("active");

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      mockSetLiveDetectionEnabled.mock.calls.filter(([value]) => value === true)
    ).toHaveLength(enableCallCountBeforeConsentLoss);
    expect(mockStartSmsListener).not.toHaveBeenCalled();
    expect(getLiveDetectionSwitchValue(screen)).toBe(false);
  });

  it("keeps AI consent enabled when disable confirmation is cancelled", async () => {
    const screen = await renderReadySettings();
    fireEvent(
      screen.getByTestId("ai-processing-consent-switch"),
      "valueChange",
      false
    );
    expect(await screen.findByText("ai_disable_confirm_title")).toBeTruthy();
    fireEvent.press(screen.getByTestId("modal-cancel"));
    expect(mockRevokeAiConsent).not.toHaveBeenCalled();
    expect(screen.queryByText("ai_disable_confirm_title")).toBeNull();
  });

  it("keeps SMS recovery actionable when SMS permission is denied but can be requested again", async () => {
    mockRequestLiveDetectionPermission.mockResolvedValue("denied");
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    expect(
      await screen.findByText("sms_permission_request_title")
    ).toBeTruthy();
    expect(screen.getByText("sms_permission_request_message")).toBeTruthy();
    expect(screen.getByText("sms_permission_allow")).toBeTruthy();
    expect(mockRequestLiveDetectionPermission).toHaveBeenCalledTimes(1);
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockSetLiveDetectionEnabled).not.toHaveBeenCalledWith(true);
    expect(mockStartSmsListener).not.toHaveBeenCalled();
  });

  it("opens the Allow SMS modal when live SMS permission can still be requested", async () => {
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "undetermined";
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );

    expect(
      await screen.findByText("sms_permission_request_title")
    ).toBeTruthy();
    expect(screen.getByText("sms_permission_request_message")).toBeTruthy();
    expect(screen.getByText("sms_permission_allow")).toBeTruthy();
    expect(mockRequestLiveDetectionPermission).not.toHaveBeenCalled();
    expect(mockSetLiveDetectionEnabled).not.toHaveBeenCalledWith(true);
    expect(mockStartSmsListener).not.toHaveBeenCalled();
  });

  it("opens SMS settings recovery when live SMS permission can no longer be requested", async () => {
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "blocked";
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );

    expect(
      await screen.findByText("sms_permission_blocked_title")
    ).toBeTruthy();
    expect(screen.getByText("sms_permission_blocked_message")).toBeTruthy();
    expect(screen.getByText("permission_open_settings")).toBeTruthy();
    expect(mockRequestLiveDetectionPermission).not.toHaveBeenCalled();
    expect(mockSetLiveDetectionEnabled).not.toHaveBeenCalledWith(true);
    expect(mockStartSmsListener).not.toHaveBeenCalled();
  });

  it("switches to Open Settings recovery when Android blocks the SMS prompt", async () => {
    mockRequestLiveDetectionPermission.mockResolvedValue("blocked");
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    expect(
      await screen.findByText("sms_permission_blocked_title")
    ).toBeTruthy();
    expect(screen.getByText("sms_permission_blocked_message")).toBeTruthy();
    expect(mockRequestLiveDetectionPermission).toHaveBeenCalledTimes(1);
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(screen.getByText("permission_open_settings")).toBeTruthy();
  });

  it("opens device settings from the blocked recovery modal", async () => {
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "blocked";
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    });
  });

  it("enables live detection after returning from settings with SMS permission granted", async () => {
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "blocked";
    mockRecheckPermission.mockImplementation(() => {
      mockLiveDetectionPermissionStatus = "granted";
      return Promise.resolve();
    });
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    });

    emitAppStateChange("background");
    emitAppStateChange("active");

    await waitFor(() => {
      expect(mockRecheckPermission).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(true);
    });
    expect(mockStartSmsListener).toHaveBeenCalledTimes(1);
  });

  it("reopens SMS settings recovery when permission recheck fails", async () => {
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "blocked";
    mockRecheckPermission.mockRejectedValue(new Error("recheck failed"));
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    });

    emitAppStateChange("background");
    emitAppStateChange("active");

    await waitFor(() => {
      expect(mockRecheckPermission).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      await screen.findByText("sms_permission_blocked_title")
    ).toBeTruthy();
    expect(mockSetLiveDetectionEnabled).not.toHaveBeenCalledWith(true);
  });

  it("reopens SMS settings recovery after returning without granting SMS permission", async () => {
    mockSmsPermissionStatus = "granted";
    mockLiveDetectionPermissionStatus = "blocked";
    const screen = await renderReadySettings();

    fireEvent(
      screen.getByTestId("live-sms-detection-switch"),
      "valueChange",
      true
    );
    fireEvent.press(await screen.findByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    });

    emitAppStateChange("background");
    emitAppStateChange("active");

    expect(
      await screen.findByText("sms_permission_blocked_title")
    ).toBeTruthy();
    expect(mockSetLiveDetectionEnabled).not.toHaveBeenCalledWith(true);
    expect(mockStartSmsListener).not.toHaveBeenCalled();
  });
});
