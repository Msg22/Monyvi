import type { Sha256Provider } from "../financial-actions/action-contracts";
import type { ParsedSmsTransaction, ParsedVoiceTransaction } from "../types";
import type {
  AccountReviewAccountContext,
  AccountReviewRequestContext,
  AccountReviewSmsFinancialRow,
  AccountReviewVoiceFinancialRow,
} from "./parser-schemas";
import type { AccountReviewSession } from "./review-schemas";

/** Pure owned snapshots are advisory context, never a DB authorization token. */
export interface AccountReviewOwnedContext {
  readonly ownerId: AccountReviewSession["ownerId"];
  readonly preferredCurrency: AccountReviewRequestContext["preferredCurrency"];
  readonly accounts: readonly (AccountReviewAccountContext & {
    readonly isDefault: boolean;
  })[];
  readonly providerContext: AccountReviewRequestContext;
}

interface BaseNormalizationInput {
  readonly ownerId: AccountReviewSession["ownerId"];
  readonly sessionId: AccountReviewSession["sessionId"];
  readonly sourceRevision: AccountReviewSession["sourceRevision"];
  /** Stable logical recording/scan identity, not a network retry or chunk index. */
  readonly requestKey: string;
  readonly reviewAccountSnapshots: AccountReviewOwnedContext;
  readonly categoryIdsBySystemName: ReadonlyMap<string, string>;
  readonly providerResponse: unknown;
  readonly hashProvider: Sha256Provider;
}

export interface VoiceReviewNormalizationInput extends BaseNormalizationInput {
  readonly source: "VOICE";
  readonly financialRows: readonly AccountReviewVoiceFinancialRow[];
  readonly mappedTransactions: readonly ParsedVoiceTransaction[];
  readonly originalTranscript: string;
}

export interface SubmittedSmsReviewSource {
  readonly id: string;
  readonly body: string;
  readonly sender: string;
  readonly smsFingerprint: string;
}

export interface SmsReviewNormalizationInput extends BaseNormalizationInput {
  readonly source: "SMS";
  readonly financialRows: readonly AccountReviewSmsFinancialRow[];
  readonly mappedTransactions: readonly ParsedSmsTransaction[];
  readonly submittedMessages: readonly SubmittedSmsReviewSource[];
}

export type AccountReviewNormalizationInput =
  | VoiceReviewNormalizationInput
  | SmsReviewNormalizationInput;
