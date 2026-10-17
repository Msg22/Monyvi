/**
 * #367 effect delivery and pending financial-root collision.
 *
 * Real syncDatabase, configuration, pull helpers, Watermelon synchronize,
 * SQLite, financial commands, outcome handling, and reconciliation.
 * Network responses are scripted. The database singleton and native adapters
 * are bound to the disposable test runtime; unrelated legacy-Metals repairs
 * are isolated as in the existing #255 SQLite suite.
 *
 * Direct-helper probes distinguish conversion defects from missing routing.
 * No historical-repair marker, old-checkpoint backfill, device, or real
 * Supabase backend is exercised. No execution result is claimed here.
 */
import {
  serializeCanonicalJsonValue,
  syncDatabase,
  pullMetalDedicatedTable,
  getFinancialActionGroup,
  markFinancialActionGroupSyncPending,
  recordFinancialActionGroupServerOutcome,
  productionFinancialActionReconciliationService,
  database,
  USER,
  ACCOUNT,
  ACTION,
  EFFECT,
  TRANSACTION,
  REMOTE_ROOT,
  NEXT_ACTION,
  NEXT_EFFECT,
  NEXT_TRANSACTION,
  NEXT_ROOT,
  COMPENSATED,
  UPPER,
  UPPER_2,
  CHECKPOINT,
  financialOutcome,
  financialRpcInputs,
  writes,
  stage,
  actionFixture,
  accountRow,
  staleOutcome,
  rootRow,
  effectRow,
  effects,
  roots,
  account,
  createOptimisticGroup,
  setUpper,
  setFinancialOutcome,
  type Transaction,
} from "./issue367-effect-delivery-fixtures";

describe("#367 production effect delivery", () => {
  it("hydrates linked effects initially and incrementally without replaying balances", async () => {
    const first = await actionFixture();
    stage("accounts", accountRow(125, "2"));
    stage("financial_action_groups", rootRow(first));
    stage("account_financial_effects", effectRow(first));
    await syncDatabase(database);

    // Positive controls precede the expected missing-delivery assertion.
    expect((await account()).balance).toBe(125);
    expect((await roots()).map((row) => row.actionId)).toEqual([ACTION]);
    expect(
      (await effects()).map((row) => ({
        id: row.id,
        owner: row.userId,
        account: row.accountId,
        action: row.actionId,
        amount: row.amountMinorUnits,
        revision: row.acceptedAccountRevision,
        compensatedAt: row.compensatedAt,
      }))
    ).toEqual([
      {
        id: EFFECT,
        owner: USER,
        account: ACCOUNT,
        action: ACTION,
        amount: "2500",
        revision: "2",
        compensatedAt: null,
      },
    ]);

    const second = await actionFixture("-500", "2", "EGP", {
      actionId: NEXT_ACTION,
      effectId: NEXT_EFFECT,
      transactionId: NEXT_TRANSACTION,
    });
    setUpper(UPPER_2);
    const later = "2026-10-07T13:00:00.123456Z";
    stage("accounts", accountRow(120, "3", "EGP", later));
    stage("financial_action_groups", rootRow(second, NEXT_ROOT, null, later));
    stage("account_financial_effects", effectRow(second, null, later));
    await syncDatabase(database);
    expect((await effects()).map((row) => row.id).sort()).toEqual(
      [EFFECT, NEXT_EFFECT].sort()
    );
    expect((await account()).balance).toBe(120);
    expect((await account()).financialRevision).toBe("3");

    setUpper("2026-10-07T16:00:00.000Z");
    await syncDatabase(database);
    expect((await account()).balance).toBe(120);
    expect((await effects()).map((row) => row.id).sort()).toEqual(
      [EFFECT, NEXT_EFFECT].sort()
    );
    expect(financialRpcInputs).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("preserves exact minor-unit and revision strings beyond Number's safe range", async () => {
    const precise = await actionFixture(
      "-9007199254740993",
      "9007199254740992",
      "BTC"
    );
    // This is a transport precision fixture, not a server acceptance test.
    const transportedBalance = -90071992.54740994;
    stage(
      "accounts",
      accountRow(transportedBalance, precise.acceptedRevision, "BTC")
    );
    stage("financial_action_groups", rootRow(precise));
    stage("account_financial_effects", effectRow(precise));
    await syncDatabase(database);
    expect((await roots()).map((row) => row.actionId)).toEqual([ACTION]);
    expect(
      (await effects()).map((row) => ({
        id: row.id,
        amount: row.amountMinorUnits,
        revision: row.acceptedAccountRevision,
        action: row.actionId,
        account: row.accountId,
      }))
    ).toEqual([
      {
        id: EFFECT,
        amount: "-9007199254740993",
        revision: "9007199254740993",
        action: ACTION,
        account: ACCOUNT,
      },
    ]);
    expect((await account()).financialRevision).toBe("9007199254740993");
    expect((await account()).balance).toBe(transportedBalance);
    expect(writes).toEqual([]);
  });

  it.each([null, COMPENSATED])(
    "preserves compensated_at=%s through the actual SQLite apply",
    async (compensatedAt) => {
      const action = await actionFixture();
      stage("accounts", accountRow(compensatedAt === null ? 125 : 110, "2"));
      stage(
        "financial_action_groups",
        rootRow(
          action,
          REMOTE_ROOT,
          compensatedAt === null ? null : staleOutcome()
        )
      );
      stage("account_financial_effects", effectRow(action, compensatedAt));
      await syncDatabase(database);
      const records = await effects();
      expect(records.map((row) => row.id)).toEqual([EFFECT]);
      expect(records[0]?.compensatedAt?.getTime() ?? null).toBe(
        compensatedAt === null ? null : Date.parse(compensatedAt)
      );
      expect(records[0]?.isEffective).toBe(compensatedAt === null);
    }
  );

  it("rejects invalid compensated_at before applying rows or advancing metadata", async () => {
    stage("accounts", accountRow(100, "1"));
    await syncDatabase(database);
    const baseline = await database.adapter.getLocal(CHECKPOINT);
    expect(baseline).not.toBeNull();
    const action = await actionFixture();
    setUpper(UPPER_2);
    stage(
      "financial_action_groups",
      rootRow(action, REMOTE_ROOT, staleOutcome())
    );
    stage("account_financial_effects", effectRow(action, "not-a-date"));
    await expect(syncDatabase(database)).rejects.toThrow();
    expect(await database.adapter.getLocal(CHECKPOINT)).toBe(baseline);
    expect(await roots()).toEqual([]);
    expect(await effects()).toEqual([]);
    expect((await account()).balance).toBe(100);
  });
});

describe("#367 existing-helper diagnostics, without changing active routing", () => {
  it("retains explicit null and exact strings in the helper's returned records", async () => {
    const action = await actionFixture();
    stage("account_financial_effects", effectRow(action));
    const result = await pullMetalDedicatedTable(
      "account_financial_effects",
      USER,
      null,
      UPPER,
      database
    );
    expect(result.updated).toEqual([
      expect.objectContaining({
        id: EFFECT,
        amount_minor_units: "2500",
        accepted_account_revision: "2",
        compensated_at: null,
      }),
    ]);
  });

  it("converts non-null compensated_at before the SQLite number sanitizer sees it", async () => {
    const action = await actionFixture();
    stage("account_financial_effects", effectRow(action, COMPENSATED));
    const result = await pullMetalDedicatedTable(
      "account_financial_effects",
      USER,
      null,
      UPPER,
      database
    );
    expect(result.updated).toEqual([
      expect.objectContaining({
        id: EFFECT,
        compensated_at: Date.parse(COMPENSATED),
        is_effective: false,
      }),
    ]);
  });

  it("rejects an invalid compensation timestamp at the existing helper boundary", async () => {
    const action = await actionFixture();
    stage("account_financial_effects", effectRow(action, "not-a-date"));
    await expect(
      pullMetalDedicatedTable(
        "account_financial_effects",
        USER,
        null,
        UPPER,
        database
      )
    ).rejects.toThrow();
  });
});

describe("#367 pending financial-root collision", () => {
  it("control: existing rejected-action reconciliation uses the owned database", async () => {
    const { root } = await createOptimisticGroup();
    await markFinancialActionGroupSyncPending(ACTION);
    await recordFinancialActionGroupServerOutcome(
      ACTION,
      "stale",
      serializeCanonicalJsonValue(staleOutcome()),
      "ACCOUNT_REVISION_STALE"
    );
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        ACTION
      )
    ).resolves.toBe("reconciled");
    expect((await roots()).map((row) => row.id)).toEqual([root.id]);
    expect((await account()).balance).toBe(110);
    expect((await account()).financialRevision).toBe("2");
    expect((await effects())[0]?.isEffective).toBe(false);
    expect((await effects())[0]?.compensatedAt).not.toBeNull();
    expect(
      (await database.get<Transaction>("transactions").find(TRANSACTION))
        .deleted
    ).toBe(true);
  });

  it("never treats a remote terminal root as proof that optimistic work was reconciled locally", async () => {
    const { action, root } = await createOptimisticGroup();
    const originalId = root.id;
    expect(originalId).not.toBe(REMOTE_ROOT);
    expect(root._raw._status).not.toBe("synced");
    expect((await effects())[0]?.isEffective).toBe(true);
    expect((await effects())[0]?.compensatedAt).toBeNull();

    // Same owner/action/hash, different persistence row ID. The server has
    // rejected the action; this local optimistic group has not reconciled.
    // Do not edit _status/_changed or mock an outcome/reconciliation handler.
    setUpper(UPPER_2);
    setFinancialOutcome(staleOutcome());
    stage("accounts", accountRow(110, "2"));
    stage(
      "financial_action_groups",
      rootRow(action, REMOTE_ROOT, financialOutcome)
    );
    stage("account_financial_effects", effectRow(action, COMPENSATED));
    await syncDatabase(database);

    const currentRoots = await roots();
    expect(currentRoots.map((row) => row.id)).toEqual([originalId]);
    const currentRoot = await getFinancialActionGroup(ACTION);
    expect(currentRoot).not.toBeNull();
    expect(currentRoot?.actionId).toBe(ACTION);
    expect(currentRoot?.payloadHash).toBe(action.payloadHash);
    expect(currentRoot?.payloadJson).toBe(action.payloadJson);
    const currentEffects = await effects();
    expect(currentEffects.map((row) => row.id)).toEqual([EFFECT]);
    const currentEffect = currentEffects[0];
    expect(currentEffect?.amountMinorUnits).toBe("2500");
    expect(currentEffect?.accountId).toBe(ACCOUNT);
    expect(currentEffect?.actionId).toBe(ACTION);
    const transaction = await database
      .get<Transaction>("transactions")
      .find(TRANSACTION);
    const currentAccount = await account();

    if (currentRoot?.state === "reconciled") {
      // Terminal acknowledgement is safe only after the actual local work.
      expect({
        balance: currentAccount.balance,
        revision: currentAccount.financialRevision,
        effectEffective: currentEffect?.isEffective,
        losingTransactionDeleted: transaction.deleted,
      }).toEqual({
        balance: 110,
        revision: "2",
        effectEffective: false,
        losingTransactionDeleted: true,
      });
      expect(currentEffect?.compensatedAt).toBeInstanceOf(Date);
    } else {
      // Retaining an unresolved group is acceptable; silently losing its
      // optimistic recovery evidence or acknowledging it is not.
      expect([
        "local_complete",
        "sync_pending",
        "sync_failed",
        "rejected_compensating",
        "reconciliation_incomplete",
      ]).toContain(currentRoot?.state);
      expect(currentAccount.balance).toBe(125);
      expect(currentAccount.financialRevision).toBe("2");
      expect(currentEffect?.isEffective).toBe(true);
      expect(currentEffect?.compensatedAt).toBeNull();
      expect(transaction.deleted).toBe(false);
      expect(currentRoot?._raw._status).not.toBe("synced");
      expect(currentEffect?._raw._status).not.toBe("synced");
      expect(transaction._raw._status).not.toBe("synced");
    }
    for (const input of financialRpcInputs) {
      expect(input.p_payload_json).toBe(action.payloadJson);
      expect(input.p_payload_hash).toBe(action.payloadHash);
    }
  });
});
