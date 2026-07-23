import { z } from "zod";

import { logger } from "@/utils/logger";
import { MAX_TRANSACTION_AMOUNT, normalizeCurrency } from "@monyvi/logic";

import type {
  AiUnresolvedCandidate,
  SmsAiAvailability,
  SmsAiAvailabilityReason,
} from "./ai-sms-parser-service";

const AiCurrencySchema = z.string().transform((value, context) => {
  try {
    return normalizeCurrency(value);
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unsupported currency",
    });
    return z.NEVER;
  }
});

const AiSmsTransactionSchema = z.object({
  messageId: z.string(),
  amount: z.number().finite().positive().max(MAX_TRANSACTION_AMOUNT),
  currency: AiCurrencySchema,
  type: z.enum(["EXPENSE", "INCOME"]),
  counterparty: z.string(),
  date: z.string(),
  categorySystemName: z.string(),
  isAtmWithdrawal: z.boolean().optional().default(false),
  cardLast4: z.string().optional(),
  confidenceScore: z.number(),
  isTrusted: z.boolean(),
});

const SmsSafeguardResponseSchema = z.object({
  completionStatus: z.enum([
    "complete",
    "truncated",
    "safety_stopped",
    "failed",
  ]),
  negativeFingerprints: z.array(z.string().min(1)),
  terminalFingerprints: z.array(z.string().min(1)),
  unresolvedFingerprints: z.array(z.string().min(1)),
  retryRequestMode: z.enum(["fresh"]).optional(),
});

const SmsSafeguardRefusalSchema = z.object({
  reason: z.enum([
    "scan_limit",
    "rolling_limit",
    "burst_limit",
    "history_cooldown",
    "already_processed_result_unavailable",
    "payload_limit",
    "input_token_limit",
  ]),
  availableAt: z.string().datetime({ offset: true }).nullable().optional(),
  sizeScope: z.enum(["batch", "candidate", "shared_request"]).optional(),
});

export type AiSmsTransaction = z.infer<typeof AiSmsTransactionSchema>;

export interface ChunkAiResult {
  readonly transactions: readonly AiSmsTransaction[];
  readonly hasError: boolean;
  readonly isRetryable?: boolean;
  readonly invalidMessageIds?: readonly string[];
  readonly hasUncorrelatedFailure?: boolean;
  readonly failureReason?: AiUnresolvedCandidate["reason"];
  readonly durableNegativeFingerprints?: readonly string[];
  readonly terminalFingerprints?: readonly string[];
  readonly unresolvedFingerprints?: readonly string[];
  readonly retryRequestMode?: "fresh";
  readonly oversizedFingerprints?: readonly string[];
  readonly shouldSplitForSize?: boolean;
  readonly availability?: SmsAiAvailability;
}

export interface SmsSafeguardRefusal {
  readonly reason: z.infer<typeof SmsSafeguardRefusalSchema>["reason"];
  readonly availableAt?: string | null;
  readonly sizeScope?: "batch" | "candidate" | "shared_request";
}

export function parseSmsSafeguardRefusal(
  value: unknown
): SmsSafeguardRefusal | undefined {
  const parsed = SmsSafeguardRefusalSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function isCapacityRefusalReason(
  reason: SmsSafeguardRefusal["reason"]
): reason is SmsAiAvailabilityReason {
  return !["payload_limit", "input_token_limit"].includes(reason);
}

export function isRetryableAiFailure(status: number | undefined): boolean {
  if (status === undefined) {
    return true;
  }
  return status === 408 || status === 429 || status >= 500;
}

export function parseAiResponse(
  data: unknown,
  submittedFingerprints: ReadonlySet<string>
): ChunkAiResult {
  const errorResult: ChunkAiResult = {
    transactions: [],
    hasError: true,
    isRetryable: true,
    hasUncorrelatedFailure: true,
    failureReason: "response_invalid",
  };
  if (typeof data !== "object" || data === null) {
    logger.warn("[ai-sms-parser] parseAiResponse: data is not an object", {
      dataType: typeof data,
    });
    return errorResult;
  }

  const response = data as Record<string, unknown>;
  if (!Array.isArray(response.transactions)) {
    logger.warn("[ai-sms-parser] parseAiResponse: invalid response envelope", {
      reasonCode: "transactions_array_missing",
    });
    return errorResult;
  }

  const transactions: AiSmsTransaction[] = [];
  const invalidMessageIds = new Set<string>();
  let hasUncorrelatedFailure = false;
  let invalidCount = 0;
  for (const rawTransaction of response.transactions) {
    const parsed = AiSmsTransactionSchema.safeParse(rawTransaction);
    if (parsed.success) {
      transactions.push(parsed.data);
      continue;
    }
    invalidCount++;
    const invalidMessageId = getInvalidMessageId(rawTransaction);
    if (invalidMessageId.length > 0) {
      invalidMessageIds.add(invalidMessageId);
    } else {
      hasUncorrelatedFailure = true;
    }
    logger.warn("[ai-sms-parser] Skipping malformed transaction entry", {
      issueCount: parsed.error.issues.length,
      issuePaths: parsed.error.issues
        .map((issue) => issue.path.join("."))
        .slice(0, 5),
      issueCodes: Array.from(
        new Set(parsed.error.issues.map((issue) => issue.code))
      ),
    });
  }
  if (invalidCount > 0) {
    logger.warn("[ai-sms-parser] parseAiResponse: validation failures", {
      invalidCount,
      total: response.transactions.length,
    });
  }

  const metadata = parseSafeguardMetadata(response, submittedFingerprints);
  const hasResponseError = invalidCount > 0 || metadata.isInvalid;
  return {
    transactions,
    hasError: hasResponseError || metadata.unresolvedFingerprints.length > 0,
    isRetryable:
      hasResponseError || metadata.unresolvedFingerprints.length > 0
        ? true
        : undefined,
    invalidMessageIds: [...invalidMessageIds],
    hasUncorrelatedFailure: hasUncorrelatedFailure || metadata.isInvalid,
    failureReason: hasResponseError ? "response_invalid" : undefined,
    durableNegativeFingerprints: metadata.durableNegativeFingerprints,
    terminalFingerprints: metadata.terminalFingerprints,
    unresolvedFingerprints: metadata.unresolvedFingerprints,
    retryRequestMode: metadata.retryRequestMode,
  };
}

function getInvalidMessageId(value: unknown): string {
  if (typeof value !== "object" || value === null) return "";
  const messageId = (value as Record<string, unknown>).messageId;
  return typeof messageId === "string" ? messageId.trim() : "";
}

interface SafeguardMetadata {
  readonly durableNegativeFingerprints: readonly string[];
  readonly terminalFingerprints: readonly string[];
  readonly unresolvedFingerprints: readonly string[];
  readonly retryRequestMode?: "fresh";
  readonly isInvalid: boolean;
}

function parseSafeguardMetadata(
  response: Record<string, unknown>,
  submittedFingerprints: ReadonlySet<string>
): SafeguardMetadata {
  const hasMetadata = [
    "completionStatus",
    "negativeFingerprints",
    "terminalFingerprints",
    "unresolvedFingerprints",
  ].some((field) => field in response);
  if (!hasMetadata) return createEmptySafeguardMetadata(false);

  const parsed = SmsSafeguardResponseSchema.safeParse(response);
  if (!parsed.success) {
    logInvalidSafeguardMetadata();
    return createEmptySafeguardMetadata(true);
  }
  const fingerprints = [
    ...parsed.data.negativeFingerprints,
    ...parsed.data.terminalFingerprints,
    ...parsed.data.unresolvedFingerprints,
  ];
  const isInvalid =
    new Set(fingerprints).size !== fingerprints.length ||
    fingerprints.some((fingerprint) => !submittedFingerprints.has(fingerprint));
  if (isInvalid) {
    logInvalidSafeguardMetadata();
    return createEmptySafeguardMetadata(true);
  }
  return {
    durableNegativeFingerprints: parsed.data.negativeFingerprints,
    terminalFingerprints: parsed.data.terminalFingerprints,
    unresolvedFingerprints: parsed.data.unresolvedFingerprints,
    retryRequestMode: parsed.data.retryRequestMode,
    isInvalid: false,
  };
}

function createEmptySafeguardMetadata(isInvalid: boolean): SafeguardMetadata {
  return {
    durableNegativeFingerprints: [],
    terminalFingerprints: [],
    unresolvedFingerprints: [],
    isInvalid,
  };
}

function logInvalidSafeguardMetadata(): void {
  logger.warn("[ai-sms-parser] parseAiResponse: invalid safeguard metadata", {
    reasonCode: "safeguard_metadata_invalid",
  });
}
