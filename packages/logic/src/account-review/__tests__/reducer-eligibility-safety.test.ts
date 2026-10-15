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
import { reduceAccountReviewCommand } from "../reducer";
import type { AccountReviewOwnedContext } from "../normalization-types";
import {
  COMMAND_IDS, availableAccounts, canonicalCommand, groupByName,
  ownedContext, qnbCibReview, requireRow, reviewWithReadyRow, scope,
  type OwnedCommandAccount,
} from "./review-command-fixtures";
import {
  makeCashVoiceInput, makeSmsInput, makeTwoCurrenciesInput,
  makeTwoSmsInput, syntheticHashProvider,
} from "./normalization-fixtures";
import { makeEvidenceSpan, REVIEW_WIRE_IDS } from "./fixtures";

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

function onlyRowId(state: AccountReviewSession): string {
  const row = state.rows[0];
  if (!row) throw new Error("Expected exactly one canonical test row");
  return row.rowId;
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

function financialRows(state: AccountReviewSession) {
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

/** Actual tagged ATM parser row/body/spans; no mocked provider or output. */
async function normalizedAtmSource(): Promise<AccountReviewSession> {
  const input = makeSmsInput();
  const original = input.providerResponse.transactions[0];
  const mapped = input.mappedTransactions[0];
  const message = input.submittedMessages[0];
  if (!original || !mapped || !message) throw new Error("Missing canonical SMS source");
  const body = "QNB ATM withdrawal EGP 50";
  const row = {
    ...original, isAtmWithdrawal: true,
    accountEvidence: {
      ...original.accountEvidence,
      evidenceSpans: [
        makeEvidenceSpan(REVIEW_WIRE_IDS.smsMessageId, "body", body, "QNB"),
      ],
    },
    currencyEvidence: {
      ...original.currencyEvidence,
      evidenceSpans: [
        makeEvidenceSpan(REVIEW_WIRE_IDS.smsMessageId, "body", body, "EGP"),
      ],
    },
  };
  const parsed = accountReviewSessionSchema.parse(
    await normalizeAccountReviewParserResult({
      ...input,
      providerResponse: { ...input.providerResponse, transactions: [row] },
      financialRows: [row],
      mappedTransactions: [{ ...mapped, isAtmWithdrawal: true, rawSmsBody: body }],
      submittedMessages: [{ ...message, body }],
    })
  );
  const source = parsed.rows[0];
  if (!source || source.source !== "SMS" ||
      source.currency.state !== "known" || source.currency.code !== "EGP" ||
      source.assignment.state !== "suggested" || parsed.groups.length !== 1) {
    throw new Error("ATM fixture must retain an eligible pending Bank source");
  }
  expect(source.transaction.isAtmWithdrawal).toBe(true);
  return parsed;
}

/**
 * An explicitly reviewed destination is a canonical post-review state (T036
 * commands are intentionally not called). Remove normalizer's independent
 * cash_transfer_review hard reason only for this eligibility boundary test.
 * A forged/stale destination is injected solely to test reducer revalidation;
 * no currently exposed UI path to that state is claimed.
 */
function stagedAtm(
  normalized: AccountReviewSession, destinationAccountId: string,
  sourceMode: "existing" | "pending"
): AccountReviewSession {
  const row = normalized.rows[0];
  if (!row || row.source !== "SMS" || row.assignment.state !== "suggested" ||
      row.currency.state !== "known" || row.currency.code !== "EGP") {
    throw new Error("Missing canonical Bank ATM row");
  }
  const sourceAssignment: AccountReviewRow["assignment"] =
    sourceMode === "pending" ? row.assignment : {
      state: "existing", accountId: COMMAND_IDS.qnbAccount,
      origin: "user", currency: "EGP", identityRevision: "0",
    };
  const staged: AccountReviewRow = {
    ...row, assignment: sourceAssignment, selected: false,
    hasUserAccountOverride: sourceMode === "existing",
    toAssignment: {
      state: "existing", accountId: destinationAccountId,
      origin: "user", currency: "EGP", identityRevision: "0",
    },
    reviewReasons: sourceMode === "pending" ? ["account_group_unconfirmed"] : [],
  };
  return accountReviewSessionSchema.parse({
    ...normalized, rows: [staged],
    groups: sourceMode === "pending" ? normalized.groups : [],
  });
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
      const origins: readonly ("default" | "user")[] = ["default", "user"];
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
});

describe("#395 T027 ATM destination eligibility, separately from source Bank", () => {
  it.each([
    ["foreign account", COMMAND_IDS.outsideAccount],
    ["owned non-Cash Wallet", COMMAND_IDS.walletAccount],
  ])("rejects %s as an ATM destination for direct and bulk selection", async (_label, id) => {
    const input = await normalizedAtmSource();
    const state = stagedAtm(input, id, "existing");
    expect(accountReviewSessionSchema.safeParse(state).success).toBe(true);
    for (const command of [selectRow(state, onlyRowId(state)), selectReady(state)]) {
      const frozen = structuredClone(state);
      const result = execute(state, command);
      expectAtomicRejection(state, frozen, result);
    }
  });

  it("rejects a stale EGP destination projection whose owned Cash currency is USD", async () => {
    const input = await normalizedAtmSource();
    const state = stagedAtm(input, COMMAND_IDS.usdAccount, "existing");
    const accounts: readonly OwnedCommandAccount[] = availableAccounts().map(
      (account): OwnedCommandAccount => account.id === COMMAND_IDS.usdAccount
        ? {
          ...account, name: "USD cash", type: "CASH", providerDisplayName: null,
          cardLast4: null, senderNames: [],
        }
        : account
    );
    const snapshots = ownedContext(state, accounts);
    expect(snapshots.accounts.find((account) =>
      account.id === COMMAND_IDS.usdAccount)?.currency).toBe("USD");
    expect(accountReviewSessionSchema.safeParse(state).success).toBe(true);
    const frozen = structuredClone(state);
    expectAtomicRejection(
      state, frozen, execute(state, selectRow(state, onlyRowId(state)), snapshots)
    );
  });

  it("accepts owned distinct same-currency Cash destination after reviewed ATM choice", async () => {
    const input = await normalizedAtmSource();
    const state = stagedAtm(input, COMMAND_IDS.cashAccount, "existing");
    const row = state.rows[0];
    if (!row) throw new Error("Missing ATM destination row");
    expect(row.transaction.isAtmWithdrawal).toBe(true);
    expect(row.reviewReasons).toEqual([]);
    for (const command of [selectRow(state, row.rowId), selectReady(state)]) {
      const result = execute(state, command);
      expectAccepted(state, result);
      expect(requireRow(result.state, row.rowId).selected).toBe(true);
      expect(requireRow(result.state, row.rowId).toAssignment).toMatchObject({
        state: "existing", accountId: COMMAND_IDS.cashAccount,
      });
    }
  });

  it("does not let a pending Bank group click confirm/select through an ineligible ATM destination", async () => {
    const input = await normalizedAtmSource();
    const state = stagedAtm(input, COMMAND_IDS.walletAccount, "pending");
    const bank = groupByName(state, "QNB");
    const row = state.rows[0];
    if (!row) throw new Error("Missing pending ATM row");
    expect(bank.status).toBe("pending");
    expect(row.reviewReasons).toEqual(["account_group_unconfirmed"]);
    const frozen = structuredClone(state);
    const result = execute(state, selectRow(state, row.rowId, bank));
    expectAtomicRejection(state, frozen, result);
    expect(groupByName(result.state, "QNB").status).toBe("pending");
    expect(requireRow(result.state, row.rowId).selected).toBe(false);
  });

  it("preserves pending Bank-group disclosure with a genuinely eligible Cash destination", async () => {
    const input = await normalizedAtmSource();
    const state = stagedAtm(input, COMMAND_IDS.cashAccount, "pending");
    const bank = groupByName(state, "QNB");
    const row = state.rows[0];
    if (!row) throw new Error("Missing pending ATM row");
    const result = execute(state, selectRow(state, row.rowId, bank));
    expectAccepted(state, result);
    expect(groupByName(result.state, "QNB").status).toBe("confirmed");
    expect(requireRow(result.state, row.rowId).selected).toBe(true);
  });

  it("leaves mismatched declared ATM destination currency to the canonical schema", async () => {
    const state = stagedAtm(
      await normalizedAtmSource(), COMMAND_IDS.cashAccount, "existing"
    );
    const row = state.rows[0];
    if (!row || row.toAssignment?.state !== "existing") {
      throw new Error("Missing existing Cash destination");
    }
    expect(accountReviewSessionSchema.safeParse({
      ...state,
      rows: [{
        ...row, toAssignment: { ...row.toAssignment, currency: "USD" },
      }],
    }).success).toBe(false);
    // This is not classified as a missing reducer behavior.
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
