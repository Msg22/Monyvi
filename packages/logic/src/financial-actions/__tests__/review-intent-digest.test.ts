/**
 * #395 T046 contract RED for the not-yet-created pure frozen-intent helper.
 * Missing ../review-intent-digest is honest module-creation Red. Unlike the
 * companion wire suite, this file is intentionally not yet loadable.
 */
import {
  accountReviewSaveIntentSchema,
  accountReviewSessionSchema,
  type AccountReviewSaveIntent,
  type AccountReviewSession,
} from "../../account-review/review-schemas";
import { normalizeAccountReviewParserResult } from "../../account-review/normalization";
import { uuidV8FromSha256 } from "../../account-review/identity";
import {
  COMMAND_IDS,
  groupByName,
  qnbCibReview,
  reviewWithReadyRow,
} from "../../account-review/__tests__/review-command-fixtures";
import {
  makeTwoSmsInput,
  syntheticHashProvider,
} from "../../account-review/__tests__/normalization-fixtures";
import type { ReviewBatchSavePayload } from "../review-batch-save-shapes";
import {
  serializeCanonicalJsonValue,
  type Sha256Provider,
} from "../action-contracts";
import { MAX_TRANSACTION_AMOUNT } from "../../utils/amount-helpers";
import { computeAccountReviewFrozenIntentDigest } from "../review-intent-digest";
import {
  BANK_DETAILS_ID,
  NEW_BANK_ACCOUNT_ID,
  REVIEW_ACTION_ID,
  REVIEW_USER_ID,
  REVIEW_INCOME_RECORD_ID,
  REVIEW_EXPENSE_RECORD_ID,
  REVIEW_OCCURRED_AT,
} from "./review-batch-save-fixtures";

const REVIEW_SENDER_CREATE_ID = "5a000000-0000-4000-8000-000000000001";

type CapturedSnapshot = ReviewBatchSavePayload["creationDefaultSnapshot"];

interface FrozenCase {
  readonly session: AccountReviewSession;
  readonly intent: AccountReviewSaveIntent;
  readonly creationDefaultSnapshot: CapturedSnapshot;
}

function freezeCase(
  session: AccountReviewSession,
  planned: AccountReviewSaveIntent["plannedEntityIds"],
  creationDefaultSnapshot: CapturedSnapshot = undefined
): FrozenCase {
  const selected = session.rows.filter((row) => row.selected);
  if (selected.length === 0) throw new Error("Missing selected test rows");
  const referenced = new Set(
    selected.flatMap((row) => [
      ...(row.assignment.state === "suggested" ? [row.assignment.groupId] : []),
      ...(row.toAssignment?.state === "suggested"
        ? [row.toAssignment.groupId]
        : []),
    ])
  );
  const groups = session.groups.filter((group) =>
    referenced.has(group.groupId)
  );
  if (
    groups.length !== referenced.size ||
    groups.some((g) => g.status !== "confirmed")
  ) {
    throw new Error("Noncanonical confirmed-group test setup");
  }
  const intent = accountReviewSaveIntentSchema.parse({
    actionId: REVIEW_ACTION_ID,
    ownerId: session.ownerId,
    source: session.source,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    selectedRows: selected.map((row) => ({
      rowId: row.rowId,
      revision: row.revision,
    })),
    confirmedGroups: groups.map((group) => ({
      groupId: group.groupId,
      revision: group.revision,
      evidenceKey: group.evidenceKey,
    })),
    plannedEntityIds: planned,
    occurredAt: REVIEW_OCCURRED_AT,
  });
  return {
    session: accountReviewSessionSchema.parse({
      ...session,
      saveIntent: intent,
    }),
    intent,
    creationDefaultSnapshot,
  };
}

function callDigest(fixture: FrozenCase): Promise<string> {
  return computeAccountReviewFrozenIntentDigest({
    session: fixture.session,
    intent: fixture.intent,
    creationDefaultSnapshot: fixture.creationDefaultSnapshot,
    hashProvider: syntheticHashProvider,
  });
}

async function voiceCase(): Promise<FrozenCase> {
  const initial = await reviewWithReadyRow();
  const selected = accountReviewSessionSchema.parse({
    ...initial,
    rows: initial.rows.map((row) =>
      row.rowId === COMMAND_IDS.readyRow ? { ...row, selected: true } : row
    ),
  });
  return freezeCase(selected, [
    {
      entity: "transaction",
      localRef: COMMAND_IDS.readyRow,
      id: REVIEW_INCOME_RECORD_ID,
    },
  ]);
}

async function smsCase(): Promise<FrozenCase> {
  const normalized =
    await normalizeAccountReviewParserResult(makeTwoSmsInput());
  const state = accountReviewSessionSchema.parse({
    ...normalized,
    groups: [],
    rows: normalized.rows.map((row) => ({
      ...row,
      selected: true,
      reviewReasons: [],
      assignment: {
        state: "existing" as const,
        origin: "user" as const,
        accountId: COMMAND_IDS.qnbAccount,
        currency: "EGP" as const,
        identityRevision: row.revision,
      },
      hasUserAccountOverride: true,
    })),
  });
  const selected = state.rows.filter((row) => row.selected);
  if (selected.length !== 2)
    throw new Error("Expected both canonical SMS rows");
  return freezeCase(
    state,
    selected.map((row, index) => ({
      entity: "transaction",
      localRef: row.rowId,
      id: index === 0 ? REVIEW_INCOME_RECORD_ID : REVIEW_EXPENSE_RECORD_ID,
    }))
  );
}

async function childRef(
  session: AccountReviewSession,
  groupId: string,
  entity: "bank_details" | "account_sms_sender",
  normalized?: string
): Promise<string> {
  const parts = [
    "account-review-localref/v1",
    session.ownerId,
    session.sessionId,
    groupId,
    entity,
  ];
  if (normalized !== undefined) parts.push(normalized);
  return uuidV8FromSha256(
    await syntheticHashProvider.digestUtf8(JSON.stringify(parts))
  );
}

async function groupedCase(): Promise<FrozenCase> {
  const before = await qnbCibReview();
  const original = groupByName(before, "QNB");
  const selectedId = original.linkedRowIds[0];
  if (!selectedId) throw new Error("Missing QNB member");
  const state = accountReviewSessionSchema.parse({
    ...before,
    groups: before.groups.map((group) =>
      group.groupId === original.groupId
        ? {
            ...group,
            status: "confirmed",
            revision: "1",
            confirmedIdentityRevision: "1",
          }
        : group
    ),
    rows: before.rows.map((row) =>
      row.assignment.state === "suggested" &&
      row.assignment.groupId === original.groupId
        ? {
            ...row,
            selected: row.rowId === selectedId,
            assignment: {
              ...row.assignment,
              groupRevision: "1",
              confirmation: "confirmed",
            },
            reviewReasons: row.reviewReasons.filter(
              (reason) => reason !== "account_group_unconfirmed"
            ),
          }
        : row
    ),
  });
  const plan: AccountReviewSaveIntent["plannedEntityIds"] = [
    {
      entity: "transaction",
      localRef: selectedId,
      id: REVIEW_INCOME_RECORD_ID,
    },
    { entity: "account", localRef: original.groupId, id: NEW_BANK_ACCOUNT_ID },
    {
      entity: "bank_details",
      localRef: await childRef(state, original.groupId, "bank_details"),
      id: BANK_DETAILS_ID,
    },
    {
      entity: "account_sms_sender",
      localRef: await childRef(
        state,
        original.groupId,
        "account_sms_sender",
        "qnb"
      ),
      id: REVIEW_SENDER_CREATE_ID,
    },
  ];
  return freezeCase(state, plan, {
    activeAccountIds: [COMMAND_IDS.qnbAccount],
    defaultAccount: { accountId: COMMAND_IDS.qnbAccount, isDefault: true },
  });
}

function revised(
  original: FrozenCase,
  state: AccountReviewSession,
  changes: Partial<AccountReviewSaveIntent> = {}
): FrozenCase {
  const intent = accountReviewSaveIntentSchema.parse({
    ...original.intent,
    ...changes,
  });
  return {
    ...original,
    session: accountReviewSessionSchema.parse({ ...state, saveIntent: intent }),
    intent,
  };
}

describe("#395 pure frozen-intent SHA-256 projection — module creation Red", () => {
  it("pins the v1 domain prefix and canonical minimal SHA-256 preimage", async () => {
    const canonicalText = serializeCanonicalJsonValue([
      "monyvi.account-review.frozen-intent",
      "v1",
      {
        selectedRows: [],
        scope: { ownerId: REVIEW_USER_ID, actionId: REVIEW_ACTION_ID },
      },
    ]);
    expect(canonicalText).toBe(
      '["monyvi.account-review.frozen-intent","v1",{"scope":{"actionId":' +
        '"11111111-1111-4111-8111-111111111111","ownerId":' +
        '"22222222-2222-4222-8222-222222222222"},"selectedRows":[]}]'
    );
    expect(await syntheticHashProvider.digestUtf8(canonicalText)).toBe(
      "2a21a107282acab1369ab302548ed22135d915e22e8b149712f7e8358162ce10"
    );
  });

  it("hashes canonical original Voice selection with a lowercase 64-hex result", async () => {
    const fixture = await voiceCase();
    const digest = await callDigest(fixture);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(await callDigest(fixture)).toBe(digest);
  });

  it("is invariant to property and original selected row/plan member order", async () => {
    const fixture = await smsCase();
    const reordered = revised(
      fixture,
      accountReviewSessionSchema.parse({
        ...fixture.session,
        rows: [...fixture.session.rows].reverse(),
        saveIntent: null,
      }),
      {
        selectedRows: [...fixture.intent.selectedRows].reverse(),
        plannedEntityIds: [...fixture.intent.plannedEntityIds].reverse(),
      }
    );
    expect(await callDigest(reordered)).toBe(await callDigest(fixture));
  });

  it("binds the financial content of SMS row A even if it is omitted after dedup", async () => {
    const fixture = await smsCase();
    const first = fixture.session.rows[0];
    if (!first || first.source !== "SMS")
      throw new Error("Missing selected SMS source A");
    const changed = revised(
      fixture,
      accountReviewSessionSchema.parse({
        ...fixture.session,
        saveIntent: null,
        rows: fixture.session.rows.map((row) =>
          row.rowId === first.rowId
            ? {
                ...first,
                amountDecimal: "99",
                transaction: {
                  ...first.transaction,
                  amount: 99,
                },
              }
            : row
        ),
      })
    );
    expect(changed.intent).toEqual(fixture.intent);
    expect(await callDigest(changed)).not.toBe(await callDigest(fixture));
  });

  it("binds omitted SMS source identity, not merely the amount of an existing saved record", async () => {
    const fixture = await smsCase();
    const first = fixture.session.rows[0];
    if (!first || first.source !== "SMS")
      throw new Error("Missing original SMS A");
    const changedFingerprint = "f".repeat(64);
    const altered = accountReviewSessionSchema.parse({
      ...fixture.session,
      saveIntent: null,
      rows: fixture.session.rows.map((row) =>
        row.rowId === first.rowId
          ? {
              ...first,
              sourceFingerprint: changedFingerprint,
              transaction: {
                ...first.transaction,
                smsFingerprint: changedFingerprint,
              },
            }
          : row
      ),
    });
    expect(await callDigest(revised(fixture, altered))).not.toBe(
      await callDigest(fixture)
    );
  });

  it("detects an altered original selection with the same action ID and occurrence", async () => {
    const fixture = await smsCase();
    const removed = fixture.session.rows[0];
    if (!removed) throw new Error("Missing SMS source");
    const state = accountReviewSessionSchema.parse({
      ...fixture.session,
      saveIntent: null,
      rows: fixture.session.rows.map((row) =>
        row.rowId === removed.rowId ? { ...row, selected: false } : row
      ),
    });
    const changed = freezeCase(
      state,
      fixture.intent.plannedEntityIds.filter(
        (item) => item.localRef !== removed.rowId
      )
    );
    expect(changed.intent.actionId).toBe(fixture.intent.actionId);
    expect(await callDigest(changed)).not.toBe(await callDigest(fixture));
  });

  it("binds the original confirmed evidence key despite unchanged group ID and revision", async () => {
    const fixture = await groupedCase();
    const original = groupByName(fixture.session, "QNB");
    const changedKey = "f".repeat(64);
    const intent = accountReviewSaveIntentSchema.parse({
      ...fixture.intent,
      confirmedGroups: fixture.intent.confirmedGroups.map((group) =>
        group.groupId === original.groupId
          ? { ...group, evidenceKey: changedKey }
          : group
      ),
    });
    const modified = accountReviewSessionSchema.parse({
      ...fixture.session,
      saveIntent: intent,
      groups: fixture.session.groups.map((group) =>
        group.groupId === original.groupId
          ? { ...group, evidenceKey: changedKey }
          : group
      ),
    });
    expect(
      await callDigest({ ...fixture, session: modified, intent })
    ).not.toBe(await callDigest(fixture));
  });

  it("rejects a schema-valid confirmed-Bank round-trip mismatch before the first hash call", async () => {
    const fixture = await groupedCase();
    const selected = fixture.session.rows.find((row) => row.selected);
    if (!selected) throw new Error("Missing confirmed Bank selected row");
    const alteredSession = accountReviewSessionSchema.parse({
      ...fixture.session,
      rows: fixture.session.rows.map((row) =>
        row.rowId === selected.rowId
          ? {
              ...row,
              amountDecimal: String(row.transaction.amount + 1),
            }
          : row
      ),
    });
    const digestedPreimages: string[] = [];
    const hashProvider: Sha256Provider = {
      digestUtf8: (value: string): Promise<string> => {
        digestedPreimages.push(value);
        return syntheticHashProvider.digestUtf8(value);
      },
    };
    await expect(
      computeAccountReviewFrozenIntentDigest({
        ...fixture,
        session: alteredSession,
        hashProvider,
      })
    ).rejects.toThrow("account_review_intent_digest_amount_roundtrip");
    expect(digestedPreimages).toEqual([]);
  });

  it("rejects a confirmed-Bank amount beyond the canonical maximum before any hash call", async () => {
    const fixture = await groupedCase();
    const selected = fixture.session.rows.find((row) => row.selected);
    if (!selected) throw new Error("Missing confirmed Bank selected row");
    const excessiveAmount = MAX_TRANSACTION_AMOUNT + 1;
    // The strict review maximum makes actual 64-bit minor overflow unreachable:
    // BTC's maximum 8-decimal amount also fits a signed 64-bit minor integer.
    const alteredSession: AccountReviewSession = {
      ...fixture.session,
      rows: fixture.session.rows.map((row) =>
        row.rowId === selected.rowId && row.source === "VOICE"
          ? {
              ...row,
              amountDecimal: String(excessiveAmount),
              transaction: { ...row.transaction, amount: excessiveAmount },
            }
          : row
      ),
    };
    expect(accountReviewSessionSchema.safeParse(alteredSession).success).toBe(
      false
    );
    const digestedPreimages: string[] = [];
    const hashProvider: Sha256Provider = {
      digestUtf8: (value: string): Promise<string> => {
        digestedPreimages.push(value);
        return syntheticHashProvider.digestUtf8(value);
      },
    };
    await expect(
      computeAccountReviewFrozenIntentDigest({
        ...fixture,
        session: alteredSession,
        hashProvider,
      })
    ).rejects.toThrow();
    expect(digestedPreimages).toEqual([]);
  });

  it("binds the frozen Bank child ID and rejects an extra unused sender plan", async () => {
    const fixture = await groupedCase();
    const changedPlan = fixture.intent.plannedEntityIds.map((item) =>
      item.entity === "account_sms_sender"
        ? { ...item, id: COMMAND_IDS.outsideAccount }
        : item
    );
    const changed = revised(fixture, fixture.session, {
      plannedEntityIds: changedPlan,
    });
    expect(await callDigest(changed)).not.toBe(await callDigest(fixture));

    const extra = accountReviewSaveIntentSchema.parse({
      ...fixture.intent,
      plannedEntityIds: [
        ...fixture.intent.plannedEntityIds,
        {
          entity: "account_sms_sender",
          localRef: COMMAND_IDS.otherOwner,
          id: COMMAND_IDS.otherSession,
        },
      ],
    });
    const invalid = accountReviewSessionSchema.parse({
      ...fixture.session,
      saveIntent: extra,
    });
    await expect(
      callDigest({ ...fixture, session: invalid, intent: extra })
    ).rejects.toThrow();
  });

  it("canonicalizes sender alias order and stable case-variant membership", async () => {
    const fixture = await groupedCase();
    const qnb = groupByName(fixture.session, "QNB");
    const reorder = (names: readonly string[]): FrozenCase => {
      const session = accountReviewSessionSchema.parse({
        ...fixture.session,
        groups: fixture.session.groups.map((group) =>
          group.groupId === qnb.groupId
            ? { ...group, senderNames: names }
            : group
        ),
      });
      return { ...fixture, session };
    };
    expect(await callDigest(reorder(["  QNB  ", "QNB"]))).toBe(
      await callDigest(reorder(["QNB", "  QNB  "]))
    );
  });

  it("binds captured first-write defaults but never re-samples later active accounts", async () => {
    const fixture = await groupedCase();
    const original = await callDigest(fixture);
    const differentHistoricalSnapshot = {
      ...fixture,
      creationDefaultSnapshot: {
        activeAccountIds: [
          COMMAND_IDS.qnbAccount,
          COMMAND_IDS.cibAccount,
        ].sort(),
        defaultAccount: {
          accountId: COMMAND_IDS.qnbAccount,
          isDefault: true as const,
        },
      },
    };
    expect(await callDigest(differentHistoricalSnapshot)).not.toBe(original);
    expect(await callDigest(fixture)).toBe(original);
  });

  it("captures the supplied default snapshot at invocation despite deferred Bank-alias hashing", async () => {
    const fixture = await groupedCase();
    const initialSnapshot = fixture.creationDefaultSnapshot;
    if (!initialSnapshot)
      throw new Error("Missing genuine historical Bank snapshot");
    const supplied = {
      activeAccountIds: [...initialSnapshot.activeAccountIds],
      defaultAccount: initialSnapshot.defaultAccount,
    };
    const immutableAtInvocation = {
      activeAccountIds: [...supplied.activeAccountIds],
      defaultAccount: supplied.defaultAccount,
    };
    const expected = await callDigest({
      ...fixture,
      creationDefaultSnapshot: immutableAtInvocation,
    });
    const gate = { entered: (): void => {}, release: (): void => {} };
    const entered = new Promise<void>((resolve) => {
      gate.entered = () => resolve();
    });
    const blocked = new Promise<void>((resolve) => {
      gate.release = () => resolve();
    });
    let hashCalls = 0;
    const hashProvider: Sha256Provider = {
      digestUtf8: async (value: string): Promise<string> => {
        hashCalls += 1;
        if (hashCalls === 1) {
          gate.entered();
          await blocked;
        }
        return syntheticHashProvider.digestUtf8(value);
      },
    };
    const pending = computeAccountReviewFrozenIntentDigest({
      ...fixture,
      creationDefaultSnapshot: supplied,
      hashProvider,
    });
    await entered;
    supplied.activeAccountIds.push(COMMAND_IDS.cibAccount);
    gate.release();
    expect(await pending).toBe(expected);
    expect(hashCalls).toBeGreaterThan(1);
    expect(
      await callDigest({
        ...fixture,
        creationDefaultSnapshot: supplied,
      })
    ).not.toBe(expected);
  });

  it("normalizes equal original calendar dates without hashing time-of-day metadata", async () => {
    const fixture = await voiceCase();
    const ready = fixture.session.rows.find(
      (row) => row.rowId === COMMAND_IDS.readyRow
    );
    if (!ready || ready.source !== "VOICE")
      throw new Error("Missing Voice source");
    const atNoon = new Date(ready.transaction.date);
    atNoon.setHours(12, 0, 0, 0);
    const atAfternoon = new Date(atNoon);
    atAfternoon.setHours(16, 30, 0, 0);
    const withDate = (date: Date): FrozenCase => {
      const changed = accountReviewSessionSchema.parse({
        ...fixture.session,
        saveIntent: null,
        rows: fixture.session.rows.map((row) =>
          row.rowId === ready.rowId
            ? { ...ready, transaction: { ...ready.transaction, date } }
            : row
        ),
      });
      return revised(fixture, changed);
    };
    expect(await callDigest(withDate(atNoon))).toBe(
      await callDigest(withDate(atAfternoon))
    );
  });

  it("preserves exact KWD three-decimal versus BTC eight-decimal minor units", async () => {
    const fixture = await voiceCase();
    const forCurrency = (
      code: "KWD" | "BTC",
      amountDecimal: string,
      amount: number
    ): FrozenCase => {
      const session = accountReviewSessionSchema.parse({
        ...fixture.session,
        saveIntent: null,
        rows: fixture.session.rows.map((row) =>
          row.rowId === COMMAND_IDS.readyRow
            ? {
                ...row,
                amountDecimal,
                currency: { state: "known", code, origin: "user" },
                transaction: { ...row.transaction, amount, currency: code },
                assignment: {
                  state: "existing",
                  accountId: COMMAND_IDS.cibAccount,
                  origin: "user",
                  currency: code,
                  identityRevision: row.revision,
                },
              }
            : row
        ),
      });
      return revised(fixture, session);
    };
    expect(await callDigest(forCurrency("KWD", "33.125", 33.125))).not.toBe(
      await callDigest(forCurrency("BTC", "0.00000001", 0.00000001))
    );
    expect(
      accountReviewSessionSchema.safeParse({
        ...fixture.session,
        rows: fixture.session.rows.map((row) =>
          row.rowId === COMMAND_IDS.readyRow
            ? { ...row, amountDecimal: "33.00" }
            : row
        ),
      }).success
    ).toBe(false);
  });

  it("excludes unselected raw source rows, SMS body and Voice transcript from persistence", async () => {
    const voice = await voiceCase();
    const changedVoice = accountReviewSessionSchema.parse({
      ...voice.session,
      saveIntent: null,
      rows: voice.session.rows.map((row) => {
        if (row.source !== "VOICE") return row;
        return {
          ...row,
          transaction: {
            ...row.transaction,
            originalTranscript: "UNPERSISTED transcript test source",
            ...(row.selected ? {} : { note: "Unselected unrelated text" }),
          },
        };
      }),
    });
    expect(await callDigest(revised(voice, changedVoice))).toBe(
      await callDigest(voice)
    );

    const sms = await smsCase();
    const changedSms = accountReviewSessionSchema.parse({
      ...sms.session,
      saveIntent: null,
      rows: sms.session.rows.map((row) =>
        row.source === "SMS"
          ? {
              ...row,
              transaction: {
                ...row.transaction,
                rawSmsBody: "new private text",
              },
            }
          : row
      ),
    });
    expect(await callDigest(revised(sms, changedSms))).toBe(
      await callDigest(sms)
    );
  });

  it("recomputes the same historical digest after rehydration without mutable saved-SMS data", async () => {
    const fixture = await smsCase();
    const first = await callDigest(fixture);
    const restoredSession = accountReviewSessionSchema.parse(
      JSON.parse(
        JSON.stringify(fixture.session),
        (key: string, value: unknown): unknown =>
          key === "date" && typeof value === "string" ? new Date(value) : value
      )
    );
    const restoredIntent = accountReviewSaveIntentSchema.parse(
      JSON.parse(JSON.stringify(fixture.intent))
    );
    expect(
      await callDigest({
        ...fixture,
        session: restoredSession,
        intent: restoredIntent,
      })
    ).toBe(first);
    // The actual saved duplicate may later be edited/deleted; no such mutable
    // transaction, current account or live session query belongs in this API.
    // Root's next mobile SQLite slice must independently prove replay("mixed")
    // across fresh database/cache after that edit/delete.
  });
});
