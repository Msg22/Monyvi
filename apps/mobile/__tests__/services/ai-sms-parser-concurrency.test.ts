import { CONCURRENT_BATCHES } from "@/constants/sms-ai";
import {
  isAiConsentRequiredError,
  parseSmsWithAi,
  type SmsCandidate,
} from "@/services/ai-sms-parser-service";
import { getFixtureById } from "@/services/dev/sms-fixtures";

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

const mockInvoke = jest.fn<
  Promise<MockFunctionResponse>,
  [name: string, options: MockFunctionOptions]
>();
const mockAssertExpectedCurrentUser = jest.fn<Promise<void>, [string]>();
const mockRefreshSession = jest.fn();
const mockSignOut = jest.fn();
let mockGeneratedId = 0;

jest.mock("expo-crypto", () => ({
  randomUUID: (): string => `concurrency-request-${++mockGeneratedId}`,
}));

jest.mock("@/services/supabase", () => ({
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

const originalEnv = process.env;

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

/**
 * A fetch mock that honors the passed AbortSignal: rejecting on abort (with
 * listener cleanup) so production's allSettled drain can settle without the
 * test having to reject sibling requests manually.
 */
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

function assertActiveSignalsAborted(): void {
  const signals = mockInvoke.mock.calls
    .map(([, options]) => options.signal)
    .filter((signal): signal is AbortSignal => signal !== undefined);
  expect(signals.length).toBeGreaterThan(0);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
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
    category("bank_fees", "Bank Fees"),
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

function fixtureCandidate(fixtureId: string): SmsCandidate {
  const fixture = getFixtureById(fixtureId);
  if (!fixture) throw new Error(`Missing fixture ${fixtureId}`);
  return {
    message: {
      id: fixture.id,
      address: fixture.sender,
      body: fixture.body,
      date: fixture.timestamp ?? 1775658180000,
      read: false,
    },
    smsFingerprint: `fingerprint-${fixture.id}`,
  };
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

function httpErrorResponse(status: number): MockFunctionResponse {
  return {
    data: null,
    error: Object.assign(new Error("FunctionsHttpError"), {
      context: new Response("temporary upstream failure", { status }),
    }),
  };
}

function enableSafeguardQa(profileId: string): void {
  process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA = "true";
  process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER = "simulated";
  process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX = "fixture";
  process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE = profileId;
  process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID = "unit-test-run";
}

function responseMessageIds(options: MockFunctionOptions): readonly string[] {
  const body = options.body as
    | { readonly messages?: ReadonlyArray<{ readonly id: string }> }
    | undefined;
  return (body?.messages ?? []).map((message) => message.id);
}

function resolvePendingChunks(
  pending: Array<Deferred<MockFunctionResponse>>,
  chunkCount: number
): void {
  for (let index = 0; index < pending.length; index += 1) {
    pending[index]?.resolve(
      successResponse(`sms-${Math.min(index, chunkCount - 1) * 15}`)
    );
  }
}

describe("ai-sms-parser-service concurrent transport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGeneratedId = 0;
    mockAssertExpectedCurrentUser.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue({ error: null });
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_MONYVI_TEST_MODE;
    delete process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("runs real transport chunks concurrently up to the shared cap and refills instead of waiting for waves", async () => {
    const input = candidates(160);
    const pending: Array<Deferred<MockFunctionResponse>> = [];
    mockInvoke.mockImplementation((): Promise<MockFunctionResponse> => {
      const deferred = createDeferred<MockFunctionResponse>();
      pending.push(deferred);
      return deferred.promise;
    });
    const progressBatchCounts: number[] = [];
    const parsePromise = parseSmsWithAi(input, context, (progress) => {
      progressBatchCounts.push(progress.concurrentBatchCount ?? 1);
    });
    await flushAsync();

    expect(mockInvoke).toHaveBeenCalledTimes(CONCURRENT_BATCHES);
    expect(pending).toHaveLength(CONCURRENT_BATCHES);

    pending[0]?.resolve(successResponse("sms-0"));
    await flushAsync();
    expect(mockInvoke).toHaveBeenCalledTimes(CONCURRENT_BATCHES + 1);
    expect(pending).toHaveLength(CONCURRENT_BATCHES + 1);

    resolvePendingChunks(pending, 11);
    const result = await parsePromise;

    expect(result.transactions).toHaveLength(11);
    expect(result.hasError).toBe(false);
    expect(
      progressBatchCounts.some(
        (concurrentBatchCount) => concurrentBatchCount >= 2
      )
    ).toBe(true);
  });

  it("preserves out-of-order partial results and keeps progress counters monotonic", async () => {
    const input = candidates(45);
    const pending: Array<Deferred<MockFunctionResponse>> = [];
    mockInvoke.mockImplementation((): Promise<MockFunctionResponse> => {
      const deferred = createDeferred<MockFunctionResponse>();
      pending.push(deferred);
      return deferred.promise;
    });
    const seenFingerprints = new Set<string>();
    const counters: Array<readonly [number, number]> = [];
    const parsePromise = parseSmsWithAi(input, context, (progress) => {
      for (const transaction of progress.completedTransactions) {
        seenFingerprints.add(transaction.smsFingerprint);
      }
      counters.push([progress.chunksCompleted, progress.transactionsSoFar]);
    });
    await flushAsync();
    expect(pending).toHaveLength(3);

    pending[2]?.resolve(successResponse("sms-30"));
    await flushAsync();
    pending[0]?.resolve(successResponse("sms-0"));
    await flushAsync();
    pending[1]?.resolve(successResponse("sms-15"));

    const result = await parsePromise;
    expect(result.transactions).toHaveLength(3);
    expect(result.hasError).toBe(false);
    expect(seenFingerprints).toEqual(
      new Set(["fingerprint-0", "fingerprint-15", "fingerprint-30"])
    );
    expect(seenFingerprints.size).toBe(3);
    for (let index = 1; index < counters.length; index += 1) {
      const previous = counters[index - 1];
      const current = counters[index];
      expect(current?.[0] ?? 0).toBeGreaterThanOrEqual(previous?.[0] ?? 0);
      expect(current?.[1] ?? 0).toBeGreaterThanOrEqual(previous?.[1] ?? 0);
    }
    expect(counters[counters.length - 1]?.[0]).toBe(3);
    expect(counters[counters.length - 1]?.[1]).toBe(3);
  });

  it("serializes async onProgress so callbacks never run concurrently and deltas are not lost", async () => {
    const input = candidates(45);
    const pending: Array<Deferred<MockFunctionResponse>> = [];
    mockInvoke.mockImplementation((): Promise<MockFunctionResponse> => {
      const deferred = createDeferred<MockFunctionResponse>();
      pending.push(deferred);
      return deferred.promise;
    });
    let activeProgress = 0;
    let maxActiveProgress = 0;
    const completedChunkCounts: number[] = [];
    const parsePromise = parseSmsWithAi(
      input,
      context,
      async (progress): Promise<void> => {
        activeProgress += 1;
        maxActiveProgress = Math.max(maxActiveProgress, activeProgress);
        completedChunkCounts.push(progress.chunksCompleted);
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        activeProgress -= 1;
      }
    );
    await flushAsync();
    expect(pending).toHaveLength(3);

    for (let index = 0; index < pending.length; index += 1) {
      pending[index]?.resolve(successResponse(`sms-${index * 15}`));
      await flushAsync();
    }
    const result = await parsePromise;

    expect(result.transactions).toHaveLength(3);
    expect(maxActiveProgress).toBe(1);
    expect(completedChunkCounts).toEqual([1, 2, 3]);
  });

  it("aborts all active requests, never launches queued chunks, and does not retry when cancelled", async () => {
    const controller = new AbortController();
    const input = candidates(160);
    const pending: Array<Deferred<MockFunctionResponse>> = [];
    installSignalAwareDeferredInvoke(pending);

    const parsePromise = parseSmsWithAi(
      input,
      context,
      undefined,
      controller.signal
    );
    await flushAsync();
    expect(mockInvoke).toHaveBeenCalledTimes(CONCURRENT_BATCHES);

    controller.abort();
    await flushAsync();

    await expect(parsePromise).rejects.toMatchObject({ name: "AbortError" });
    assertActiveSignalsAborted();
    expect(mockInvoke).toHaveBeenCalledTimes(CONCURRENT_BATCHES);
    expect(mockInvoke).not.toHaveBeenCalledTimes(CONCURRENT_BATCHES + 1);
  });

  it("propagates owner-change control-flow, aborts siblings, and stops queued launches", async () => {
    const input = candidates(160);
    const pending: Array<Deferred<MockFunctionResponse>> = [];
    installSignalAwareDeferredInvoke(pending);
    let userCheckCount = 0;
    mockAssertExpectedCurrentUser.mockImplementation(
      (_expectedUserId: string): Promise<void> => {
        userCheckCount += 1;
        if (userCheckCount === CONCURRENT_BATCHES + 1) {
          return Promise.reject(new Error("AUTH_SCOPE_CHANGED"));
        }
        return Promise.resolve();
      }
    );

    const parsePromise = parseSmsWithAi(
      input,
      context,
      undefined,
      undefined,
      "user-a"
    );
    await flushAsync();
    expect(mockInvoke).toHaveBeenCalledTimes(CONCURRENT_BATCHES);

    pending[0]?.resolve(successResponse("sms-0"));
    await expect(parsePromise).rejects.toThrow("AUTH_SCOPE_CHANGED");
    assertActiveSignalsAborted();
    expect(mockInvoke).toHaveBeenCalledTimes(CONCURRENT_BATCHES);
  });

  it("propagates consent-required control-flow, aborts siblings, and stops queued launches", async () => {
    const input = candidates(160);
    const pending: Array<Deferred<MockFunctionResponse>> = [];
    installSignalAwareDeferredInvoke(pending);

    const parsePromise = parseSmsWithAi(input, context);
    await flushAsync();
    expect(mockInvoke).toHaveBeenCalledTimes(CONCURRENT_BATCHES);

    pending[0]?.resolve({
      data: null,
      error: Object.assign(new Error("FunctionsHttpError"), {
        context: new Response("AI processing consent required", {
          status: 403,
        }),
      }),
    });
    try {
      await parsePromise;
      throw new Error("Expected consent-required error");
    } catch (error: unknown) {
      expect(isAiConsentRequiredError(error)).toBe(true);
    }
    assertActiveSignalsAborted();
    expect(mockInvoke).toHaveBeenCalledTimes(CONCURRENT_BATCHES);
  });

  it("aborts and drains when an async progress callback rejects", async () => {
    const input = candidates(45);
    const pending: Array<Deferred<MockFunctionResponse>> = [];
    installSignalAwareDeferredInvoke(pending);
    let progressCalled = false;

    const parsePromise = parseSmsWithAi(input, context, (): Promise<void> => {
      if (!progressCalled) {
        progressCalled = true;
        return Promise.reject(new Error("progress-boom"));
      }
      return Promise.resolve();
    });
    await flushAsync();
    expect(pending).toHaveLength(3);

    pending[0]?.resolve(successResponse("sms-0"));
    await flushAsync();

    await expect(parsePromise).rejects.toThrow("progress-boom");
    assertActiveSignalsAborted();
    expect(mockInvoke).toHaveBeenCalledTimes(3);
  });

  it("recursively splits 413 batches with fresh request keys, bounds at single candidates, and keeps left-before-right ordering", async () => {
    const input = candidates(15);
    const invokedMessageIds: string[][] = [];
    const requestKeys = new Set<string>();
    const progressTotals: Array<readonly [number, number]> = [];
    mockInvoke.mockImplementation(
      (
        _name: string,
        options: MockFunctionOptions
      ): Promise<MockFunctionResponse> => {
        const body = options.body as
          | { readonly requestKey?: string }
          | undefined;
        if (body?.requestKey !== undefined) requestKeys.add(body.requestKey);
        const messageIds = responseMessageIds(options);
        invokedMessageIds.push([...messageIds]);
        if (messageIds.length > 1) {
          return Promise.resolve(
            refusalResponse(413, "input_token_limit", "batch")
          );
        }
        return Promise.resolve(
          refusalResponse(413, "input_token_limit", "candidate")
        );
      }
    );

    const result = await parseSmsWithAi(input, context, (progress) => {
      progressTotals.push([progress.chunksCompleted, progress.totalChunks]);
    });

    expect(invokedMessageIds[0]?.length).toBe(15);
    const leftIds = invokedMessageIds[1] ?? [];
    const rightIds = invokedMessageIds[2] ?? [];
    expect(leftIds[0]).toBe("sms-0");
    expect(rightIds[rightIds.length - 1]).toBe("sms-14");
    expect([...leftIds, ...rightIds]).toEqual(
      input.map((value) => value.message.id)
    );
    expect(result.oversizedCandidates).toHaveLength(15);
    expect(
      new Set(
        (result.oversizedCandidates ?? []).map((value) => value.smsFingerprint)
      ).size
    ).toBe(15);
    expect(result.unresolvedCandidates).toHaveLength(0);
    expect(result.isRetryable).toBe(false);
    expect(requestKeys.size).toBe(invokedMessageIds.length);
    expect(progressTotals[progressTotals.length - 1]).toEqual([15, 15]);
  });

  it("keeps already-active successes and marks every refused-branch candidate unresolved exactly once at terminal rolling capacity", async () => {
    const input = candidates(22);
    mockInvoke.mockImplementation(
      (
        _name: string,
        options: MockFunctionOptions
      ): Promise<MockFunctionResponse> => {
        const messageIds = responseMessageIds(options);
        if (messageIds.length === 15) {
          return Promise.resolve(successResponse(messageIds[0] ?? "sms-0"));
        }
        return Promise.resolve(refusalResponse(429, "rolling_limit"));
      }
    );

    const result = await parseSmsWithAi(input, context);

    expect(result.transactions).toEqual([
      expect.objectContaining({ smsFingerprint: "fingerprint-0" }),
    ]);
    const unresolved = result.unresolvedCandidates ?? [];
    expect(unresolved).toHaveLength(7);
    expect(
      new Set(unresolved.map((entry) => entry.candidate.smsFingerprint)).size
    ).toBe(7);
    expect(
      unresolved.map((entry) => entry.candidate.smsFingerprint).sort()
    ).toEqual(
      Array.from(
        { length: 7 },
        (_, index) => `fingerprint-${15 + index}`
      ).sort()
    );
    expect(
      unresolved.every(
        (entry) =>
          entry.reason === "capacity_limited" && entry.isRetryable === false
      )
    ).toBe(true);
    expect(
      unresolved.some(
        (entry) => entry.candidate.smsFingerprint === "fingerprint-0"
      )
    ).toBe(false);
    expect(result.hasError).toBe(true);
    expect(result.isRetryable).toBe(false);
  });

  it("keeps partial successes and continues the queue after a nonfatal 5xx batch failure", async () => {
    const input = candidates(45);
    mockInvoke.mockImplementation(
      (
        _name: string,
        options: MockFunctionOptions
      ): Promise<MockFunctionResponse> => {
        const messageIds = responseMessageIds(options);
        if (messageIds.includes("sms-0")) {
          return Promise.resolve(successResponse("sms-0"));
        }
        if (messageIds.includes("sms-15")) {
          return Promise.resolve(httpErrorResponse(502));
        }
        return Promise.resolve(successResponse("sms-30"));
      }
    );

    const result = await parseSmsWithAi(input, context);

    expect(result.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ smsFingerprint: "fingerprint-0" }),
        expect.objectContaining({ smsFingerprint: "fingerprint-30" }),
      ])
    );
    expect(result.transactions).toHaveLength(2);
    expect(result.hasError).toBe(true);
    const unresolved = result.unresolvedCandidates ?? [];
    expect(unresolved).toHaveLength(15);
    expect(
      unresolved.every(
        (entry) => entry.reason === "chunk_failed" && entry.isRetryable === true
      )
    ).toBe(true);
    expect(mockInvoke).toHaveBeenCalledTimes(3);
  });

  it("keeps one scan identity and distinct request keys across concurrent chunks", async () => {
    const input = candidates(160);
    const pending: Array<Deferred<MockFunctionResponse>> = [];
    installSignalAwareDeferredInvoke(pending);

    const parsePromise = parseSmsWithAi(
      input,
      context,
      undefined,
      undefined,
      "user-a",
      {
        scanSessionId: "scan-session",
        scanKind: "incremental",
        scanStartedAtMs: 123,
      }
    );
    await flushAsync();

    const bodies = mockInvoke.mock.calls.map(
      ([, options]) => options.body as Record<string, unknown>
    );
    expect(bodies.length).toBe(CONCURRENT_BATCHES);
    expect(bodies.every((body) => body.scanSessionId === "scan-session")).toBe(
      true
    );
    expect(
      bodies.every((body) => body.scanStartedAt === new Date(123).toISOString())
    ).toBe(true);
    const keys = bodies.map((body) => String(body.requestKey));
    expect(new Set(keys).size).toBe(keys.length);

    resolvePendingChunks(pending, 11);
    await flushAsync();
    resolvePendingChunks(pending, 11);
    const result = await parsePromise;
    expect(result.transactions).toHaveLength(11);
  });

  it("retries an authenticated 401 with the same request identity", async () => {
    mockInvoke
      .mockResolvedValueOnce({
        data: null,
        error: Object.assign(new Error("unauthenticated"), {
          context: new Response(null, { status: 401 }),
        }),
      })
      .mockResolvedValueOnce(successResponse("sms-0"));
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: "refreshed-token" } },
      error: null,
    });

    await parseSmsWithAi(
      [candidate(0)],
      context,
      undefined,
      undefined,
      "user-a"
    );

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    const firstKey = (
      mockInvoke.mock.calls[0]?.[1].body as { readonly requestKey: string }
    ).requestKey;
    const secondKey = (
      mockInvoke.mock.calls[1]?.[1].body as { readonly requestKey: string }
    ).requestKey;
    expect(secondKey).toBe(firstKey);
    expect(
      (
        mockInvoke.mock.calls[1]?.[1].headers as Readonly<
          Record<string, string>
        >
      ).Authorization
    ).toBe("Bearer refreshed-token");
  });

  it("performs a single HTTP request for a single candidate (live/headless compatibility)", async () => {
    mockInvoke.mockResolvedValueOnce(successResponse("sms-0"));

    const result = await parseSmsWithAi([candidate(0)], context);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.smsFingerprint).toBe("fingerprint-0");
  });

  it("keeps QA transport sequential with its own request size and default concurrency", async () => {
    jest.useFakeTimers();
    try {
      enableSafeguardQa("partial-quota-v1");
      mockInvoke.mockResolvedValue({ data: { transactions: [] }, error: null });
      const concurrencyValues: number[] = [];

      const resultPromise = parseSmsWithAi(
        candidates(3),
        context,
        (progress) => {
          concurrencyValues.push(progress.concurrentBatchCount ?? 1);
        }
      );
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(2_000);
      await resultPromise;

      expect(mockInvoke).toHaveBeenCalledTimes(2);
      const chunkSizes = mockInvoke.mock.calls.map(
        ([, options]) => responseMessageIds(options).length
      );
      expect(chunkSizes).toEqual([2, 1]);
      expect(concurrencyValues.every((value) => value === 1)).toBe(true);
      expect(
        mockInvoke.mock.calls.every(([name]) => name === "sms-safeguard-qa")
      ).toBe(true);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it("uses the fixture parser unchanged with default concurrency for progress", async () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "e2e";
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "fixture";
    const concurrencyValues: number[] = [];

    const result = await parseSmsWithAi(
      [fixtureCandidate("nbe_debit_purchase")],
      context,
      (progress) => {
        concurrencyValues.push(progress.concurrentBatchCount ?? 1);
      }
    );

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.transactions).toHaveLength(1);
    expect(concurrencyValues.every((value) => value === 1)).toBe(true);
  });
});
