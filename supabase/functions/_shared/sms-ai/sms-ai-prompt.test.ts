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

test("keeps the reusable prefix byte-identical while dynamic category and SMS tails differ", () => {
  const first = buildSmsAiProviderMessages({
    messages: [
      {
        id: "message-a",
        body: "Paid EGP 100",
        sender: "BANK A",
        date: "2026-07-20T01:00:00.000Z",
        smsFingerprint: "fingerprint-a",
      },
    ],
    categories: "EXPENSE categories:\n  L1: shopping\n    L2: user_custom_a",
    supportedCurrencies: SUPPORTED_CURRENCIES,
  });
  const second = buildSmsAiProviderMessages({
    messages: [
      {
        id: "message-b",
        body: "Paid EGP 200",
        sender: "BANK B",
        date: "2026-07-20T02:00:00.000Z",
        smsFingerprint: "fingerprint-b",
      },
    ],
    categories: "EXPENSE categories:\n  L1: shopping\n    L2: user_custom_b",
    supportedCurrencies: SUPPORTED_CURRENCIES,
  });

  assert.equal(first[0].content, second[0].content);
  assert.notEqual(first[1].content, second[1].content);
  assert.notEqual(first[2].content, second[2].content);
  assert.ok(first[0].content.indexOf("BUILT-IN CATEGORY TREE") >= 0);
  assert.ok(
    first[1].content.indexOf("CURRENT ACCESSIBLE CATEGORY CONTEXT") >= 0
  );
  assert.ok(first[2].content.indexOf("MESSAGE ID: message-a") >= 0);
});

test("uses the default currency catalogue consistently when no currencies are supplied", () => {
  const stable = buildSmsAiStableSystemPrompt([]);
  const schema = buildSmsAiResponseSchema([]);
  const properties = schema.properties as Record<string, unknown>;
  const transactions = properties.transactions as Record<string, unknown>;
  const items = transactions.items as Record<string, unknown>;
  const transactionProperties = items.properties as Record<string, unknown>;
  const currency = transactionProperties.currency as Record<string, unknown>;

  assert.match(
    stable,
    /SUPPORTED CURRENCIES:\nEGP, USD, EUR, GBP, SAR, AED, KWD/
  );
  assert.deepEqual(currency.enum, [
    "EGP",
    "USD",
    "EUR",
    "GBP",
    "SAR",
    "AED",
    "KWD",
  ]);
});

test("does not duplicate the built-in category tree as dynamic context", () => {
  const messages = buildSmsAiProviderMessages({
    messages: [],
    categories: `\n${BUILT_IN_SMS_CATEGORY_TREE.trim()}\n`,
    supportedCurrencies: SUPPORTED_CURRENCIES,
  });

  assert.deepEqual(
    messages.map((message) => message.role),
    ["system", "user"]
  );
  assert.equal(
    messages[0].content.indexOf("BUILT-IN CATEGORY TREE"),
    messages[0].content.lastIndexOf("BUILT-IN CATEGORY TREE")
  );
});

test("marks the root and transaction object schemas as strict", () => {
  const schema = buildSmsAiResponseSchema(SUPPORTED_CURRENCIES);
  const properties = schema.properties as Record<string, unknown>;
  const transactions = properties.transactions as Record<string, unknown>;
  const items = transactions.items as Record<string, unknown>;

  assert.equal(schema.additionalProperties, false);
  assert.equal(items.additionalProperties, false);
});

test("material currency changes change the reusable stable prefix", () => {
  const egpOnly = buildSmsAiStableSystemPrompt(["EGP"]);
  const egpAndUsd = buildSmsAiStableSystemPrompt(["EGP", "USD"]);

  assert.notEqual(egpOnly, egpAndUsd);
  assert.match(egpOnly, /SUPPORTED CURRENCIES:\nEGP/);
  assert.match(egpAndUsd, /SUPPORTED CURRENCIES:\nEGP, USD/);
});

// Request-scoped input.categories is authoritative: the executor validates
// against it, so the dynamic tail must exclude absent built-ins; choose from
// the stable tree EXCEPT the Not accessible list, plus custom categories below.
test("restricted subset excludes absent built-ins but still permits present names", () => {
  const subset =
    "EXPENSE categories:\n  L1: shopping\n    L2: clothes\n\nINCOME categories:\n  L1: income\n    L2: salary";
  const dynamic = buildSmsAiDynamicCategoryContext(subset);

  assert.ok(dynamic.length > 0, "expected non-empty dynamic context");
  assert.match(dynamic, /CURRENT ACCESSIBLE CATEGORY CONTEXT/);
  assert.match(dynamic, /authoritative/i);
  assert.match(
    dynamic,
    /EXCEPT.*Not accessible/i,
    "prompt must choose from the stable tree EXCEPT the Not accessible list, plus custom categories"
  );
  assert.ok(
    !/hints only/i.test(dynamic),
    "prompt must not claim all built-ins are hints only"
  );
  const exclusionLine = dynamic
    .split("\n")
    .find((line) => line.startsWith("Not accessible in this request"));
  assert.ok(exclusionLine, "expected an explicit exclusion line");
  const excludedNames = new Set(
    exclusionLine
      .slice(exclusionLine.indexOf(":") + 1)
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  );
  assert.ok(
    excludedNames.has("food_drinks"),
    "absent built-in food_drinks must be listed as excluded"
  );
  assert.ok(
    !excludedNames.has("shopping"),
    "present built-in shopping must not be listed as excluded"
  );
  assert.ok(
    !excludedNames.has("clothes"),
    "present built-in clothes must not be listed as excluded"
  );
});

// Custom structure must be preserved: type (EXPENSE/INCOME), level (L1/L2),
// and L2 parent. Sorted names alone lose this required future context.
test("custom categories retain type, level, and parent relationship", () => {
  const customL2UnderBuiltInParent =
    "EXPENSE categories:\n  L1: shopping\n    L2: clothes, my_custom_snack";
  const dynamicBuiltInParent = buildSmsAiDynamicCategoryContext(
    customL2UnderBuiltInParent
  );

  assert.match(dynamicBuiltInParent, /CURRENT ACCESSIBLE CATEGORY CONTEXT/);
  assert.match(dynamicBuiltInParent, /EXPENSE/);
  assert.match(
    dynamicBuiltInParent,
    /L1:.*shopping/,
    "built-in parent shopping must be retained for custom L2"
  );
  assert.match(
    dynamicBuiltInParent,
    /L2:.*my_custom_snack/,
    "custom L2 must retain its L2 level"
  );

  const customParentsAndChildren =
    "EXPENSE categories:\n  L1: my_expense_parent\n    L2: my_expense_child\n\nINCOME categories:\n  L1: my_income_parent\n    L2: my_income_child";
  const dynamicCustomHierarchy = buildSmsAiDynamicCategoryContext(
    customParentsAndChildren
  );

  assert.match(dynamicCustomHierarchy, /EXPENSE/);
  assert.match(dynamicCustomHierarchy, /INCOME/);
  assert.match(dynamicCustomHierarchy, /L1:.*my_expense_parent/);
  assert.match(dynamicCustomHierarchy, /L2:.*my_expense_child/);
  assert.match(dynamicCustomHierarchy, /L1:.*my_income_parent/);
  assert.match(dynamicCustomHierarchy, /L2:.*my_income_child/);
});

test("custom L2 under debt_loans in both sections retains each L1 parent", () => {
  const bothSections =
    "EXPENSE categories:\n  L1: debt_loans\n    L2: my_expense_loan_custom\n\nINCOME categories:\n  L1: debt_loans\n    L2: my_income_loan_custom";
  const dynamic = buildSmsAiDynamicCategoryContext(bothSections);

  assert.match(dynamic, /EXPENSE/);
  assert.match(dynamic, /INCOME/);
  const debtLoansParents = dynamic
    .split("\n")
    .filter((line) => /L1:.*debt_loans/.test(line));
  assert.equal(
    debtLoansParents.length,
    2,
    "expected the debt_loans L1 parent retained in both sections"
  );
  assert.match(dynamic, /L2:.*my_expense_loan_custom/);
  assert.match(dynamic, /L2:.*my_income_loan_custom/);
});

// T3 — dynamic tail must strip built-in catalogue lines when the request
// categories string includes both built-in entries and custom entries.
test("strips built-in category lines from the dynamic tail when categories include both built-in and custom entries", () => {
  const mixed =
    BUILT_IN_SMS_CATEGORY_TREE.trim() +
    "\n  L1: custom_parent\n    L2: custom_child";

  const dynamic = buildSmsAiDynamicCategoryContext(mixed);

  // Dynamic context must be non-empty because there are custom entries.
  assert.ok(
    dynamic.length > 0,
    "expected non-empty dynamic context for mixed input"
  );
  assert.match(dynamic, /CURRENT ACCESSIBLE CATEGORY CONTEXT/);
  assert.match(dynamic, /authoritative/i);
  assert.match(dynamic, /All stable built-in categories remain accessible/i);
  assert.ok(
    !/Not accessible/i.test(dynamic),
    "no dangling Not accessible reference when nothing is excluded"
  );
  // Built-in lines must be stripped from the dynamic tail.
  assert.ok(
    !dynamic.includes("food_drinks"),
    "built-in L1 food_drinks must be stripped from dynamic tail"
  );
  assert.ok(
    !dynamic.includes("groceries"),
    "built-in L2 groceries must be stripped from dynamic tail"
  );
  // Custom lines must be preserved.
  assert.match(dynamic, /custom_parent/);
  assert.match(dynamic, /custom_child/);
});
