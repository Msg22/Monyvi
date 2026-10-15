/**
 * AI Voice Parser Service
 *
 * Mobile-side service client for the `/parse-voice` Edge Function.
 * Sends audio recordings or transcribed text to Gemini via Supabase
 * Edge Function and returns structured transaction data.
 *
 * Supports Arabic (MSA + Egyptian dialect), English, and code-switching.
 *
 * Architecture & Design Rationale:
 * - Pattern: Service Layer (SRP — only handles AI communication)
 * - SOLID: Single responsibility → one service, one concern (voice→transactions).
 *   Open/Closed → new fields (accountId, date) added without modifying consumers.
 * - Algorithm: AbortController with 30s timeout for network resilience (FR-024).
 *
 * @module ai-voice-parser-service
 */

import { supabase } from "./supabase";
import * as Crypto from "expo-crypto";
import { assertExpectedCurrentUser } from "./user-data-access";
import { createVoiceAccountReviewSession } from "./account-review-source-adapter-service";
import { uuidV8FromSha256 } from "../../../packages/logic/src/account-review/identity";
import {
  classifyVoiceReviewV2Response,
  projectVoiceFinancialAtSourceIndex,
  attachVoiceReviewSession,
} from "./ai-voice-parser-review";
import type {
  VoiceReviewNormalizationInput,
} from "../../../packages/logic/src/account-review/normalization-types";
import type {
  AccountReviewSession,
} from "../../../packages/logic/src/account-review/review-schemas";
import { z } from "zod";
import { t } from "i18next";
import { logger } from "@/utils/logger";

import type { Category, CurrencyType } from "@monyvi/db";
import {
  normalizeCurrency,
  normalizeCurrencySafe,
  normalizeType,
  parseAiDate,
  clampConfidence,
  parseCategory,
  buildCategoryMap,
  MAX_TRANSACTION_AMOUNT,
  voiceQuotaRefusalSchema,
  type VoiceQuotaRefusal,
  type ParsedVoiceTransaction,
  type ReviewableTransaction,
  type VoiceParserError,
  type CategoryMap,
} from "@monyvi/logic";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sender identifier for voice-input transactions (not from SMS). */
const VOICE_INPUT_SENDER = "Voice";

/** Client-side timeout for AI analysis request (FR-024). */
const AI_TIMEOUT_MS = 30_000;

/** User-safe message for voice analysis connectivity failures. */
const VOICE_ANALYSIS_NETWORK_ERROR_MESSAGE =
  "We couldn't reach voice analysis right now. Please check your connection and try again.";
const AI_CONSENT_REQUIRED_STATUS = 403;
const VOICE_QUOTA_REFUSAL_STATUS = 429;
const VOICE_AMBIGUOUS_SERVER_STATUS = 503;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccountInput {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
}

interface ParseVoiceOptions {
  /** Only approved opt-in: T010 owner's closed providerContext is sent to Gemini. */
  readonly reviewAccountSnapshots?: VoiceReviewNormalizationInput["reviewAccountSnapshots"];
  /** Audio file URI */
  readonly audioUri: string;
  /** Stable opaque identity for this logical voice submission. */
  readonly requestKey: string;
  /** Current validated device IANA timezone context. */
  readonly callerTimeZone: string;
  /** Cancels this logical transport attempt when its owning flow becomes stale. */
  readonly signal?: AbortSignal;
  /** User's category tree (L1/L2 format) */
  readonly categories: string;
  /** User's accounts for AI matching */
  readonly accounts: readonly AccountInput[];
  /** User's preferred currency code (set client-side, not by AI) */
  readonly preferredCurrency: string;
  /** User's categories from the database — used for AI category → ID resolution */
  readonly categoryRecords: readonly Category[];
}

interface ParseVoiceResult {
  readonly transactions: readonly ReviewableTransaction[];
  readonly transcript: string;
  readonly originalTranscript: string;
  readonly detectedLanguage: string;
  /** Full T014-M-produced canonical local session, never a provider DTO. */
  readonly reviewSession?: AccountReviewSession;
}

/** Public alias — consumed by voice-flow-submission.ts for buildParserPayload return type. */
export type AiVoiceParserOptions = ParseVoiceOptions;
/** Public alias — consumed by voice-flow-submission.ts for serializeAiReviewParams param. */
export type AiVoiceParserSuccess = ParseVoiceResult;

export interface VoiceQuotaParserError {
  readonly kind: VoiceQuotaRefusal["reason"];
  readonly message: string;
  readonly availability: VoiceQuotaRefusal["availability"];
}

export interface VoiceParserTransportFailure extends VoiceParserError {
  readonly retryableSameRequest?: boolean;
}

export type VoiceParserFailure =
  | VoiceParserTransportFailure
  | VoiceQuotaParserError;

const VOICE_REVIEW_SESSION_DOMAIN = "monyvi.account-review.voice-session.v1";

/** Current actor must still match the pre-captured T010 review owner. */
async function assertVoiceReviewOwner(ownerId: string): Promise<void> {
  await assertExpectedCurrentUser(ownerId);
}

/** Expo's existing SHA-256 platform primitive and pure canonical UUIDv8. */
async function buildVoiceReviewNormalizationInput(input: {
  readonly ownerId: VoiceReviewNormalizationInput["ownerId"];
  readonly requestKey: string;
  readonly reviewAccountSnapshots: VoiceReviewNormalizationInput["reviewAccountSnapshots"];
  readonly categoryIdsBySystemName: VoiceReviewNormalizationInput["categoryIdsBySystemName"];
  readonly financialRows: VoiceReviewNormalizationInput["financialRows"];
  readonly mappedTransactions: VoiceReviewNormalizationInput["mappedTransactions"];
  readonly providerResponse: unknown;
  readonly originalTranscript: string;
}): Promise<VoiceReviewNormalizationInput> {
  const hashProvider: VoiceReviewNormalizationInput["hashProvider"] = {
    digestUtf8: (value: string): Promise<string> =>
      Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
  };
  const digest = await hashProvider.digestUtf8(JSON.stringify([
    VOICE_REVIEW_SESSION_DOMAIN, input.ownerId, input.requestKey,
  ]));
  return {
    ...input, source: "VOICE", sourceRevision: "0",
    sessionId: uuidV8FromSha256(digest), hashProvider,
  };
}

// ---------------------------------------------------------------------------
// Schemas — AI response validation
// ---------------------------------------------------------------------------

/**
 * Strict Zod schema for a single AI-extracted transaction.
 * Mirrors `VoiceTransaction` from the edge function exactly.
 *
 * All fields are required — if the AI fails to extract any of them,
 * the transaction is rejected by `safeParse` and logged as malformed.
 * Only `counterparty` and `accountId` are legitimately nullable
 * (the AI may not know the counterparty or matched account).
 */
const AiVoiceTransactionSchema = z.object({
  amount: z.number().finite().positive().max(MAX_TRANSACTION_AMOUNT),
  type: z.string(),
  counterparty: z.string().nullable(),
  categorySystemName: z.string(),
  description: z.string(),
  accountId: z.string().nullable(),
  currency: z.string().nullable(),
  date: z.string(),
  confidenceScore: z.number(),
});

type AiVoiceTransaction = z.infer<typeof AiVoiceTransactionSchema>;

/**
 * Strict Zod schema for the full edge-function response.
 * Mirrors `AiResponse` from the edge function.
 *
 * All fields are required — a missing `transcript` or `transactions`
 * array indicates a malformed response from Gemini.
 * Only `error` is optional (present only in error responses).
 */
const ParseVoiceResponseSchema = z.object({
  transcript: z.string(),
  original_transcript: z.string(),
  detected_language: z.string(),
  transactions: z.array(z.unknown()),
  error: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Removed — normalizeType and parseAiDate are now imported from @monyvi/logic
// ---------------------------------------------------------------------------

function getEdgeFunctionResponse(error: unknown): Response | null {
  if (typeof error !== "object" || error === null || !("context" in error)) {
    return null;
  }

  return error.context instanceof Response ? error.context : null;
}

function parseQuotaRefusalBody(bodyText: string): VoiceQuotaRefusal | null {
  try {
    const raw: unknown = JSON.parse(bodyText);
    const parsed = voiceQuotaRefusalSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function quotaRefusalMessage(reason: VoiceQuotaRefusal["reason"]): string {
  switch (reason) {
    case "daily_limit":
      return t("transactions:voice_limit_exhausted");
    case "burst_limit":
      return t("transactions:voice_limit_burst");
    case "already_processed_result_unavailable":
      return t("transactions:voice_replay_unavailable");
  }
}

function linkAbortSignal(
  source: AbortSignal | undefined,
  target: AbortController
): () => void {
  if (!source) return () => {};

  const abortTarget = (): void => {
    target.abort();
  };

  if (source.aborted) {
    target.abort();
    return () => {};
  }

  source.addEventListener("abort", abortTarget, {
    once: true,
  });

  return () => {
    source.removeEventListener("abort", abortTarget);
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a voice recording through the AI Edge Function.
 *
 * Supports two modes:
 * 1. Audio file (multipart) — sends raw audio to Gemini multimodal
 * 2. Text query (JSON) — sends transcribed text for processing
 *
 * @param options - Configuration including audio/text, accounts, categories, currency
 * @returns Parsed transactions and transcript, or structured error
 * @throws Never — returns structured VoiceParserError on failure
 */
export async function parseVoiceWithAi(
  options: ParseVoiceOptions
): Promise<ParseVoiceResult | VoiceParserFailure> {
  // Pre-transport category validation: fail fast if category data is missing/empty.
  // An empty category map would cause every parseCategory() call to throw,
  // silently dropping transactions after expensive network transport and quota deduction.
  const categoryMap: CategoryMap = buildCategoryMap(options.categoryRecords);
  if (categoryMap.size === 0) {
    logger.error(
      "[ai-voice-parser] Category data unavailable — categoryMap is empty",
      new Error("Empty categoryMap"),
      { categoryRecordsLength: options.categoryRecords.length }
    );
    return {
      kind: "config",
      message:
        "Category data is unavailable. Please restart the app and try again.",
      retryableSameRequest: true,
    };
  }

  const ownedReview = options.reviewAccountSnapshots;
  const reviewMode = ownedReview !== undefined;

  // Compute caller's local date in YYYY-MM-DD format for relative date resolution
  const now = new Date();
  const callerLocalDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // FR-024: 30-second client-side timeout via AbortController
  const abortController = new AbortController();
  let didClientTimeout = false;

  const detachExternalAbort = linkAbortSignal(options.signal, abortController);

  const timeoutId = setTimeout(() => {
    didClientTimeout = true;
    abortController.abort();
  }, AI_TIMEOUT_MS);

  try {
    if (reviewMode) {
      try {
        await assertVoiceReviewOwner(ownedReview.ownerId);
      } catch {
        return {
          kind: "config",
          message: "Account review context is unavailable. Please retry.",
          retryableSameRequest: false,
        };
      }
      if (abortController.signal.aborted) {
        return {
          kind: didClientTimeout ? "timeout" : "network",
          message: VOICE_ANALYSIS_NETWORK_ERROR_MESSAGE,
          retryableSameRequest: didClientTimeout,
        };
      }
    }
    let response: {
      data: unknown;
      error: { message: string } | null;
    };

    if (options.audioUri) {
      // Audio mode — send as multipart form data
      // React Native's FormData natively supports { uri, type, name } objects
      // for file uploads. Using fetch(localUri).blob() doesn't work reliably
      // on Android (bare paths without file:// prefix cause "Network request failed").
      //
      // Only prepend file:// for bare absolute paths (starting with "/").
      // Leave URIs with existing schemes (file://, content://, http://) untouched.
      const hasScheme = options.audioUri.includes("://");
      const fileUri = hasScheme
        ? options.audioUri
        : `file://${options.audioUri}`;

      const formData = new FormData();
      const audioFile: ReactNativeFormDataFile = {
        uri: fileUri,
        type: "audio/mp4",
        name: "recording.m4a",
      };
      formData.append("audio", audioFile);
      if (options.categories) {
        formData.append("categories", options.categories);
      }
      if (reviewMode) {
        // Existing multipart account field, but only the closed provider shape.
        formData.append("accounts", JSON.stringify(ownedReview.providerContext.accounts));
        formData.append("reviewContractVersion", "account-review/v2");
        formData.append("preferredCurrency", ownedReview.providerContext.preferredCurrency);
      } else if (options.accounts && options.accounts.length > 0) {
        formData.append("accounts", JSON.stringify(options.accounts));
      }
      formData.append("callerLocalDate", callerLocalDate);
      formData.append("requestKey", options.requestKey);
      formData.append("callerTimeZone", options.callerTimeZone);

      response = await supabase.functions.invoke("parse-voice", {
        body: formData,
        signal: abortController.signal,
      });
    } else {
      return {
        kind: "unknown",
        message: "audioUri must be provided.",
      };
    }

    if (response.error) {
      const context = getEdgeFunctionResponse(response.error);
      const status = context?.status;

      if (options.signal?.aborted) {
        return {
          kind: "network",
          message: VOICE_ANALYSIS_NETWORK_ERROR_MESSAGE,
          retryableSameRequest: false,
        };
      }

      // Supabase returns fetch aborts as FunctionsFetchError, rather than throwing.
      if (context === null && didClientTimeout) {
        return {
          kind: "timeout",
          message:
            "Analysis took too long. Please check your connection and try again.",
          retryableSameRequest: true,
        };
      }

      const retryableSameRequest =
        context === null || status === VOICE_AMBIGUOUS_SERVER_STATUS;
      let bodyLength: number | undefined;

      /*
       * Existing consent behavior wins before quota-envelope parsing.
       * Only HTTP 429 is allowed to carry the canonical quota refusal.
       */
      if (status === AI_CONSENT_REQUIRED_STATUS) {
        return {
          kind: "consent_required",
          message: "AI processing consent is required.",
        };
      }

      if (status === VOICE_QUOTA_REFUSAL_STATUS && context !== null) {
        try {
          const bodyText = await context.clone().text();
          bodyLength = bodyText.length;

          const refusal = parseQuotaRefusalBody(bodyText);

          if (refusal !== null) {
            return {
              kind: refusal.reason,
              message: quotaRefusalMessage(refusal.reason),
              availability: refusal.availability,
            };
          }
        } catch {
          bodyLength = undefined;
        }
      } else if (context !== null) {
        try {
          bodyLength = (await context.clone().text()).length;
        } catch {
          bodyLength = undefined;
        }
      }

      const sanitizedError = new Error(response.error.message);

      if (response.error instanceof Error) {
        sanitizedError.name = response.error.name;
      }

      logger.error(
        "[ai-voice-parser] parse-voice Edge Function error",
        sanitizedError,
        {
          status,
          bodyLength,
        }
      );

      return {
        kind: "network",
        message: VOICE_ANALYSIS_NETWORK_ERROR_MESSAGE,
        retryableSameRequest,
      };
    }

    const rawData = response.data;
    const parsed = ParseVoiceResponseSchema.safeParse(rawData);
    if (!parsed.success) {
      // PII/privacy: do NOT log `rawData` — it contains the user's transcript
      // and parsed transaction details (amounts, counterparties, dates).
      // Log only schema issue paths/codes for diagnostics.
      logger.error(
        "[ai-voice-parser] Malformed backend response shape",
        new Error("Response schema validation failed"),
        {
          issueCount: parsed.error.issues.length,
          issuePaths: parsed.error.issues
            .map((i) => i.path.join("."))
            .slice(0, 5),
          issueCodes: Array.from(
            new Set(parsed.error.issues.map((i) => i.code))
          ),
        }
      );
      return {
        kind: "schema",
        message:
          "The server returned an unexpected response format. Please try again.",
      };
    }

    const data = parsed.data;
    if (data.error) {
      logger.error(
        "[ai-voice-parser] Edge Function returned error payload",
        new Error(data.error)
      );
      return {
        kind: "network",
        message: VOICE_ANALYSIS_NETWORK_ERROR_MESSAGE,
      };
    }

    const transcript = data.transcript;
    // V2 source spans must reference the exact original transcript, including
    // the empty-string case; v1 retains its historical display fallback.
    const originalTranscript = reviewMode
      ? data.original_transcript
      : (data.original_transcript || transcript);
    const detectedLanguage = data.detected_language;
    const classification = reviewMode
      ? classifyVoiceReviewV2Response(rawData) : null;

    // Validate and map AI response to ParsedVoiceTransaction
    const validTransactions: Array<{
      readonly sourceIndex: number;
      readonly transaction: AiVoiceTransaction;
    }> = [];
    for (const [sourceIndex, raw] of data.transactions.entries()) {
      const parsed = AiVoiceTransactionSchema.safeParse(raw);
      if (parsed.success) {
        validTransactions.push({ sourceIndex, transaction: parsed.data });
      } else {
        // PII/privacy: do NOT log `raw` (it contains the AI-parsed transaction
        // with counterparty, amount, description, etc.). Log only aggregate
        // diagnostics.
        logger.warn("[ai-voice-parser] Skipping malformed transaction entry", {
          issueCount: parsed.error.issues.length,
          issuePaths: parsed.error.issues
            .map((i) => i.path.join("."))
            .slice(0, 5),
          issueCodes: Array.from(
            new Set(parsed.error.issues.map((i) => i.code))
          ),
        });
      }
    }

    if (validTransactions.length === 0) {
      return {
        kind: "empty",
        message: "No transactions found in your recording. Try again?",
      };
    }

    // Parse categories using pre-validated categoryMap

    const validatedCurrency = normalizeCurrency(
      reviewMode ? ownedReview.preferredCurrency : options.preferredCurrency
    );
    const results: ParsedVoiceTransaction[] = [];
    const originalFinancialRows: Array<VoiceReviewNormalizationInput["financialRows"][number]> = [];
    const categoryIdsBySystemName = new Map<string, string>();

    for (const { sourceIndex, transaction: aiTx } of validTransactions) {
      const financial = reviewMode
        ? projectVoiceFinancialAtSourceIndex(data.transactions, sourceIndex)
        : null;
      if (reviewMode && financial === null) {
        logger.warn("[ai-voice-parser] Invalid Voice review financial row", {
          reasonCode: "review_financial_invalid",
        });
        continue;
      }
      try {
        const resolvedCategory = parseCategory(
          aiTx.categorySystemName,
          categoryMap
        );

        // ---------------------------------------------------------------
        // Currency fallback chain (Issue #156):
        // 1. AI matched an account → use that account's currency
        // 2. AI detected a currency explicitly → validate and use it
        // 3. Neither → fall back to user's preferred currency
        // ---------------------------------------------------------------
        const matchedAccount = aiTx.accountId
          ? options.accounts.find((a) => a.id === aiTx.accountId)
          : undefined;

        // AI-detected currency BEFORE account resolution
        const aiDetectedCurrency: CurrencyType | null = aiTx.currency
          ? normalizeCurrencySafe(aiTx.currency, validatedCurrency)
          : null;

        const resolvedCurrency: CurrencyType = reviewMode
          ? (aiDetectedCurrency ?? validatedCurrency)
          : matchedAccount
            ? normalizeCurrencySafe(matchedAccount.currency, validatedCurrency)
            : (aiDetectedCurrency ?? validatedCurrency);

        const mappedTransaction: ParsedVoiceTransaction = {
          amount: aiTx.amount,
          currency: resolvedCurrency,
          type: normalizeType(aiTx.type),
          counterparty: aiTx.counterparty ?? undefined,
          date: parseAiDate(aiTx.date),
          source: "VOICE",
          originLabel: aiTx.counterparty || VOICE_INPUT_SENDER,
          categoryId: resolvedCategory.id,
          categoryDisplayName: resolvedCategory.displayName,
          confidence: clampConfidence(aiTx.confidenceScore),
          accountId: reviewMode ? undefined : (aiTx.accountId || undefined),
          note: aiTx.description,
          originalTranscript,
          detectedLanguage,
          aiDetectedCurrency,
        };
        if (reviewMode && financial !== null) {
          originalFinancialRows.push(financial);
          const previousId = categoryIdsBySystemName.get(financial.categorySystemName);
          if (previousId !== undefined && previousId !== resolvedCategory.id) {
            throw new Error("account_review_category_identity_conflict");
          }
          categoryIdsBySystemName.set(financial.categorySystemName, resolvedCategory.id);
        }
        results.push(mappedTransaction);
      } catch (error) {
        // PII/privacy: do NOT log the full `aiTx` object — it contains the
        // user's transcript-derived transaction (counterparty, amount, note,
        // description). Log only the category system name (enum-ish) and
        // currency for diagnostics.
        logger.warn(
          "[ai-voice-parser] Skipping semantically invalid transaction",
          {
            categorySystemNameLength: aiTx.categorySystemName,
            currency: aiTx.currency
              ? normalizeCurrencySafe(aiTx.currency, validatedCurrency)
              : null,

            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }

    if (results.length === 0) {
      return {
        kind: "empty",
        message: "No transactions found in your recording. Try again?",
      };
    }

    const success: AiVoiceParserSuccess = {
      transactions: results,
      transcript,
      originalTranscript,
      detectedLanguage,
    };
    if (!reviewMode) return success;

    // A successful opt-in must include the full canonical local session.
    // T014-M owns the actual implementation; this call is never mocked/stubbed.
    if (classification === null || originalFinancialRows.length !== results.length) {
      return {
        kind: "schema",
        message: "The server returned an unexpected response format. Please try again.",
      };
    }
    if (abortController.signal.aborted) {
      return {
        kind: didClientTimeout ? "timeout" : "network",
        message: VOICE_ANALYSIS_NETWORK_ERROR_MESSAGE,
        retryableSameRequest: didClientTimeout,
      };
    }
    try {
      await assertVoiceReviewOwner(ownedReview.ownerId);
      const input = await buildVoiceReviewNormalizationInput({
        ownerId: ownedReview.ownerId,
        requestKey: options.requestKey,
        reviewAccountSnapshots: ownedReview,
        categoryIdsBySystemName,
        financialRows: originalFinancialRows,
        mappedTransactions: results,
        providerResponse: classification.providerResponse,
        originalTranscript,
      });
      // The SQL-owned adapter is statically linked but invoked only for an
      // opted-in result; v1 never loads account snapshots or creates a session.
      const reviewSession = await createVoiceAccountReviewSession(input);
      if (abortController.signal.aborted) {
        return {
          kind: didClientTimeout ? "timeout" : "network",
          message: VOICE_ANALYSIS_NETWORK_ERROR_MESSAGE,
          retryableSameRequest: didClientTimeout,
        };
      }
      await assertVoiceReviewOwner(ownedReview.ownerId);
      return attachVoiceReviewSession({
        success,
        reviewSession,
        expectedOwnerId: ownedReview.ownerId,
        expectedSessionId: input.sessionId,
      });
    } catch (reviewError: unknown) {
      // No raw provider, transcript, category, account or Zod issue payload.
      logger.warn("[ai-voice-parser] Review session unavailable", {
        reasonCode: "review_session_unavailable",
        errorName: reviewError instanceof Error ? reviewError.name : "unknown",
      });
      return {
        kind: abortController.signal.aborted
          ? (didClientTimeout ? "timeout" : "network") : "schema",
        message: abortController.signal.aborted
          ? VOICE_ANALYSIS_NETWORK_ERROR_MESSAGE
          : "Account review could not be prepared. Please retry.",
        retryableSameRequest: didClientTimeout,
      };
    }
  } catch (err: unknown) {
    // FR-024: Handle timeout specifically
    if (err instanceof Error && err.name === "AbortError") {
      if (didClientTimeout) {
        return {
          kind: "timeout",
          message:
            "Analysis took too long. Please check your connection and try again.",
          retryableSameRequest: true,
        };
      }

      return {
        kind: "network",
        message: VOICE_ANALYSIS_NETWORK_ERROR_MESSAGE,
        retryableSameRequest: false,
      };
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[ai-voice-parser] Unexpected error", err);
    return {
      kind: "unknown",
      message,
    };
  } finally {
    clearTimeout(timeoutId);
    detachExternalAbort();
  }
}

/**
 * Type guard to check if a result is an error.
 */
export function isVoiceParserError(
  result: ParseVoiceResult | VoiceParserFailure
): result is VoiceParserFailure {
  return "kind" in result;
}

export function isVoiceQuotaParserError(
  result: ParseVoiceResult | VoiceParserFailure
): result is VoiceQuotaParserError {
  return (
    "availability" in result &&
    (result.kind === "daily_limit" ||
      result.kind === "burst_limit" ||
      result.kind === "already_processed_result_unavailable")
  );
}
