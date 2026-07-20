import assert from "node:assert/strict";
import test from "node:test";

import {
  createParseSmsHandler,
  type ParseSmsHandlerDependencies,
  type SmsProviderExecutionResult,
} from "./parse-sms-handler.ts";
import { DEFAULT_SMS_SAFEGUARD_POLICY } from "./sms-safeguard-policy.ts";

interface CallState {
  auth: number;
  consent: number;
  terminal: number;
  reserve: number;
  start: number;
  provider: number;
  complete: number;
  release: number;
  reconcile: number;
}

function createState(): CallState {
  return {
    auth: 0,
    consent: 0,
    terminal: 0,
    reserve: 0,
    start: 0,
    provider: 0,
    complete: 0,
    release: 0,
    reconcile: 0,
  };
}

function message(index = 1): Readonly<Record<string, unknown>> {
  return {
    id: `message-${index}`,
    body: `QNB purchase EGP ${index}`,
    sender: "QNB EGYPT",
    date: `2026-07-20T0${index}:00:00.000Z`,
    smsFingerprint: `fingerprint-${index}`,
  };
}

function requestBody(
  messages: readonly Readonly<Record<string, unknown>>[] = [message()]
): Readonly<Record<string, unknown>> {
  return {
    requestKey: "request-key",
    scanSessionId: "scan-session",
    scanKind: "incremental",
    messages,
    categories: "category tree",
    supportedCurrencies: ["EGP"],
  };
}

function post(body: unknown): Request {
  return new Request("http://localhost/parse-sms", {
    method: "POST",
    headers: {
      authorization: "Bearer token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function providerResult(
  overrides: Partial<SmsProviderExecutionResult> = {}
): SmsProviderExecutionResult {
  return {
    completionStatus: "complete",
    isResponseSchemaValid: true,
    transactions: [
      {
        messageId: "message-1",
        amount: 1,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "Merchant",
        date: "2026-07-20T01:00:00.000Z",
        categorySystemName: "shopping",
        confidenceScore: 0.8,
        isTrusted: true,
      },
    ],
    ...overrides,
  };
}

function createDependencies(
  state: CallState,
  overrides: Partial<ParseSmsHandlerDependencies> = {}
): ParseSmsHandlerDependencies {
  return {
    authenticate: async () => {
      state.auth++;
      return "user-id";
    },
    hasConsent: async () => {
      state.consent++;
      return true;
    },
    getPolicy: () => DEFAULT_SMS_SAFEGUARD_POLICY,
    fixedPrompt: "prompt",
    buildResponseSchema: (supportedCurrencies) =>
      JSON.stringify({ supportedCurrencies }),
    shouldExclude: () => false,
    getProcessingOutcomes: async () => {
      state.terminal++;
      return [];
    },
    reserveWork: async () => {
      state.reserve++;
      return {
        requestId: "work-request-id",
        accepted: true,
        decisionCode: "accepted",
        availableAt: null,
        isReplay: false,
      };
    },
    markProviderStarted: async () => {
      state.start++;
      return { started: true, decisionCode: "provider_started" };
    },
    executeProvider: async () => {
      state.provider++;
      return providerResult();
    },
    completeWork: async () => {
      state.complete++;
      return true;
    },
    releaseWork: async () => {
      state.release++;
      return true;
    },
    reconcileOutcomes: async (input) => {
      state.reconcile++;
      return {
        status: "reconciled",
        positiveFingerprints: input.submittedCandidates
          .filter((candidate) => candidate.messageId === "message-1")
          .map((candidate) => candidate.smsFingerprint),
        negativeFingerprints: [],
      };
    },
    ...overrides,
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

test("refuses unauthenticated requests before consent, ledger, or provider work", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      authenticate: async () => {
        state.auth++;
        return null;
      },
    })
  );

  const response = await handler(post(requestBody()));

  assert.equal(response.status, 401);
  assert.deepEqual(state, { ...createState(), auth: 1 });
});

test("refuses missing consent before terminal, ledger, or provider work", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      hasConsent: async () => {
        state.consent++;
        return false;
      },
    })
  );

  const response = await handler(post(requestBody()));

  assert.equal(response.status, 403);
  assert.equal(state.auth, 1);
  assert.equal(state.consent, 1);
  assert.equal(state.reserve, 0);
  assert.equal(state.provider, 0);
});

test("refuses malformed identities and request count before paid work", async () => {
  for (const body of [
    { ...requestBody(), requestKey: "" },
    requestBody(Array.from({ length: 51 }, (_, index) => message(index + 1))),
  ]) {
    const state = createState();
    const handler = createParseSmsHandler(createDependencies(state));

    const response = await handler(post(body));

    assert.equal(response.status, 400);
    assert.equal(state.reserve, 0);
    assert.equal(state.provider, 0);
  }
});

test("enforces Monyvi payload and conservative token boundaries before reservation", async () => {
  const tooLargePolicy = {
    ...DEFAULT_SMS_SAFEGUARD_POLICY,
    fullParser: {
      ...DEFAULT_SMS_SAFEGUARD_POLICY.fullParser,
      maxPayloadBytes: 80,
      maxEstimatedInputTokens: 10,
    },
  };
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, { getPolicy: () => tooLargePolicy })
  );

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.equal(response.status, 413);
  assert.ok(
    ["payload_limit", "input_token_limit"].includes(String(data.reason))
  );
  assert.equal(state.reserve, 0);
  assert.equal(state.provider, 0);
});

test("fails closed when the runtime policy is malformed", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      getPolicy: () => ({
        ...DEFAULT_SMS_SAFEGUARD_POLICY,
        fullParser: {
          ...DEFAULT_SMS_SAFEGUARD_POLICY.fullParser,
          maxUnitsPerRequest: 0,
        },
      }),
    })
  );

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.equal(response.status, 503);
  assert.equal(data.reason, "dependency_unavailable");
  assert.equal(state.reserve, 0);
  assert.equal(state.provider, 0);
});

test("filters terminal fingerprints before reservation and provider execution", async () => {
  const state = createState();
  let reservedUnits = 0;
  let providerMessageCount = 0;
  const handler = createParseSmsHandler(
    createDependencies(state, {
      getProcessingOutcomes: async () => {
        state.terminal++;
        return [{ smsFingerprint: "fingerprint-1", isTerminal: true }];
      },
      reserveWork: async (input) => {
        state.reserve++;
        reservedUnits = input.unitCount;
        return {
          requestId: "work-request-id",
          accepted: true,
          decisionCode: "accepted",
          availableAt: null,
          isReplay: false,
        };
      },
      executeProvider: async (input) => {
        state.provider++;
        providerMessageCount = input.messages.length;
        return providerResult({ transactions: [] });
      },
    })
  );

  const response = await handler(post(requestBody([message(1), message(2)])));
  const data = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(reservedUnits, 1);
  assert.equal(providerMessageCount, 1);
  assert.deepEqual(data.terminalFingerprints, ["fingerprint-1"]);
});

test("returns without reservation when every candidate is already terminal", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      getProcessingOutcomes: async () => {
        state.terminal++;
        return [{ smsFingerprint: "fingerprint-1", isTerminal: true }];
      },
    })
  );

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(state.reserve, 0);
  assert.equal(state.provider, 0);
  assert.deepEqual(data.transactions, []);
  assert.deepEqual(data.terminalFingerprints, ["fingerprint-1"]);
});

test("suppresses non-terminal strikes for ordinary scans but permits history retry", async () => {
  for (const scanKind of ["incremental", "history"] as const) {
    const state = createState();
    const handler = createParseSmsHandler(
      createDependencies(state, {
        getProcessingOutcomes: async () => {
          state.terminal++;
          return [{ smsFingerprint: "fingerprint-1", isTerminal: false }];
        },
      })
    );

    const response = await handler(post({ ...requestBody(), scanKind }));
    const data = await readJson(response);

    assert.equal(response.status, 200);
    if (scanKind === "incremental") {
      assert.equal(state.provider, 0);
      assert.deepEqual(data.negativeFingerprints, ["fingerprint-1"]);
    } else {
      assert.equal(state.provider, 1);
    }
  }
});

test("never calls the provider when admission or provider-start is refused", async () => {
  for (const dependencies of [
    (state: CallState): Partial<ParseSmsHandlerDependencies> => ({
      reserveWork: async () => {
        state.reserve++;
        return {
          requestId: "work-request-id",
          accepted: false,
          decisionCode: "rolling_limit",
          availableAt: "2026-07-21T00:00:00.000Z",
          isReplay: false,
        };
      },
    }),
    (state: CallState): Partial<ParseSmsHandlerDependencies> => ({
      markProviderStarted: async () => {
        state.start++;
        return {
          started: false,
          decisionCode: "already_processed_result_unavailable",
        };
      },
    }),
  ]) {
    const state = createState();
    const handler = createParseSmsHandler(
      createDependencies(state, dependencies(state))
    );

    const response = await handler(post(requestBody()));

    assert.equal(response.status, 429);
    assert.equal(state.provider, 0);
  }
});

test("preserves every typed capacity refusal and its server availability", async () => {
  for (const decisionCode of [
    "scan_limit",
    "rolling_limit",
    "burst_limit",
    "history_cooldown",
  ] as const) {
    const state = createState();
    const handler = createParseSmsHandler(
      createDependencies(state, {
        reserveWork: async () => {
          state.reserve++;
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

    const response = await handler(post(requestBody()));
    const data = await readJson(response);

    assert.equal(response.status, 429);
    assert.equal(data.reason, decisionCode);
    assert.equal(data.availableAt, "2026-07-21T00:00:00.000Z");
    assert.equal(state.provider, 0);
    assert.equal(state.start, 0);
  }
});

test("passes immutable session identity, metrics, and validated policy into admission", async () => {
  const state = createState();
  let admissionInput: unknown;
  const handler = createParseSmsHandler(
    createDependencies(state, {
      reserveWork: async (input) => {
        state.reserve++;
        admissionInput = input;
        return {
          requestId: "work-request-id",
          accepted: false,
          decisionCode: "scan_limit",
          availableAt: null,
          isReplay: false,
        };
      },
    })
  );

  await handler(
    post({
      ...requestBody(),
      requestKey: "stable-request-key",
      scanSessionId: "stable-scan-session",
      scanKind: "history",
    })
  );

  const input = admissionInput as {
    readonly userId: string;
    readonly requestKey: string;
    readonly capability: string;
    readonly scanSessionId: string;
    readonly scanKind: string;
    readonly unitCount: number;
    readonly payloadBytes: number;
    readonly estimatedInputTokens: number;
    readonly policy: unknown;
  };
  assert.equal(input.userId, "user-id");
  assert.equal(input.requestKey, "stable-request-key");
  assert.equal(input.capability, "sms_full_parse");
  assert.equal(input.scanSessionId, "stable-scan-session");
  assert.equal(input.scanKind, "history");
  assert.equal(input.unitCount, 1);
  assert.ok(input.payloadBytes > 0);
  assert.ok(input.estimatedInputTokens > 0);
  assert.deepEqual(input.policy, DEFAULT_SMS_SAFEGUARD_POLICY);
});

test("estimates admission tokens from the same dynamic currency schema sent to the provider", async () => {
  const state = createState();
  const schemaCurrencies: string[][] = [];
  let estimatedInputTokens = 0;
  const handler = createParseSmsHandler(
    createDependencies(state, {
      buildResponseSchema: (supportedCurrencies) => {
        schemaCurrencies.push([...supportedCurrencies]);
        return JSON.stringify({ supportedCurrencies });
      },
      reserveWork: async (input) => {
        state.reserve++;
        estimatedInputTokens = input.estimatedInputTokens;
        return {
          requestId: "work-request-id",
          accepted: false,
          decisionCode: "scan_limit",
          availableAt: null,
          isReplay: false,
        };
      },
    })
  );

  await handler(
    post({
      ...requestBody(),
      supportedCurrencies: ["EGP", "USD", "LONG_TEST_CCY"],
    })
  );

  assert.deepEqual(schemaCurrencies, [["EGP", "USD", "LONG_TEST_CCY"]]);
  assert.ok(estimatedInputTokens > 0);
});

test("starts, reconciles, and completes one accepted provider request", async () => {
  const state = createState();
  const handler = createParseSmsHandler(createDependencies(state));

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(state.reserve, 1);
  assert.equal(state.start, 1);
  assert.equal(state.provider, 1);
  assert.equal(state.reconcile, 1);
  assert.equal(state.complete, 1);
  assert.equal(state.release, 0);
  assert.equal((data.transactions as readonly unknown[]).length, 1);
});

test("finalizes provider-started work when outcome reconciliation fails", async () => {
  const state = createState();
  const completions: Array<{
    readonly completedWithProviderError: boolean;
    readonly decisionCode: string;
  }> = [];
  const handler = createParseSmsHandler(
    createDependencies(state, {
      reconcileOutcomes: async () => {
        state.reconcile++;
        throw new Error("outcome store unavailable");
      },
      completeWork: async (input) => {
        state.complete++;
        completions.push(input);
        return true;
      },
    })
  );

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.equal(response.status, 503);
  assert.equal(data.reason, "dependency_unavailable");
  assert.equal(state.provider, 1);
  assert.equal(state.reconcile, 1);
  assert.deepEqual(completions, [
    {
      requestId: "work-request-id",
      completedWithProviderError: true,
      decisionCode: "outcome_reconciliation_failed",
    },
  ]);
});

test("incomplete provider output creates no negative strike and remains unresolved", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      executeProvider: async () => {
        state.provider++;
        return providerResult({
          completionStatus: "truncated",
          transactions: [],
        });
      },
    })
  );

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(state.reconcile, 0);
  assert.equal(state.complete, 1);
  assert.equal(data.completionStatus, "truncated");
  assert.deepEqual(data.negativeFingerprints, []);
  assert.deepEqual(data.unresolvedFingerprints, ["fingerprint-1"]);
});

test("provider failure is consumed and never reported as an empty success", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      executeProvider: async () => {
        state.provider++;
        throw new Error("provider failed");
      },
    })
  );

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.equal(response.status, 502);
  assert.equal(data.reason, "provider_failed");
  assert.equal(state.complete, 1);
  assert.equal(state.release, 0);
  assert.equal(state.reconcile, 0);
});

test("releases a reservation when provider start definitely fails before execution", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      markProviderStarted: async () => {
        state.start++;
        throw new Error("ledger unavailable");
      },
    })
  );

  const response = await handler(post(requestBody()));

  assert.equal(response.status, 503);
  assert.equal(state.release, 1);
  assert.equal(state.provider, 0);
});
