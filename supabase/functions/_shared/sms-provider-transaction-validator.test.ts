import assert from "node:assert/strict";
import test from "node:test";

import { parseSmsProviderTransactions } from "./sms-provider-transaction-validator.ts";

const context = {
  supportedCurrencies: ["EGP", "USD"],
  categoryTree: [
    "EXPENSE categories (return the system_name value):",
    "  L1: shopping",
    "    L2: groceries, electronics",
    "INCOME categories:",
    "  L1: income",
    "    L2: salary, refund",
  ].join("\n"),
} as const;

function validTransaction(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    messageId: "message-1",
    amount: 125.5,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Merchant",
    date: "2026-07-20T12:00:00.000Z",
    categorySystemName: "shopping",
    confidenceScore: 0.9,
    isTrusted: true,
    ...overrides,
  };
}

test("accepts a complete transaction within the consumer runtime constraints", () => {
  assert.equal(
    parseSmsProviderTransactions(
      { transactions: [validTransaction()] },
      context
    ).isValid,
    true
  );
});

test("rejects semantic values that the consumer cannot safely accept", () => {
  for (const invalid of [
    validTransaction({ messageId: "" }),
    validTransaction({ amount: 0 }),
    validTransaction({ amount: 1_000_000_001 }),
    validTransaction({ currency: "EUR" }),
    validTransaction({ type: "BOGUS" }),
    validTransaction({ categorySystemName: "invented" }),
    validTransaction({ confidenceScore: -0.1 }),
    validTransaction({ confidenceScore: 1.1 }),
    validTransaction({ date: "not-a-date" }),
    validTransaction({ cardLast4: "12" }),
  ]) {
    assert.equal(
      parseSmsProviderTransactions({ transactions: [invalid] }, context)
        .isValid,
      false
    );
  }
});
