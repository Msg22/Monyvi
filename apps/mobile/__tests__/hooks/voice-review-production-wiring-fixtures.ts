import {
  accountReviewSessionSchema,
  type AccountReviewSession,
  type ParsedVoiceTransaction,
  type ReviewableTransaction,
} from "@monyvi/logic";
import type { AccountReviewAccountSnapshots } from "@/services/account-review-read-model-service";
import {
  R17,
  account,
  existing,
  known,
  snapshots,
  voiceRow,
} from "../../../../packages/logic/src/account-review/__tests__/resolution-fixtures";

export const TEST_VOICE_OWNER_ID = R17.owner;
export const TEST_VOICE_FOREIGN_OWNER_ID = R17.foreignOwner;
export const TEST_VOICE_SESSION_ID = R17.session;

export const TEST_VOICE_TRANSACTION_FIXTURE: ParsedVoiceTransaction = {
  amount: 20,
  currency: "EGP",
  type: "EXPENSE",
  date: new Date("2026-07-07T12:00:00.000Z"),
  categoryId: R17.category,
  categoryDisplayName: "Food",
  confidence: 0.9,
  originLabel: "Voice",
  source: "VOICE",
  note: "Groceries",
  originalTranscript: "paid 20",
  detectedLanguage: "en",
  aiDetectedCurrency: "EGP",
};

const BANK = account(R17.bank, {
  name: "QNB Current",
  providerDisplayName: "QNB Alahli",
  cardLast4: "1234",
  isDefault: true,
});

export const canonicalReviewAccountSnapshotsFixture: AccountReviewAccountSnapshots =
  snapshots([BANK], R17.owner, "EGP");

export function createCanonicalVoiceSessionFixture(
  options: {
    readonly ownerId?: string;
    readonly sessionId?: string;
    readonly transactions?: ReadonlyArray<
      ReviewableTransaction | ParsedVoiceTransaction
    >;
  } = {}
): AccountReviewSession {
  const ownerId = options.ownerId ?? R17.owner;
  const sessionId = options.sessionId ?? R17.session;
  const transactions = options.transactions ?? [TEST_VOICE_TRANSACTION_FIXTURE];

  return accountReviewSessionSchema.parse({
    ownerId,
    source: "VOICE",
    sessionId,
    sourceRevision: "0",
    preferredCurrency: "EGP",
    rows: transactions.map((t, idx) => {
      const baseRow = voiceRow();
      const rowId = `00000000-0000-4000-8000-${String(105 + idx).padStart(12, "0")}`;
      const amountDecimal = String(t.amount);
      const currencyCode = t.currency ?? "EGP";
      return {
        ...baseRow,
        rowId,
        amountDecimal,
        sourceRef: `synthetic-voice-row-${idx}`,
        sourceFingerprint: null,
        selected: true,
        currency: known(currencyCode, "explicit"),
        assignment: existing(R17.bank, "user", currencyCode),
        reviewReasons: [],
        transaction: {
          ...baseRow.transaction,
          amount: t.amount,
          currency: currencyCode,
          type: t.type,
          date: t.date,
          categoryId: t.categoryId,
          categoryDisplayName: t.categoryDisplayName,
          confidence: t.confidence,
          originLabel: t.originLabel,
          note:
            "note" in t && typeof t.note === "string"
              ? t.note
              : baseRow.transaction.note,
          originalTranscript:
            "originalTranscript" in t &&
            typeof t.originalTranscript === "string"
              ? t.originalTranscript
              : baseRow.transaction.originalTranscript,
          detectedLanguage:
            "detectedLanguage" in t && typeof t.detectedLanguage === "string"
              ? t.detectedLanguage
              : baseRow.transaction.detectedLanguage,
          aiDetectedCurrency:
            "aiDetectedCurrency" in t &&
            typeof t.aiDetectedCurrency === "string"
              ? t.aiDetectedCurrency
              : currencyCode,
        },
      };
    }),
    groups: [],
    removedEvidenceKeys: [],
    filter: "all",
    revision: "0",
    operationGeneration: "0",
    saveIntent: null,
  });
}
