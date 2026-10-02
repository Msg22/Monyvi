import assert from "node:assert/strict";
import test from "node:test";

import {
  createParseSmsHandler,
  type ExecuteSmsProviderInput,
  type ParseSmsHandlerDependencies,
  type SmsProviderExecutionResult,
} from "./parse-sms-handler.ts";
import {
  buildSmsProviderUserPromptAtEdge,
  estimateSmsRequestInputTokensAtEdge,
} from "./sms-input-estimator.ts";
import { DEFAULT_SMS_SAFEGUARD_POLICY } from "./sms-safeguard-policy.ts";
import { executeSmsAiProvider } from "./sms-ai/sms-ai-provider-executor.ts";
import type { SmsAiProvider } from "./sms-ai/sms-ai-provider.ts";

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
    scanStartedAt: "2026-07-20T12:00:00.000Z",
    messages,
    categories: "category tree",
    supportedCurrencies: ["EGP"],
  };
}

function post(body: unknown, signal?: AbortSignal): Request {
  return new Request("http://localhost/parse-sms", {
    method: "POST",
    headers: {
      authorization: "Bearer token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
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
    buildFixedPrompt: () => "prompt",
    buildCategoryContext: (categories) => categories,
    buildResponseSchema: (supportedCurrencies) =>
      JSON.stringify({ supportedCurrencies }),
    shouldExclude: () => false,
    computeFingerprint: async (value) => value.smsFingerprint,
    computeRequestDigest: async () => "request-digest",
    getServerNowMs: () => Date.UTC(2026, 6, 20, 12, 0, 0),
    resolveScanWindowStart: async (input) => input.requestedScanStartedAtMs,
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
      return {
        started: true,
        decisionCode: "provider_started",
        terminalFingerprints: [],
        availableAt: null,
      };
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

test("rejects a fingerprint that does not match the canonical message", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      computeFingerprint: async () => "canonical-fingerprint",
    })
  );

  const response = await handler(post(requestBody()));

  assert.equal(response.status, 400);
  assert.equal((await readJson(response)).reason, "malformed_request");
  assert.equal(state.reserve, 0);
});

test("rejects messages outside the rolling window or implausibly in the future", async () => {
  const state = createState();
  const handler = createParseSmsHandler(createDependencies(state));
  const oldMessage = {
    ...message(),
    date: "2026-06-19T12:00:00.000Z",
  };
  const futureMessage = {
    ...message(),
    date: "2026-07-20T12:06:00.000Z",
  };

  assert.equal(
    await handler(post(requestBody([oldMessage]))).then((r) => r.status),
    400
  );
  assert.equal(
    await handler(post(requestBody([futureMessage]))).then((r) => r.status),
    400
  );
  assert.equal(state.reserve, 0);
});

test("rejects messages received after the immutable scan start", async () => {
  const state = createState();
  const scanStartedAt = "2026-07-20T12:00:00.000Z";
  const handler = createParseSmsHandler(
    createDependencies(state, {
      getServerNowMs: () => Date.parse("2026-07-20T12:04:00.000Z"),
      resolveScanWindowStart: async () => Date.parse(scanStartedAt),
    })
  );
  const postStartMessage = {
    ...message(),
    date: "2026-07-20T12:02:00.000Z",
  };

  const response = await handler(post(requestBody([postStartMessage])));

  assert.equal(response.status, 400);
  assert.equal((await readJson(response)).reason, "malformed_request");
  assert.equal(state.reserve, 0);
  assert.equal(state.provider, 0);
});

test("preserves the inclusive client scan-start cutoff across Edge transit delay", async () => {
  const state = createState();
  const scanStartedAt = "2026-07-20T12:00:00.000Z";
  const handler = createParseSmsHandler(
    createDependencies(state, {
      getServerNowMs: () => Date.parse("2026-07-20T12:00:05.000Z"),
    })
  );
  const boundaryMessage = {
    ...message(),
    date: "2026-06-20T12:00:00.000Z",
  };

  const response = await handler(
    post({ ...requestBody([boundaryMessage]), scanStartedAt })
  );

  assert.equal(response.status, 200);
  assert.equal(state.provider, 1);
});

test("accepts a later chunk from an established client scan clock", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      getServerNowMs: () => Date.parse("2026-07-20T12:30:00.000Z"),
      resolveScanWindowStart: async () =>
        Date.parse("2026-07-20T12:00:00.000Z"),
    })
  );

  const response = await handler(
    post({
      ...requestBody(),
      scanStartedAt: "2026-07-20T12:00:00.000Z",
    })
  );

  assert.equal(response.status, 200);
  assert.equal(state.provider, 1);
});

test("keeps the first server-accepted cutoff authoritative for later chunks", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      getServerNowMs: () => Date.parse("2026-07-20T12:30:00.000Z"),
      resolveScanWindowStart: async () =>
        Date.parse("2026-07-20T12:25:00.000Z"),
    })
  );
  const outsideServerWindow = {
    ...message(),
    date: "2026-06-20T12:24:59.999Z",
  };

  const response = await handler(
    post({
      ...requestBody([outsideServerWindow]),
      scanStartedAt: "2026-07-20T12:00:00.000Z",
    })
  );

  assert.equal(response.status, 400);
  assert.equal(state.reserve, 0);
  assert.equal(state.provider, 0);
});

test("refuses a conflicting scan-session anchor before paid work", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      resolveScanWindowStart: async () => null,
    })
  );

  const response = await handler(post(requestBody()));

  assert.equal(response.status, 400);
  assert.equal((await readJson(response)).reason, "malformed_request");
  assert.equal(state.reserve, 0);
  assert.equal(state.provider, 0);
});

test("rejects an implausibly future scan-start clock before paid work", async () => {
  const state = createState();
  const handler = createParseSmsHandler(createDependencies(state));

  const response = await handler(
    post({
      ...requestBody(),
      scanStartedAt: "2026-07-20T12:05:00.001Z",
    })
  );

  assert.equal(response.status, 400);
  assert.equal(state.reserve, 0);
  assert.equal(state.provider, 0);
});

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

test("rejects oversized request arrays before canonical message work", async () => {
  for (const body of [
    requestBody(Array.from({ length: 51 }, (_, index) => message(index + 1))),
    {
      ...requestBody(),
      supportedCurrencies: Array.from(
        { length: 65 },
        (_, index) => `CCY${index}`
      ),
    },
  ]) {
    const state = createState();
    const handler = createParseSmsHandler(createDependencies(state));

    const response = await handler(post(body));

    assert.equal(response.status, 400);
    assert.equal(state.reserve, 0);
    assert.equal(state.provider, 0);
  }
});

test("accepts the complete supported-currency catalogue", async () => {
  const state = createState();
  const handler = createParseSmsHandler(createDependencies(state));

  const response = await handler(
    post({
      ...requestBody(),
      supportedCurrencies: Array.from(
        { length: 35 },
        (_, index) => `CCY${index}`
      ),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(state.provider, 1);
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

test("identifies shared request overhead without blaming a single candidate", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      getPolicy: () => ({
        ...DEFAULT_SMS_SAFEGUARD_POLICY,
        fullParser: {
          ...DEFAULT_SMS_SAFEGUARD_POLICY.fullParser,
          maxPayloadBytes: 1,
        },
      }),
    })
  );

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.equal(response.status, 413);
  assert.equal(data.reason, "payload_limit");
  assert.equal(data.sizeScope, "shared_request");
  assert.equal(state.reserve, 0);
});

test("identifies a single candidate that cannot fit in an otherwise valid request", async () => {
  const state = createState();
  const baselineBody = requestBody([]);
  const baselineBytes = new TextEncoder().encode(
    JSON.stringify(baselineBody)
  ).length;
  const handler = createParseSmsHandler(
    createDependencies(state, {
      getPolicy: () => ({
        ...DEFAULT_SMS_SAFEGUARD_POLICY,
        fullParser: {
          ...DEFAULT_SMS_SAFEGUARD_POLICY.fullParser,
          maxPayloadBytes: baselineBytes,
        },
      }),
    })
  );

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.equal(response.status, 413);
  assert.equal(data.reason, "payload_limit");
  assert.equal(data.sizeScope, "candidate");
  assert.equal(state.reserve, 0);
});

test("counts provider user-prompt framing before admitting a token-bound request", async () => {
  const providerPrompt = buildSmsProviderUserPromptAtEdge([
    message() as {
      readonly id: string;
      readonly sender: string;
      readonly date: string;
      readonly body: string;
    },
  ]);
  const withoutFraming = estimateSmsRequestInputTokensAtEdge({
    prompt: "prompt",
    categories: "category tree",
    schema: JSON.stringify({ supportedCurrencies: ["EGP"] }),
    messages: [JSON.stringify(message())],
  }).totalTokens;
  const withFraming = estimateSmsRequestInputTokensAtEdge({
    prompt: "prompt",
    categories: "category tree",
    schema: JSON.stringify({ supportedCurrencies: ["EGP"] }),
    messages: [providerPrompt],
  }).totalTokens;
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      getPolicy: () => ({
        ...DEFAULT_SMS_SAFEGUARD_POLICY,
        fullParser: {
          ...DEFAULT_SMS_SAFEGUARD_POLICY.fullParser,
          maxEstimatedInputTokens: withoutFraming,
        },
      }),
    })
  );

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.ok(withFraming > withoutFraming);
  assert.equal(response.status, 413);
  assert.equal(data.reason, "input_token_limit");
  assert.equal(state.reserve, 0);
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

test("keeps non-terminal peers retryable when a terminal outcome wins the provider-start race", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      markProviderStarted: async () => {
        state.start++;
        return {
          started: false,
          decisionCode: "terminal_outcome",
          terminalFingerprints: ["fingerprint-1"],
          availableAt: null,
        };
      },
    })
  );

  const response = await handler(post(requestBody([message(1), message(2)])));
  const data = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(state.provider, 0);
  assert.equal(data.completionStatus, "truncated");
  assert.deepEqual(data.terminalFingerprints, ["fingerprint-1"]);
  assert.deepEqual(data.unresolvedFingerprints, ["fingerprint-2"]);
  assert.equal(data.retryRequestMode, "fresh");
});

test("initializes a fixed scan session without reserving provider work", async () => {
  const state = createState();
  let resolvedScanSessionId: string | null = null;
  const handler = createParseSmsHandler(
    createDependencies(state, {
      resolveScanWindowStart: async (input) => {
        resolvedScanSessionId = input.scanSessionId;
        return input.requestedScanStartedAtMs;
      },
    })
  );

  const response = await handler(post(requestBody([])));
  const data = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(resolvedScanSessionId, "scan-session");
  assert.equal(data.completionStatus, "complete");
  assert.equal(state.terminal, 0);
  assert.equal(state.reserve, 0);
  assert.equal(state.provider, 0);
});

test("preserves provider-start cooldown availability in the refusal envelope", async () => {
  const state = createState();
  const availableAt = "2026-07-21T12:00:00.000+00:00";
  const handler = createParseSmsHandler(
    createDependencies(state, {
      markProviderStarted: async () => ({
        started: false,
        decisionCode: "history_cooldown",
        terminalFingerprints: [],
        availableAt,
      }),
    })
  );

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.equal(response.status, 429);
  assert.equal(data.reason, "history_cooldown");
  assert.equal(data.availableAt, availableAt);
  assert.equal(state.provider, 0);
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

test("uses the immutable accepted scan boundary for negative-outcome lookup", async () => {
  const state = createState();
  let receivedReferenceNowMs: number | null = null;
  const acceptedScanStartedAtMs = Date.parse("2026-07-20T12:00:00.000Z");
  const handler = createParseSmsHandler(
    createDependencies(state, {
      resolveScanWindowStart: async () => acceptedScanStartedAtMs,
      getProcessingOutcomes: async (
        _userId,
        _fingerprints,
        _lookbackDays,
        referenceNowMs
      ) => {
        receivedReferenceNowMs = referenceNowMs;
        return [];
      },
    })
  );

  const response = await handler(post(requestBody()));

  assert.equal(response.status, 200);
  assert.equal(receivedReferenceNowMs, acceptedScanStartedAtMs);
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
          terminalFingerprints: [],
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

test("retries finalization after a transient completion failure", async () => {
  for (const firstFailure of ["false", "throw"] as const) {
    const state = createState();
    const handler = createParseSmsHandler(
      createDependencies(state, {
        completeWork: async () => {
          state.complete++;
          if (state.complete > 1) return true;
          if (firstFailure === "throw") {
            throw new Error("completion RPC unavailable");
          }
          return false;
        },
      })
    );

    const response = await handler(post(requestBody()));
    const data = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(state.provider, 1);
    assert.equal(state.complete, 2);
    assert.equal((data.transactions as readonly unknown[]).length, 1);
  }
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
  assert.equal("retryRequestMode" in data, false);
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
  for (const completionStatus of [
    "truncated",
    "safety_stopped",
    "failed",
  ] as const) {
    const state = createState();
    const handler = createParseSmsHandler(
      createDependencies(state, {
        executeProvider: async () => {
          state.provider++;
          return providerResult({ completionStatus });
        },
      })
    );

    const response = await handler(post(requestBody()));
    const data = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(state.reconcile, 0);
    assert.equal(state.complete, 1);
    assert.equal(data.completionStatus, completionStatus);
    assert.deepEqual(data.transactions, []);
    assert.deepEqual(data.negativeFingerprints, []);
    assert.deepEqual(data.unresolvedFingerprints, ["fingerprint-1"]);
    assert.equal(data.retryRequestMode, "fresh");
  }
});

test("incomplete provider output fails closed when completion is unconfirmed", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      executeProvider: async () => {
        state.provider++;
        return providerResult({ completionStatus: "failed" });
      },
      completeWork: async () => {
        state.complete++;
        return false;
      },
    })
  );

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.equal(response.status, 503);
  assert.equal(data.reason, "dependency_unavailable");
  assert.equal("retryRequestMode" in data, false);
  assert.equal(state.provider, 1);
  assert.equal(state.complete, 3);
  assert.equal(state.reconcile, 0);
});

test("provider failure is consumed and grants fresh retry after confirmed completion", async () => {
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
  assert.equal(data.retryRequestMode, "fresh");
  assert.equal(state.complete, 1);
  assert.equal(state.release, 0);
  assert.equal(state.reconcile, 0);
});

test("provider failure does not grant fresh retry when completion is unconfirmed", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      executeProvider: async () => {
        state.provider++;
        throw new Error("provider failed");
      },
      completeWork: async () => {
        state.complete++;
        return false;
      },
    })
  );

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.equal(response.status, 503);
  assert.equal(data.reason, "dependency_unavailable");
  assert.equal("retryRequestMode" in data, false);
  assert.equal(state.provider, 1);
  assert.equal(state.complete, 3);
  assert.equal(state.release, 0);
  assert.equal(state.reconcile, 0);
});

test("reconciles an ambiguous provider-start response as consumed work", async () => {
  const state = createState();
  const completions: CompleteSmsAiWorkInput[] = [];
  const handler = createParseSmsHandler(
    createDependencies(state, {
      markProviderStarted: async () => {
        state.start++;
        throw new Error("ledger unavailable");
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
  assert.equal("retryRequestMode" in data, false);
  assert.equal(state.complete, 1);
  assert.equal(state.release, 0);
  assert.equal(state.provider, 0);
  assert.deepEqual(completions, [
    {
      requestId: "work-request-id",
      completedWithProviderError: true,
      decisionCode: "provider_start_response_unknown",
    },
  ]);
});

test("caller cancellation after provider start never grants fresh retry", async () => {
  const state = createState();
  const controller = new AbortController();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      markProviderStarted: async () => {
        state.start++;
        controller.abort();
        return {
          started: true,
          decisionCode: "provider_started",
          terminalFingerprints: [],
          availableAt: null,
        };
      },
    })
  );

  const response = await handler(post(requestBody(), controller.signal));
  const data = await readJson(response);

  assert.equal(response.status, 499);
  assert.equal(data.reason, "request_cancelled");
  assert.equal("retryRequestMode" in data, false);
  assert.equal(state.provider, 0);
  assert.equal(state.complete, 1);
  assert.equal(state.release, 0);
});

test("releases a reservation when provider start definitely did not complete", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      markProviderStarted: async () => {
        state.start++;
        throw new Error("ledger unavailable");
      },
      completeWork: async () => {
        state.complete++;
        return false;
      },
    })
  );

  const response = await handler(post(requestBody()));

  assert.equal(response.status, 503);
  assert.equal(state.complete, 3);
  assert.equal(state.release, 1);
  assert.equal(state.provider, 0);
});


test("accepts a complete provider result with zero transactions", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      executeProvider: async () => {
        state.provider++;
        return providerResult({ transactions: [] });
      },
      reconcileOutcomes: async () => {
        state.reconcile++;
        return {
          status: "reconciled",
          positiveFingerprints: [],
          negativeFingerprints: ["fingerprint-1"],
        };
      },
    })
  );

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(data.completionStatus, "complete");
  assert.deepEqual(data.transactions, []);
  assert.equal(state.start, 1);
  assert.equal(state.provider, 1);
  assert.equal(state.reconcile, 1);
  assert.equal(state.complete, 1);
});

test("rejects a schema-invalid normalized provider result without reconciliation", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      executeProvider: async () => {
        state.provider++;
        return providerResult({
          isResponseSchemaValid: false,
          transactions: [],
        });
      },
    })
  );

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.equal(response.status, 502);
  assert.equal(data.reason, "response_invalid");
  assert.equal(data.retryRequestMode, "fresh");
  assert.equal(state.start, 1);
  assert.equal(state.provider, 1);
  assert.equal(state.reconcile, 0);
  assert.equal(state.complete, 1);
});

test("schema-invalid provider output does not grant fresh retry when completion is unconfirmed", async () => {
  const state = createState();
  const handler = createParseSmsHandler(
    createDependencies(state, {
      executeProvider: async () => {
        state.provider++;
        return providerResult({
          isResponseSchemaValid: false,
          transactions: [],
        });
      },
      completeWork: async () => {
        state.complete++;
        return false;
      },
    })
  );

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.equal(response.status, 503);
  assert.equal(data.reason, "dependency_unavailable");
  assert.equal("retryRequestMode" in data, false);
  assert.equal(state.start, 1);
  assert.equal(state.provider, 1);
  assert.equal(state.reconcile, 0);
  assert.equal(state.complete, 3);
});

test("keeps provider implementation metadata out of the public success response", async () => {
  const state = createState();
  const handler = createParseSmsHandler(createDependencies(state));

  const response = await handler(post(requestBody()));
  const data = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal("provider" in data, false);
  assert.equal("model" in data, false);
  assert.equal("serviceTier" in data, false);
  assert.equal("usage" in data, false);
});


test("supports a future raw SMS adapter without changing handler safeguards or public shape", async () => {
  const state = createState();
  const futureAdapter: SmsAiProvider = {
    execute: async () => ({
      completionStatus: "complete",
      content: JSON.stringify({ transactions: [] }),
    }),
  };
  const handler = createParseSmsHandler(
    createDependencies(state, {
      executeProvider: (input) => executeSmsAiProvider(futureAdapter, input),
    })
  );

  const response = await handler(
    post({
      ...requestBody(),
      categories:
        "EXPENSE categories (return the system_name value):\n  L1: shopping",
    })
  );
  const data = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(state.reserve, 1);
  assert.equal(state.start, 1);
  assert.equal(state.provider, 0);
  assert.equal("provider" in data, false);
  assert.equal("model" in data, false);
  assert.deepEqual(data.transactions, []);
});


test("propagates provider-independent category and currency context unchanged", async () => {
  const state = createState();
  const fixedPromptCurrencies: string[][] = [];
  const responseSchemaCurrencies: string[][] = [];
  const categoryInputs: string[] = [];
  let providerInput: ExecuteSmsProviderInput | undefined;
  const categories =
    "EXPENSE categories (return the system_name value):\n  L1: shopping";
  const supportedCurrencies = ["EGP", "USD"];

  const handler = createParseSmsHandler(
    createDependencies(state, {
      buildFixedPrompt: (currencies) => {
        fixedPromptCurrencies.push([...currencies]);
        return "stable prompt";
      },
      buildCategoryContext: (value) => {
        categoryInputs.push(value);
        return `dynamic:${value}`;
      },
      buildResponseSchema: (currencies) => {
        responseSchemaCurrencies.push([...currencies]);
        return JSON.stringify({ currencies });
      },
      executeProvider: async (input) => {
        state.provider++;
        providerInput = input;
        return providerResult({ transactions: [] });
      },
    })
  );

  const response = await handler(
    post({
      ...requestBody(),
      categories,
      supportedCurrencies,
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(fixedPromptCurrencies, [["EGP", "USD"]]);
  assert.deepEqual(responseSchemaCurrencies, [["EGP", "USD"]]);
  assert.deepEqual(categoryInputs, [categories]);
  assert.deepEqual(providerInput?.supportedCurrencies, ["EGP", "USD"]);
  assert.equal(providerInput?.categories, categories);
  assert.deepEqual(
    providerInput?.messages.map((value) => value.id),
    ["message-1"]
  );
});

test("provider-independent prompt builders affect admission estimation but not provider input", async () => {
  const state = createState();
  let estimatedInputTokens = 0;
  let providerInput: ExecuteSmsProviderInput | undefined;
  const handler = createParseSmsHandler(
    createDependencies(state, {
      buildFixedPrompt: () => "stable prompt sentinel",
      buildCategoryContext: () => "dynamic category sentinel",
      buildResponseSchema: () => "schema sentinel",
      reserveWork: async (input) => {
        state.reserve++;
        estimatedInputTokens = input.estimatedInputTokens;
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
        providerInput = input;
        return providerResult({ transactions: [] });
      },
    })
  );

  const body = {
    ...requestBody(),
    categories: "original category context",
    supportedCurrencies: ["EGP"],
  };
  const response = await handler(post(body));

  assert.equal(response.status, 200);
  assert.ok(estimatedInputTokens > 0);
  assert.equal(providerInput?.categories, "original category context");
  assert.deepEqual(providerInput?.supportedCurrencies, ["EGP"]);
});
