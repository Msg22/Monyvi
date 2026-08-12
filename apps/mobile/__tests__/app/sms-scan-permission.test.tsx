import React, { type ReactNode } from "react";
import { Platform } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

type SmsPermissionStatus = "undetermined" | "granted" | "denied" | "blocked";

const mockRequestPermission = jest.fn<Promise<SmsPermissionStatus>, []>();
const mockOpenSettings = jest.fn<Promise<void>, []>();
const mockRouterBack = jest.fn<void, []>();
const mockRouterReplace = jest.fn<void, [string]>();
const mockStartScan = jest.fn<void, [unknown]>();
const mockSetTransactions = jest.fn<void, [readonly unknown[]]>();
const mockSetScanMode = jest.fn<
  void,
  ["initial" | "incremental" | "history"]
>();
const mockGrantAiConsent = jest.fn<Promise<void>, []>();

let mockPermissionStatus: SmsPermissionStatus = "undetermined";
let mockIsAiConsented = true;
let mockIsAiConsentLoading = false;

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
  useRouter: () => ({
    back: mockRouterBack,
    canGoBack: () => true,
    push: jest.fn(),
    replace: mockRouterReplace,
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (): null => null,
}));

jest.mock("@/hooks/useSmsPermission", () => ({
  useSmsPermission: () => ({
    status: mockPermissionStatus,
    isLoading: false,
    requestPermission: mockRequestPermission,
    openSettings: mockOpenSettings,
  }),
}));

jest.mock("@/hooks/useSmsScan", () => ({
  useSmsScan: () => ({
    status: "idle",
    progress: null,
    result: null,
    transactions: [],
    error: null,
    startScan: mockStartScan,
  }),
}));

jest.mock("@/hooks/useSmsSync", () => ({
  useSmsSync: () => ({
    lastSyncTimestamp: null,
  }),
}));

jest.mock("@/hooks/useAiProcessingConsent", () => ({
  useAiProcessingConsent: () => ({
    isConsented: mockIsAiConsented,
    isLoading: mockIsAiConsentLoading,
    grantConsent: mockGrantAiConsent,
  }),
}));

jest.mock("@/components/ai-consent/AiProcessingConsentSheet", () => ({
  AiProcessingConsentSheet: ({
    visible,
    onContinue,
  }: {
    readonly visible: boolean;
    readonly onContinue: () => void | Promise<void>;
  }): ReactNode => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    const { Text, TouchableOpacity } = ReactNative;

    return visible ? (
      <>
        <Text>ai-consent</Text>
        <TouchableOpacity
          testID="ai-consent-continue"
          onPress={() => {
            void onContinue();
          }}
        >
          <Text>Continue</Text>
        </TouchableOpacity>
      </>
    ) : null;
  },
}));

jest.mock("@/context/SmsScanContext", () => ({
  useSmsScanContext: () => ({
    setTransactions: mockSetTransactions,
    scanMode: "incremental",
    setScanMode: mockSetScanMode,
  }),
}));

jest.mock("@/context/CategoriesContext", () => ({
  useAllCategories: () => ({
    categories: [],
    isLoading: false,
  }),
}));

jest.mock("@/services/sms-sync-service", () => ({
  loadExistingSmsFingerprints: jest.fn(() => Promise.resolve(new Set())),
}));

jest.mock("@/hooks/useSmsReviewDraftQueue", () => ({
  useSmsReviewDraftQueue: () => ({
    items: [],
    count: 0,
    userId: "user-1",
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

jest.mock("@/utils/category-tree-source", () => ({
  toCategoryTreeSources: jest.fn(() => []),
}));

jest.mock("@/components/sms-sync/SmsScanProgress", () => ({
  SmsScanProgress: () => null,
}));

jest.mock("@monyvi/logic", () => ({
  SUPPORTED_CURRENCIES: [{ code: "EGP" }],
}));

import SmsScanScreen from "@/app/(private)/sms-scan";

describe("SmsScanScreen permission rationale", () => {
  beforeAll(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPermissionStatus = "undetermined";
    mockIsAiConsented = true;
    mockIsAiConsentLoading = false;
    mockGrantAiConsent.mockResolvedValue();
    mockRequestPermission.mockResolvedValue("granted");
    mockOpenSettings.mockResolvedValue();
  });

  it("shows an app-side rationale before requesting first-time SMS permission", async () => {
    const screen = render(<SmsScanScreen />);

    expect(
      await screen.findByText("sms_sync_permission_request_title")
    ).toBeTruthy();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockStartScan).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    });
  });

  it("uses the blocked recovery CTA instead of requesting SMS permission", async () => {
    mockPermissionStatus = "blocked";

    const screen = render(<SmsScanScreen />);

    expect(
      await screen.findByText("sms_sync_permission_blocked_title")
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    });
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it("shows SMS permission before general AI consent on first-time import", async () => {
    mockIsAiConsented = false;
    mockPermissionStatus = "undetermined";

    const screen = render(<SmsScanScreen />);

    expect(
      await screen.findByText("sms_sync_permission_request_title")
    ).toBeTruthy();
    expect(screen.queryByText("ai-consent")).toBeNull();

    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockGrantAiConsent).not.toHaveBeenCalled();
    expect(mockStartScan).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    });

    mockPermissionStatus = "granted";
    screen.rerender(<SmsScanScreen />);

    expect(await screen.findByText("ai-consent")).toBeTruthy();
    expect(mockGrantAiConsent).not.toHaveBeenCalled();
    expect(mockStartScan).not.toHaveBeenCalled();
  });
});
