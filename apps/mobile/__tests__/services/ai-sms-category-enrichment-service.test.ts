interface MockFunctionOptions {
  readonly body: {
    readonly merchants: readonly unknown[];
  };
  readonly signal?: AbortSignal;
}

interface MockFunctionResponse {
  readonly data: unknown;
  readonly error: unknown;
}

const mockInvoke = jest.fn<
  Promise<MockFunctionResponse>,
  [functionName: string, options: MockFunctionOptions]
>();
const mockLoggerWarn = jest.fn();
const mockAssertExpectedCurrentUser = jest.fn<Promise<void>, [string]>();

jest.mock("@/services/supabase", () => ({
  supabase: {
    functions: {
      invoke: (
        functionName: string,
        options: MockFunctionOptions
      ): Promise<MockFunctionResponse> => mockInvoke(functionName, options),
    },
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: (...args: readonly unknown[]): unknown => mockLoggerWarn(...args),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: (expectedUserId: string): Promise<void> =>
    mockAssertExpectedCurrentUser(expectedUserId),
}));

import type {
  CategoryTreeSource,
  TrustedSmsEligibleFamily,
} from "@monyvi/logic";
import {
  enrichTrustedSmsCategories,
  MIN_TRUSTED_CATEGORY_CONFIDENCE,
  type TrustedSmsCategoryCandidate,
} from "@/services/ai-sms-category-enrichment-service";

interface TestCategory extends CategoryTreeSource {
  readonly isSystem: boolean;
}

function category(
  systemName: string,
  options: {
    readonly isSystem?: boolean;
    readonly type?: "EXPENSE" | "INCOME";
    readonly isHidden?: boolean;
    readonly isInternal?: boolean;
    readonly deleted?: boolean;
  } = {}
): TestCategory {
  return {
    id: `category-${systemName}`,
    systemName,
    displayName: systemName,
    level: 1,
    type: options.type ?? "EXPENSE",
    isSystem: options.isSystem ?? true,
    isHidden: options.isHidden ?? false,
    isInternal: options.isInternal ?? false,
    deleted: options.deleted ?? false,
  };
}

function candidate(
  candidateId: string,
  merchant: string,
  messageFamily: TrustedSmsEligibleFamily = "card_purchase"
): TrustedSmsCategoryCandidate {
  return {
    candidateId,
    merchant,
    transactionType: "EXPENSE",
    messageFamily,
  };
}

const categories: readonly TestCategory[] = [
  category("other"),
  category("shopping"),
  category("salary", { type: "INCOME" }),
  category("my_private_category", { isSystem: false }),
  category("asset_purchase", { isInternal: true }),
  category("hidden_expense", { isHidden: true }),
  category("deleted_expense", { deleted: true }),
];

describe("ai-sms-category-enrichment-service", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockLoggerWarn.mockReset();
    mockAssertExpectedCurrentUser.mockReset();
    mockAssertExpectedCurrentUser.mockResolvedValue();
  });

  it("does not invoke category enrichment after the initiating user changes", async () => {
    mockAssertExpectedCurrentUser.mockRejectedValueOnce(
      new Error("AUTH_SCOPE_CHANGED")
    );

    await expect(
      enrichTrustedSmsCategories(
        [candidate("candidate-1", "Shop")],
        categories,
        undefined,
        "user-1"
      )
    ).rejects.toThrow("AUTH_SCOPE_CHANGED");

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("sends one minimal system-category request for duplicate eligible merchants", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        categories: [
          {
            merchantId: "merchant-1",
            categorySystemName: "shopping",
            confidence: 0.96,
          },
        ],
      },
      error: null,
    });

    const result = await enrichTrustedSmsCategories(
      [
        candidate("candidate-1", "MYFAWRY  EXPRESS"),
        candidate("candidate-2", "myfawry express"),
        candidate("candidate-atm", "ATM-Inter", "atm_withdrawal"),
      ],
      categories
    );

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [, invokeOptions] = mockInvoke.mock.calls[0];
    expect(invokeOptions.body).toEqual({
      merchants: [
        {
          id: "merchant-1",
          merchant: "MYFAWRY  EXPRESS",
          transactionType: "EXPENSE",
          messageFamily: "card_purchase",
        },
      ],
    });
    expect(invokeOptions.signal).toBeInstanceOf(AbortSignal);
    expect(result.outcomesByCandidateId.get("candidate-1")).toEqual({
      categorySystemName: "shopping",
      confidence: 0.96,
    });
    expect(result.outcomesByCandidateId.get("candidate-2")).toEqual({
      categorySystemName: "shopping",
      confidence: 0.96,
    });
    expect(result.outcomesByCandidateId.has("candidate-atm")).toBe(false);
  });

  it("rejects low-confidence and invented categories without exposing them as outcomes", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        categories: [
          {
            merchantId: "merchant-1",
            categorySystemName: "shopping",
            confidence: MIN_TRUSTED_CATEGORY_CONFIDENCE - 0.01,
          },
          {
            merchantId: "merchant-2",
            categorySystemName: "invented",
            confidence: 0.99,
          },
        ],
      },
      error: null,
    });

    const result = await enrichTrustedSmsCategories(
      [
        candidate("candidate-1", "Shop One"),
        candidate("candidate-2", "Shop Two"),
      ],
      categories
    );

    expect(result.outcomesByCandidateId.size).toBe(0);
    expect(result.rejectedResultCount).toBe(2);
  });

  it("rejects duplicate response identities instead of choosing one arbitrarily", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        categories: [
          {
            merchantId: "merchant-1",
            categorySystemName: "shopping",
            confidence: 0.95,
          },
          {
            merchantId: "merchant-1",
            categorySystemName: "other",
            confidence: 0.99,
          },
        ],
      },
      error: null,
    });

    const result = await enrichTrustedSmsCategories(
      [candidate("candidate-1", "Shop")],
      categories
    );

    expect(result.outcomesByCandidateId.size).toBe(0);
    expect(result.rejectedResultCount).toBe(2);
  });

  it("rejects a valid outcome when a malformed sibling repeats its merchant identity", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        categories: [
          {
            merchantId: "merchant-1",
            categorySystemName: "shopping",
            confidence: 0.95,
          },
          {
            merchantId: "merchant-1",
            categorySystemName: "shopping",
          },
        ],
      },
      error: null,
    });

    const result = await enrichTrustedSmsCategories(
      [candidate("candidate-1", "Shop")],
      categories
    );

    expect(result.outcomesByCandidateId.size).toBe(0);
    expect(result.rejectedResultCount).toBe(2);
  });

  it.each(["other", "uncategorized"])(
    "rejects the non-informative %s category even when confidence is high",
    async (fallbackCategory) => {
      mockInvoke.mockResolvedValueOnce({
        data: {
          categories: [
            {
              merchantId: "merchant-1",
              categorySystemName: fallbackCategory,
              confidence: 0.99,
            },
          ],
        },
        error: null,
      });

      const result = await enrichTrustedSmsCategories(
        [candidate("candidate-1", "Shop")],
        categories
      );

      expect(result.outcomesByCandidateId.size).toBe(0);
      expect(result.rejectedResultCount).toBe(1);
    }
  );

  it("rejects a locally available category outside the enrichment-safe taxonomy", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        categories: [
          {
            merchantId: "merchant-1",
            categorySystemName: "shopping_other",
            confidence: 0.99,
          },
        ],
      },
      error: null,
    });

    const result = await enrichTrustedSmsCategories(
      [candidate("candidate-1", "Shop")],
      [...categories, category("shopping_other")]
    );

    expect(result.outcomesByCandidateId.size).toBe(0);
    expect(result.rejectedResultCount).toBe(1);
  });

  it("accepts valid partial results and reports missing merchant outcomes", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        categories: [
          {
            merchantId: "merchant-1",
            categorySystemName: "shopping",
            confidence: 0.95,
          },
        ],
      },
      error: null,
    });

    const result = await enrichTrustedSmsCategories(
      [
        candidate("candidate-1", "Shop One"),
        candidate("candidate-2", "Shop Two"),
      ],
      categories
    );

    expect(result.outcomesByCandidateId.has("candidate-1")).toBe(true);
    expect(result.outcomesByCandidateId.has("candidate-2")).toBe(false);
    expect(result.missingResultCount).toBe(1);
  });

  it("rejects response fields outside the category-only contract", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        categories: [
          {
            merchantId: "merchant-1",
            categorySystemName: "shopping",
            confidence: 0.95,
            normalizedMerchant: "Changed Shop",
          },
        ],
      },
      error: null,
    });

    const result = await enrichTrustedSmsCategories(
      [candidate("candidate-1", "Original Shop")],
      categories
    );

    expect(result.outcomesByCandidateId.size).toBe(0);
    expect(result.rejectedResultCount).toBe(1);
  });

  it("does not invoke the endpoint after cancellation", async () => {
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      enrichTrustedSmsCategories(
        [candidate("candidate-1", "Shop")],
        categories,
        abortController.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("propagates cancellation when the transport wraps the abort error", async () => {
    const abortController = new AbortController();
    mockInvoke.mockImplementationOnce(() => {
      abortController.abort();
      return Promise.reject(new Error("FunctionsFetchError"));
    });

    await expect(
      enrichTrustedSmsCategories(
        [candidate("candidate-1", "Shop")],
        categories,
        abortController.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("chunks large unique-merchant batches without losing successful outcomes", async () => {
    const candidates = Array.from({ length: 41 }, (_, index) =>
      candidate(`candidate-${index + 1}`, `Shop ${index + 1}`)
    );
    mockInvoke
      .mockResolvedValueOnce({ data: { categories: [] }, error: null })
      .mockResolvedValueOnce({ data: { categories: [] }, error: null })
      .mockResolvedValueOnce({
        data: {
          categories: [
            {
              merchantId: "merchant-41",
              categorySystemName: "shopping",
              confidence: 0.95,
            },
          ],
        },
        error: null,
      });

    const result = await enrichTrustedSmsCategories(candidates, categories);

    expect(mockInvoke).toHaveBeenCalledTimes(3);
    expect(
      mockInvoke.mock.calls.map(([, options]) => options.body.merchants.length)
    ).toEqual([20, 20, 1]);
    expect(result.outcomesByCandidateId.get("candidate-41")).toEqual({
      categorySystemName: "shopping",
      confidence: 0.95,
    });
    expect(result.attemptedMerchantCount).toBe(41);
    expect(result.missingResultCount).toBe(40);
  });

  it("runs at most two category chunks concurrently", async () => {
    const candidates = Array.from({ length: 41 }, (_, index) =>
      candidate(`candidate-${index + 1}`, `Shop ${index + 1}`)
    );
    const pendingResolvers: Array<(response: MockFunctionResponse) => void> =
      [];
    let activeRequestCount = 0;
    let maximumActiveRequestCount = 0;
    mockInvoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          activeRequestCount += 1;
          maximumActiveRequestCount = Math.max(
            maximumActiveRequestCount,
            activeRequestCount
          );
          pendingResolvers.push((response) => {
            activeRequestCount -= 1;
            resolve(response);
          });
        })
    );

    const pending = enrichTrustedSmsCategories(candidates, categories);
    await Promise.resolve();

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    pendingResolvers[0]?.({ data: { categories: [] }, error: null });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    pendingResolvers[1]?.({ data: { categories: [] }, error: null });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(mockInvoke).toHaveBeenCalledTimes(3);
    expect(maximumActiveRequestCount).toBe(2);

    pendingResolvers[2]?.({ data: { categories: [] }, error: null });
    await pending;
    expect(maximumActiveRequestCount).toBe(2);
  });

  it("preserves successful chunk outcomes when a later chunk fails", async () => {
    const candidates = Array.from({ length: 21 }, (_, index) =>
      candidate(`candidate-${index + 1}`, `Shop ${index + 1}`)
    );
    mockInvoke
      .mockResolvedValueOnce({
        data: {
          categories: [
            {
              merchantId: "merchant-1",
              categorySystemName: "shopping",
              confidence: 0.95,
            },
          ],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: Object.assign(new Error("FunctionsHttpError"), {
          context: new Response("temporary", { status: 500 }),
        }),
      });

    const result = await enrichTrustedSmsCategories(candidates, categories);

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(result.outcomesByCandidateId.get("candidate-1")).toEqual({
      categorySystemName: "shopping",
      confidence: 0.95,
    });
    expect(result.acceptedCandidateCount).toBe(1);
    expect(result.attemptedMerchantCount).toBe(21);
    expect(result.missingResultCount).toBe(20);
    expect(result.hasError).toBe(true);
  });

  it("uses one 20-second total deadline across bounded concurrent chunks", async () => {
    jest.useFakeTimers();
    const candidates = Array.from({ length: 41 }, (_, index) =>
      candidate(`candidate-${index + 1}`, `Shop ${index + 1}`)
    );
    mockInvoke.mockImplementation(
      (_functionName, options) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () =>
              reject(
                Object.assign(new Error("aborted"), { name: "AbortError" })
              ),
            { once: true }
          );
        })
    );

    const pending = enrichTrustedSmsCategories(candidates, categories);
    await jest.advanceTimersByTimeAsync(20000);

    await expect(pending).resolves.toMatchObject({
      hasError: true,
      isTimedOut: true,
      attemptedMerchantCount: 40,
    });
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it("does not invoke a category chunk after the shared deadline expires", async () => {
    jest.useFakeTimers();
    mockAssertExpectedCurrentUser.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 20001))
    );

    const pending = enrichTrustedSmsCategories(
      [candidate("candidate-1", "Shop")],
      categories,
      undefined,
      "user-1"
    );
    await jest.advanceTimersByTimeAsync(20001);

    await expect(pending).resolves.toMatchObject({
      hasError: true,
      isTimedOut: true,
    });
    expect(mockInvoke).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("honors the 20-second total deadline when the transport ignores abort signals", async () => {
    jest.useFakeTimers();
    mockInvoke.mockImplementationOnce(() => new Promise(() => undefined));

    const pending = enrichTrustedSmsCategories(
      [candidate("candidate-1", "Shop")],
      categories
    );
    await jest.advanceTimersByTimeAsync(20000);

    await expect(pending).resolves.toMatchObject({
      attemptedMerchantCount: 1,
      hasError: true,
      isTimedOut: true,
      missingResultCount: 1,
    });
    jest.useRealTimers();
  });

  it("returns a safe empty result for transport failures without logging merchant data", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("FunctionsHttpError"), {
        context: new Response("temporary", { status: 500 }),
      }),
    });

    const result = await enrichTrustedSmsCategories(
      [candidate("candidate-1", "Private Merchant")],
      categories
    );

    expect(result.hasError).toBe(true);
    expect(result.outcomesByCandidateId.size).toBe(0);
    expect(JSON.stringify(mockLoggerWarn.mock.calls)).not.toContain(
      "Private Merchant"
    );
  });

  it.each([
    ["network", new TypeError("Network request failed")],
    [
      "timeout",
      Object.assign(new Error("Request timed out"), { name: "TimeoutError" }),
    ],
  ])(
    "preserves local results after a %s exception",
    async (_failureKind, transportError) => {
      mockInvoke.mockRejectedValueOnce(transportError);

      const result = await enrichTrustedSmsCategories(
        [candidate("candidate-1", "Private Merchant")],
        categories
      );

      expect(result).toMatchObject({
        acceptedCandidateCount: 0,
        attemptedMerchantCount: 1,
        hasError: true,
        missingResultCount: 1,
      });
      expect(result.outcomesByCandidateId.size).toBe(0);
      expect(JSON.stringify(mockLoggerWarn.mock.calls)).not.toContain(
        "Private Merchant"
      );
    }
  );

  it("preserves local work when remote consent becomes stale", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("FunctionsHttpError"), {
        context: new Response("consent", { status: 403 }),
      }),
    });

    const result = await enrichTrustedSmsCategories(
      [candidate("candidate-1", "Shop")],
      categories
    );

    expect(result).toMatchObject({
      hasError: true,
      isConsentRequired: true,
      attemptedMerchantCount: 1,
      missingResultCount: 1,
    });
    expect(result.outcomesByCandidateId.size).toBe(0);
  });

  it("times out an in-flight category request and preserves local work", async () => {
    jest.useFakeTimers();
    mockInvoke.mockImplementationOnce(
      (_functionName, options) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () =>
              reject(
                Object.assign(new Error("aborted"), { name: "AbortError" })
              ),
            { once: true }
          );
        })
    );

    const pending = enrichTrustedSmsCategories(
      [candidate("candidate-1", "Slow Shop")],
      categories
    );
    await jest.runOnlyPendingTimersAsync();

    await expect(pending).resolves.toMatchObject({
      hasError: true,
      isTimedOut: true,
      attemptedMerchantCount: 1,
      missingResultCount: 1,
    });
    jest.useRealTimers();
  });
});
