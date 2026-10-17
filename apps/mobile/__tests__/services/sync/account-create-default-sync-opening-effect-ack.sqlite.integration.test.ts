/**
 * #395 terminal Add ACK: genuine Watermelon SDK + persistent Node SQLite.
 * An accepted NONZERO Add must retain its exact immutable opening effect.
 * External RPC/auth are the existing shared fixture's only test doubles.
 * TESTS FIRST — NOT RUN.
 */
import type {
  Account,
  AccountFinancialEffect,
  AccountSmsSender,
  BankDetails,
  Category,
  Transaction,
} from "@monyvi/db";
import {
  Q,
  FOREIGN,
  mockFinancialTransport,
  actionCoordinator,
  rejected,
  form,
  createAccountDefaultIntentService,
  getCurrentUserDataScope,
  assertExpectedCurrentUser,
  assertNoDuplicateAddAccountIdentity,
  randomUUID,
  hashProvider,
  syncFixtureControls,
  type FinancialActionGroup,
  ledger,
  OWNER,
  mockUpdates,
  mockUpserts,
  commitAdd,
  ownedRoot,
  foundation,
  accepted,
  createFinancialActionSyncService,
  realSynchronize,
  coldRestart,
  cloudAccount,
  tableUpdated,
  noPrivateNetworkBytes,
  serializeCanonicalJsonValue,
  type AccountDefaultPreparedCommand,
  type CanonicalJsonValue,
  type SyncPullResult,
} from "./account-create-default-sync-lifecycle-fixtures";
import { createAccountBalanceCommandService } from "@/services/account-balance-command-service";
import { createTransactionFinancialActionService } from "@/services/transaction-financial-action-service";
import { replaceAccountSmsSendersWithinWriter } from "@/services/account-sms-sender-service";
import { physicalRawField } from "@/services/account-review-local-snapshot-postimages";

async function locallyAcceptedNonzeroAdd(): Promise<{
  readonly command: AccountDefaultPreparedCommand;
  readonly effectId: string;
  readonly privateBytes: string;
}> {
  const command = await commitAdd(
    ledger.database,
    "Original nonzero Bank",
    "10.01",
    false,
    "BANK"
  );
  if (!command.effectId) throw new Error("missing_real_nonzero_opening_effect");
  const effect = await ledger.database
    .get<AccountFinancialEffect>("account_financial_effects")
    .find(command.effectId);
  expect(effect.userId).toBe(OWNER);
  expect(effect.actionId).toBe(command.envelope.actionId);
  expect(effect.accountId).toBe(command.accountId);
  expect(effect.amountMinorUnits).toBe("1001");
  expect(effect.acceptedAccountRevision).toBe("1");
  expect(effect.domain).toBe("accounts");
  expect(effect.kind).toBe("account.create-default");
  expect(effect.deleted).toBe(false);
  expect(effect.isEffective).toBe(true);
  expect(effect.compensatedAt).toBeNull();
  expect(effect.reversesEffectId).toBeNull();

  await createFinancialActionSyncService({
    foundationRepository: foundation(ledger.database),
    invokeAccountFinancialActionRpc: (): Promise<unknown> =>
      Promise.resolve(accepted(command)),
  }).syncAction(command.envelope.actionId);

  const root = await ownedRoot(ledger.database, command.envelope.actionId);
  expect(root.state).toBe("accepted");
  expect(root._raw._status).toBe("created");
  if (!root.localRecoverySnapshotJson)
    throw new Error("missing_real_private_add_recovery_evidence");
  return {
    command,
    effectId: command.effectId,
    privateBytes: root.localRecoverySnapshotJson,
  };
}

/** Actual registered financial-command writer, original Watermelon adapter
 * and original SQLite effect insert. Only remote RPC/owner are test doubles. */
async function commitActualIncomeSuccessor(accountId: string): Promise<{
  readonly transaction: Transaction;
  readonly effect: AccountFinancialEffect;
}> {
  const db = ledger.database;
  const categories = await db.get<Category>("categories").query().fetch();
  const category = categories.find(
    (candidate) => candidate.userId === OWNER && candidate.type === "INCOME"
  );
  if (!category) throw new Error("missing_real_owned_income_category");
  const balanceWriter = createAccountBalanceCommandService({
    foundationRepository: {
      commitFinancialActionGroupLocally:
        foundation(db).commitFinancialActionGroupLocally,
    },
    prepareEffectCreate: (input) =>
      db
        .get<AccountFinancialEffect>("account_financial_effects")
        .prepareCreate((row) => {
          row._raw.id = input.effectId;
          row.acceptedAccountRevision = input.acceptedAccountRevision;
          row.accountId = input.accountId;
          row.actionId = input.actionId;
          row.amountMinorUnits = input.amountMinorUnits;
          row.compensatedAt = null;
          row.currency = input.currency;
          row.deleted = false;
          row.domain = input.domain;
          row.isEffective = true;
          row.kind = input.kind;
          row.reversesEffectId = null;
          row.userId = input.userId;
        }),
  });
  const financial = createTransactionFinancialActionService({
    accountsCollection: () => db.get<Account>("accounts"),
    assertExpectedCurrentUser,
    createId: () => randomUUID(),
    executeAccountBalanceCommand: balanceWriter.execute,
    getCurrentUserDataScope,
    hashProvider,
    transactionsCollection: () => db.get<Transaction>("transactions"),
  });
  const transaction = await financial.create(
    {
      accountId,
      amount: 5,
      currency: "EGP",
      type: "INCOME",
      categoryId: category.id,
      source: "MANUAL",
    },
    OWNER
  );
  const effects = await db
    .get<AccountFinancialEffect>("account_financial_effects")
    .query(Q.where("action_id", transaction.id))
    .fetch();
  expect(effects).toHaveLength(1);
  const effect = effects[0];
  if (!effect) throw new Error("missing_actual_successor_effect");
  expect(effect.accountId).toBe(accountId);
  expect(effect.amountMinorUnits).toBe("500");
  expect(effect.acceptedAccountRevision).toBe("2");
  const successorRoot = await ownedRoot(db, transaction.id);
  expect(successorRoot.kind).toBe("create");
  await createFinancialActionSyncService({
    foundationRepository: foundation(db),
    invokeAccountFinancialActionRpc: (): Promise<unknown> =>
      Promise.resolve({
        actionId: transaction.id,
        status: "accepted",
        accountRevisions: [{ accountId, revision: "2" }],
        effectiveEventId: null,
        holdingRevision: null,
        serverAcceptedAt: "2026-10-16T11:00:00.000Z",
      }),
  }).syncAction(transaction.id);
  expect((await ownedRoot(db, transaction.id)).state).toBe("accepted");
  return { transaction, effect };
}
function remoteCurrentFinancialAccount(
  account: Account
): Readonly<Record<string, unknown>> {
  return {
    id: account.id,
    user_id: account.userId,
    type: account.type,
    currency: account.currency,
    created_at: account.createdAt.toISOString(),
    balance: account.balance,
    // Supabase generated accounts Row returns a numeric revision.
    financial_revision: Number(account.financialRevision),
  };
}

/** This independent accepted Add ACK is a positive control: a malformed
 * sibling must not pass merely because the SDK failed before its final gate. */
async function acceptedSiblingCashControl(
  name: string
): Promise<AccountDefaultPreparedCommand> {
  const command = await commitAdd(ledger.database, name, "0", false, "CASH");
  await createFinancialActionSyncService({
    foundationRepository: foundation(ledger.database),
    invokeAccountFinancialActionRpc: (): Promise<unknown> =>
      Promise.resolve(accepted(command)),
  }).syncAction(command.envelope.actionId);
  expect(
    (await ownedRoot(ledger.database, command.envelope.actionId)).state
  ).toBe("accepted");
  return command;
}

describe("#395 T069 — real SDK synchronization, pull/ACK and guarded recovery", () => {
  it("S27 genuine terminal Add ACK excludes neither a nonterminal owned Add nor a separate foreign actor's physical root", async () => {
    const clean = await commitAdd(
      ledger.database,
      "S27 accepted owner",
      "0",
      false,
      "CASH"
    );
    await createFinancialActionSyncService({
      foundationRepository: foundation(ledger.database),
      invokeAccountFinancialActionRpc: (): Promise<unknown> =>
        Promise.resolve(accepted(clean)),
    }).syncAction(clean.envelope.actionId);
    const pending = await commitAdd(
      ledger.database,
      "S27 rejected owner",
      "0",
      false,
      "CASH"
    );
    syncFixtureControls.mockActiveOwner = FOREIGN;
    let foreignActionId = "";
    try {
      const service = createAccountDefaultIntentService({
        database: ledger.database,
        getCurrentUserDataScope,
        assertExpectedCurrentUser,
        assertNoDuplicateAccountIdentity: assertNoDuplicateAddAccountIdentity,
        createId: (): string => randomUUID(),
        now: (): Date => new Date("2026-10-16T11:01:00.000Z"),
        hashProvider,
      });
      const foreign = await service.prepare(
        FOREIGN,
        form("S27 foreign queued", "0", false, "CASH")
      );
      await expect(service.commitPrepared(foreign)).resolves.toMatchObject({
        kind: "committed",
        accountId: foreign.accountId,
      });
      foreignActionId = foreign.envelope.actionId;
    } finally {
      syncFixtureControls.mockActiveOwner = OWNER;
    }
    if (!foreignActionId) throw new Error("missing_foreign_action_identity");
    const foreignRoots = await ledger.database
      .get<FinancialActionGroup>("financial_action_groups")
      .query(Q.where("action_id", foreignActionId), Q.where("user_id", FOREIGN))
      .fetch();
    expect(foreignRoots).toHaveLength(1);
    const foreignRoot = foreignRoots[0];
    if (!foreignRoot) throw new Error("missing_genuine_foreign_root");
    expect(foreignRoot.id).not.toBe(
      (await ownedRoot(ledger.database, clean.envelope.actionId)).id
    );

    await realSynchronize(ledger.database, {
      coordinator: actionCoordinator(
        ledger.database,
        ({ payloadJson }): Promise<unknown> => {
          expect(payloadJson).toContain(pending.envelope.actionId);
          return Promise.resolve(rejected(pending));
        }
      ),
    });
    const acceptedRoot = await ownedRoot(
      ledger.database,
      clean.envelope.actionId
    );
    const pendingRoot = await ownedRoot(
      ledger.database,
      pending.envelope.actionId
    );
    expect(acceptedRoot.state).toBe("accepted");
    expect(acceptedRoot._raw._status).toBe("synced");
    expect(pendingRoot.state).toBe("reconciliation_incomplete");
    expect(pendingRoot._raw._status).not.toBe("synced");
    expect(foreignRoot._raw._status).not.toBe("synced");
    expect(
      mockFinancialTransport.some(({ payloadJson }) =>
        payloadJson.includes(foreignActionId)
      )
    ).toBe(false);
    noPrivateNetworkBytes();
  });

  it("S28 genuine SDK original raw-equality retains a newer terminal-root edit beside a stable accepted Add ACK", async () => {
    const stable = await commitAdd(
      ledger.database,
      "S28 stable accepted",
      "0",
      false,
      "CASH"
    );
    const changed = await commitAdd(
      ledger.database,
      "S28 changed accepted",
      "0",
      false,
      "CASH"
    );
    for (const command of [stable, changed]) {
      await createFinancialActionSyncService({
        foundationRepository: foundation(ledger.database),
        invokeAccountFinancialActionRpc: (): Promise<unknown> =>
          Promise.resolve(accepted(command)),
      }).syncAction(command.envelope.actionId);
    }
    const changedRoot = await ownedRoot(
      ledger.database,
      changed.envelope.actionId
    );
    const originallyCapturedTimestamp = physicalRawField(
      changedRoot._raw,
      "updated_at"
    );
    let genuinelyChangedAfterCapture = false;
    await realSynchronize(ledger.database, {
      afterPush: async (): Promise<void> => {
        await ledger.database.write(() =>
          changedRoot.update((row) => {
            row.updatedAt = new Date(row.updatedAt.getTime() + 60_000);
          })
        );
        genuinelyChangedAfterCapture = true;
      },
    });
    expect(genuinelyChangedAfterCapture).toBe(true);
    expect(physicalRawField(changedRoot._raw, "updated_at")).not.toBe(
      originallyCapturedTimestamp
    );
    expect(
      (await ownedRoot(ledger.database, stable.envelope.actionId))._raw._status
    ).toBe("synced");
    expect(changedRoot.state).toBe("accepted");
    expect(changedRoot._raw._status).not.toBe("synced");
    noPrivateNetworkBytes();
  });
});

describe("#395 terminal SDK ACK — original nonzero opening effect integrity", () => {
  it("ACKs the proven accepted nonzero root after a legitimate residual name UPDATE; retained effect remains locally protected", async () => {
    const { command, effectId, privateBytes } =
      await locallyAcceptedNonzeroAdd();
    const account = await ledger.database
      .get<Account>("accounts")
      .find(command.accountId);
    await ledger.database.write(() =>
      account.update((row) => {
        row.name = "Legitimate metadata after accepted Add";
      })
    );
    mockUpdates.length = 0;
    mockUpserts.length = 0;

    await realSynchronize(ledger.database);

    const root = await ownedRoot(ledger.database, command.envelope.actionId);
    const expectedOutcome = serializeCanonicalJsonValue(
      accepted(command) as CanonicalJsonValue
    );
    expect(root._raw._status).toBe("synced");
    expect(root._raw._changed).toBe("");
    expect(root.state).toBe("accepted");
    expect(root.serverOutcome).toBe("accepted");
    expect(root.outcomeJson).toBe(expectedOutcome);
    expect(root.localRecoverySnapshotJson).toBe(privateBytes);
    const accountMetadataUpdates = mockUpdates.filter(
      (update) =>
        update.table === "accounts" && update.filters.id === command.accountId
    );
    expect(accountMetadataUpdates).toHaveLength(1);
    expect(accountMetadataUpdates[0]?.values).toEqual({
      name: "Legitimate metadata after accepted Add",
    });
    expect(accountMetadataUpdates[0]?.filters.id).toBe(command.accountId);
    expect(accountMetadataUpdates[0]?.filters.user_id).toBe(OWNER);
    expect(
      mockUpserts.filter((upsert) =>
        ["accounts", "bank_details", "account_sms_senders"].includes(
          upsert.table
        )
      )
    ).toEqual([]);

    const reopened = await coldRestart();
    const durableRoot = await ownedRoot(reopened, command.envelope.actionId);
    expect(durableRoot._raw._status).toBe("synced");
    expect(durableRoot._raw._changed).toBe("");
    expect(durableRoot.outcomeJson).toBe(expectedOutcome);
    expect(durableRoot.localRecoverySnapshotJson).toBe(privateBytes);
    const durableEffect = await reopened
      .get<AccountFinancialEffect>("account_financial_effects")
      .find(effectId);
    expect(durableEffect.acceptedAccountRevision).toBe("1");
    expect(durableEffect.domain).toBe("accounts");
    expect(durableEffect.kind).toBe("account.create-default");
    expect(durableEffect.deleted).toBe(false);
    expect(durableEffect.isEffective).toBe(true);
    expect(durableEffect._raw._status).not.toBe("synced");
    noPrivateNetworkBytes();
  });

  it.each([
    ["acceptedAccountRevision", "accepted_account_revision", "2"],
    ["domain", "domain", "transactions"],
    ["kind", "kind", "account.edit-balance"],
    ["deleted", "deleted", true],
  ] as const)(
    "keeps the accepted root dirty when original opening effect %s is corrupted",
    async (field, physicalField, corruptedValue): Promise<void> => {
      const { command, effectId, privateBytes } =
        await locallyAcceptedNonzeroAdd();
      const effect = await ledger.database
        .get<AccountFinancialEffect>("account_financial_effects")
        .find(effectId);
      // Actual public Watermelon model mutation, not a forged captured SDK raw.
      await ledger.database.write(() =>
        effect.update((row) => {
          switch (field) {
            case "acceptedAccountRevision":
              row.acceptedAccountRevision = "2";
              break;
            case "domain":
              row.domain = "transactions";
              break;
            case "kind":
              row.kind = "account.edit-balance";
              break;
            case "deleted":
              row.deleted = true;
              break;
          }
        })
      );
      expect(physicalRawField(effect._raw, physicalField)).toBe(corruptedValue);
      const corrupted = { ...effect._raw };
      mockUpdates.length = 0;
      mockUpserts.length = 0;

      await realSynchronize(ledger.database);

      const root = await ownedRoot(ledger.database, command.envelope.actionId);
      expect(root._raw._status).not.toBe("synced");
      expect(root.state).toBe("accepted");
      expect(root.serverOutcome).toBe("accepted");
      expect(root.localRecoverySnapshotJson).toBe(privateBytes);
      expect(physicalRawField(effect._raw, physicalField)).toBe(
        physicalRawField(corrupted, physicalField)
      );

      const reopened = await coldRestart();
      const durableRoot = await ownedRoot(reopened, command.envelope.actionId);
      expect(durableRoot._raw._status).not.toBe("synced");
      expect(durableRoot.state).toBe("accepted");
      expect(durableRoot.localRecoverySnapshotJson).toBe(privateBytes);
      const durableEffect = await reopened
        .get<AccountFinancialEffect>("account_financial_effects")
        .find(effectId);
      expect(physicalRawField(durableEffect._raw, physicalField)).toBe(
        corruptedValue
      );
      expect(durableEffect._raw._status).not.toBe("synced");
      expect(
        mockUpserts.some(
          (upsert) =>
            upsert.table === "account_financial_effects" ||
            upsert.table === "financial_action_groups"
        )
      ).toBe(false);
      noPrivateNetworkBytes();
    }
  );
});

describe("#395 terminal AccountAdd ACK — post-push and incoming corruption", () => {
  it("retains an accepted nonzero root when its genuine opening effect changes after push but before final SDK ACK", async () => {
    const { command, effectId, privateBytes } =
      await locallyAcceptedNonzeroAdd();
    const effect = await ledger.database
      .get<AccountFinancialEffect>("account_financial_effects")
      .find(effectId);
    let mutatedAfterPush = false;

    await realSynchronize(ledger.database, {
      afterPush: async (): Promise<void> => {
        await ledger.database.write(() =>
          effect.update((row) => {
            row.acceptedAccountRevision = "2";
          })
        );
        mutatedAfterPush = true;
      },
    });

    expect(mutatedAfterPush).toBe(true);
    expect(effect.acceptedAccountRevision).toBe("2");
    const root = await ownedRoot(ledger.database, command.envelope.actionId);
    expect(root.state).toBe("accepted");
    expect(root.serverOutcome).toBe("accepted");
    expect(root._raw._status).not.toBe("synced");
    expect(root.localRecoverySnapshotJson).toBe(privateBytes);
    expect(effect._raw._status).not.toBe("synced");

    const reopened = await coldRestart();
    const durableRoot = await ownedRoot(reopened, command.envelope.actionId);
    const durableEffect = await reopened
      .get<AccountFinancialEffect>("account_financial_effects")
      .find(effectId);
    expect(durableRoot._raw._status).not.toBe("synced");
    expect(durableRoot.localRecoverySnapshotJson).toBe(privateBytes);
    expect(durableEffect.acceptedAccountRevision).toBe("2");
    expect(durableEffect._raw._status).not.toBe("synced");
    noPrivateNetworkBytes();
  });

  it("refuses an incoming accepted nonzero Add with a corrupted genuine local effect before advancing the pull checkpoint", async () => {
    const command = await commitAdd(
      ledger.database,
      "Incoming nonzero opening proof",
      "10.01",
      false,
      "BANK"
    );
    if (!command.effectId) throw new Error("expected_nonzero_effect");
    await foundation(ledger.database).markFinancialActionGroupSyncPending(
      command.envelope.actionId
    );
    const root = await ownedRoot(ledger.database, command.envelope.actionId);
    const originalRoot = { ...root._raw };
    const privateBytes = root.localRecoverySnapshotJson;
    expect(privateBytes).not.toBeNull();
    const cloudRoot = Object.fromEntries(
      Object.entries(root._raw).filter(
        ([key]) =>
          !["_status", "_changed", "local_recovery_snapshot_json"].includes(key)
      )
    );
    Object.assign(cloudRoot, {
      state: "accepted",
      server_outcome: "accepted",
      outcome_json: serializeCanonicalJsonValue(
        accepted(command) as CanonicalJsonValue
      ),
      rejection_code: null,
    });
    const cloudEcho = await cloudAccount(
      ledger.database,
      command.accountId,
      {}
    );
    const effect = await ledger.database
      .get<AccountFinancialEffect>("account_financial_effects")
      .find(command.effectId);
    await ledger.database.write(() =>
      effect.update((row) => {
        row.kind = "account.edit-balance";
      })
    );
    expect(effect.kind).toBe("account.edit-balance");
    const corruptedEffect = { ...effect._raw };
    let initialCheckpoint: number | null | undefined;

    await expect(
      realSynchronize(ledger.database, {
        pull: ({ lastPulledAt }): Promise<SyncPullResult> => {
          initialCheckpoint = lastPulledAt;
          return Promise.resolve({
            changes: {
              financial_action_groups: tableUpdated(cloudRoot),
              accounts: tableUpdated(cloudEcho),
            },
            timestamp: ++syncFixtureControls.mockNextWatermark,
          });
        },
      })
    ).rejects.toThrow("account_sync_pull_bound_add_members_changed");
    expect(
      (await ownedRoot(ledger.database, command.envelope.actionId))._raw
    ).toEqual(originalRoot);
    expect(root.state).toBe("sync_pending");
    expect(root.serverOutcome).toBeNull();
    expect(root.outcomeJson).toBeNull();
    expect(root._raw._status).not.toBe("synced");
    expect(root.localRecoverySnapshotJson).toBe(privateBytes);
    expect(effect._raw).toEqual(corruptedEffect);

    let retryCheckpoint: number | null | undefined;
    await expect(
      realSynchronize(ledger.database, {
        pull: ({ lastPulledAt }): Promise<SyncPullResult> => {
          retryCheckpoint = lastPulledAt;
          throw new Error("intentional_checkpoint_observation_stop");
        },
      })
    ).rejects.toThrow("intentional_checkpoint_observation_stop");
    expect(retryCheckpoint).toBe(initialCheckpoint);
    const reopened = await coldRestart();
    const durableRoot = await ownedRoot(reopened, command.envelope.actionId);
    const durableEffect = await reopened
      .get<AccountFinancialEffect>("account_financial_effects")
      .find(command.effectId);
    expect(durableRoot._raw._status).not.toBe("synced");
    expect(durableRoot.state).toBe("sync_pending");
    expect(durableRoot.serverOutcome).toBeNull();
    expect(durableRoot.outcomeJson).toBeNull();
    expect(durableRoot.localRecoverySnapshotJson).toBe(privateBytes);
    expect(durableEffect._raw).toEqual(corruptedEffect);
    noPrivateNetworkBytes();
  });
});

describe("#395 first-release ordinary Add-root versus account/child ACK liveness", () => {
  it("ACKs the historical accepted Add and independently confirmed current account after a genuine accepted financial Save", async () => {
    const { command, effectId, privateBytes } =
      await locallyAcceptedNonzeroAdd();
    const account = await ledger.database
      .get<Account>("accounts")
      .find(command.accountId);
    const { transaction, effect } = await commitActualIncomeSuccessor(
      command.accountId
    );
    expect(transaction.accountId).toBe(command.accountId);
    expect(account.balance).toBe(15.01);
    expect(account.financialRevision).toBe("2");
    expect(account._raw._status).toBe("created");
    // The external mock represents only a positive, owner-filtered server
    // readback after the registered financial successor was accepted.
    syncFixtureControls.setAccountFinancialReadback(
      remoteCurrentFinancialAccount(account)
    );
    mockUpdates.length = 0;
    mockUpserts.length = 0;
    await realSynchronize(ledger.database);
    const root = await ownedRoot(ledger.database, command.envelope.actionId);
    expect(root._raw._status).toBe("synced");
    expect(root.localRecoverySnapshotJson).toBe(privateBytes);
    expect(account._raw._status).toBe("synced");
    expect(account.balance).toBe(15.01);
    expect(account.financialRevision).toBe("2");
    const original = await ledger.database
      .get<AccountFinancialEffect>("account_financial_effects")
      .find(effectId);
    expect(original.acceptedAccountRevision).toBe("1");
    expect(original.kind).toBe("account.create-default");
    expect(original.amountMinorUnits).toBe("1001");
    expect(original.isEffective).toBe(true);
    expect(effect.acceptedAccountRevision).toBe("2");
    expect(
      mockUpserts.filter((upsert) =>
        ["accounts", "account_financial_effects"].includes(upsert.table)
      )
    ).toEqual([]);
    expect(
      mockUpdates.filter(
        (update) =>
          update.table === "accounts" &&
          ("balance" in update.values || "financial_revision" in update.values)
      )
    ).toEqual([]);
    const restarted = await coldRestart();
    expect(
      (await ownedRoot(restarted, command.envelope.actionId))
        .localRecoverySnapshotJson
    ).toBe(privateBytes);
    expect(
      (await restarted.get<Account>("accounts").find(command.accountId))
        .financialRevision
    ).toBe("2");
    noPrivateNetworkBytes();
  });

  it("ACKs only the original accepted root while newer financial fields lack server readback, then ACKs the account after positive readback", async () => {
    const { command, effectId, privateBytes } =
      await locallyAcceptedNonzeroAdd();
    const account = await ledger.database
      .get<Account>("accounts")
      .find(command.accountId);
    await commitActualIncomeSuccessor(command.accountId);
    expect(account.financialRevision).toBe("2");
    // No source of authority for current finance: newer local revision by
    // itself NEVER covers created-row balance or financial_revision.
    mockUpserts.length = 0;
    await realSynchronize(ledger.database);
    const root = await ownedRoot(ledger.database, command.envelope.actionId);
    expect(root._raw._status).toBe("synced");
    expect(root.localRecoverySnapshotJson).toBe(privateBytes);
    expect(account._raw._status).not.toBe("synced");
    expect(physicalRawField(account._raw, "financial_revision")).toBe("2");
    expect(mockUpserts.some((record) => record.table === "accounts")).toBe(
      false
    );
    expect(
      (
        await ledger.database
          .get<AccountFinancialEffect>("account_financial_effects")
          .find(effectId)
      ).isEffective
    ).toBe(true);
    const restarted = await coldRestart();
    expect(
      (await ownedRoot(restarted, command.envelope.actionId))._raw._status
    ).toBe("synced");
    expect(
      (await restarted.get<Account>("accounts").find(command.accountId))._raw
        ._status
    ).not.toBe("synced");
    // A higher remote revision alone is insufficient; keep protected finance
    // pending even after the historical root was independently ACKed.
    const restartedAccount = await restarted
      .get<Account>("accounts")
      .find(command.accountId);
    const correct = remoteCurrentFinancialAccount(restartedAccount);
    syncFixtureControls.setAccountFinancialReadback({
      ...correct,
      financial_revision: 3,
    });
    await expect(realSynchronize(restarted)).resolves.toBeUndefined();
    expect(restartedAccount._raw._status).not.toBe("synced");
    expect(restartedAccount.financialRevision).toBe("2");
    // An authenticated SELECT error also yields no field-level ACK proof.
    syncFixtureControls.setAccountFinancialReadback(correct);
    syncFixtureControls.setAccountFinancialReadbackError({
      code: "PGRST_TEST_ERROR",
      message: "simulated_owner_scoped_read_error",
    });
    await expect(realSynchronize(restarted)).resolves.toBeUndefined();
    expect(restartedAccount._raw._status).not.toBe("synced");
    expect(
      (await ownedRoot(restarted, command.envelope.actionId))._raw._status
    ).toBe("synced");
    syncFixtureControls.setAccountFinancialReadbackError(null);
    await realSynchronize(restarted, {
      afterPush: async () => {
        await restarted.write(() =>
          restartedAccount.update((row) => {
            row.name = "Concurrent metadata after positive readback";
          })
        );
      },
    });
    expect(restartedAccount._raw._status).not.toBe("synced");
    await expect(realSynchronize(restarted)).resolves.toBeUndefined();
    expect(restartedAccount._raw._status).toBe("synced");
    expect(restartedAccount.financialRevision).toBe("2");
    expect(restartedAccount.balance).toBe(15.01);
    noPrivateNetworkBytes();
  });

  it("ACKs historical Add after actual sender replacement; original deleted and extra owned sender remain independently scoped", async () => {
    const command = await commitAdd(
      ledger.database,
      "Historical sender Bank",
      "0",
      false,
      "BANK"
    );
    await createFinancialActionSyncService({
      foundationRepository: foundation(ledger.database),
      invokeAccountFinancialActionRpc: (): Promise<unknown> =>
        Promise.resolve(accepted(command)),
    }).syncAction(command.envelope.actionId);
    const account = await ledger.database
      .get<Account>("accounts")
      .find(command.accountId);
    const originalId = command.senders[0]?.id;
    if (!originalId) throw new Error("missing_original_bank_sender");
    const original = await ledger.database
      .get<AccountSmsSender>("account_sms_senders")
      .find(originalId);
    const createdAt = physicalRawField(original._raw, "created_at");
    await ledger.database.write(() =>
      replaceAccountSmsSendersWithinWriter(account, OWNER, ["NEWBANK"])
    );
    const all = await ledger.database
      .get<AccountSmsSender>("account_sms_senders")
      .query(Q.where("account_id", command.accountId))
      .fetch();
    const additional = all.find(
      (sender) => sender.id !== originalId && !sender.deleted
    );
    expect(original.deleted).toBe(true);
    expect(physicalRawField(original._raw, "created_at")).toBe(createdAt);
    expect(additional?.senderName).toBe("NEWBANK");
    expect(all).toHaveLength(2);
    mockUpserts.length = 0;
    await realSynchronize(ledger.database);
    expect(
      (await ownedRoot(ledger.database, command.envelope.actionId))._raw._status
    ).toBe("synced");
    expect(original.deleted).toBe(true);
    expect(original.accountId).toBe(command.accountId);
    expect(additional?.accountId).toBe(command.accountId);
    expect(
      mockUpserts.some(
        (entry) =>
          entry.table === "account_sms_senders" &&
          entry.rows.some((row) => row.id === additional?.id)
      )
    ).toBe(true);
    const reopened = await coldRestart();
    const keptOriginal = await reopened
      .get<AccountSmsSender>("account_sms_senders")
      .find(originalId);
    expect(keptOriginal.deleted).toBe(true);
    expect(physicalRawField(keptOriginal._raw, "created_at")).toBe(createdAt);
    expect(
      (await ownedRoot(reopened, command.envelope.actionId))._raw._status
    ).toBe("synced");
    noPrivateNetworkBytes();
  });

  it("never ACKs original Add after a genuine original child is reparented to a foreign-owned account", async () => {
    const { command, privateBytes } = await locallyAcceptedNonzeroAdd();
    const foreignParent = await ledger.database.write(() =>
      ledger.database.get<Account>("accounts").create((row) => {
        row.userId = FOREIGN;
        row.name = "Foreign owned";
        row.type = "BANK";
        row.currency = "EGP";
        row.balance = 0;
        row.financialRevision = "0";
        row.isDefault = false;
        row.deleted = false;
      })
    );
    const senderId = command.senders[0]?.id;
    if (!senderId) throw new Error("missing_original_child_to_reparent");
    const original = await ledger.database
      .get<AccountSmsSender>("account_sms_senders")
      .find(senderId);
    await ledger.database.write(() =>
      original.update((row) => {
        row.accountId = foreignParent.id;
      })
    );
    expect(original.accountId).toBe(foreignParent.id);
    // A valid sibling must ACK in the SAME SDK run, proving the intended
    // physical-member refusal rather than an unrelated caught sync error.
    const valid = await acceptedSiblingCashControl("Foreign-child ACK control");
    await expect(realSynchronize(ledger.database)).resolves.toBeUndefined();
    expect(
      (await ownedRoot(ledger.database, valid.envelope.actionId))._raw._status
    ).toBe("synced");
    const root = await ownedRoot(ledger.database, command.envelope.actionId);
    expect(root.state).toBe("accepted");
    expect(root.serverOutcome).toBe("accepted");
    expect(root._raw._status).not.toBe("synced");
    expect(root.localRecoverySnapshotJson).toBe(privateBytes);
    const fresh = await coldRestart();
    expect(
      (await ownedRoot(fresh, command.envelope.actionId))._raw._status
    ).not.toBe("synced");
    expect(
      (await fresh.get<AccountSmsSender>("account_sms_senders").find(senderId))
        .accountId
    ).toBe(foreignParent.id);
    noPrivateNetworkBytes();
  });

  it("holds the original Add root when an unexpected bank-details child appears", async () => {
    const { command, privateBytes } = await locallyAcceptedNonzeroAdd();
    await ledger.database.write(() =>
      ledger.database.get<BankDetails>("bank_details").create((row) => {
        row.accountId = command.accountId;
        row.cardLast4 = 4321;
        row.deleted = false;
      })
    );
    const valid = await acceptedSiblingCashControl("Extra-bank ACK control");
    await expect(realSynchronize(ledger.database)).resolves.toBeUndefined();
    expect(
      (await ownedRoot(ledger.database, valid.envelope.actionId))._raw._status
    ).toBe("synced");
    expect(
      (await ownedRoot(ledger.database, command.envelope.actionId))._raw._status
    ).not.toBe("synced");
    expect(
      (await ownedRoot(ledger.database, command.envelope.actionId))
        .localRecoverySnapshotJson
    ).toBe(privateBytes);
    noPrivateNetworkBytes();
  });
});
