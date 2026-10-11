import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { getTestInstanceProps } from "../test-utils/test-instance-props";

let mockCurrentUserId: string | null = "user-1";
let mockIsResolvingUser = false;
const mockReadVoiceExamplesDismissed = jest.fn<Promise<boolean>, [string]>();
const mockDismissVoiceExamples = jest.fn<Promise<void>, [string]>();
const mockExamplesStore = new Set<string>();

jest.mock(
  "@/services/voice-examples-preference-service",
  () => ({
    readVoiceExamplesDismissed: (userId: string): Promise<boolean> =>
      mockReadVoiceExamplesDismissed(userId),
    dismissVoiceExamples: (userId: string): Promise<void> =>
      mockDismissVoiceExamples(userId),
  }),
  { virtual: true }
);

let mockRouteParams: Readonly<Record<string, string | undefined>> = {};
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();
const mockVoiceAvailabilityRefresh = jest.fn();
const mockVoiceStartFlow = jest.fn();
const mockVoiceDiscardRecording = jest.fn();
const mockVoicePermissionRefresh = jest.fn();
const mockVoiceOpenMicrophoneSettings = jest.fn();
type CreateTransaction =
  typeof import("@/services/transaction-service").createTransaction;
type CreatedTransactionFixture = Pick<
  Awaited<ReturnType<CreateTransaction>>,
  "id"
>;
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
type GetConsentStatus =
  typeof import("@/services/profile-service").getAiProcessingConsentStatus;
const mockGetAiProcessingConsentStatus = jest.fn<
  ReturnType<GetConsentStatus>,
  Parameters<GetConsentStatus>
>();
let mockFocusCallback: (() => void) | null = null;
let mockAiConsentLoading = false;
let mockAiConsented = false;
let mockVoiceHasPermission = true;
let mockMicrophonePermissionError = false;
let mockPermissionStatus: "granted" | "denied" | "blocked" | "unknown" | null =
  null;
let mockVoiceFlowStatus:
  | "idle"
  | "starting"
  | "recording"
  | "paused"
  | "completed"
  | "analyzing"
  | "error" = "idle";
let mockVoiceModeSwitchLocked = false;
let mockVoiceAvailabilityErrorKind: "network" | "consent_required" | null =
  null;
let mockVoiceAvailabilityLoading = false;
let mockVoiceRefusalReason:
  | "daily_limit"
  | "burst_limit"
  | "already_processed_result_unavailable"
  | null = null;
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
jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: (): {
    readonly userId: string | null;
    readonly isResolvingUser: boolean;
  } => ({ userId: mockCurrentUserId, isResolvingUser: mockIsResolvingUser }),
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
    fontFamily: jest.requireActual<typeof import("@/constants/typography")>(
      "@/constants/typography"
    ).fontFamily,
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
    onDiscard,
    onRefreshAvailability,
    onPermissionContinue,
    onOpenSettings,
    showExamples = true,
    onDismissExamples,
  }: {
    readonly state: string;
    readonly onStart: () => void;
    readonly onDiscard: () => void;
    readonly onRefreshAvailability: () => void;
    readonly onPermissionContinue: () => void;
    readonly onOpenSettings: () => void;
    readonly showExamples?: boolean;
    readonly onDismissExamples?: () => void;
  }): React.JSX.Element => {
    const { Pressable, Text, View } =
      jest.requireActual<typeof import("react-native")>("react-native");

    return (
      <View>
        <Text testID="voice-entry-state">{state}</Text>
        {showExamples ? (
          <View testID="voice-examples-card">
            <Pressable
              testID="voice-examples-dismiss"
              onPress={onDismissExamples}
            />
          </View>
        ) : null}
        <Pressable testID="voice-start" onPress={onStart} />
        <Pressable testID="voice-starting-cancel" onPress={onDiscard} />
        <Pressable
          testID="voice-unavailable-retry"
          onPress={onRefreshAvailability}
        />
        <Pressable
          testID="voice-permission-primary"
          onPress={onPermissionContinue}
        />
        {state === "permission-denied" ? (
          <Pressable testID="voice-action-settings" onPress={onOpenSettings} />
        ) : null}
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
    availability: mockVoiceAvailabilityLoading ? null : mockVoiceAvailability,
    isLoading: mockVoiceAvailabilityLoading,
    error:
      mockVoiceAvailabilityErrorKind === null
        ? null
        : { kind: mockVoiceAvailabilityErrorKind },
    refresh: mockVoiceAvailabilityRefresh,
    reconcileAuthoritativeSnapshot: jest.fn(),
  }),
}));

jest.mock("@/hooks/useVoiceTransactionFlow", () => ({
  useVoiceTransactionFlow: () => ({
    flowStatus: mockVoiceFlowStatus,
    isOverlayVisible: false,
    durationMs: 0,
    errorMessage: null,
    isMicrophonePermissionError: mockMicrophonePermissionError,
    hasPermission: mockVoiceHasPermission,
    permissionStatus:
      mockPermissionStatus ?? (mockVoiceHasPermission ? "granted" : "denied"),
    refreshPermission: mockVoicePermissionRefresh,
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
    openMicrophoneSettings: mockVoiceOpenMicrophoneSettings,
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
export function resetRouteMocks(): void {
  jest.clearAllMocks();
  mockCurrentUserId = "user-1";
  mockIsResolvingUser = false;
  mockExamplesStore.clear();
  mockReadVoiceExamplesDismissed
    .mockReset()
    .mockImplementation(
      (userId): Promise<boolean> =>
        Promise.resolve(mockExamplesStore.has(userId))
    );
  mockDismissVoiceExamples
    .mockReset()
    .mockImplementation((userId): Promise<void> => {
      mockExamplesStore.add(userId);
      return Promise.resolve();
    });
  mockRouteParams = {};
  mockFocusCallback = null;
  mockAiConsentLoading = false;
  mockAiConsented = false;
  mockVoiceHasPermission = true;
  mockMicrophonePermissionError = false;
  mockPermissionStatus = null;
  mockVoiceFlowStatus = "idle";
  mockVoiceModeSwitchLocked = false;
  mockVoiceAvailabilityErrorKind = null;
  mockVoiceAvailabilityLoading = false;
  mockVoiceRefusalReason = null;
  mockGrantConsent.mockReset().mockResolvedValue();
  mockVoiceStartFlow.mockReset().mockResolvedValue({ kind: "started" });
  mockVoiceDiscardRecording.mockReset().mockResolvedValue(undefined);
  mockVoiceOpenMicrophoneSettings.mockReset().mockResolvedValue(undefined);
  mockVoicePermissionRefresh
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve(mockVoiceHasPermission ? "granted" : "denied")
    );
  mockVoiceAvailabilityRefresh
    .mockReset()
    .mockImplementation(() => Promise.resolve(mockVoiceAvailability));
  mockCreateTransaction.mockReset().mockResolvedValue({ id: "tx-1" });
  mockGetAiProcessingConsentStatus.mockReset().mockResolvedValue({
    consent: null,
    isConsented: true,
    userId: "user-1",
  });
  mockVoiceAvailability = { ...initialVoiceAvailability };
}

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
export const mockRouteState = {
  get mockCurrentUserId(): string | null {
    return mockCurrentUserId;
  },
  set mockCurrentUserId(value: string | null) {
    mockCurrentUserId = value;
  },
  get mockIsResolvingUser(): boolean {
    return mockIsResolvingUser;
  },
  set mockIsResolvingUser(value: boolean) {
    mockIsResolvingUser = value;
  },
  get mockRouteParams(): typeof mockRouteParams {
    return mockRouteParams;
  },
  set mockRouteParams(value: typeof mockRouteParams) {
    mockRouteParams = value;
  },
  get mockFocusCallback(): typeof mockFocusCallback {
    return mockFocusCallback;
  },
  set mockFocusCallback(value: typeof mockFocusCallback) {
    mockFocusCallback = value;
  },
  get mockAiConsentLoading(): typeof mockAiConsentLoading {
    return mockAiConsentLoading;
  },
  set mockAiConsentLoading(value: typeof mockAiConsentLoading) {
    mockAiConsentLoading = value;
  },
  get mockAiConsented(): typeof mockAiConsented {
    return mockAiConsented;
  },
  set mockAiConsented(value: typeof mockAiConsented) {
    mockAiConsented = value;
  },
  get mockVoiceHasPermission(): typeof mockVoiceHasPermission {
    return mockVoiceHasPermission;
  },
  set mockVoiceHasPermission(value: typeof mockVoiceHasPermission) {
    mockVoiceHasPermission = value;
  },
  get mockMicrophonePermissionError(): typeof mockMicrophonePermissionError {
    return mockMicrophonePermissionError;
  },
  set mockMicrophonePermissionError(
    value: typeof mockMicrophonePermissionError
  ) {
    mockMicrophonePermissionError = value;
  },
  get mockPermissionStatus(): typeof mockPermissionStatus {
    return mockPermissionStatus;
  },
  set mockPermissionStatus(value: typeof mockPermissionStatus) {
    mockPermissionStatus = value;
  },
  get mockVoiceFlowStatus(): typeof mockVoiceFlowStatus {
    return mockVoiceFlowStatus;
  },
  set mockVoiceFlowStatus(value: typeof mockVoiceFlowStatus) {
    mockVoiceFlowStatus = value;
  },
  get mockVoiceModeSwitchLocked(): typeof mockVoiceModeSwitchLocked {
    return mockVoiceModeSwitchLocked;
  },
  set mockVoiceModeSwitchLocked(value: typeof mockVoiceModeSwitchLocked) {
    mockVoiceModeSwitchLocked = value;
  },
  get mockVoiceAvailabilityErrorKind(): typeof mockVoiceAvailabilityErrorKind {
    return mockVoiceAvailabilityErrorKind;
  },
  set mockVoiceAvailabilityErrorKind(
    value: typeof mockVoiceAvailabilityErrorKind
  ) {
    mockVoiceAvailabilityErrorKind = value;
  },
  get mockVoiceAvailabilityLoading(): typeof mockVoiceAvailabilityLoading {
    return mockVoiceAvailabilityLoading;
  },
  set mockVoiceAvailabilityLoading(value: typeof mockVoiceAvailabilityLoading) {
    mockVoiceAvailabilityLoading = value;
  },
  get mockVoiceRefusalReason(): typeof mockVoiceRefusalReason {
    return mockVoiceRefusalReason;
  },
  set mockVoiceRefusalReason(value: typeof mockVoiceRefusalReason) {
    mockVoiceRefusalReason = value;
  },
  get mockVoiceAvailability(): typeof mockVoiceAvailability {
    return mockVoiceAvailability;
  },
  set mockVoiceAvailability(value: typeof mockVoiceAvailability) {
    mockVoiceAvailability = value;
  },
};

export {
  mockReadVoiceExamplesDismissed,
  mockDismissVoiceExamples,
  mockExamplesStore,
  mockBack,
  mockPush,
  mockReplace,
  mockSetParams,
  mockVoiceAvailabilityRefresh,
  mockVoiceStartFlow,
  mockVoiceDiscardRecording,
  mockVoicePermissionRefresh,
  mockVoiceOpenMicrophoneSettings,
  mockCreateTransaction,
  mockGrantConsent,
  unconsentedStatus,
  mockGetAiProcessingConsentStatus,
  initialVoiceAvailability,
  renderRoute,
  expectTabState,
  enterOneManualUnit,
  createDeferred,
  AddTransaction,
  ManualTransactionEntry,
};
export type { CreateTransaction, CreatedTransactionFixture, GetConsentStatus };
