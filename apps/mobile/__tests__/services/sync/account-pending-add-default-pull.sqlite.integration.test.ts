/**
 * #395 pending Add prior-default pull admission.
 *
 * Real SQLite ledger, installed SDK, real Add command, real protection catalog
 * and the production push service. Only the outer server transport and the
 * authenticated actor are doubled, exactly like the existing Add suites.
 *
 * The device failure these cases reproduce: a pending (local_complete)
 * account.create-default/v1 Add owns its optimistic prior-default clear, the
 * cloud still reports that prior account as default, and the ordinary stock
 * pull guard aborted the whole sync BEFORE the Add's own authoritative RPC
 * could run.
 */
import {
  FOREIGN,
  OWNER,
  acceptThenAck,
  accepted,
  actionCoordinator,
  cloudAccount,
  coldRestart,
  commitAdd,
  hashProvider,
  ledger,
  mockFinancialTransport,
  mockUpdates,
  mockUpserts,
  noPrivateNetworkBytes,
  ownedRoot,
  randomUUID,
  realSynchronize,
  syncFixtureControls,
  tableUpdated,
  type Account,
  type SyncPullResult,
} from "./account-create-default-sync-lifecycle-fixtures";
import { hashAccountReviewLocalPostimage } from "@/services/account-review-local-snapshot-postimages";
import {
  buildPendingAddPriorDefaultProofs,
  isPendingAddRootState,
} from "@/services/sync/pending-add-default-pull";
import { validateAccountCreateDefaultPayload } from "../../../../../packages/logic/src/financial-actions/account-create-default";
import { inspectAccountCreateDefaultLocalRecoverySnapshot } from "../../../../../packages/logic/src/financial-actions/account-create-default-local-recovery";

async function seedPriorDefault(): Promise<Account> {
  const row = await ledger.database.write(() =>
    ledger.database.get<Account>("accounts").create((account) => {
      account._raw.id = randomUUID();
      account.userId = OWNER;
      account.name = "Prior Default Cash";
      account.type = "CASH";
      account.currency = "EGP";
      account.balance = 0;
      account.financialRevision = "0";
      account.isDefault = true;
      account.deleted = false;
    })
  );
  // The prior default is a clean, fully synced owned row.
  await realSynchronize(ledger.database);
  expect(row._raw._status).toBe("synced");
  return row;
}

function cloudPull(
  row: Readonly<Record<string, unknown>>
): () => Promise<SyncPullResult> {
  return (): Promise<SyncPullResult> =>
    Promise.resolve({
      changes: { accounts: tableUpdated(row) },
      timestamp: syncFixtureControls.mockNextWatermark + 1,
    });
}

describe("#395 pending Add prior-default pull admission", () => {
  it("P1 a pending Add's own prior-default clear reaches the real RPC transport instead of aborting the pull", async () => {
    const prior = await seedPriorDefault();
    const command = await commitAdd(
      ledger.database,
      "Pending Default Cash",
      "0",
      true,
      "CASH"
    );
    const root = await ownedRoot(ledger.database, command.envelope.actionId);
    expect(root.state).toBe("local_complete");

    const pending = await ledger.database
      .get<Account>("accounts")
      .find(prior.id);
    expect(pending.isDefault).toBe(false);
    expect(pending._raw._status).toBe("updated");
    expect(pending._raw._changed.split(",").sort()).toEqual([
      "is_default",
      "updated_at",
    ]);

    // The cloud still reports the captured default: the Add RPC has not run.
    const cloudPrior = await cloudAccount(ledger.database, prior.id, {
      is_default: true,
    });
    mockFinancialTransport.length = 0;
    mockUpserts.length = 0;
    mockUpdates.length = 0;

    await realSynchronize(ledger.database, { pull: cloudPull(cloudPrior) });

    // The Add's own authoritative RPC is the only authority for that clear.
    expect(mockFinancialTransport).toHaveLength(1);
    const acceptedRoot = await ownedRoot(
      ledger.database,
      command.envelope.actionId
    );
    expect(mockFinancialTransport[0]?.payloadHash).toBe(
      acceptedRoot.payloadHash
    );
    // No generic accounts UPSERT and no independent default-clear UPDATE.
    expect(mockUpserts.filter((entry) => entry.table === "accounts")).toEqual(
      []
    );
    expect(mockUpdates.filter((entry) => entry.table === "accounts")).toEqual(
      []
    );
    const after = await ledger.database.get<Account>("accounts").find(prior.id);
    expect(after.isDefault).toBe(false);
    expect(after._raw._status).toBe("synced");
    expect(after._raw._changed).toBe("");
    noPrivateNetworkBytes();
  });

  it("P2 the proven pending clear survives a cold reload", async () => {
    const prior = await seedPriorDefault();
    await commitAdd(ledger.database, "Pending Default Cash", "0", true, "CASH");
    const db = await coldRestart();
    const pending = await db.get<Account>("accounts").find(prior.id);
    expect(pending.isDefault).toBe(false);
    expect(pending._raw._status).toBe("updated");

    const cloudPrior = await cloudAccount(db, prior.id, { is_default: true });
    mockFinancialTransport.length = 0;
    mockUpserts.length = 0;
    mockUpdates.length = 0;

    await realSynchronize(db, { pull: cloudPull(cloudPrior) });

    expect(mockFinancialTransport).toHaveLength(1);
    expect(mockUpserts.filter((entry) => entry.table === "accounts")).toEqual(
      []
    );
    expect(mockUpdates.filter((entry) => entry.table === "accounts")).toEqual(
      []
    );
    const after = await db.get<Account>("accounts").find(prior.id);
    expect(after.isDefault).toBe(false);
    noPrivateNetworkBytes();
  });

  it("P3 a user edit after the Add's clear keeps the ordinary guard", async () => {
    const prior = await seedPriorDefault();
    await commitAdd(ledger.database, "Pending Default Cash", "0", true, "CASH");
    const pending = await ledger.database
      .get<Account>("accounts")
      .find(prior.id);
    await ledger.database.write(() =>
      pending.update((account) => {
        account.name = "Renamed after the pending clear";
      })
    );
    expect(pending._raw._changed.split(",")).toContain("name");

    const cloudPrior = await cloudAccount(ledger.database, prior.id, {
      is_default: true,
    });
    mockFinancialTransport.length = 0;

    await expect(
      realSynchronize(ledger.database, { pull: cloudPull(cloudPrior) })
    ).rejects.toThrow("account_sync_pull_default_conflict");
    expect(mockFinancialTransport).toEqual([]);
    const after = await ledger.database.get<Account>("accounts").find(prior.id);
    expect(after.isDefault).toBe(false);
    expect(after._raw._status).toBe("updated");
  });

  it("P4 a diverged financial core on the remote row keeps the ordinary guard", async () => {
    const prior = await seedPriorDefault();
    await commitAdd(ledger.database, "Pending Default Cash", "0", true, "CASH");
    const cloudPrior = await cloudAccount(ledger.database, prior.id, {
      is_default: true,
      balance: 4242,
    });
    mockFinancialTransport.length = 0;

    await expect(
      realSynchronize(ledger.database, { pull: cloudPull(cloudPrior) })
    ).rejects.toThrow("account_sync_pull_default_conflict");
    expect(mockFinancialTransport).toEqual([]);
  });

  it("P5 a foreign remote row keeps the ordinary guard", async () => {
    const prior = await seedPriorDefault();
    await commitAdd(ledger.database, "Pending Default Cash", "0", true, "CASH");
    const cloudPrior = await cloudAccount(ledger.database, prior.id, {
      is_default: true,
      user_id: FOREIGN,
    });
    mockFinancialTransport.length = 0;

    await expect(
      realSynchronize(ledger.database, { pull: cloudPull(cloudPrior) })
    ).rejects.toThrow("account_sync_pull_default_conflict");
    expect(mockFinancialTransport).toEqual([]);
  });

  it("P6 a failing Add RPC fails the sync, retains the pending clear, and a same-session retry succeeds", async () => {
    const prior = await seedPriorDefault();
    await commitAdd(ledger.database, "Pending Default Cash", "0", true, "CASH");
    const cloudPrior = await cloudAccount(ledger.database, prior.id, {
      is_default: true,
    });
    const failing = actionCoordinator(
      ledger.database,
      (): Promise<unknown> =>
        Promise.reject(new Error("account_financial_action_rpc_failed"))
    );
    mockFinancialTransport.length = 0;

    await expect(
      realSynchronize(ledger.database, {
        pull: cloudPull(cloudPrior),
        coordinator: failing,
      })
    ).rejects.toThrow();
    const afterFailure = await ledger.database
      .get<Account>("accounts")
      .find(prior.id);
    expect(afterFailure.isDefault).toBe(false);
    expect(afterFailure._raw._status).toBe("updated");
    expect(afterFailure._raw._changed.split(",")).toContain("is_default");

    // Same session retry: the Add's own RPC is the only authority.
    mockFinancialTransport.length = 0;
    await realSynchronize(ledger.database, { pull: cloudPull(cloudPrior) });
    expect(mockFinancialTransport).toHaveLength(1);
    const afterRetry = await ledger.database
      .get<Account>("accounts")
      .find(prior.id);
    expect(afterRetry.isDefault).toBe(false);
    expect(afterRetry._raw._status).toBe("synced");
    expect(afterRetry._raw._changed).toBe("");
  });

  it("P7 an equal false echo is never an acknowledgement: the original RPC decides and the pending clear is retained", async () => {
    const prior = await seedPriorDefault();
    await commitAdd(ledger.database, "Pending Default Cash", "0", true, "CASH");
    // The cloud already echoes the same clear on the UNMODIFIED physical row.
    const cloudPrior = await cloudAccount(ledger.database, prior.id, {
      is_default: false,
    });
    const failing = actionCoordinator(
      ledger.database,
      (): Promise<unknown> =>
        Promise.reject(new Error("account_financial_action_rpc_failed"))
    );
    mockFinancialTransport.length = 0;

    await expect(
      realSynchronize(ledger.database, {
        pull: cloudPull(cloudPrior),
        coordinator: failing,
      })
    ).rejects.toThrow();
    const afterFailure = await ledger.database
      .get<Account>("accounts")
      .find(prior.id);
    expect(afterFailure.isDefault).toBe(false);
    expect(afterFailure._raw._status).toBe("updated");
    expect(afterFailure._raw._changed.split(",")).toContain("is_default");

    // The same positive proof still routes the row to the original RPC.
    mockFinancialTransport.length = 0;
    await realSynchronize(ledger.database, { pull: cloudPull(cloudPrior) });
    expect(mockFinancialTransport).toHaveLength(1);
    const afterRetry = await ledger.database
      .get<Account>("accounts")
      .find(prior.id);
    expect(afterRetry.isDefault).toBe(false);
    expect(afterRetry._raw._status).toBe("synced");
  });

  it("P10 an overlapping unresolved clear claim on the same account is never borrowed", async () => {
    const prior = await seedPriorDefault();
    const command = await commitAdd(
      ledger.database,
      "Pending Default Cash",
      "0",
      true,
      "CASH"
    );
    const root = await ownedRoot(ledger.database, command.envelope.actionId);
    if (!isPendingAddRootState(root.state)) {
      throw new Error("unexpected_pending_root_state");
    }
    if (root.localRecoverySnapshotJson === null) {
      throw new Error("missing_private_recovery_snapshot");
    }
    const snapshot = inspectAccountCreateDefaultLocalRecoverySnapshot(
      JSON.parse(root.localRecoverySnapshotJson)
    );
    const parsed: unknown = JSON.parse(root.payloadJson);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      !("payload" in parsed)
    ) {
      throw new Error("invalid_owned_root_envelope");
    }
    const payload = validateAccountCreateDefaultPayload(parsed.payload);
    const priorRow = await ledger.database
      .get<Account>("accounts")
      .find(prior.id);
    const physicalHash = await hashAccountReviewLocalPostimage({
      table: "accounts",
      id: prior.id,
      raw: priorRow._raw,
      hashProvider,
    });
    const row = {
      id: priorRow.id,
      userId: priorRow.userId,
      deleted: priorRow.deleted,
      isDefault: priorRow.isDefault,
      type: priorRow.type,
      currency: priorRow.currency,
      financialRevision: priorRow.financialRevision,
      createdAt: priorRow.createdAt.getTime(),
      status: priorRow._raw._status,
      changedColumns: priorRow._raw._changed.split(","),
      physicalHash,
      physicalFields: Object.fromEntries(
        Object.entries(priorRow._raw).filter(
          ([key]) => key !== "_status" && key !== "_changed"
        )
      ),
    };
    const candidate = {
      actionId: root.actionId,
      physicalRootId: root.id,
      payloadHash: root.payloadHash,
      rootState: root.state,
      payload,
      snapshot,
    };
    const loadPriorAccount = (): Promise<typeof row> => Promise.resolve(row);

    const single = await buildPendingAddPriorDefaultProofs({
      candidates: [candidate],
      unresolvedClaims: new Map([[prior.id, [root.actionId]]]),
      losingAccountIds: new Set<string>(),
      acceptedCreatorIdentities: new Map(),
      expectedOwnerId: OWNER,
      loadPriorAccount,
    });
    expect(single.has(prior.id)).toBe(true);

    // A second unresolved root claiming the same account is ambiguity.
    const overlapping = await buildPendingAddPriorDefaultProofs({
      candidates: [candidate],
      unresolvedClaims: new Map([
        [prior.id, [root.actionId, "another-unresolved-action"]],
      ]),
      losingAccountIds: new Set<string>(),
      acceptedCreatorIdentities: new Map(),
      expectedOwnerId: OWNER,
      loadPriorAccount,
    });
    expect(overlapping.size).toBe(0);

    // A hash mismatch never yields a proof either.
    const mismatched = await buildPendingAddPriorDefaultProofs({
      candidates: [candidate],
      unresolvedClaims: new Map([[prior.id, [root.actionId]]]),
      losingAccountIds: new Set<string>(),
      acceptedCreatorIdentities: new Map(),
      expectedOwnerId: OWNER,
      loadPriorAccount: (): Promise<typeof row> =>
        Promise.resolve({ ...row, physicalHash: "0".repeat(64) }),
    });
    expect(mismatched.size).toBe(0);
  });

  it("P8 a prior default created by an earlier accepted Add, with an accepted clear history, stays admissible", async () => {
    const original = await seedPriorDefault();
    const acceptedAdd = await commitAdd(
      ledger.database,
      "Accepted Default Cash",
      "0",
      true,
      "CASH"
    );
    await acceptThenAck(ledger.database, acceptedAdd);
    // The accepted Add owns the old accepted clear history.
    const historical = await ledger.database
      .get<Account>("accounts")
      .find(original.id);
    expect(historical.isDefault).toBe(false);

    const pendingAdd = await commitAdd(
      ledger.database,
      "Later Pending Cash",
      "0",
      true,
      "CASH"
    );
    const pendingRoot = await ownedRoot(
      ledger.database,
      pendingAdd.envelope.actionId
    );
    expect(pendingRoot.state).toBe("local_complete");

    const prior = await ledger.database
      .get<Account>("accounts")
      .find(acceptedAdd.accountId);
    expect(prior.isDefault).toBe(false);
    expect(prior._raw._status).toBe("updated");

    const cloudPrior = await cloudAccount(ledger.database, prior.id, {
      is_default: true,
    });
    mockFinancialTransport.length = 0;
    mockUpserts.length = 0;
    mockUpdates.length = 0;

    await realSynchronize(ledger.database, { pull: cloudPull(cloudPrior) });

    expect(mockFinancialTransport).toHaveLength(1);
    expect(mockFinancialTransport[0]?.payloadHash).toBe(
      pendingRoot.payloadHash
    );
    expect(mockUpserts.filter((entry) => entry.table === "accounts")).toEqual(
      []
    );
    expect(
      mockUpdates.filter(
        (entry) => entry.table === "accounts" && "is_default" in entry.values
      )
    ).toEqual([]);
    const after = await ledger.database.get<Account>("accounts").find(prior.id);
    expect(after.isDefault).toBe(false);
    expect(after._raw._status).toBe("synced");
    noPrivateNetworkBytes();
  });

  it("P9 a nonzero opening Add with a created metadata edit before the first ACK keeps the original RPC as the sole authority", async () => {
    const prior = await seedPriorDefault();
    const command = await commitAdd(
      ledger.database,
      "Funded Pending Cash",
      "250",
      true,
      "CASH"
    );
    expect(command.effectId).toBeTruthy();

    // A legitimate created-metadata edit before the first ACK: the created
    // account's physical image no longer matches the private snapshot.
    const created = await ledger.database
      .get<Account>("accounts")
      .find(command.accountId);
    await ledger.database.write(() =>
      created.update((account) => {
        account.name = "Renamed before the first ACK";
      })
    );

    const cloudPrior = await cloudAccount(ledger.database, prior.id, {
      is_default: true,
    });
    mockFinancialTransport.length = 0;
    mockUpserts.length = 0;
    mockUpdates.length = 0;

    await realSynchronize(ledger.database, {
      pull: cloudPull(cloudPrior),
      coordinator: actionCoordinator(
        ledger.database,
        (): Promise<unknown> => Promise.resolve(accepted(command))
      ),
    });

    // The original financial RPC is the sole authority for that Add.
    expect(mockFinancialTransport).toHaveLength(1);
    const pendingRoot = await ownedRoot(
      ledger.database,
      command.envelope.actionId
    );
    expect(mockFinancialTransport[0]?.payloadHash).toBe(
      pendingRoot.payloadHash
    );
    expect(mockUpserts.filter((entry) => entry.table === "accounts")).toEqual(
      []
    );
    expect(
      mockUpdates.filter(
        (entry) => entry.table === "accounts" && "is_default" in entry.values
      )
    ).toEqual([]);
    const after = await ledger.database.get<Account>("accounts").find(prior.id);
    expect(after.isDefault).toBe(false);
    expect(after._raw._status).toBe("synced");
    const createdAfter = await ledger.database
      .get<Account>("accounts")
      .find(command.accountId);
    expect(createdAfter.name).toBe("Renamed before the first ACK");
    noPrivateNetworkBytes();
  });
});
