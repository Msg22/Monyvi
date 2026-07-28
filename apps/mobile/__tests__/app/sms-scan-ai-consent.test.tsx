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
const mockSetReviewSession = jest.fn();
const mockSetScanMode = jest.fn();
const mockMarkSyncComplete = jest.fn<Promise<void>, []>();
const mockFocusEffects: Array<() => void | (() => void)> = [];
let mockAiConsentContinue: (() => Promise<void>) | null = null;
let mockIsAiConsented = false;
let mockScanResult: Record<string, unknown> | null = null;
let mockScanTransactions: ReadonlyArray<Record<string, unknown>> = [];
let mockDraftItemCount = 0;
let mockDraftQueueLoading = false;
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
  useFocusEffect: (effect: () => void | (() => void)): void => {
    mockFocusEffects.push(effect);
  },
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

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (): null => null,
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { readonly children?: ReactNode }): ReactNode =>
    children,
}));

jest.mock("@/components/sms-sync/SmsScanProgress", () => ({
  SmsScanProgress: ({
    onReviewPress,
  }: {
    readonly onReviewPress: () => void;
  }): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return (
      <ReactNative.Pressable testID="sms-scan-review" onPress={onReviewPress}>
        <ReactNative.Text>Review</ReactNative.Text>
      </ReactNative.Pressable>
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

jest.mock("@/components/ai-consent/AiProcessingConsentSheet", () => ({
  AiProcessingConsentSheet: ({
    onContinue,
    visible,
  }: {
    readonly onContinue: () => Promise<void>;
    readonly visible: boolean;
  }): React.JSX.Element | null => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    mockAiConsentContinue = onContinue;

    return visible ? (
      <ReactNative.Text testID="ai-consent-continue">Continue</ReactNative.Text>
    ) : null;
  },
}));

jest.mock("@/context/CategoriesContext", () => ({
  useAllCategories: () => ({ categories: [], isLoading: false }),
}));

jest.mock("@/context/SmsScanContext", () => ({
  useSmsScanContext: () => ({
    scanMode: "incremental",
    setReviewSession: mockSetReviewSession,
    setScanMode: mockSetScanMode,
  }),
}));

jest.mock("@/hooks/useSmsScan", () => ({
  useSmsScan: () => ({
    error: null,
    progress: 0,
    result: mockScanResult,
    reset: mockResetScan,
    startScan: mockStartScan,
    status: mockScanStatus,
    transactions: mockScanTransactions,
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
  useSmsSync: () => ({
    lastSyncTimestamp: null,
    markSyncComplete: mockMarkSyncComplete,
  }),
}));

jest.mock("@/hooks/useAiProcessingConsent", () => ({
  useAiProcessingConsent: () => ({
    grantConsent: mockGrantAiConsent,
    isConsented: mockIsAiConsented,
    isLoading: false,
    revokeConsent: mockRevokeAiConsent,
  }),
}));

jest.mock("@/hooks/useSmsReviewDraftQueue", () => ({
  useSmsReviewDraftQueue: () => ({
    userId: "user-1",
    queueId: mockDraftItemCount > 0 ? "queue-1" : null,
    items: [],
    itemCount: mockDraftItemCount,
    isLoading: mockDraftQueueLoading,
    error: null,
    refetch: jest.fn(),
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

async function flushAsyncConsentUpdates(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function continueAiConsent(): Promise<void> {
  if (!mockAiConsentContinue) {
    throw new Error("AI consent continue handler was not rendered");
  }

  await act(async () => {
    await mockAiConsentContinue?.();
    await flushAsyncConsentUpdates();
  });
}

describe("SmsScanScreen AI consent", () => {
  beforeAll(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      get: () => "android",
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAiConsentContinue = null;
    mockSetScanMode.mockClear();
    mockFocusEffects.length = 0;
    mockIsAiConsented = false;
    mockScanResult = null;
    mockScanTransactions = [];
    mockScanStatus = "idle";
    mockDraftItemCount = 0;
    mockDraftQueueLoading = false;
    mockRequestPermission.mockResolvedValue("granted");
    mockRevokeAiConsent.mockResolvedValue();
    mockStartScan.mockResolvedValue();
    mockLoadExistingSmsFingerprints.mockResolvedValue(new Set());
    mockMarkSyncComplete.mockResolvedValue();
  });

  it("resumes durable drafts without requiring current AI consent", async () => {
    mockDraftItemCount = 3;
    mockIsAiConsented = false;

    render(<SmsScanScreen />);

    expect(await screen.findByTestId("sms-review-resume-primary")).toBeTruthy();
    expect(screen.queryByTestId("ai-consent-continue")).toBeNull();
    expect(mockStartScan).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("sms-review-resume-primary"));

    expect(mockRouterPush).toHaveBeenCalledWith("/sms-review");
  });

  it("applies consent before checking for new messages from an active queue", async () => {
    mockDraftItemCount = 2;
    mockIsAiConsented = false;

    render(<SmsScanScreen />);
    fireEvent.press(await screen.findByTestId("sms-review-check-new"));

    expect(await screen.findByTestId("ai-consent-continue")).toBeTruthy();
    expect(mockStartScan).not.toHaveBeenCalled();
  });

  it("keeps consent visible so the user can retry when granting consent fails", async () => {
    mockGrantAiConsent.mockRejectedValue(new Error("profile unavailable"));

    render(<SmsScanScreen />);

    expect(await screen.findByTestId("ai-consent-continue")).toBeTruthy();
    await continueAiConsent();

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
    await continueAiConsent();

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

  it("lets the scan service load fingerprints when screen preload fails", async () => {
    mockIsAiConsented = true;
    mockLoadExistingSmsFingerprints.mockRejectedValueOnce(
      new Error("fingerprint preload failed")
    );

    render(<SmsScanScreen />);

    await waitFor(() => expect(mockStartScan).toHaveBeenCalledTimes(1));
    expect(mockStartScan).toHaveBeenCalledWith(
      expect.objectContaining({ existingFingerprints: undefined })
    );
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

  it("waits for stale consent revocation before granting consent again", async () => {
    mockIsAiConsented = true;
    mockScanStatus = "consent_required";
    let resolveRevoke: () => void = () => {};
    mockRevokeAiConsent.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRevoke = resolve;
      })
    );

    render(<SmsScanScreen />);

    expect(await screen.findByTestId("ai-consent-continue")).toBeTruthy();
    if (!mockAiConsentContinue) {
      throw new Error("AI consent continue handler was not rendered");
    }

    const continuePromise = mockAiConsentContinue();

    await waitFor(() => expect(mockRevokeAiConsent).toHaveBeenCalledTimes(1));
    expect(mockGrantAiConsent).not.toHaveBeenCalled();

    await act(async () => {
      resolveRevoke();
      await continuePromise;
      await flushAsyncConsentUpdates();
    });

    await waitFor(() => expect(mockGrantAiConsent).toHaveBeenCalledTimes(1));
  });

  it("keeps the completed scan available after returning from transaction review", () => {
    mockIsAiConsented = true;
    mockScanStatus = "complete";
    mockScanTransactions = [{ smsFingerprint: "fp-1" }];
    mockScanResult = {
      transactions: mockScanTransactions,
      unresolvedCandidates: [{ candidate: { message: { body: "private" } } }],
      parseContext: { categories: [], supportedCurrencies: ["EGP"] },
    };

    render(<SmsScanScreen />);
    expect(mockSetScanMode).toHaveBeenCalledWith("incremental");
    fireEvent.press(screen.getByTestId("sms-scan-review"));

    expect(mockSetReviewSession).toHaveBeenCalledWith(mockScanResult);
    expect(mockRouterPush).toHaveBeenCalledWith("/sms-review");

    act(() => {
      for (const focusEffect of mockFocusEffects) focusEffect();
    });

    expect(mockResetScan).not.toHaveBeenCalled();
  });

  it("opens review for a partial scan that has only retryable candidates", () => {
    mockIsAiConsented = true;
    mockScanStatus = "complete";
    mockScanTransactions = [];
    mockScanResult = {
      transactions: [],
      unresolvedCandidates: [
        {
          candidate: { message: { body: "private" } },
          isRetryable: true,
        },
      ],
      parseContext: { categories: [], supportedCurrencies: ["EGP"] },
    };

    render(<SmsScanScreen />);
    fireEvent.press(screen.getByTestId("sms-scan-review"));

    expect(mockSetReviewSession).toHaveBeenCalledWith(mockScanResult);
    expect(mockRouterPush).toHaveBeenCalledWith("/sms-review");
  });

  it("records a successful clean scan even when it produces no review suggestions", async () => {
    mockIsAiConsented = true;
    mockScanStatus = "complete";
    mockScanTransactions = [];
    mockScanResult = {
      transactions: [],
      unresolvedCandidates: [],
      parseContext: { categories: [], supportedCurrencies: ["EGP"] },
      safeguardSummary: {
        completionStatus: "complete",
        deferredAiCount: 0,
        oversizedCount: 0,
        unresolvedCount: 0,
      },
    };

    render(<SmsScanScreen />);

    await waitFor(() => expect(mockMarkSyncComplete).toHaveBeenCalledTimes(1));
  });
});
