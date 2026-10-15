import { parseVoiceWithAi } from "@/services/ai-voice-parser-service";
import type { Category } from "@monyvi/db";

interface MockVoiceFunctionResponse {
  readonly data: unknown;
  readonly error: unknown;
}

interface MockVoiceFunctionOptions {
  readonly body: unknown;
  readonly signal?: AbortSignal;
}

const mockInvoke = jest.fn<
  Promise<MockVoiceFunctionResponse>,
  [name: string, options: MockVoiceFunctionOptions]
>();

jest.mock("@/services/supabase", () => ({
  supabase: {
    functions: {
      invoke: (
        name: string,
        options: MockVoiceFunctionOptions
      ): Promise<MockVoiceFunctionResponse> => mockInvoke(name, options),
    },
  },
}));

// Legacy-only parser tests must never enter T010's native DB read model.
// The SQL adapter may be statically imported, but this boundary remains inert.
jest.mock("@/services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots: jest.fn(),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
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

describe("ai-voice-parser-service pre-transport category validation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fails fast with config error and performs ZERO network transport invokes when categoryRecords is empty", async () => {
    const result = await parseVoiceWithAi({
      audioUri: "file://dummy.m4a",
      requestKey: "req-123",
      callerTimeZone: "Africa/Cairo",
      categories: "L1: food_drinks\n  L2: groceries",
      accounts: [{ id: "acc-1", name: "Cash", currency: "EGP" }],
      preferredCurrency: "EGP",
      categoryRecords: [], // empty category records -> categoryMap.size === 0
    });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "config",
      message:
        "Category data is unavailable. Please restart the app and try again.",
      retryableSameRequest: true,
    });
  });

  it("retries same requestKey after config failure when caller provides fresh categories", async () => {
    const requestKey = "req-stable-retry-key";

    // 1. Initial attempt with empty categories fails before network transport
    const initialResult = await parseVoiceWithAi({
      audioUri: "file://dummy.m4a",
      requestKey,
      callerTimeZone: "Africa/Cairo",
      categories: "",
      accounts: [{ id: "acc-1", name: "Cash", currency: "EGP" }],
      preferredCurrency: "EGP",
      categoryRecords: [],
    });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(initialResult).toEqual({
      kind: "config",
      message:
        "Category data is unavailable. Please restart the app and try again.",
      retryableSameRequest: true,
    });

    // 2. Retry with the EXACT same requestKey and valid categories proceeds to transport
    mockInvoke.mockResolvedValueOnce({
      data: {
        transcript: "Bought coffee for 40 pounds",
        original_transcript: "دفعت ٤٠ جنيه قهوة",
        detected_language: "ar",
        transactions: [
          {
            amount: 40,
            type: "EXPENSE",
            counterparty: null,
            categorySystemName: "coffee_tea",
            description: "Coffee",
            accountId: null,
            currency: "EGP",
            date: "2026-10-13",
            confidenceScore: 0.95,
          },
        ],
      },
      error: null,
    });

    const category = createMockCategory("cat-1", "coffee_tea", "Coffee & Tea");

    const retryResult = await parseVoiceWithAi({
      audioUri: "file://dummy.m4a",
      requestKey,
      callerTimeZone: "Africa/Cairo",
      categories: "L1: food_drinks\n  L2: coffee_tea",
      accounts: [{ id: "acc-1", name: "Cash", currency: "EGP" }],
      preferredCurrency: "EGP",
      categoryRecords: [category],
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect("transactions" in retryResult).toBe(true);
    if ("transactions" in retryResult) {
      expect(retryResult.transactions.length).toBe(1);
      expect(retryResult.transactions[0].categoryId).toBe("cat-1");
    }
  });
});
