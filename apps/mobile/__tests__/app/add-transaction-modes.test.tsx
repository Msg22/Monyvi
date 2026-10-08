import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";

let mockRouteParams: Readonly<Record<string, string | undefined>> = {};
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();
const mockVoiceAvailabilityRefresh = jest.fn();
const mockVoiceStartFlow = jest.fn();
const mockVoiceDiscardRecording = jest.fn();
type CreatedTransactionFixture = Pick<
  Awaited<
    ReturnType<
      typeof import("@/services/transaction-service").createTransaction
    >
  >,
  "id"
>;
const mockCreateTransaction = jest.fn<
  Promise<CreatedTransactionFixture>,
  Parameters<typeof import("@/services/transaction-service").createTransaction>
>();
const mockGrantConsent = jest.fn<Promise<void>, []>();
const mockGetAiProcessingConsentStatus = jest.fn<
  ReturnType<
    typeof import("@/services/profile-service").getAiProcessingConsentStatus
  >,
  Parameters<
    typeof import("@/services/profile-service").getAiProcessingConsentStatus
  >
>();
let mockFocusCallback: (() => void) | null = null;
let mockAiConsentLoading = false;
let mockAiConsented = false;
let mockVoiceHasPermission = true;
let mockVoiceRefusalReason:
  | "daily_limit"
  | "burst_limit"
  | "already_processed_result_unavailable"
  | null = null;
let mockVoiceAvailability = {
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

jest.mock("expo-router", () => ({
  useRouter: (): {
    readonly back: jest.Mock;
    readonly push: jest.Mock;
    readonly replace: jest.Mock;
    readonly setParams: jest.Mock;
  } => ({
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
  useSafeAreaInsets: (): {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  } => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => {
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
    fontFamily: {
      regular: "System",
      medium: "System",
      semiBold: "System",
      bold: "System",
    },
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

jest.mock("@/components/add-transaction/AmountDisplay", () => ({
  AmountDisplay: ({
    amount,
  }: {
    readonly amount: string;
  }): React.JSX.Element => {
    const { Text } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <Text testID="manual-amount">{amount}</Text>;
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
    ...args: Parameters<
      typeof import("@/services/profile-service").getAiProcessingConsentStatus
    >
  ): ReturnType<
    typeof import("@/services/profile-service").getAiProcessingConsentStatus
  > => mockGetAiProcessingConsentStatus(...args),
}));

jest.mock("@/hooks/useVoiceAiAvailability", () => ({
  useVoiceAiAvailability: () => ({
    availability: mockVoiceAvailability,
    isLoading: false,
    error: null,
    refresh: () => {
      mockVoiceAvailabilityRefresh();
      return Promise.resolve(mockVoiceAvailability);
    },
    reconcileAuthoritativeSnapshot: jest.fn(),
  }),
}));

jest.mock("@/hooks/useVoiceTransactionFlow", () => ({
  useVoiceTransactionFlow: () => ({
    flowStatus: "idle",
    isOverlayVisible: false,
    durationMs: 0,
    errorMessage: null,
    isMicrophonePermissionError: false,
    hasPermission: mockVoiceHasPermission,
    isModeSwitchLocked: false,
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
    ...args: Parameters<
      typeof import("@/services/transaction-service").createTransaction
    >
  ): Promise<CreatedTransactionFixture> => mockCreateTransaction(...args),
}));

jest.mock("@/services/transfer-service", () => ({
  createTransfer: jest.fn(),
}));

import AddTransaction from "@/app/(private)/add-transaction";

function renderRoute(mode: string | undefined): ReturnType<typeof render> {
  mockRouteParams = mode === undefined ? {} : { mode };
  return render(<AddTransaction />);
}

describe("AddTransaction unified mode intent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};
    mockFocusCallback = null;
    mockAiConsentLoading = false;
    mockAiConsented = false;
    mockVoiceHasPermission = true;
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
    mockVoiceAvailability = {
      serverNow: "2026-10-08T01:00:00.000Z",
      timeZone: "Africa/Cairo",
      dailyLimit: 5,
      remaining: 5,
      resetAt: "2026-10-08T21:00:00.000Z",
      reason: null,
      availableAt: null,
      burstAvailableAt: null,
      policyVersion: "test",
    };
  });

  it("uses one Add Transaction shell and selects Voice for mode=voice", () => {
    renderRoute("voice");

    expect(screen.getAllByTestId("page-header")).toHaveLength(1);

    expect(screen.getByRole("tab", { name: "Voice" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true })
    );
    expect(screen.getByRole("tab", { name: "Manual" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: false })
    );
  });

  it("preserves observable Manual amount state across safe mode switches", async (): Promise<void> => {
    renderRoute("manual");

    await act(async (): Promise<void> => {
      fireEvent.press(screen.getByTestId("key-1"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("manual-amount")).toHaveTextContent("1");

    await act(async (): Promise<void> => {
      fireEvent.press(screen.getByRole("tab", { name: "Voice" }));
      await Promise.resolve();
    });
    await act(async (): Promise<void> => {
      fireEvent.press(screen.getByRole("tab", { name: "Manual" }));
      await Promise.resolve();
    });

    expect(screen.getByTestId("manual-amount")).toHaveTextContent("1");
  });

  it("keeps the unified shell wired to the real Manual save contract", async () => {
    renderRoute("manual");

    await act(async (): Promise<void> => {
      fireEvent.press(screen.getByTestId("key-1"));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByTestId("manual-amount")).toHaveTextContent("1")
    );

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

  it("locks mode switching while consent grant is pending", async () => {
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce({
      consent: null,
      isConsented: false,
      userId: "user-1",
    });
    const grant = createDeferred<void>();
    mockGrantConsent.mockReturnValueOnce(grant.promise);
    renderRoute("voice");

    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor(() =>
      expect(screen.getByTestId("voice-consent-continue")).toBeTruthy()
    );

    fireEvent.press(screen.getByTestId("voice-consent-continue"));

    expect(screen.getByRole("tab", { name: "Manual" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );

    await act(async (): Promise<void> => {
      grant.resolve(undefined);
      await grant.promise;
    });
  });

  it("does not start or show permission recovery after Back invalidates a pending grant", async () => {
    mockVoiceHasPermission = false;
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce({
      consent: null,
      isConsented: false,
      userId: "user-1",
    });
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
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce({
      consent: null,
      isConsented: false,
      userId: "user-1",
    });
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
    expect(screen.getByRole("tab", { name: "Manual" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );

    await act(async (): Promise<void> => {
      hookStart.resolve(undefined);
      await hookStart.promise;
    });

    expect(screen.getByRole("tab", { name: "Manual" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: false })
    );
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
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce({
      consent: null,
      isConsented: false,
      userId: "user-1",
    });
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
  });

  it("keeps consent visible when granting it fails", async (): Promise<void> => {
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce({
      consent: null,
      isConsented: false,
      userId: "user-1",
    });
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
  });

  it("uses fresh profile consent when mounted consent is stale", async (): Promise<void> => {
    mockAiConsented = true;
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce({
      consent: null,
      isConsented: false,
      userId: "user-1",
    });
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor((): void => {
      expect(screen.getByTestId("voice-consent-continue")).toBeTruthy();
    });
    expect(mockGetAiProcessingConsentStatus).toHaveBeenCalledTimes(1);
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
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
  });

  it("explains microphone access after consent and starts only from the custom action", async (): Promise<void> => {
    mockVoiceHasPermission = false;
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce({
      consent: null,
      isConsented: false,
      userId: "user-1",
    });
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
