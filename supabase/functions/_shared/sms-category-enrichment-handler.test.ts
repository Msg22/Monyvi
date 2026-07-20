import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  SmsAiAdmissionDecision,
  SmsAiAdmissionInput,
  SmsAiProviderStartDecision,
} from "./sms-ai-safeguard-contract.ts";
import {
  handleSmsCategoryEnrichmentRequest,
  type SmsCategoryHandlerDependencies,
} from "./sms-category-enrichment-handler.ts";
import { DEFAULT_SMS_SAFEGUARD_POLICY } from "./sms-safeguard-policy.ts";

interface CallState {
  auth: number;
  consent: number;
  reserve: number;
  start: number;
  provider: number;
  complete: number;
  release: number;
}

interface CompleteWorkInput {
  readonly requestId: string;
  readonly completedWithProviderError: boolean;
  readonly decisionCode: string;
}

interface SafeguardedDependencies extends SmsCategoryHandlerDependencies {
  readonly getPolicy: () => unknown;
  readonly reserveWork: (
    input: SmsAiAdmissionInput
  ) => Promise<SmsAiAdmissionDecision>;
  readonly markProviderStarted: (
    requestId: string
  ) => Promise<SmsAiProviderStartDecision>;
  readonly completeWork: (input: CompleteWorkInput) => Promise<boolean>;
  readonly releaseWork: (
    requestId: string,
    decisionCode: string
  ) => Promise<boolean>;
}

function createState(): CallState {
  return {
    auth: 0,
    consent: 0,
    reserve: 0,
    start: 0,
    provider: 0,
    complete: 0,
    release: 0,
  };
}

function merchant(
  index = 1,
  name = `Merchant ${index}`
): Record<string, unknown> {
  return {
    id: `merchant-${index}`,
    merchant: name,
    transactionType: "EXPENSE",
    messageFamily: "card_purchase",
  };
}

function requestBody(
  merchants: readonly Record<string, unknown>[] = [merchant()]
): Record<string, unknown> {
  return {
    requestKey: "category-request-key",
    scanSessionId: "scan-session",
    scanKind: "incremental",
    merchants,
  };
}

function post(body: unknown = requestBody()): Request {
  return new Request("https://example.test/enrich-sms-categories", {
    method: "POST",
    headers: {
      authorization: "Bearer token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createDependencies(
  state: CallState,
  overrides: Partial<SafeguardedDependencies> = {}
): SafeguardedDependencies {
  return {
    authenticate: async () => {
      state.auth += 1;
      return { userId: "user-id" };
    },
    hasConsent: async () => {
      state.consent += 1;
      return true;
    },
    getPolicy: () => DEFAULT_SMS_SAFEGUARD_POLICY,
    isProviderConfigured: true,
    reserveWork: async () => {
      state.reserve += 1;
      return {
        requestId: "work-request-id",
        accepted: true,
        decisionCode: "accepted",
        availableAt: null,
        isReplay: false,
      };
    },
    markProviderStarted: async () => {
      state.start += 1;
      return {
        started: true,
        decisionCode: "provider_started",
        terminalFingerprints: [],
      };
    },
    classify: async (body) => {
      state.provider += 1;
      return {
        categories: body.merchants.map((item) => ({
          merchantId: item.id,
          categorySystemName: "shopping",
          confidence: 0.95,
        })),
      };
    },
    completeWork: async () => {
      state.complete += 1;
      return true;
    },
    releaseWork: async () => {
      state.release += 1;
      return true;
    },
    logInfo: () => undefined,
    logError: () => undefined,
    ...overrides,
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

test("refuses auth and consent failures before service-role admission", async () => {
  for (const override of [
    (state: CallState): Partial<SafeguardedDependencies> => ({
      authenticate: async () => {
        state.auth += 1;
        return null;
      },
    }),
    (state: CallState): Partial<SafeguardedDependencies> => ({
      hasConsent: async () => {
        state.consent += 1;
        return false;
      },
    }),
  ]) {
    const state = createState();
    const response = await handleSmsCategoryEnrichmentRequest(
      post(),
      createDependencies(state, override(state))
    );

    assert.ok([401, 403].includes(response.status));
    assert.equal(state.reserve, 0);
    assert.equal(state.provider, 0);
  }
});

test("admits at most 20 unique merchants and preserves the policy limits", async () => {
  const state = createState();
  let admission: SmsAiAdmissionInput | undefined;
  const dependencies = createDependencies(state, {
    reserveWork: async (input) => {
      state.reserve += 1;
      admission = input;
      return {
        requestId: "work-request-id",
        accepted: true,
        decisionCode: "accepted",
        availableAt: null,
        isReplay: false,
      };
    },
  });
  const twenty = Array.from({ length: 20 }, (_, index) => merchant(index + 1));

  const accepted = await handleSmsCategoryEnrichmentRequest(
    post(requestBody(twenty)),
    dependencies
  );
  const refused = await handleSmsCategoryEnrichmentRequest(
    post(requestBody([...twenty, merchant(21)])),
    dependencies
  );

  assert.equal(accepted.status, 200);
  assert.equal(refused.status, 400);
  assert.equal(admission?.capability, "sms_category_enrichment");
  assert.equal(admission?.unitCount, 20);
  assert.equal(
    admission?.policy.categoryEnrichment.maxUnitsPerRollingWindow,
    100
  );
  assert.equal(
    admission?.policy.categoryEnrichment.maxProviderStartsPerBurst,
    30
  );
  assert.equal(state.provider, 1);
});

test("deduplicates normalized merchants before reservation and provider work", async () => {
  const state = createState();
  let admittedUnits = 0;
  let providerMerchantCount = 0;
  const response = await handleSmsCategoryEnrichmentRequest(
    post(
      requestBody([
        merchant(1, "  MY   FAWRY  "),
        merchant(2, "my fawry"),
        merchant(3, "ＭＹ ＦＡＷＲＹ"),
      ])
    ),
    createDependencies(state, {
      reserveWork: async (input) => {
        state.reserve += 1;
        admittedUnits = input.unitCount;
        return {
          requestId: "work-request-id",
          accepted: true,
          decisionCode: "accepted",
          availableAt: null,
          isReplay: false,
        };
      },
      classify: async (body) => {
        state.provider += 1;
        providerMerchantCount = body.merchants.length;
        return { categories: [] };
      },
    })
  );

  assert.equal(response.status, 200);
  assert.equal(admittedUnits, 1);
  assert.equal(providerMerchantCount, 1);
});

test("returns typed rolling and burst refusals with availability and no provider call", async () => {
  for (const decisionCode of ["rolling_limit", "burst_limit"] as const) {
    const state = createState();
    const response = await handleSmsCategoryEnrichmentRequest(
      post(),
      createDependencies(state, {
        reserveWork: async () => {
          state.reserve += 1;
          return {
            requestId: "work-request-id",
            accepted: false,
            decisionCode,
            availableAt: "2026-07-21T00:00:00.000Z",
            isReplay: false,
          };
        },
      })
    );

    assert.equal(response.status, 429);
    assert.deepEqual(await readJson(response), {
      categories: [],
      reason: decisionCode,
      availableAt: "2026-07-21T00:00:00.000Z",
    });
    assert.equal(state.provider, 0);
    assert.equal(state.start, 0);
  }
});

test("idempotent replay never starts the provider or releases consumed work", async () => {
  const state = createState();
  const response = await handleSmsCategoryEnrichmentRequest(
    post(),
    createDependencies(state, {
      reserveWork: async () => {
        state.reserve += 1;
        return {
          requestId: "work-request-id",
          accepted: false,
          decisionCode: "already_processed_result_unavailable",
          availableAt: null,
          isReplay: true,
        };
      },
    })
  );

  assert.equal(response.status, 429);
  assert.equal(
    (await readJson(response)).reason,
    "already_processed_result_unavailable"
  );
  assert.equal(state.start, 0);
  assert.equal(state.provider, 0);
  assert.equal(state.release, 0);
});

test("provider-start replay refusal never calls or releases provider work", async () => {
  const state = createState();
  const response = await handleSmsCategoryEnrichmentRequest(
    post(),
    createDependencies(state, {
      markProviderStarted: async () => {
        state.start += 1;
        return {
          started: false,
          decisionCode: "already_processed_result_unavailable",
          terminalFingerprints: [],
        };
      },
    })
  );

  assert.equal(response.status, 429);
  assert.equal(
    (await readJson(response)).reason,
    "already_processed_result_unavailable"
  );
  assert.equal(state.provider, 0);
  assert.equal(state.complete, 0);
  assert.equal(state.release, 0);
});

test("starts and completes exactly one accepted provider request", async () => {
  const state = createState();
  let completion: CompleteWorkInput | undefined;
  let receivedSignal: AbortSignal | undefined;
  const incomingRequest = post();
  const response = await handleSmsCategoryEnrichmentRequest(
    incomingRequest,
    createDependencies(state, {
      classify: async (_body, signal) => {
        state.provider += 1;
        receivedSignal = signal;
        return {
          categories: [
            {
              merchantId: "merchant-1",
              categorySystemName: "shopping",
              confidence: 0.95,
            },
          ],
        };
      },
      completeWork: async (input) => {
        state.complete += 1;
        completion = input;
        return true;
      },
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(state, {
    auth: 1,
    consent: 1,
    reserve: 1,
    start: 1,
    provider: 1,
    complete: 1,
    release: 0,
  });
  assert.deepEqual(completion, {
    requestId: "work-request-id",
    completedWithProviderError: false,
    decisionCode: "complete",
  });
  assert.equal(receivedSignal, incomingRequest.signal);
  assert.deepEqual(await readJson(response), {
    categories: [
      {
        merchantId: "merchant-1",
        categorySystemName: "shopping",
        confidence: 0.95,
      },
    ],
  });
});

test("releases only when provider start definitely did not occur", async () => {
  const state = createState();
  const response = await handleSmsCategoryEnrichmentRequest(
    post(),
    createDependencies(state, {
      markProviderStarted: async () => {
        state.start += 1;
        throw new Error("ledger unavailable");
      },
    })
  );

  assert.equal(response.status, 503);
  assert.equal(state.release, 1);
  assert.equal(state.provider, 0);
  assert.equal(state.complete, 0);
});

test("provider failures are consumed and never released as unused capacity", async () => {
  for (const providerFailure of ["throw", "null"] as const) {
    const state = createState();
    let completion: CompleteWorkInput | undefined;
    const response = await handleSmsCategoryEnrichmentRequest(
      post(),
      createDependencies(state, {
        classify: async () => {
          state.provider += 1;
          if (providerFailure === "throw") throw new Error("provider failed");
          return null;
        },
        completeWork: async (input) => {
          state.complete += 1;
          completion = input;
          return true;
        },
      })
    );

    assert.equal(response.status, 502);
    assert.equal((await readJson(response)).reason, "provider_failed");
    assert.equal(completion?.completedWithProviderError, true);
    assert.equal(state.release, 0);
  }
});

test("refuses malformed, disabled, or unavailable work before provider admission", async () => {
  const cases: readonly [unknown, Partial<SafeguardedDependencies>, number][] =
    [
      [{ ...requestBody(), requestKey: "" }, {}, 400],
      [requestBody(), { getPolicy: () => ({ invalid: true }) }, 503],
      [
        requestBody(),
        {
          getPolicy: () => ({
            ...DEFAULT_SMS_SAFEGUARD_POLICY,
            categoryEnrichment: {
              ...DEFAULT_SMS_SAFEGUARD_POLICY.categoryEnrichment,
              isEnabled: false,
            },
          }),
        },
        503,
      ],
      [requestBody(), { isProviderConfigured: false }, 503],
    ];

  for (const [body, overrides, status] of cases) {
    const state = createState();
    const response = await handleSmsCategoryEnrichmentRequest(
      post(body),
      createDependencies(state, overrides)
    );

    assert.equal(response.status, status);
    assert.equal(state.reserve, 0);
    assert.equal(state.provider, 0);
  }
});

test("Edge entry point uses the service-role safeguard adapter", () => {
  const source = readFileSync(
    new URL("../enrich-sms-categories/index.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /reserveSmsAiWork\(createServiceClient\(\),\s*input\)/);
  assert.match(
    source,
    /markSmsAiProviderStarted\(\s*createServiceClient\(\),\s*requestId,\s*candidateFingerprints/
  );
  assert.match(source, /completeSmsAiWork\(createServiceClient\(\),/);
  assert.match(source, /releaseSmsAiWork\(createServiceClient\(\),/);
});
