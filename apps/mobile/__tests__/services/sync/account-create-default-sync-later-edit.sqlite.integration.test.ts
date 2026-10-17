/**
 * #395 A1/A3/F3 HELD — genuine public Edit after Add B rejected by
 * SQL091 and atomically compensated to A. These are REAL local Watermelon
 * writes, the production Add/recovery service and actual SDK synchronize.
 *
 * No manually toggled post-compensation defaults, fabricated receipt, stubbed
 * Edit/save, mocked SQLite adapter or artificial recovery witness. Only the
 * existing shared fixture's authenticated Supabase remote-I/O double remains.
 * TESTS FIRST / NOT RUN: Root owns the cohesive cohort.
 */
import type { AccountFinancialEffect } from "@monyvi/db";
import {
  Q,
  randomUUID,
  OWNER,
  ledger,
  dbModule,
  mockUpserts,
  mockUpdates,
  mockFinancialTransport,
  syncFixtureControls,
  commitAdd,
  markRejected,
  ownedRoot,
  realSynchronize,
  coldRestart,
  productionFinancialActionReconciliationService,
  noPrivateNetworkBytes,
  outboundTouchesIds,
  type Account,
} from "./account-create-default-sync-lifecycle-fixtures";
// Load the fixture's real @monyvi/db provider/SQLite mock before importing
// the actual public Edit service, which reads its live database singleton.
import { updateAccountWithBalanceAdjustment } from "@/services/edit-account-service";

interface OrdinaryAccounts {
  readonly a: Account;
  readonly d: Account;
  readonly untouched: Account;
}

/** Seed actual persisted ordinary, non-Add accounts, with genuine UUIDs.
 * After the rejected B is deleted these remain THREE active owned accounts.
 */
async function seedThreeOrdinaryOwnedAccounts(): Promise<OrdinaryAccounts> {
  const db = ledger.database;
  return db.write(async (): Promise<OrdinaryAccounts> => {
    const accounts = db.get<Account>("accounts");
    const prepared = [
      { id: randomUUID(), name: "Ordinary A", isDefault: false },
      { id: randomUUID(), name: "Ordinary D", isDefault: true },
      { id: randomUUID(), name: "Untouched E", isDefault: false },
    ].map((candidate) =>
      accounts.prepareCreate((row) => {
        row._raw.id = candidate.id;
        row.userId = OWNER;
        row.name = candidate.name;
        row.type = "CASH";
        row.currency = "EGP";
        row.balance = 0;
        row.financialRevision = "0";
        row.isDefault = candidate.isDefault;
        row.deleted = false;
      })
    );
    await db.batch(...prepared);
    const [a, d, untouched] = prepared;
    if (!a || !d || !untouched)
      throw new Error("missing_real_ordinary_account_preimage");
    return { a, d, untouched };
  });
}

/** The public Edit service, not the test, must clear the previous default. */
async function editDefault(account: Account, name: string): Promise<void> {
  const before = account.balance;
  const result = await updateAccountWithBalanceAdjustment(
    account.id,
    OWNER,
    {
      name,
      balance: before,
      isDefault: true,
    },
    null
  );
  expect(result).toEqual({ success: true });
  const current = await dbModule.database
    .get<Account>("accounts")
    .find(account.id);
  expect(current.isDefault).toBe(true);
  expect(current.balance).toBe(before);
  expect(current.financialRevision).toBe("0");
}

function financialEffectEvidence(effect: AccountFinancialEffect): {
  readonly id: string;
  readonly accountId: string;
  readonly actionId: string;
  readonly amountMinorUnits: string;
  readonly currency: string;
  readonly revision: string;
  readonly isEffective: boolean;
  readonly deleted: boolean;
  readonly compensatedAt: number | null;
} {
  return {
    id: effect.id,
    accountId: effect.accountId,
    actionId: effect.actionId,
    amountMinorUnits: effect.amountMinorUnits,
    currency: effect.currency,
    revision: effect.acceptedAccountRevision,
    isEffective: effect.isEffective,
    deleted: effect.deleted,
    compensatedAt: effect.compensatedAt?.getTime() ?? null,
  };
}

describe("#395 A1/F3 real rejected Add compensation followed by later ordinary Edit", () => {
  it.each([
    {
      caseName: "before B's first guarded SDK terminal ACK",
      ackBeforeEdit: false,
    },
    {
      caseName: "after B's prior guarded SDK terminal ACK and restart",
      ackBeforeEdit: true,
    },
  ] as const)(
    "HELD preserves the later D choice, terminal-root ACK state and financial evidence $caseName",
    async ({ ackBeforeEdit }): Promise<void> => {
      const ordinary = await seedThreeOrdinaryOwnedAccounts();

      // Initial ordinary accounts become genuinely SDK-ACKed without any
      // protected Add or financial action. The remote default below is NOT
      // set by a mocked flag: its later A choice comes from public Edit + sync.
      await realSynchronize(ledger.database);
      for (const account of [ordinary.a, ordinary.d, ordinary.untouched])
        expect(account._raw._status).toBe("synced");

      syncFixtureControls.mockEnforceRemoteDefaultUnique = true;
      mockUpserts.length = 0;
      mockUpdates.length = 0;
      await editDefault(ordinary.a, "Ordinary A selected by real Edit");
      expect(ordinary.a.isDefault).toBe(true);
      expect(ordinary.d.isDefault).toBe(false);
      expect(ordinary.untouched.isDefault).toBe(false);

      // This real SDK/remote UPDATE establishes the checked prior server
      // default A. We do not fake a remote or local default after compensation.
      await realSynchronize(ledger.database);
      const originalEdits = mockUpdates.filter(
        (entry) =>
          entry.table === "accounts" &&
          typeof entry.values.is_default === "boolean"
      );
      expect(
        originalEdits.map((entry) => ({
          id: entry.filters.id,
          flag: entry.values.is_default,
        }))
      ).toEqual([
        { id: ordinary.d.id, flag: false },
        { id: ordinary.a.id, flag: true },
      ]);
      expect(syncFixtureControls.mockRemoteDefaultAccountId).toBe(
        ordinary.a.id
      );
      expect(ordinary.a._raw._status).toBe("synced");
      expect(ordinary.d._raw._status).toBe("synced");

      // Real Add B is rejected at the fixture's external-RPC boundary
      // using SQL091's exact six-field DOMAIN_UNIQUE_CONFLICT receipt.
      // Dedicated production compensation
      // restores A=true atomically, deletes losing B/children and disables
      // exactly its nonzero original opening effect.
      const b = await commitAdd(
        ledger.database,
        "Rejected Default B",
        "10.01",
        true,
        "BANK"
      );
      expect(b.snapshot.activeAccountIds).toEqual(
        [ordinary.a.id, ordinary.d.id, ordinary.untouched.id].sort()
      );
      expect(b.snapshot.defaultAccount?.accountId).toBe(ordinary.a.id);
      expect(ordinary.a.isDefault).toBe(false);
      expect(b.effectId).not.toBeNull();
      await markRejected(ledger.database, b);
      const rejected = await ownedRoot(ledger.database, b.envelope.actionId);
      expect(rejected.serverOutcome).toBe("rejected");
      expect(rejected.rejectionCode).toBe("domain_unique_conflict");
      await expect(
        productionFinancialActionReconciliationService.reconcileRejectedAction(
          b.envelope.actionId
        )
      ).resolves.toBe("reconciled");

      const afterCompensation = await coldRestart();
      expect(dbModule.database).toBe(afterCompensation);
      const root = await ownedRoot(afterCompensation, b.envelope.actionId);
      expect(root.state).toBe("reconciled");
      const privateEvidence = root.localRecoverySnapshotJson;
      expect(privateEvidence).toEqual(expect.any(String));

      const a = await afterCompensation
        .get<Account>("accounts")
        .find(ordinary.a.id);
      const d = await afterCompensation
        .get<Account>("accounts")
        .find(ordinary.d.id);
      const untouched = await afterCompensation
        .get<Account>("accounts")
        .find(ordinary.untouched.id);
      const losing = await afterCompensation
        .get<Account>("accounts")
        .find(b.accountId);
      expect(a.isDefault).toBe(true);
      expect(d.isDefault).toBe(false);
      expect(untouched.isDefault).toBe(false);
      expect(losing.deleted).toBe(true);
      const baselineEffects = await afterCompensation
        .get<AccountFinancialEffect>("account_financial_effects")
        .query()
        .fetch();
      expect(baselineEffects).toHaveLength(1);
      expect(baselineEffects[0]?.id).toBe(b.effectId);
      expect(baselineEffects[0]?.amountMinorUnits).toBe("1001");
      expect(baselineEffects[0]?.isEffective).toBe(false);
      expect(baselineEffects[0]?.compensatedAt).not.toBeNull();
      const originalEffect = baselineEffects.map(financialEffectEvidence);

      if (ackBeforeEdit) {
        // The separate prior SDK run proves and ACKs only B's reconciled root.
        // A later independent default Edit has no advanced successor witness.
        mockUpserts.length = 0;
        mockUpdates.length = 0;
        await realSynchronize(afterCompensation);
        expect(
          (await ownedRoot(afterCompensation, b.envelope.actionId))._raw._status
        ).toBe("synced");
        expect(syncFixtureControls.mockRemoteDefaultAccountId).toBe(
          ordinary.a.id
        );
      } else {
        expect(root._raw._status).not.toBe("synced");
      }

      const activeDatabase = await coldRestart();
      expect(dbModule.database).toBe(activeDatabase);
      const aForEdit = await activeDatabase
        .get<Account>("accounts")
        .find(ordinary.a.id);
      const dForEdit = await activeDatabase
        .get<Account>("accounts")
        .find(ordinary.d.id);
      const unaffected = await activeDatabase
        .get<Account>("accounts")
        .find(ordinary.untouched.id);

      // This is the actual public metadata-only account Edit, NOT a
      // manually prepared pair of default flags. It must clear A and
      // choose D in the real account writer with no balance adjustment.
      await editDefault(dForEdit, "D default after rejected B");
      expect(aForEdit.isDefault).toBe(false);
      expect(dForEdit.isDefault).toBe(true);
      expect(unaffected.isDefault).toBe(false);
      expect(aForEdit._raw._changed.split(",")).toContain("is_default");
      expect(dForEdit._raw._changed.split(",")).toContain("is_default");
      const active = await activeDatabase
        .get<Account>("accounts")
        .query(Q.where("user_id", OWNER), Q.where("deleted", false))
        .fetch();
      expect(active).toHaveLength(3);
      expect(
        active
          .filter((account) => account.isDefault)
          .map((account) => account.id)
      ).toEqual([ordinary.d.id]);

      // Snapshot the actual physical DB, proof and effects immediately
      // before a deferred synchronization; refusal cannot mutate them.
      const rowIds = [
        ordinary.a.id,
        ordinary.d.id,
        ordinary.untouched.id,
        b.accountId,
      ];
      const snapshotRows = async (
        db: typeof activeDatabase
      ): Promise<readonly string[]> =>
        Promise.all(
          rowIds.map(async (id) =>
            JSON.stringify((await db.get<Account>("accounts").find(id))._raw)
          )
        );
      const beforeRows = await snapshotRows(activeDatabase);
      const rootBefore = await ownedRoot(activeDatabase, b.envelope.actionId);
      const rawRootBefore = JSON.stringify(rootBefore._raw);
      const privateBefore = rootBefore.localRecoverySnapshotJson;
      expect(rootBefore.state).toBe("reconciled");
      if (ackBeforeEdit) {
        expect(rootBefore._raw._status).toBe("synced");
      } else {
        expect(rootBefore._raw._status).not.toBe("synced");
      }
      expect(privateBefore).toBe(privateEvidence);
      const beforeEffects = (
        await activeDatabase
          .get<AccountFinancialEffect>("account_financial_effects")
          .query()
          .fetch()
      ).map(financialEffectEvidence);
      expect(beforeEffects).toEqual(originalEffect);
      const previousFinancialRpcs = mockFinancialTransport.length;
      mockUpserts.length = 0;
      mockUpdates.length = 0;

      // Advanced post-compensation successor reconstruction is deferred.
      // The real protection error, not a fake successful ACK, is mandatory.
      await expect(realSynchronize(activeDatabase)).rejects.toThrow(
        "account_sync_protection_invalid_root"
      );
      expect(mockUpserts).toEqual([]);
      expect(mockUpdates).toEqual([]);
      expect(syncFixtureControls.mockRemoteDefaultAccountId).toBe(
        ordinary.a.id
      );
      expect(mockFinancialTransport).toHaveLength(previousFinancialRpcs);
      const heldRoot = await ownedRoot(activeDatabase, b.envelope.actionId);
      expect(JSON.stringify(heldRoot._raw)).toBe(rawRootBefore);
      expect(heldRoot._raw._status).toBe(rootBefore._raw._status);
      expect(heldRoot.localRecoverySnapshotJson).toBe(privateBefore);
      expect(await snapshotRows(activeDatabase)).toEqual(beforeRows);
      expect(
        (
          await activeDatabase
            .get<AccountFinancialEffect>("account_financial_effects")
            .query()
            .fetch()
        ).map(financialEffectEvidence)
      ).toEqual(beforeEffects);
      expect(aForEdit.isDefault).toBe(false);
      expect(dForEdit.isDefault).toBe(true);
      expect(unaffected.isDefault).toBe(false);
      const losingIds = new Set(
        [
          b.accountId,
          b.bankDetailId,
          b.effectId,
          ...b.senders.map((sender) => sender.id),
        ].filter((id): id is string => typeof id === "string")
      );
      expect(outboundTouchesIds(losingIds)).toBe(false);

      // Cold restart is an independent physical oracle; no cache-only repair.
      const reopened = await coldRestart();
      const durableRoot = await ownedRoot(reopened, b.envelope.actionId);
      expect(JSON.stringify(durableRoot._raw)).toBe(rawRootBefore);
      expect(durableRoot.localRecoverySnapshotJson).toBe(privateBefore);
      expect(await snapshotRows(reopened)).toEqual(beforeRows);
      expect(
        (
          await reopened
            .get<AccountFinancialEffect>("account_financial_effects")
            .query()
            .fetch()
        ).map(financialEffectEvidence)
      ).toEqual(beforeEffects);
      expect(
        (await reopened.get<Account>("accounts").find(ordinary.d.id)).isDefault
      ).toBe(true);
      expect(
        (await reopened.get<Account>("accounts").find(ordinary.a.id)).isDefault
      ).toBe(false);
      noPrivateNetworkBytes();
    }
  );
});
