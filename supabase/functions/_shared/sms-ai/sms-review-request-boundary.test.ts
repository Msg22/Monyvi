/**
 * #395 independent P2-01 Red: test the REAL SMS JSON boundary and Edge handler.
 * No production/provider SUT mocks. Dependencies are the existing injected
 * authenticated/quota/provider interfaces, with observable call counters.
 * Core's parser modules/fixtures are integrated by Root before running this.
 */
import assert from "node:assert/strict";
import { createParseSmsHandler, type ParseSmsHandlerDependencies } from
  "../parse-sms-handler.ts";
import { DEFAULT_SMS_SAFEGUARD_POLICY } from
  "../sms-safeguard-policy.ts";
import { parseSmsRequestBody } from "./sms-ai-request-boundary.ts";
import {
  makeSmsReviewContext, makeSubmittedSmsMessages,
} from "./sms-ai-review-v2-test-fixtures.ts";

interface GateCalls {
  auth: number;
  consent: number;
  policy: number;
  reserve: number;
  providerStart: number;
  provider: number;
}

function originalBody(): Readonly<Record<string, unknown>> {
  return {
    requestKey: "synthetic-version-boundary-request",
    scanSessionId: "synthetic-scan",
    scanKind: "incremental",
    scanStartedAt: "2026-10-14T12:00:00.000Z",
    messages: makeSubmittedSmsMessages(),
    categories: "EXPENSE categories:\nL1: shopping\nL2: groceries",
    supportedCurrencies: ["EGP", "USD"],
  };
}

function post(body: unknown): Request {
  return new Request("http://localhost/parse-sms", {
    method: "POST",
    headers: { authorization: "Bearer synthetic-token" },
    body: JSON.stringify(body),
  });
}

function preflight(calls: GateCalls): Pick<ParseSmsHandlerDependencies,
  | "authenticate" | "hasConsent" | "getPolicy" | "buildFixedPrompt"
  | "buildCategoryContext" | "buildResponseSchema" | "shouldExclude"
  | "computeFingerprint" | "computeRequestDigest" | "getServerNowMs"
  | "resolveScanWindowStart" | "getProcessingOutcomes"
> {
  return {
    authenticate: async () => { calls.auth++; return "synthetic-owner"; },
    hasConsent: async () => { calls.consent++; return true; },
    getPolicy: () => { calls.policy++; return DEFAULT_SMS_SAFEGUARD_POLICY; },
    buildFixedPrompt: () => "original v1 prompt",
    buildCategoryContext: (categories) => categories,
    buildResponseSchema: () => "{}",
    shouldExclude: () => false,
    computeFingerprint: async (message) => message.smsFingerprint,
    computeRequestDigest: async () => "synthetic-digest",
    getServerNowMs: () => Date.UTC(2026, 9, 14, 12, 1),
    resolveScanWindowStart: async (input) => input.requestedScanStartedAtMs,
    getProcessingOutcomes: async () => [],
  };
}

function accounting(calls: GateCalls): Pick<ParseSmsHandlerDependencies,
  | "reserveWork" | "markProviderStarted" | "executeProvider"
  | "completeWork" | "releaseWork" | "reconcileOutcomes"
> {
  return {
    reserveWork: async () => {
      calls.reserve++;
      return {
        accepted: true, requestId: "synthetic-work", decisionCode: "accepted",
        availableAt: null, isReplay: false,
      };
    },
    markProviderStarted: async () => {
      calls.providerStart++;
      return {
        started: true, decisionCode: "provider_started",
        terminalFingerprints: [], availableAt: null,
      };
    },
    executeProvider: async (input): ReturnType<ParseSmsHandlerDependencies["executeProvider"]> => {
      calls.provider++;
      if (input.reviewProviderRequest === undefined) {
        return {
          completionStatus: "complete", isResponseSchemaValid: true,
          transactions: [],
        };
      }
      return {
        completionStatus: "complete", isResponseSchemaValid: true,
        reviewContractVersion: "account-review/v2", transactions: [],
        rawReviewResponse: {
          reviewContractVersion: "account-review/v2",
          transactions: [], suggestedAccounts: [],
        },
      };
    },
    completeWork: async () => true,
    releaseWork: async () => true,
    reconcileOutcomes: async ({ submittedCandidates }) => ({
      status: "reconciled",
      positiveFingerprints: [],
      negativeFingerprints: submittedCandidates.map((entry) => entry.smsFingerprint),
    }),
  };
}

function makeHarness(): {
  readonly handler: ReturnType<typeof createParseSmsHandler>;
  readonly calls: GateCalls;
} {
  const calls: GateCalls = {
    auth: 0, consent: 0, policy: 0, reserve: 0, providerStart: 0, provider: 0,
  };
  const deps: ParseSmsHandlerDependencies = {
    ...preflight(calls),
    ...accounting(calls),
  };
  return { handler: createParseSmsHandler(deps), calls };
}

async function requireRejectedBeforeAdmission(body: unknown): Promise<void> {
  const { handler, calls } = makeHarness();
  const response = await handler(post(body));
  assert.equal(response.status, 400, "invalid explicit version/context must be HTTP 400");
  assert.equal(parseSmsRequestBody(body), null, "invalid JSON cannot become v1");
  assert.equal(calls.auth, 1);
  assert.equal(calls.consent, 1);
  assert.equal(calls.policy, 0, "reject before evaluating safeguard policy");
  assert.equal(calls.reserve, 0, "no capacity/quota reservation");
  assert.equal(calls.providerStart, 0, "no provider-start accounting");
  assert.equal(calls.provider, 0, "no original provider call or review replay");
}

Deno.test("P2-01: truly absent version retains one original legacy request", async () => {
  const body = originalBody();
  const parsed = parseSmsRequestBody(body);
  assert.ok(parsed);
  assert.equal(parsed.reviewContractVersion, undefined);
  assert.equal(parsed.reviewContext, undefined);
  const { handler, calls } = makeHarness();
  const response = await handler(post(body));
  assert.equal(response.status, 200);
  assert.equal(calls.reserve, 1);
  assert.equal(calls.providerStart, 1);
  assert.equal(calls.provider, 1);
});

Deno.test("P2-01 RED: explicitly present null version is NOT absent v1", async () => {
  await requireRejectedBeforeAdmission({
    ...originalBody(), reviewContractVersion: null,
  });
});

Deno.test("P2-01: present unsupported v3 rejects without quota/provider", async () => {
  await requireRejectedBeforeAdmission({
    ...originalBody(),
    reviewContractVersion: "account-review/v3",
    reviewContext: makeSmsReviewContext(),
  });
});

Deno.test("P2-01: dangling context without discriminator rejects", async () => {
  await requireRejectedBeforeAdmission({
    ...originalBody(), reviewContext: makeSmsReviewContext(),
  });
});

Deno.test("P2-01: present v2 with null/missing/extra-private account context rejects", async () => {
  const context = makeSmsReviewContext();
  const first = context.accounts[0];
  if (!first) throw new Error("Missing synthetic context account");
  for (const reviewContext of [
    null,
    { ...context, preferredCurrency: "ZZZ" },
    { ...context, accounts: [{ ...first, balance: "private" }, ...context.accounts.slice(1)] },
    { ...context, accounts: [{ ...first, isDefault: true }, ...context.accounts.slice(1)] },
  ]) {
    await requireRejectedBeforeAdmission({
      ...originalBody(),
      reviewContractVersion: "account-review/v2",
      reviewContext,
    });
  }
});

Deno.test("P2-01: valid closed v2 reaches the original provider exactly once", async () => {
  const context = makeSmsReviewContext();
  const body = {
    ...originalBody(),
    reviewContractVersion: "account-review/v2",
    reviewContext: context,
  };
  const parsed = parseSmsRequestBody(body);
  assert.ok(parsed);
  assert.equal(parsed.reviewContractVersion, "account-review/v2");
  assert.deepEqual(parsed.reviewContext, context);
  const { handler, calls } = makeHarness();
  const response = await handler(post(body));
  assert.equal(response.status, 200);
  assert.equal(calls.reserve, 1);
  assert.equal(calls.providerStart, 1);
  assert.equal(calls.provider, 1);
});
