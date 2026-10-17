/**
 * #395 T069 — extracted real SDK synchronization, pull/ACK and guarded recovery cases from the original genuine
 * SDK/SQLite lifecycle suite. Original assertions and case order retained;
 * shared real-Watermelon fixture registers the same setup/mocks per suite.
 * AUTHORED ONLY — NOT RUN. No emulator/native or DB execution.
 */
import {
  Q,
  applyDeferredRejections,
  serializeCanonicalJsonValue,
  assertNoDuplicateAddAccountIdentity,
  createAccountDefaultIntentService,
  createFinancialActionSyncService,
  productionFinancialActionReconciliationService,
  getCurrentUserDataScope,
  assertExpectedCurrentUser,
  randomUUID,
  OWNER,
  FOREIGN,
  mockUpserts,
  mockUpdates,
  mockFinancialTransport,
  ledger,
  hashProvider,
  form,
  foundation,
  commitAdd,
  ownedRoot,
  accepted,
  rejected,
  actionCoordinator,
  realSynchronize,
  acceptThenAck,
  outboundTouchesIds,
  noPrivateNetworkBytes,
  coldRestart,
  cloudAccount,
  tableUpdated,
  markRejected,
  syncFixtureControls,
  type SyncPullResult,
  type Account,
  type FinancialActionGroup,
  type CanonicalJsonValue,
  type AccountDefaultPreparedCommand,
} from "./account-create-default-sync-lifecycle-fixtures";

describe("#395 T069 — real SDK synchronization, pull/ACK and guarded recovery", () => {
  it("S15 accepted root account echo before SDK ACK is admitted by same bound canonical postimage", async () => {
    const command = await commitAdd(
      ledger.database,
      "Not Yet ACKed",
      "0",
      false,
      "CASH"
    );
    await createFinancialActionSyncService({
      foundationRepository: foundation(ledger.database),
      invokeAccountFinancialActionRpc: (): Promise<unknown> =>
        Promise.resolve(accepted(command)),
    }).syncAction(command.envelope.actionId);
    const row = await ledger.database
      .get<Account>("accounts")
      .find(command.accountId);
    expect(row._raw._status).toBe("created");
    const canonicalEcho = await cloudAccount(
      ledger.database,
      command.accountId,
      {}
    );
    await realSynchronize(ledger.database, {
      pull: (): Promise<SyncPullResult> =>
        Promise.resolve({
          changes: { accounts: tableUpdated(canonicalEcho) },
          timestamp: ++syncFixtureControls.mockNextWatermark,
        }),
    });
    expect(
      (await ownedRoot(ledger.database, command.envelope.actionId)).state
    ).toBe("accepted");
    const current = await ledger.database
      .get<Account>("accounts")
      .find(command.accountId);
    expect(current.isDefault).toBe(true);
    expect(current.name).toBe("Not Yet ACKed");
    expect(current._raw._status).toBe("synced");
    noPrivateNetworkBytes();
  });

  it("S16 an accepted Add root does not turn an unproven different cloud account amount/name into a safe replay", async () => {
    const command = await commitAdd(
      ledger.database,
      "Locally Accepted",
      "0",
      false,
      "CASH"
    );
    await createFinancialActionSyncService({
      foundationRepository: foundation(ledger.database),
      invokeAccountFinancialActionRpc: (): Promise<unknown> =>
        Promise.resolve(accepted(command)),
    }).syncAction(command.envelope.actionId);
    const forgedCloudPostimage = await cloudAccount(
      ledger.database,
      command.accountId,
      { name: "Not canonical", is_default: false, balance: 99 }
    );
    let checkpoint: number | null | undefined;
    await expect(
      realSynchronize(ledger.database, {
        pull: ({ lastPulledAt }): Promise<SyncPullResult> => {
          checkpoint = lastPulledAt;
          return Promise.resolve({
            changes: {
              accounts: tableUpdated(forgedCloudPostimage),
            },
            timestamp: ++syncFixtureControls.mockNextWatermark,
          });
        },
      })
    ).rejects.toThrow();
    const row = await ledger.database
      .get<Account>("accounts")
      .find(command.accountId);
    expect(row.balance).toBe(0);
    expect(row.name).toBe("Locally Accepted");
    expect(row._raw._status).not.toBe("synced");
    let next: number | null | undefined;
    await realSynchronize(ledger.database, {
      pull: ({ lastPulledAt }): Promise<SyncPullResult> => {
        next = lastPulledAt;
        return Promise.resolve({
          changes: {},
          timestamp: ++syncFixtureControls.mockNextWatermark,
        });
      },
    });
    expect(next).toBe(checkpoint);
  });

  it("S03 the real SDK final ACK refuses a captured A change when authenticated owner becomes B after push returns", async () => {
    const command = await commitAdd(
      ledger.database,
      "Owner Race",
      "0",
      true,
      "CASH"
    );
    await createFinancialActionSyncService({
      foundationRepository: foundation(ledger.database),
      invokeAccountFinancialActionRpc: (): Promise<unknown> =>
        Promise.resolve(accepted(command)),
    }).syncAction(command.envelope.actionId);
    let pushCompleted = false;
    await expect(
      realSynchronize(ledger.database, {
        afterPush: (): void => {
          pushCompleted = true;
          syncFixtureControls.mockActiveOwner = FOREIGN;
        },
      })
    ).rejects.toThrow();
    expect(pushCompleted).toBe(true);
    syncFixtureControls.mockActiveOwner = OWNER;
    const account = await ledger.database
      .get<Account>("accounts")
      .find(command.accountId);
    expect(account._raw._status).not.toBe("synced");
    expect(
      (await ownedRoot(ledger.database, command.envelope.actionId)).userId
    ).toBe(OWNER);
    noPrivateNetworkBytes();
  });

  it("S04 real concurrent Add waits until pull/ACK lease releases; no stale default flag or lost owned mutation", async () => {
    const a = await commitAdd(ledger.database, "Default A", "0", false, "CASH");
    await acceptThenAck(ledger.database, a);
    const remotePrior = await cloudAccount(ledger.database, a.accountId, {
      name: "cloud metadata A",
      is_default: true,
    });
    let capturedWatermark: number | null | undefined;
    let readQueuedAdd: () => Promise<AccountDefaultPreparedCommand> | null =
      () => null;
    let writerEnteredDuringPull = false;
    await realSynchronize(ledger.database, {
      pull: async ({ lastPulledAt }): Promise<SyncPullResult> => {
        capturedWatermark = lastPulledAt;
        // Independent UI attempt, not an awaited Add writer INSIDE the pull
        // callback. The same opaque capability serializes it AFTER SDK ACK.
        const pending = commitAdd(
          ledger.database,
          "Default B",
          "0",
          true,
          "BANK"
        ).then((command) => {
          writerEnteredDuringPull = true;
          return command;
        });
        readQueuedAdd = () => pending;
        await Promise.resolve();
        expect(writerEnteredDuringPull).toBe(false);
        return {
          changes: { accounts: tableUpdated(remotePrior) },
          timestamp: ++syncFixtureControls.mockNextWatermark,
        };
      },
    });
    const pendingSuccessor = readQueuedAdd();
    if (!pendingSuccessor) throw new Error("missing_queued_add_command");
    const successor = await pendingSuccessor;
    expect(writerEnteredDuringPull).toBe(true);
    const currentA = await ledger.database
      .get<Account>("accounts")
      .find(a.accountId);
    const currentB = await ledger.database
      .get<Account>("accounts")
      .find(successor.accountId);
    expect(currentA.name).toBe("cloud metadata A");
    expect(currentA.isDefault).toBe(false);
    expect(currentB.isDefault).toBe(true);
    let nextWatermark: number | null | undefined;
    await realSynchronize(ledger.database, {
      pull: ({ lastPulledAt }): Promise<SyncPullResult> => {
        nextWatermark = lastPulledAt;
        return Promise.resolve({
          changes: {},
          timestamp: ++syncFixtureControls.mockNextWatermark,
        });
      },
    });
    expect(nextWatermark).not.toBe(capturedWatermark);
    noPrivateNetworkBytes();
  });

  it("S05 a pull auth switch after an external snapshot must not apply remote account data or advance the SDK watermark", async () => {
    const command = await commitAdd(
      ledger.database,
      "Private Cash",
      "0",
      false,
      "CASH"
    );
    await acceptThenAck(ledger.database, command);
    const db = await coldRestart();
    const incoming = await cloudAccount(db, command.accountId, {
      name: "foreign-scope-projection",
    });
    let beforeCheckpoint: number | null | undefined;
    await expect(
      realSynchronize(db, {
        pull: ({ lastPulledAt }): Promise<SyncPullResult> => {
          beforeCheckpoint = lastPulledAt;
          syncFixtureControls.mockActiveOwner = FOREIGN;
          return Promise.resolve({
            changes: { accounts: tableUpdated(incoming) },
            timestamp: ++syncFixtureControls.mockNextWatermark,
          });
        },
      })
    ).rejects.toThrow();
    syncFixtureControls.mockActiveOwner = OWNER;
    const after = await db.get<Account>("accounts").find(command.accountId);
    expect(after.name).toBe("Private Cash");
    let nextCheckpoint: number | null | undefined;
    await realSynchronize(db, {
      pull: ({ lastPulledAt }): Promise<SyncPullResult> => {
        nextCheckpoint = lastPulledAt;
        return Promise.resolve({
          changes: {},
          timestamp: ++syncFixtureControls.mockNextWatermark,
        });
      },
    });
    expect(nextCheckpoint).toBe(beforeCheckpoint);
  });

  it("S06 accepted predecessor A authorizes B's exact immutable RPC before A's account metadata has been SDK-ACKed", async () => {
    const a = await commitAdd(
      ledger.database,
      "Predecessor Cash",
      "0",
      false,
      "CASH"
    );
    const b = await commitAdd(
      ledger.database,
      "Dependent Bank",
      "0",
      true,
      "BANK"
    );
    const aRoot = await ownedRoot(ledger.database, a.envelope.actionId);
    const bRoot = await ownedRoot(ledger.database, b.envelope.actionId);
    const originalB = {
      hash: bRoot.payloadHash,
      json: bRoot.payloadJson,
    };
    const sent: Array<{ readonly hash: string; readonly json: string }> = [];
    const sync = createFinancialActionSyncService({
      foundationRepository: foundation(ledger.database),
      invokeAccountFinancialActionRpc: (request): Promise<unknown> => {
        sent.push({ hash: request.payloadHash, json: request.payloadJson });
        return Promise.resolve(
          request.payloadHash === aRoot.payloadHash ? accepted(a) : accepted(b)
        );
      },
    });
    await sync.syncAction(a.envelope.actionId);
    expect((await ownedRoot(ledger.database, a.envelope.actionId)).state).toBe(
      "accepted"
    );
    const accountA = await ledger.database
      .get<Account>("accounts")
      .find(a.accountId);
    expect(accountA._raw._status).not.toBe("synced");
    await sync.syncAction(b.envelope.actionId);
    expect(sent).toEqual([
      { hash: aRoot.payloadHash, json: aRoot.payloadJson },
      { hash: originalB.hash, json: originalB.json },
    ]);
    expect((await ownedRoot(ledger.database, b.envelope.actionId)).state).toBe(
      "accepted"
    );
  });

  it("S07 rejected Add records its bound rejection inside push but never calls reentrant reconciliation before final SDK ACK", async () => {
    const command = await commitAdd(
      ledger.database,
      "Rejected Cash",
      "0",
      false,
      "CASH"
    );
    let reconciliationInvocationsBeforeAck = 0;
    let observedBeforeAck = false;
    const coordinator = actionCoordinator(
      ledger.database,
      (): Promise<unknown> => Promise.resolve(rejected(command)),
      // Invocation sentinel, never a substitute recovery implementation.
      (): Promise<"incomplete"> => {
        reconciliationInvocationsBeforeAck += 1;
        return Promise.resolve("incomplete");
      }
    );
    await realSynchronize(ledger.database, {
      coordinator,
      afterPush: (): void => {
        observedBeforeAck = true;
        expect(reconciliationInvocationsBeforeAck).toBe(0);
      },
    });
    expect(observedBeforeAck).toBe(true);
    const root = await ownedRoot(ledger.database, command.envelope.actionId);
    // The existing server outcome resolver maps rejected ->
    // reconciliation_incomplete; dedicated recovery is not reentrant.
    expect(root.state).toBe("reconciliation_incomplete");
    expect(root.outcomeJson).toContain('"canonicalDefaultSnapshot"');
    const newAccount = await ledger.database
      .get<Account>("accounts")
      .find(command.accountId);
    expect(newAccount.deleted).toBe(false);
    expect(newAccount._raw._status).not.toBe("synced");
    noPrivateNetworkBytes();
  });

  it("S10 unknown transport completion never triggers compensation or generic ACK of a real Add", async () => {
    const command = await commitAdd(
      ledger.database,
      "Ambiguous Transport",
      "0",
      false,
      "CASH"
    );
    let recoveryEntered = 0;
    const coordinator = actionCoordinator(
      ledger.database,
      (): Promise<never> =>
        Promise.reject(new Error("unknown_network_completion")),
      (): Promise<"incomplete"> => {
        recoveryEntered += 1;
        return Promise.resolve("incomplete");
      }
    );
    await expect(
      realSynchronize(ledger.database, { coordinator })
    ).rejects.toThrow("unknown_network_completion");
    expect(recoveryEntered).toBe(0);
    const root = await ownedRoot(ledger.database, command.envelope.actionId);
    expect(root.state).toBe("sync_failed");
    expect(root.serverOutcome).toBeNull();
    expect(root.localRecoverySnapshotJson).not.toBeNull();
    const account = await ledger.database
      .get<Account>("accounts")
      .find(command.accountId);
    expect(account._raw._status).not.toBe("synced");
    expect(account.deleted).toBe(false);
    noPrivateNetworkBytes();
  });

  it("S11 a genuine newly protected successor arriving after captured push must survive SDK ACK without contaminating the acknowledged predecessor", async () => {
    const a = await commitAdd(
      ledger.database,
      "Original Cash",
      "0",
      false,
      "CASH"
    );
    await createFinancialActionSyncService({
      foundationRepository: foundation(ledger.database),
      invokeAccountFinancialActionRpc: (): Promise<unknown> =>
        Promise.resolve(accepted(a)),
    }).syncAction(a.envelope.actionId);
    const successor: {
      promise: Promise<AccountDefaultPreparedCommand> | null;
    } = { promise: null };
    await realSynchronize(ledger.database, {
      afterPush: async (): Promise<void> => {
        // A concurrent, independently scheduled UI intent cannot enter the
        // Add writer until SDK finishes the captured final ACK.
        successor.promise = commitAdd(
          ledger.database,
          "New protected Bank",
          "0",
          true,
          "BANK"
        );
        const early = await ledger.database
          .get<FinancialActionGroup>("financial_action_groups")
          .query()
          .fetch();
        expect(
          early.filter((r) => r.actionId !== a.envelope.actionId)
        ).toHaveLength(0);
      },
    });
    const pendingSuccessor = successor.promise;
    if (!pendingSuccessor) throw new Error("missing_actual_late_add_writer");
    const b = await pendingSuccessor;
    const bRoot = await ownedRoot(ledger.database, b.envelope.actionId);
    const accountB = await ledger.database
      .get<Account>("accounts")
      .find(b.accountId);
    expect(bRoot.state).toBe("local_complete");
    expect(bRoot._raw._status).toBe("created");
    expect(accountB._raw._status).toBe("created");
    expect(accountB.isDefault).toBe(true);
    const accountA = await ledger.database
      .get<Account>("accounts")
      .find(a.accountId);
    expect(accountA.isDefault).toBe(false);
    expect(accountA._raw._status).not.toBe("synced");
    expect(
      mockFinancialTransport.filter((request) =>
        request.payloadJson.includes(b.envelope.actionId)
      )
    ).toEqual([]);
    noPrivateNetworkBytes();
  });

  it.each(["0", "10.01"])(
    "S08/S17 genuine SQL091 rejected %s Add keeps compensated dirty members protected through clean-root restart",
    async (opening): Promise<void> => {
      const command = await commitAdd(
        ledger.database,
        "Losing Bank",
        opening,
        true,
        "BANK"
      );
      await markRejected(ledger.database, command);
      // Actual dedicated Add recovery, not a fabricated compensation writer.
      // This currently belongs to successor40; Root must classify that Red
      // separately from the sync/ACK work before integrating.
      await expect(
        productionFinancialActionReconciliationService.reconcileRejectedAction(
          command.envelope.actionId
        )
      ).resolves.toBe("reconciled");
      const db = await coldRestart();
      const root = await ownedRoot(db, command.envelope.actionId);
      expect(root.state).toBe("reconciled");
      // S17: locally compensated state does not require premature erasure of
      // the verified 12-key private evidence, and its bound terminal root may
      // ACK without releasing losing account/child/effect dirtiness.
      expect(root.localRecoverySnapshotJson).not.toBeNull();
      const privateEvidence = root.localRecoverySnapshotJson;
      const losing = await db.get<Account>("accounts").find(command.accountId);
      expect(losing.deleted).toBe(true);
      mockUpserts.length = 0;
      mockUpdates.length = 0;
      await realSynchronize(db);
      const unsafe = new Set(
        [
          command.accountId,
          command.bankDetailId,
          ...command.senders.map((s) => s.id),
          command.effectId,
        ].filter((id): id is string => typeof id === "string")
      );
      // Includes soft deletes and query.in("id", [...]) tombstone updates.
      expect(outboundTouchesIds(unsafe)).toBe(false);
      const terminal = await ownedRoot(db, command.envelope.actionId);
      expect(terminal._raw._status).toBe("synced");
      expect(terminal.localRecoverySnapshotJson).toBe(privateEvidence);
      expect(losing._raw._status).not.toBe("synced");
      // Run a *second* real SDK session after reopening the same physical
      // ledger, when the original losing root is no longer in dirty changes.
      // The durable catalog, not the dirty action batch, must still exclude
      // losing created/child/effect rows and locally generated tombstones.
      const restarted = await coldRestart();
      mockUpserts.length = 0;
      mockUpdates.length = 0;
      await realSynchronize(restarted);
      expect(outboundTouchesIds(unsafe)).toBe(false);
      // Recovery-owned losing tombstones may be physical deletes or soft
      // deletes; neither representation is eligible for generic transport.
      noPrivateNetworkBytes();
    }
  );

  it("S20 the deferred A/K hint cannot resolve or compensate authenticated B/K after the original A owner check", async () => {
    const a = await commitAdd(
      ledger.database,
      "Owner A losing Cash",
      "0",
      false,
      "CASH"
    );
    await markRejected(ledger.database, a);
    const rootA = await ownedRoot(ledger.database, a.envelope.actionId);
    expect(rootA.state).toBe("reconciliation_incomplete");

    // Genuine second actor with its *own* immutable Add, using the same
    // action ID but a separate local physical root. No forged root or mocked
    // reconciliation implementation.
    syncFixtureControls.mockActiveOwner = FOREIGN;
    let nextForeignId = 0;
    const foreignService = createAccountDefaultIntentService({
      database: ledger.database,
      getCurrentUserDataScope,
      assertExpectedCurrentUser,
      assertNoDuplicateAccountIdentity: assertNoDuplicateAddAccountIdentity,
      createId: (): string => {
        nextForeignId += 1;
        return nextForeignId === 1 ? a.envelope.actionId : randomUUID();
      },
      now: (): Date => new Date("2026-10-16T11:01:00.000Z"),
      hashProvider,
    });
    const b = await foreignService.prepare(
      FOREIGN,
      form("Owner B losing Cash", "0", false, "CASH")
    );
    await expect(foreignService.commitPrepared(b)).resolves.toMatchObject({
      kind: "committed",
      accountId: b.accountId,
    });
    await createFinancialActionSyncService({
      foundationRepository: foundation(ledger.database),
      invokeAccountFinancialActionRpc: (): Promise<unknown> =>
        Promise.resolve(rejected(b)),
    }).syncAction(b.envelope.actionId);
    const rootsB = await ledger.database
      .get<FinancialActionGroup>("financial_action_groups")
      .query(
        Q.where("action_id", a.envelope.actionId),
        Q.where("user_id", FOREIGN)
      )
      .fetch();
    const foreignRoot = rootsB[0];
    if (!foreignRoot || rootsB.length !== 1)
      throw new Error("missing_genuine_foreign_same_action_root");
    expect(foreignRoot.id).not.toBe(rootA.id);
    expect(foreignRoot.payloadHash).not.toBe(rootA.payloadHash);
    const foreignAccount = await ledger.database
      .get<Account>("accounts")
      .find(b.accountId);
    const beforeRoot = { ...foreignRoot._raw };
    const beforeAccount = { ...foreignAccount._raw };

    syncFixtureControls.mockActiveOwner = OWNER;
    syncFixtureControls.mockAuthReadCount = 0;
    // The first checks belong to A's durable-bound selection, whereas the
    // subsequent dedicated recovery's real authenticated-owner check sees B.
    syncFixtureControls.mockSwitchOwnerOnAuthRead = 3;
    const hint = {
      actionId: rootA.actionId,
      physicalRootId: rootA.id,
      ownerId: OWNER,
      payloadHash: rootA.payloadHash,
      payloadJson: rootA.payloadJson,
    };
    try {
      await applyDeferredRejections(ledger.database, OWNER, [hint]);
    } catch {
      // Fail-closed is valid; no callback may mutate either owner's root.
    } finally {
      syncFixtureControls.mockSwitchOwnerOnAuthRead = null;
      syncFixtureControls.mockActiveOwner = OWNER;
    }
    expect(syncFixtureControls.mockAuthReadCount).toBeGreaterThanOrEqual(3);
    const nextForeignRoot = await ledger.database
      .get<FinancialActionGroup>("financial_action_groups")
      .find(foreignRoot.id);
    const nextForeignAccount = await ledger.database
      .get<Account>("accounts")
      .find(b.accountId);
    expect(nextForeignRoot._raw).toEqual(beforeRoot);
    expect(nextForeignAccount._raw).toEqual(beforeAccount);
    expect((await ownedRoot(ledger.database, a.envelope.actionId)).state).toBe(
      "reconciliation_incomplete"
    );
    noPrivateNetworkBytes();
  });

  it.each(["sync_pending", "sync_failed"])(
    "S24 A4 incoming bound accepted root and identical account echo rescue local %s before first SDK ACK",
    async (beforeState): Promise<void> => {
      const command = await commitAdd(
        ledger.database,
        "Unknown response Cash",
        "0",
        false,
        "CASH"
      );
      const repo = foundation(ledger.database);
      await repo.markFinancialActionGroupSyncPending(command.envelope.actionId);
      if (beforeState === "sync_failed") {
        await repo.markFinancialActionGroupSyncFailed(
          command.envelope.actionId,
          "transport_unknown"
        );
      }
      const localRoot = await ownedRoot(
        ledger.database,
        command.envelope.actionId
      );
      expect(localRoot.state).toBe(beforeState);
      expect(localRoot.serverOutcome).toBeNull();
      expect(localRoot.outcomeJson).toBeNull();
      const privateEvidence = localRoot.localRecoverySnapshotJson;
      expect(privateEvidence).not.toBeNull();
      const cloudRoot = Object.fromEntries(
        Object.entries(localRoot._raw).filter(
          ([key]) =>
            !["_status", "_changed", "local_recovery_snapshot_json"].includes(
              key
            )
        )
      );
      const acceptedOutcome = serializeCanonicalJsonValue(
        accepted(command) as CanonicalJsonValue
      );
      Object.assign(cloudRoot, {
        state: "accepted",
        server_outcome: "accepted",
        outcome_json: acceptedOutcome,
        rejection_code: null,
      });
      const cloudEcho = await cloudAccount(
        ledger.database,
        command.accountId,
        {}
      );
      await realSynchronize(ledger.database, {
        pull: (): Promise<SyncPullResult> =>
          Promise.resolve({
            changes: {
              financial_action_groups: tableUpdated(cloudRoot),
              accounts: tableUpdated(cloudEcho),
            },
            timestamp: ++syncFixtureControls.mockNextWatermark,
          }),
      });
      const current = await ownedRoot(
        ledger.database,
        command.envelope.actionId
      );
      expect(current.state).toBe("accepted");
      expect(current.serverOutcome).toBe("accepted");
      expect(current.outcomeJson).toBe(acceptedOutcome);
      expect(current.localRecoverySnapshotJson).toBe(privateEvidence);
      expect(current._raw._status).toBe("synced");
      expect(current._raw._changed).toBe("");
      expect(
        (await ledger.database.get<Account>("accounts").find(command.accountId))
          ._raw._status
      ).toBe("synced");
      // Real persisted SQLite reopening, not a replacement model or SDK mock.
      const reopened = await coldRestart();
      const durable = await ownedRoot(reopened, command.envelope.actionId);
      expect(durable._raw._status).toBe("synced");
      expect(durable._raw._changed).toBe("");
      expect(durable.state).toBe("accepted");
      expect(durable.serverOutcome).toBe("accepted");
      expect(durable.outcomeJson).toBe(acceptedOutcome);
      expect(durable.localRecoverySnapshotJson).toBe(privateEvidence);
      noPrivateNetworkBytes();
    }
  );

  it("S25 A4 incorrect cloud account echo beside valid incoming accepted root fails before pull checkpoint", async () => {
    const command = await commitAdd(
      ledger.database,
      "Hold conflicting Cash",
      "0",
      false,
      "CASH"
    );
    const rootRow = await ownedRoot(ledger.database, command.envelope.actionId);
    const cloudRoot = Object.fromEntries(
      Object.entries(rootRow._raw).filter(
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
    const cloudEcho = await cloudAccount(ledger.database, command.accountId, {
      name: "Remote conflicts with local",
    });
    let captured: number | null | undefined;
    await expect(
      realSynchronize(ledger.database, {
        pull: ({ lastPulledAt }): Promise<SyncPullResult> => {
          captured = lastPulledAt;
          return Promise.resolve({
            changes: {
              financial_action_groups: tableUpdated(cloudRoot),
              accounts: tableUpdated(cloudEcho),
            },
            timestamp: ++syncFixtureControls.mockNextWatermark,
          });
        },
      })
    ).rejects.toThrow();
    const local = await ledger.database
      .get<Account>("accounts")
      .find(command.accountId);
    expect(local.name).toBe("Hold conflicting Cash");
    expect(local._raw._status).toBe("created");
    expect(
      (await ownedRoot(ledger.database, command.envelope.actionId)).state
    ).toBe("local_complete");
    let retry: number | null | undefined;
    await realSynchronize(ledger.database, {
      pull: ({ lastPulledAt }): Promise<SyncPullResult> => {
        retry = lastPulledAt;
        return Promise.resolve({
          changes: {},
          timestamp: ++syncFixtureControls.mockNextWatermark,
        });
      },
    });
    expect(retry).toBe(captured);
  });
});
