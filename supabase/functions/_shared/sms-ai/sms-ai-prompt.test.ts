import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILT_IN_SMS_CATEGORY_TREE,
  buildSmsAiDynamicCategoryContext,
  buildSmsAiProviderMessages,
  buildSmsAiResponseSchema,
  buildSmsAiStableSystemPrompt,
} from "./sms-ai-prompt.ts";

const SUPPORTED_CURRENCIES = ["EGP", "USD"] as const;

test("keeps stable rules, currencies, and built-in categories in the first system message", () => {
  const stable = buildSmsAiStableSystemPrompt(SUPPORTED_CURRENCIES);

  assert.match(stable, /Monyvi AI/);
  assert.match(stable, /Precision > recall/);
  assert.match(stable, /SUPPORTED CURRENCIES:\nEGP, USD/);
  assert.match(stable, /L1: food_drinks/);
  assert.ok(stable.includes(BUILT_IN_SMS_CATEGORY_TREE.trim()));
});

test("keeps request category context separate from the stable prefix", () => {
  const dynamic = buildSmsAiDynamicCategoryContext(
    "EXPENSE categories:\n  L1: custom_parent\n    L2: custom_child"
  );

  assert.match(dynamic, /CURRENT ACCESSIBLE CATEGORY CONTEXT/);
  assert.match(dynamic, /custom_child/);
  assert.ok(!dynamic.includes("SUPPORTED CURRENCIES"));
});

test("orders stable context before category context and SMS content", () => {
  const messages = buildSmsAiProviderMessages({
    messages: [
      {
        id: "message-1",
        body: "Purchase EGP 100",
        sender: "QNB EGYPT",
        date: "2026-07-20T01:00:00.000Z",
        smsFingerprint: "fingerprint-1",
      },
    ],
    categories: "EXPENSE categories:\n  L1: custom_parent",
    supportedCurrencies: SUPPORTED_CURRENCIES,
  });

  assert.deepEqual(
    messages.map((message) => message.role),
    ["system", "system", "user"]
  );
  assert.match(messages[0].content, /SUPPORTED CURRENCIES/);
  assert.match(messages[1].content, /CURRENT ACCESSIBLE CATEGORY CONTEXT/);
  assert.match(messages[2].content, /MESSAGE ID: message-1/);
});

test("omits an empty dynamic category message while preserving the stable prefix", () => {
  const messages = buildSmsAiProviderMessages({
    messages: [],
    categories: "   ",
    supportedCurrencies: SUPPORTED_CURRENCIES,
  });

  assert.deepEqual(
    messages.map((message) => message.role),
    ["system", "user"]
  );
});

test("builds the strict Monyvi response schema with the requested currencies", () => {
  const schema = buildSmsAiResponseSchema(SUPPORTED_CURRENCIES);
  const properties = schema.properties as Record<string, unknown>;
  const transactions = properties.transactions as Record<string, unknown>;
  const items = transactions.items as Record<string, unknown>;
  const transactionProperties = items.properties as Record<string, unknown>;
  const currency = transactionProperties.currency as Record<string, unknown>;

  assert.deepEqual(currency.enum, ["EGP", "USD"]);
  assert.deepEqual(items.required, [
    "messageId",
    "amount",
    "currency",
    "type",
    "counterparty",
    "date",
    "categorySystemName",
    "confidenceScore",
    "isTrusted",
  ]);
  assert.deepEqual(schema.required, ["transactions"]);
});
