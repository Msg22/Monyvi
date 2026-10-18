/** PR396 follow-up: a known account-type change must not reuse prior-type identity. */
import { reduceAccountReviewCommand } from "../reducer";
import {
  accountReviewSessionSchema,
  type AccountReviewSession,
} from "../review-schemas";
import type { AccountReviewOwnedContext } from "../normalization-types";
import {
  makeAccountEvidence,
  REVIEW_VOICE_TRANSCRIPT,
  REVIEW_WIRE_IDS,
} from "./fixtures";

const GROUP_ID = "00000000-0000-4000-8000-000000000220";
const ROW_ID = "00000000-0000-4000-8000-000000000221";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000222";
const ORIGINAL_IDENTITY = {
  institutionId: "qnb-bank",
  providerDisplayName: "QNB",
  cardLast4: "0007",
  senderNames: ["QNBEG"],
};

const owned: AccountReviewOwnedContext = {
  ownerId: REVIEW_WIRE_IDS.ownerId,
  preferredCurrency: "EGP",
  accounts: [],
  providerContext: {
    reviewContractVersion: "account-review/v2",
    preferredCurrency: "EGP",
    accounts: [],
  },
};

function bankSession(): AccountReviewSession {
  return accountReviewSessionSchema.parse({
    ownerId: REVIEW_WIRE_IDS.ownerId,
    sessionId: "00000000-0000-4000-8000-000000000223",
    source: "VOICE",
    sourceRevision: "0",
    preferredCurrency: "EGP",
    rows: [
      {
        rowId: ROW_ID,
        source: "VOICE",
        sourceRef: REVIEW_WIRE_IDS.voiceRowRef,
        sourceFingerprint: null,
        amountDecimal: "50",
        accountEvidence: makeAccountEvidence("VOICE"),
        toAccountEvidence: null,
        currency: { state: "known", code: "EGP", origin: "explicit" },
        assignment: {
          state: "suggested",
          accountId: null,
          groupId: GROUP_ID,
          groupRevision: "0",
          confirmation: "confirmed",
        },
        toAssignment: null,
        reviewReasons: [],
        selected: false,
        revision: "0",
        hasUserAccountOverride: false,
        hasUserCurrencyOverride: false,
        transaction: {
          amount: 50,
          currency: "EGP",
          type: "EXPENSE",
          date: new Date("2026-10-14T12:00:00.000Z"),
          categoryId: CATEGORY_ID,
          categoryDisplayName: "Food",
          confidence: 0.95,
          originLabel: "voice",
          source: "VOICE",
          note: "",
          originalTranscript: REVIEW_VOICE_TRANSCRIPT,
          detectedLanguage: "en",
          aiDetectedCurrency: "EGP",
        },
      },
    ],
    groups: [
      {
        groupId: GROUP_ID,
        evidenceKey: "a".repeat(64),
        suggestionRefs: [REVIEW_WIRE_IDS.suggestionRef],
        name: "QNB salary",
        type: "BANK",
        currency: "EGP",
        ...ORIGINAL_IDENTITY,
        linkedRowIds: [ROW_ID],
        status: "confirmed",
        revision: "0",
        confirmedIdentityRevision: "0",
      },
    ],
    removedEvidenceKeys: [],
    filter: "all",
    revision: "0",
    operationGeneration: "0",
    saveIntent: null,
  });
}

function edit(
  state: AccountReviewSession,
  type: "BANK" | "CASH" | "DIGITAL_WALLET",
  name: string
): ReturnType<typeof reduceAccountReviewCommand> {
  return reduceAccountReviewCommand({
    state,
    command: {
      kind: "edit_group",
      ownerId: state.ownerId,
      sessionId: state.sessionId,
      expectedReviewRevision: state.revision,
      expectedOperationGeneration: state.operationGeneration,
      groupId: GROUP_ID,
      expectedGroupRevision: state.groups[0]?.revision ?? "0",
      reconfirm: true,
      identity: { name, type, ...ORIGINAL_IDENTITY },
    },
    accountSnapshots: owned,
    nextUndoToken: null,
    undo: null,
  });
}

describe("PR396 group account-type identity", () => {
  it.each(["CASH", "DIGITAL_WALLET"] as const)(
    "clears stale Bank identity when edited to %s without remapping members",
    (type) => {
      const initial = bankSession();
      const outcome = edit(initial, type, "Pocket account");
      expect(outcome.reasonCodes).toEqual([]);
      expect(outcome.effect).toBe("session_only");
      const group = outcome.state.groups[0];
      expect(group).toMatchObject({
        groupId: GROUP_ID,
        evidenceKey: "a".repeat(64),
        suggestionRefs: [REVIEW_WIRE_IDS.suggestionRef],
        linkedRowIds: [ROW_ID],
        currency: "EGP",
        name: "Pocket account",
        type,
        institutionId: null,
        providerDisplayName: null,
        cardLast4: null,
        senderNames: [],
        status: "confirmed",
        revision: "1",
        confirmedIdentityRevision: "1",
      });
      expect(outcome.state.rows[0]?.assignment).toEqual({
        state: "suggested",
        accountId: null,
        groupId: GROUP_ID,
        groupRevision: "1",
        confirmation: "confirmed",
      });
      expect(initial.groups[0]?.institutionId).toBe("qnb-bank");
      accountReviewSessionSchema.parse(outcome.state);
    }
  );

  it("preserves provider/card/sender identity on same-type nickname edit", () => {
    const outcome = edit(bankSession(), "BANK", "Renamed QNB");
    expect(outcome.reasonCodes).toEqual([]);
    expect(outcome.state.groups[0]).toMatchObject({
      name: "Renamed QNB",
      type: "BANK",
      ...ORIGINAL_IDENTITY,
      groupId: GROUP_ID,
      linkedRowIds: [ROW_ID],
      revision: "1",
      confirmedIdentityRevision: "1",
    });
    expect(outcome.state.rows[0]?.assignment).toMatchObject({
      groupId: GROUP_ID,
      groupRevision: "1",
    });
  });

  it("checks duplicate names against cleared rather than stale Bank institution", () => {
    const state = bankSession();
    const collision = accountReviewSessionSchema.parse({
      ...state,
      groups: [
        ...state.groups,
        {
          ...state.groups[0],
          groupId: "00000000-0000-4000-8000-000000000224",
          evidenceKey: "b".repeat(64),
          linkedRowIds: [],
          name: "Pocket account",
          type: "CASH",
          institutionId: null,
          providerDisplayName: null,
          cardLast4: null,
          senderNames: [],
        },
      ],
    });
    const outcome = edit(collision, "CASH", "Pocket account");
    expect(outcome.reasonCodes).toEqual(["account_group_snapshot_conflict"]);
    expect(outcome.state).toBe(collision);
    expect(outcome.effect).toBe("none");
  });
});
