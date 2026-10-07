import type { Session } from "@supabase/supabase-js";
import { CONCURRENT_BATCHES } from "@/constants/sms-ai";
import {
  parseSmsWithAi,
  type AiParseProgress,
  type SmsCandidate,
} from "@/services/ai-sms-parser-service";
import {
  tagProgressEmissionError,
  unwrapProgressEmissionError,
} from "@/services/ai-sms-chunk-runner-service";
import { USER_DATA_ACCESS_ERROR_CODES } from "@/services/user-data-access-error-codes";

interface MockFunctionResponse {
  readonly data: unknown;
  readonly error: unknown;
}

interface MockFunctionOptions {
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

const mockStableSession: Session = {
  access_token: "stable-user-a-token",
  refresh_token: "stable-user-a-refresh",
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id: "user-a",
    aud: "authenticated",
    role: "authenticated",
    email: "user-a@example.com",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-10-05T00:00:00.000Z",
  },
};
const mockGetStableAuthSession = jest.fn(() =>
  Promise.resolve({
    data: { session: mockStableSession },
    error: null,
  })
);

const mockInvoke = jest.fn<
  Promise<MockFunctionResponse>,
  [name: string, options: MockFunctionOptions]
>();
const mockAssertExpectedCurrentUser = jest.fn<Promise<void>, [string]>();
const mockRefreshSession = jest.fn();
const mockSignOut = jest.fn();
let mockGeneratedId = 0;

jest.mock("expo-crypto", () => ({
  randomUUID: (): string => `concurrency-control-${++mockGeneratedId}`,
}));

jest.mock("@/services/supabase", () => ({
  getStableAuthSession: (): Promise<{
    data: { session: Session };
    error: null;
  }> => mockGetStableAuthSession(),
  coordinatedRefreshSession: (...args: readonly unknown[]): unknown =>
    mockRefreshSession(...args),
  coordinatedSignOut: (...args: readonly unknown[]): unknown =>
    mockSignOut(...args),
  clearPersistedAuthSession: jest.fn(),
  supabase: {
    auth: {
      refreshSession: (...args: readonly unknown[]): unknown =>
        mockRefreshSession(...args),
      signOut: (...args: readonly unknown[]): unknown => mockSignOut(...args),
    },
    functions: {
      invoke: (
        name: string,
        options: MockFunctionOptions
      ): Promise<MockFunctionResponse> => mockInvoke(name, options),
    },
  },
}));

jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: (expectedUserId: string): Promise<void> =>
    mockAssertExpectedCurrentUser(expectedUserId),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushAsync(): Promise<void> {
  for (let index = 0; index < 30; index += 1) {
    await Promise.resolve();
  }
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function installSignalAwareDeferredInvoke(
  pending: Array<Deferred<MockFunctionResponse>>
): void {
  mockInvoke.mockImplementation(
    (
      _name: string,
      options: MockFunctionOptions
    ): Promise<MockFunctionResponse> => {
      const deferred = createDeferred<MockFunctionResponse>();
      pending.push(deferred);
      const signal = options.signal;
      if (signal === undefined) return deferred.promise;
      if (signal.aborted) {
        deferred.reject(abortError());
        return deferred.promise;
      }
      const handleAbort = (): void => {
        deferred.reject(abortError());
      };
      signal.addEventListener("abort", handleAbort, { once: true });
      deferred.promise.then(
        () => signal.removeEventListener("abort", handleAbort),
        () => signal.removeEventListener("abort", handleAbort)
      );
      return deferred.promise;
    }
  );
}

function category(
  systemName: string,
  displayName: string
): {
  readonly id: string;
  readonly systemName: string;
  readonly displayName: string;
  readonly level: number;
  readonly parentId: string | undefined;
  readonly type: "INCOME" | "EXPENSE";
} {
  return {
    id: `cat-${systemName}`,
    systemName,
    displayName,
    level: 1,
    parentId: undefined,
    type: systemName === "salary" ? "INCOME" : "EXPENSE",
  };
}

const context = {
  categories: [
    category("other", "Other"),
    category("shopping", "Shopping"),
    category("salary", "Salary"),
  ],
  supportedCurrencies: ["EGP", "USD"],
};

function candidate(index: number): SmsCandidate {
  return {
    message: {
      id: `sms-${index}`,
      address: "NBE",
      body: `Purchase message ${index}`,
      date: 1775658180000 + index,
      read: false,
    },
    smsFingerprint: `fingerprint-${index}`,
  };
}

function candidates(count: number): readonly SmsCandidate[] {
  return Array.from({ length: count }, (_, index) => candidate(index));
}

function transaction(messageId: string): unknown {
  return {
    messageId,
    amount: 25,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: `Shop ${messageId}`,
    date: "2026-04-08T12:00:00.000Z",
    categorySystemName: "shopping",
    confidenceScore: 0.9,
    isTrusted: true,
  };
}

function successResponse(messageId: string): MockFunctionResponse {
  return {
    data: { transactions: [transaction(messageId)] },
    error: null,
  };
}

function refusalResponse(
  status: number,
  reason: string,
  sizeScope?: string
): MockFunctionResponse {
  return {
    data: null,
    error: Object.assign(new Error("FunctionsHttpError"), {
      context: new Response(
        JSON.stringify({ reason, sizeScope, availableAt: null }),
        { status, headers: { "content-type": "application/json" } }
      ),
    }),
  };
}

describe("ai-sms-parser-concurrency-control", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvoke.mockReset();
    mockAssertExpectedCurrentUser.mockReset().mockResolvedValue(undefined);
    mockRefreshSession.mockReset().mockResolvedValue({ data: {}, error: null });
    mockSignOut.mockReset().mockResolvedValue({ error: null });
  });

  describe("Gap 2: Synchronous stop on terminal capacity refusal", () => {
    it("synchronously stops queue launching before emitProgress awaits and retains active sibling results", async () => {
      // 11 chunks (11 * 15 = 165 messages)
      const testCandidates = candidates(165);
      const pending: Array<Deferred<MockFunctionResponse>> = [];
      installSignalAwareDeferredInvoke(pending);

      let emitProgressStarted = false;
      const progressDeferred = createDeferred<void>();
      const onProgress = jest.fn(async (): Promise<void> => {
        if (!emitProgressStarted) {
          emitProgressStarted = true;
          await progressDeferred.promise;
        }
      });

      const parsePromise = parseSmsWithAi(
        testCandidates,
        context,
        onProgress,
        new AbortController().signal,
        "user-test"
      );

      await flushAsync();
      // First 10 chunks launched concurrently
      expect(mockInvoke).toHaveBeenCalledTimes(CONCURRENT_BATCHES);

      // Chunk 0 returns capacity_limited refusal (429 burst_limit)
      pending[0]?.resolve(refusalResponse(429, "burst_limit"));
      await flushAsync();

      expect(emitProgressStarted).toBe(true);

      // Sibling 1 returns HTTP 413 payload_limit (batch scope) which split-enqueues children
      // and returns immediately WITHOUT calling emitProgress
      pending[1]?.resolve(refusalResponse(413, "payload_limit", "batch"));
      await flushAsync();

      // Resolve sibling chunks 2..9 with success while onProgress is still awaiting
      for (let index = 2; index < CONCURRENT_BATCHES; index += 1) {
        pending[index]?.resolve(successResponse(`sms-${index * 15}`));
      }
      await flushAsync();

      // Because run.stop() was called synchronously before emitProgress,
      // neither queued initial chunk 11 nor split children of chunk 1 can launch.
      // Total HTTP invocations must strictly remain 10.
      expect(mockInvoke).toHaveBeenCalledTimes(CONCURRENT_BATCHES);

      // Unblock onProgress and drain all remaining callbacks
      progressDeferred.resolve();
      await flushAsync();

      const result = await parsePromise;

      // Active siblings 2..9 were drained and kept (8 successful chunks)
      expect(result.transactions.length).toBe(8);
      expect(result.availability?.reason).toBe("burst_limit");
      expect(result.hasError).toBe(true);

      // Queued refused/deferred candidates are marked capacity_limited unresolved exactly once:
      // refused chunk 0 (15) + split never-started chunk 1 (15) + queued initial chunk 10 (15) = 45
      const capacityUnresolved = result.unresolvedCandidates?.filter(
        (c) => c.reason === "capacity_limited"
      );
      expect(capacityUnresolved).toHaveLength(45);
      const uniqueFingerprints = new Set(
        capacityUnresolved?.map((c) => c.candidate.smsFingerprint)
      );
      expect(uniqueFingerprints.size).toBe(45);
    });
  });

  describe("Gap 3: Progress snapshot immutable capture at enqueue", () => {
    it("captures an immutable snapshot at enqueue time so simultaneous finishes emit distinct chunksCompleted counts", async () => {
      // 3 chunks (45 messages)
      const testCandidates = candidates(45);
      const pending: Array<Deferred<MockFunctionResponse>> = [];
      installSignalAwareDeferredInvoke(pending);

      const capturedProgress: AiParseProgress[] = [];
      const deferreds: Array<Deferred<void>> = [];
      const onProgress = jest.fn(
        async (progress: AiParseProgress): Promise<void> => {
          capturedProgress.push(progress);
          const def = createDeferred<void>();
          deferreds.push(def);
          await def.promise;
        }
      );

      const parsePromise = parseSmsWithAi(
        testCandidates,
        context,
        onProgress,
        new AbortController().signal
      );

      await flushAsync();
      expect(mockInvoke).toHaveBeenCalledTimes(3);

      // All 3 chunks resolve at the same time
      pending[0]?.resolve(successResponse("sms-0"));
      pending[1]?.resolve(successResponse("sms-15"));
      pending[2]?.resolve(successResponse("sms-30"));
      await flushAsync();

      // Release progress callbacks one by one
      for (const def of deferreds) {
        def.resolve();
        await flushAsync();
      }

      await parsePromise;

      expect(capturedProgress.map((p) => p.chunksCompleted)).toEqual([1, 2, 3]);
      expect(capturedProgress.map((p) => p.transactionsSoFar)).toEqual([
        1, 2, 3,
      ]);
    });
  });

  describe("Gap 4: Queued progress abort and expectedUserId guard", () => {
    it("suppresses subsequent queued progress callbacks if abort occurs during blocked first callback", async () => {
      const testCandidates = candidates(30);
      const pending: Array<Deferred<MockFunctionResponse>> = [];
      installSignalAwareDeferredInvoke(pending);

      const controller = new AbortController();
      let firstProgressStarted = false;
      const firstProgressDeferred = createDeferred<void>();
      const onProgress = jest.fn(async (): Promise<void> => {
        if (!firstProgressStarted) {
          firstProgressStarted = true;
          await firstProgressDeferred.promise;
        }
      });

      const parsePromise = parseSmsWithAi(
        testCandidates,
        context,
        onProgress,
        controller.signal
      );

      await flushAsync();
      expect(mockInvoke).toHaveBeenCalledTimes(2);

      // Both chunks resolve
      pending[0]?.resolve(successResponse("sms-0"));
      pending[1]?.resolve(successResponse("sms-15"));
      await flushAsync();

      expect(firstProgressStarted).toBe(true);

      // Cancel while first callback is blocked
      controller.abort();

      // Unblock first callback
      firstProgressDeferred.resolve();
      await flushAsync();

      await expect(parsePromise).rejects.toThrow("SMS parse aborted");
      // Second callback was suppressed
      expect(onProgress).toHaveBeenCalledTimes(1);
    });

    it("suppresses subsequent queued progress callbacks if account changes during blocked first callback", async () => {
      const testCandidates = candidates(30);
      const pending: Array<Deferred<MockFunctionResponse>> = [];
      installSignalAwareDeferredInvoke(pending);

      let firstProgressStarted = false;
      const firstProgressDeferred = createDeferred<void>();
      const onProgress = jest.fn(async (): Promise<void> => {
        if (!firstProgressStarted) {
          firstProgressStarted = true;
          await firstProgressDeferred.promise;
        }
      });

      const parsePromise = parseSmsWithAi(
        testCandidates,
        context,
        onProgress,
        new AbortController().signal,
        "user-original"
      );

      await flushAsync();
      expect(mockInvoke).toHaveBeenCalledTimes(2);

      // Both chunks resolve
      pending[0]?.resolve(successResponse("sms-0"));
      pending[1]?.resolve(successResponse("sms-15"));
      await flushAsync();

      expect(firstProgressStarted).toBe(true);

      // User changes while callback 1 is blocked
      mockAssertExpectedCurrentUser.mockRejectedValue(
        new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED)
      );

      firstProgressDeferred.resolve();
      await flushAsync();

      await expect(parsePromise).rejects.toThrow(
        USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED
      );
      // Callback 2 was suppressed
      expect(onProgress).toHaveBeenCalledTimes(1);
    });
  });

  describe("Gap 5: Immutable error wrapper preserves original Error/primitive", () => {
    it("preserves exact custom Error and error.name without mutating it", async () => {
      const testCandidates = candidates(15);
      mockInvoke.mockResolvedValueOnce(successResponse("sms-0"));

      const customError = new TypeError("Custom progress failure");
      customError.name = "MySpecialCustomError";

      const onProgress = jest.fn((): Promise<void> => {
        throw customError;
      });

      let thrownError: unknown;
      try {
        await parseSmsWithAi(
          testCandidates,
          context,
          onProgress,
          new AbortController().signal
        );
      } catch (err: unknown) {
        thrownError = err;
      }

      expect(thrownError).toBe(customError);
      expect((thrownError as Error).name).toBe("MySpecialCustomError");
    });

    it("preserves non-Error primitive throws and rethrows them instead of silent empty result", async () => {
      const testCandidates = candidates(15);
      mockInvoke.mockResolvedValueOnce(successResponse("sms-0"));

      const primitiveError = "fatal_progress_string_error";
      const onProgress = jest.fn((): Promise<void> => {
        // Primitive-fidelity exception: this test intentionally throws a
        // non-Error value to prove exact rethrow behavior.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw primitiveError;
      });

      let thrownError: unknown;
      try {
        await parseSmsWithAi(
          testCandidates,
          context,
          onProgress,
          new AbortController().signal
        );
      } catch (err: unknown) {
        thrownError = err;
      }

      expect(thrownError).toBe("fatal_progress_string_error");
    });

    it("tagProgressEmissionError returns wrapper with unwrapProgressEmissionError", () => {
      const original = new Error("something went wrong");
      const wrapped = tagProgressEmissionError(original);
      expect(original.name).toBe("Error"); // Not mutated
      expect(unwrapProgressEmissionError(wrapped)).toBe(original);

      const primitive = 42;
      const wrappedPrimitive = tagProgressEmissionError(primitive);
      expect(unwrapProgressEmissionError(wrappedPrimitive)).toBe(42);
    });
  });

  describe("Gap 6: beforeRetry abort guard without expectedUserId", () => {
    it("cancels during 401 token refresh without expectedUserId and prevents second invoke", async () => {
      const testCandidates = candidates(15);
      const controller = new AbortController();

      const refreshDeferred = createDeferred<{
        data: unknown;
        error: unknown;
      }>();
      mockRefreshSession.mockReturnValueOnce(refreshDeferred.promise);

      // First invoke returns 401
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: Object.assign(new Error("FunctionsHttpError"), {
          context: new Response(JSON.stringify({ message: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          }),
        }),
      });

      const parsePromise = parseSmsWithAi(
        testCandidates,
        context,
        undefined,
        controller.signal,
        undefined // expectedUserId is undefined!
      );

      await flushAsync();
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockRefreshSession).toHaveBeenCalledTimes(1);

      // Cancel while refresh is pending
      controller.abort();

      // Refresh resolves with a valid session so the retry guard is reached
      refreshDeferred.resolve({
        data: { session: { access_token: "refreshed-token" } },
        error: null,
      });
      await flushAsync();

      await expect(parsePromise).rejects.toThrow("SMS parse aborted");
      // Second invoke must NEVER happen
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });
  });
});
