const mockInvoke = jest.fn();

jest.mock("@/services/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: readonly unknown[]): unknown => mockInvoke(...args),
    },
  },
}));

import { MAX_TRANSACTION_AMOUNT, type CategoryTreeSource } from "@monyvi/logic";
import {
  parseSmsWithAi,
  type SmsCandidate,
} from "@/services/ai-sms-parser-service";
import { getFixtureById } from "@/services/dev/sms-fixtures";

const originalEnv = process.env;

function category(
  systemName: string,
  displayName: string,
  id = `cat-${systemName}`
): CategoryTreeSource {
  const value: CategoryTreeSource = {
    id,
    systemName,
    displayName,
    level: 1,
    parentId: undefined,
    type: systemName === "salary" ? "INCOME" : "EXPENSE",
  };
  return value;
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

function candidate(fixtureId: string): SmsCandidate {
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

describe("ai-sms-parser-service parser strategy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_MONYVI_TEST_MODE;
    delete process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses the Edge Function parser by default", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [
          {
            messageId: "sms-1",
            amount: 25,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Shop",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.9,
            isTrusted: true,
          },
        ],
      },
      error: null,
    });

    const result = await parseSmsWithAi(
      [
        {
          message: {
            id: "sms-1",
            address: "NBE",
            body: "Purchase EGP 25 at Shop",
            date: 1775658180000,
            read: false,
          },
          smsFingerprint: "edge-fingerprint",
        },
      ],
      context
    );

    expect(mockInvoke).toHaveBeenCalledWith("parse-sms", expect.any(Object));
    expect(result.transactions[0]?.smsFingerprint).toBe("edge-fingerprint");
  });

  it("skips AI transactions with non-finite amounts", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [
          {
            messageId: "sms-1",
            amount: Number.POSITIVE_INFINITY,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Shop",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.9,
            isTrusted: true,
          },
        ],
      },
      error: null,
    });

    const result = await parseSmsWithAi(
      [
        {
          message: {
            id: "sms-1",
            address: "NBE",
            body: "Purchase EGP 25 at Shop",
            date: 1775658180000,
            read: false,
          },
          smsFingerprint: "edge-fingerprint",
        },
      ],
      context
    );

    expect(result.transactions).toEqual([]);
    expect(result.hasError).toBe(false);
  });

  it("skips AI transactions with non-positive amounts", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [
          {
            messageId: "sms-1",
            amount: -25,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Shop",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.9,
            isTrusted: true,
          },
          {
            messageId: "sms-1",
            amount: 0,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Shop",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.9,
            isTrusted: true,
          },
        ],
      },
      error: null,
    });

    const result = await parseSmsWithAi(
      [
        {
          message: {
            id: "sms-1",
            address: "NBE",
            body: "Purchase EGP 25 at Shop",
            date: 1775658180000,
            read: false,
          },
          smsFingerprint: "edge-fingerprint",
        },
      ],
      context
    );

    expect(result.transactions).toEqual([]);
    expect(result.hasError).toBe(false);
  });

  it("skips AI transactions with amounts exceeding the maximum", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [
          {
            messageId: "sms-1",
            amount: MAX_TRANSACTION_AMOUNT + 1,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Shop",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.9,
            isTrusted: true,
          },
        ],
      },
      error: null,
    });

    const result = await parseSmsWithAi(
      [
        {
          message: {
            id: "sms-1",
            address: "NBE",
            body: "Purchase EGP 25 at Shop",
            date: 1775658180000,
            read: false,
          },
          smsFingerprint: "edge-fingerprint",
        },
      ],
      context
    );

    expect(result.transactions).toEqual([]);
    expect(result.hasError).toBe(false);
  });

  it("uses the fixture parser only when E2E fixture mode is explicit", async () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "e2e";
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "fixture";

    const result = await parseSmsWithAi(
      [candidate("nbe_debit_purchase")],
      context
    );

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.transactions[0]?.counterparty).toBe("CARREFOUR CAIRO");
  });

  it("wraps fixture parser failures in the normal parse error result", async () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "e2e";
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "fixture";

    const result = await parseSmsWithAi([candidate("nbe_debit_purchase")], {
      categories: [],
      supportedCurrencies: ["EGP", "USD"],
    });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result).toEqual({
      transactions: [],
      hasError: true,
      isRetryable: true,
    });
  });

  it("fails closed when fixture mode is requested outside E2E mode", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "fixture";

    mockInvoke.mockResolvedValueOnce({
      data: { transactions: [] },
      error: null,
    });

    await parseSmsWithAi([candidate("nbe_debit_purchase")], context);

    expect(mockInvoke).toHaveBeenCalled();
  });

  it("does not call the Edge Function when parsing is aborted", async () => {
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      parseSmsWithAi(
        [candidate("nbe_debit_purchase")],
        context,
        undefined,
        abortController.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("passes the abort signal into the Edge Function request", async () => {
    const abortController = new AbortController();
    mockInvoke.mockResolvedValueOnce({
      data: { transactions: [] },
      error: null,
    });

    await parseSmsWithAi(
      [candidate("nbe_debit_purchase")],
      context,
      undefined,
      abortController.signal
    );

    expect(mockInvoke).toHaveBeenCalledWith(
      "parse-sms",
      expect.objectContaining({ signal: abortController.signal })
    );
  });

  it("stops the scan when the Edge Function requires AI consent", async () => {
    const error = Object.assign(new Error("FunctionsHttpError"), {
      context: new Response("AI processing consent required", { status: 403 }),
    });
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error,
    });

    await expect(
      parseSmsWithAi([candidate("nbe_debit_purchase")], context)
    ).rejects.toMatchObject({
      name: "AbortError",
      message: "AI processing consent required",
    });
  });
});
