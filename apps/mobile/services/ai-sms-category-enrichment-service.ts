import { z } from "zod";
import * as Crypto from "expo-crypto";
import {
  isSmsEnrichmentCategorySystemName,
  type CategoryTreeSource,
  type TrustedSmsEligibleFamily,
} from "@monyvi/logic";
import { logger } from "@/utils/logger";
import { isE2eTestMode } from "@/config/e2e-test-config";
import { getSmsSafeguardQaConfig } from "@/config/sms-safeguard-qa-config";
import { assertNotAborted } from "./abort-utils";
import { invokeAuthenticatedEdgeFunction } from "./authenticated-edge-function-service";
import {
  createSmsAiRequestKey,
  scopeSmsAiRequestKey,
} from "./sms-parse-transport";
import { assertExpectedCurrentUser } from "./user-data-access";

const CATEGORY_ENRICHMENT_FUNCTION = "enrich-sms-categories";
const AI_CONSENT_REQUIRED_STATUS = 403;
const CATEGORY_ENRICHMENT_CHUNK_SIZE = 20;
const CATEGORY_ENRICHMENT_MAX_CONCURRENCY = 2;
const CATEGORY_ENRICHMENT_TIMEOUT_MS = 20000;
const NON_INFORMATIVE_CATEGORY_SYSTEM_NAMES: ReadonlySet<string> = new Set([
  "other",
  "uncategorized",
]);

export const MIN_ACCEPTED_CATEGORY_CONFIDENCE = 0.5;
export const MIN_AUTO_SELECT_CATEGORY_CONFIDENCE = 0.8;
export const TRUSTED_ENRICHED_PURCHASE_CONFIDENCE = 0.98;

export interface TrustedSmsCategoryCandidate {
  readonly candidateId: string;
  readonly merchant: string;
  readonly transactionType: "EXPENSE" | "INCOME";
  readonly messageFamily: TrustedSmsEligibleFamily;
}

export interface TrustedSmsCategoryOutcome {
  readonly categorySystemName: string;
  readonly confidence: number;
}

export type SmsCategoryEnrichmentScanKind =
  | "initial"
  | "incremental"
  | "history"
  | "live";

export interface SmsCategoryEnrichmentRequestContext {
  readonly requestKey?: string;
  readonly scanSessionId: string;
  readonly scanKind: SmsCategoryEnrichmentScanKind;
}

export type SmsCategoryEnrichmentRefusalReason =
  | "unauthenticated"
  | "consent_required"
  | "malformed_request"
  | "capability_disabled"
  | "dependency_unavailable"
  | "provider_failed"
  | "scan_limit"
  | "rolling_limit"
  | "burst_limit"
  | "history_cooldown"
  | "already_processed_result_unavailable"
  | "unknown";

export type SmsCategoryEnrichmentAvailabilityReason =
  | "scan_limit"
  | "rolling_limit"
  | "burst_limit"
  | "history_cooldown"
  | "already_processed_result_unavailable";

export interface SmsCategoryEnrichmentAvailability {
  readonly reason: SmsCategoryEnrichmentAvailabilityReason;
  readonly availableAt: string | null;
}

export interface TrustedSmsCategoryEnrichmentResult {
  readonly outcomesByCandidateId: ReadonlyMap<
    string,
    TrustedSmsCategoryOutcome
  >;
  readonly attemptedMerchantCount: number;
  readonly acceptedCandidateCount: number;
  readonly rejectedResultCount: number;
  readonly missingResultCount: number;
  readonly hasError: boolean;
  readonly isConsentRequired?: boolean;
  readonly isTimedOut?: boolean;
  readonly isRetryable?: boolean;
  readonly refusalReason?: SmsCategoryEnrichmentRefusalReason;
  readonly availability?: SmsCategoryEnrichmentAvailability;
}

interface CategoryRequestMerchant {
  readonly id: string;
  readonly merchant: string;
  readonly transactionType: "EXPENSE";
  readonly messageFamily: "card_purchase";
}

interface CategoryEnrichmentRequest {
  readonly merchants: readonly CategoryRequestMerchant[];
}

interface PreparedCategoryRequest {
  readonly body: CategoryEnrichmentRequest;
  readonly candidateIdsByMerchantId: ReadonlyMap<string, readonly string[]>;
  readonly allowedCategorySystemNames: readonly string[];
}

interface CategoryChunkRequest extends PreparedCategoryRequest {
  readonly requestKey: string;
}

const CategoryResponseItemSchema = z
  .object({
    merchantId: z.string().regex(/^merchant-[1-9]\d*$/),
    categorySystemName: z.string().trim().min(1),
    confidence: z.number().finite().min(0).max(1),
  })
  .strict();

const CategoryResponseEnvelopeSchema = z
  .object({ categories: z.array(z.unknown()) })
  .strict();

const CategoryRefusalEnvelopeSchema = z
  .object({
    categories: z.array(z.unknown()),
    reason: z.string().trim().min(1),
    availableAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

const CATEGORY_AVAILABILITY_REASONS: ReadonlySet<string> = new Set([
  "scan_limit",
  "rolling_limit",
  "burst_limit",
  "history_cooldown",
  "already_processed_result_unavailable",
]);

const CATEGORY_REFUSAL_REASONS: ReadonlySet<string> = new Set([
  "unauthenticated",
  "consent_required",
  "malformed_request",
  "capability_disabled",
  "dependency_unavailable",
  "provider_failed",
  "scan_limit",
  "rolling_limit",
  "burst_limit",
  "history_cooldown",
  "already_processed_result_unavailable",
]);

function emptyResult(
  attemptedMerchantCount = 0,
  hasError = false,
  flags: Pick<
    TrustedSmsCategoryEnrichmentResult,
    | "isConsentRequired"
    | "isTimedOut"
    | "isRetryable"
    | "refusalReason"
    | "availability"
  > = {}
): TrustedSmsCategoryEnrichmentResult {
  return {
    outcomesByCandidateId: new Map(),
    attemptedMerchantCount,
    acceptedCandidateCount: 0,
    rejectedResultCount: 0,
    missingResultCount: attemptedMerchantCount,
    hasError,
    ...flags,
  };
}

function normalizeMerchantKey(merchant: string): string {
  return merchant.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function getAllowedCategorySystemNames(
  categories: readonly CategoryTreeSource[]
): readonly string[] {
  const names = new Set<string>();
  for (const category of categories) {
    if (
      category.isSystem === true &&
      category.type === "EXPENSE" &&
      category.isHidden !== true &&
      category.isInternal !== true &&
      category.deleted !== true &&
      !NON_INFORMATIVE_CATEGORY_SYSTEM_NAMES.has(category.systemName) &&
      isSmsEnrichmentCategorySystemName(category.systemName) &&
      category.systemName.trim().length > 0
    ) {
      names.add(category.systemName);
    }
  }
  return [...names];
}

function prepareCategoryRequest(
  candidates: readonly TrustedSmsCategoryCandidate[],
  categories: readonly CategoryTreeSource[]
): PreparedCategoryRequest {
  const merchants: CategoryRequestMerchant[] = [];
  const merchantIdByKey = new Map<string, string>();
  const candidateIdsByMerchantId = new Map<string, string[]>();

  for (const candidate of candidates) {
    const merchant = candidate.merchant;
    if (
      candidate.messageFamily !== "card_purchase" ||
      candidate.transactionType !== "EXPENSE" ||
      merchant.trim().length === 0
    ) {
      continue;
    }

    const merchantKey = normalizeMerchantKey(merchant);
    let merchantId = merchantIdByKey.get(merchantKey);
    if (merchantId === undefined) {
      merchantId = `merchant-${merchants.length + 1}`;
      merchantIdByKey.set(merchantKey, merchantId);
      merchants.push({
        id: merchantId,
        merchant,
        transactionType: "EXPENSE",
        messageFamily: "card_purchase",
      });
      candidateIdsByMerchantId.set(merchantId, []);
    }
    candidateIdsByMerchantId.get(merchantId)?.push(candidate.candidateId);
  }

  return {
    body: {
      merchants,
    },
    candidateIdsByMerchantId,
    allowedCategorySystemNames: getAllowedCategorySystemNames(categories),
  };
}

function mapCategoryResponse(
  data: unknown,
  prepared: PreparedCategoryRequest
): TrustedSmsCategoryEnrichmentResult {
  const envelope = CategoryResponseEnvelopeSchema.safeParse(data);
  if (!envelope.success) {
    logger.warn("smsCategoryEnrichment.responseInvalid", {
      issueCount: envelope.error.issues.length,
    });
    return emptyResult(prepared.body.merchants.length, true);
  }

  const parsedItems = envelope.data.categories.map((item) =>
    CategoryResponseItemSchema.safeParse(item)
  );
  const responseIdCounts = new Map<string, number>();
  for (const rawItem of envelope.data.categories) {
    if (
      typeof rawItem !== "object" ||
      rawItem === null ||
      !("merchantId" in rawItem) ||
      typeof rawItem.merchantId !== "string"
    ) {
      continue;
    }
    responseIdCounts.set(
      rawItem.merchantId,
      (responseIdCounts.get(rawItem.merchantId) ?? 0) + 1
    );
  }

  const allowedCategories = new Set(prepared.allowedCategorySystemNames);
  const outcomesByCandidateId = new Map<string, TrustedSmsCategoryOutcome>();
  const resolvedMerchantIds = new Set<string>();
  let rejectedResultCount = 0;

  for (const item of parsedItems) {
    if (!item.success) {
      rejectedResultCount += 1;
      continue;
    }
    const value = item.data;
    const candidateIds = prepared.candidateIdsByMerchantId.get(
      value.merchantId
    );
    if (
      candidateIds === undefined ||
      responseIdCounts.get(value.merchantId) !== 1 ||
      !allowedCategories.has(value.categorySystemName) ||
      value.confidence < MIN_ACCEPTED_CATEGORY_CONFIDENCE
    ) {
      rejectedResultCount += 1;
      continue;
    }

    resolvedMerchantIds.add(value.merchantId);
    for (const candidateId of candidateIds) {
      outcomesByCandidateId.set(candidateId, {
        categorySystemName: value.categorySystemName,
        confidence: value.confidence,
      });
    }
  }

  return {
    outcomesByCandidateId,
    attemptedMerchantCount: prepared.body.merchants.length,
    acceptedCandidateCount: outcomesByCandidateId.size,
    rejectedResultCount,
    missingResultCount:
      prepared.body.merchants.length - resolvedMerchantIds.size,
    hasError: false,
  };
}

function getHttpStatus(error: unknown): number | undefined {
  const context = (error as { readonly context?: unknown })?.context;
  return context instanceof Response ? context.status : undefined;
}

interface CategoryRefusalMetadata {
  readonly reason: SmsCategoryEnrichmentRefusalReason;
  readonly availableAt: string | null;
  readonly availabilityReason?: SmsCategoryEnrichmentAvailabilityReason;
  readonly bodyLength: number;
}

async function getRefusalMetadata(
  error: unknown
): Promise<CategoryRefusalMetadata | undefined> {
  const context = (error as { readonly context?: unknown })?.context;
  if (!(context instanceof Response)) return undefined;

  let responseText: string;
  try {
    responseText = await context.clone().text();
  } catch {
    return undefined;
  }

  let parsedBody: z.infer<typeof CategoryRefusalEnvelopeSchema>;
  try {
    const parsed = CategoryRefusalEnvelopeSchema.safeParse(
      JSON.parse(responseText)
    );
    if (!parsed.success) return undefined;
    parsedBody = parsed.data;
  } catch {
    return undefined;
  }

  const reason: SmsCategoryEnrichmentRefusalReason =
    CATEGORY_REFUSAL_REASONS.has(parsedBody.reason)
      ? (parsedBody.reason as SmsCategoryEnrichmentRefusalReason)
      : "unknown";
  const availabilityReason = CATEGORY_AVAILABILITY_REASONS.has(
    parsedBody.reason
  )
    ? (parsedBody.reason as SmsCategoryEnrichmentAvailabilityReason)
    : undefined;
  return {
    reason,
    availableAt: parsedBody.availableAt,
    availabilityReason,
    bodyLength: responseText.length,
  };
}

function splitPreparedRequest(
  prepared: PreparedCategoryRequest,
  requestKey: string
): readonly CategoryChunkRequest[] {
  const chunks: CategoryChunkRequest[] = [];
  let chunkNumber = 0;
  for (
    let start = 0;
    start < prepared.body.merchants.length;
    start += CATEGORY_ENRICHMENT_CHUNK_SIZE
  ) {
    const merchants = prepared.body.merchants.slice(
      start,
      start + CATEGORY_ENRICHMENT_CHUNK_SIZE
    );
    chunkNumber += 1;
    chunks.push({
      requestKey:
        chunkNumber === 1 ? requestKey : `${requestKey}:${chunkNumber}`,
      body: {
        merchants,
      },
      candidateIdsByMerchantId: new Map(
        merchants.map((merchant) => [
          merchant.id,
          prepared.candidateIdsByMerchantId.get(merchant.id) ?? [],
        ])
      ),
      allowedCategorySystemNames: prepared.allowedCategorySystemNames,
    });
  }
  return chunks;
}

interface TimedRequestSignal {
  readonly signal: AbortSignal;
  readonly deadline: Promise<never>;
  readonly didTimeOut: () => boolean;
  readonly cleanup: () => void;
}

function createTimedRequestSignal(
  externalSignal?: AbortSignal
): TimedRequestSignal {
  const controller = new AbortController();
  let timedOut = false;
  const handleExternalAbort = (): void => controller.abort();
  externalSignal?.addEventListener("abort", handleExternalAbort, {
    once: true,
  });
  const deadline = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => {
        const error = new Error(
          timedOut
            ? "SMS category enrichment timed out"
            : "SMS category enrichment aborted"
        );
        error.name = timedOut ? "TimeoutError" : "AbortError";
        reject(error);
      },
      { once: true }
    );
  });
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CATEGORY_ENRICHMENT_TIMEOUT_MS);

  return {
    signal: controller.signal,
    deadline,
    didTimeOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", handleExternalAbort);
    },
  };
}

async function invokeCategoryChunk(
  prepared: CategoryChunkRequest,
  timedSignal: TimedRequestSignal,
  requestContext: SmsCategoryEnrichmentRequestContext,
  abortSignal?: AbortSignal,
  expectedUserId?: string
): Promise<TrustedSmsCategoryEnrichmentResult> {
  const attemptedMerchantCount = prepared.body.merchants.length;
  let isCheckingUserScope = false;
  try {
    if (expectedUserId !== undefined) {
      isCheckingUserScope = true;
      await Promise.race([
        assertExpectedCurrentUser(expectedUserId),
        timedSignal.deadline,
      ]);
      isCheckingUserScope = false;
    }
    if (timedSignal.signal.aborted) {
      assertNotAborted(abortSignal, "SMS category enrichment aborted");
      return emptyResult(attemptedMerchantCount, true, { isTimedOut: true });
    }
    const qaConfig = getSmsSafeguardQaConfig();
    const functionName = qaConfig.enabled
      ? "sms-safeguard-qa"
      : CATEGORY_ENRICHMENT_FUNCTION;
    const response = await Promise.race([
      invokeAuthenticatedEdgeFunction(
        functionName,
        {
          body: {
            requestKey: prepared.requestKey,
            scanSessionId: requestContext.scanSessionId,
            scanKind: requestContext.scanKind,
            ...prepared.body,
            ...(qaConfig.enabled
              ? {
                  qaCapability: "category_enrichment",
                  qaProfileId: qaConfig.profileId,
                  qaRunId: qaConfig.runId,
                }
              : {}),
          },
          ...(qaConfig.enabled
            ? {
                headers: {
                  "x-sms-safeguard-qa-run-id": qaConfig.runId ?? "",
                },
              }
            : {}),
          signal: timedSignal.signal,
        },
        expectedUserId === undefined
          ? undefined
          : {
              beforeRetry: () => assertExpectedCurrentUser(expectedUserId),
            }
      ),
      timedSignal.deadline,
    ]);
    assertNotAborted(abortSignal, "SMS category enrichment aborted");

    if (response.error) {
      const status = getHttpStatus(response.error);
      const refusal = await getRefusalMetadata(response.error);
      if (status === AI_CONSENT_REQUIRED_STATUS) {
        return emptyResult(attemptedMerchantCount, true, {
          isConsentRequired: true,
          isRetryable: false,
          refusalReason: refusal?.reason ?? "consent_required",
        });
      }
      logger.warn("smsCategoryEnrichment.requestFailed", {
        attemptedMerchantCount,
        status,
        bodyLength: refusal?.bodyLength,
        reason: refusal?.reason,
      });
      return emptyResult(attemptedMerchantCount, true, {
        isRetryable: false,
        refusalReason: refusal?.reason,
        availability:
          refusal?.availabilityReason === undefined
            ? undefined
            : {
                reason: refusal.availabilityReason,
                availableAt: refusal.availableAt,
              },
      });
    }

    return mapCategoryResponse(response.data, prepared);
  } catch (error: unknown) {
    assertNotAborted(abortSignal, "SMS category enrichment aborted");
    if (isCheckingUserScope && !timedSignal.didTimeOut()) throw error;
    if (timedSignal.didTimeOut()) {
      logger.warn("smsCategoryEnrichment.requestTimedOut", {
        attemptedMerchantCount,
      });
      return emptyResult(attemptedMerchantCount, true, { isTimedOut: true });
    }
    logger.warn("smsCategoryEnrichment.requestFailed", {
      attemptedMerchantCount,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return emptyResult(attemptedMerchantCount, true);
  }
}

function mergeCategoryResults(
  results: readonly TrustedSmsCategoryEnrichmentResult[]
): TrustedSmsCategoryEnrichmentResult {
  const outcomesByCandidateId = new Map<string, TrustedSmsCategoryOutcome>();
  let attemptedMerchantCount = 0;
  let rejectedResultCount = 0;
  let missingResultCount = 0;
  let hasError = false;
  let isConsentRequired = false;
  let isTimedOut = false;
  let isRetryable: boolean | undefined;
  let refusalReason: SmsCategoryEnrichmentRefusalReason | undefined;
  let availability: SmsCategoryEnrichmentAvailability | undefined;

  for (const result of results) {
    for (const [candidateId, outcome] of result.outcomesByCandidateId) {
      outcomesByCandidateId.set(candidateId, outcome);
    }
    attemptedMerchantCount += result.attemptedMerchantCount;
    rejectedResultCount += result.rejectedResultCount;
    missingResultCount += result.missingResultCount;
    hasError ||= result.hasError;
    isConsentRequired ||= result.isConsentRequired === true;
    isTimedOut ||= result.isTimedOut === true;
    if (result.isRetryable === false) isRetryable = false;
    else if (result.isRetryable === true && isRetryable === undefined)
      isRetryable = true;
    refusalReason ??= result.refusalReason;
    if (result.availability !== undefined) {
      const currentAvailableAt = availability?.availableAt
        ? Date.parse(availability.availableAt)
        : Number.NEGATIVE_INFINITY;
      const nextAvailableAt = result.availability.availableAt
        ? Date.parse(result.availability.availableAt)
        : Number.NEGATIVE_INFINITY;
      if (availability === undefined || nextAvailableAt > currentAvailableAt) {
        availability = result.availability;
      }
    }
  }

  return {
    outcomesByCandidateId,
    attemptedMerchantCount,
    acceptedCandidateCount: outcomesByCandidateId.size,
    rejectedResultCount,
    missingResultCount,
    hasError,
    isConsentRequired,
    isTimedOut,
    isRetryable,
    refusalReason,
    availability,
  };
}

async function invokeCategoryChunks(
  chunks: readonly CategoryChunkRequest[],
  timedSignal: TimedRequestSignal,
  requestContext: SmsCategoryEnrichmentRequestContext,
  abortSignal?: AbortSignal,
  expectedUserId?: string
): Promise<readonly TrustedSmsCategoryEnrichmentResult[]> {
  let results: readonly TrustedSmsCategoryEnrichmentResult[] = [];
  for (
    let start = 0;
    start < chunks.length;
    start += CATEGORY_ENRICHMENT_MAX_CONCURRENCY
  ) {
    assertNotAborted(abortSignal, "SMS category enrichment aborted");
    if (timedSignal.didTimeOut()) {
      results = [...results, emptyResult(0, true, { isTimedOut: true })];
      break;
    }
    const wave = chunks.slice(
      start,
      start + CATEGORY_ENRICHMENT_MAX_CONCURRENCY
    );
    const waveResults = await Promise.all(
      wave.map((chunk) =>
        invokeCategoryChunk(
          chunk,
          timedSignal,
          requestContext,
          abortSignal,
          expectedUserId
        )
      )
    );
    results = [...results, ...waveResults];
    if (
      waveResults.some(
        (result) =>
          result.isConsentRequired === true ||
          result.isTimedOut === true ||
          result.availability !== undefined
      )
    ) {
      break;
    }
  }
  return results;
}

export async function enrichTrustedSmsCategories(
  candidates: readonly TrustedSmsCategoryCandidate[],
  categories: readonly CategoryTreeSource[],
  abortSignal?: AbortSignal,
  expectedUserId?: string,
  requestContext?: SmsCategoryEnrichmentRequestContext
): Promise<TrustedSmsCategoryEnrichmentResult> {
  assertNotAborted(abortSignal, "SMS category enrichment aborted");
  const prepared = prepareCategoryRequest(candidates, categories);
  const attemptedMerchantCount = prepared.body.merchants.length;
  if (
    attemptedMerchantCount === 0 ||
    prepared.allowedCategorySystemNames.length === 0
  ) {
    return emptyResult(attemptedMerchantCount);
  }
  if (process.env.NODE_ENV !== "production" && isE2eTestMode()) {
    logger.info("smsCategoryEnrichment.edgeBlockedInE2e", {
      attemptedMerchantCount,
    });
    return emptyResult(attemptedMerchantCount, true);
  }

  const qaConfig = getSmsSafeguardQaConfig();
  const qaRunId = qaConfig.enabled ? (qaConfig.runId ?? undefined) : undefined;
  const resolvedRequestContext = {
    requestKey:
      requestContext?.requestKey === undefined
        ? createSmsAiRequestKey(qaRunId)
        : scopeSmsAiRequestKey(requestContext.requestKey, qaRunId),
    scanSessionId: requestContext?.scanSessionId ?? Crypto.randomUUID(),
    scanKind: requestContext?.scanKind ?? "incremental",
  } satisfies SmsCategoryEnrichmentRequestContext;
  const chunks = splitPreparedRequest(
    prepared,
    resolvedRequestContext.requestKey
  );
  const timedSignal = createTimedRequestSignal(abortSignal);
  try {
    const chunkResults = await invokeCategoryChunks(
      chunks,
      timedSignal,
      resolvedRequestContext,
      abortSignal,
      expectedUserId
    );
    return mergeCategoryResults(chunkResults);
  } finally {
    timedSignal.cleanup();
  }
}
