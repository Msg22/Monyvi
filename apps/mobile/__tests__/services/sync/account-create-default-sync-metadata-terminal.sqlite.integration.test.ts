/**
 * #395 T069 — extracted owned metadata, terminal receipts and default-state ordering cases from the original genuine
 * SDK/SQLite lifecycle suite. Original assertions and case order retained;
 * shared real-Watermelon fixture registers the same setup/mocks per suite.
 * AUTHORED ONLY — NOT RUN. No emulator/native or DB execution.
 */
import {
  canonicalizeFinancialActionEnvelope,
  legacyEditBalanceEnvelope,
  reviewBatchSaveEnvelope,
  createAccountReviewFinancialRegistry,
  createFinancialActionSyncService,
  productionFinancialActionReconciliationService,
  randomUUID,
  collectAccountFinancialActionPushBundles,
  OWNER,
  mockUpserts,
  mockUpdates,
  mockFinancialTransport,
  ledger,
  foundation,
  commitAdd,
  ownedRoot,
  accepted,
  realSynchronize,
  acceptThenAck,
  outboundTouchesIds,
  noPrivateNetworkBytes,
  coldRestart,
  cloudAccount,
  tableUpdated,
  markRejected,
  syncFixtureControls,
  type Model,
  type SyncPullResult,
  type Account,
  type AccountSmsSender,
  type BankDetails,
  type FinancialActionGroup,
  type AppSyncDatabaseChangeSet,
} from "./account-create-default-sync-lifecycle-fixtures";
import { physicalSaveLedgerSnapshot } from "../account-review-save-sqlite-test-helpers";

describe("#395 T069 — owned metadata, terminal receipts and default-state ordering", () => {
  it("S01 a clean accepted Add root survives restart; unrelated dirty account name uses ID/owner-filtered minimal UPDATE, never account UPSERT or clean is_default", async () => {
    const first = await commitAdd(
      ledger.database,
      "First Cash",
      "0",
      false,
      "CASH"
    );
    await acceptThenAck(ledger.database, first);
    const db = await coldRestart();
    const root = await ownedRoot(db, first.envelope.actionId);
    expect(root.state).toBe("accepted");
    expect(root._raw._status).toBe("synced");
    expect(root._raw._changed).toBe("");
    const account = await db.get<Account>("accounts").find(first.accountId);
    await db.write(() =>
      account.update((row) => {
        row.name = "Changed after accepted ACK";
      })
    );
    mockUpserts.length = 0;
    mockUpdates.length = 0;
    await realSynchronize(db);
    const sentAccounts = mockUpserts.filter(
      (entry) => entry.table === "accounts"
    );
    expect(sentAccounts).toEqual([]);
    const updates = mockUpdates.filter((entry) => entry.table === "accounts");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.values).toEqual({ name: "Changed after accepted ACK" });
    expect(updates[0]?.filters).toMatchObject({
      id: first.accountId,
      user_id: OWNER,
    });
    expect(updates[0]?.values).not.toHaveProperty("is_default");
    expect(updates[0]?.values).not.toHaveProperty("balance");
    expect(updates[0]?.values).not.toHaveProperty("financial_revision");
    noPrivateNetworkBytes();
  });

  it("S02 previous default's cleaned Add flag never leaks with later unrelated metadata; later direct legitimate default intent is not permanently blacklisted", async () => {
    const a = await commitAdd(
      ledger.database,
      "Earlier Cash",
      "0",
      false,
      "CASH"
    );
    await acceptThenAck(ledger.database, a);
    const b = await commitAdd(
      ledger.database,
      "Later Default",
      "0",
      true,
      "BANK"
    );
    await acceptThenAck(ledger.database, b);
    const db = await coldRestart();
    const previous = await db.get<Account>("accounts").find(a.accountId);
    expect(previous.isDefault).toBe(false);
    expect(previous._raw._status).toBe("synced");
    expect(previous._raw._changed).toBe("");
    await db.write(() =>
      previous.update((account) => {
        account.name = "Previous account renamed";
      })
    );
    mockUpserts.length = 0;
    mockUpdates.length = 0;
    await realSynchronize(db);
    const update = mockUpdates.find(
      (item) => item.table === "accounts" && item.filters.id === a.accountId
    );
    expect(update?.values).toEqual({ name: "Previous account renamed" });
    expect(update?.filters.user_id).toBe(OWNER);
    expect(
      mockUpserts.some(
        (item) =>
          item.table === "accounts" &&
          item.rows.some((row) => row.id === a.accountId)
      )
    ).toBe(false);
    noPrivateNetworkBytes();
  });

  it("S12 remote metadata UPDATE with no positively returned owned row ID must fail and keep the local change dirty", async () => {
    const command = await commitAdd(
      ledger.database,
      "Update Count Check",
      "0",
      false,
      "CASH"
    );
    await acceptThenAck(ledger.database, command);
    const db = await coldRestart();
    const account = await db.get<Account>("accounts").find(command.accountId);
    await db.write(() =>
      account.update((row) => {
        row.name = "Needs positive remote receipt";
      })
    );
    mockUpserts.length = 0;
    mockUpdates.length = 0;
    syncFixtureControls.mockForceUnverifiedUpdateResult = true;
    await expect(realSynchronize(db)).rejects.toThrow();
    expect(account._raw._status).toBe("updated");
    expect(mockUpserts.filter((entry) => entry.table === "accounts")).toEqual(
      []
    );
    expect(
      mockUpdates.some(
        (entry) =>
          entry.table === "accounts" &&
          entry.filters.user_id === OWNER &&
          entry.filters.id === command.accountId
      )
    ).toBe(true);
    noPrivateNetworkBytes();
  });

  it("S13 accepted Add then real Watermelon soft-delete edits are sent as owned deleted/default metadata, never silently ACKed", async () => {
    const command = await commitAdd(
      ledger.database,
      "Deleted Cash",
      "0",
      false,
      "CASH"
    );
    await acceptThenAck(ledger.database, command);
    const db = await coldRestart();
    const current = await db.get<Account>("accounts").find(command.accountId);
    // Same physical Watermelon prepareUpdate semantics as the existing
    // EditAccountService soft delete; no fake ACK engine or financial writer.
    await db.write(() =>
      current.update((row) => {
        row.deleted = true;
        row.isDefault = false;
      })
    );
    expect(current._raw._status).toBe("updated");
    expect(current._raw._changed.split(",")).toContain("deleted");
    mockUpserts.length = 0;
    mockUpdates.length = 0;
    await realSynchronize(db);
    expect(mockUpserts.filter((row) => row.table === "accounts")).toEqual([]);
    const updates = mockUpdates.filter(
      (row) => row.table === "accounts" && row.filters.id === command.accountId
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]?.values).toMatchObject({
      deleted: true,
      is_default: false,
    });
    expect(updates[0]?.filters.user_id).toBe(OWNER);
    expect(updates[0]?.values).not.toHaveProperty("balance");
    expect(updates[0]?.values).not.toHaveProperty("financial_revision");
    expect(current._raw._status).toBe("synced");
    noPrivateNetworkBytes();
  });

  it("S14 a verified name UPDATE must NOT ACK unrelated unsupported dirty currency or status bits", async () => {
    const command = await commitAdd(
      ledger.database,
      "Preserve unknown fields",
      "0",
      false,
      "CASH"
    );
    await acceptThenAck(ledger.database, command);
    const db = await coldRestart();
    const account = await db.get<Account>("accounts").find(command.accountId);
    await db.write(() =>
      account.update((row) => {
        row.name = "Legitimate independent metadata";
        row._setRaw("currency", "USD");
      })
    );
    const originalChanged = account._raw._changed;
    expect(originalChanged.split(",")).toContain("currency");
    await realSynchronize(db);
    const sent = mockUpdates.filter(
      (row) => row.table === "accounts" && row.filters.id === command.accountId
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.values).toEqual({
      name: "Legitimate independent metadata",
    });
    expect(account._raw._status).not.toBe("synced");
    expect(account._raw._changed).toContain("currency");
    noPrivateNetworkBytes();
  });

  it("S19 a real two-account default reversal clears the old server default before attempting the new positive flag", async () => {
    const a = await commitAdd(ledger.database, "Default A", "0", false, "CASH");
    await acceptThenAck(ledger.database, a);
    const b = await commitAdd(ledger.database, "Default B", "0", true, "CASH");
    await acceptThenAck(ledger.database, b);
    const db = await coldRestart();
    const accountA = await db.get<Account>("accounts").find(a.accountId);
    const accountB = await db.get<Account>("accounts").find(b.accountId);
    await db.write(() =>
      db.batch(
        accountB.prepareUpdate((r) => {
          r.isDefault = false;
        }),
        accountA.prepareUpdate((r) => {
          r.isDefault = true;
        })
      )
    );
    syncFixtureControls.mockRemoteDefaultAccountId = b.accountId;
    syncFixtureControls.mockEnforceRemoteDefaultUnique = true;
    mockUpdates.length = 0;
    await realSynchronize(db);
    const flags = mockUpdates.filter(
      (r) => r.table === "accounts" && typeof r.values.is_default === "boolean"
    );
    expect(
      flags.map((r) => ({
        id: r.filters.id,
        value: r.values.is_default,
      }))
    ).toEqual([
      { id: b.accountId, value: false },
      { id: a.accountId, value: true },
    ]);
    expect(syncFixtureControls.mockRemoteDefaultAccountId).toBe(a.accountId);
    expect(accountA.isDefault).toBe(true);
    expect(accountB.isDefault).toBe(false);
    noPrivateNetworkBytes();
  });

  it("S21 A1 accepted Add default Edit reverses twice, including historical-equal flags, with positive remote ACK and names", async () => {
    const a = await commitAdd(ledger.database, "Reverse A", "0", false, "CASH");
    await acceptThenAck(ledger.database, a);
    const b = await commitAdd(ledger.database, "Reverse B", "0", true, "CASH");
    await acceptThenAck(ledger.database, b);
    const db = await coldRestart();
    const accountA = await db.get<Account>("accounts").find(a.accountId);
    const accountB = await db.get<Account>("accounts").find(b.accountId);
    const edit = async (selected: "A" | "B"): Promise<void> => {
      await db.write(() =>
        db.batch(
          accountA.prepareUpdate((row) => {
            row.isDefault = selected === "A";
            row.name = selected === "A" ? "Edited A first" : "Edited A again";
          }),
          accountB.prepareUpdate((row) => {
            row.isDefault = selected === "B";
            row.name = selected === "A" ? "Edited B first" : "Edited B again";
          })
        )
      );
    };
    syncFixtureControls.mockRemoteDefaultAccountId = b.accountId;
    syncFixtureControls.mockEnforceRemoteDefaultUnique = true;
    await edit("A");
    mockUpdates.length = 0;
    await realSynchronize(db);
    expect(
      mockUpdates
        .filter(
          (u) =>
            u.table === "accounts" && typeof u.values.is_default === "boolean"
        )
        .map((u) => ({ id: u.filters.id, flag: u.values.is_default }))
    ).toEqual([
      { id: b.accountId, flag: false },
      { id: a.accountId, flag: true },
    ]);
    expect(accountA._raw._status).toBe("synced");
    expect(accountB._raw._status).toBe("synced");
    await edit("B");
    mockUpdates.length = 0;
    await realSynchronize(db);
    expect(
      mockUpdates
        .filter(
          (u) =>
            u.table === "accounts" && typeof u.values.is_default === "boolean"
        )
        .map((u) => ({ id: u.filters.id, flag: u.values.is_default }))
    ).toEqual([
      { id: a.accountId, flag: false },
      { id: b.accountId, flag: true },
    ]);
    expect(
      mockUpdates.find(
        (u) => u.table === "accounts" && u.filters.id === a.accountId
      )?.values.name
    ).toBe("Edited A again");
    expect(
      mockUpdates.find(
        (u) => u.table === "accounts" && u.filters.id === b.accountId
      )?.values.name
    ).toBe("Edited B again");
    expect(syncFixtureControls.mockRemoteDefaultAccountId).toBe(b.accountId);
    expect(accountA._raw._status).toBe("synced");
    expect(accountB._raw._status).toBe("synced");
    noPrivateNetworkBytes();
  });

  it("S22 A2 accepted Add before initial SDK ACK transports only residual account/bank/sender metadata with owned positive receipts", async () => {
    const command = await commitAdd(
      ledger.database,
      "Bank initially",
      "0",
      true,
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
    if (!command.bankDetailId || command.senders.length === 0)
      throw new Error("missing_real_add_bank_and_sender");
    const bank = await ledger.database
      .get<BankDetails>("bank_details")
      .find(command.bankDetailId);
    const sender = await ledger.database
      .get<AccountSmsSender>("account_sms_senders")
      .find(command.senders[0].id);
    await ledger.database.write(() =>
      ledger.database.batch(
        account.prepareUpdate((row) => {
          row.name = "Renamed before first ACK";
          row.providerDisplayName = "Renamed provider";
        }),
        bank.prepareUpdate((row) => {
          row.accountNumber = "0011223344";
        }),
        sender.prepareUpdate((row) => {
          row.senderName = "NEWBANK";
          row.normalizedSenderName = "newbank";
        })
      )
    );
    expect(account._raw._status).toBe("created");
    expect(bank._raw._status).toBe("created");
    expect(sender._raw._status).toBe("created");
    mockUpdates.length = 0;
    mockUpserts.length = 0;
    await realSynchronize(ledger.database);
    expect(
      mockUpserts.filter((entry) =>
        ["accounts", "bank_details", "account_sms_senders"].includes(
          entry.table
        )
      )
    ).toEqual([]);
    expect(
      mockUpdates.find(
        (entry) =>
          entry.table === "accounts" && entry.filters.id === command.accountId
      )?.values
    ).toMatchObject({
      name: "Renamed before first ACK",
      provider_display_name: "Renamed provider",
    });
    expect(
      mockUpdates.find(
        (entry) =>
          entry.table === "bank_details" && entry.filters.id === bank.id
      )
    ).toMatchObject({
      filters: { id: bank.id, account_id: command.accountId },
      values: { account_number: "0011223344" },
    });
    expect(
      mockUpdates.find(
        (entry) =>
          entry.table === "account_sms_senders" &&
          entry.filters.id === sender.id
      )
    ).toMatchObject({
      filters: { id: sender.id, account_id: command.accountId },
      values: {
        sender_name: "NEWBANK",
        normalized_sender_name: "newbank",
      },
    });
    expect(account._raw._status).toBe("synced");
    expect(bank._raw._status).toBe("synced");
    expect(sender._raw._status).toBe("synced");
    noPrivateNetworkBytes();
  });

  it.each(["0", "10.01"])(
    "S23 A3 root accepted/compensated state is classified before dirty member collector for opening %s",
    async (opening): Promise<void> => {
      const command = await commitAdd(
        ledger.database,
        "Detached loss",
        opening,
        true,
        "BANK"
      );
      await markRejected(ledger.database, command);
      await expect(
        productionFinancialActionReconciliationService.reconcileRejectedAction(
          command.envelope.actionId
        )
      ).resolves.toBe("reconciled");
      const db = await coldRestart();
      const rootRow = await ownedRoot(db, command.envelope.actionId);
      expect(rootRow.state).toBe("reconciled");
      expect(rootRow.localRecoverySnapshotJson).not.toBeNull();
      await realSynchronize(db);
      const cleaned = await ownedRoot(db, command.envelope.actionId);
      expect(cleaned._raw._status).toBe("synced");
      const losing = await db.get<Account>("accounts").find(command.accountId);
      expect(losing.deleted).toBe(true);
      expect(losing._raw._status).not.toBe("synced");
      const cloned = await coldRestart();
      mockUpserts.length = 0;
      mockUpdates.length = 0;
      await realSynchronize(cloned);
      const ids = new Set(
        [
          command.accountId,
          command.bankDetailId,
          command.effectId,
          ...command.senders.map((sender) => sender.id),
        ].filter((id): id is string => typeof id === "string")
      );
      expect(outboundTouchesIds(ids)).toBe(false);
      expect(
        (await ownedRoot(cloned, command.envelope.actionId))
          .localRecoverySnapshotJson
      ).not.toBeNull();
      noPrivateNetworkBytes();
    }
  );

  it("S26 A5 an ordinary owned default clears before a historical accepted Add default is set", async () => {
    // Genuine ordinary account created through real Watermelon writer, not
    // an Add action, represents the pre-existing Edit account path.
    const ordinary = await ledger.database.write(() =>
      ledger.database.get<Account>("accounts").create((row) => {
        row._raw.id = randomUUID();
        row.userId = OWNER;
        row.name = "Ordinary prior P";
        row.type = "CASH";
        row.currency = "EGP";
        row.balance = 0;
        row.financialRevision = "0";
        row.isDefault = true;
        row.deleted = false;
      })
    );
    await realSynchronize(ledger.database);
    expect(ordinary._raw._status).toBe("synced");
    const a = await commitAdd(
      ledger.database,
      "Accepted off A",
      "0",
      false,
      "CASH"
    );
    await acceptThenAck(ledger.database, a);
    const db = await coldRestart();
    const prior = await db.get<Account>("accounts").find(ordinary.id);
    const accountA = await db.get<Account>("accounts").find(a.accountId);
    await db.write(() =>
      db.batch(
        prior.prepareUpdate((r) => {
          r.isDefault = false;
          r.name = "Ordinary P edited";
        }),
        accountA.prepareUpdate((r) => {
          r.isDefault = true;
        })
      )
    );
    syncFixtureControls.mockEnforceRemoteDefaultUnique = true;
    syncFixtureControls.mockRemoteDefaultAccountId = ordinary.id;
    mockUpdates.length = 0;
    mockUpserts.length = 0;
    await realSynchronize(db);
    const observed = mockUpdates.filter(
      (item) =>
        item.table === "accounts" && typeof item.values.is_default === "boolean"
    );
    expect(
      observed.map((item) => ({
        account: item.filters.id,
        flag: item.values.is_default,
      }))
    ).toEqual([
      { account: ordinary.id, flag: false },
      { account: a.accountId, flag: true },
    ]);
    expect(syncFixtureControls.mockRemoteDefaultAccountId).toBe(a.accountId);
    expect(prior._raw._status).toBe("synced");
    expect(accountA._raw._status).toBe("synced");
    noPrivateNetworkBytes();
  });

  it("S09 legacy metadata with no protected financial root still has ordinary owned sync; Review/rejected roots retain a separate guarded path", async () => {
    const original = await commitAdd(
      ledger.database,
      "Reviewed Bank",
      "0",
      true,
      "BANK"
    );
    const root = await ownedRoot(ledger.database, original.envelope.actionId);
    expect(root.domain).toBe("accounts");
    expect(root.kind).toBe("create_with_default");
    const realChanges: AppSyncDatabaseChangeSet = {};
    for (const tableName of [
      "financial_action_groups",
      "accounts",
      "account_sms_senders",
      "bank_details",
      "account_financial_effects",
    ] as const) {
      const rows = await ledger.database.get<Model>(tableName).query().fetch();
      realChanges[tableName] = {
        created: rows
          .filter((r) => r._raw._status === "created")
          .map((r) => ({ ...r._raw })),
        updated: rows
          .filter((r) => r._raw._status === "updated")
          .map((r) => ({ ...r._raw })),
        deleted: [],
      };
    }
    const bundles = collectAccountFinancialActionPushBundles(realChanges);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.rowIds.financial_action_groups).toEqual([root.id]);
    expect(bundles[0]?.rowIds.account_financial_effects).toBeUndefined();
    // Use the actual registered *existing* Review and deployed legacy
    // canonical envelopes as positive compatibility controls, not fabricated
    // root rows or a duplicate sync implementation.
    const registry = createAccountReviewFinancialRegistry();
    const review = canonicalizeFinancialActionEnvelope(
      reviewBatchSaveEnvelope,
      registry
    );
    const legacy = canonicalizeFinancialActionEnvelope(
      legacyEditBalanceEnvelope,
      registry
    );
    expect(review.payloadVersion).toBe("review.batch-save/v1");
    expect(review.kind).toBe("review_batch_save");
    expect(review.accountGuards.length).toBeGreaterThan(0);
    expect(legacy.payloadVersion).toBe("account.balance-effects/v1");
    expect(legacy.kind).toBe("edit_balance");
    expect(legacy.accountGuards.length).toBeGreaterThan(0);
    await acceptThenAck(ledger.database, original);
    noPrivateNetworkBytes();
  });

  it("F1 ordinary updated two-account reversal emits positive is_default=true field UPDATE with clear-before-set ordering and receives ACK without financial mutation", async () => {
    // Two genuine ordinary accounts created directly via Watermelon writer, not through Add command
    const [ordA, ordB] = await ledger.database.write(() =>
      Promise.all([
        ledger.database.get<Account>("accounts").create((row) => {
          row._raw.id = randomUUID();
          row.userId = OWNER;
          row.name = "Ordinary Default One";
          row.type = "CASH";
          row.currency = "EGP";
          row.balance = 0;
          row.financialRevision = "0";
          row.isDefault = true;
          row.deleted = false;
        }),
        ledger.database.get<Account>("accounts").create((row) => {
          row._raw.id = randomUUID();
          row.userId = OWNER;
          row.name = "Ordinary Default Two";
          row.type = "CASH";
          row.currency = "EGP";
          row.balance = 0;
          row.financialRevision = "0";
          row.isDefault = false;
          row.deleted = false;
        }),
      ])
    );
    await realSynchronize(ledger.database);
    expect(ordA._raw._status).toBe("synced");
    expect(ordB._raw._status).toBe("synced");

    const db = await coldRestart();
    const accountA = await db.get<Account>("accounts").find(ordA.id);
    const accountB = await db.get<Account>("accounts").find(ordB.id);

    // Reverse defaults in a local user edit: A cleared, B set
    await db.write(() =>
      db.batch(
        accountA.prepareUpdate((r) => {
          r.isDefault = false;
        }),
        accountB.prepareUpdate((r) => {
          r.isDefault = true;
        })
      )
    );

    syncFixtureControls.mockRemoteDefaultAccountId = ordA.id;
    syncFixtureControls.mockEnforceRemoteDefaultUnique = true;
    mockUpdates.length = 0;
    mockUpserts.length = 0;

    await realSynchronize(db);

    // Generic account UPSERT must remain suppressed
    expect(mockUpserts.filter((u) => u.table === "accounts")).toEqual([]);

    // Must emit exact positive field UPDATE with clear-before-set order
    const flags = mockUpdates.filter(
      (r) => r.table === "accounts" && typeof r.values.is_default === "boolean"
    );
    expect(
      flags.map((r) => ({ id: r.filters.id, value: r.values.is_default }))
    ).toEqual([
      { id: ordA.id, value: false },
      { id: ordB.id, value: true },
    ]);
    expect(syncFixtureControls.mockRemoteDefaultAccountId).toBe(ordB.id);
    expect(accountA._raw._status).toBe("synced");
    expect(accountB._raw._status).toBe("synced");
    expect(accountA.isDefault).toBe(false);
    expect(accountB.isDefault).toBe(true);

    // Zero financial mutations or action groups created
    const roots = await db
      .get<FinancialActionGroup>("financial_action_groups")
      .query()
      .fetch();
    expect(roots).toHaveLength(0);
    noPrivateNetworkBytes();
  });

  it("F2 clean historical local synced row admits cross-device remote is_default difference while dirty optimistic row throws conflict", async () => {
    const a = await commitAdd(
      ledger.database,
      "Historical Synced A",
      "0",
      true,
      "CASH"
    );
    await acceptThenAck(ledger.database, a);

    const db = await coldRestart();
    const accountA = await db.get<Account>("accounts").find(a.accountId);
    expect(accountA._raw._status).toBe("synced");
    expect(accountA.isDefault).toBe(true);

    // 1. Cross-device remote change makes accountA.is_default false on server
    const cloudEcho = await cloudAccount(db, a.accountId, {
      is_default: false,
    });
    // Normal SDK applies clean row remote changes without throwing account_sync_pull_default_conflict
    await realSynchronize(db, {
      pull: (): Promise<SyncPullResult> =>
        Promise.resolve({
          changes: {
            accounts: tableUpdated(cloudEcho),
          },
          timestamp: ++syncFixtureControls.mockNextWatermark,
        }),
    });

    const refreshed = await db.get<Account>("accounts").find(a.accountId);
    expect(refreshed.isDefault).toBe(false);
    expect(refreshed._raw._status).toBe("synced");

    // 2. But if local row is dirty (unacknowledged optimistic edit on is_default), pull conflict MUST be thrown
    await db.write(() =>
      refreshed.update((r) => {
        r.isDefault = true;
      })
    );
    expect(refreshed._raw._status).toBe("updated");

    const conflictingEcho = await cloudAccount(db, a.accountId, {
      is_default: false,
    });
    await expect(
      realSynchronize(db, {
        pull: (): Promise<SyncPullResult> =>
          Promise.resolve({
            changes: {
              accounts: tableUpdated(conflictingEcho),
            },
            timestamp: ++syncFixtureControls.mockNextWatermark,
          }),
      })
    ).rejects.toThrow("account_sync_pull_default_conflict");

    noPrivateNetworkBytes();
  });

  it("F3 corrupt terminal state with loser children/effect/root reconciled but prior default un-restored refuses ACK", async () => {
    const prior = await ledger.database.write(() =>
      ledger.database.get<Account>("accounts").create((row) => {
        row._raw.id = randomUUID();
        row.userId = OWNER;
        row.name = "Prior Default Account";
        row.type = "CASH";
        row.currency = "EGP";
        row.balance = 0;
        row.financialRevision = "0";
        row.isDefault = true;
        row.deleted = false;
      })
    );
    await realSynchronize(ledger.database);
    expect(prior._raw._status).toBe("synced");

    const command = await commitAdd(
      ledger.database,
      "Losing Corrupt Add",
      "0",
      true,
      "BANK"
    );
    expect(command.snapshot.defaultAccount?.accountId).toBe(prior.id);
    await markRejected(ledger.database, command);

    const losingAccount = await ledger.database
      .get<Account>("accounts")
      .find(command.accountId);
    const bank = command.bankDetailId
      ? await ledger.database
          .get<BankDetails>("bank_details")
          .find(command.bankDetailId)
      : null;
    const senders = await Promise.all(
      command.senders.map((s) =>
        ledger.database.get<AccountSmsSender>("account_sms_senders").find(s.id)
      )
    );
    const root = await ownedRoot(ledger.database, command.envelope.actionId);

    // Corrupt compensation: loser account/children deleted, root reconciled, but prior default is NOT restored
    await ledger.database.write(() =>
      ledger.database.batch(
        losingAccount.prepareUpdate((r) => {
          r.deleted = true;
        }),
        ...(bank
          ? [
              bank.prepareUpdate((r) => {
                r.deleted = true;
              }),
            ]
          : []),
        ...senders.map((s) =>
          s.prepareUpdate((r) => {
            r.deleted = true;
          })
        ),
        root.prepareUpdate((r) => {
          r.state = "reconciled";
          r.serverOutcome = "rejected";
          // Match the real foundation's stored lowercase code; only the
          // missing positive compensation witness is corrupt in F3.
          r.rejectionCode = "domain_unique_conflict";
        })
      )
    );

    const priorCurrent = await ledger.database
      .get<Account>("accounts")
      .find(prior.id);
    expect(priorCurrent.isDefault).toBe(false);
    expect(
      typeof priorCurrent._raw._changed === "string" &&
        priorCurrent._raw._changed.includes("is_default")
    ).toBe(true);

    const db = await coldRestart();
    const rootBefore = await ownedRoot(db, command.envelope.actionId);
    const privateBefore = rootBefore.localRecoverySnapshotJson;
    expect(privateBefore).toEqual(expect.any(String));
    const physicalRootBefore = JSON.stringify(rootBefore._raw);
    const physicalBefore = await physicalSaveLedgerSnapshot(db);
    const checkpointBefore = await db.adapter.getLocal(
      "__watermelon_last_pulled_at"
    );
    expect(checkpointBefore).not.toBeNull();
    mockUpserts.length = 0;
    mockUpdates.length = 0;
    mockFinancialTransport.length = 0;

    // A fraudulent terminal label must fail the actual protected writer,
    // not merely hold its ACK while the rest of synchronize() succeeds.
    await expect(realSynchronize(db)).rejects.toThrow(
      "account_sync_protection_invalid_root"
    );

    // Root/private evidence, the entire physical ledger and SDK checkpoint
    // remain unchanged; no metadata UPDATE, generic UPSERT or action RPC.
    const checkRoot = await ownedRoot(db, command.envelope.actionId);
    expect(checkRoot._raw._status).not.toBe("synced");
    expect(checkRoot.localRecoverySnapshotJson).toBe(privateBefore);
    expect(JSON.stringify(checkRoot._raw)).toBe(physicalRootBefore);
    expect(await physicalSaveLedgerSnapshot(db)).toEqual(physicalBefore);
    expect(await db.adapter.getLocal("__watermelon_last_pulled_at")).toBe(
      checkpointBefore
    );
    const priorAfter = await db.get<Account>("accounts").find(prior.id);
    expect(priorAfter.isDefault).toBe(false);
    expect(priorAfter._raw._changed.split(",")).toContain("is_default");
    expect(mockUpserts).toEqual([]);
    expect(mockUpdates).toEqual([]);
    expect(mockFinancialTransport).toEqual([]);
    noPrivateNetworkBytes();
  });
});
