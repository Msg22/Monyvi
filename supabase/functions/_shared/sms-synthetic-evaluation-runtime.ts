import { z } from "zod";

import { buildSyntheticEvaluationCorpus } from "../sms-provider-evaluation/runtime/sms-provider-evaluation/corpus.ts";
import { computeSmsFingerprintAtEdge } from "./sms-fingerprint-at-edge.ts";
import type { ParseSmsHandlerDependencies } from "./parse-sms-handler.ts";
import { assertSmsAiAdmissionInput } from "./sms-ai-safeguard-contract.ts";
import type { SmsNegativeOutcomeReconciliation } from "./sms-negative-outcome-handler.ts";
import { reconcileSmsProviderCompletionAtEdge } from "./sms-provider-completion.ts";

const MAX_STRUCTURAL_MESSAGES = 50;
const MAX_SUPPORTED_CURRENCIES = 64;
const MAX_DATE_MS = 8_640_000_000_000_000;

const SyntheticMessageSchema = z
  .object({
    id: z.string().min(1).max(160),
    sender: z.string().min(1).max(500),
    body: z.string().min(1).max(100_000),
    date: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => Number.isFinite(Date.parse(value))),
    smsFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

const SyntheticEvaluationMetadataSchema = z
  .object({
    runId: z
      .string()
      .min(1)
      .max(96)
      .refine((value) => value.trim() === value && value.length > 0),
    anchorMs: z.number().int().min(0).max(MAX_DATE_MS),
  })
  .strict();

const SyntheticEvaluationRequestBodySchema = z
  .object({
    requestKey: z.string().min(1).max(160),
    scanSessionId: z.string().min(1).max(160),
    scanKind: z.literal("incremental"),
    scanStartedAt: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => Number.isFinite(Date.parse(value))),
    messages: z.array(SyntheticMessageSchema).min(1).max(MAX_STRUCTURAL_MESSAGES),
    categories: z.string().min(1),
    supportedCurrencies: z
      .array(z.string().min(1).max(16))
      .max(MAX_SUPPORTED_CURRENCIES),
    syntheticEvaluation: SyntheticEvaluationMetadataSchema,
  })
  .strict();

export type SyntheticEvaluationRequestBody = z.infer<
  typeof SyntheticEvaluationRequestBodySchema
>;

export type ParseSmsCompatibleBody = Omit<
  SyntheticEvaluationRequestBody,
  "syntheticEvaluation"
>;

type ReconcileInput = Parameters<
  ParseSmsHandlerDependencies["reconcileOutcomes"]
>[0];

function hasUniqueSubmittedMessages(
  body: SyntheticEvaluationRequestBody
): boolean {
  const ids = new Set(body.messages.map((message) => message.id));
  const fingerprints = new Set(
    body.messages.map((message) => message.smsFingerprint)
  );
  return (
    ids.size === body.messages.length &&
    fingerprints.size === body.messages.length
  );
}

function matchesCanonicalMessage(
  submitted: SyntheticEvaluationRequestBody["messages"][number],
  canonical: SyntheticEvaluationRequestBody["messages"][number]
): boolean {
  return (
    submitted.id === canonical.id &&
    submitted.sender === canonical.sender &&
    submitted.body === canonical.body &&
    submitted.date === canonical.date &&
    submitted.smsFingerprint === canonical.smsFingerprint
  );
}

export async function parseCanonicalSyntheticEvaluationRequest(
  value: unknown
): Promise<SyntheticEvaluationRequestBody | null> {
  const parsed = SyntheticEvaluationRequestBodySchema.safeParse(value);
  if (!parsed.success || !hasUniqueSubmittedMessages(parsed.data)) return null;

  const { runId, anchorMs } = parsed.data.syntheticEvaluation;
  if (parsed.data.scanStartedAt !== new Date(anchorMs).toISOString()) return null;

  const corpus = await buildSyntheticEvaluationCorpus(
    { runId, anchorMs },
    { computeFingerprint: computeSmsFingerprintAtEdge }
  );
  const canonicalById = new Map(
    corpus.map(({ message }) => [message.id, message])
  );
  for (const submitted of parsed.data.messages) {
    const canonical = canonicalById.get(submitted.id);
    if (canonical === undefined || !matchesCanonicalMessage(submitted, canonical)) {
      return null;
    }
  }
  return parsed.data;
}

export function toParseSmsCompatibleBody(
  body: SyntheticEvaluationRequestBody
): ParseSmsCompatibleBody {
  const { syntheticEvaluation: _metadata, ...parseSmsBody } = body;
  return parseSmsBody;
}

export function createSyntheticEvaluationLifecycle(): Pick<
  ParseSmsHandlerDependencies,
  "reserveWork" | "markProviderStarted" | "completeWork" | "releaseWork"
> {
  const requestId = crypto.randomUUID();
  return {
    reserveWork: async (input) => {
      assertSmsAiAdmissionInput(input);
      return {
        requestId,
        accepted: true,
        decisionCode: "accepted",
        availableAt: null,
        isReplay: false,
      };
    },
    markProviderStarted: async (candidateRequestId) => {
      if (candidateRequestId !== requestId) {
        throw new Error("Synthetic evaluation request identity mismatch");
      }
      return {
        started: true,
        decisionCode: "provider_started",
        terminalFingerprints: [],
        availableAt: null,
      };
    },
    completeWork: async (input) => input.requestId === requestId,
    releaseWork: async (candidateRequestId) => candidateRequestId === requestId,
  };
}

export async function reconcileSyntheticEvaluationOutcomes(
  input: ReconcileInput
): Promise<SmsNegativeOutcomeReconciliation> {
  const reconciliation = reconcileSmsProviderCompletionAtEdge({
    submittedMessageIds: input.submittedCandidates.map(
      (candidate) => candidate.messageId
    ),
    envelope: {
      requestId: input.requestId,
      completionStatus: input.completionStatus,
      transactions: input.transactions,
    },
  });
  if (!reconciliation.isValid) {
    return {
      status: "ignored",
      reason: reconciliation.reason,
      positiveFingerprints: [],
      negativeFingerprints: [],
    };
  }

  const candidatesById = new Map(
    input.submittedCandidates.map((candidate) => [candidate.messageId, candidate])
  );
  return {
    status: "reconciled",
    positiveFingerprints: reconciliation.positiveMessageIds.map(
      (messageId) => candidatesById.get(messageId)!.smsFingerprint
    ),
    negativeFingerprints: reconciliation.negativeMessageIds.map(
      (messageId) => candidatesById.get(messageId)!.smsFingerprint
    ),
  };
}
