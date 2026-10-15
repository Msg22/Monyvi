/**
 * #395 T019 refresh regression fixtures: reuse accepted T017 source/session
 * builders and canonical typed owned snapshots. Synthetic evidence only.
 */
import type { AccountReviewSession } from "../schemas";
import { makeEvidenceSpan, REVIEW_WIRE_IDS } from "./fixtures";
import {
  R17,
  account,
  explicitEvidence,
  known,
  session,
  snapshots,
  withRow,
  type ResolutionSnapshots,
  type ScopedAccount,
} from "./resolution-fixtures";

type ReviewSource = AccountReviewSession["source"];

interface DefaultConflictCase {
  readonly name: string;
  readonly source: ReviewSource;
  readonly accounts: readonly ScopedAccount[];
}

/** More than one global default is inconsistent, even when only one survives
 * the row's currency and SMS-source-type eligibility filters. */
export const DEFAULT_CONFLICT_CASES: readonly DefaultConflictCase[] = [
  {
    name: "EGP Bank and USD Bank",
    source: "SMS",
    accounts: [
      account(R17.bank, { isDefault: true }),
      account(R17.secondBank, { currency: "USD", isDefault: true }),
    ],
  },
  {
    name: "EGP Bank and USD Wallet",
    source: "SMS",
    accounts: [
      account(R17.bank, { isDefault: true }),
      account(R17.wallet, {
        name: "Wallet",
        type: "DIGITAL_WALLET",
        currency: "USD",
        providerDisplayName: null,
        senderNames: [],
        isDefault: true,
      }),
    ],
  },
  {
    name: "EGP Bank and EGP Cash (ordinary SMS)",
    source: "SMS",
    accounts: [
      account(R17.bank, { isDefault: true }),
      account(R17.cash, {
        name: "Cash",
        type: "CASH",
        providerDisplayName: null,
        senderNames: [],
        isDefault: true,
      }),
    ],
  },
  {
    name: "EGP Cash and USD Bank (Voice)",
    source: "VOICE",
    accounts: [
      account(R17.cash, {
        name: "Cash",
        type: "CASH",
        providerDisplayName: null,
        senderNames: [],
        isDefault: true,
      }),
      account(R17.bank, { currency: "USD", isDefault: true }),
    ],
  },
];

export function capturedOmission(source: ReviewSource): AccountReviewSession {
  return withRow(session(source), (row) => ({
    ...row,
    currency: known("EGP", "preferred_omission"),
  }));
}

/** Fresh profile changes USD but remains internally consistent and same-owner. */
export function freshPreferredUsd(): ResolutionSnapshots {
  return snapshots([account(R17.bank, { isDefault: true })], R17.owner, "USD");
}

export function groundedNoCard(source: ReviewSource): AccountReviewSession {
  return withRow(session(source), (row) => ({
    ...row,
    accountEvidence: explicitEvidence(source),
  }));
}

/** The stated card has its own real synthetic UTF-16 source span. */
export function groundedStatedCard(
  source: ReviewSource,
  cardLast4: string
): AccountReviewSession {
  return withRow(groundedNoCard(source), (row) => {
    const base = explicitEvidence(source);
    if (row.source === "VOICE") {
      const original =
        row.transaction.originalTranscript + " card " + cardLast4;
      return {
        ...row,
        accountEvidence: {
          ...base,
          cardLast4,
          evidenceSpans: [
            ...base.evidenceSpans,
            makeEvidenceSpan(
              REVIEW_WIRE_IDS.voiceRequestKey,
              "transcript",
              original,
              cardLast4
            ),
          ],
        },
        transaction: { ...row.transaction, originalTranscript: original },
      };
    }
    const original = row.transaction.rawSmsBody + " card " + cardLast4;
    return {
      ...row,
      accountEvidence: {
        ...base,
        cardLast4,
        evidenceSpans: [
          ...base.evidenceSpans,
          makeEvidenceSpan(
            REVIEW_WIRE_IDS.smsMessageId,
            "body",
            original,
            cardLast4
          ),
        ],
      },
      transaction: { ...row.transaction, rawSmsBody: original },
    };
  });
}

export function qnbCardAccounts(): readonly ScopedAccount[] {
  return [
    account(R17.bank, { cardLast4: "1234" }),
    account(R17.secondBank, { cardLast4: "5678" }),
  ];
}
