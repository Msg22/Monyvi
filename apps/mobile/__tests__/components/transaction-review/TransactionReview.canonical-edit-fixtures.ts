/**
 * #395 PR396 canonical component tests: genuine reciprocal group/removal fixtures.
 * Pure canonical reducer transitions; no test mocks or alternate review authority.
 */
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
} from "@monyvi/logic";
import i18next from "i18next";
import enTransactions from "@/locales/en/transactions.json";
import type { UseAccountReviewResult } from "@/hooks/useAccountReview";
import {
  reduceAccountReviewCommand,
  type ReviewUndoLease,
} from "../../../../../packages/logic/src/account-review/reducer";
import type { AccountReviewSession } from "../../../../../packages/logic/src/account-review/review-schemas";
import { makeOwnedContext } from "../../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  makeT025ReviewSession,
  makeT025SmsOriginal,
  T025_IDS,
} from "../../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";

export const SECOND_GROUP_ID = "00000000-0000-4000-8000-000000002507";
export const SECOND_UNDO_ID = "00000000-0000-4000-8000-000000002508";

/** Two genuinely reciprocal suggested groups; the pure reducer owns BOTH removals. */
export function twoGroupSession(): AccountReviewSession {
  const original = makeT025ReviewSession(
    T025_IDS.queue,
    [makeT025SmsOriginal(0), makeT025SmsOriginal(1)],
    [T025_IDS.rowOne, T025_IDS.rowTwo]
  );
  const group = original.groups[0];
  if (!group) throw new Error("missing_two_group_fixture_base");
  return accountReviewSessionSchema.parse({
    ...original,
    groups: [
      { ...group, linkedRowIds: [T025_IDS.rowOne] },
      {
        ...group,
        groupId: SECOND_GROUP_ID,
        name: "QNB Two",
        evidenceKey: "b".repeat(64),
        suggestionRefs: ["t025-second-independent-suggestion"],
        linkedRowIds: [T025_IDS.rowTwo],
      },
    ],
    rows: original.rows.map((row) =>
      row.rowId === T025_IDS.rowTwo && row.assignment.state === "suggested"
        ? {
            ...row,
            assignment: { ...row.assignment, groupId: SECOND_GROUP_ID },
          }
        : row
    ),
  });
}
export function removeActualGroup(
  session: AccountReviewSession,
  groupId: string,
  token: string,
  undo: ReviewUndoLease | null
): ReturnType<typeof reduceAccountReviewCommand> {
  const group = session.groups.find((item) => item.groupId === groupId);
  if (!group) throw new Error("missing_real_group_for_removal");
  return reduceAccountReviewCommand({
    state: session,
    command: accountReviewCommandSchema.parse({
      kind: "remove_group",
      ownerId: session.ownerId,
      sessionId: session.sessionId,
      expectedReviewRevision: session.revision,
      expectedOperationGeneration: session.operationGeneration,
      groupId,
      expectedGroupRevision: group.revision,
    }),
    accountSnapshots: makeOwnedContext(),
    nextUndoToken: token,
    undo,
  });
}

/** The same singleton used by the presentation helper's direct i18next t import. */
export async function initializeCanonicalReviewTranslations(): Promise<void> {
  await i18next.init({
    lng: "en",
    fallbackLng: "en",
    ns: ["transactions"],
    defaultNS: "transactions",
    resources: { en: { transactions: enTransactions } },
    interpolation: { escapeValue: false },
  });
}

/** The facade exposes fully shaped account choices, not raw account snapshots. */
export function toFacadeChoiceCandidate(
  account: ReturnType<typeof makeOwnedContext>["accounts"][number]
): ReturnType<UseAccountReviewResult["getAccountCandidates"]>[number] {
  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
    type: account.type,
    institutionId: account.institutionId ?? null,
    providerDisplayName: account.providerDisplayName ?? null,
    cardLast4: account.cardLast4 ?? null,
    isDefault: account.isDefault,
  };
}

export function makeUnconfirmedCurrencyReview(
  sourceSession: AccountReviewSession
): AccountReviewSession {
  const row = sourceSession.rows[0];
  if (!row) throw new Error("missing_real_currency_row");
  return accountReviewSessionSchema.parse({
    ...sourceSession,
    // Unconfirmed currency cannot authorize an active suggested group.
    // Keep the original transaction/evidence, but require an explicit
    // currency confirmation and an independent later account choice.
    groups: [],
    rows: [
      {
        ...row,
        selected: false,
        assignment: {
          state: "unresolved",
          accountId: null,
          reasonCode: "account_needed",
          candidateAccountIds: [],
        },
        currency: {
          state: "unconfirmed",
          reason: "conflicting",
          candidateCodes: ["EGP", "USD"],
          statedCode: "EGP",
          evidenceSpans: [],
        },
        reviewReasons: ["account_needed", "currency_confirmation_needed"],
      },
    ],
  });
}
