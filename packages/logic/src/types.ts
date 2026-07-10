/**
 * Core types for Monyvi application
 */

import type {
  Category,
  CurrencyType,
  Transaction,
  TransactionType,
} from "@monyvi/db";

// ---------------------------------------------------------------------------
// Voice Parser Error
// ---------------------------------------------------------------------------

/**
 * Error types for structured voice parser error handling.
 * - timeout: client-side AbortController timeout
 * - network: Edge Function invocation failure
 * - empty:   AI returned zero valid transactions
 * - schema:  backend response doesn't match ParseVoiceResponseSchema
 * - config:  client-side configuration error (e.g. empty category data)
 * - consent_required: server requires AI processing consent before parsing
 * - unknown: unexpected exception
 */
export type VoiceParserErrorKind =
  | "timeout"
  | "network"
  | "empty"
  | "schema"
  | "config"
  | "consent_required"
  | "unknown";

/** Structured error returned by parseVoiceWithAi instead of throwing. */
export interface VoiceParserError {
  readonly kind: VoiceParserErrorKind;
  readonly message: string;
}

export interface ParsedNotification {
  type: TransactionType;
  amount: number;
  currency: CurrencyType;
  counterparty?: string;
  description: string;

  // Account matching data
  cardLast4?: string;
  accountNumber?: string;
  bankIdentifier?: string;

  // Balance sync
  availableBalance?: number;

  // Reference tracking
  reference?: string;

  // Auto-detected category
  detectedCategory?: string | null;
}

/**
 * Raw SMS message from the Android SMS inbox.
 * Represents a single entry from the device SMS ContentProvider.
 */
export interface SmsMessage {
  readonly id: string;
  readonly address: string;
  readonly body: string;
  /** Timestamp in milliseconds since epoch */
  readonly date: number;
  readonly read: boolean;
}

// ---------------------------------------------------------------------------
// Shared transaction types
// ---------------------------------------------------------------------------

/** Origin source of a parsed transaction. */
export type TransactionSource = "SMS" | "VOICE" | "MANUAL";

/** Parser-level review status used before the user saves a suggestion. */
export type TransactionReviewStatus = "auto_selectable" | "needs_review";

/** Stable parser reasons that explain why a suggestion needs human review. */
export type TransactionReviewReason =
  | "low_confidence"
  | "account_needed"
  | "category_needed"
  | "cash_transfer_review"
  | "unsupported_template"
  | "ambiguous_amount"
  | "partial_template"
  | "non_transactional";

/**
 * Source-agnostic parsed transaction ready for user review.
 *
 * This is the shared contract consumed by TransactionReview,
 * TransactionItem, TransactionEditModal, and the batch-save pipeline.
 * Source-specific subtypes (ParsedSmsTransaction, ParsedVoiceTransaction)
 * extend this interface with additional metadata.
 */
export interface ReviewableTransaction {
  readonly amount: number;
  readonly currency: CurrencyType;
  readonly type: TransactionType;
  readonly counterparty?: string;
  readonly date: Date;
  readonly categoryId: Category["id"];
  readonly categoryDisplayName: Category["displayName"];
  /** Parsing confidence score (0–1) */
  readonly confidence: number;
  /** Display label for the transaction origin (sender name, "Voice", etc.) */
  readonly originLabel: string;
  /** Origin source of this transaction */
  readonly source: TransactionSource;
  /** Optional deduplication key (smsFingerprint for SMS, transcript hash for voice) */
  readonly deduplicationHash?: string;
  /** AI-matched account ID (undefined if no match) */
  readonly accountId?: string;
  /** AI-extracted merchant name (may differ from counterparty) */
  readonly merchant?: Transaction["counterparty"];
  /** Parser review status. Omitted for older parsers that only provide confidence. */
  readonly reviewStatus?: TransactionReviewStatus;
  /** Stable parser reasons that should keep a suggestion in the review path. */
  readonly reviewReasons?: readonly TransactionReviewReason[];
}

/**
 * Fully parsed SMS transaction ready for user review.
 * Extends ReviewableTransaction with SMS-specific metadata.
 */
export interface ParsedSmsTransaction extends ReviewableTransaction {
  readonly source: "SMS";
  readonly smsFingerprint: string;
  readonly senderDisplayName: string;
  readonly rawSmsBody: string;
  /** True if this is an ATM/Bank cash withdrawal (should be saved as transfer) */
  readonly isAtmWithdrawal?: boolean;
  /** Last 4 digits of card extracted from SMS (for bank account matching) */
  readonly cardLast4?: string;
}

/**
 * Voice-specific parsed transaction.
 * Extends ReviewableTransaction with fields unique to voice input.
 */
export interface ParsedVoiceTransaction extends ReviewableTransaction {
  readonly source: "VOICE";
  /** AI-extracted description/note */
  readonly note: string;
  /** Original spoken text in the user's language */
  readonly originalTranscript: string;
  /** ISO 639-1 language code detected by the AI (e.g., "ar", "en") */
  readonly detectedLanguage: string;
  /**
   * Currency detected from the user's speech BEFORE account resolution.
   * Used by the edit modal to compute auto-conversion when the user
   * selects an account with a different currency.
   * `null` when the AI did not detect any explicit currency.
   */
  readonly aiDetectedCurrency: CurrencyType | null;
}
