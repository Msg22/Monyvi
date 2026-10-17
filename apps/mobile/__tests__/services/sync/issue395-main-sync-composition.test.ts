/** #395 / PR385 Main composition: original protected SDK writer and owner receipt.
 * Real AccountAdd/Watermelon SQLite for the positive pull; only outside
 * financial RPC, auth and network response are fixture-controlled.
 * AUTHOR ONLY — NOT RUN.
 */
import type { AccountFinancialEffect, FinancialActionGroup } from "@monyvi/db";
import {
  OWNER,
  ledger,
  commitAdd,
  ownedRoot,
  foundation,
  accepted,
  cloudAccount,
  tableUpdated,
  realSynchronize,
  randomUUID,
  serializeCanonicalJsonValue,
  noPrivateNetworkBytes,
  type AccountDefaultPreparedCommand,
  type CanonicalJsonValue,
  type SyncPullResult,
} from "./account-create-default-sync-lifecycle-fixtures";
import {
  parseFinancialActionEnvelopeJson,
  serializeFinancialActionEnvelope,
} from "@monyvi/logic";
import { createAccountDefaultAndReviewRegistry } from "../../../../../packages/logic/src/financial-actions/account-create-default-registration";
import { reviewBatchSaveEnvelope } from "../../../../../packages/logic/src/financial-actions/__tests__/review-batch-save-fixtures";
import { transformFromSupabase } from "../../../services/sync/transforms";
import {
  createHistoricalSnapshotPullStrategy,
  type HistoricalRecoveryPullResult,
  isHistoricalRecoveryRequired,
  markHistoricalRecoveryComplete,
  removeHistoricalRecoveryReceipt,
} from "../../../services/sync/historical-recovery";
import {
  type FinancialPullRow,
  FINANCIAL_PULL_SHAPING_ERROR_CODE,
  normalizeDedicatedPullRecord,
  shapeAccountFinancialEffectPull,
  shapeFinancialActionRootPull,
  shapeFinancialPullRecords,
} from "../../../services/sync/financial-pull-shaping";
import {
  createProtectedHistoricalSync,
  type ProtectedHistoricalSyncHost,
  type ProtectedHistoricalSyncHooks,
} from "../../../services/sync/protected-historical-sync";

/** A genuine registered AccountAdd, rendered as server PostgREST JSONB.
 * JSONB values are objects; exact ::text aliases are strings and timestamps
 * are ISO. No financial_action_groups.payload_version column is invented.
 */
function acceptedAddServerCandidate(
  root: FinancialActionGroup,
  command: AccountDefaultPreparedCommand
): FinancialPullRow {
  const registry = createAccountDefaultAndReviewRegistry();
  const envelope = parseFinancialActionEnvelopeJson(root.payloadJson, registry);
  if (
    envelope.domain !== "accounts" ||
    envelope.kind !== "create_with_default" ||
    envelope.payloadVersion !== "account.create-default/v1" ||
    envelope.actionId !== command.envelope.actionId ||
    envelope.domainReferenceId !== command.accountId
  )
    throw new Error("not_genuine_registered_account_add");

  const publicRaw = Object.fromEntries(
    Object.entries(root._raw).filter(
      ([key]) =>
        !["_status", "_changed", "local_recovery_snapshot_json"].includes(key)
    )
  );
  const payloadJsonb: unknown = JSON.parse(root.payloadJson);
  const guardsJsonb: unknown = JSON.parse(root.accountGuardsJson);
  const outcomeText = serializeCanonicalJsonValue(
    accepted(command) as CanonicalJsonValue
  );
  const outcomeJsonb: unknown = JSON.parse(outcomeText);
  return {
    ...publicRaw,
    id: randomUUID(), // Different remote ID; #395 writer preserves local physical ID.
    created_at: root.createdAt.toISOString(),
    updated_at: root.updatedAt.toISOString(),
    account_guards_json: guardsJsonb,
    payload_json: payloadJsonb,
    outcome_json: outcomeJsonb,
    account_guards_json_text: JSON.stringify(guardsJsonb, null, 2),
    payload_json_text: JSON.stringify(payloadJsonb, null, 2),
    outcome_json_text: JSON.stringify(outcomeJsonb, null, 2),
    state: "accepted",
    server_outcome: "accepted",
    rejection_code: null,
  };
}

function canonicalWriterRoot(
  candidate: FinancialPullRow
): Readonly<Record<string, unknown>> {
  // Production's exact JSONB alias normalization and timestamp conversion
  // run before the unchanged protected SDK application writer.
  return transformFromSupabase(
    "financial_action_groups",
    normalizeDedicatedPullRecord("financial_action_groups", candidate)
  );
}

describe("#395 Main composition: PR385 candidate reaches original SDK writer", () => {
  it("withholds unresolved Add by default but admits one bound acceptance through genuine protected pull and preserves its physical/private root", async () => {
    const command = await commitAdd(
      ledger.database,
      "Main account writer composition",
      "0",
      false,
      "CASH"
    );
    await foundation(ledger.database).markFinancialActionGroupSyncPending(
      command.envelope.actionId
    );
    const localRoot = await ownedRoot(
      ledger.database,
      command.envelope.actionId
    );
    expect(localRoot.state).toBe("sync_pending");
    const physicalRootId = localRoot.id;
    const privateBytes = localRoot.localRecoverySnapshotJson;
    expect(privateBytes).not.toBeNull();
    const incoming = acceptedAddServerCandidate(localRoot, command);
    expect("payload_version" in incoming).toBe(false);
    expect(typeof incoming.payload_json).toBe("object");
    expect(typeof incoming.account_guards_json).toBe("object");
    expect(typeof incoming.created_at).toBe("string");

    expect(
      await shapeFinancialActionRootPull(ledger.database, OWNER, [incoming])
    ).toEqual([]);
    const eligible = await shapeFinancialPullRecords(
      "financial_action_groups",
      [incoming],
      OWNER,
      ledger.database,
      { admitAcceptedAddToProtectedWriter: true }
    );
    expect(eligible).toHaveLength(1);
    expect(eligible[0]).toEqual(incoming);
    expect(eligible[0]?.id).not.toBe(physicalRootId);
    const projected = canonicalWriterRoot(eligible[0]);
    expect("payload_version" in projected).toBe(false);
    expect(typeof projected.payload_json).toBe("string");
    expect(JSON.parse(String(projected.payload_json))).toEqual(
      JSON.parse(localRoot.payloadJson)
    );
    expect(JSON.parse(String(projected.account_guards_json))).toEqual(
      JSON.parse(localRoot.accountGuardsJson)
    );
    expect(typeof projected.created_at).toBe("number");
    let actuallySubmitted = false;

    await realSynchronize(ledger.database, {
      pull: async (): Promise<SyncPullResult> => {
        actuallySubmitted = true;
        return {
          changes: {
            financial_action_groups: tableUpdated(projected),
            accounts: tableUpdated(
              await cloudAccount(ledger.database, command.accountId, {})
            ),
          },
          timestamp: Date.parse("2026-10-17T16:30:00.000Z"),
        };
      },
    });
    expect(actuallySubmitted).toBe(true);
    const acceptedRoot = await ownedRoot(
      ledger.database,
      command.envelope.actionId
    );
    expect(acceptedRoot.state).toBe("accepted");
    expect(acceptedRoot.id).toBe(physicalRootId);
    expect(acceptedRoot._raw._status).toBe("synced");
    expect(acceptedRoot.localRecoverySnapshotJson).toBe(privateBytes);
    noPrivateNetworkBytes();
  });

  it("suppresses false accepted-Add candidates and fails immutable collisions instead of bypassing PR385", async () => {
    const command = await commitAdd(
      ledger.database,
      "Unproved candidate blocked",
      "0",
      false,
      "CASH"
    );
    await foundation(ledger.database).markFinancialActionGroupSyncPending(
      command.envelope.actionId
    );
    const root = await ownedRoot(ledger.database, command.envelope.actionId);
    const source = acceptedAddServerCandidate(root, command);
    const option = { admitAcceptedAddToProtectedWriter: true };
    expect(
      await shapeFinancialActionRootPull(
        ledger.database,
        OWNER,
        [{ ...source, kind: "review_batch_save" }],
        option
      )
    ).toEqual([]);
    expect(
      await shapeFinancialActionRootPull(
        ledger.database,
        OWNER,
        [{ ...source, outcome_json_text: '{"status":"accepted"}' }],
        option
      )
    ).toEqual([]);
    // A malformed version INSIDE the registered envelope is refused; there
    // is no root-level payload_version column to supply or bypass this test.
    const malformedEnvelope: unknown = JSON.parse(root.payloadJson);
    if (
      typeof malformedEnvelope !== "object" ||
      malformedEnvelope === null ||
      Array.isArray(malformedEnvelope)
    )
      throw new Error("missing_original_registered_envelope");
    await expect(
      shapeFinancialActionRootPull(
        ledger.database,
        OWNER,
        [
          {
            ...source,
            payload_json_text: JSON.stringify({
              ...malformedEnvelope,
              payloadVersion: "unregistered/v1",
            }),
          },
        ],
        option
      )
    ).rejects.toThrow(FINANCIAL_PULL_SHAPING_ERROR_CODE);
    expect(
      await shapeFinancialActionRootPull(
        ledger.database,
        OWNER,
        [{ ...source, server_outcome: "stale" }],
        option
      )
    ).toEqual([]);
    await expect(
      shapeFinancialActionRootPull(
        ledger.database,
        OWNER,
        [{ ...source, payload_hash: "b".repeat(64) }],
        option
      )
    ).rejects.toThrow(FINANCIAL_PULL_SHAPING_ERROR_CODE);
    expect(
      (await ownedRoot(ledger.database, command.envelope.actionId)).state
    ).toBe("sync_pending");
  });

  it("retains registered Review canonical identity under the shared parser", () => {
    const registry = createAccountDefaultAndReviewRegistry();
    const validation = { latestAllowedCalendarDate: "2026-10-17" };
    const canonical = serializeFinancialActionEnvelope(
      reviewBatchSaveEnvelope,
      registry,
      validation
    );
    const parsed = parseFinancialActionEnvelopeJson(
      canonical,
      registry,
      validation
    );
    expect(parsed.kind).toBe("review_batch_save");
    expect(parsed.payloadVersion).toBe("review.batch-save/v1");
    expect(serializeFinancialActionEnvelope(parsed, registry, validation)).toBe(
      canonical
    );
  });

  it("retains PR385's strict same-effect-ID collision checks even for an unresolved accepted Add", async () => {
    const command = await commitAdd(
      ledger.database,
      "Effect collision control",
      "10.01",
      false,
      "BANK"
    );
    if (!command.effectId) throw new Error("missing_real_opening_effect");
    const effect = await ledger.database
      .get<AccountFinancialEffect>("account_financial_effects")
      .find(command.effectId);
    const exact: FinancialPullRow = {
      id: effect.id,
      user_id: effect.userId,
      action_id: effect.actionId,
      account_id: effect.accountId,
      domain: effect.domain,
      kind: effect.kind,
      currency: effect.currency,
      amount_minor_units_text: effect.amountMinorUnits,
      accepted_account_revision_text: effect.acceptedAccountRevision,
      reverses_effect_id: effect.reversesEffectId,
    };
    expect(
      await shapeAccountFinancialEffectPull(ledger.database, OWNER, [exact])
    ).toEqual([]);
    await expect(
      shapeAccountFinancialEffectPull(ledger.database, OWNER, [
        { ...exact, amount_minor_units_text: "1002" },
      ])
    ).rejects.toThrow(FINANCIAL_PULL_SHAPING_ERROR_CODE);
  });
});

describe("#395 Main composition: PR385 receipt/strategy after protected sync", () => {
  interface Scenario {
    readonly startedUnresolved?: boolean;
    readonly remainsUnresolved?: boolean;
    readonly switchOwnerAfterReceipt?: boolean;
    readonly failProtectedSync?: boolean;
  }
  function scenario(input: Scenario): {
    readonly calls: readonly string[];
    readonly result: Promise<void>;
  } {
    const calls: string[] = [];
    let changedOwner = false;
    let observedUnresolved = 0;
    const marker = createHistoricalSnapshotPullStrategy(
      OWNER,
      "2026-07-01T00:00:00.000Z",
      "2026-10-17T16:30:00.000Z"
    );
    const originalPull: HistoricalRecoveryPullResult = {
      changes: {},
      timestamp: Date.parse("2026-10-17T16:30:00.000Z"),
      experimentalStrategy: marker,
    };
    const host: ProtectedHistoricalSyncHost = {
      getOwner: () => Promise.resolve(OWNER),
      repairAdds: () => Promise.resolve({ skipped: [] }),
      repairEdits: () => Promise.resolve({ skipped: [] }),
      historicalRequired: () => Promise.resolve(true),
      hasUnresolved: () => {
        observedUnresolved += 1;
        return Promise.resolve(
          observedUnresolved === 1
            ? input.startedUnresolved === true
            : input.remainsUnresolved === true
        );
      },
      markComplete: async (db, userId) => {
        calls.push("receipt");
        await markHistoricalRecoveryComplete(db, userId);
        if (input.switchOwnerAfterReceipt) changedOwner = true;
      },
      removeReceipt: async (db, userId) => {
        calls.push("revoke");
        await removeHistoricalRecoveryReceipt(db, userId);
      },
      pull: (lastPulledAt) => {
        expect(lastPulledAt).toBeNull(); // Due history forces a full pull.
        return Promise.resolve(originalPull);
      },
      push: () => Promise.resolve(undefined),
    };
    const hooks: ProtectedHistoricalSyncHooks = {
      synchronize: async ({ pullChanges }) => {
        calls.push("protected");
        const result = await pullChanges(12_345);
        // The exact experimentalStrategy object must survive the protected
        // wrapper unmodified, not be reduced to changes/timestamp.
        expect(result).toBe(originalPull);
        if (input.failProtectedSync) throw new Error("sdk_ack_failed");
        return [];
      },
      applyDeferred: () => {
        calls.push("post_ack");
        return Promise.resolve();
      },
      assertOwner: () =>
        changedOwner
          ? Promise.reject(new Error("account_actor_changed"))
          : Promise.resolve(),
    };
    const sync = createProtectedHistoricalSync(hooks, host);
    return { calls, result: sync.syncDatabase(ledger.database) };
  }

  it("marks owner-scoped history only after protected sync and post-ACK completion", async () => {
    const run = scenario({});
    await run.result;
    expect(run.calls).toEqual(["protected", "post_ack", "receipt"]);
    expect(await isHistoricalRecoveryRequired(ledger.database, OWNER)).toBe(
      false
    );
  });

  it.each([
    ["unresolved initially", { startedUnresolved: true }],
    ["unresolved after ACK", { remainsUnresolved: true }],
  ] as const)("withholds the history receipt for %s", async (_name, state) => {
    const run = scenario(state);
    await run.result;
    expect(run.calls).toEqual(["protected", "post_ack"]);
    expect(await isHistoricalRecoveryRequired(ledger.database, OWNER)).toBe(
      true
    );
  });

  it("never writes a receipt when the protected SDK writer fails", async () => {
    const run = scenario({ failProtectedSync: true });
    await expect(run.result).rejects.toThrow("sdk_ack_failed");
    expect(run.calls).toEqual(["protected"]);
    expect(await isHistoricalRecoveryRequired(ledger.database, OWNER)).toBe(
      true
    );
  });

  it("revokes only the captured owner's attempted receipt when auth switches after marking", async () => {
    const run = scenario({ switchOwnerAfterReceipt: true });
    await expect(run.result).rejects.toThrow("account_actor_changed");
    expect(run.calls).toEqual(["protected", "post_ack", "receipt", "revoke"]);
    expect(await isHistoricalRecoveryRequired(ledger.database, OWNER)).toBe(
      true
    );
  });
});
