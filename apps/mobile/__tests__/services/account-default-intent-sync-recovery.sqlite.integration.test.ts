/** #395 real Watermelon SQLite Add recovery; original cases retained. */
import {
  Q,
  parseAccountCreateDefaultLocalRecoverySnapshotJson,
  createFinancialActionPushCoordinator,
  productionFinancialActionReconciliationService,
  collectAccountFinancialActionPushBundles,
  collectProtectedFinancialActionRowIds,
  isProtectedFinancialActionRow,
  physicalSaveLedgerSnapshot,
  ADD_DEFAULT_IDS,
  moduleDb,
  ledger,
  OWNER,
  setMockActiveAddOwner,
  addService,
  foundation,
  prepareAndCommit,
  root,
  effects,
  coldRestart,
  physicalDirtyChanges,
  activeOwnedAccountPostimages,
  accepted,
  actionSync,
  markRejected,
  seedPriorA,
  rootCacheBytes,
  expectRecoveryRefusedWithoutWrites,
  type Model,
  type Account,
  type AccountSmsSender,
  type BankDetails,
} from "./account-default-intent-sync-recovery-sqlite-fixture";

describe("#395 T069 — real Add financial writer → protected dirty group", () => {
  it("A01 first zero-opening Add has one genuine account/root, no fake effect, and a dispatchable protected bundle", async () => {
    const command = await prepareAndCommit("First Cash", "0", false, "CASH");
    const db = await coldRestart();
    const actualRoot = await root(command.envelope.actionId, db);
    expect(actualRoot.kind).toBe("create_with_default");
    expect(actualRoot.payloadJson).toContain('"account.create-default/v1"');
    expect(command.envelope.accountGuards).toEqual([]);
    expect(await effects(command.envelope.actionId, db)).toHaveLength(0);
    const account = await db.get<Account>("accounts").find(command.accountId);
    expect(account).toMatchObject({
      isDefault: true,
      financialRevision: "0",
      balance: 0,
    });
    const changes = await physicalDirtyChanges(db);
    const bundles = collectAccountFinancialActionPushBundles(changes);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.candidate).toEqual({
      actionId: command.envelope.actionId,
      payloadHash: actualRoot.payloadHash,
      payloadJson: actualRoot.payloadJson,
      state: "local_complete",
    });
    expect(bundles[0]?.rowIds).toEqual({
      accounts: [command.accountId],
      financial_action_groups: [actualRoot.id],
    });
  });

  it("A02 zero-opening Bank and its actual bank/sender children never escape generic LWW", async () => {
    const command = await prepareAndCommit("First Bank", "0", true);
    const db = await coldRestart();
    const changes = await physicalDirtyChanges(db);
    const excluded = collectProtectedFinancialActionRowIds(changes);
    expect(
      isProtectedFinancialActionRow(excluded, "accounts", command.accountId)
    ).toBe(true);
    expect(
      isProtectedFinancialActionRow(
        excluded,
        "bank_details",
        command.bankDetailId
      )
    ).toBe(true);
    for (const sender of command.senders) {
      expect(
        isProtectedFinancialActionRow(
          excluded,
          "account_sms_senders",
          sender.id
        )
      ).toBe(true);
    }
    expect(await effects(command.envelope.actionId, db)).toHaveLength(0);
    const bundles = collectAccountFinancialActionPushBundles(changes);
    expect(bundles[0]?.rowIds).toEqual(
      expect.objectContaining({
        bank_details: [command.bankDetailId],
        account_sms_senders: command.senders.map((item) => item.id),
      })
    );
    expect(bundles[0]?.rowIds.account_financial_effects).toBeUndefined();
  });

  it("A03 nonzero Add protects exactly one real financial effect and root without generic inverse", async () => {
    const command = await prepareAndCommit("Opening 10.01", "10.01", true);
    const db = await coldRestart();
    const posted = await effects(command.envelope.actionId, db);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      accountId: command.accountId,
      amountMinorUnits: "1001",
      acceptedAccountRevision: "1",
      isEffective: true,
    });
    const changes = await physicalDirtyChanges(db);
    const blocked = collectProtectedFinancialActionRowIds(changes);
    expect(
      isProtectedFinancialActionRow(blocked, "accounts", command.accountId)
    ).toBe(true);
    // Immutable effects are handled by the DEDICATED action bundle, not
    // protected-domain-row exclusion; this is the existing Review contract.
    const bundles = collectAccountFinancialActionPushBundles(changes);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.candidate.actionId).toBe(command.envelope.actionId);
    expect(bundles[0]?.rowIds.account_financial_effects).toEqual([
      command.effectId,
    ]);
    expect(bundles[0]?.rowIds.accounts).toEqual([command.accountId]);
  });

  it("A04 genuine Add action transmits its immutable bytes exactly once; never a generic account upsert", async () => {
    const command = await prepareAndCommit(
      "Single Account",
      "0",
      false,
      "CASH"
    );
    const dirty = await physicalDirtyChanges();
    const actualRoot = await root(command.envelope.actionId);
    const dispatched: Array<{ payloadHash: string; payloadJson: string }> = [];
    const coordinator = createFinancialActionPushCoordinator({
      ...foundation(),
      getFinancialActionGroup: foundation().getFinancialActionGroup,
      invokeAccountFinancialActionRpc: (input) => {
        dispatched.push({ ...input });
        return Promise.resolve(accepted(command));
      },
    });
    const bundles = collectAccountFinancialActionPushBundles(dirty);
    const first = await coordinator.coordinatePush(
      bundles.map((bundle) => bundle.candidate)
    );
    expect(dispatched).toEqual([
      {
        payloadHash: actualRoot.payloadHash,
        payloadJson: actualRoot.payloadJson,
      },
    ]);
    expect(first.decisions).toHaveLength(1);
    expect(first.decisions[0]?.disposition).toBe("acknowledge");
    const acknowledged = {
      ...bundles[0]?.candidate,
      state: "accepted",
    };
    if (
      !acknowledged.actionId ||
      !acknowledged.payloadHash ||
      !acknowledged.payloadJson
    )
      throw new Error("missing_genuine_add_candidate");
    const repeat = await coordinator.coordinatePush([acknowledged]);
    expect(repeat.decisions[0]?.disposition).toBe("acknowledge");
    expect(dispatched).toHaveLength(1);
    expect(await effects(command.envelope.actionId)).toHaveLength(0);
  });
});

describe("#395 T069 — immutable Add transport, root and replay", () => {
  it("A05 transport retry resends byte-identical action after an actual sync_failed root", async () => {
    const command = await prepareAndCommit("Offline Add", "0", false, "CASH");
    const original = await root(command.envelope.actionId);
    const attempted: Array<{ payloadHash: string; payloadJson: string }> = [];
    let failTransport = true;
    const sync = actionSync((input) => {
      attempted.push({ ...input });
      if (failTransport) return Promise.reject(new Error("offline_transport"));
      return Promise.resolve(accepted(command));
    });
    await expect(sync.syncAction(command.envelope.actionId)).rejects.toThrow(
      "offline_transport"
    );
    expect((await root(command.envelope.actionId)).state).toBe("sync_failed");
    failTransport = false;
    await sync.syncAction(command.envelope.actionId);
    expect(attempted).toEqual([
      { payloadHash: original.payloadHash, payloadJson: original.payloadJson },
      { payloadHash: original.payloadHash, payloadJson: original.payloadJson },
    ]);
    expect((await root(command.envelope.actionId)).state).toBe("accepted");
  });

  it("A06 successful accepted Add and local replay never duplicate the account, root or opening effect", async () => {
    const command = await prepareAndCommit("Accepted Add", "10.01", true);
    const sync = actionSync(() => Promise.resolve(accepted(command)));
    await sync.syncAction(command.envelope.actionId);
    const before = await physicalSaveLedgerSnapshot(await coldRestart());
    const rootRow = await root(command.envelope.actionId);
    expect(rootRow.serverOutcome).toBe("accepted");
    expect(rootRow.outcomeJson).toContain('"status":"accepted"');
    expect(
      (await addService(moduleDb.database).commitPrepared(command)).kind
    ).toBe("replay");
    expect(await physicalSaveLedgerSnapshot(moduleDb.database)).toEqual(before);
    expect(await effects(command.envelope.actionId)).toHaveLength(1);
  });

  it("A07 idempotent remote response stores replay outcome without rebuilding a local effect", async () => {
    const command = await prepareAndCommit("Remote Replay", "0", false, "CASH");
    const sync = actionSync(() =>
      Promise.resolve({
        ...accepted(command),
        status: "idempotent",
      })
    );
    await sync.syncAction(command.envelope.actionId);
    const actual = await root(command.envelope.actionId);
    expect(actual.serverOutcome).toBe("idempotent");
    expect(actual.outcomeJson).toContain('"status":"idempotent"');
    expect(await effects(command.envelope.actionId)).toHaveLength(0);
    expect((await addService().commitPrepared(command)).kind).toBe("replay");
  });
});

describe("#395 T069 — rejected/stale Add must restore complete physical state", () => {
  it.each(["0", "10.01"])(
    "A08 stale opening %s restores created account/children/default/effect after cold SQLite restart",
    async (opening): Promise<void> => {
      const db = ledger.database;
      await db.write(async (): Promise<void> => {
        const previous = db.get<Account>("accounts").prepareCreate((row) => {
          row._raw.id = ADD_DEFAULT_IDS.previous;
          row.userId = OWNER;
          row.name = "Prior default";
          row.type = "CASH";
          row.currency = "EGP";
          row.balance = 90;
          row.financialRevision = "0";
          row.isDefault = true;
          row.deleted = false;
        });
        await db.batch(previous);
      });
      // Canonical server still has the ORIGINAL name. Only the device has
      // renamed prior A (dirty ordinary metadata); the new B using that
      // original name passes local identity checks but conflicts server-side
      // with the old A name (23505 / DOMAIN_UNIQUE_CONFLICT).
      const priorA = await db
        .get<Account>("accounts")
        .find(ADD_DEFAULT_IDS.previous);
      await db.write(async (): Promise<void> => {
        await priorA.update((record) => {
          record.name = "Locally renamed prior A";
        });
      });
      const before = await physicalSaveLedgerSnapshot(db);
      const command = await prepareAndCommit("Prior default", opening, true);
      expect(command.snapshot).toEqual({
        activeAccountIds: [ADD_DEFAULT_IDS.previous],
        defaultAccount: {
          accountId: ADD_DEFAULT_IDS.previous,
          isDefault: true,
        },
      });
      const active = await db.get<Account>("accounts").find(command.accountId);
      expect(active.isDefault).toBe(true);
      expect(
        (await db.get<Account>("accounts").find(ADD_DEFAULT_IDS.previous))
          .isDefault
      ).toBe(false);
      const optimistic = await root(command.envelope.actionId);
      if (!optimistic.localRecoverySnapshotJson)
        throw new Error("missing_actual_add_private_capture");
      const captured = parseAccountCreateDefaultLocalRecoverySnapshotJson({
        json: optimistic.localRecoverySnapshotJson,
        expectedRoot: {
          actionId: optimistic.actionId,
          ownerId: OWNER,
          domainReferenceId: command.accountId,
          payloadHash: optimistic.payloadHash,
          expectedDefaultSnapshot: command.snapshot,
        },
      });
      expect(captured.createdAccount.accountId).toBe(command.accountId);
      expect(captured.priorDefault?.accountId).toBe(ADD_DEFAULT_IDS.previous);
      expect(captured.createdChildren.length).toBeGreaterThan(0);
      expect(captured.openingEffect === null).toBe(opening === "0");
      await markRejected(command, "rejected");
      const fresh = await coldRestart();
      const queued = await root(command.envelope.actionId, fresh);
      expect(["rejected_compensating", "reconciliation_incomplete"]).toContain(
        queued.state
      );
      expect(queued.outcomeJson).toContain('"canonicalDefaultSnapshot"');
      expect(queued.outcomeJson).toContain('"canonicalAbsentAccountIds"');
      if (!queued.outcomeJson) throw new Error("missing_23505_receipt");
      const sql23505: unknown = JSON.parse(queued.outcomeJson);
      if (
        typeof sql23505 !== "object" ||
        sql23505 === null ||
        Array.isArray(sql23505)
      )
        throw new Error("invalid_23505_receipt");
      expect(Object.keys(sql23505).sort()).toEqual(
        [
          "actionId",
          "canonicalAbsentAccountIds",
          "canonicalAccounts",
          "canonicalDefaultSnapshot",
          "code",
          "status",
        ].sort()
      );
      await expect(
        productionFinancialActionReconciliationService.reconcileRejectedAction(
          command.envelope.actionId
        )
      ).resolves.toBe("reconciled");
      const post = await physicalSaveLedgerSnapshot(fresh);
      // Strict logical restoration, not physical hard-delete: losing tombstones
      // and ineffective effects may remain as durable compensation evidence.
      expect(activeOwnedAccountPostimages(post, OWNER)).toEqual(
        activeOwnedAccountPostimages(before, OWNER)
      );
      const previous = await fresh
        .get<Account>("accounts")
        .find(ADD_DEFAULT_IDS.previous);
      expect(previous).toMatchObject({
        isDefault: true,
        balance: 90,
        financialRevision: "0",
        name: "Locally renamed prior A",
      });
      // Returning the old default must not turn a user metadata rename
      // into an invisible complete sync or discard its dirty attribution.
      expect(previous._raw._changed.split(",")).toContain("name");
      const lost = await fresh
        .get<Account>("accounts")
        .query(Q.where("id", command.accountId), Q.where("deleted", false))
        .fetch();
      expect(lost).toHaveLength(0);
      const activeBank = await fresh
        .get<BankDetails>("bank_details")
        .query(
          Q.where("account_id", command.accountId),
          Q.where("deleted", false)
        )
        .fetch();
      const activeSenders = await fresh
        .get<AccountSmsSender>("account_sms_senders")
        .query(
          Q.where("account_id", command.accountId),
          Q.where("deleted", false)
        )
        .fetch();
      expect(activeBank).toHaveLength(0);
      expect(activeSenders).toHaveLength(0);
      expect(
        (await effects(command.envelope.actionId, fresh)).filter(
          (effect) => effect.isEffective
        )
      ).toHaveLength(0);
      const terminal = await root(command.envelope.actionId, fresh);
      expect(terminal.state).toBe("reconciled");
      expect(terminal.localRecoverySnapshotJson).toEqual(expect.any(String));
      // Add private evidence is retained after reconciliation until the
      // protected sync/ACK and dependent-root lifecycle explicitly clear it.
      const finalLedger = await physicalSaveLedgerSnapshot(fresh);
      await expect(
        productionFinancialActionReconciliationService.reconcileRejectedAction(
          command.envelope.actionId
        )
      ).resolves.toBe("replay");
      expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(finalLedger);
    }
  );

  it("A09 rejected Add cannot silently complete when a newer default choice displaced its preimage", async () => {
    const command = await prepareAndCommit("Default X", "0", true);
    await markRejected(command, "rejected");
    const fresh = await coldRestart();
    await fresh.write(async (): Promise<void> => {
      const candidate = await fresh
        .get<Account>("accounts")
        .find(command.accountId);
      await candidate.update((row) => {
        row.isDefault = false;
      });
    });
    const before = await physicalSaveLedgerSnapshot(fresh);
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        command.envelope.actionId
      )
    ).rejects.toThrow();
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(before);
    expect(["rejected_compensating", "reconciliation_incomplete"]).toContain(
      (await root(command.envelope.actionId, fresh)).state
    );
  });

  it("A10 newer child metadata cannot be destroyed by rejected Add recovery", async () => {
    const command = await prepareAndCommit("Editable Bank", "0", true);
    await markRejected(command);
    const fresh = await coldRestart();
    const childId = command.bankDetailId;
    if (!childId) throw new Error("expected_real_bank_child");
    await fresh.write(async (): Promise<void> => {
      const child = await fresh.get<BankDetails>("bank_details").find(childId);
      await child.update((row) => {
        row.accountNumber = "newer-user-value";
      });
    });
    const before = await physicalSaveLedgerSnapshot(fresh);
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        command.envelope.actionId
      )
    ).rejects.toThrow();
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(before);
    expect(
      (await fresh.get<BankDetails>("bank_details").find(childId)).accountNumber
    ).toBe("newer-user-value");
  });

  it("A11 foreign authenticated actor cannot restore the previous owner's Add action", async () => {
    const command = await prepareAndCommit("Owner Isolated", "0", true);
    await markRejected(command);
    const fresh = await coldRestart();
    const before = await physicalSaveLedgerSnapshot(fresh);
    setMockActiveAddOwner(ADD_DEFAULT_IDS.foreignOwner);
    try {
      await expect(
        productionFinancialActionReconciliationService.reconcileRejectedAction(
          command.envelope.actionId
        )
      ).rejects.toThrow();
    } finally {
      setMockActiveAddOwner(OWNER);
    }
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(before);
    expect((await root(command.envelope.actionId, fresh)).state).toBe(
      "rejected_compensating"
    );
  });

  it("A12 a rejected Add WITHOUT a bound default receipt stays recoverable, not inverse-compensated or acknowledged", async () => {
    const command = await prepareAndCommit("Rejected Bank", "10.01", true);
    await markRejected(command, "rejected", { omitDefaultGraph: true });
    const pending = await root(command.envelope.actionId);
    const unchangedLedger = await physicalSaveLedgerSnapshot(moduleDb.database);
    const privateBytes = pending.localRecoverySnapshotJson;
    const attempted: string[] = [];
    const coordinator = createFinancialActionPushCoordinator({
      ...foundation(),
      reconcileFinancialActionGroup: (id) =>
        productionFinancialActionReconciliationService.reconcileRejectedAction(
          id
        ),
      invokeAccountFinancialActionRpc: ({ payloadJson }) => {
        attempted.push(payloadJson);
        return Promise.resolve(accepted(command));
      },
    });
    const result = await coordinator.coordinatePush([
      {
        actionId: pending.actionId,
        payloadHash: pending.payloadHash,
        payloadJson: pending.payloadJson,
        state: pending.state,
      },
    ]);
    expect(result.decisions).toEqual([
      {
        actionId: pending.actionId,
        disposition: "recover",
        outcome: null,
      },
    ]);
    expect(attempted).toEqual([]);
    expect(["rejected_compensating", "reconciliation_incomplete"]).toContain(
      (await root(command.envelope.actionId)).state
    );
    expect(
      (await root(command.envelope.actionId)).localRecoverySnapshotJson
    ).toBe(privateBytes);
    expect(await physicalSaveLedgerSnapshot(moduleDb.database)).toEqual(
      unchangedLedger
    );
    expect(
      (await effects(command.envelope.actionId)).every(
        (effect) => effect.isEffective
      )
    ).toBe(true);
  });
});

describe("#395 T069 — Add recovery authoritative refusal / atomicity", () => {
  it("A16 canonical graph newer on server (real B absent) cannot restore device's prior default from stale local choice", async () => {
    await seedPriorA();
    const command = await prepareAndCommit("Conflicting B", "0", true);
    const authoritativeOtherId = ADD_DEFAULT_IDS.other;
    expect(authoritativeOtherId).not.toBe(command.accountId);
    await markRejected(command, "rejected", {
      canonicalDefaultSnapshot: {
        activeAccountIds: [
          ADD_DEFAULT_IDS.previous,
          authoritativeOtherId,
        ].sort(),
        defaultAccount: {
          accountId: ADD_DEFAULT_IDS.previous,
          isDefault: true,
        },
      },
      absentAccountIds: [command.accountId],
    });
    const fresh = await coldRestart();
    await expectRecoveryRefusedWithoutWrites(command, fresh);
    expect(
      (await fresh.get<Account>("accounts").find(command.accountId)).deleted
    ).toBe(false);
  });

  it.each(["missing", "null", "absent"])(
    "A17 unbound or incomplete %s receipt cannot gain recovery authority",
    async (defect): Promise<void> => {
      const command = await prepareAndCommit(
        "Unproven Add",
        "0",
        false,
        "CASH"
      );
      await markRejected(command, "rejected", {
        ...(defect === "missing" ? { omitDefaultGraph: true } : {}),
        ...(defect === "null" ? { canonicalDefaultSnapshot: null } : {}),
        ...(defect === "absent" ? { absentAccountIds: [] } : {}),
      });
      const fresh = await coldRestart();
      await expectRecoveryRefusedWithoutWrites(command, fresh);
      expect(await effects(command.envelope.actionId, fresh)).toHaveLength(0);
    }
  );

  it("A18 a later pending Add successor blocks destructive recovery of its unresolved default predecessor", async () => {
    const a = await prepareAndCommit("A first", "0", false, "CASH");
    const b = await prepareAndCommit("B successor", "0", true);
    expect(b.dependencyActionIds).toContain(a.envelope.actionId);
    await markRejected(a, "rejected", {
      canonicalDefaultSnapshot: { activeAccountIds: [], defaultAccount: null },
      absentAccountIds: [a.accountId],
    });
    const fresh = await coldRestart();
    await expectRecoveryRefusedWithoutWrites(a, fresh);
    expect((await root(b.envelope.actionId, fresh)).state).toBe(
      "local_complete"
    );
    expect(
      (await fresh.get<Account>("accounts").find(b.accountId)).deleted
    ).toBe(false);
  });

  it("A19 a physically modified immutable Add root payload hash cannot authorize owned recovery", async () => {
    const command = await prepareAndCommit("Bound original", "0", true);
    await markRejected(command, "stale");
    const fresh = await coldRestart();
    const owned = await root(command.envelope.actionId, fresh);
    await fresh.write(() =>
      fresh.batch(
        owned.prepareUpdate((candidate) => {
          candidate.payloadHash = "f".repeat(64);
        })
      )
    );
    await expectRecoveryRefusedWithoutWrites(command, fresh);
    expect((await root(command.envelope.actionId, fresh)).payloadHash).toBe(
      "f".repeat(64)
    );
  });

  it("A20 a failed native SQLite compensation batch restores cache, private root and all physical financial members, then retry is once-only", async () => {
    await seedPriorA();
    const command = await prepareAndCommit("Rollback B", "10.01", true);
    await markRejected(command, "rejected");
    const fresh = await coldRestart();
    const candidate = await root(command.envelope.actionId, fresh);
    const prior = await fresh
      .get<Account>("accounts")
      .find(ADD_DEFAULT_IDS.previous);
    const losing = await fresh.get<Account>("accounts").find(command.accountId);
    const effectRows = await effects(command.envelope.actionId, fresh);
    const bank = command.bankDetailId
      ? [
          await fresh
            .get<BankDetails>("bank_details")
            .find(command.bankDetailId),
        ]
      : [];
    const senders = await fresh
      .get<AccountSmsSender>("account_sms_senders")
      .query(Q.where("account_id", command.accountId))
      .fetch();
    const cached: Model[] = [
      candidate,
      prior,
      losing,
      ...effectRows,
      ...bank,
      ...senders,
    ];
    const preCache = rootCacheBytes(cached);
    const preSQLite = await physicalSaveLedgerSnapshot(fresh);
    const originalPrivate = candidate.localRecoverySnapshotJson;
    let attemptedAdapterBatch = 0;
    const adapterFault = jest
      .spyOn(fresh.adapter, "batch")
      .mockImplementation((_operations): Promise<void> => {
        attemptedAdapterBatch += 1;
        // Promise-returning adapter.batch must reject before actual native
        // persistence; the separate retry uses the real restored adapter.
        return Promise.reject(new Error("t069_recovery_precommit_rollback"));
      });
    try {
      await expect(
        productionFinancialActionReconciliationService.reconcileRejectedAction(
          command.envelope.actionId
        )
      ).rejects.toThrow();
    } finally {
      adapterFault.mockRestore();
    }
    // With the missing dedicated writer the adapter is never reached:
    // this assertion must be meaningful behavioural RED, not fake success.
    expect(attemptedAdapterBatch).toBeGreaterThan(0);
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(preSQLite);
    expect(rootCacheBytes(cached)).toEqual(preCache);
    expect(
      (await root(command.envelope.actionId, fresh)).localRecoverySnapshotJson
    ).toBe(originalPrivate);
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        command.envelope.actionId
      )
    ).resolves.toBe("reconciled");
    const terminal = await physicalSaveLedgerSnapshot(fresh);
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        command.envelope.actionId
      )
    ).resolves.toBe("replay");
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(terminal);
  });
});

/** A dependent is a genuine Watermelon row, not mocked/forged root evidence. */
