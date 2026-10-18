import { act, renderHook } from "@testing-library/react-native";
import type { Category } from "@monyvi/db";
import type { VoiceAvailabilitySnapshot } from "@monyvi/logic";
import type { UseVoiceAiAvailabilityResult } from "@/hooks/useVoiceAiAvailability";
import { useVoiceTransactionFlow } from "@/hooks/useVoiceTransactionFlow";
import {
  createCanonicalVoiceSessionFixture,
  TEST_VOICE_OWNER_ID,
} from "./voice-review-production-wiring-fixtures";

const TEST_CATEGORY_ID = "00000000-0000-4000-8000-000000000301";

const mockPush = jest.fn();
const mockRecorderStart = jest.fn<Promise<void>, [unknown?]>();
const mockRecorderPause = jest.fn<boolean, []>();
const mockRecorderResume = jest.fn<boolean, []>();
const mockRecorderStop = jest.fn<Promise<{ readonly uri: string }>, []>();
const mockRecorderDiscard = jest.fn<Promise<void>, []>();
const mockRecorderReset = jest.fn<Promise<void>, []>();
const mockAvailabilityRefresh = jest.fn<
  Promise<VoiceAvailabilitySnapshot | null>,
  []
>();
const mockParseVoiceWithAi = jest.fn<Promise<unknown>, [unknown]>();
const mockRandomUUID = jest.fn<string, []>();
let mockUserId: string | null = TEST_VOICE_OWNER_ID;

const allowedSnapshot: VoiceAvailabilitySnapshot = {
  serverNow: "2026-10-12T00:00:00.000Z",
  timeZone: "Africa/Cairo",
  dailyLimit: 5,
  remaining: 5,
  resetAt: "2026-10-12T21:00:00.000Z",
  reason: null,
  availableAt: null,
  burstAvailableAt: null,
  policyVersion: "cat-flow-test",
};

const voiceAvailability: UseVoiceAiAvailabilityResult = {
  availability: allowedSnapshot,
  isLoading: false,
  error: null,
  refresh: (): Promise<VoiceAvailabilitySnapshot | null> =>
    mockAvailabilityRefresh(),
  reconcileAuthoritativeSnapshot: (): void => {},
};

const mockRecorderState = {
  status: "completed" as
    | "idle"
    | "recording"
    | "paused"
    | "completed"
    | "error",
  durationMs: 3000,
  isRecording: false,
  audioUri: "file://completed-voice.m4a" as string | null,
  hasPermission: true,
};

jest.mock("expo-crypto", () => ({
  randomUUID: (): string => mockRandomUUID(),
}));

jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]): void => {
      mockPush(...args);
    },
  },
}));

jest.mock("@/utils/device-time-zone", () => ({
  getDeviceTimeZone: (): string => "Africa/Cairo",
}));

jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: (): {
    readonly userId: string | null;
    readonly isResolvingUser: boolean;
  } => ({
    userId: mockUserId,
    isResolvingUser: false,
  }),
}));

jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: jest.fn().mockResolvedValue({
    consent: {
      consentedAt: "2026-10-12T00:00:00.000Z",
      revokedAt: null,
      version: "2026-07-ai-processing-v1",
    },
    isConsented: true,
    userId: mockUserId ?? "00000000-0000-4000-8000-000000000101",
  }),
}));

jest.mock("@/services/ai-voice-parser-service", () => ({
  parseVoiceWithAi: (args: unknown): Promise<unknown> =>
    mockParseVoiceWithAi(args),
  isVoiceParserError: (value: unknown): boolean =>
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    !("transactions" in value),
  isVoiceQuotaParserError: (value: unknown): boolean =>
    typeof value === "object" && value !== null && "availability" in value,
}));

jest.mock("@/services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots: jest.fn(() =>
    Promise.resolve({
      ownerId: mockUserId ?? "00000000-0000-4000-8000-000000000101",
      preferredCurrency: "EGP",
      accounts: [],
      providerContext: {
        reviewContractVersion: "account-review/v2",
        preferredCurrency: "EGP",
        accounts: [],
      },
    })
  ),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("@/hooks/useVoiceRecorder", () => ({
  useVoiceRecorder: (): unknown => ({
    ...mockRecorderState,
    permissionStatus: "granted",
    refreshPermission: jest.fn().mockResolvedValue("granted"),
    requestPermissionStatus: jest.fn().mockResolvedValue("granted"),
    requestPermission: jest.fn().mockResolvedValue(true),
    start: mockRecorderStart,
    pause: mockRecorderPause,
    resume: mockRecorderResume,
    stop: mockRecorderStop,
    discard: mockRecorderDiscard,
    reset: mockRecorderReset,
  }),
}));

jest.mock("@monyvi/db", () => {
  class MockCategory {
    constructor(id: string, systemName: string, displayName: string) {
      this.id = id;
      this.systemName = systemName;
      this.displayName = displayName;
    }

    readonly id: string;
    readonly systemName: string;
    readonly displayName: string;
  }
  return {
    Category: MockCategory,
  };
});

const { Category: MockCategory } = jest.requireMock<{
  Category: new (
    id: string,
    systemName: string,
    displayName: string
  ) => Category;
}>("@monyvi/db");

function createMockCategory(
  id: string,
  systemName: string,
  displayName: string
): Category {
  return new MockCategory(id, systemName, displayName);
}

describe("useVoiceTransactionFlow categories configuration retention and retry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = TEST_VOICE_OWNER_ID;
    mockRecorderState.status = "completed";
    mockRecorderState.durationMs = 3000;
    mockRecorderState.isRecording = false;
    mockRecorderState.audioUri = "file://completed-voice.m4a";
    mockRecorderState.hasPermission = true;

    mockAvailabilityRefresh.mockResolvedValue(allowedSnapshot);
    mockRandomUUID.mockReturnValue("req-uuid-1111");
    mockRecorderDiscard.mockResolvedValue(undefined);
    mockRecorderReset.mockResolvedValue(undefined);
    mockRecorderStop.mockResolvedValue({ uri: "file://completed-voice.m4a" });
    mockRecorderStart.mockImplementation((opts: unknown) => {
      mockRecorderState.status = "recording";
      if (opts && typeof opts === "object" && "onStarted" in opts) {
        (opts as { onStarted?: () => void }).onStarted?.();
      }
      return Promise.resolve();
    });
  });

  it("retains audioUri and requestKey on config error and uses fresh categories on retry, while network errors freeze options", async () => {
    // 1. Initial submission has empty categoryRecords -> parser returns config error
    mockParseVoiceWithAi.mockResolvedValueOnce({
      kind: "config",
      message:
        "Category data is unavailable. Please restart the app and try again.",
      retryableSameRequest: true,
    });

    let currentCategoryRecords: readonly Category[] = [];
    let currentCategories = "";

    const { result, rerender } = renderHook(() =>
      useVoiceTransactionFlow({
        preferredCurrency: "EGP",
        categories: currentCategories,
        accounts: [{ id: "acc-1", name: "Cash", currency: "EGP" }],
        categoryRecords: currentCategoryRecords,
        voiceAvailability,
        ensureAiProcessingConsent: () => true,
      })
    );

    // Initial flow has audio captured
    await act(async () => {
      await result.current.startFlow();
    });

    // Submit recording
    await act(async () => {
      await result.current.submitRecording();
    });

    // Flow encounters config error, but retains audio/key and allows submission retry
    expect(result.current.flowStatus).toBe("error");
    expect(result.current.canRetrySubmission).toBe(true);
    expect(mockRecorderDiscard).not.toHaveBeenCalled();
    expect(mockParseVoiceWithAi).toHaveBeenCalledTimes(1);
    expect(mockParseVoiceWithAi.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        audioUri: "file://completed-voice.m4a",
        requestKey: "req-uuid-1111",
        categoryRecords: [],
      })
    );

    // 2. Now caller supplies fresh categories (e.g. database loaded categories)
    const freshCategory = createMockCategory(
      TEST_CATEGORY_ID,
      "groceries",
      "Groceries"
    );
    currentCategoryRecords = [freshCategory];
    currentCategories = "L1: food\n  L2: groceries";
    rerender(undefined);

    // Mock successful parsing on retry
    mockParseVoiceWithAi.mockResolvedValueOnce({
      transactions: [
        {
          amount: 100,
          currency: "EGP",
          type: "EXPENSE",
          date: new Date("2026-10-12T00:00:00.000Z"),
          categoryId: TEST_CATEGORY_ID,
          categoryDisplayName: "Groceries",
          confidence: 0.9,
          originLabel: "Voice",
          source: "VOICE",
        },
      ],
      transcript: "spent 100 on groceries",
      originalTranscript: "spent 100 on groceries",
      detectedLanguage: "en",
      reviewSession: createCanonicalVoiceSessionFixture({
        ownerId: mockUserId ?? TEST_VOICE_OWNER_ID,
        transactions: [
          {
            amount: 100,
            currency: "EGP",
            type: "EXPENSE",
            date: new Date("2026-10-12T00:00:00.000Z"),
            categoryId: TEST_CATEGORY_ID,
            categoryDisplayName: "Groceries",
            confidence: 0.9,
            originLabel: "Voice",
            source: "VOICE",
          },
        ],
      }),
    });

    // Retry submission with fresh category context
    await act(async () => {
      await result.current.retrySubmission();
    });

    expect(mockParseVoiceWithAi).toHaveBeenCalledTimes(2);
    // Verified that retry re-uses the exact same requestKey and audioUri, but picks up the fresh categories!
    expect(mockParseVoiceWithAi.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        audioUri: "file://completed-voice.m4a",
        requestKey: "req-uuid-1111",
        categoryRecords: [freshCategory],
        categories: "L1: food\n  L2: groceries",
      })
    );
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockRecorderDiscard).toHaveBeenCalledTimes(1);
  });

  it("freezes category records on network error retry even if caller supplies modified categories", async () => {
    mockParseVoiceWithAi.mockResolvedValueOnce({
      kind: "network",
      message: "Network request failed. Tap retry to submit again.",
      retryableSameRequest: true,
    });

    const initialCategory = createMockCategory("cat-init", "food", "Food");
    let currentCategoryRecords: readonly Category[] = [initialCategory];
    let currentCategories = "L1: food";

    const { result, rerender } = renderHook(() =>
      useVoiceTransactionFlow({
        preferredCurrency: "EGP",
        categories: currentCategories,
        accounts: [{ id: "acc-1", name: "Cash", currency: "EGP" }],
        categoryRecords: currentCategoryRecords,
        voiceAvailability,
        ensureAiProcessingConsent: () => true,
      })
    );

    await act(async () => {
      await result.current.startFlow();
    });

    await act(async () => {
      await result.current.submitRecording();
    });

    expect(result.current.flowStatus).toBe("error");
    expect(result.current.canRetrySubmission).toBe(true);

    // Caller modifies categories during network error
    const modifiedCategory = createMockCategory("cat-mod", "other", "Other");
    currentCategoryRecords = [modifiedCategory];
    currentCategories = "L1: other";
    rerender(undefined);

    mockParseVoiceWithAi.mockResolvedValueOnce({
      transactions: [],
      transcript: "",
      originalTranscript: "",
      detectedLanguage: "en",
      reviewSession: createCanonicalVoiceSessionFixture({
        ownerId: mockUserId ?? TEST_VOICE_OWNER_ID,
        transactions: [],
      }),
    });

    await act(async () => {
      await result.current.retrySubmission();
    });

    expect(mockParseVoiceWithAi).toHaveBeenCalledTimes(2);
    // Network retry must preserve the frozen context (initialCategory), NOT the modified category
    expect(mockParseVoiceWithAi.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        audioUri: "file://completed-voice.m4a",
        requestKey: "req-uuid-1111",
        categoryRecords: [initialCategory],
        categories: "L1: food",
      })
    );
  });
});
