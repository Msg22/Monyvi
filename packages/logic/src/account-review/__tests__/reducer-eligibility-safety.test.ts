/**
 * #395 T027 reducer eligibility Red. Canonical schema/normalizer fixtures and
 * the real pure reducer only: no SUT mocks, fabricated reducer outcomes, or
 * future T036 commands. Root owns execution and the later source correction.
 */
import {
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewGroup,
  type AccountReviewRow,
  type AccountReviewSession,
} from "../schemas";
import { deriveAccountReviewGroupIdentity } from "../identity";
import { normalizeAccountReviewParserResult } from "../normalization";
import { resolveAccountReviewSession } from "../resolution";
import { reduceAccountReviewCommand } from "../reducer";
import type { AccountReviewOwnedContext } from "../normalization-types";
import {
  COMMAND_IDS, availableAccounts, canonicalCommand, groupByName,
  ownedContext, qnbCibReview, requireRow, reviewWithReadyRow, scope,
  type OwnedCommandAccount,
} from "./review-command-fixtures";
import {
  makeCashVoiceInput, makeTwoCurrenciesInput,
  makeTwoSmsInput, syntheticHashProvider,
} from "./normalization-fixtures";

type Result = ReturnType<typeof reduceAccountReviewCommand>;
type EditIdentity = Extract<
  AccountReviewCommand, { kind: "edit_group" }
>["identity"];

function execute(
  state: AccountReviewSession,
  command: AccountReviewCommand,
  snapshots: AccountReviewOwnedContext = ownedContext(state),
  nextUndoToken: string | null = null
): Result {
  return reduceAccountReviewCommand({
    state, command, accountSnapshots: snapshots, nextUndoToken, undo: null,
  });
}

function edit(
  state: AccountReviewSession, group: AccountReviewGroup,
  identity: EditIdentity
): AccountReviewCommand {
  return canonicalCommand({
    ...scope(state), kind: "edit_group", groupId: group.groupId,
    expectedGroupRevision: group.revision, identity, reconfirm: true,
  });
}

function identityOf(group: AccountReviewGroup): EditIdentity {
  if (group.type === null) throw new Error("Canonical group lacks a type");
  return {
    name: group.name, type: group.type, institutionId: group.institutionId,
    providerDisplayName: group.providerDisplayName,
    cardLast4: group.cardLast4, senderNames: [...group.senderNames],
  };
}

function selectRow(
  state: AccountReviewSession, rowId: string,
  disclosedGroup: AccountReviewGroup | null = null
): AccountReviewCommand {
  return canonicalCommand({
    ...scope(state), kind: "select_row", rowId,
    expectedRowRevision: requireRow(state, rowId).revision,
    groupId: disclosedGroup?.groupId ?? null,
    expectedGroupRevision: disclosedGroup?.revision ?? null,
    hasSharedConfirmationDisclosure: disclosedGroup !== null,
  });
}

function selectReady(state: AccountReviewSession): AccountReviewCommand {
  return canonicalCommand({
    ...scope(state), kind: "select_ready", filter: state.filter,
  });
}

function groupCommand(
  state: AccountReviewSession, group: AccountReviewGroup,
  kind: "confirm_group" | "remove_group"
): AccountReviewCommand {
  return canonicalCommand({
    ...scope(state), kind, groupId: group.groupId,
    expectedGroupRevision: group.revision,
  });
}

function financialRows(
  state: AccountReviewSession
): ReadonlyArray<Pick<
  AccountReviewRow,
  "rowId" | "amountDecimal" | "transaction" | "currency" |
  "assignment" | "toAssignment" | "reviewReasons" | "selected" | "revision"
>> {
  return state.rows.map((row) => ({
    rowId: row.rowId, amountDecimal: row.amountDecimal,
    transaction: row.transaction, currency: row.currency,
    assignment: row.assignment, toAssignment: row.toAssignment,
    reviewReasons: row.reviewReasons, selected: row.selected, revision: row.revision,
  }));
}

function expectAtomicRejection(
  state: AccountReviewSession, frozen: AccountReviewSession, result: Result
): void {
  // Canonical T027 result has no "accepted" property: effect is the acceptance indicator.
  expect(result.effect !== "none").toBe(false);
  expect(result.effect).toBe("none");
  expect(result.reasonCodes.length).toBeGreaterThan(0);
  expect(result.affectedRowIds).toEqual([]);
  expect(result.affectedGroupIds).toEqual([]);
  expect(result.undoToken).toBeNull();
  expect(result.state).toBe(state);
  expect(result.state).toEqual(frozen);
  expect(state).toEqual(frozen);
  expect(result.state.revision).toBe(frozen.revision);
  expect(result.state.operationGeneration).toBe(frozen.operationGeneration);
  expect(financialRows(result.state)).toEqual(financialRows(frozen));
  expect(result.state.groups).toEqual(frozen.groups);
  expect(result.state.removedEvidenceKeys).toEqual(frozen.removedEvidenceKeys);
}

function expectAccepted(state: AccountReviewSession, result: Result): void {
  expect(result.effect !== "none").toBe(true);
  expect(result.effect).toBe(state.source === "SMS" ? "persist_sms" : "session_only");
  expect(result.reasonCodes).toEqual([]);
  expect(result.state.revision).not.toBe(state.revision);
  expect(result.state.operationGeneration).not.toBe(state.operationGeneration);
  expect(accountReviewSessionSchema.safeParse(result.state).success).toBe(true);
}

function withSoleDefault(
  state: AccountReviewSession, id: string
): AccountReviewOwnedContext {
  const accounts: readonly OwnedCommandAccount[] = availableAccounts().map(
    (account): OwnedCommandAccount => ({
      ...account, isDefault: account.id === id,
    })
  );
  return ownedContext(state, accounts);
}

async function defaultBankAReview(
  origin: "default" | "user"
): Promise<AccountReviewSession> {
  const base = await reviewWithReadyRow();
  const row = requireRow(base, COMMAND_IDS.readyRow);
  if (row.source !== "VOICE" || row.accountEvidence.state !== "absent") {
    throw new Error("Default control must have genuinely absent Voice account evidence");
  }
  return accountReviewSessionSchema.parse({
    ...base,
    rows: base.rows.map((item): AccountReviewRow => item.rowId !== row.rowId
      ? item : {
        ...row, selected: false, reviewReasons: [],
        hasUserAccountOverride: origin === "user",
        assignment: {
          state: "existing", accountId: COMMAND_IDS.qnbAccount,
          origin, currency: "EGP", identityRevision: "0",
        },
      }),
  });
}

/** Re-derive synthetic known-provider group IDs/hashes, preserving row reciprocity. */
async function distinctKnownProviderReview(): Promise<AccountReviewSession> {
  const base = await qnbCibReview();
  const remapped = await Promise.all(base.groups.map(async (group) => {
    const institutionId = group.name === "QNB"
      ? "synthetic-institution-qnb" : "synthetic-institution-cib";
    const ids = await deriveAccountReviewGroupIdentity({
      ownerId: base.ownerId, sessionId: base.sessionId, source: base.source,
      identity: { ...identityOf(group), currency: group.currency, institutionId },
      hashProvider: syntheticHashProvider,
    });
    const updated: AccountReviewGroup = { ...group, ...ids, institutionId };
    return { oldId: group.groupId, updated };
  }));
  const mapped = new Map(remapped.map((record) => [record.oldId, record.updated]));
  return accountReviewSessionSchema.parse({
    ...base,
    groups: remapped.map((record) => record.updated),
    rows: base.rows.map((row): AccountReviewRow => {
      if (row.assignment.state !== "suggested") return row;
      const group = mapped.get(row.assignment.groupId);
      if (!group) throw new Error("Missing remapped provider identity");
      return {
        ...row,
        accountEvidence: {
          ...row.accountEvidence, institutionId: group.institutionId,
        },
        assignment: { ...row.assignment, groupId: group.groupId },
      };
    }),
  });
}

describe("#395 T027 source and current-default reducer safety", () => {
  it("rejects an ordinary SMS Bank group edited into a unique Cash source atomically", async () => {
    const state = accountReviewSessionSchema.parse(
      await normalizeAccountReviewParserResult(makeTwoSmsInput())
    );
    const bank = groupByName(state, "QNB");
    expect(state.source).toBe("SMS");
    expect(bank.type).toBe("BANK");
    const command = edit(state, bank, {
      name: "Weekend cash", type: "CASH",
      institutionId: null, providerDisplayName: null,
      cardLast4: null, senderNames: [],
    });
    const frozen = structuredClone(state);
    const result = execute(state, command);
    expectAtomicRejection(state, frozen, result);
    expect(groupByName(result.state, "QNB").type).toBe("BANK");
  });

  it("keeps actual grounded Voice Cash group editing valid", async () => {
    const state = accountReviewSessionSchema.parse(
      await normalizeAccountReviewParserResult(makeCashVoiceInput())
    );
    const cash = state.groups[0];
    if (!cash) throw new Error("Expected real normalized Voice Cash suggestion");
    expect(state.source).toBe("VOICE");
    expect(cash.type).toBe("CASH");
    const result = execute(state, edit(state, cash, {
      ...identityOf(cash), name: "Daily cash",
    }));
    expectAccepted(state, result);
    const updated = result.state.groups.find((group) => group.groupId === cash.groupId);
    expect(updated?.name).toBe("Daily cash");
    expect(updated?.type).toBe("CASH");
    expect(updated?.status).toBe("confirmed");
    expect(result.state.rows.every((row) => !row.selected)).toBe(true);
  });

  it.each(["select_row", "select_ready"])(
    "rejects stale default Bank A after sole eligible default switches to B via %s",
    async (kind) => {
      const state = await defaultBankAReview("default");
      const contextA = withSoleDefault(state, COMMAND_IDS.qnbAccount);
      const contextB = withSoleDefault(state, COMMAND_IDS.cibAccount);
      expect(contextA.accounts.filter((account) => account.isDefault)
        .map((account) => account.id)).toEqual([COMMAND_IDS.qnbAccount]);
      expect(contextB.accounts.filter((account) => account.isDefault)
        .map((account) => account.id)).toEqual([COMMAND_IDS.cibAccount]);
      const command = kind === "select_row"
        ? selectRow(state, COMMAND_IDS.readyRow) : selectReady(state);
      const frozen = structuredClone(state);
      const result = execute(state, command, contextB);
      expectAtomicRejection(state, frozen, result);
      expect(requireRow(result.state, COMMAND_IDS.readyRow).selected).toBe(false);
    }
  );

  it.each(["select_row", "select_ready"])(
    "accepts still-current Bank A default and an explicit A override using %s",
    async (kind) => {
      const origins: ReadonlyArray<"default" | "user"> = ["default", "user"];
      for (const origin of origins) {
        const state = await defaultBankAReview(origin);
        const snapshots = withSoleDefault(
          state, origin === "default" ? COMMAND_IDS.qnbAccount : COMMAND_IDS.cibAccount
        );
        const command = kind === "select_row"
          ? selectRow(state, COMMAND_IDS.readyRow) : selectReady(state);
        const result = execute(state, command, snapshots);
        expectAccepted(state, result);
        expect(result.state.rows.filter((row) => row.selected)
          .map((row) => row.rowId)).toEqual([COMMAND_IDS.readyRow]);
        expect(requireRow(result.state, COMMAND_IDS.readyRow).assignment).toMatchObject({
          state: "existing", origin, accountId: COMMAND_IDS.qnbAccount,
        });
      }
    }
  );

  it("bulk selection skips stale default A but selects another ready explicit B row", async () => {
    const base = await defaultBankAReview("default");
    const stale = requireRow(base, COMMAND_IDS.readyRow);
    if (stale.source !== "VOICE") throw new Error("Expected ready Voice row");
    const ready: AccountReviewRow = {
      ...stale,
      rowId: COMMAND_IDS.cibRow,
      sourceRef: "bulk-ready-explicit-cib",
      amountDecimal: "44",
      assignment: {
        state: "existing", accountId: COMMAND_IDS.cibAccount,
        origin: "user", currency: "EGP", identityRevision: "0",
      },
      hasUserAccountOverride: true,
      transaction: {
        ...stale.transaction, amount: 44, note: "Explicit CIB choice",
      },
    };
    const state = accountReviewSessionSchema.parse({
      ...base, rows: [...base.rows, ready],
    });
    const snapshots = withSoleDefault(state, COMMAND_IDS.cibAccount);
    const frozen = structuredClone(state);
    const result = execute(state, selectReady(state), snapshots);
    expectAccepted(state, result);
    expect(result.affectedRowIds).toEqual([ready.rowId]);
    expect(result.state.rows.filter((row) => row.selected).map((row) => row.rowId))
      .toEqual([ready.rowId]);
    expect(requireRow(result.state, COMMAND_IDS.readyRow)).toEqual(stale);
    expect(groupByName(result.state, "QNB")).toEqual(groupByName(base, "QNB"));
    expect(result.state.rows.map((row) => row.amountDecimal))
      .toEqual(frozen.rows.map((row) => row.amountDecimal));
    expect(state).toEqual(frozen);
  });
});

describe("#395 T027 Voice fresh-default output must be canonical on selection", () => {
  it.each(["select_row", "select_ready"])(
    "%s on previously unresolved Voice account preserves a real fresh Bank default or rejects atomically",
    async (kind) => {
      const initial = await reviewWithReadyRow();
      const ready = requireRow(initial, COMMAND_IDS.readyRow);
      if (ready.source !== "VOICE" || ready.accountEvidence.state !== "absent") {
        throw new Error("Expected a genuinely absent-evidence Voice ready row");
      }
      const state = accountReviewSessionSchema.parse({
        ...initial,
        rows: initial.rows.map((row): AccountReviewRow =>
          row.rowId === ready.rowId ? {
            ...ready, selected: false, hasUserAccountOverride: false,
            assignment: {
              state: "unresolved", accountId: null,
              reasonCode: "account_needed", candidateAccountIds: [],
            },
            reviewReasons: ["account_needed"],
          } : row
        ),
      });
      const context = withSoleDefault(state, COMMAND_IDS.cibAccount);
      const cash = context.accounts.find((account) =>
        account.id === COMMAND_IDS.cashAccount
      );
      expect(cash).toMatchObject({ isDefault: false, type: "CASH" });
      expect(context.accounts.find((account) =>
        account.id === COMMAND_IDS.cibAccount)).toMatchObject({
        isDefault: true, currency: "EGP", type: "BANK",
      });
      const fresh = resolveAccountReviewSession({
        session: state, accountSnapshots: context,
      });
      const resolved = requireRow(fresh, ready.rowId);
      expect(resolved.assignment).toMatchObject({
        state: "existing", origin: "default", currency: "EGP",
        accountId: COMMAND_IDS.cibAccount,
      });
      expect(resolved.reviewReasons).toEqual([]);
      expect(requireRow(state, ready.rowId).assignment.state).toBe("unresolved");
      const frozen = structuredClone(state);
      const result = execute(state, kind === "select_row"
        ? selectRow(state, ready.rowId)
        : selectReady(state), context);
      if (result.effect === "none") {
        expectAtomicRejection(state, frozen, result);
        return;
      }
      expectAccepted(state, result);
      const selected = requireRow(result.state, ready.rowId);
      expect(selected.selected).toBe(true);
      expect(selected.assignment).toMatchObject({
        state: "existing", origin: "default", currency: "EGP",
        accountId: COMMAND_IDS.cibAccount,
      });
      expect(selected.reviewReasons).toEqual([]);
      expect(result.state.rows.filter((row) => row.selected)
        .map((row) => row.rowId)).toEqual([ready.rowId]);
      expect(result.state.rows.map((row) => row.amountDecimal))
        .toEqual(state.rows.map((row) => row.amountDecimal));
      expect(result.state.groups).toEqual(state.groups);
      expect(state).toEqual(frozen);
    }
  );
});

describe("#395 T027 compatible group identity edits preserve prior checked rows", () => {
  it("explicitly reconfirmed nickname-only edit retains the clicked selected row, never checks siblings", async () => {
    const original = await qnbCibReview();
    const qnb = groupByName(original, "QNB");
    const clicked = qnb.linkedRowIds[0];
    if (!clicked) throw new Error("Expected one canonical QNB row");
    const selected = execute(original, selectRow(original, clicked, qnb));
    expectAccepted(original, selected);
    const before = selected.state;
    const current = groupByName(before, "QNB");
    const unchangedCib = groupByName(before, "CIB");
    const command = edit(before, current, {
      ...identityOf(current), name: "QNB Daily Spending",
    });
    expect(command).toMatchObject({ kind: "edit_group", reconfirm: true });
    expect(before.rows.filter((row) => row.selected).map((row) => row.rowId))
      .toEqual([clicked]);
    expect(current.status).toBe("confirmed");
    const frozen = structuredClone(before);
    const result = execute(before, command);
    expectAccepted(before, result);
    const editedGroup = result.state.groups.find(
      (group) => group.groupId === current.groupId
    );
    expect(editedGroup).toMatchObject({
      name: "QNB Daily Spending", status: "confirmed",
      type: current.type, currency: current.currency,
      providerDisplayName: current.providerDisplayName,
      institutionId: current.institutionId, cardLast4: current.cardLast4,
    });
    expect(editedGroup?.revision).not.toBe(current.revision);
    expect(editedGroup?.confirmedIdentityRevision).toBe(editedGroup?.revision);
    expect(result.state.rows.filter((row) => row.selected).map((row) => row.rowId))
      .toEqual([clicked]);
    for (const rowId of current.linkedRowIds) {
      const linked = requireRow(result.state, rowId);
      expect(linked.selected).toBe(rowId === clicked);
      expect(linked.assignment).toMatchObject({
        state: "suggested", confirmation: "confirmed",
        groupId: current.groupId, groupRevision: editedGroup?.revision,
      });
    }
    expect(groupByName(result.state, "CIB")).toEqual(unchangedCib);
    expect(requireRow(result.state, COMMAND_IDS.cibRow))
      .toEqual(requireRow(before, COMMAND_IDS.cibRow));
    expect(result.state.rows.map((row) => row.amountDecimal))
      .toEqual(before.rows.map((row) => row.amountDecimal));
    expect(before).toEqual(frozen);
  });
});

describe("#395 T027 removal Undo and nickname uniqueness", () => {
  it("rejects absent and invalid removal Undo tokens without a tombstone", async () => {
    const state = await qnbCibReview();
    const group = groupByName(state, "QNB");
    const command = groupCommand(state, group, "remove_group");
    for (const token of [null, "not-a-canonical-uuid"]) {
      const frozen = structuredClone(state);
      const result = execute(state, command, ownedContext(state), token);
      expectAtomicRejection(state, frozen, result);
      expect(groupByName(result.state, "QNB").status).toBe("pending");
      expect(result.state.removedEvidenceKeys).not.toContain(group.evidenceKey);
    }
  });

  it("retains legitimate transient Undo with a valid token and same-generation snapshot", async () => {
    const state = await qnbCibReview();
    const bank = groupByName(state, "QNB");
    const removed = execute(
      state, groupCommand(state, bank, "remove_group"),
      ownedContext(state), COMMAND_IDS.undoToken
    );
    expectAccepted(state, removed);
    expect(removed.undoToken).toBe(COMMAND_IDS.undoToken);
    const restored = reduceAccountReviewCommand({
      state: removed.state,
      command: canonicalCommand({
        ...scope(removed.state), kind: "undo_removal",
        undoToken: COMMAND_IDS.undoToken,
      }),
      accountSnapshots: ownedContext(removed.state),
      nextUndoToken: null,
      undo: {
        token: COMMAND_IDS.undoToken, previousState: state,
        afterRemovalGeneration: removed.state.operationGeneration,
      },
    });
    expectAccepted(removed.state, restored);
    expect(groupByName(restored.state, "QNB").status).toBe("pending");
    expect(restored.state.removedEvidenceKeys).not.toContain(bank.evidenceKey);
    expect(financialRows(restored.state).map((row) => row.amountDecimal))
      .toEqual(financialRows(state).map((row) => row.amountDecimal));
  });

  it("allows identical nicknames in legitimate different-currency SMS groups", async () => {
    const state = accountReviewSessionSchema.parse(
      await normalizeAccountReviewParserResult(makeTwoCurrenciesInput())
    );
    const egp = state.groups.find((group) => group.currency === "EGP");
    const usd = state.groups.find((group) => group.currency === "USD");
    if (!egp || !usd) throw new Error("Expected both canonical currency groups");
    expect(egp.groupId).not.toBe(usd.groupId);
    expect(egp.name.toLowerCase()).toBe(usd.name.toLowerCase());
    const result = execute(state, edit(state, egp, {
      ...identityOf(egp), name: egp.name.toLowerCase(),
    }));
    expectAccepted(state, result);
    expect(result.state.groups.find((group) => group.groupId === usd.groupId))
      .toEqual(usd);
  });

  it("allows the same nickname and currency for distinct known institution IDs", async () => {
    const state = await distinctKnownProviderReview();
    const qnb = groupByName(state, "QNB");
    const cib = groupByName(state, "CIB");
    expect(qnb.currency).toBe(cib.currency);
    expect(qnb.institutionId).not.toBeNull();
    expect(cib.institutionId).not.toBeNull();
    expect(qnb.institutionId).not.toBe(cib.institutionId);
    const result = execute(state, edit(state, qnb, {
      ...identityOf(qnb), name: cib.name,
    }));
    expectAccepted(state, result);
    const changed = result.state.groups.find((group) => group.groupId === qnb.groupId);
    expect(changed?.name).toBe(cib.name);
    expect(changed?.institutionId).toBe(qnb.institutionId);
    expect(result.state.groups.find((group) => group.groupId === cib.groupId))
      .toEqual(cib);
  });

  it("still rejects equal case-insensitive names in the same unknown-provider currency scope", async () => {
    const state = await qnbCibReview();
    const qnb = groupByName(state, "QNB");
    const cib = groupByName(state, "CIB");
    expect(qnb.currency).toBe(cib.currency);
    expect(qnb.institutionId).toBeNull();
    expect(cib.institutionId).toBeNull();
    const frozen = structuredClone(state);
    const result = execute(state, edit(state, qnb, {
      ...identityOf(qnb), name: "  cib  ",
    }));
    expectAtomicRejection(state, frozen, result);
  });
});
