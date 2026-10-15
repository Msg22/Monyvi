/**
 * #395 P2-04 tests-first Red — real versioned SMS transport and chunk reducer.
 * Use existing canonical source fixtures. Only I/O dependencies are isolated:
 * parseAiResponse and applyChunkResolution are NEVER mocked/reimplemented.
 * Core parser files are integrated by Root before executing this new suite.
 */
import {
  makeSmsV1Response,
} from "../../../../packages/logic/src/account-review/__tests__/fixtures";
import {
  makeTwoSmsInput,
} from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import type {
  AccountReviewSmsResponseV2,
} from "../../../../packages/logic/src/account-review/parser-schemas";
import { parseAiResponse } from "../../services/ai-sms-parser-response";
import {
  applyChunkResolution,
  createInitialAggregationState,
  type ChunkWork,
} from "../../services/ai-sms-chunk-runner-service";
import type { AiMappingResult } from "../../services/ai-sms-parser-transaction-mapping";
import type { SmsCandidate } from "../../services/ai-sms-parser-service";
import type { SmsParseTransport } from "../../services/sms-parse-transport";
import {
  invokeAuthenticatedEdgeFunction,
} from "../../services/authenticated-edge-function-service";

jest.mock("../../services/authenticated-edge-function-service", () => ({
  invokeAuthenticatedEdgeFunction: jest.fn(),
  isEdgeFunctionAuthenticationError: jest.fn((): boolean => false),
}));
jest.mock("../../services/user-data-access", () => ({
  assertExpectedCurrentUser: jest.fn(async (): Promise<void> => undefined),
}));
jest.mock("@/config/sms-safeguard-qa-config", () => ({
  getSmsSafeguardQaConfig: () => ({ enabled: false }),
}));
jest.mock("@/utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn((): string => "synthetic-transport-request-key"),
  digestStringAsync: jest.fn(async (): Promise<string> => "synthetic-digest"),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));

const RECEIVED_MS = Date.UTC(2026, 9, 14, 12, 0);
const TRANSPORT: SmsParseTransport = { functionName: "parse-sms", chunkSize: 15 };

interface TransportCase {
  readonly source: ReturnType<typeof makeTwoSmsInput>;
  readonly work: ChunkWork;
  readonly candidates: readonly SmsCandidate[];
  readonly onePositive: AccountReviewSmsResponseV2;
}

function makeTransportCase(): TransportCase {
  const source = makeTwoSmsInput();
  const first = source.providerResponse.transactions[0];
  const suggestion = source.providerResponse.suggestedAccounts[0];
  if (!first || !suggestion) {
    throw new Error("Canonical two-message source lacks a positive row");
  }
  const candidates: SmsCandidate[] = source.submittedMessages.map((sms) => ({
    message: {
      id: sms.id, address: sms.sender, body: sms.body,
      date: RECEIVED_MS, read: false,
    },
    smsFingerprint: sms.smsFingerprint,
  }));
  const work: ChunkWork = {
    requestKey: "synthetic-one-original-chunk",
    messages: source.submittedMessages.map((sms) => ({
      id: sms.id, sender: sms.sender, body: sms.body,
      date: new Date(RECEIVED_MS).toISOString(),
      smsFingerprint: sms.smsFingerprint,
    })),
  };
  return {
    source, candidates, work,
    onePositive: {
      ...source.providerResponse,
      transactions: [first],
      suggestedAccounts: [{
        ...suggestion, transactionRefs: [first.transactionRef],
      }],
    },
  };
}

/** Strip only server-owned fields from the canonical fixture, not financial proof. */
function modelOnly(
  response: AccountReviewSmsResponseV2
): Pick<AccountReviewSmsResponseV2,
  "reviewContractVersion" | "transactions" | "suggestedAccounts"> {
  return {
    reviewContractVersion: response.reviewContractVersion,
    transactions: response.transactions,
    suggestedAccounts: response.suggestedAccounts,
  };
}

function parseAndReduce(input: TransportCase, response: unknown): {
  readonly parsed: ReturnType<typeof parseAiResponse>;
  readonly state: ReturnType<typeof applyChunkResolution>;
} {
  const parsed = parseAiResponse(
    response,
    new Set(input.work.messages.map((sms) => sms.smsFingerprint)),
    input.work.messages
  );
  const firstSms = input.work.messages[0];
  const mapped = input.source.mappedTransactions[0];
  if (!firstSms || !mapped) throw new Error("Missing original financial fixture");
  const mapping: AiMappingResult = {
    transactions: [mapped],
    resolvedMessageIds: new Set([firstSms.id]),
    failedMessageIds: new Set<string>(),
    hasUncorrelatedFailure: false,
  };
  const byId = new Map<string, SmsCandidate>();
  const byFingerprint = new Map<string, SmsCandidate>();
  for (const candidate of input.candidates) {
    byId.set(candidate.message.id, candidate);
    byFingerprint.set(candidate.smsFingerprint, candidate);
  }
  const state = applyChunkResolution(createInitialAggregationState(1), {
    chunkResult: parsed, mapped: mapping, work: input.work,
    candidateMap: byId, candidatesByFingerprint: byFingerprint,
    retryRequest: {
      requestKey: input.work.requestKey,
      requestContext: {
        scanSessionId: "synthetic-opaque-scan",
        scanKind: "incremental",
        scanStartedAtMs: RECEIVED_MS,
      },
      candidates: input.candidates,
    },
    transport: TRANSPORT,
  });
  return { parsed, state };
}

function expectRecoverableMissingMetadata(wire: unknown): void {
  const fixture = makeTransportCase();
  const { parsed, state } = parseAndReduce(fixture, wire);
  const first = fixture.source.submittedMessages[0];
  const second = fixture.source.submittedMessages[1];
  if (!first || !second) throw new Error("Expected two admitted originals");

  expect(parsed.transactions).toHaveLength(1);
  expect(parsed.reviewV2FinancialRows).toHaveLength(1);
  expect(parsed.reviewV2FinancialRows?.[0]?.messageId).toBe(first.id);
  expect(parsed.reviewV2FinancialRows?.[0]?.amount).toBe(50);
  expect(parsed.hasError).toBe(true);
  expect(parsed.isRetryable).toBe(true);
  expect(parsed.durableNegativeFingerprints ?? []).toEqual([]);
  expect(parsed.terminalFingerprints ?? []).toEqual([]);

  expect(state.transactions).toEqual([fixture.source.mappedTransactions[0]]);
  expect(state.reviewChunks).toHaveLength(1);
  expect(state.reviewChunks?.[0]?.submittedMessages.map((sms) => sms.id)).toEqual([first.id]);
  expect(state.unresolvedCandidates).toHaveLength(1);
  expect(state.unresolvedCandidates[0]?.candidate.message.id).toBe(second.id);
  expect(state.unresolvedCandidates[0]?.candidate.smsFingerprint).toBe(second.smsFingerprint);
  expect(state.unresolvedCandidates[0]?.reason).toBe("response_invalid");
  expect(state.unresolvedCandidates[0]?.isRetryable).toBe(true);
  expect(state.durableNegativeFingerprints.size).toBe(0);
  expect(state.terminalFingerprints.size).toBe(0);
  expect(invokeAuthenticatedEdgeFunction).not.toHaveBeenCalled();
}

describe("#395 P2-04 — tagged-v2 server completion metadata, two original messages", () => {
  beforeEach((): void => { jest.clearAllMocks(); });

  it("RED: entirely absent server metadata preserves one positive, retries second", (): void => {
    const fixture = makeTransportCase();
    expectRecoverableMissingMetadata(modelOnly(fixture.onePositive));
  });

  it("partial metadata with only completionStatus is not accepted as complete", (): void => {
    const fixture = makeTransportCase();
    expectRecoverableMissingMetadata({
      ...modelOnly(fixture.onePositive), completionStatus: "complete",
    });
  });

  it("partial metadata with only fingerprint arrays is not accepted as complete", (): void => {
    const fixture = makeTransportCase();
    expectRecoverableMissingMetadata({
      ...modelOnly(fixture.onePositive),
      negativeFingerprints: [], terminalFingerprints: [], unresolvedFingerprints: [],
    });
  });

  it("complete server metadata distinguishes a durable negative from unresolved", (): void => {
    const fixture = makeTransportCase();
    const missing = fixture.source.submittedMessages[1];
    if (!missing) throw new Error("Missing second original source");
    const response: AccountReviewSmsResponseV2 = {
      ...fixture.onePositive,
      completionStatus: "complete",
      negativeFingerprints: [missing.smsFingerprint],
      terminalFingerprints: [],
      unresolvedFingerprints: [],
    };
    const { parsed, state } = parseAndReduce(fixture, response);
    expect(parsed.hasError).toBe(false);
    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.durableNegativeFingerprints).toEqual([missing.smsFingerprint]);
    expect(state.unresolvedCandidates).toHaveLength(0);
    expect([...state.durableNegativeFingerprints]).toEqual([missing.smsFingerprint]);
    expect(invokeAuthenticatedEdgeFunction).not.toHaveBeenCalled();
  });

  it("legacy v1 without ANY completion metadata preserves original behavior", (): void => {
    const fixture = makeTransportCase();
    const originalV1 = makeSmsV1Response();
    const response = { transactions: originalV1.transactions };
    const { parsed, state } = parseAndReduce(fixture, response);
    expect(parsed.hasError).toBe(false);
    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.reviewV2FinancialRows).toBeUndefined();
    expect(state.unresolvedCandidates).toHaveLength(0);
    expect(state.durableNegativeFingerprints.size).toBe(0);
    expect(invokeAuthenticatedEdgeFunction).not.toHaveBeenCalled();
  });
});
