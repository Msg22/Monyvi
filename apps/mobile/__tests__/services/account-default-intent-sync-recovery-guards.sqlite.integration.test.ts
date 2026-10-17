/** #395 real Watermelon SQLite Add recovery; original cases retained. */
import {
  randomUUID,
  Q,
  canonicalizeFinancialActionEnvelope,
  legacyEditBalanceEnvelope,
  createAccountReviewFinancialRegistry,
  parseCanonicalAccountsFromOutcomeJson,
  physicalText,
  productionFinancialActionReconciliationService,
  physicalSaveLedgerSnapshot,
  ADD_DEFAULT_IDS,
  moduleDb,
  OWNER,
  hashProvider,
  setMockActiveAddOwner,
  serializeCanonicalFixture,
  foundation,
  prepareAndCommit,
  root,
  coldRestart,
  accepted,
  actionSync,
  markRejected,
  seedPriorA,
  expectRecoveryRefusedWithoutWrites,
  insertActualDependent,
  canonicalServerAccount,
  replaceDurableAddDependencies,
  type Model,
  type AccountDefaultSnapshot,
  type Account,
} from "./account-default-intent-sync-recovery-sqlite-fixture";

describe("#395 T069 independent R1/R2/R4 SQL receipt, dependent and ancestor Reds", () => {
  it.each(["0", "10.01"])(
    "R1 genuine SQL091 stale receipt shape for opening %s is parsed but changed canonical graph refuses compensation",
    async (opening): Promise<void> => {
      await seedPriorA();
      const command = await prepareAndCommit("Stale B", opening, true);
      const differentServerGraph: AccountDefaultSnapshot = {
        activeAccountIds: [
          ADD_DEFAULT_IDS.previous,
          ADD_DEFAULT_IDS.other,
        ].sort(),
        defaultAccount: {
          accountId: ADD_DEFAULT_IDS.previous,
          isDefault: true,
        },
      };
      const serverCanonicalAccounts = await Promise.all([
        canonicalServerAccount(ADD_DEFAULT_IDS.previous, "9000"),
        canonicalServerAccount(ADD_DEFAULT_IDS.other, "0"),
      ]);
      expect(serverCanonicalAccounts.map((a) => a.accountId)).toEqual(
        differentServerGraph.activeAccountIds
      );
      await markRejected(command, "stale", {
        canonicalDefaultSnapshot: differentServerGraph,
        canonicalAccounts: serverCanonicalAccounts,
      });
      const fresh = await coldRestart();
      const persisted = await root(command.envelope.actionId, fresh);
      if (!persisted.outcomeJson)
        throw new Error("missing_real_stale_outcome_json");
      const actual: unknown = JSON.parse(persisted.outcomeJson);
      if (
        typeof actual !== "object" ||
        actual === null ||
        Array.isArray(actual)
      )
        throw new Error("invalid_stale_outcome_object");
      expect(Object.keys(actual).sort()).toEqual(
        [
          "actionId",
          "canonicalAbsentAccountIds",
          "canonicalAccounts",
          "canonicalDefaultSnapshot",
          "canonicalHoldingActionId",
          "canonicalHoldingEvidenceHash",
          "canonicalHoldingRevision",
          "code",
          "staleAccountIds",
          "status",
        ].sort()
      );
      expect(persisted.rejectionCode).toBe("account_revision_stale");
      expect(
        parseCanonicalAccountsFromOutcomeJson(persisted.outcomeJson)
      ).toEqual(serverCanonicalAccounts);
      await expectRecoveryRefusedWithoutWrites(command, fresh);
    }
  );

  it("R1 refuses an arbitrary extra key even on otherwise complete genuine 23505 business rejection", async () => {
    await seedPriorA();
    const command = await prepareAndCommit("Conflicting B", "0", true);
    await markRejected(command, "rejected", { extraReceiptKey: "not-SQL091" });
    const fresh = await coldRestart();
    await expectRecoveryRefusedWithoutWrites(command, fresh);
  });

  it.each(["recurring_payments", "debts"] as const)(
    "R2 preserves an independently committed newer %s referencing losing B, then permits compensation once physically removed",
    async (kind): Promise<void> => {
      await seedPriorA();
      const command = await prepareAndCommit("Blocked B", "10.01", true);
      await markRejected(command, "rejected");
      const fresh = await coldRestart();
      const dependent = await insertActualDependent(
        fresh,
        command.accountId,
        kind
      );
      expect(physicalText(dependent._raw, "account_id")).toBe(
        command.accountId
      );
      const before = await physicalSaveLedgerSnapshot(fresh);
      await expectRecoveryRefusedWithoutWrites(command, fresh);
      expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(before);
      // Test cleanup removes ONLY the independently inserted physical row,
      // not the losing account or its financial effect. No production cascade.
      await fresh.write(() =>
        fresh.batch(dependent.prepareDestroyPermanently())
      );
      await expect(
        fresh.get<Model>(kind).query(Q.where("id", dependent.id)).fetch()
      ).resolves.toHaveLength(0);
      await expect(
        productionFinancialActionReconciliationService.reconcileRejectedAction(
          command.envelope.actionId
        )
      ).resolves.toBe("reconciled");
      expect(
        (await fresh.get<Account>("accounts").find(command.accountId)).deleted
      ).toBe(true);
    }
  );

  it.each(["outcome", "rejection-code", "account-guards"] as const)(
    "R4 a canonically accepted but corrupted A predecessor %s cannot authorize B compensation",
    async (corruption): Promise<void> => {
      const a = await prepareAndCommit("Prior A", "10.01", false, "CASH");
      const b = await prepareAndCommit("Dependent B", "0", true, "CASH");
      expect(b.dependencyActionIds).toEqual([a.envelope.actionId]);
      const repo = foundation();
      await repo.markFinancialActionGroupSyncPending(a.envelope.actionId);
      await repo.recordFinancialActionGroupServerOutcome(
        a.envelope.actionId,
        "accepted",
        serializeCanonicalFixture(accepted(a)),
        null
      );
      await markRejected(b, "rejected");
      const fresh = await coldRestart();
      const ancestor = await root(a.envelope.actionId, fresh);
      const original = {
        outcomeJson: ancestor.outcomeJson,
        rejectionCode: ancestor.rejectionCode,
        accountGuardsJson: ancestor.accountGuardsJson,
      };
      expect(ancestor.serverOutcome).toBe("accepted");
      if (!original.outcomeJson)
        throw new Error("missing_real_accepted_receipt");
      await fresh.write(() =>
        fresh.batch(
          ancestor.prepareUpdate((row) => {
            if (corruption === "outcome") {
              row.outcomeJson = serializeCanonicalFixture({
                ...accepted(a),
                actionId: ADD_DEFAULT_IDS.other,
              });
            } else if (corruption === "rejection-code") {
              row.rejectionCode = "fabricated_rejection_code";
            } else {
              row.accountGuardsJson = "[]";
            }
          })
        )
      );
      await expectRecoveryRefusedWithoutWrites(b, fresh);
      await fresh.write(() =>
        fresh.batch(
          ancestor.prepareUpdate((row) => {
            row.outcomeJson = original.outcomeJson;
            row.rejectionCode = original.rejectionCode;
            row.accountGuardsJson = original.accountGuardsJson;
          })
        )
      );
      await expect(
        productionFinancialActionReconciliationService.reconcileRejectedAction(
          b.envelope.actionId
        )
      ).resolves.toBe("reconciled");
      expect(
        (await fresh.get<Account>("accounts").find(b.accountId)).deleted
      ).toBe(true);
    }
  );
});

describe("#395 T069 — durable created-default predecessor sequencing", () => {
  it("A13 Add B cannot push before locally optimistic Add A accepts; exact A→B bytes remain immutable", async () => {
    const first = await prepareAndCommit("First A", "0", false, "CASH");
    const second = await prepareAndCommit("Later B", "0", true);
    expect(second.snapshot.activeAccountIds).toEqual([first.accountId]);
    expect(second.dependencyActionIds).toEqual([first.envelope.actionId]);
    const firstRoot = await root(first.envelope.actionId);
    const secondRoot = await root(second.envelope.actionId);
    const calls: Array<{ payloadHash: string; payloadJson: string }> = [];
    const sync = actionSync((input) => {
      calls.push({ ...input });
      return Promise.resolve(
        input.payloadJson === firstRoot.payloadJson
          ? accepted(first)
          : accepted(second)
      );
    });
    await expect(sync.syncAction(second.envelope.actionId)).rejects.toThrow(
      "account_review_default_predecessor_blocked"
    );
    expect(calls).toEqual([]);
    await sync.syncAction(first.envelope.actionId);
    await sync.syncAction(second.envelope.actionId);
    expect(calls).toEqual([
      {
        payloadHash: firstRoot.payloadHash,
        payloadJson: firstRoot.payloadJson,
      },
      {
        payloadHash: secondRoot.payloadHash,
        payloadJson: secondRoot.payloadJson,
      },
    ]);
    expect((await root(second.envelope.actionId)).state).toBe("accepted");
  });

  it("A14 rejected Add A blocks dependent Add B after cold restart without resampling its default", async () => {
    const first = await prepareAndCommit("First A", "0", false, "CASH");
    const second = await prepareAndCommit("Later B", "0", true);
    const unchanged = await root(second.envelope.actionId);
    await markRejected(first);
    const fresh = await coldRestart();
    const requests: string[] = [];
    const sync = actionSync((input) => {
      requests.push(input.payloadHash);
      return Promise.resolve(accepted(second));
    }, fresh);
    await expect(sync.syncAction(second.envelope.actionId)).rejects.toThrow(
      "account_review_default_predecessor_blocked"
    );
    expect(requests).toEqual([]);
    const retained = await root(second.envelope.actionId, fresh);
    expect(retained.state).toBe("local_complete");
    expect(retained.payloadJson).toBe(unchanged.payloadJson);
    expect(retained.payloadHash).toBe(unchanged.payloadHash);
    expect(second.snapshot.defaultAccount?.accountId).toBe(first.accountId);
  });

  it("A15 predecessor check reasserts current authenticated owner before dispatch", async () => {
    const first = await prepareAndCommit("First A", "0", false, "CASH");
    const second = await prepareAndCommit("Later B", "0", true);
    const calls: string[] = [];
    setMockActiveAddOwner(ADD_DEFAULT_IDS.foreignOwner);
    try {
      await expect(
        actionSync((input) => {
          calls.push(input.payloadHash);
          return Promise.reject(new Error("forbidden_foreign_send"));
        }).syncAction(second.envelope.actionId)
      ).rejects.toThrow();
    } finally {
      setMockActiveAddOwner(OWNER);
    }
    expect(calls).toEqual([]);
    const retained = await root(second.envelope.actionId);
    expect(retained.state).toBe("local_complete");
    expect(retained.userId).toBe(first.ownerId);
  });
});

/**
 * SQL091 registered Add can only enter its stale branch when the owner
 * active/default graph differs from the immutable expected snapshot.
 * A forged equal-graph ten-field receipt is not a compensable server event.
 */
describe("#395 T069 SQL091 registered stale admission", () => {
  it("refuses a forged matching-default-graph stale receipt even when its canonical financial account hashes are valid", async (): Promise<void> => {
    await seedPriorA();
    const command = await prepareAndCommit("Impossible stale B", "10.01", true);
    const valid = await canonicalServerAccount(
      ADD_DEFAULT_IDS.previous,
      "9000"
    );
    await markRejected(command, "stale", {
      canonicalDefaultSnapshot: command.snapshot,
      canonicalAccounts: [valid],
    });
    const db = await coldRestart();
    const stored = await root(command.envelope.actionId, db);
    expect(stored.serverOutcome).toBe("stale");
    expect(parseCanonicalAccountsFromOutcomeJson(stored.outcomeJson)).toEqual([
      valid,
    ]);
    await expectRecoveryRefusedWithoutWrites(command, db);
    expect(
      (await db.get<Account>("accounts").find(command.accountId)).deleted
    ).toBe(false);
  });
});

describe("#395 T069 complete frozen creator-dependency journal recovery authority", () => {
  it("refuses an empty private dependency journal even after the genuinely captured A later accepts", async (): Promise<void> => {
    const a = await prepareAndCommit("Pending original A", "0", false, "CASH");
    const b = await prepareAndCommit("Rejected dependent B", "0", true, "CASH");
    expect(b.dependencyRoots).toEqual([
      {
        actionId: a.envelope.actionId,
        payloadHash: (await root(a.envelope.actionId)).payloadHash,
      },
    ]);
    await markRejected(b, "rejected");
    const repo = foundation();
    await repo.markFinancialActionGroupSyncPending(a.envelope.actionId);
    await repo.recordFinancialActionGroupServerOutcome(
      a.envelope.actionId,
      "accepted",
      serializeCanonicalFixture(accepted(a)),
      null
    );
    const db = await coldRestart();
    await replaceDurableAddDependencies(b, [], db);
    await expectRecoveryRefusedWithoutWrites(b, db);
  });

  it("refuses an emptied journal when the real unresolved account creator root is soft-deleted", async (): Promise<void> => {
    const a = await prepareAndCommit("Deleted creator A", "0", false, "CASH");
    const b = await prepareAndCommit("Dependent after A", "0", true, "CASH");
    expect(b.dependencyActionIds).toEqual([a.envelope.actionId]);
    await markRejected(b, "rejected");
    const db = await coldRestart();
    const ancestor = await root(a.envelope.actionId, db);
    await db.write(() =>
      db.batch(
        ancestor.prepareUpdate((row) => {
          row.deleted = true;
        })
      )
    );
    await replaceDurableAddDependencies(b, [], db);
    await expectRecoveryRefusedWithoutWrites(b, db);
  });

  it("refuses substituted accepted C proof when real unresolved creator A owns the original frozen member", async (): Promise<void> => {
    const c = await prepareAndCommit("Earlier unrelated C", "0", false, "CASH");
    const repo = foundation();
    await repo.markFinancialActionGroupSyncPending(c.envelope.actionId);
    await repo.recordFinancialActionGroupServerOutcome(
      c.envelope.actionId,
      "accepted",
      serializeCanonicalFixture(accepted(c)),
      null
    );
    const a = await prepareAndCommit(
      "Original unfinished A",
      "0",
      true,
      "CASH"
    );
    // C has been displaced by A. Remove C from B's ORIGINAL active set,
    // but retain C's immutable, genuinely accepted physical action root.
    const cAccount = await moduleDb.database
      .get<Account>("accounts")
      .find(c.accountId);
    await moduleDb.database.write(() =>
      moduleDb.database.batch(
        cAccount.prepareUpdate((row) => {
          row.deleted = true;
        })
      )
    );
    const b = await prepareAndCommit("Rejected dependent B", "0", true, "CASH");
    expect(b.snapshot.activeAccountIds).toEqual([a.accountId]);
    expect(b.dependencyActionIds).toEqual([a.envelope.actionId]);
    await markRejected(b, "rejected");
    const db = await coldRestart();
    await replaceDurableAddDependencies(
      b,
      [
        {
          actionId: c.envelope.actionId,
          payloadHash: (await root(c.envelope.actionId, db)).payloadHash,
        },
      ],
      db
    );
    await expectRecoveryRefusedWithoutWrites(b, db);
  });

  it("rejects an accepted-labelled registered legacy guarded EDIT substituted for the original account CREATE", async (): Promise<void> => {
    const a = await prepareAndCommit(
      "Real original creator A",
      "0",
      false,
      "CASH"
    );
    const b = await prepareAndCommit(
      "B depends only on A create",
      "0",
      true,
      "CASH"
    );
    expect(b.dependencyActionIds).toEqual([a.envelope.actionId]);
    await markRejected(b, "rejected");

    // This is a real registered immutable legacy action root; its guarded
    // account UPDATE is not an account CREATE. No forged new protocol tuple
    // or synthetic account writer is used to make it a creator.
    const legacyActionId = randomUUID();
    const legacy = legacyEditBalanceEnvelope;
    const registered = canonicalizeFinancialActionEnvelope(
      {
        ...legacy,
        actionId: legacyActionId,
        userId: OWNER,
        domainReferenceId: a.accountId,
        accountGuards: legacy.accountGuards.map((guard) => ({
          ...guard,
          accountId: a.accountId,
        })),
        payload: {
          ...legacy.payload,
          domainRecordRefs: [a.accountId],
          accountEffects: legacy.payload.accountEffects.map((effect) => ({
            ...effect,
            accountId: a.accountId,
          })),
          domainMutation: {
            records: legacy.payload.domainMutation.records.map((member) => ({
              ...member,
              after: { ...member.after, id: a.accountId },
            })),
          },
        },
      },
      createAccountReviewFinancialRegistry()
    );
    const repo = foundation();
    const published = await repo.createFinancialActionGroup({
      envelope: registered,
      hashProvider,
    });
    const legacyRoot = published.record;
    const firstGuard = registered.accountGuards[0];
    if (!firstGuard) throw new Error("r5_expected_registered_legacy_guard");
    await moduleDb.database.write(() =>
      moduleDb.database.batch(
        legacyRoot.prepareUpdate((row) => {
          row.state = "accepted";
          row.serverOutcome = "accepted";
          row.rejectionCode = null;
          row.outcomeJson = serializeCanonicalFixture({
            actionId: legacyActionId,
            status: "accepted",
            accountRevisions: [
              {
                accountId: a.accountId,
                revision: (BigInt(firstGuard.expectedRevision) + 1n).toString(),
              },
            ],
            effectiveEventId: null,
            holdingRevision: null,
            serverAcceptedAt: "2026-10-16T11:00:00.000Z",
          });
        })
      )
    );
    const db = await coldRestart();
    await replaceDurableAddDependencies(
      b,
      [
        {
          actionId: legacyRoot.actionId,
          payloadHash: legacyRoot.payloadHash,
        },
      ],
      db
    );
    await expectRecoveryRefusedWithoutWrites(b, db);
  });

  it("keeps the full genuine Add A dependency and allows conflict compensation after the bound A accepts", async (): Promise<void> => {
    const a = await prepareAndCommit(
      "Genuine predecessor A",
      "0",
      false,
      "CASH"
    );
    const b = await prepareAndCommit("Genuine dependent B", "0", true, "CASH");
    const aRoot = await root(a.envelope.actionId);
    expect(b.dependencyRoots).toEqual([
      { actionId: a.envelope.actionId, payloadHash: aRoot.payloadHash },
    ]);
    const repo = foundation();
    await repo.markFinancialActionGroupSyncPending(a.envelope.actionId);
    await repo.recordFinancialActionGroupServerOutcome(
      a.envelope.actionId,
      "accepted",
      serializeCanonicalFixture(accepted(a)),
      null
    );
    await markRejected(b, "rejected");
    const db = await coldRestart();
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        b.envelope.actionId
      )
    ).resolves.toBe("reconciled");
    expect((await db.get<Account>("accounts").find(b.accountId)).deleted).toBe(
      true
    );
    expect(
      (await root(b.envelope.actionId, db)).localRecoverySnapshotJson
    ).toEqual(expect.any(String));
  });
});

/**
 * R4: Review-created account A is a real foundation/SQLite Save, not a forged
 * financial action root. Then Add B captures that original Review creator.
 */
