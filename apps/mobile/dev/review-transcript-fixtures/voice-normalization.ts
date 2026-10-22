/**
 * #395 review transcript fixtures — canonical Voice normalization builder.
 *
 * Turns one fixed scenario into the SAME `VoiceReviewNormalizationInput` the
 * shipped Voice parser path produces: a static provider-shaped
 * `account-review/v2` response plus the mapped `ParsedVoiceTransaction`s over
 * the current owned account snapshot. Evidence span offsets are derived from
 * literal transcript substrings here, so a scenario can never declare a span
 * that does not ground against its own transcript.
 *
 * No provider transport, no hashing override, no DB access.
 *
 * @module review-transcript-fixtures/voice-normalization
 */

import {
  accountReviewVoiceResponseV2Schema,
  type AccountReviewOwnedContext,
  type AccountReviewVoiceResponseV2,
  type ParsedVoiceTransaction,
  type Sha256Provider,
  type VoiceReviewNormalizationInput,
} from "@monyvi/logic";
import type { CurrencyType, TransactionType } from "@monyvi/db";
import type {
  ReviewTranscriptFixtureAccountEvidence,
  ReviewTranscriptFixtureCurrencyEvidence,
  ReviewTranscriptFixtureScenario,
  ReviewTranscriptFixtureTransaction,
} from "./scenarios";

export class ReviewTranscriptFixtureBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewTranscriptFixtureBuildError";
  }
}

export interface BuildVoiceReviewNormalizationInputParams {
  readonly scenario: ReviewTranscriptFixtureScenario;
  readonly ownerId: string;
  /** Fresh per-launch session identity; never reused across launches. */
  readonly sessionId: string;
  /**
   * Stable logical recording identity for this fixed transcript. Used as the
   * Voice evidence span `sourceRef` and the row source key.
   */
  readonly requestKey: string;
  readonly reviewAccountSnapshots: AccountReviewOwnedContext;
  readonly categoryIdsBySystemName: ReadonlyMap<string, string>;
  readonly categoryDisplayNamesBySystemName: ReadonlyMap<string, string>;
  readonly fallbackCategorySystemNameByType: ReadonlyMap<
    TransactionType,
    string
  >;
  readonly hashProvider: Sha256Provider;
}

function exactVoiceSpan(
  requestKey: string,
  transcript: string,
  text: string
): AccountReviewVoiceResponseV2["transactions"][number]["currencyEvidence"]["evidenceSpans"][number] {
  const start = transcript.indexOf(text);
  if (start < 0) {
    throw new ReviewTranscriptFixtureBuildError(
      `review_transcript_fixture_span_not_grounded:${text}`
    );
  }
  return {
    sourceRef: requestKey,
    field: "transcript",
    start,
    end: start + text.length,
    text,
  };
}

function resolveCategorySystemName(
  transaction: ReviewTranscriptFixtureTransaction,
  categoryIdsBySystemName: ReadonlyMap<string, string>,
  fallbackCategorySystemNameByType: ReadonlyMap<TransactionType, string>
): string {
  if (categoryIdsBySystemName.has(transaction.preferredCategorySystemName)) {
    return transaction.preferredCategorySystemName;
  }
  const fallback = fallbackCategorySystemNameByType.get(
    transaction.categoryType
  );
  if (fallback !== undefined && categoryIdsBySystemName.has(fallback)) {
    return fallback;
  }
  throw new ReviewTranscriptFixtureBuildError(
    `review_transcript_fixture_category_missing:${transaction.categoryType}`
  );
}

function readCategoryId(
  categorySystemName: string,
  categoryIdsBySystemName: ReadonlyMap<string, string>
): string {
  const categoryId = categoryIdsBySystemName.get(categorySystemName);
  if (categoryId === undefined) {
    throw new ReviewTranscriptFixtureBuildError(
      `review_transcript_fixture_category_missing:${categorySystemName}`
    );
  }
  return categoryId;
}

function toProviderAccountEvidence(
  evidence: ReviewTranscriptFixtureAccountEvidence,
  requestKey: string,
  transcript: string
): AccountReviewVoiceResponseV2["transactions"][number]["accountEvidence"] {
  const evidenceSpans =
    evidence.state === "absent"
      ? []
      : evidence.spanTexts.map((text) =>
          exactVoiceSpan(requestKey, transcript, text)
        );
  return {
    state: evidence.state,
    name: evidence.name,
    type: evidence.type,
    institutionId: evidence.institutionId,
    providerDisplayName: evidence.providerDisplayName,
    cardLast4: evidence.cardLast4,
    evidenceSpans,
    candidateAccountIds: [],
  };
}

function toProviderCurrencyEvidence(
  evidence: ReviewTranscriptFixtureCurrencyEvidence,
  requestKey: string,
  transcript: string
): AccountReviewVoiceResponseV2["transactions"][number]["currencyEvidence"] {
  return {
    state: evidence.state,
    statedCode: evidence.statedCode,
    candidateCodes: [...evidence.candidateCodes],
    evidenceSpans: evidence.spanTexts.map((text) =>
      exactVoiceSpan(requestKey, transcript, text)
    ),
  };
}

/** Persisted/user-visible labels must be obviously non-real during QA. */
function testTransactionLabel(value: string): string {
  return /^\[TEST\]\s/u.test(value) ? value : `[TEST] ${value}`;
}

function testAccountName(value: string): string {
  return /^TEST\b/u.test(value) ? value : `TEST ${value}`;
}

function parseCalendarDate(date: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (!match) {
    throw new ReviewTranscriptFixtureBuildError(
      `review_transcript_fixture_invalid_date:${date}`
    );
  }
  const [, year, month, day] = match;
  // Local noon keeps the calendar day stable in every device timezone; the
  // Voice date validation compares the LOCAL calendar date.
  return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
}

function buildProviderResponse(
  scenario: ReviewTranscriptFixtureScenario,
  requestKey: string,
  categoryIdsBySystemName: ReadonlyMap<string, string>,
  fallbackCategorySystemNameByType: ReadonlyMap<TransactionType, string>
): AccountReviewVoiceResponseV2 {
  return accountReviewVoiceResponseV2Schema.parse({
    reviewContractVersion: "account-review/v2",
    transcript: scenario.transcript,
    original_transcript: scenario.transcript,
    detected_language: scenario.detectedLanguage,
    transactions: scenario.transactions.map((transaction) => {
      const categorySystemName = resolveCategorySystemName(
        transaction,
        categoryIdsBySystemName,
        fallbackCategorySystemNameByType
      );
      return {
        transactionRef: transaction.transactionRef,
        suggestionRef: transaction.suggestionRef,
        amount: transaction.amount,
        type: transaction.kind,
        counterparty:
          transaction.counterparty === null
            ? null
            : testTransactionLabel(transaction.counterparty),
        categorySystemName,
        description: testTransactionLabel(transaction.description),
        accountId: null,
        currency: transaction.currency,
        date: transaction.date,
        confidenceScore: transaction.confidenceScore,
        accountEvidence: toProviderAccountEvidence(
          transaction.accountEvidence,
          requestKey,
          scenario.transcript
        ),
        toAccountEvidence: null,
        currencyEvidence: toProviderCurrencyEvidence(
          transaction.currencyEvidence,
          requestKey,
          scenario.transcript
        ),
      };
    }),
    suggestedAccounts: scenario.suggestedAccounts.map((suggestion) => ({
      suggestionRef: suggestion.suggestionRef,
      name: testAccountName(suggestion.name),
      type: suggestion.type,
      currency: suggestion.currency,
      institutionId: suggestion.institutionId,
      providerDisplayName: suggestion.providerDisplayName,
      cardLast4: suggestion.cardLast4,
      senderNames: [...suggestion.senderNames],
      transactionRefs: [...suggestion.transactionRefs],
    })),
  });
}

function buildMappedTransaction(
  transaction: ReviewTranscriptFixtureTransaction,
  providerRow: AccountReviewVoiceResponseV2["transactions"][number],
  scenario: ReviewTranscriptFixtureScenario,
  categoryIdsBySystemName: ReadonlyMap<string, string>,
  categoryDisplayNamesBySystemName: ReadonlyMap<string, string>,
  preferredCurrency: CurrencyType
): ParsedVoiceTransaction {
  const categoryId = readCategoryId(
    providerRow.categorySystemName,
    categoryIdsBySystemName
  );
  const categoryDisplayName = categoryDisplayNamesBySystemName.get(
    providerRow.categorySystemName
  );
  if (!categoryDisplayName?.trim()) {
    throw new ReviewTranscriptFixtureBuildError(
      `review_transcript_fixture_category_display_name_missing:${providerRow.categorySystemName}`
    );
  }
  return {
    amount: transaction.amount,
    // The provider row's currency is a wide parsed string; the only fallback we
    // trust is the caller's typed preferred currency captured at launch.
    currency: transaction.currency ?? preferredCurrency,
    type: transaction.kind,
    counterparty: providerRow.counterparty ?? undefined,
    date: parseCalendarDate(transaction.date),
    categoryId,
    categoryDisplayName,
    confidence: transaction.confidenceScore,
    originLabel: "Voice",
    source: "VOICE",
    note: providerRow.description,
    originalTranscript: scenario.transcript,
    detectedLanguage: scenario.detectedLanguage,
    aiDetectedCurrency: transaction.currency,
  };
}

/** Pure synchronous builder; the async canonical path runs in the launcher. */
export function buildVoiceReviewNormalizationInput(
  params: BuildVoiceReviewNormalizationInputParams
): VoiceReviewNormalizationInput {
  const {
    scenario,
    ownerId,
    sessionId,
    requestKey,
    reviewAccountSnapshots,
    categoryIdsBySystemName,
    categoryDisplayNamesBySystemName,
    fallbackCategorySystemNameByType,
    hashProvider,
  } = params;
  if (!requestKey.trim()) {
    throw new ReviewTranscriptFixtureBuildError(
      "review_transcript_fixture_request_key_required"
    );
  }
  const providerResponse = buildProviderResponse(
    scenario,
    requestKey,
    categoryIdsBySystemName,
    fallbackCategorySystemNameByType
  );
  const mappedTransactions = scenario.transactions.map((transaction, index) => {
    const providerRow = providerResponse.transactions[index];
    if (!providerRow) {
      throw new ReviewTranscriptFixtureBuildError(
        "review_transcript_fixture_provider_row_missing"
      );
    }
    return buildMappedTransaction(
      transaction,
      providerRow,
      scenario,
      categoryIdsBySystemName,
      categoryDisplayNamesBySystemName,
      reviewAccountSnapshots.preferredCurrency
    );
  });
  return {
    source: "VOICE",
    ownerId,
    sessionId,
    sourceRevision: "0",
    requestKey,
    reviewAccountSnapshots,
    categoryIdsBySystemName,
    providerResponse,
    financialRows: providerResponse.transactions,
    mappedTransactions,
    originalTranscript: scenario.transcript,
    hashProvider,
  };
}
