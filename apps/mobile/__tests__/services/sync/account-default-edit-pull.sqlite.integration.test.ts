/**
 * D2 — a legitimate pending owned default edit must not poison the pull.
 *
 * The owner's Edit clears the previous default and sets the new one. The
 * local rows stay dirty until the owner's positive owner-filtered UPDATE is
 * acknowledged, so the cloud echo is admitted UNMODIFIED to the normal SDK
 * resolver and the local pending value stays authoritative.
 *
 * These are real WatermelonDB/SQLite rows and a real SDK synchronize call
 * with a real pull. No account UPSERT, no amount, revision, effect or
 * payload write is produced by the case.
 */
import {
  acceptThenAck,
  cloudAccount,
  coldRestart,
  commitAdd,
  ledger,
  mockUpserts,
  mockUpdates,
  OWNER,
  realSynchronize,
  syncFixtureControls,
  type Account,
  type SyncPullResult,
} from "./account-create-default-sync-lifecycle-fixtures";

interface UpdateAccountData {
  readonly name: string;
  readonly balance: number;
  readonly isDefault: boolean;
}

async function editAccount(
  db: Awaited<ReturnType<typeof coldRestart>>,
  accountId: string,
  data: UpdateAccountData
): Promise<{ readonly success: boolean; readonly error?: string }> {
  const { updateAccountWithBalanceAdjustment } = jest.requireActual<
    typeof import("@/services/edit-account-service")
  >("@/services/edit-account-service");
  return updateAccountWithBalanceAdjustment(accountId, OWNER, data, null);
}

async function accountsOf(
  db: Awaited<ReturnType<typeof coldRestart>>
): Promise<readonly Account[]> {
  return db.get<Account>("accounts").query().fetch();
}

async function defaultIds(
  db: Awaited<ReturnType<typeof coldRestart>>
): Promise<readonly string[]> {
  const accounts = await accountsOf(db);
  return accounts.filter((account) => account.isDefault).map((a) => a.id);
}

describe("D2 a legitimate pending default edit never poisons the pull", () => {
  it("admits the cloud echo when the server already applied the clear but not the set", async (): Promise<void> => {
    const accountA = await commitAdd(ledger.database, "Default A", "0", true);
    await acceptThenAck(ledger.database, accountA);
    const accountB = await commitAdd(ledger.database, "Other B", "0", false);
    await acceptThenAck(ledger.database, accountB);

    const db = await coldRestart();

    // The user's Edit: B becomes the default and A is unmarked locally.
    const edited = await editAccount(db, accountB.accountId, {
      name: "Other B",
      balance: 0,
      isDefault: true,
    });
    expect(edited.success).toBe(true);
    expect(await defaultIds(db)).toEqual([accountB.accountId]);

    // The owner-filtered UPDATE applied the clear but the set failed, so the
    // cloud still reports A as NOT default: the remote A flag now EQUALS the
    // local pending A flag. An equal flag is not an acknowledgement.
    const echoA = await cloudAccount(db, accountA.accountId, {
      is_default: false,
    });
    const echoB = await cloudAccount(db, accountB.accountId, {
      is_default: false,
    });

    await expect(
      realSynchronize(db, {
        pull: (): Promise<SyncPullResult> =>
          Promise.resolve({
            changes: {
              accounts: {
                created: [],
                updated: [echoA, echoB],
                deleted: [],
              },
            },
            timestamp: ++syncFixtureControls.mockNextWatermark,
          }),
      })
    ).resolves.toBeUndefined();

    // The local pending value stays authoritative until the owner's positive
    // UPDATE is counted.
    const after = await accountsOf(db);
    expect(
      after.find((account) => account.id === accountA.accountId)?.isDefault
    ).toBe(false);
    expect(
      after.find((account) => account.id === accountB.accountId)?.isDefault
    ).toBe(true);
  });

  it("admits the cloud echo when the server applied both the clear and the set", async (): Promise<void> => {
    const accountA = await commitAdd(ledger.database, "Default A", "0", true);
    await acceptThenAck(ledger.database, accountA);
    const accountB = await commitAdd(ledger.database, "Other B", "0", false);
    await acceptThenAck(ledger.database, accountB);

    const db = await coldRestart();
    const edited = await editAccount(db, accountB.accountId, {
      name: "Other B",
      balance: 0,
      isDefault: true,
    });
    expect(edited.success).toBe(true);

    const echoA = await cloudAccount(db, accountA.accountId, {
      is_default: false,
    });
    const echoB = await cloudAccount(db, accountB.accountId, {
      is_default: true,
    });

    await expect(
      realSynchronize(db, {
        pull: (): Promise<SyncPullResult> =>
          Promise.resolve({
            changes: {
              accounts: {
                created: [],
                updated: [echoA, echoB],
                deleted: [],
              },
            },
            timestamp: ++syncFixtureControls.mockNextWatermark,
          }),
      })
    ).resolves.toBeUndefined();

    const after = await accountsOf(db);
    expect(
      after.find((account) => account.id === accountB.accountId)?.isDefault
    ).toBe(true);
  });

  function deferred(): {
    readonly promise: Promise<void>;
    readonly resolve: () => void;
  } {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it("keeps both rows dirty at the real owner-filtered UPDATE until the positive ACK", async (): Promise<void> => {
    const accountA = await commitAdd(ledger.database, "Default A", "0", true);
    await acceptThenAck(ledger.database, accountA);
    const accountB = await commitAdd(ledger.database, "Other B", "0", false);
    await acceptThenAck(ledger.database, accountB);

    const db = await coldRestart();
    const edited = await editAccount(db, accountB.accountId, {
      name: "Other B",
      balance: 0,
      isDefault: true,
    });
    expect(edited.success).toBe(true);

    const echoA = await cloudAccount(db, accountA.accountId, {
      is_default: true,
    });
    const echoB = await cloudAccount(db, accountB.accountId, {
      is_default: false,
    });

    // Hold the real owner-filtered UPDATE for B at the server seam.
    const reached = deferred();
    const release = deferred();
    syncFixtureControls.beforeAccountMetadataUpdate = async (observation) => {
      if (observation.filters.id !== accountB.accountId) return;
      reached.resolve();
      await release.promise;
    };

    const syncPromise = realSynchronize(db, {
      pull: (): Promise<SyncPullResult> =>
        Promise.resolve({
          changes: {
            accounts: {
              created: [],
              updated: [echoA, echoB],
              deleted: [],
            },
          },
          timestamp: ++syncFixtureControls.mockNextWatermark,
        }),
    });

    await reached.promise;

    // AT THE SERVER SEAM the local rows are the pending ones and STILL DIRTY:
    // the positive count/id ACK has not happened yet.
    const atBarrier = await db.get<Account>("accounts").query().fetch();
    const barrierA = atBarrier.find(
      (account) => account.id === accountA.accountId
    );
    const barrierB = atBarrier.find(
      (account) => account.id === accountB.accountId
    );
    expect(barrierA?.isDefault).toBe(false);
    expect(barrierB?.isDefault).toBe(true);
    expect(barrierA?._raw._status).toBe("updated");
    expect(barrierB?._raw._status).toBe("updated");

    release.resolve();
    await syncPromise;

    // The owner-filtered UPDATE cleared the previous default before it set
    // the new one, and no account was ever upserted.
    const accountUpdates = mockUpdates.filter(
      (update) => update.table === "accounts"
    );
    const clearIndex = accountUpdates.findIndex(
      (update) => update.values.is_default === false
    );
    const setIndex = accountUpdates.findIndex(
      (update) => update.values.is_default === true
    );
    expect(clearIndex).toBeGreaterThanOrEqual(0);
    expect(setIndex).toBeGreaterThan(clearIndex);
    for (const update of accountUpdates) {
      expect(update.filters.user_id).toBe(OWNER);
    }
    expect(
      mockUpserts.filter((upsert) => upsert.table === "accounts")
    ).toHaveLength(0);

    const after = await accountsOf(db);
    expect(
      after.find((account) => account.id === accountB.accountId)?.isDefault
    ).toBe(true);
  });

  it("keeps both rows dirty when the set UPDATE fails after the clear and lands it on the retry", async (): Promise<void> => {
    const accountA = await commitAdd(ledger.database, "Default A", "0", true);
    await acceptThenAck(ledger.database, accountA);
    const accountB = await commitAdd(ledger.database, "Other B", "0", false);
    await acceptThenAck(ledger.database, accountB);

    const db = await coldRestart();
    const edited = await editAccount(db, accountB.accountId, {
      name: "Other B",
      balance: 0,
      isDefault: true,
    });
    expect(edited.success).toBe(true);

    // The server enforces a single default and the set for B fails once,
    // after the clear for A already succeeded.
    syncFixtureControls.mockEnforceRemoteDefaultUnique = true;
    syncFixtureControls.mockRemoteDefaultAccountId = accountA.accountId;
    syncFixtureControls.failAccountMetadataUpdateOnceForId = accountB.accountId;

    const echoA = await cloudAccount(db, accountA.accountId, {
      is_default: true,
    });
    const echoB = await cloudAccount(db, accountB.accountId, {
      is_default: false,
    });

    await expect(
      realSynchronize(db, {
        pull: (): Promise<SyncPullResult> =>
          Promise.resolve({
            changes: {
              accounts: {
                created: [],
                updated: [echoA, echoB],
                deleted: [],
              },
            },
            timestamp: ++syncFixtureControls.mockNextWatermark,
          }),
      })
    ).rejects.toThrow();

    // Both rows are still dirty and the remote default was cleared by the
    // successful clear, so the set is still pending.
    const afterFailure = await db.get<Account>("accounts").query().fetch();
    expect(
      afterFailure.find((account) => account.id === accountA.accountId)?._raw
        ._status
    ).toBe("updated");
    expect(
      afterFailure.find((account) => account.id === accountB.accountId)?._raw
        ._status
    ).toBe("updated");
    expect(
      afterFailure.find((account) => account.id === accountB.accountId)
        ?.isDefault
    ).toBe(true);
    expect(syncFixtureControls.mockRemoteDefaultAccountId).toBeNull();

    // The retry uses the actual result map: the cloud now reports A false and
    // B false, and the real UPDATE lands the set.
    const retryEchoA = await cloudAccount(db, accountA.accountId, {
      is_default: false,
    });
    const retryEchoB = await cloudAccount(db, accountB.accountId, {
      is_default: false,
    });
    await realSynchronize(db, {
      pull: (): Promise<SyncPullResult> =>
        Promise.resolve({
          changes: {
            accounts: {
              created: [],
              updated: [retryEchoA, retryEchoB],
              deleted: [],
            },
          },
          timestamp: ++syncFixtureControls.mockNextWatermark,
        }),
    });

    expect(syncFixtureControls.mockRemoteDefaultAccountId).toBe(
      accountB.accountId
    );
    const afterRetry = await accountsOf(db);
    expect(
      afterRetry.find((account) => account.id === accountB.accountId)?.isDefault
    ).toBe(true);
    expect(afterRetry.filter((account) => account.isDefault)).toHaveLength(1);
    expect(
      mockUpserts.filter((upsert) => upsert.table === "accounts")
    ).toHaveLength(0);
  });

  it("keeps the pending local default authoritative while the server has not applied anything yet", async (): Promise<void> => {
    const accountA = await commitAdd(ledger.database, "Default A", "0", true);
    await acceptThenAck(ledger.database, accountA);
    const accountB = await commitAdd(ledger.database, "Other B", "0", false);
    await acceptThenAck(ledger.database, accountB);

    const db = await coldRestart();
    const before = await accountsOf(db);
    const balanceBefore = before.map((account) => account.balance);
    const revisionBefore = before.map((account) => account.financialRevision);

    const edited = await editAccount(db, accountB.accountId, {
      name: "Other B",
      balance: 0,
      isDefault: true,
    });
    expect(edited.success).toBe(true);

    // The server has not applied anything yet: it still reports the previous
    // default and the other account as not default.
    const echoA = await cloudAccount(db, accountA.accountId, {
      is_default: true,
    });
    const echoB = await cloudAccount(db, accountB.accountId, {
      is_default: false,
    });

    // At the pull barrier the pending rows are still dirty: the local value
    // is what the owner's UPDATE will carry.
    let dirtyAtBarrier: readonly string[] = [];
    let pendingAtBarrier: readonly boolean[] = [];
    const pull = (): Promise<SyncPullResult> => {
      const rows = db.get<Account>("accounts").query();
      return rows.fetch().then((accounts) => {
        dirtyAtBarrier = accounts
          .filter((account) => account._raw._status === "updated")
          .map((account) => account.id);
        pendingAtBarrier = accounts.map((account) => account.isDefault);
        return Promise.resolve({
          changes: {
            accounts: {
              created: [],
              updated: [echoA, echoB],
              deleted: [],
            },
          },
          timestamp: ++syncFixtureControls.mockNextWatermark,
        });
      });
    };

    await realSynchronize(db, { pull });

    expect(dirtyAtBarrier).toEqual(
      expect.arrayContaining([accountA.accountId, accountB.accountId])
    );
    expect(pendingAtBarrier).toEqual([false, true]);

    // The owner's UPDATE is owner-filtered, clears the previous default
    // before it sets the new one, and never upserts an account.
    const accountUpdates = mockUpdates.filter(
      (update) => update.table === "accounts"
    );
    expect(accountUpdates.length).toBeGreaterThanOrEqual(2);
    for (const update of accountUpdates) {
      expect(update.filters.user_id).toBe(OWNER);
    }
    const clearIndex = accountUpdates.findIndex(
      (update) => update.values.is_default === false
    );
    const setIndex = accountUpdates.findIndex(
      (update) => update.values.is_default === true
    );
    expect(clearIndex).toBeGreaterThanOrEqual(0);
    expect(setIndex).toBeGreaterThan(clearIndex);
    expect(
      mockUpserts.filter((upsert) => upsert.table === "accounts")
    ).toHaveLength(0);

    // The local pending value stays authoritative.
    const after = await accountsOf(db);
    expect(
      after.find((account) => account.id === accountB.accountId)?.isDefault
    ).toBe(true);

    // Amounts, revisions and the action log are untouched by the metadata
    // path.
    expect(after.map((account) => account.balance)).toEqual(balanceBefore);
    expect(after.map((account) => account.financialRevision)).toEqual(
      revisionBefore
    );
  });

  it("still refuses a cloud echo that diverges on a non-dirty financial field", async (): Promise<void> => {
    const accountA = await commitAdd(ledger.database, "Default A", "0", true);
    await acceptThenAck(ledger.database, accountA);
    const accountB = await commitAdd(ledger.database, "Other B", "0", false);
    await acceptThenAck(ledger.database, accountB);

    const db = await coldRestart();
    await editAccount(db, accountB.accountId, {
      name: "Other B",
      balance: 0,
      isDefault: true,
    });

    const diverged = await cloudAccount(db, accountA.accountId, {
      is_default: false,
      balance: 4242,
    });

    await expect(
      realSynchronize(db, {
        pull: (): Promise<SyncPullResult> =>
          Promise.resolve({
            changes: {
              accounts: {
                created: [],
                updated: [diverged],
                deleted: [],
              },
            },
            timestamp: ++syncFixtureControls.mockNextWatermark,
          }),
      })
    ).rejects.toThrow(
      /account_sync_pull_(default_conflict|unresolved_local_postimage)/
    );
  });
});
