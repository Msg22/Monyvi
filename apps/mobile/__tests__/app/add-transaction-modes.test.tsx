import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";

import {
  getTestInstanceParent,
  getTestInstanceProps,
} from "@/__tests__/test-utils/test-instance-props";

let mockRouteParams: Readonly<Record<string, string | undefined>> = {};
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();
const mockVoiceAvailabilityRefresh = jest.fn();
const mockVoiceStartFlow = jest.fn();
const mockVoiceDiscardRecording = jest.fn();
type CreateTransaction = typeof import("@/services/transaction-service").createTransaction;
type CreatedTransactionFixture = Pick<Awaited<ReturnType<CreateTransaction>>, "id">;
const mockCreateTransaction = jest.fn<
  Promise<CreatedTransactionFixture>,
  Parameters<CreateTransaction>
>();
const mockGrantConsent = jest.fn<Promise<void>, []>();
const unconsentedStatus = {
  consent: null,
  isConsented: false,
  userId: "user-1",
} as const;
type GetConsentStatus = typeof import("@/services/profile-service").getAiProcessingConsentStatus;
const mockGetAiProcessingConsentStatus = jest.fn<
  ReturnType<GetConsentStatus>,
  Parameters<GetConsentStatus>
>();
let mockFocusCallback: (() => void) | null = null;
let mockAiConsentLoading = false;
let mockAiConsented = false;
let mockVoiceHasPermission = true;
let mockVoiceFlowStatus:
  | "idle" | "recording" | "paused" | "completed" | "analyzing" | "error" =
  "idle";
let mockVoiceModeSwitchLocked = false;
let mockVoiceAvailabilityErrorKind: "network" | "consent_required" | null = null;
let mockVoiceAvailabilityLoading = false;
let mockVoiceRefusalReason:
  | "daily_limit" | "burst_limit" | "already_processed_result_unavailable" | null =
  null;
const initialVoiceAvailability = {
  serverNow: "2026-10-08T01:00:00.000Z",
  timeZone: "Africa/Cairo",
  dailyLimit: 5,
  remaining: 5,
  resetAt: "2026-10-08T21:00:00.000Z",
  reason: null as "daily_limit" | "burst_limit" | null,
  availableAt: null as string | null,
  burstAvailableAt: null as string | null,
  policyVersion: "test",
};
let mockVoiceAvailability = { ...initialVoiceAvailability };

jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    setParams: mockSetParams,
  }),
  useLocalSearchParams: (): Readonly<Record<string, string | undefined>> =>
    mockRouteParams,
  useFocusEffect: (callback: () => void): void => {
    mockFocusCallback = callback;
  },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => {
      if (key === "voice_limit_heading") return "VOICE_QUOTA_HEADING";
      if (key === "voice_limit_unavailable") return "VOICE_UNAVAILABLE_BODY";
      const normalized = key.toLowerCase();
      if (normalized.includes("manual")) return "Manual";
      if (normalized.includes("voice")) return "Voice";
      return key;
    },
  }),
}));
jest.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({
    accounts: [
      {
        id: "cash-1",
        name: "Cash",
        isDefault: true,
        type: "CASH",
        balance: 1000,
        currency: "EGP",
      },
    ],
  }),
}));
jest.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({
    categories: [],
    expenseCategories: [
      {
        id: "cat-food",
        displayName: "Food",
        color: "#16a34a",
        icon: "restaurant-outline",
        iconLibrary: "ionicons",
      },
    ],
    incomeCategories: [],
    isLoading: false,
  }),
}));
jest.mock("@/hooks/useCategoryChildren", () => ({
  useCategoryChildren: () => ({ children: [] }),
}));
jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: () => ({ selectedSnapshot: null }),
}));
jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: () => ({ preferredCurrency: "EGP" }),
}));
jest.mock("@/hooks/useBudgetAlert", () => ({
  useBudgetAlert: () => ({
    alert: null,
    isVisible: false,
    checkAfterTransaction: jest.fn().mockResolvedValue(false),
    dismiss: jest.fn(),
    viewBudget: jest.fn(),
  }),
}));
jest.mock("@/hooks/useFormScroll", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  return {
    useFormScroll: () => ({
      scrollViewRef: ReactActual.createRef(),
      getFieldRef: () => ReactActual.createRef(),
      onScroll: jest.fn(),
      scrollToFirstError: jest.fn(),
    }),
  };
});

jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));
jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => ({
    language: "en",
    isRTL: false,
    fontFamily: jest.requireActual<
      typeof import("@/constants/typography")
    >("@/constants/typography").fontFamily,
  }),
}));
jest.mock("@/context/CategoriesContext", () => ({
  useCategoryLookup: () =>
    new Map([
      [
        "cat-food",
        {
          id: "cat-food",
          displayName: "Food",
          color: "#16a34a",
          icon: "restaurant-outline",
          iconLibrary: "ionicons",
        },
      ],
    ]),
}));
jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: ({
    title,
    rightAction,
    onBack,
  }: {
    readonly title: string;
    readonly rightAction?: {
      readonly onPress: () => void;
    };
    readonly onBack?: () => void;
  }): React.JSX.Element => {
    const { Pressable, Text, View } =
      jest.requireActual<typeof import("react-native")>("react-native");

    return (
      <View>
        <Text testID="page-header">{title}</Text>
        {rightAction ? (
          <Pressable testID="header-save" onPress={rightAction.onPress} />
        ) : null}
        {onBack ? <Pressable testID="header-back" onPress={onBack} /> : null}
      </View>
    );
  },
}));
jest.mock("@/components/add-transaction/CalculatorKeypad", () => ({
  CalculatorKeypad: ({
    onKeyPress,
  }: {
    readonly onKeyPress: (key: "1") => Promise<void>;
  }): React.JSX.Element => {
    const { Pressable, Text } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return (
      <Pressable testID="key-1" onPress={() => void onKeyPress("1")}>
        <Text>1</Text>
      </Pressable>
    );
  },
}));

jest.mock("@/components/add-transaction/TypeTabs", () => ({
  TypeTabs: (): null => null,
}));
jest.mock("@/components/add-transaction/CategoryPicker", () => ({
  CategoryPicker: (): null => null,
}));
jest.mock("@/components/add-transaction/TransferFields", () => ({
  TransferFields: (): null => null,
}));
jest.mock("@/components/add-transaction/OptionalSection", () => ({
  OptionalSection: (): null => null,
}));

jest.mock("@/components/common/CategoryIcon", () => ({
  CategoryIcon: (): null => null,
  CategoryIconFromModel: (): null => null,
  IconLibrary: {},
}));

jest.mock("@/components/modals/AccountSelectorModal", () => ({
  AccountSelectorModal: (): null => null,
}));
jest.mock("@/components/modals/CategorySelectorModal", () => ({
  CategorySelectorModal: (): null => null,
}));
jest.mock("@/components/ui/EmptyStateCard", () => ({
  EmptyStateCard: (): null => null,
}));

jest.mock("@/components/budget/BudgetAlertModal", () => ({
  BudgetAlertModal: (): null => null,
}));

jest.mock("@/components/add-transaction/VoiceTransactionEntry", () => ({
  VoiceTransactionEntry: ({
    state,
    onStart,
  }: {
    readonly state: string;
    readonly onStart: () => void;
  }): React.JSX.Element => {
    const { Pressable, Text, View } =
      jest.requireActual<typeof import("react-native")>("react-native");

    return (
      <View>
        <Text testID="voice-entry-state">{state}</Text>
        <Pressable testID="voice-start" onPress={onStart} />
      </View>
    );
  },
}));

jest.mock("@/components/ai-consent/AiProcessingConsentSheet", () => ({
  AiProcessingConsentSheet: ({
    visible,
    onContinue,
    onPrivacyDetails,
  }: {
    readonly visible: boolean;
    readonly onContinue: () => void | Promise<void>;
    readonly onPrivacyDetails: () => void;
  }): React.JSX.Element | null => {
    const { Pressable, View } =
      jest.requireActual<typeof import("react-native")>("react-native");

    return visible ? (
      <View>
        <Pressable
          testID="voice-consent-continue"
          onPress={() => {
            void onContinue();
          }}
        />
        <Pressable testID="voice-privacy-details" onPress={onPrivacyDetails} />
      </View>
    ) : null;
  },
}));

jest.mock("@/components/permissions/PermissionRecoveryModal", () => ({
  PermissionRecoveryModal: ({
    visible,
    onPrimaryPress,
  }: {
    readonly visible: boolean;
    readonly onPrimaryPress: () => void;
  }): React.JSX.Element | null => {
    const { View, Pressable } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return visible ? (
      <View testID="microphone-recovery-modal">
        <Pressable
          testID="microphone-recovery-primary"
          onPress={onPrimaryPress}
        />
      </View>
    ) : null;
  },
}));

jest.mock("@/hooks/useAiProcessingConsent", () => ({
  useAiProcessingConsent: () => ({
    consent: null,
    isConsented: mockAiConsented,
    isLoading: mockAiConsentLoading,
    grantConsent: mockGrantConsent,
    revokeConsent: jest.fn(() => Promise.resolve()),
  }),
}));

jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: (
    ...args: Parameters<GetConsentStatus>
  ): ReturnType<GetConsentStatus> => mockGetAiProcessingConsentStatus(...args),
}));

jest.mock("@/hooks/useVoiceAiAvailability", () => ({
  useVoiceAiAvailability: () => ({
    availability: mockVoiceAvailabilityLoading
      ? null
      : mockVoiceAvailability,
    isLoading: mockVoiceAvailabilityLoading,
    error: mockVoiceAvailabilityErrorKind === null
      ? null
      : { kind: mockVoiceAvailabilityErrorKind },
    refresh: () => {
      mockVoiceAvailabilityRefresh();
      return Promise.resolve(mockVoiceAvailability);
    },
    reconcileAuthoritativeSnapshot: jest.fn(),
  }),
}));

jest.mock("@/hooks/useVoiceTransactionFlow", () => ({
  useVoiceTransactionFlow: () => ({
    flowStatus: mockVoiceFlowStatus,
    isOverlayVisible: false,
    durationMs: 0,
    errorMessage: null,
    isMicrophonePermissionError: false,
    hasPermission: mockVoiceHasPermission,
    isModeSwitchLocked: mockVoiceModeSwitchLocked,
    isFinalizing: false,
    refusalReason: mockVoiceRefusalReason,
    canRetrySubmission: false,
    startFlow: mockVoiceStartFlow,
    pauseRecording: jest.fn(),
    resumeRecording: jest.fn(),
    submitRecording: jest.fn(),
    retrySubmission: jest.fn(),
    discardRecording: mockVoiceDiscardRecording,
    retryRecording: jest.fn(),
    openMicrophoneSettings: jest.fn(),
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (): null => null,
}));

jest.mock("@/services/recurring-payment-service", () => ({
  createRecurringPayment: jest.fn(),
  deleteRecurringPayment: jest.fn(),
  RECURRING_PAYMENT_SERVICE_ERROR_CODES: {
    ACCOUNT_UNAVAILABLE: "RECURRING_PAYMENT_ACCOUNT_UNAVAILABLE",
    CATEGORY_UNAVAILABLE: "RECURRING_PAYMENT_CATEGORY_UNAVAILABLE",
    INVALID_START_DATE: "RECURRING_PAYMENT_INVALID_START_DATE",
  },
}));

jest.mock("@/services/transaction-service", () => ({
  createTransaction: (
    ...args: Parameters<CreateTransaction>
  ): Promise<CreatedTransactionFixture> => mockCreateTransaction(...args),
}));

jest.mock("@/services/transfer-service", () => ({
  createTransfer: jest.fn(),
}));

import AddTransaction from "@/app/(private)/add-transaction";
import { ManualTransactionEntry } from "@/components/add-transaction/ManualTransactionEntry";

function renderRoute(mode: string | undefined): ReturnType<typeof render> {
  mockRouteParams = mode === undefined ? {} : { mode };
  return render(<AddTransaction />);
}

function expectTabState(
  mode: "Manual" | "Voice",
  expected: Readonly<{ selected?: boolean; disabled?: boolean }>
): void {
  const tab: unknown = screen.getByRole("tab", { name: mode });
  expect(getTestInstanceProps(tab).accessibilityState).toEqual(
    expect.objectContaining(expected)
  );
}

async function enterOneManualUnit(): Promise<void> {
  expect(screen.queryByTestId("key-1")).toBeNull();
  fireEvent(screen.getByTestId("manual-amount-input"), "focus");
  await act(async () => {
    fireEvent.press(screen.getByTestId("key-1"));
    await Promise.resolve();
  });
  expect(screen.getByTestId("manual-amount-input")).toHaveProp("value", "1");
}

describe("AddTransaction unified mode intent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};
    mockFocusCallback = null;
    mockAiConsentLoading = false;
    mockAiConsented = false;
    mockVoiceHasPermission = true;
    mockVoiceFlowStatus = "idle";
    mockVoiceModeSwitchLocked = false;
    mockVoiceAvailabilityErrorKind = null;
    mockVoiceAvailabilityLoading = false;
    mockVoiceRefusalReason = null;
    mockGrantConsent.mockReset().mockResolvedValue();
    mockVoiceStartFlow.mockReset().mockResolvedValue(undefined);
    mockVoiceDiscardRecording.mockReset().mockResolvedValue(undefined);
    mockCreateTransaction.mockReset().mockResolvedValue({ id: "tx-1" });
    mockGetAiProcessingConsentStatus.mockReset().mockResolvedValue({
      consent: null,
      isConsented: true,
      userId: "user-1",
    });
    mockVoiceAvailability = { ...initialVoiceAvailability };
  });

  it("uses one Add Transaction shell and selects Voice for mode=voice", () => {
    renderRoute("voice");

    expect(screen.getAllByTestId("page-header")).toHaveLength(1);

    expectTabState("Voice", { selected: true });
    expectTabState("Manual", { selected: false });
  });

  it("preserves observable Manual amount state across safe mode switches", async (): Promise<void> => {
    renderRoute("manual");

    await enterOneManualUnit();

    await act(async (): Promise<void> => {
      fireEvent.press(screen.getByRole("tab", { name: "Voice" }));
      await Promise.resolve();
    });
    await act(async (): Promise<void> => {
      fireEvent.press(screen.getByRole("tab", { name: "Manual" }));
      await Promise.resolve();
    });

    expect(screen.getByTestId("manual-amount-input")).toHaveProp("value", "1");
  });

  it("keeps the unified shell wired to the real Manual save contract", async () => {
    renderRoute("manual");

    await enterOneManualUnit();

    fireEvent.press(screen.getByTestId("header-save"));

    await waitFor(() => expect(mockCreateTransaction).toHaveBeenCalledTimes(1));
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1,
        currency: "EGP",
        accountId: "cash-1",
        categoryId: "cat-food",
        source: "MANUAL",
        type: "EXPENSE",
      })
    );
  });

  it("blocks Voice and Back while a Manual save is pending, then navigates once", async () => {
    const pending = createDeferred<CreatedTransactionFixture>();
    mockCreateTransaction.mockReturnValueOnce(pending.promise);
    renderRoute("manual");
    await enterOneManualUnit();
    fireEvent.press(screen.getByTestId("header-save"));
    await waitFor(() => expect(mockCreateTransaction).toHaveBeenCalledTimes(1));

    const voiceTab: unknown = screen.getByRole("tab", { name: "Voice" });
    const disabledDuringSave = getTestInstanceProps(voiceTab).accessibilityState;
    fireEvent.press(screen.getByRole("tab", { name: "Voice" }));
    fireEvent.press(screen.getByTestId("header-back"));
    await act(async () => {
      await Promise.resolve();
    });
    const manualSelectedWhilePending = getTestInstanceProps(
      screen.getByRole("tab", { name: "Manual" })
    ).accessibilityState;
    const navigationCountWhilePending = mockBack.mock.calls.length;

    await act(async () => {
      pending.resolve({ id: "tx-1" });
      await pending.promise;
      await Promise.resolve();
    });

    expect(disabledDuringSave).toEqual(
      expect.objectContaining({ disabled: true })
    );
    expect(manualSelectedWhilePending).toEqual(
      expect.objectContaining({ selected: true })
    );
    expect(navigationCountWhilePending).toBe(0);
    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("locks mode switching while consent grant is pending", async () => {
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce(unconsentedStatus);
    const grant = createDeferred<void>();
    mockGrantConsent.mockReturnValueOnce(grant.promise);
    renderRoute("voice");

    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor(() =>
      expect(screen.getByTestId("voice-consent-continue")).toBeTruthy()
    );

    fireEvent.press(screen.getByTestId("voice-consent-continue"));

    expectTabState("Manual", { disabled: true });

    await act(async (): Promise<void> => {
      grant.resolve(undefined);
      await grant.promise;
    });
    // Consent continuation must finish before automatic RNTL cleanup.
    await waitFor(() =>
      expectTabState("Manual", { disabled: false })
    );
  });

  it("does not start or show permission recovery after Back invalidates a pending grant", async () => {
    mockVoiceHasPermission = false;
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce(unconsentedStatus);
    const grant = createDeferred<void>();
    mockGrantConsent.mockReturnValueOnce(grant.promise);
    renderRoute("voice");

    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor(() =>
      expect(screen.getByTestId("voice-consent-continue")).toBeTruthy()
    );
    fireEvent.press(screen.getByTestId("voice-consent-continue"));
    fireEvent.press(screen.getByTestId("header-back"));

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));

    await act(async (): Promise<void> => {
      grant.resolve(undefined);
      await grant.promise;
      await Promise.resolve();
    });

    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
    expect(screen.queryByTestId("microphone-recovery-modal")).toBeNull();
  });

  it("grants consent once and hands successful start to the Voice hook once", async () => {
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce(unconsentedStatus);
    const grant = createDeferred<void>();
    const hookStart = createDeferred<void>();
    mockGrantConsent.mockReturnValueOnce(grant.promise);
    mockVoiceStartFlow.mockReturnValueOnce(hookStart.promise);
    renderRoute("voice");

    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor(() =>
      expect(screen.getByTestId("voice-consent-continue")).toBeTruthy()
    );

    fireEvent.press(screen.getByTestId("voice-consent-continue"));
    fireEvent.press(screen.getByTestId("voice-consent-continue"));

    expect(mockGrantConsent).toHaveBeenCalledTimes(1);

    await act(async (): Promise<void> => {
      grant.resolve(undefined);
      await grant.promise;
      await Promise.resolve();
    });

    expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1);
    expect(mockVoiceStartFlow).toHaveBeenCalledWith({
      skipAiProcessingConsent: true,
    });
    expectTabState("Manual", { disabled: true });

    await act(async (): Promise<void> => {
      hookStart.resolve(undefined);
      await hookStart.promise;
    });

    expectTabState("Manual", { disabled: false });
  });

  it("drops a stale daily refusal after authoritative availability becomes ready", () => {
    mockVoiceRefusalReason = "daily_limit";
    mockVoiceAvailability = {
      ...mockVoiceAvailability,
      remaining: 0,
      reason: "daily_limit",
      availableAt: "2026-10-08T21:00:00.000Z",
    };
    const view = renderRoute("voice");

    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent(
      "daily-limit"
    );

    mockVoiceAvailability = {
      ...mockVoiceAvailability,
      remaining: 5,
      reason: null,
      availableAt: null,
    };
    view.rerender(<AddTransaction />);

    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent("idle");
  });

  it("reopens consent after returning from privacy details", async (): Promise<void> => {
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce(unconsentedStatus);
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor((): void => {
      expect(screen.getByTestId("voice-privacy-details")).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId("voice-privacy-details"));
    expect(mockPush).toHaveBeenCalledWith("/privacy-details");
    expect(screen.queryByTestId("voice-privacy-details")).toBeNull();
    act((): void => {
      mockFocusCallback?.();
    });
    expect(screen.getByTestId("voice-privacy-details")).toBeTruthy();
    // Privacy-return recovery must leave no pending start at teardown.
    await waitFor(() =>
      expectTabState("Manual", { disabled: false })
    );
  });

  it("keeps consent visible when granting it fails", async (): Promise<void> => {
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce(unconsentedStatus);
    mockGrantConsent.mockRejectedValueOnce(new Error("profile unavailable"));
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor((): void => {
      expect(screen.getByTestId("voice-consent-continue")).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId("voice-consent-continue"));
    await waitFor((): void => {
      expect(mockGrantConsent).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("voice-consent-continue")).toBeTruthy();
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
    // Rejected consent is caught and the pending-start lock is released.
    await waitFor(() =>
      expectTabState("Manual", { disabled: false })
    );
  });

  it("uses fresh profile consent when mounted consent is stale", async (): Promise<void> => {
    mockAiConsented = true;
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce(unconsentedStatus);
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor((): void => {
      expect(screen.getByTestId("voice-consent-continue")).toBeTruthy();
    });
    expect(mockGetAiProcessingConsentStatus).toHaveBeenCalledTimes(1);
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
    // The fresh-status rejection returns without a dangling pending start.
    await waitFor(() =>
      expectTabState("Manual", { disabled: false })
    );
  });

  it("preserves retry intent until consent loading finishes", async (): Promise<void> => {
    mockRouteParams = { mode: "voice", retry: "true" };
    mockAiConsentLoading = true;
    const view = render(<AddTransaction />);
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
    mockAiConsentLoading = false;
    view.rerender(<AddTransaction />);
    await waitFor((): void => {
      expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1);
    });
    expect(mockSetParams).toHaveBeenCalledWith({ retry: undefined });
    // Wait for the request's finally cleanup, not only hook invocation,
    // before automatic route teardown.
    await waitFor(() =>
      expectTabState("Manual", { disabled: false })
    );
  });

  it("explains microphone access after consent and starts only from the custom action", async (): Promise<void> => {
    mockVoiceHasPermission = false;
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce(unconsentedStatus);
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor((): void => {
      expect(screen.getByTestId("voice-consent-continue")).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId("voice-consent-continue"));
    await waitFor((): void => {
      expect(screen.getByTestId("microphone-recovery-modal")).toBeTruthy();
    });
    expect(mockGrantConsent).toHaveBeenCalledTimes(1);
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
    expect(screen.queryByTestId("voice-consent-continue")).toBeNull();
    fireEvent.press(screen.getByTestId("microphone-recovery-primary"));
    await waitFor((): void => {
      expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1);
    });
    expect(mockVoiceStartFlow).toHaveBeenCalledWith({
      skipAiProcessingConsent: true,
    });
  });

  it("drops a stale burst refusal after authoritative capacity returns", (): void => {
    mockVoiceRefusalReason = "burst_limit";
    mockVoiceAvailability = {
      ...mockVoiceAvailability,
      reason: "burst_limit",
      availableAt: "2026-10-08T01:00:30.000Z",
    };
    const view = renderRoute("voice");
    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent(
      "burst-limit"
    );
    mockVoiceAvailability = {
      ...mockVoiceAvailability,
      reason: null,
      availableAt: null,
    };
    view.rerender(<AddTransaction />);
    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent("idle");
  });
  it.each([undefined, "manual", "invalid", "VOICE"])(
    "defaults %s route intent to Manual without showing Voice quota",
    (requested) => {
      renderRoute(requested);
      expectTabState("Manual", { selected: true });
      expect(screen.getByTestId("header-save")).toBeOnTheScreen();
      expect(screen.queryByText("VOICE_QUOTA_HEADING")).toBeNull();
    }
  );

  it.each([
    ["available", 3, null, null, false],
    ["exhausted", 0, "daily_limit", null, false],
    ["burst-blocked", 3, "burst_limit", null, false],
    ["availability-error", 3, null, "network", false],
    ["consent-required", 3, null, "consent_required", false],
    ["null-loading", 3, null, null, true],
  ] as const)(
    "keeps all Voice counters and errors off the visible Manual form: %s",
    (_label, remaining, reason, errorKind, isLoading) => {
      mockVoiceAvailability = {
        ...mockVoiceAvailability,
        remaining,
        reason,
      };
      mockVoiceAvailabilityErrorKind = errorKind;
      mockVoiceAvailabilityLoading = isLoading;
      renderRoute("manual");

      expect(screen.queryByText("VOICE_QUOTA_HEADING")).toBeNull();
      expect(screen.queryByText("VOICE_UNAVAILABLE_BODY")).toBeNull();
      expect(screen.getByTestId("header-save")).toBeOnTheScreen();
      expectTabState("Manual", { selected: true });
    }
  );

  it("passes active mode into the kept-mounted Manual entry without exposing the hidden subtree", () => {
    renderRoute("manual");
    expect(getTestInstanceProps(screen.UNSAFE_getByType(ManualTransactionEntry)).isActive).toBe(
      true
    );

    fireEvent.press(screen.getByRole("tab", { name: "Voice" }));

    expect(getTestInstanceProps(screen.UNSAFE_getByType(ManualTransactionEntry)).isActive).toBe(
      false
    );
    expect(screen.queryByTestId("header-save")).toBeNull();

    expect(screen.queryByTestId("manual-amount-input")).toBeNull();
    const amount: unknown = screen.getByTestId("manual-amount-input", {
      includeHiddenElements: true,
    });
    let container: unknown = getTestInstanceParent(amount);
    while (
      container !== null &&
      container !== undefined &&
      getTestInstanceProps(container).accessibilityElementsHidden === undefined
    ) {
      container = getTestInstanceParent(container);
    }
    expect(getTestInstanceProps(container).accessibilityElementsHidden).toBe(true);
    expect(getTestInstanceProps(container).importantForAccessibility).toBe(
      "no-hide-descendants"
    );

    fireEvent.press(screen.getByRole("tab", { name: "Manual" }));

    expect(getTestInstanceProps(screen.UNSAFE_getByType(ManualTransactionEntry)).isActive).toBe(
      true
    );
    expect(screen.getByTestId("header-save")).toBeOnTheScreen();
  });

  it("keeps Voice unavailable, daily exhaustion, and burst failures nonblocking for Manual", () => {
    mockVoiceAvailability = {
      ...mockVoiceAvailability,
      remaining: 0,
      reason: "daily_limit",
    };
    renderRoute("voice");
    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent("daily-limit");
    expect(screen.queryByTestId("header-save")).toBeNull();

    fireEvent.press(screen.getByRole("tab", { name: "Manual" }));
    expect(screen.getByTestId("header-save")).toBeOnTheScreen();
    expect(screen.queryByText("VOICE_QUOTA_HEADING")).toBeNull();
  });

  it.each(["recording", "paused", "analyzing"] as const)(
    "preserves the mode-switch lock during %s",
    (status) => {
      mockVoiceFlowStatus = status;
      mockVoiceModeSwitchLocked = true;
      renderRoute("voice");

      const manual: unknown = screen.getByRole("tab", { name: "Manual" });
      expect(getTestInstanceProps(manual).accessibilityState).toEqual(
        expect.objectContaining({ disabled: true })
      );
      fireEvent.press(screen.getByRole("tab", { name: "Manual" }));
      expectTabState("Voice", { selected: true });
    }
  );

});

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: (value: T) => void = (): void => {};
  const promise = new Promise<T>((resolve): void => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: resolvePromise,
  };
}
