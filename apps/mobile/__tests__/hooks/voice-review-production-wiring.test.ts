import { act, renderHook, waitFor } from "@testing-library/react-native";
import type {
  AccountReviewSession,
  ParsedVoiceTransaction,
  VoiceAvailabilitySnapshot,
} from "@monyvi/logic";
import type { UseVoiceAiAvailabilityResult } from "@/hooks/useVoiceAiAvailability";
import { useVoiceTransactionFlow } from "@/hooks/useVoiceTransactionFlow";
import {
  buildConfigContext,
  buildSubmission,
  buildParserPayload,
} from "@/hooks/voice-flow-submission";
import type {
  FlowConfig,
  ParserContextSnapshot,
} from "@/hooks/voice-transaction-flow-types";
import type {
  AiVoiceParserOptions,
  AiVoiceParserSuccess,
  VoiceParserFailure,
} from "@/services/ai-voice-parser-service";
import type { AccountReviewAccountSnapshots } from "@/services/account-review-read-model-service";
import {
  canonicalReviewAccountSnapshotsFixture,
  createCanonicalVoiceSessionFixture,
  TEST_VOICE_OWNER_ID,
  TEST_VOICE_FOREIGN_OWNER_ID,
} from "./voice-review-production-wiring-fixtures";

interface DeferredPromise<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
}

function createDeferred<T>(): DeferredPromise<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mockPush = jest.fn<void, unknown[]>();
const mockRecorderStart = jest.fn<
  Promise<void>,
  [{ readonly onStarted?: () => void }?]
>();
const mockRecorderPause = jest.fn<boolean, []>();
const mockRecorderResume = jest.fn<boolean, []>();
const mockRecorderStop = jest.fn<Promise<{ readonly uri: string }>, []>();
const mockRecorderDiscard = jest.fn<Promise<void>, []>();
const mockRecorderReset = jest.fn<Promise<void>, []>();
const mockRequestPermission = jest.fn<Promise<boolean>, []>();
const mockRequestPermissionStatus = jest.fn<
  Promise<"granted" | "denied" | "blocked" | "unknown">,
  []
>();
const mockParseVoiceWithAi = jest.fn<
  Promise<AiVoiceParserSuccess | VoiceParserFailure>,
  [AiVoiceParserOptions]
>();
const mockRefresh = jest.fn<Promise<VoiceAvailabilitySnapshot>, []>();
const mockRandomUUID = jest.fn<string, []>();
const mockLoadAccountReviewAccountSnapshots = jest.fn<
  Promise<AccountReviewAccountSnapshots>,
  []
>();

const mockDefaultOwnerId = "018f0c7a-1234-4abc-8def-000000000001";
let mockUserId: string | null = mockDefaultOwnerId;

const alwaysAvailableSnapshot: VoiceAvailabilitySnapshot = {
  serverNow: "2026-07-07T12:00:00.000Z",
  timeZone: "Africa/Cairo",
  dailyLimit: null,
  remaining: null,
  resetAt: null,
  reason: null,
  availableAt: null,
  burstAvailableAt: null,
  policyVersion: "test",
};

const alwaysAvailableVoiceAvailability: UseVoiceAiAvailabilityResult = {
  availability: alwaysAvailableSnapshot,
  isLoading: false,
  error: null,
  refresh: mockRefresh,
  reconcileAuthoritativeSnapshot: (): void => {},
};

jest.mock("i18next", () => ({
  t: (key: string): string => key,
}));

const mockRecorderState = {
  status: "idle" as "idle" | "recording" | "paused" | "completed" | "error",
  durationMs: 0,
  isRecording: false,
  audioUri: null as string | null,
  hasPermission: true,
};

jest.mock("expo-crypto", () => ({
  randomUUID: (): string => mockRandomUUID(),
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

jest.mock("@/utils/device-time-zone", () => ({
  getDeviceTimeZone: (): string => "Africa/Cairo",
}));

jest.mock("expo-router", () => ({
  router: {
    push: (...args: readonly unknown[]): void => {
      mockPush(...args);
    },
  },
}));

jest.mock("@/hooks/useVoiceRecorder", () => ({
  useVoiceRecorder: (): unknown => ({
    ...mockRecorderState,
    start: mockRecorderStart,
    pause: mockRecorderPause,
    resume: mockRecorderResume,
    stop: mockRecorderStop,
    discard: mockRecorderDiscard,
    reset: mockRecorderReset,
    requestPermission: mockRequestPermission,
    requestPermissionStatus: mockRequestPermissionStatus,
    permissionStatus: mockRecorderState.hasPermission ? "granted" : "denied",
    refreshPermission: (): Promise<"granted" | "denied"> =>
      Promise.resolve(mockRecorderState.hasPermission ? "granted" : "denied"),
  }),
}));

jest.mock("@/services/ai-voice-parser-service", () => ({
  parseVoiceWithAi: (
    options: AiVoiceParserOptions
  ): Promise<AiVoiceParserSuccess | VoiceParserFailure> =>
    mockParseVoiceWithAi(options),
  isVoiceParserError: (value: unknown): boolean =>
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    !("transactions" in value),
  isVoiceQuotaParserError: (value: unknown): boolean =>
    typeof value === "object" && value !== null && "availability" in value,
}));

jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: (): Promise<{
    readonly consent: {
      readonly consentedAt: string;
      readonly revokedAt: null;
      readonly version: string;
    };
    readonly isConsented: boolean;
    readonly userId: string;
  }> =>
    Promise.resolve({
      consent: {
        consentedAt: "2026-07-07T12:00:00.000Z",
        revokedAt: null,
        version: "2026-07-ai-processing-v1",
      },
      isConsented: true,
      userId: mockUserId ?? mockDefaultOwnerId,
    }),
}));

jest.mock("@/services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots:
    (): Promise<AccountReviewAccountSnapshots> =>
      mockLoadAccountReviewAccountSnapshots(),
}));

function extractVoiceTransactions(
  session: AccountReviewSession
): readonly ParsedVoiceTransaction[] {
  return session.rows.flatMap((row): readonly ParsedVoiceTransaction[] =>
    row.source === "VOICE" ? [row.transaction] : []
  );
}

const defaultFlowConfig: FlowConfig = {
  preferredCurrency: "EGP",
  categories: "Food",
  accounts: [
    {
      id: "018f0c7a-1234-4abc-8def-000000000003",
      name: "QNB Current",
      currency: "EGP",
    },
  ],
  categoryRecords: [],
  originTabIndex: 2,
  voiceAvailability: alwaysAvailableVoiceAvailability,
};

function renderVoiceFlow(): ReturnType<
  typeof renderHook<ReturnType<typeof useVoiceTransactionFlow>, undefined>
> {
  return renderHook(() => useVoiceTransactionFlow(defaultFlowConfig));
}

describe("voice-review production wiring regressions (#395 F1)", () => {
  beforeEach((): void => {
    jest.clearAllMocks();
    mockParseVoiceWithAi.mockReset();
    mockRefresh.mockReset().mockResolvedValue(alwaysAvailableSnapshot);
    mockRandomUUID
      .mockReset()
      .mockReturnValue("11111111-1111-4111-8111-111111111111");
    mockUserId = TEST_VOICE_OWNER_ID;
    mockLoadAccountReviewAccountSnapshots
      .mockReset()
      .mockResolvedValue(canonicalReviewAccountSnapshotsFixture);
    mockRecorderState.status = "idle";
    mockRecorderState.durationMs = 0;
    mockRecorderState.isRecording = false;
    mockRecorderState.audioUri = null;
    mockRecorderState.hasPermission = true;
    mockRecorderStart.mockImplementation(
      (options?: { readonly onStarted?: () => void }): Promise<void> => {
        mockRecorderState.status = "recording";
        mockRecorderState.isRecording = true;
        options?.onStarted?.();
        return Promise.resolve();
      }
    );
    mockRecorderPause.mockReturnValue(true);
    mockRecorderResume.mockReturnValue(true);
    mockRecorderDiscard.mockResolvedValue(undefined);
    mockRecorderReset.mockResolvedValue(undefined);
    mockRecorderStop.mockImplementation(
      (): Promise<{ readonly uri: string }> => {
        mockRecorderState.status = "completed";
        mockRecorderState.isRecording = false;
        mockRecorderState.audioUri = "file://recording.m4a";
        return Promise.resolve({ uri: "file://recording.m4a" });
      }
    );
    mockRequestPermission.mockResolvedValue(true);
    mockRequestPermissionStatus.mockResolvedValue("granted");
  });

  describe("F1.1: Canonical reviewAccountSnapshots propagation in parser submission", () => {
    it("proves buildSubmission and buildParserPayload propagate reviewAccountSnapshots", (): void => {
      const baseContext = buildConfigContext(defaultFlowConfig);
      const enrichedContext: ParserContextSnapshot = {
        ...baseContext,
        reviewAccountSnapshots: canonicalReviewAccountSnapshotsFixture,
      };

      const submission = buildSubmission(
        TEST_VOICE_OWNER_ID,
        "file://recording.m4a",
        "11111111-1111-4111-8111-111111111111",
        "Africa/Cairo",
        enrichedContext
      );
      const abortController = new AbortController();
      const payload = buildParserPayload(submission, abortController.signal);

      expect(payload.reviewAccountSnapshots).toBeDefined();
      expect(payload.reviewAccountSnapshots).toEqual(
        canonicalReviewAccountSnapshotsFixture
      );
    });

    it("ensures useVoiceTransactionFlow captures real account snapshots and successfully navigates with reviewSession", async (): Promise<void> => {
      const session = createCanonicalVoiceSessionFixture();
      const successResult: AiVoiceParserSuccess = {
        transactions: extractVoiceTransactions(session),
        transcript: "Voice transcript",
        originalTranscript: "Voice transcript",
        detectedLanguage: "en",
        reviewSession: session,
      };
      mockParseVoiceWithAi.mockResolvedValueOnce(successResult);

      const { result, rerender } = renderVoiceFlow();

      await act(async (): Promise<void> => {
        await result.current.startFlow();
      });

      mockRecorderState.status = "completed";
      mockRecorderState.audioUri = "file://recording.m4a";
      mockRecorderState.durationMs = 3000;
      rerender(undefined);

      await act(async (): Promise<void> => {
        await result.current.submitRecording();
      });

      expect(mockLoadAccountReviewAccountSnapshots).toHaveBeenCalledTimes(1);
      expect(mockParseVoiceWithAi).toHaveBeenCalledTimes(1);
      const passedOptions = mockParseVoiceWithAi.mock.calls[0]?.[0];
      expect(passedOptions?.reviewAccountSnapshots).toEqual(
        canonicalReviewAccountSnapshotsFixture
      );
      expect(mockPush).toHaveBeenCalledTimes(1);
      const navigation = mockPush.mock.calls[0]?.[0];
      if (
        typeof navigation !== "object" ||
        navigation === null ||
        !("pathname" in navigation) ||
        !("params" in navigation) ||
        typeof navigation.params !== "object" ||
        navigation.params === null ||
        !("reviewSession" in navigation.params) ||
        !("originTabIndex" in navigation.params)
      ) {
        throw new Error("missing_voice_review_navigation_params");
      }
      expect(navigation.pathname).toBe("/voice-review");
      expect(typeof navigation.params.reviewSession).toBe("string");
      expect(navigation.params.originTabIndex).toBe("2");
      expect(result.current.flowStatus).toBe("idle");
    });
  });

  describe("F1.2: Missing canonical reviewSession fails closed rather than legacy navigation", () => {
    it("refuses navigation to voice-review when result lacks a validated canonical reviewSession", async (): Promise<void> => {
      const session = createCanonicalVoiceSessionFixture();
      const legacyResult: AiVoiceParserSuccess = {
        transactions: extractVoiceTransactions(session),
        transcript: "Voice transcript",
        originalTranscript: "Voice transcript",
        detectedLanguage: "en",
        // reviewSession is omitted
      };
      mockParseVoiceWithAi.mockResolvedValueOnce(legacyResult);

      const { result, rerender } = renderVoiceFlow();

      await act(async (): Promise<void> => {
        await result.current.startFlow();
      });

      mockRecorderState.status = "completed";
      mockRecorderState.audioUri = "file://recording.m4a";
      mockRecorderState.durationMs = 3000;
      rerender(undefined);

      await act(async (): Promise<void> => {
        await result.current.submitRecording();
      });

      expect(mockPush).not.toHaveBeenCalled();
      expect(result.current.flowStatus).toBe("error");
      expect(mockRecorderDiscard).toHaveBeenCalled();
    });

    it("fails closed when canonical reviewSession has owner mismatch", async (): Promise<void> => {
      const mismatchedSession = createCanonicalVoiceSessionFixture({
        ownerId: TEST_VOICE_FOREIGN_OWNER_ID,
      });
      const invalidResult: AiVoiceParserSuccess = {
        transactions: extractVoiceTransactions(mismatchedSession),
        transcript: "Voice transcript",
        originalTranscript: "Voice transcript",
        detectedLanguage: "en",
        reviewSession: mismatchedSession,
      };
      mockParseVoiceWithAi.mockResolvedValueOnce(invalidResult);

      const { result, rerender } = renderVoiceFlow();

      await act(async (): Promise<void> => {
        await result.current.startFlow();
      });

      mockRecorderState.status = "completed";
      mockRecorderState.audioUri = "file://recording.m4a";
      mockRecorderState.durationMs = 3000;
      rerender(undefined);

      await act(async (): Promise<void> => {
        await result.current.submitRecording();
      });

      expect(mockPush).not.toHaveBeenCalled();
      expect(result.current.flowStatus).toBe("error");
      expect(mockRecorderDiscard).toHaveBeenCalled();
    });

    it("fails closed when reviewSession is malformed or invalid according to schema", async (): Promise<void> => {
      const invalidResult = {
        transactions: [{ amount: 20, currency: "EGP", type: "EXPENSE" }],
        transcript: "Voice transcript",
        originalTranscript: "Voice transcript",
        detectedLanguage: "en",
        reviewSession: {
          source: "VOICE",
          sessionId: "malformed-not-a-uuid",
        },
      } as unknown as AiVoiceParserSuccess;
      mockParseVoiceWithAi.mockResolvedValueOnce(invalidResult);

      const { result, rerender } = renderVoiceFlow();

      await act(async (): Promise<void> => {
        await result.current.startFlow();
      });

      mockRecorderState.status = "completed";
      mockRecorderState.audioUri = "file://recording.m4a";
      mockRecorderState.durationMs = 3000;
      rerender(undefined);

      await act(async (): Promise<void> => {
        await result.current.submitRecording();
      });

      expect(mockPush).not.toHaveBeenCalled();
      expect(result.current.flowStatus).toBe("error");
      expect(mockRecorderDiscard).toHaveBeenCalled();
    });
  });

  describe("F1.3: Snapshot loader failure and mismatch safety", () => {
    it("fails closed gracefully and discards recording when loadAccountReviewAccountSnapshots rejects", async (): Promise<void> => {
      mockLoadAccountReviewAccountSnapshots.mockRejectedValueOnce(
        new Error("ACCOUNT_REVIEW_ACCOUNT_OWNER_MISMATCH")
      );

      const { result, rerender } = renderVoiceFlow();

      await act(async (): Promise<void> => {
        await result.current.startFlow();
      });

      mockRecorderState.status = "completed";
      mockRecorderState.audioUri = "file://recording.m4a";
      mockRecorderState.durationMs = 3000;
      rerender(undefined);

      await act(async (): Promise<void> => {
        await result.current.submitRecording();
      });

      expect(mockParseVoiceWithAi).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(result.current.flowStatus).toBe("error");
      expect(mockRecorderDiscard).toHaveBeenCalled();
    });

    it("fails closed with generic error and discards when loaded snapshots have owner mismatch for current operation", async (): Promise<void> => {
      mockLoadAccountReviewAccountSnapshots.mockResolvedValueOnce({
        ...canonicalReviewAccountSnapshotsFixture,
        ownerId: TEST_VOICE_FOREIGN_OWNER_ID,
      });

      const { result, rerender } = renderVoiceFlow();

      await act(async (): Promise<void> => {
        await result.current.startFlow();
      });

      mockRecorderState.status = "completed";
      mockRecorderState.audioUri = "file://recording.m4a";
      mockRecorderState.durationMs = 3000;
      rerender(undefined);

      await act(async (): Promise<void> => {
        await result.current.submitRecording();
      });

      expect(mockParseVoiceWithAi).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(result.current.flowStatus).toBe("error");
      expect(mockRecorderDiscard).toHaveBeenCalled();
    });
  });

  describe("F1.4: Retained retry preserves original account snapshot without unexpected rebind", () => {
    it("preserves original account review snapshots across retryable submission failure without rebinding", async (): Promise<void> => {
      const session = createCanonicalVoiceSessionFixture();
      const networkFailure: VoiceParserFailure = {
        kind: "network",
        message: "Network timeout",
        retryableSameRequest: true,
      };
      const successResult: AiVoiceParserSuccess = {
        transactions: extractVoiceTransactions(session),
        transcript: "Voice transcript",
        originalTranscript: "Voice transcript",
        detectedLanguage: "en",
        reviewSession: session,
      };

      mockParseVoiceWithAi
        .mockResolvedValueOnce(networkFailure)
        .mockResolvedValueOnce(successResult);

      const { result, rerender } = renderVoiceFlow();

      await act(async (): Promise<void> => {
        await result.current.startFlow();
      });

      mockRecorderState.status = "completed";
      mockRecorderState.audioUri = "file://recording.m4a";
      mockRecorderState.durationMs = 3000;
      rerender(undefined);

      await act(async (): Promise<void> => {
        await result.current.submitRecording();
      });

      expect(result.current.canRetrySubmission).toBe(true);
      expect(result.current.flowStatus).toBe("error");

      // Alter the snapshot loader to simulate account changes during retry
      const alteredSnapshots: AccountReviewAccountSnapshots = {
        ...canonicalReviewAccountSnapshotsFixture,
        preferredCurrency: "USD",
        accounts: [],
      };
      mockLoadAccountReviewAccountSnapshots.mockResolvedValue(alteredSnapshots);

      await act(async (): Promise<void> => {
        await result.current.retrySubmission();
      });

      expect(mockParseVoiceWithAi).toHaveBeenCalledTimes(2);
      const retriedOptions = mockParseVoiceWithAi.mock.calls[1]?.[0];
      expect(retriedOptions?.reviewAccountSnapshots).toEqual(
        canonicalReviewAccountSnapshotsFixture
      );
      expect(retriedOptions?.reviewAccountSnapshots?.preferredCurrency).toBe(
        "EGP"
      );
      expect(mockPush).toHaveBeenCalledTimes(1);
    });
  });

  describe("F1.5: Actor change and cancellation safety", () => {
    it("discards flow and does not navigate if authenticated user changes during submission", async (): Promise<void> => {
      const deferredParse = createDeferred<AiVoiceParserSuccess>();
      mockParseVoiceWithAi.mockReturnValue(deferredParse.promise);

      const { result, rerender } = renderVoiceFlow();

      await act(async (): Promise<void> => {
        await result.current.startFlow();
      });

      mockRecorderState.status = "completed";
      mockRecorderState.audioUri = "file://recording.m4a";
      mockRecorderState.durationMs = 3000;
      rerender(undefined);

      let submitPromise: Promise<void> | undefined;
      act((): void => {
        submitPromise = result.current.submitRecording();
      });

      await waitFor((): void => {
        expect(result.current.flowStatus).toBe("analyzing");
      });

      // User changes during in-flight analysis
      mockUserId = TEST_VOICE_FOREIGN_OWNER_ID;
      rerender(undefined);

      const session = createCanonicalVoiceSessionFixture();
      await act(async (): Promise<void> => {
        deferredParse.resolve({
          transactions: extractVoiceTransactions(session),
          transcript: "Voice transcript",
          originalTranscript: "Voice transcript",
          detectedLanguage: "en",
          reviewSession: session,
        });
        await submitPromise;
      });

      expect(mockPush).not.toHaveBeenCalled();
      expect(mockRecorderDiscard).toHaveBeenCalled();
    });
  });
});
