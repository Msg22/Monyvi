import {
  parseSmsProviderRetry,
  parseSmsSafeguardRefusal,
  type ChunkAiResult,
} from "../../services/ai-sms-parser-response";
import {
  applyChunkResolution,
  createInitialAggregationState,
  invokeParseChunk,
  type ChunkWork,
  type MessagePayload,
} from "../../services/ai-sms-chunk-runner-service";
import {
  parseSmsWithAi,
  type ParseSmsContext,
  type SmsCandidate,
} from "../../services/ai-sms-parser-service";
import { invokeAuthenticatedEdgeFunction } from "../../services/authenticated-edge-function-service";
import type { SmsParseTransport } from "../../services/sms-parse-transport";

jest.mock("../../services/authenticated-edge-function-service", () => ({
  invokeAuthenticatedEdgeFunction: jest.fn(),
  isEdgeFunctionAuthenticationError: jest.fn(() => false),
}));

jest.mock("@/config/e2e-test-config", () => ({
  shouldBlockUnsafeSmsParserConfiguration: (): boolean => false,
  shouldUseFixtureSmsParser: (): boolean => false,
}));

jest.mock("@/config/sms-safeguard-qa-config", () => ({
  getSmsSafeguardQaConfig: (): { enabled: boolean } => ({ enabled: false }),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

let mockUuidCounter = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn((): string => `fresh-key-${++mockUuidCounter}`),
  digestStringAsync: jest.fn(
    (): Promise<string> => Promise.resolve("mock-digest")
  ),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));

jest.mock("../../services/user-data-access", () => ({
  assertExpectedCurrentUser: jest.fn(
    (expectedUserId?: string): Promise<void> => {
      if (expectedUserId === "unauthorized-user") {
        return Promise.reject(new Error("AUTH_SCOPE_CHANGED"));
      }
      return Promise.resolve();
    }
  ),
}));

const mockInvokeAuthenticatedEdgeFunction =
  invokeAuthenticatedEdgeFunction as jest.MockedFunction<
    typeof invokeAuthenticatedEdgeFunction
  >;

function createMockErrorResponse(
  status: number,
  body: unknown
): {
  readonly data: null;
  readonly error: { readonly context: Response };
} {
  const jsonString = typeof body === "string" ? body : JSON.stringify(body);
  const response = new Response(jsonString, {
    status,
    headers: { "Content-Type": "application/json" },
  });
  return {
    data: null,
    error: { context: response },
  };
}

describe("T054-CLIENT: Provider Retry Contract", () => {
  const sampleCandidate: SmsCandidate = {
    message: {
      id: "msg-test-1",
      address: "INSTAPAY",
      body: "Sent 500 EGP to Mohamed",
      date: 1700000000000,
      read: false,
    },
    smsFingerprint: "fp-instapay-1",
  };

  const sampleContext: ParseSmsContext = {
    categories: [],
    supportedCurrencies: ["EGP", "USD"],
  };

  const sampleTransport: SmsParseTransport = {
    functionName: "parse-sms",
    chunkSize: 15,
  };

  const sampleMessagePayload: MessagePayload = {
    id: sampleCandidate.message.id,
    body: sampleCandidate.message.body,
    sender: sampleCandidate.message.address,
    date: new Date(sampleCandidate.message.date).toISOString(),
    smsFingerprint: sampleCandidate.smsFingerprint,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUuidCounter = 0;
  });

  describe("Zod helper: parseSmsProviderRetry isolation", () => {
    it("validates HTTP 502 provider_failed with fresh retry mode", () => {
      const parsed = parseSmsProviderRetry({
        reason: "provider_failed",
        retryRequestMode: "fresh",
      });
      expect(parsed).toEqual({
        reason: "provider_failed",
        retryRequestMode: "fresh",
      });
    });

    it("validates HTTP 502 response_invalid with fresh retry mode", () => {
      const parsed = parseSmsProviderRetry({
        reason: "response_invalid",
        retryRequestMode: "fresh",
      });
      expect(parsed).toEqual({
        reason: "response_invalid",
        retryRequestMode: "fresh",
      });
    });

    it("rejects non-allowlist reasons and 503 unconfirmed reason", () => {
      expect(
        parseSmsProviderRetry({
          reason: "dependency_unavailable",
          retryRequestMode: "fresh",
        })
      ).toBeUndefined();

      expect(
        parseSmsProviderRetry({
          reason: "unknown_reason",
          retryRequestMode: "fresh",
        })
      ).toBeUndefined();
    });

    it("rejects missing or non-fresh retryRequestMode", () => {
      expect(
        parseSmsProviderRetry({
          reason: "provider_failed",
        })
      ).toBeUndefined();

      expect(
        parseSmsProviderRetry({
          reason: "provider_failed",
          retryRequestMode: "replay",
        })
      ).toBeUndefined();
    });

    it("rejects invalid input types", () => {
      expect(parseSmsProviderRetry(null)).toBeUndefined();
      expect(parseSmsProviderRetry("")).toBeUndefined();
      expect(parseSmsProviderRetry(123)).toBeUndefined();
    });

    it("ensures SmsSafeguardRefusalSchema was not expanded with provider reasons", () => {
      expect(
        parseSmsSafeguardRefusal({
          reason: "provider_failed",
        })
      ).toBeUndefined();

      expect(
        parseSmsSafeguardRefusal({
          reason: "response_invalid",
        })
      ).toBeUndefined();
    });
  });

  describe("invokeParseChunk: HTTP error classification", () => {
    it("returns retryRequestMode: fresh on HTTP 502 with provider_failed", async () => {
      mockInvokeAuthenticatedEdgeFunction.mockResolvedValueOnce(
        createMockErrorResponse(502, {
          reason: "provider_failed",
          retryRequestMode: "fresh",
        })
      );

      const result = await invokeParseChunk({
        messages: [sampleMessagePayload],
        context: sampleContext,
        requestContext: {
          scanSessionId: "session-1",
          scanKind: "incremental",
        },
        requestKey: "submitted-key-1",
        transport: sampleTransport,
      });

      expect(result.hasError).toBe(true);
      expect(result.isRetryable).toBe(true);
      expect(result.failureReason).toBe("chunk_failed");
      expect(result.retryRequestMode).toBe("fresh");
    });

    it("returns retryRequestMode: fresh on HTTP 502 with response_invalid", async () => {
      mockInvokeAuthenticatedEdgeFunction.mockResolvedValueOnce(
        createMockErrorResponse(502, {
          reason: "response_invalid",
          retryRequestMode: "fresh",
        })
      );

      const result = await invokeParseChunk({
        messages: [sampleMessagePayload],
        context: sampleContext,
        requestContext: {
          scanSessionId: "session-1",
          scanKind: "incremental",
        },
        requestKey: "submitted-key-1",
        transport: sampleTransport,
      });

      expect(result.hasError).toBe(true);
      expect(result.isRetryable).toBe(true);
      expect(result.failureReason).toBe("chunk_failed");
      expect(result.retryRequestMode).toBe("fresh");
    });

    it("does NOT return fresh retryRequestMode on HTTP 503 dependency_unavailable", async () => {
      mockInvokeAuthenticatedEdgeFunction.mockResolvedValueOnce(
        createMockErrorResponse(503, {
          reason: "dependency_unavailable",
          retryRequestMode: "fresh",
        })
      );

      const result = await invokeParseChunk({
        messages: [sampleMessagePayload],
        context: sampleContext,
        requestContext: {
          scanSessionId: "session-1",
          scanKind: "incremental",
        },
        requestKey: "submitted-key-1",
        transport: sampleTransport,
      });

      expect(result.hasError).toBe(true);
      expect(result.isRetryable).toBe(true);
      expect(result.failureReason).toBe("chunk_failed");
      expect(result.retryRequestMode).toBeUndefined();
    });

    it("does NOT return fresh retryRequestMode on HTTP 502 with unallowed reason", async () => {
      mockInvokeAuthenticatedEdgeFunction.mockResolvedValueOnce(
        createMockErrorResponse(502, {
          reason: "internal_error",
          retryRequestMode: "fresh",
        })
      );

      const result = await invokeParseChunk({
        messages: [sampleMessagePayload],
        context: sampleContext,
        requestContext: {
          scanSessionId: "session-1",
          scanKind: "incremental",
        },
        requestKey: "submitted-key-1",
        transport: sampleTransport,
      });

      expect(result.hasError).toBe(true);
      expect(result.retryRequestMode).toBeUndefined();
    });

    it("does NOT return fresh retryRequestMode on HTTP 502 with malformed JSON", async () => {
      mockInvokeAuthenticatedEdgeFunction.mockResolvedValueOnce(
        createMockErrorResponse(502, "<html>Bad Gateway</html>")
      );

      const result = await invokeParseChunk({
        messages: [sampleMessagePayload],
        context: sampleContext,
        requestContext: {
          scanSessionId: "session-1",
          scanKind: "incremental",
        },
        requestKey: "submitted-key-1",
        transport: sampleTransport,
      });

      expect(result.hasError).toBe(true);
      expect(result.retryRequestMode).toBeUndefined();
    });

    it("does NOT return fresh retryRequestMode on arbitrary HTTP 500", async () => {
      mockInvokeAuthenticatedEdgeFunction.mockResolvedValueOnce(
        createMockErrorResponse(500, {
          reason: "provider_failed",
          retryRequestMode: "fresh",
        })
      );

      const result = await invokeParseChunk({
        messages: [sampleMessagePayload],
        context: sampleContext,
        requestContext: {
          scanSessionId: "session-1",
          scanKind: "incremental",
        },
        requestKey: "submitted-key-1",
        transport: sampleTransport,
      });

      expect(result.hasError).toBe(true);
      expect(result.retryRequestMode).toBeUndefined();
    });
  });

  describe("applyChunkResolution: retry key rotation", () => {
    it("rotates retry request key when chunkResult has retryRequestMode fresh", () => {
      const submittedKey = "submitted-key-initial";
      const work: ChunkWork = {
        messages: [sampleMessagePayload],
        requestKey: submittedKey,
      };
      const candidateMap = new Map([
        [sampleCandidate.message.id, sampleCandidate],
      ]);
      const candidatesByFingerprint = new Map([
        [sampleCandidate.smsFingerprint, sampleCandidate],
      ]);
      const initialRetryRequest = {
        requestKey: submittedKey,
        requestContext: {
          scanSessionId: "session-1",
          scanKind: "incremental" as const,
        },
        candidates: [sampleCandidate],
      };

      const chunkResult: ChunkAiResult = {
        transactions: [],
        hasError: true,
        isRetryable: true,
        hasUncorrelatedFailure: true,
        failureReason: "chunk_failed",
        retryRequestMode: "fresh",
      };

      const outcome = applyChunkResolution(createInitialAggregationState(1), {
        chunkResult,
        mapped: {
          transactions: [],
          resolvedMessageIds: new Set(),
          failedMessageIds: new Set(),
          hasUncorrelatedFailure: false,
        },
        work,
        candidateMap,
        candidatesByFingerprint,
        retryRequest: initialRetryRequest,
        transport: sampleTransport,
      });

      expect(outcome.unresolvedCandidates).toHaveLength(1);
      const unresolved = outcome.unresolvedCandidates[0];
      expect(unresolved.isRetryable).toBe(true);
      expect(unresolved.retryRequest).toBeDefined();
      expect(unresolved.retryRequest?.requestKey).not.toBe(submittedKey);
      expect(unresolved.retryRequest?.requestKey).toMatch(/^fresh-key-/);
    });

    it("retains submitted retry request key when retryRequestMode is absent", () => {
      const submittedKey = "submitted-key-initial";
      const work: ChunkWork = {
        messages: [sampleMessagePayload],
        requestKey: submittedKey,
      };
      const candidateMap = new Map([
        [sampleCandidate.message.id, sampleCandidate],
      ]);
      const candidatesByFingerprint = new Map([
        [sampleCandidate.smsFingerprint, sampleCandidate],
      ]);
      const initialRetryRequest = {
        requestKey: submittedKey,
        requestContext: {
          scanSessionId: "session-1",
          scanKind: "incremental" as const,
        },
        candidates: [sampleCandidate],
      };

      const chunkResult: ChunkAiResult = {
        transactions: [],
        hasError: true,
        isRetryable: true,
        hasUncorrelatedFailure: true,
        failureReason: "chunk_failed",
      };

      const outcome = applyChunkResolution(createInitialAggregationState(1), {
        chunkResult,
        mapped: {
          transactions: [],
          resolvedMessageIds: new Set(),
          failedMessageIds: new Set(),
          hasUncorrelatedFailure: false,
        },
        work,
        candidateMap,
        candidatesByFingerprint,
        retryRequest: initialRetryRequest,
        transport: sampleTransport,
      });

      expect(outcome.unresolvedCandidates).toHaveLength(1);
      const unresolved = outcome.unresolvedCandidates[0];
      expect(unresolved.retryRequest?.requestKey).toBe(submittedKey);
    });
  });

  describe("parseSmsWithAi: end-to-end regression contract", () => {
    const submittedKey = "submitted-user-key-100";

    it("rotates to a fresh requestKey on confirmed HTTP 502 provider_failed", async () => {
      mockInvokeAuthenticatedEdgeFunction.mockResolvedValueOnce(
        createMockErrorResponse(502, {
          reason: "provider_failed",
          retryRequestMode: "fresh",
        })
      );

      const result = await parseSmsWithAi(
        [sampleCandidate],
        sampleContext,
        undefined,
        undefined,
        undefined,
        undefined,
        submittedKey
      );

      expect(result.hasError).toBe(true);
      expect(result.isRetryable).toBe(true);
      expect(result.unresolvedCandidates).toHaveLength(1);
      const candidate = result.unresolvedCandidates?.[0];
      expect(candidate?.isRetryable).toBe(true);
      expect(candidate?.retryRequest).toBeDefined();
      expect(candidate?.retryRequest?.requestKey).not.toBe(submittedKey);
      expect(candidate?.retryRequest?.requestKey).toMatch(/^fresh-key-/);
    });

    it("rotates to a fresh requestKey on confirmed HTTP 502 response_invalid", async () => {
      mockInvokeAuthenticatedEdgeFunction.mockResolvedValueOnce(
        createMockErrorResponse(502, {
          reason: "response_invalid",
          retryRequestMode: "fresh",
        })
      );

      const result = await parseSmsWithAi(
        [sampleCandidate],
        sampleContext,
        undefined,
        undefined,
        undefined,
        undefined,
        submittedKey
      );

      expect(result.hasError).toBe(true);
      expect(result.isRetryable).toBe(true);
      expect(result.unresolvedCandidates).toHaveLength(1);
      const candidate = result.unresolvedCandidates?.[0];
      expect(candidate?.isRetryable).toBe(true);
      expect(candidate?.retryRequest?.requestKey).not.toBe(submittedKey);
    });

    it("retains submitted requestKey on unconfirmed HTTP 503 dependency_unavailable", async () => {
      mockInvokeAuthenticatedEdgeFunction.mockResolvedValueOnce(
        createMockErrorResponse(503, {
          reason: "dependency_unavailable",
        })
      );

      const result = await parseSmsWithAi(
        [sampleCandidate],
        sampleContext,
        undefined,
        undefined,
        undefined,
        undefined,
        submittedKey
      );

      expect(result.hasError).toBe(true);
      expect(result.isRetryable).toBe(true);
      expect(result.unresolvedCandidates).toHaveLength(1);
      const candidate = result.unresolvedCandidates?.[0];
      expect(candidate?.retryRequest?.requestKey).toBe(submittedKey);
    });

    it("retains submitted requestKey on HTTP 502 with unknown reason", async () => {
      mockInvokeAuthenticatedEdgeFunction.mockResolvedValueOnce(
        createMockErrorResponse(502, {
          reason: "unrecognized_provider_error",
          retryRequestMode: "fresh",
        })
      );

      const result = await parseSmsWithAi(
        [sampleCandidate],
        sampleContext,
        undefined,
        undefined,
        undefined,
        undefined,
        submittedKey
      );

      expect(result.hasError).toBe(true);
      expect(result.unresolvedCandidates?.[0]?.retryRequest?.requestKey).toBe(
        submittedKey
      );
    });

    it("retains submitted requestKey on HTTP 502 without explicit fresh mode", async () => {
      mockInvokeAuthenticatedEdgeFunction.mockResolvedValueOnce(
        createMockErrorResponse(502, {
          reason: "provider_failed",
        })
      );

      const result = await parseSmsWithAi(
        [sampleCandidate],
        sampleContext,
        undefined,
        undefined,
        undefined,
        undefined,
        submittedKey
      );

      expect(result.hasError).toBe(true);
      expect(result.unresolvedCandidates?.[0]?.retryRequest?.requestKey).toBe(
        submittedKey
      );
    });

    it("retains submitted requestKey on arbitrary HTTP 500 error", async () => {
      mockInvokeAuthenticatedEdgeFunction.mockResolvedValueOnce(
        createMockErrorResponse(500, {
          error: "Internal Server Error",
        })
      );

      const result = await parseSmsWithAi(
        [sampleCandidate],
        sampleContext,
        undefined,
        undefined,
        undefined,
        undefined,
        submittedKey
      );

      expect(result.hasError).toBe(true);
      expect(result.unresolvedCandidates?.[0]?.retryRequest?.requestKey).toBe(
        submittedKey
      );
    });

    it("retains submitted requestKey on malformed 502 JSON", async () => {
      mockInvokeAuthenticatedEdgeFunction.mockResolvedValueOnce(
        createMockErrorResponse(502, "Bad Gateway Nginx")
      );

      const result = await parseSmsWithAi(
        [sampleCandidate],
        sampleContext,
        undefined,
        undefined,
        undefined,
        undefined,
        submittedKey
      );

      expect(result.hasError).toBe(true);
      expect(result.unresolvedCandidates?.[0]?.retryRequest?.requestKey).toBe(
        submittedKey
      );
    });

    it("preserves abort signal cancellation without key rotation", async () => {
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        parseSmsWithAi(
          [sampleCandidate],
          sampleContext,
          undefined,
          abortController.signal,
          undefined,
          undefined,
          submittedKey
        )
      ).rejects.toThrow("SMS parse aborted");

      expect(mockInvokeAuthenticatedEdgeFunction).not.toHaveBeenCalled();
    });

    it("preserves auth guards when user scope changes", async () => {
      await expect(
        parseSmsWithAi(
          [sampleCandidate],
          sampleContext,
          undefined,
          undefined,
          "unauthorized-user",
          undefined,
          submittedKey
        )
      ).rejects.toThrow("AUTH_SCOPE_CHANGED");
    });
  });
});
