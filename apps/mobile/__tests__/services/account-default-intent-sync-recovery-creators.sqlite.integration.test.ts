/** #395 real Watermelon SQLite Add recovery; original cases retained. */
import {
  randomUUID,
  Q,
  canonicalizeFinancialActionEnvelope,
  parseFinancialActionEnvelopeJson,
  legacyEditBalanceEnvelope,
  createAccountReviewFinancialRegistry,
  makeSaveFixture,
  REVIEW_CREATED_OWNER,
  saveReview,
  parseAccountCreateDefaultLocalRecoverySnapshotJson,
  validateReviewBatchSavePayload,
  productionFinancialActionReconciliationService,
  physicalSaveLedgerSnapshot,
  ledger,
  OWNER,
  hashProvider,
  setMockActiveAddOwner,
  serializeCanonicalFixture,
  form,
  addService,
  foundation,
  prepareAndCommit,
  root,
  effects,
  coldRestart,
  accepted,
  markRejected,
  expectRecoveryRefusedWithoutWrites,
  replaceDurableAddDependencies,
  prepareRealReviewCreatorDependency,
  type Account,
  type FinancialActionGroup,
} from "./account-default-intent-sync-recovery-sqlite-fixture";

describe("#395 T069 full creator provenance — accepted BEFORE B preparation", () => {
  it.each(["0", "10.01"])(
    "captures complete accepted Add A membership with NO unresolved blocker; real six-field 23505 compensates B opening %s",
    async (opening): Promise<void> => {
      const serverName = "Accepted server account A";
      const a = await prepareAndCommit(serverName, "0", true, "CASH");
      const repo = foundation();
      await repo.markFinancialActionGroupSyncPending(a.envelope.actionId);
      await repo.recordFinancialActionGroupServerOutcome(
        a.envelope.actionId,
        "accepted",
        serializeCanonicalFixture(accepted(a)),
        null
      );
      const original = await root(a.envelope.actionId);
      expect(original.state).toBe("accepted");
      // Verified SQL091 zero-opening A inserts revision 0 and emits
      // an EMPTY accountRevisions array, not an invented revision 1.
      expect(a.effectId).toBeNull();
      expect(accepted(a).accountRevisions).toEqual([]);
      expect(original.outcomeJson).toBe(serializeCanonicalFixture(accepted(a)));
      const oldA = await ledger.database
        .get<Account>("accounts")
        .find(a.accountId);
      await ledger.database.write(() =>
        ledger.database.batch(
          oldA.prepareUpdate((row) => {
            // Offline local rename is independent metadata. Server still holds
            // A's original name and rejects B's same identity with SQL23505.
            row.name = "Renamed locally before B";
          })
        )
      );
      const b = await prepareAndCommit(serverName, opening, true, "CASH");
      expect(b.snapshot.defaultAccount?.accountId).toBe(a.accountId);
      expect(b.dependencyActionIds).toEqual([]);
      expect(b.dependencyRoots).toEqual([
        {
          actionId: a.envelope.actionId,
          payloadHash: original.payloadHash,
        },
      ]);
      const pending = await root(b.envelope.actionId);
      if (typeof pending.localRecoverySnapshotJson !== "string")
        throw new Error("missing_original_full_creator_private_snapshot");
      const captured = parseAccountCreateDefaultLocalRecoverySnapshotJson({
        json: pending.localRecoverySnapshotJson,
        expectedRoot: {
          actionId: b.envelope.actionId,
          ownerId: OWNER,
          domainReferenceId: b.accountId,
          payloadHash: pending.payloadHash,
          expectedDefaultSnapshot: b.snapshot,
        },
      });
      expect(captured.dependencyRoots).toEqual(b.dependencyRoots);
      expect(Object.keys(captured)).toHaveLength(12);
      await markRejected(b, "rejected");
      const reopened = await coldRestart();
      const receipt = await root(b.envelope.actionId, reopened);
      if (!receipt.outcomeJson) throw new Error("missing_real_six_field_23505");
      const evidence: unknown = JSON.parse(receipt.outcomeJson);
      if (
        typeof evidence !== "object" ||
        evidence === null ||
        Array.isArray(evidence)
      )
        throw new Error("invalid_domain_conflict_outcome");
      expect(Object.keys(evidence).sort()).toEqual(
        [
          "actionId",
          "status",
          "code",
          "canonicalAccounts",
          "canonicalAbsentAccountIds",
          "canonicalDefaultSnapshot",
        ].sort()
      );
      await expect(
        productionFinancialActionReconciliationService.reconcileRejectedAction(
          b.envelope.actionId
        )
      ).resolves.toBe("reconciled");
      const restoredA = await reopened
        .get<Account>("accounts")
        .find(a.accountId);
      expect(restoredA.name).toBe("Renamed locally before B");
      expect(restoredA.isDefault).toBe(true);
      expect(restoredA._raw._changed.split(",")).toContain("name");
      expect(
        (await reopened.get<Account>("accounts").find(b.accountId)).deleted
      ).toBe(true);
      expect(
        (await effects(b.envelope.actionId, reopened)).filter(
          (effect) => effect.isEffective
        )
      ).toHaveLength(0);
      expect(
        (await root(b.envelope.actionId, reopened)).localRecoverySnapshotJson
      ).toEqual(expect.any(String));
    }
  );

  it.each(["0", "10.01"] as const)(
    "accepts only the genuine SQL091 creator receipt for opening=%s, not a forged opposite revision list",
    async (opening): Promise<void> => {
      // Use genuine Add A and B foundation writers and the original
      // SQL-shaped six-key RPC outcome, never an accepted-label shortcut.
      const originalName = "SQL091 creator revision proof";
      const a = await prepareAndCommit(originalName, opening, true, "CASH");
      const expectedMembers =
        opening === "0" ? [] : [{ accountId: a.accountId, revision: "1" }];
      expect(a.effectId === null).toBe(opening === "0");
      expect(accepted(a).accountRevisions).toEqual(expectedMembers);
      expect(Object.keys(accepted(a)).sort()).toEqual(
        [
          "accountRevisions",
          "actionId",
          "effectiveEventId",
          "holdingRevision",
          "serverAcceptedAt",
          "status",
        ].sort()
      );
      const repo = foundation();
      await repo.markFinancialActionGroupSyncPending(a.envelope.actionId);
      const fullReceipt = serializeCanonicalFixture(accepted(a));
      await repo.recordFinancialActionGroupServerOutcome(
        a.envelope.actionId,
        "accepted",
        fullReceipt,
        null
      );
      const creator = await root(a.envelope.actionId);
      expect(creator.state).toBe("accepted");
      expect(creator.outcomeJson).toBe(fullReceipt);
      // The server still has the immutable original account identity; the
      // independent local rename permits a real B Add with the same name.
      const originalAccount = await ledger.database
        .get<Account>("accounts")
        .find(a.accountId);
      expect(originalAccount.financialRevision).toBe(
        opening === "0" ? "0" : "1"
      );
      await ledger.database.write(() =>
        ledger.database.batch(
          originalAccount.prepareUpdate((row) => {
            row.name = "Local metadata after genuine creator acceptance";
          })
        )
      );
      const b = await prepareAndCommit(originalName, "0", true, "CASH");
      expect(b.dependencyActionIds).toEqual([]);
      expect(b.dependencyRoots).toEqual([
        {
          actionId: a.envelope.actionId,
          payloadHash: creator.payloadHash,
        },
      ]);
      await markRejected(b, "rejected");
      const db = await coldRestart();
      const durableCreator = await root(a.envelope.actionId, db);
      expect(durableCreator.outcomeJson).toBe(fullReceipt);
      const opposingMembers =
        opening === "0" ? [{ accountId: a.accountId, revision: "1" }] : [];
      // Negative: mutate ONLY the persisted accepted receipt member set
      // after real writer admission; no fake action/state or missing keys.
      const wrongReceipt = serializeCanonicalFixture({
        ...accepted(a),
        accountRevisions: opposingMembers,
      });
      await db.write(() =>
        db.batch(
          durableCreator.prepareUpdate((row) => {
            row.outcomeJson = wrongReceipt;
          })
        )
      );
      await expectRecoveryRefusedWithoutWrites(b, db);
      expect((await root(a.envelope.actionId, db)).outcomeJson).toBe(
        wrongReceipt
      );

      // Restore the complete ORIGINAL SQL091 accepted outcome. Recovery
      // must now pass with the original immutable root/hash/creator journal.
      await db.write(() =>
        db.batch(
          durableCreator.prepareUpdate((row) => {
            row.outcomeJson = fullReceipt;
          })
        )
      );
      await expect(
        productionFinancialActionReconciliationService.reconcileRejectedAction(
          b.envelope.actionId
        )
      ).resolves.toBe("reconciled");
      expect(
        (await db.get<Account>("accounts").find(a.accountId)).isDefault
      ).toBe(true);
      expect(
        (await db.get<Account>("accounts").find(b.accountId)).deleted
      ).toBe(true);
      expect(await effects(a.envelope.actionId, db)).toHaveLength(
        opening === "0" ? 0 : 1
      );
      expect((await root(b.envelope.actionId, db)).state).toBe("reconciled");
    }
  );

  it("preserves B's original complete creator hash when unresolved Add A accepts between B.prepare and B.commitPrepared", async (): Promise<void> => {
    const a = await prepareAndCommit("Pending A", "0", true, "CASH");
    const svc = addService();
    const b = await svc.prepare(
      OWNER,
      form("B planned before A ACK", "0", true, "CASH")
    );
    const originalRoot = await root(a.envelope.actionId);
    expect(b.dependencyActionIds).toEqual([a.envelope.actionId]);
    expect(b.dependencyRoots).toEqual([
      {
        actionId: a.envelope.actionId,
        payloadHash: originalRoot.payloadHash,
      },
    ]);
    const repo = foundation();
    await repo.markFinancialActionGroupSyncPending(a.envelope.actionId);
    await repo.recordFinancialActionGroupServerOutcome(
      a.envelope.actionId,
      "accepted",
      serializeCanonicalFixture(accepted(a)),
      null
    );
    await expect(svc.commitPrepared(b)).resolves.toMatchObject({
      kind: "committed",
      accountId: b.accountId,
    });
    const committed = await root(b.envelope.actionId);
    if (!committed.localRecoverySnapshotJson)
      throw new Error("missing_post_acceptance_creator_snapshot");
    const saved = parseAccountCreateDefaultLocalRecoverySnapshotJson({
      json: committed.localRecoverySnapshotJson,
      expectedRoot: {
        actionId: b.envelope.actionId,
        ownerId: OWNER,
        domainReferenceId: b.accountId,
        payloadHash: committed.payloadHash,
        expectedDefaultSnapshot: b.snapshot,
      },
    });
    expect(saved.dependencyRoots).toEqual(b.dependencyRoots);
    expect(committed.payloadJson).toBe(
      (await root(b.envelope.actionId)).payloadJson
    );
    await markRejected(b, "rejected");
    const reopened = await coldRestart();
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        b.envelope.actionId
      )
    ).resolves.toBe("reconciled");
    expect((await root(b.envelope.actionId, reopened)).state).toBe(
      "reconciled"
    );
  });

  it.each(["missing", "edited-hash"] as const)(
    "keeps accepted-before-B private creator journal mandatory when %s: old incomplete evidence refuses",
    async (defect): Promise<void> => {
      const a = await prepareAndCommit("Accepted A", "0", true, "CASH");
      const repo = foundation();
      await repo.markFinancialActionGroupSyncPending(a.envelope.actionId);
      await repo.recordFinancialActionGroupServerOutcome(
        a.envelope.actionId,
        "accepted",
        serializeCanonicalFixture(accepted(a)),
        null
      );
      const accountA = await ledger.database
        .get<Account>("accounts")
        .find(a.accountId);
      await ledger.database.write(() =>
        ledger.database.batch(
          accountA.prepareUpdate((row) => {
            row.name = "Locally changed A";
          })
        )
      );
      const b = await prepareAndCommit("Accepted A", "0", true, "CASH");
      const original = await root(a.envelope.actionId);
      expect(b.dependencyActionIds).toEqual([]);
      expect(b.dependencyRoots).toEqual([
        {
          actionId: a.envelope.actionId,
          payloadHash: original.payloadHash,
        },
      ]);
      await markRejected(b, "rejected");
      const reopened = await coldRestart();
      await replaceDurableAddDependencies(
        b,
        defect === "missing"
          ? []
          : [
              {
                actionId: a.envelope.actionId,
                payloadHash: "f".repeat(64),
              },
            ],
        reopened
      );
      await expectRecoveryRefusedWithoutWrites(b, reopened);
    }
  );

  it("accepted guarded legacy Edit is not a creator in the accepted Add A original frozen graph", async (): Promise<void> => {
    const a = await prepareAndCommit(
      "Actual accepted account creator A",
      "0",
      true,
      "CASH"
    );
    const repo = foundation();
    await repo.markFinancialActionGroupSyncPending(a.envelope.actionId);
    await repo.recordFinancialActionGroupServerOutcome(
      a.envelope.actionId,
      "accepted",
      serializeCanonicalFixture(accepted(a)),
      null
    );
    const legacy = legacyEditBalanceEnvelope;
    const legacyActionId = randomUUID();
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
    const published = await repo.createFinancialActionGroup({
      envelope: registered,
      hashProvider,
    });
    const edited = published.record;
    const guard = registered.accountGuards[0];
    if (!guard) throw new Error("missing_registered_legacy_guard");
    await ledger.database.write(() =>
      ledger.database.batch(
        edited.prepareUpdate((row) => {
          row.state = "accepted";
          row.serverOutcome = "accepted";
          row.rejectionCode = null;
          row.outcomeJson = serializeCanonicalFixture({
            actionId: legacyActionId,
            status: "accepted",
            accountRevisions: [
              {
                accountId: a.accountId,
                revision: (BigInt(guard.expectedRevision) + 1n).toString(),
              },
            ],
            effectiveEventId: null,
            holdingRevision: null,
            serverAcceptedAt: "2026-10-16T11:00:00.000Z",
          });
        })
      )
    );
    const accountA = await ledger.database
      .get<Account>("accounts")
      .find(a.accountId);
    await ledger.database.write(() =>
      ledger.database.batch(
        accountA.prepareUpdate((row) => {
          row.name = "Local name after A accepts";
        })
      )
    );
    const b = await addService().prepare(
      OWNER,
      form("Actual accepted account creator A", "0", true, "CASH")
    );
    expect(b.dependencyActionIds).toEqual([]);
    expect(b.dependencyRoots).toEqual([
      {
        actionId: a.envelope.actionId,
        payloadHash: (await root(a.envelope.actionId)).payloadHash,
      },
    ]);
    expect(
      b.dependencyRoots?.some((entry) => entry.actionId === legacyActionId)
    ).toBe(false);
    await expect(addService().commitPrepared(b)).resolves.toMatchObject({
      kind: "committed",
      accountId: b.accountId,
    });
  });

  it("genuine Review creator accepted before B.prepare remains in the full private journal but not the unresolved push-order set", async (): Promise<void> => {
    setMockActiveAddOwner(REVIEW_CREATED_OWNER);
    const review = makeSaveFixture("voice-cash");
    await expect(saveReview(review, ledger.database)).resolves.toMatchObject({
      kind: "committed",
    });
    const roots = await ledger.database
      .get<FinancialActionGroup>("financial_action_groups")
      .query(Q.where("action_id", review.intent.actionId))
      .fetch();
    const ancestor = roots[0];
    if (roots.length !== 1 || !ancestor)
      throw new Error("no_real_review_creator_action");
    const envelope = parseFinancialActionEnvelopeJson(
      ancestor.payloadJson,
      createAccountReviewFinancialRegistry()
    );
    if (
      envelope.kind !== "review_batch_save" ||
      envelope.payloadVersion !== "review.batch-save/v1"
    )
      throw new Error("unexpected_review_creator_tuple");
    const reviewPayload = validateReviewBatchSavePayload(envelope.payload);
    const created = reviewPayload.domainMutation.records.filter(
      (record) => record.entity === "account" && record.mode === "create"
    );
    const record = created[0];
    if (created.length !== 1 || !record || record.entity !== "account")
      throw new Error("missing_owned_review_created_account");
    // The SQL090 accepted receipt is complete for this genuine writer
    // only if no separate pre-existing account had a financial effect.
    // Never manufacture a truncated one-member Review acceptance.
    if (
      reviewPayload.accountEffects.some(
        (effect) => effect.accountId !== record.after.id
      )
    )
      throw new Error("unexpected_additional_review_account_revision");
    const priorA = await ledger.database
      .get<Account>("accounts")
      .find(record.after.id);
    const oldServerName = priorA.name;
    const acceptedReview = {
      actionId: ancestor.actionId,
      status: "accepted",
      accountRevisions: [{ accountId: priorA.id, revision: "1" }],
      effectiveEventId: null,
      holdingRevision: null,
      serverAcceptedAt: "2026-10-16T11:00:00.000Z",
    };
    const repo = foundation();
    await repo.markFinancialActionGroupSyncPending(ancestor.actionId);
    await repo.recordFinancialActionGroupServerOutcome(
      ancestor.actionId,
      "accepted",
      serializeCanonicalFixture(acceptedReview),
      null
    );
    await ledger.database.write(() =>
      ledger.database.batch(
        priorA.prepareUpdate((row) => {
          row.name = "Renamed review A locally";
        })
      )
    );
    const svc = addService(ledger.database);
    const b = await svc.prepare(
      REVIEW_CREATED_OWNER,
      form(oldServerName, "0", true, "CASH")
    );
    expect(b.dependencyActionIds).toEqual([]);
    expect(b.dependencyRoots).toEqual([
      {
        actionId: ancestor.actionId,
        payloadHash: ancestor.payloadHash,
      },
    ]);
    await expect(svc.commitPrepared(b)).resolves.toMatchObject({
      kind: "committed",
      accountId: b.accountId,
    });
    await markRejected(b, "rejected");
    const reopened = await coldRestart();
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        b.envelope.actionId
      )
    ).resolves.toBe("reconciled");
    const retained = await reopened.get<Account>("accounts").find(priorA.id);
    expect(retained.name).toBe("Renamed review A locally");
    expect(retained.isDefault).toBe(true);
    expect(
      (await reopened.get<Account>("accounts").find(b.accountId)).deleted
    ).toBe(true);
  });
});

describe("#395 T069 R4 genuine Review-created accepted predecessor authority", () => {
  it.each(["truncated", "extra-key", "wrong-revision-member"] as const)(
    "R4 refuses %s accepted Review receipt, then admits restored genuine original",
    async (corruption): Promise<void> => {
      const { ancestor, successor, canonicalReceipt, createdAccountId } =
        await prepareRealReviewCreatorDependency();
      const fullReceiptText = ancestor.outcomeJson;
      if (typeof fullReceiptText !== "string")
        throw new Error("r4_missing_real_review_acceptance");
      const invalid: Readonly<Record<string, unknown>> =
        corruption === "truncated"
          ? {
              actionId: ancestor.actionId,
              status: "accepted",
              accountRevisions: [],
            }
          : corruption === "extra-key"
            ? {
                ...canonicalReceipt,
                unauthorized: "unbound",
              }
            : {
                ...canonicalReceipt,
                accountRevisions: [
                  { accountId: successor.accountId, revision: "1" },
                ],
              };
      await ledger.database.write(() =>
        ledger.database.batch(
          ancestor.prepareUpdate((row) => {
            row.outcomeJson = serializeCanonicalFixture(invalid);
          })
        )
      );
      const physical = await physicalSaveLedgerSnapshot(ledger.database);
      await expectRecoveryRefusedWithoutWrites(successor, ledger.database);
      expect(await physicalSaveLedgerSnapshot(ledger.database)).toEqual(
        physical
      );
      await ledger.database.write(() =>
        ledger.database.batch(
          ancestor.prepareUpdate((row) => {
            row.outcomeJson = fullReceiptText;
          })
        )
      );
      expect(
        (await ledger.database.get<Account>("accounts").find(createdAccountId))
          .userId
      ).toBe(REVIEW_CREATED_OWNER);
      await expect(
        productionFinancialActionReconciliationService.reconcileRejectedAction(
          successor.envelope.actionId
        )
      ).resolves.toBe("reconciled");
      expect(
        (
          await ledger.database
            .get<Account>("accounts")
            .find(successor.accountId)
        ).deleted
      ).toBe(true);
    }
  );
});
