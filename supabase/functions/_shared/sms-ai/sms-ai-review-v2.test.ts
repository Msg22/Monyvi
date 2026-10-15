/**
 * #395 T013 tests-first Red — real future SMS Edge v2 helper, not a mock.
 * Existing DeepInfra/handler/provider code stays unchanged in this wave.
 */
import assert from "node:assert/strict";
import type { z } from "zod";
import {
  accountReviewRequestContextSchema,
  accountReviewSmsResponseV2Schema,
  buildAccountReviewDeepInfraResponseSchema,
} from "../account-review-contract.ts";
import {
  buildSmsAiStableSystemPrompt,
} from "./sms-ai-prompt.ts";
import {
  buildSmsProviderUserPromptAtEdge,
  estimateSmsRequestInputTokensAtEdge,
  getUtf8ByteLengthAtEdge,
} from "../sms-input-estimator.ts";
import {
  makeSubmittedSmsMessages,
  makeSmsReviewContext,
  makeSmsReviewUnconfirmedCurrencyV2,
  makeSmsReviewV2Response,
  makeLegacySmsResponse,
  SMS_REVIEW_IDS,
} from "./sms-ai-review-v2-test-fixtures.ts";
import {
  parseSmsReviewV2Context,
  prepareSmsReviewV2ProviderRequest,
  measureSmsReviewV2ProviderRequest,
  parseSmsReviewV2Advisory,
} from "./sms-ai-review-v2.ts";

type Context = z.infer<typeof accountReviewRequestContextSchema>;
type V2Response = z.infer<typeof accountReviewSmsResponseV2Schema>;

const SUPPORTED = ["EGP", "USD"];
const CATEGORIES = "EXPENSE categories:\nL1: shopping\nL2: groceries";

function reviewFields(context: unknown = makeSmsReviewContext()): {
  readonly reviewContractVersion: string | null;
  readonly reviewContext: unknown;
  readonly supportedCurrencies: readonly string[];
} {
  return {
    reviewContractVersion: "account-review/v2",
    reviewContext: context,
    supportedCurrencies: SUPPORTED,
  };
}

function providerPlan(context: Context = makeSmsReviewContext()) {
  return prepareSmsReviewV2ProviderRequest({
    reviewContext: context,
    messages: makeSubmittedSmsMessages(),
    categories: CATEGORIES,
    supportedCurrencies: SUPPORTED,
  });
}

function originalBody(): Readonly<Record<string, unknown>> {
  return {
    requestKey: "synthetic-original-request",
    scanSessionId: "synthetic-opaque-scan-id",
    scanKind: "incremental",
    scanStartedAt: "2026-10-14T12:00:00.000Z",
    messages: makeSubmittedSmsMessages(),
    categories: CATEGORIES,
    supportedCurrencies: SUPPORTED,
    ...reviewFields(),
  };
}

Deno.test("T013 legacy/no discriminator leaves original provider contract untouched", () => {
  assert.equal(parseSmsReviewV2Context({
    reviewContractVersion: null,
    reviewContext: null,
    supportedCurrencies: SUPPORTED,
  }), null);
});

Deno.test("T013 strictly validates existing closed review account context", () => {
  const parsed: Context | null = parseSmsReviewV2Context(reviewFields());
  assert.deepEqual(parsed, makeSmsReviewContext());
  assert.equal(parsed?.accounts[0]?.cardLast4, "0007");
  assert.equal(parsed?.accounts[1]?.type, "CASH");
  assert.equal("ownerId" in (parsed ?? {}), false);
});

Deno.test("T013 refuses extra-private balance/default/card-number fields before admission", () => {
  for (const key of ["balance", "isDefault", "accountNumber", "cardNumber"]) {
    const context = makeSmsReviewContext();
    const accounts = context.accounts.map((account) => ({ ...account, [key]: "secret" }));
    assert.throws(() => parseSmsReviewV2Context(
      reviewFields({ ...context, accounts })
    ));
  }
});

Deno.test("T013 invalid version, missing context or unsupported currency cannot downgrade", () => {
  assert.throws(() => parseSmsReviewV2Context({
    ...reviewFields(), reviewContractVersion: "account-review/v3",
  }));
  assert.throws(() => parseSmsReviewV2Context(reviewFields(null)));
  assert.throws(() => parseSmsReviewV2Context({
    ...reviewFields(), supportedCurrencies: ["EGP", "ZZZ"],
  }));
  assert.throws(() => parseSmsReviewV2Context({
    ...reviewFields(), supportedCurrencies: ["USD"],
  }));
});

Deno.test("T013 v2 keeps unchanged cached prompt first and original SMS last", () => {
  const result = providerPlan();
  const first = result.messages[0];
  const last = result.messages[result.messages.length - 1];
  assert.equal(first?.role, "system");
  assert.equal(first?.content, buildSmsAiStableSystemPrompt(SUPPORTED));
  assert.equal(last?.role, "user");
  assert.equal(last?.content, buildSmsProviderUserPromptAtEdge(makeSubmittedSmsMessages()));
  const accountPart = result.messages.findIndex(
    (message, index) => index > 0 && message.content.includes("QNB salary")
  );
  assert.ok(accountPart > 0 && accountPart < result.messages.length - 1);
  const body = result.messages.map((message) => message.content).join("\n");
  assert.match(body, /QNB salary/);
  assert.match(body, /"cardLast4":"0007"/);
  assert.match(body, /shopping/);
  assert.match(body, /synthetic-message-1/);
  assert.doesNotMatch(body, /openingBalance|isDefault|accountNumber|cardNumber|financial_revision/);
});

Deno.test("T013 generated DeepInfra v2 schema keeps nullable currency and only model-owned keys", () => {
  const result = providerPlan();
  assert.deepEqual(result.responseSchema, buildAccountReviewDeepInfraResponseSchema(SUPPORTED));
  const parsed = JSON.stringify(result.responseSchema);
  for (const key of [
    "reviewContractVersion", "transactions", "suggestedAccounts",
    "messageId", "transactionRef", "suggestionRef", "accountEvidence",
    "toAccountEvidence", "currencyEvidence", "evidenceSpans",
  ]) {
    assert.ok(parsed.includes('"' + key + '"'), "Missing model field " + key);
  }
  assert.match(parsed, /"currency"/);
  assert.match(parsed, /"null"/);
  assert.doesNotMatch(
    parsed,
    /"completionStatus"|"negativeFingerprints"|"terminalFingerprints"|"unresolvedFingerprints"|"retryRequestMode"/
  );
  assert.doesNotMatch(parsed, /"isDefault"|"ownerId"|"balance"|"accountNumber"/);
});

Deno.test("T013 exact provider JSON schema is the same object used for original strict DeepInfra", () => {
  const result = providerPlan();
  const body = {
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "monyvi_sms_transactions",
        strict: true,
        schema: result.responseSchema,
      },
    },
  };
  assert.deepEqual(body.response_format.json_schema.schema, result.responseSchema);
});

Deno.test("T013 pre-admission estimator counts every sent prompt component and exact schema", () => {
  const plan = providerPlan();
  const body = originalBody();
  assert.equal(body.requestKey, "synthetic-original-request");
  assert.equal(body.scanSessionId, "synthetic-opaque-scan-id");
  const measured = measureSmsReviewV2ProviderRequest({
    requestBody: body,
    providerRequest: plan,
  });
  const reference = estimateSmsRequestInputTokensAtEdge({
    prompt: "", categories: "",
    schema: JSON.stringify(plan.responseSchema),
    messages: plan.messages.map((message) => message.content),
  });
  assert.equal(measured.estimatedInputTokens, reference.totalTokens);
  assert.equal(measured.payloadBytes, getUtf8ByteLengthAtEdge(JSON.stringify(body)));
  assert.ok(measured.estimatedInputTokens > 0);
});

Deno.test("T013 extra owned account identity increases measured input rather than truncating", () => {
  const context = makeSmsReviewContext();
  const additional: Context = accountReviewRequestContextSchema.parse({
    ...context,
    accounts: context.accounts.map((account, index) =>
      index === 0 ? { ...account, name: "QNB salary ".repeat(20) } : account
    ),
  });
  const short = providerPlan(context);
  const long = providerPlan(additional);
  const metricsShort = measureSmsReviewV2ProviderRequest({
    requestBody: originalBody(), providerRequest: short,
  });
  const metricsLong = measureSmsReviewV2ProviderRequest({
    requestBody: { ...originalBody(), reviewContext: additional },
    providerRequest: long,
  });
  assert.ok(metricsLong.estimatedInputTokens > metricsShort.estimatedInputTokens);
  assert.ok(metricsLong.payloadBytes > metricsShort.payloadBytes);
  assert.match(JSON.stringify(long.messages), /QNB salary QNB salary/);
});

Deno.test("T013 canonical v2 retains original submitted financial identity and grounded evidence", () => {
  const raw: V2Response = makeSmsReviewV2Response();
  const parsed = parseSmsReviewV2Advisory(raw, makeSubmittedSmsMessages());
  assert.deepEqual(parsed, raw);
  assert.equal(parsed?.transactions[0]?.messageId, SMS_REVIEW_IDS.message);
  assert.equal(parsed?.transactions[0]?.amount, 50);
  assert.equal(parsed?.transactions[0]?.date, "2026-10-14");
  assert.equal(parsed?.transactions[0]?.accountEvidence.state, "explicit");
  assert.equal(parsed?.suggestedAccounts[0]?.transactionRefs[0], SMS_REVIEW_IDS.row);
});

Deno.test("T013 v2 nullable financial currency is accepted without preferred coercion", () => {
  const raw = makeSmsReviewUnconfirmedCurrencyV2();
  const parsed = parseSmsReviewV2Advisory(raw, makeSubmittedSmsMessages());
  assert.equal(parsed?.transactions[0]?.currency, null);
  assert.equal(parsed?.transactions[0]?.currencyEvidence.state, "unknown");
  assert.equal(parsed?.transactions[0]?.amount, 50);
});

Deno.test("T013 cannot accept a foreign message ID as an admitted original SMS", () => {
  const raw = makeSmsReviewV2Response();
  assert.equal(parseSmsReviewV2Advisory({
    ...raw,
    transactions: [{ ...raw.transactions[0], messageId: "foreign-message" }],
  }, makeSubmittedSmsMessages()), null);
});

Deno.test("T013 one submitted SMS cannot generate duplicate positive financial rows", () => {
  const raw = makeSmsReviewV2Response();
  const original = raw.transactions[0];
  if (!original) throw new Error("Missing synthetic SMS row");
  assert.equal(parseSmsReviewV2Advisory({
    ...raw,
    suggestedAccounts: [],
    transactions: [
      { ...original, suggestionRef: null, transactionRef: "row-first" },
      { ...original, suggestionRef: null, transactionRef: "row-second" },
    ],
  }, makeSubmittedSmsMessages()), null);
});

Deno.test("T013 malformed source span or financial amount is not trusted v2 evidence", () => {
  const base = makeSmsReviewV2Response();
  const original = base.transactions[0];
  if (!original) throw new Error("Missing synthetic SMS row");
  assert.equal(parseSmsReviewV2Advisory({
    ...base,
    transactions: [{
      ...original,
      accountEvidence: {
        ...original.accountEvidence,
        evidenceSpans: [{
          sourceRef: "another-message",
          field: "body",
          start: 0, end: 3, text: "QNB",
        }],
      },
    }],
  }, makeSubmittedSmsMessages()), null);
  assert.equal(parseSmsReviewV2Advisory({
    ...base,
    transactions: [{ ...original, amount: Number.POSITIVE_INFINITY }],
  }, makeSubmittedSmsMessages()), null);
});

Deno.test("T013 v1 financial/completion result is never mistaken for v2 evidence", () => {
  assert.equal(parseSmsReviewV2Advisory(
    makeLegacySmsResponse(), makeSubmittedSmsMessages()
  ), null);
});
