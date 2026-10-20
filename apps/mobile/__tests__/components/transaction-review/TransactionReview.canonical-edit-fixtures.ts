/**
 * #395 PR396 canonical component tests: genuine reciprocal group/removal fixtures.
 * Pure reducer fixtures and a scoped presentation-only test host; no alternate review authority.
 */
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
} from "@monyvi/logic";
import type React from "react";
import i18next from "i18next";
import enTransactions from "@/locales/en/transactions.json";
import type { UseAccountReviewResult } from "@/hooks/useAccountReview";
import type { AccountReviewPanelProps } from "@/components/transaction-review/AccountReviewPanel";
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

/** Canonical compact row host with the visible-index discard callback. */
export function renderCanonicalReviewTransactionItem({
  onPress,
  onDiscard,
  isSelected,
  index,
  accountReview,
  accountName,
}: {
  index: number;
  isSelected: boolean;
  onDiscard?: (visibleIndex: number, wasSelected: boolean) => void;
  onPress: (index: number) => void;
  accountName: string | null;
  accountReview: {
    onChooseAccount: (rowId: string) => void;
    onChooseCurrency: (rowId: string, context: string) => void;
    rowId: string;
    accountStatusTone?: string;
    accountStatusLabel?: string | null;
  };
}): React.JSX.Element {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const RN = jest.requireActual<typeof import("react-native")>("react-native");
  return ReactActual.createElement(
    RN.View,
    null,
    onDiscard
      ? ReactActual.createElement(
          RN.TouchableOpacity,
          {
            testID: "sms-review-discard-" + index,
            onPress: () => onDiscard(index, isSelected),
          },
          ReactActual.createElement(RN.Text, null, "Discard")
        )
      : null,
    ReactActual.createElement(
      RN.Text,
      {
        testID: "pr-account-tone-" + index,
      },
      accountReview.accountStatusTone ?? "neutral"
    ),
    ReactActual.createElement(
      RN.Text,
      {
        testID: "pr-source-account-" + index,
      },
      accountName ?? ""
    ),
    ReactActual.createElement(
      RN.Text,
      { testID: "pr-account-status-" + index },
      accountReview.accountStatusLabel ?? ""
    ),
    ReactActual.createElement(
      RN.TouchableOpacity,
      { testID: "canonical-edit-row", onPress: () => onPress(index) },
      ReactActual.createElement(RN.Text, null, "Row")
    ),
    ReactActual.createElement(
      RN.TouchableOpacity,
      {
        testID: "canonical-choose-account",
        onPress: () => accountReview.onChooseAccount(accountReview.rowId),
      },
      ReactActual.createElement(RN.Text, null, "Account")
    ),
    ReactActual.createElement(
      RN.TouchableOpacity,
      {
        testID: "canonical-choose-currency",
        onPress: () =>
          accountReview.onChooseCurrency(accountReview.rowId, "context"),
      },
      ReactActual.createElement(RN.Text, null, "Currency")
    )
  );
}

/** Source and Cash are two distinct owned SMS ATM endpoints. */
export function makeExistingT025AtmChoiceReview(): {
  readonly session: AccountReviewSession;
  readonly owned: ReturnType<typeof makeOwnedContext>["accounts"];
  readonly bank: ReturnType<typeof makeOwnedContext>["accounts"][number];
  readonly cash: ReturnType<typeof makeOwnedContext>["accounts"][number];
} {
  const sourceSession = makeT025ReviewSession();
  const row = sourceSession.rows[0];
  const owned = makeOwnedContext().accounts;
  const bank = owned.find((account) => account.type === "BANK");
  const cash = owned.find((account) => account.type === "CASH");
  if (!row || !bank || !cash)
    throw new Error("missing_real_owned_atm_endpoints");
  const session = accountReviewSessionSchema.parse({
    ...sourceSession,
    groups: [],
    rows: [
      {
        ...row,
        assignment: {
          state: "existing",
          accountId: bank.id,
          origin: "user",
          currency: "EGP",
          identityRevision: "0",
        },
        toAssignment: {
          state: "existing",
          accountId: cash.id,
          origin: "user",
          currency: "EGP",
          identityRevision: "0",
        },
        transaction: {
          ...row.transaction,
          isAtmWithdrawal: true,
          toAccountId: cash.id,
        },
        reviewReasons: [],
      },
    ],
  });
  return { session, owned, bank, cash };
}

/** Visible index zero still maps to original SMS index one. */
export function makeSelectedSecondT025Review(): {
  readonly original: AccountReviewSession;
  readonly filtered: AccountReviewSession;
} {
  const original = makeT025ReviewSession(
    T025_IDS.queue,
    [makeT025SmsOriginal(0), makeT025SmsOriginal(1)],
    [T025_IDS.rowOne, T025_IDS.rowTwo]
  );
  return {
    original,
    filtered: accountReviewSessionSchema.parse({
      ...original,
      filter: "selected",
      rows: original.rows.map((row, index) => ({
        ...row,
        selected: index === 1,
      })),
    }),
  };
}

/**
 * Presentation-only test host for the canonical container integration suite.
 * The separate AccountReviewPanel component suite renders the REAL panel.
 * This host forwards parent-provided counts and callbacks without reproducing
 * selection, review-filter, Save or Undo/Discard domain decisions.
 */
export function renderCanonicalAccountReviewPanel(
  props: AccountReviewPanelProps
): React.JSX.Element {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const RN = jest.requireActual<typeof import("react-native")>("react-native");
  const touch = (
    testID: string,
    label: string,
    onPress: () => void,
    selected?: boolean
  ): React.JSX.Element =>
    ReactActual.createElement(
      RN.TouchableOpacity,
      {
        key: testID,
        testID,
        onPress,
        ...(selected === undefined ? {} : { accessibilityState: { selected } }),
      },
      ReactActual.createElement(RN.Text, null, label)
    );
  return ReactActual.createElement(
    RN.View,
    { testID: "canonical-review-panel" },
    // The real compact card omits account/currency action rows: those belong
    // to the dedicated Account needed tab. Only other issue labels remain.
    ...(props.summary.issues ?? [])
      .filter(
        (issue) =>
          issue.key !== "account_review_issue_account" &&
          issue.key !== "account_review_issue_currency"
      )
      .map((issue) =>
        ReactActual.createElement(
          RN.Text,
          { key: issue.key, testID: "pr-localized-row-issue" },
          issue.label
        )
      ),
    ReactActual.createElement(
      RN.Text,
      { testID: "pr-account-needed-count" },
      String(props.accountNeededCount)
    ),
    touch(
      "pr-account-needed-tab",
      "Account needed",
      props.onAccountNeededPress,
      props.accountNeededActive
    ),
    ...(props.temporaryScopeActive
      ? [touch("pr-show-all", "Show all", props.onShowAll)]
      : []),
    ...props.groups.flatMap((group) => [
      group.canRemove
        ? touch("pr-remove-" + group.groupId, "Remove", () =>
            props.onRemove(group.groupId)
          )
        : null,
      group.canUndo
        ? touch("pr-undo-" + group.groupId, "Undo", () =>
            props.onUndo(group.groupId)
          )
        : null,
      group.isRemoved && props.onDiscardRemoved
        ? touch("pr-discard-" + group.groupId, "Discard", () =>
            props.onDiscardRemoved?.(group.groupId)
          )
        : null,
      group.linkedCount > 0 && props.onViewLinked
        ? touch("pr-linked-" + group.groupId, "View linked", () =>
            props.onViewLinked?.(group.groupId)
          )
        : null,
    ])
  );
}
