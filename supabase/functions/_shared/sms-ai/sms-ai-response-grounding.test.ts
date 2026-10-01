import assert from "node:assert/strict";
import test from "node:test";

import type {
  ExecuteSmsProviderInput,
  ParseSmsMessage,
  SmsAiProvider,
} from "./sms-ai-provider.ts";
import { executeSmsAiProvider } from "./sms-ai-provider-executor.ts";
import {
  BUILT_IN_SMS_CATEGORY_TREE,
  buildSmsAiProviderMessages,
  buildSmsAiResponseSchema,
  buildSmsAiStableSystemPrompt,
} from "./sms-ai-prompt.ts";

const SUPPORTED_CURRENCIES = ["EGP"] as const;

function providerFor(
  transactions: readonly Readonly<Record<string, unknown>>[]
): SmsAiProvider {
  return {
    execute: async () => ({
      completionStatus: "complete",
      content: JSON.stringify({ transactions }),
    }),
  };
}

function transaction(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    messageId: "message-1",
    amount: 125.5,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Merchant",
    date: "2026-07-20T12:00:00Z",
    categorySystemName: "shopping",
    confidenceScore: 0.9,
    isTrusted: true,
    ...overrides,
  };
}

function input(
  messages: readonly ParseSmsMessage[],
  categories = BUILT_IN_SMS_CATEGORY_TREE
): ExecuteSmsProviderInput {
  return {
    messages,
    categories,
    supportedCurrencies: SUPPORTED_CURRENCIES,
  };
}

function message(
  id: string,
  body: string,
  sender = "BANK"
): ParseSmsMessage {
  return {
    id,
    body,
    sender,
    date: "2026-07-20T12:00:00.000Z",
    smsFingerprint: `fingerprint-${id}`,
  };
}

test("keeps cardLast4 only when the same source SMS explicitly identifies card digits", async () => {
  const cases = [
    {
      name: "clear English masked card",
      body: "Purchase EGP 125.50 using Card **1234 at Merchant",
      cardLast4: "1234",
    },
    {
      name: "leading-zero card suffix",
      body: "Purchase EGP 125.50 using card ****0012 at Merchant",
      cardLast4: "0012",
    },
    {
      name: "clear Arabic card marker",
      body: "تم خصم 125.50 جنيه من البطاقة ****4321 لدى Merchant",
      cardLast4: "4321",
    },
  ] as const;

  for (const scenario of cases) {
    const result = await executeSmsAiProvider(
      providerFor([
        transaction({
          cardLast4: scenario.cardLast4,
        }),
      ]),
      input([message("message-1", scenario.body)])
    );

    assert.equal(result.isResponseSchemaValid, true, scenario.name);
    assert.equal(result.transactions.length, 1, scenario.name);
    assert.equal(result.transactions[0]?.cardLast4, scenario.cardLast4, scenario.name);
  }
});

test("removes cardLast4 derived only from account or transfer-reference digits", async () => {
  const bodies = [
    "IPN transfer sent with amount of EGP 100.00 from 1234 on 03/08 at 01:01 PM",
    "IPN transfer received with amount of EGP 100.00 on 1234 on 04/08 at 07:15 PM",
    "Transfer completed from account ending 1234 Ref# 1234",
    "For more details call 19700. Transfer completed from account 1234.",
  ];

  for (const body of bodies) {
    const result = await executeSmsAiProvider(
      providerFor([transaction({ cardLast4: "1234" })]),
      input([message("message-1", body)])
    );

    assert.equal(result.isResponseSchemaValid, true);
    assert.equal(result.transactions.length, 1);
    assert.equal("cardLast4" in result.transactions[0]!, false);
  }
});

test("does not borrow card evidence from another SMS or an unknown messageId", async () => {
  const messages = [
    message("message-1", "Purchase EGP 50 using Card **1234 at Merchant A"),
    message("message-2", "IPN transfer sent with amount EGP 100 from 1234"),
  ];

  const wrongMessage = await executeSmsAiProvider(
    providerFor([
      transaction({
        messageId: "message-2",
        cardLast4: "1234",
      }),
    ]),
    input(messages)
  );
  assert.equal(wrongMessage.isResponseSchemaValid, true);
  assert.equal(wrongMessage.transactions.length, 1);
  assert.equal("cardLast4" in wrongMessage.transactions[0]!, false);

  const unknownMessage = await executeSmsAiProvider(
    providerFor([
      transaction({
        messageId: "message-missing",
        cardLast4: "1234",
      }),
    ]),
    input(messages)
  );
  assert.equal(unknownMessage.isResponseSchemaValid, true);
  assert.equal(unknownMessage.transactions.length, 1);
  assert.equal("cardLast4" in unknownMessage.transactions[0]!, false);
});

test("preserves rejection of malformed nonempty cardLast4 values", async () => {
  for (const cardLast4 of ["12", "abcd", 1234, null]) {
    const result = await executeSmsAiProvider(
      providerFor([transaction({ cardLast4 })]),
      input([message("message-1", "Purchase EGP 125.50 at Merchant")])
    );

    assert.equal(result.isResponseSchemaValid, false);
    assert.deepEqual(result.transactions, []);
  }
});

test("does not mutate frozen source SMS objects while grounding card evidence", async () => {
  const sourceMessage = Object.freeze(
    message("message-1", "IPN transfer sent with amount EGP 100 from 1234")
  );
  const sourceMessages = Object.freeze([sourceMessage]);
  const before = JSON.stringify(sourceMessages);

  const result = await executeSmsAiProvider(
    providerFor([transaction({ cardLast4: "1234" })]),
    input(sourceMessages)
  );

  assert.equal(JSON.stringify(sourceMessages), before);
  assert.equal(Object.isFrozen(sourceMessages), true);
  assert.equal(Object.isFrozen(sourceMessage), true);
  assert.equal("cardLast4" in result.transactions[0]!, false);
});

test("normalizes prohibited *_other categories to the actual accessible L1 parent", async () => {
  const income = await executeSmsAiProvider(
    providerFor([
      transaction({
        type: "INCOME",
        categorySystemName: "income_other",
      }),
    ]),
    input([
      message(
        "message-1",
        "IPN transfer received with amount of EGP 100.00 on 1234"
      ),
    ])
  );
  assert.equal(income.isResponseSchemaValid, true);
  assert.equal(income.transactions[0]?.categorySystemName, "income");

  const food = await executeSmsAiProvider(
    providerFor([transaction({ categorySystemName: "food_other" })]),
    input([message("message-1", "Successful card purchase EGP 125 at Cafe")])
  );
  assert.equal(food.isResponseSchemaValid, true);
  assert.equal(food.transactions[0]?.categorySystemName, "food_drinks");

  const customTree = `EXPENSE categories:
  L1: custom_parent
    L2: food_other
  L1: other
    L2: uncategorized`;
  const derivedParent = await executeSmsAiProvider(
    providerFor([transaction({ categorySystemName: "food_other" })]),
    input([message("message-1", "Completed purchase EGP 125")], customTree)
  );
  assert.equal(derivedParent.isResponseSchemaValid, true);
  assert.equal(derivedParent.transactions[0]?.categorySystemName, "custom_parent");
});

test("never invents an inaccessible *_other parent and preserves valid custom/L1/L2 categories", async () => {
  const restrictedTree = `EXPENSE categories:
  L1: other
    L2: uncategorized
  L1: custom_parent
    L2: custom_child`;

  const inaccessibleParent = await executeSmsAiProvider(
    providerFor([transaction({ categorySystemName: "food_other" })]),
    input([message("message-1", "Completed purchase EGP 125")], restrictedTree)
  );
  assert.equal(inaccessibleParent.isResponseSchemaValid, false);
  assert.deepEqual(inaccessibleParent.transactions, []);

  for (const categorySystemName of ["other", "custom_parent", "custom_child"]) {
    const result = await executeSmsAiProvider(
      providerFor([transaction({ categorySystemName })]),
      input([message("message-1", "Completed purchase EGP 125")], restrictedTree)
    );
    assert.equal(result.isResponseSchemaValid, true);
    assert.equal(
      result.transactions[0]?.categorySystemName,
      categorySystemName
    );
  }

  const builtInL2 = await executeSmsAiProvider(
    providerFor([transaction({ categorySystemName: "groceries" })]),
    input([message("message-1", "Purchase EGP 125 at supermarket")])
  );
  assert.equal(builtInL2.isResponseSchemaValid, true);
  assert.equal(builtInL2.transactions[0]?.categorySystemName, "groceries");
});

test("retains a completed generic-gateway purchase with conservative fallback category", async () => {
  const result = await executeSmsAiProvider(
    providerFor([
      transaction({
        counterparty: "myfawry",
        categorySystemName: "other",
        confidenceScore: 0.5,
      }),
    ]),
    input([
      message(
        "message-1",
        "Successful debit-card purchase EGP 125.50 @myfawry"
      ),
    ])
  );

  assert.equal(result.isResponseSchemaValid, true);
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0]?.categorySystemName, "other");
  assert.equal(result.transactions[0]?.counterparty, "myfawry");
});

test("stable prompt explicitly separates card evidence from account digits and keeps gateway categorization conservative", () => {
  const prompt = buildSmsAiStableSystemPrompt(SUPPORTED_CURRENCIES);

  assert.match(prompt, /same (?:source )?SMS/i);
  assert.match(prompt, /Card \*\*1234[\s\S]*cardLast4[\s\S]*1234/i);
  assert.match(prompt, /IPN[\s\S]*(?:from|on) 1234[\s\S]*omit[\s\S]*cardLast4/i);
  assert.match(prompt, /account[\s\S]*digits[\s\S]*(?:not|never)[\s\S]*card/i);
  assert.match(prompt, /payment gateway[\s\S]*(?:does not|doesn't)[\s\S]*prove/i);
  assert.match(prompt, /completed transaction[\s\S]*uncertain category[\s\S]*(?:other|income)/i);
  assert.match(prompt, /category[\s\S]*(?:guess|uncertain)[\s\S]*confidence/i);

  const messages = buildSmsAiProviderMessages({
    messages: [message("message-1", "Synthetic purchase EGP 125")],
    categories: BUILT_IN_SMS_CATEGORY_TREE,
    supportedCurrencies: SUPPORTED_CURRENCIES,
  });
  assert.equal(messages[0]?.role, "system");
  assert.equal(messages[0]?.content, prompt);
});

test("response schema descriptions encode the card-source and *_other parent rules", () => {
  const schema = buildSmsAiResponseSchema(SUPPORTED_CURRENCIES);
  const properties = schema.properties as Record<string, unknown>;
  const transactions = properties.transactions as Record<string, unknown>;
  const items = transactions.items as Record<string, unknown>;
  const transactionProperties = items.properties as Record<string, unknown>;
  const cardLast4 = transactionProperties.cardLast4 as Record<string, unknown>;
  const category =
    transactionProperties.categorySystemName as Record<string, unknown>;

  assert.match(String(cardLast4.description), /same (?:source )?SMS/i);
  assert.match(String(cardLast4.description), /card/i);
  assert.match(String(cardLast4.description), /account/i);
  assert.match(String(category.description), /\*_other|_other/i);
  assert.match(String(category.description), /parent/i);
});
