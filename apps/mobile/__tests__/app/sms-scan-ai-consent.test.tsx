import React, { type ReactNode } from "react";
import { Platform } from "react-native";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

const mockGrantAiConsent = jest.fn<Promise<void>, []>();
const mockRevokeAiConsent = jest.fn<Promise<void>, []>();
const mockRequestPermission = jest.fn<Promise<"granted">, []>();
const mockStartScan = jest.fn<Promise<void>, [unknown]>();
const mockResetScan = jest.fn<void, []>();
const mockLoadExistingSmsFingerprints = jest.fn<
  Promise<ReadonlySet<string>>,
  []
>();
const mockRouterBack = jest.fn();
const mockRouterPush = jest.fn<void, [string]>();
const mockRouterReplace = jest.fn<void, [string]>();
let mockIsAiConsented = false;
let mockScanStatus:
  | "idle"
  | "scanning"
  | "complete"
  | "error"
  | "consent_required" = "idle";

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

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (props: Record<string, unknown>): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <ReactNative.View {...props} />;
  },
}));

jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  useRouter: () => ({
    back: mockRouterBack,
    canGoBack: () => true,
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { readonly children?: ReactNode }): ReactNode =>
    children,
}));

jest.mock("@/components/sms-sync/SmsScanProgress", () => ({
  SmsScanProgress: (): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return (
      <ReactNative.Text testID="sms-scan-progress">progress</ReactNative.Text>
    );
  },
}));

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <ReactNative.Text>loading</ReactNative.Text>;
  },
}));

jest.mock("@/context/CategoriesContext", () => ({
  useAllCategories: () => ({ categories: [], isLoading: false }),
}));

jest.mock("@/context/SmsScanContext", () => ({
  useSmsScanContext: () => ({
    scanMode: "incremental",
    setTransactions: jest.fn(),
  }),
}));

jest.mock("@/hooks/useSmsScan", () => ({
  useSmsScan: () => ({
    error: null,
    progress: 0,
    result: null,
    reset: mockResetScan,
    startScan: mockStartScan,
    status: mockScanStatus,
    transactions: [],
  }),
}));

jest.mock("@/hooks/useSmsPermission", () => ({
  useSmsPermission: () => ({
    isLoading: false,
    openSettings: jest.fn(),
    requestPermission: mockRequestPermission,
    status: "granted",
  }),
}));

jest.mock("@/hooks/useSmsSync", () => ({
  useSmsSync: () => ({ lastSyncTimestamp: null }),
}));

jest.mock("@/hooks/useAiProcessingConsent", () => ({
  useAiProcessingConsent: () => ({
    grantConsent: mockGrantAiConsent,
    isConsented: mockIsAiConsented,
    isLoading: false,
    revokeConsent: mockRevokeAiConsent,
  }),
}));

jest.mock("@/services/sms-sync-service", () => ({
  loadExistingSmsFingerprints: (): Promise<ReadonlySet<string>> =>
    mockLoadExistingSmsFingerprints(),
}));

jest.mock("@/utils/category-tree-source", () => ({
  toCategoryTreeSources: jest.fn(() => []),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import SmsScanScreen from "@/app/(private)/sms-scan";

describe("SmsScanScreen AI consent", () => {
  beforeAll(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      get: () => "android",
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAiConsented = false;
    mockScanStatus = "idle";
    mockRequestPermission.mockResolvedValue("granted");
    mockRevokeAiConsent.mockResolvedValue();
    mockStartScan.mockResolvedValue();
    mockLoadExistingSmsFingerprints.mockResolvedValue(new Set());
  });

  it("keeps consent visible so the user can retry when granting consent fails", async () => {
    mockGrantAiConsent.mockRejectedValue(new Error("profile unavailable"));

    render(<SmsScanScreen />);

    fireEvent.press(await screen.findByTestId("ai-consent-continue"));

    await waitFor(() => {
      expect(mockGrantAiConsent).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("ai-consent-continue")).toBeTruthy();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockStartScan).not.toHaveBeenCalled();
  });

  it("waits for an aborted scan to settle before retrying after consent returns", async () => {
    let resolveFirstScan: () => void = () => {};
    const firstScan = new Promise<void>((resolve) => {
      resolveFirstScan = resolve;
    });
    mockIsAiConsented = true;
    mockStartScan.mockReturnValueOnce(firstScan).mockResolvedValue(undefined);
    const screenView = render(<SmsScanScreen />);

    await waitFor(() => expect(mockStartScan).toHaveBeenCalledTimes(1));

    mockIsAiConsented = false;
    screenView.rerender(<SmsScanScreen />);
    expect(await screen.findByTestId("ai-consent-continue")).toBeTruthy();

    mockGrantAiConsent.mockImplementation(() => {
      mockIsAiConsented = true;
      screenView.rerender(<SmsScanScreen />);
      return Promise.resolve();
    });
    fireEvent.press(screen.getByTestId("ai-consent-continue"));

    await waitFor(() => expect(mockGrantAiConsent).toHaveBeenCalledTimes(1));
    expect(mockStartScan).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstScan();
      await Promise.resolve();
    });

    await waitFor(() => expect(mockStartScan).toHaveBeenCalledTimes(2));
  });

  it("does not start scanning when consent is revoked while fingerprint preload is pending", async () => {
    mockIsAiConsented = true;
    let resolveFingerprints: () => void = () => {};
    mockLoadExistingSmsFingerprints.mockReturnValueOnce(
      new Promise<ReadonlySet<string>>((resolve) => {
        resolveFingerprints = () => resolve(new Set());
      })
    );

    const screenView = render(<SmsScanScreen />);

    await waitFor(() =>
      expect(mockLoadExistingSmsFingerprints).toHaveBeenCalledTimes(1)
    );
    mockIsAiConsented = false;
    screenView.rerender(<SmsScanScreen />);

    await act(async () => {
      resolveFingerprints();
      await Promise.resolve();
    });

    expect(mockStartScan).not.toHaveBeenCalled();
    expect(await screen.findByTestId("ai-consent-continue")).toBeTruthy();
  });

  it("reopens consent when the server rejects SMS parsing for missing consent", async () => {
    mockIsAiConsented = true;
    mockScanStatus = "consent_required";

    render(<SmsScanScreen />);

    expect(await screen.findByTestId("ai-consent-continue")).toBeTruthy();
    await waitFor(() => expect(mockRevokeAiConsent).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockResetScan).toHaveBeenCalledTimes(1));
    expect(mockStartScan).not.toHaveBeenCalled();
  });
});
