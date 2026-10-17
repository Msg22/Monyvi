/**
 * #395 T053: actual Supabase dedicated-root request, protected projection,
 * and the genuine Watermelon synchronize() atomic remote-apply boundary.
 * Only network responses are injected; no sync or root pull SUT mock.
 */
import {
  synchronize,
  type SyncDatabaseChangeSet,
  type SyncPullResult,
} from "@nozbe/watermelondb/sync";
import type { Database } from "@nozbe/watermelondb";
import { prepareOwnedFinancialActionRootPull } from "../../services/sync/financial-action-root-pull";
import { shapeFinancialActionRootPull } from "../../services/sync/financial-pull-shaping";
import type { AppSyncDatabaseChangeSet } from "../../services/sync/types";
jest.unmock("@nozbe/watermelondb/sync");
import type { FinancialActionGroup } from "@monyvi/db";
import { physicalSaveLedgerSnapshot } from "./account-review-save-sqlite-test-helpers";
import { physicalSmsSnapshot } from "./account-review-all-dedup-physical-test-helpers";
import { clearAcceptedAccountReviewPrivateEvidence } from "../../services/account-review-retention-terminal";
import {
  acceptedReviewTransport,
  badReviewReceipts,
  invalidRawReceipts,
  rawAcceptedReviewTransport,
  sql090ReviewAcceptedReceipt,
} from "./financial-action-root-pull-test-receipts";
import { pullMetalDedicatedTable } from "../../services/sync/pull-strategies";
import { pullChanges as pullAtomicChanges } from "../../services/sync/atomic-pull-strategies";
import {
  OWNER,
  makeSaveFixture,
  testUuid,
} from "./account-review-save-test-fixtures";
import {
  cloneRecoverySqlite,
  readPrivateOwnedRoot,
  requireActionRoot,
  resetRecoverySqlite,
  saveReview,
  seedBoundSmsReview,
} from "./account-review-local-recovery-test-harness";

const mockCapturedFrom = jest.fn();
const mockRpc = jest.fn();
const mockCurrentActor = jest.fn<Promise<string | null>, []>();
const UPPER = "2026-10-16T14:00:00.000Z";
const CLOUD_ID = testUuid(861);
const LOCAL_FIELD = "local_recovery_snapshot_json";
const SYNC_CHECKPOINT_KEY = "__watermelon_last_pulled_at";

/** Deliberately run this authenticated physical projection INSIDE the
 * synchronized writer hook; network records are not local write authority. */
async function protectNetworkRootInWriter(
  database: Database,
  captured: SyncDatabaseChangeSet
): Promise<SyncDatabaseChangeSet> {
  const roots = (captured as AppSyncDatabaseChangeSet).financial_action_groups;
  if (!roots) throw new Error("financial_root_missing_from_writer_callback");
  const projected = await prepareOwnedFinancialActionRootPull({
    database,
    expectedOwnerId: OWNER,
    changes: roots,
  });
  return { ...captured, financial_action_groups: projected };
}

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("@monyvi/db", (): Readonly<Record<string, unknown>> => {
  const wm = jest.requireActual<typeof import("@nozbe/watermelondb")>(
    "@nozbe/watermelondb"
  );
  const Adapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const models = jest.requireActual<
    typeof import("./account-review-save-ledger-models")
  >("./account-review-save-ledger-models").LEDGER_MODEL_CLASSES;
  const adapter = new Adapter({ schema });
  const database = new wm.Database({ adapter, modelClasses: models });
  return {
    database,
    __adapter: adapter,
    schema,
    Q: wm.Q,
    ...Object.fromEntries(models.map((model) => [model.name, model])),
  };
});
jest.mock("expo-crypto", () => {
  const nodeCrypto =
    jest.requireActual<typeof import("node:crypto")>("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: (algorithm: string, input: string): Promise<string> => {
      if (algorithm !== "SHA-256")
        throw new Error("unexpected_test_digest_algorithm");
      return Promise.resolve(
        nodeCrypto.createHash("sha256").update(input, "utf8").digest("hex")
      );
    },
    randomUUID: (): string => nodeCrypto.randomUUID(),
  };
});
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> => mockCurrentActor(),
  supabase: {
    from: (table: string): unknown => mockCapturedFrom(table),
    rpc: (...args: readonly unknown[]): unknown => mockRpc(...args),
  },
}));

interface TransportResult {
  readonly data: ReadonlyArray<Record<string, unknown>>;
  readonly error: null;
  readonly count: number;
}
interface Chain {
  readonly select: jest.Mock;
  readonly eq: jest.Mock;
  readonly lte: jest.Mock;
  readonly gt: jest.Mock;
  readonly or: jest.Mock;
  readonly order: jest.Mock;
  readonly limit: jest.Mock;
  readonly then: (
    accept: (result: TransportResult) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise<unknown>;
}
function transportChain(
  rows: ReadonlyArray<Record<string, unknown>>,
  onFetch?: () => void
): Chain {
  const chain: Chain = {
    select: jest.fn((): Chain => chain),
    eq: jest.fn((): Chain => chain),
    lte: jest.fn((): Chain => chain),
    gt: jest.fn((): Chain => chain),
    or: jest.fn((): Chain => chain),
    order: jest.fn((): Chain => chain),
    limit: jest.fn((): Chain => chain),
    then: (accept, reject): Promise<unknown> => {
      onFetch?.();
      return Promise.resolve({
        data: rows,
        error: null,
        count: rows.length,
      }).then(accept, reject);
    },
  };
  return chain;
}
function cloudRoot(root: FinancialActionGroup): Record<string, unknown> {
  const publicFields = Object.fromEntries(
    Object.entries(root._raw).filter(
      ([key]) => key !== LOCAL_FIELD && key !== "_status" && key !== "_changed"
    )
  );
  return {
    ...publicFields,
    id: CLOUD_ID,
    updated_at: UPPER,
    account_guards_json_text: root.accountGuardsJson,
    outcome_json_text: root.outcomeJson,
    payload_json_text: root.payloadJson,
    [LOCAL_FIELD]: '{"injected":"untrusted"}',
  };
}

function requireCompletedPull(
  result: SyncPullResult
): asserts result is Extract<
  SyncPullResult,
  { readonly changes: unknown; readonly timestamp: number }
> {
  if (!("changes" in result && "timestamp" in result))
    throw new Error("missing_complete_sync_result");
}

function seedNetworkPull(
  root: FinancialActionGroup,
  override: Readonly<Record<string, unknown>> = {},
  onRootFetch?: () => void
): Chain {
  const rootChain = transportChain(
    [{ ...cloudRoot(root), ...override }],
    onRootFetch
  );
  mockCapturedFrom.mockImplementation(
    (table: string): Chain =>
      table === "financial_action_groups" ? rootChain : transportChain([])
  );
  return rootChain;
}

beforeEach(async (): Promise<void> => {
  mockCapturedFrom.mockReset();
  mockCurrentActor.mockReset();
  mockCurrentActor.mockResolvedValue(OWNER);
  mockRpc.mockReset();
  mockRpc.mockImplementation((name: string) => {
    if (name === "pull_market_rate_snapshots_page_v2")
      return Promise.resolve({
        data: { snapshots: [], nextCursor: null, upperWatermark: UPPER },
        error: null,
      });
    if (name === "seal_sync_pull_v1")
      return Promise.resolve({ data: UPPER, error: null });
    if (name === "pull_snapshot_deletions_page_v1")
      return Promise.resolve({
        data: { rows: [], count: 0, upperWatermark: UPPER },
        error: null,
      });
    return Promise.reject(new Error("unexpected_network_rpc_" + name));
  });
  await resetRecoverySqlite();
});

describe("#395 T053 actual network-to-atomic-sync financial root connection", () => {
  it("R01 fetches only the owner-scoped root but withholds an unresolved nonterminal echo", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({
      kind: "committed",
    });
    const fresh = await cloneRecoverySqlite();
    const root = await requireActionRoot(fresh);
    const chain = transportChain([cloudRoot(root)]);
    mockCapturedFrom.mockReturnValue(chain);
    const changes = await pullMetalDedicatedTable(
      "financial_action_groups",
      OWNER,
      null,
      UPPER,
      fresh
    );
    expect(mockCapturedFrom).toHaveBeenCalledWith("financial_action_groups");
    expect(chain.eq).toHaveBeenCalledWith("user_id", OWNER);
    expect(chain.lte).toHaveBeenCalledWith("updated_at", UPPER);
    expect(chain.select).toHaveBeenCalledWith(
      expect.stringContaining("payload_json_text:payload_json::text"),
      { count: "exact" }
    );
    // Save has not received a server acceptance receipt. PR385 correctly
    // withholds this network echo even with the protected-writer opt-in.
    expect(Array.from<unknown>(changes.updated)).toEqual([]);
    expect(Array.from<unknown>(changes.deleted)).toEqual([]);
    const networkCandidate: AppSyncDatabaseChangeSet = {
      financial_action_groups: changes,
    };
    const projection = await fresh.write(() =>
      protectNetworkRootInWriter(fresh, networkCandidate)
    );
    const guarded = (projection as AppSyncDatabaseChangeSet)
      .financial_action_groups;
    expect(Array.from<unknown>(guarded?.updated ?? [])).toEqual([]);
    const retained = await requireActionRoot(fresh);
    expect(retained).toBe(root);
    expect(retained.localRecoverySnapshotJson).toEqual(expect.any(String));
    expect(retained.state).toBe("local_complete");
  });

  it("R02 runs the real SDK writer without adopting an unaccepted Review echo", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({
      kind: "committed",
    });
    const fresh = await cloneRecoverySqlite();
    const root = await requireActionRoot(fresh);
    const originalBytes = root.localRecoverySnapshotJson;
    mockCapturedFrom.mockReturnValue(transportChain([cloudRoot(root)]));
    const rootChanges = await pullMetalDedicatedTable(
      "financial_action_groups",
      OWNER,
      null,
      UPPER,
      fresh
    );
    expect(await fresh.adapter.getLocal(SYNC_CHECKPOINT_KEY)).toBeNull();
    const writerSteps: string[] = [];
    const beforeApplyRemoteChangesInWriter = jest.fn(
      async (
        captured: SyncDatabaseChangeSet
      ): Promise<SyncDatabaseChangeSet> => {
        writerSteps.push("project");
        return protectNetworkRootInWriter(fresh, captured);
      }
    );
    const beforePullCheckpointInWriter = jest.fn(async (): Promise<void> => {
      writerSteps.push("checkpoint");
      const physicallyApplied = await requireActionRoot(fresh);
      expect(physicallyApplied.id).toBe(root.id);
      expect(physicallyApplied.localRecoverySnapshotJson).toBe(originalBytes);
    });
    const options = {
      database: fresh,
      pullChanges: (): Promise<SyncPullResult> =>
        Promise.resolve({
          changes: { financial_action_groups: rootChanges },
          timestamp: Date.parse(UPPER),
        }),
      pushChanges: (): Promise<void> => Promise.resolve(),
      sendCreatedAsUpdated: true,
      beforeApplyRemoteChangesInWriter,
      beforePullCheckpointInWriter,
    };
    await synchronize(options);
    expect(beforeApplyRemoteChangesInWriter).toHaveBeenCalledTimes(1);
    expect(beforePullCheckpointInWriter).toHaveBeenCalledTimes(1);
    expect(writerSteps).toEqual(["project", "checkpoint"]);
    expect(await fresh.adapter.getLocal(SYNC_CHECKPOINT_KEY)).toBe(
      String(Date.parse(UPPER))
    );
    const persisted = await requireActionRoot(fresh);
    expect(persisted.id).toBe(root.id);
    expect(persisted.localRecoverySnapshotJson).toBe(originalBytes);
    expect(readPrivateOwnedRoot(persisted).actionId).toBe(
      fixture.intent.actionId
    );
  });
  it("R03 accepted SMS keeps sealed originals/private proof through real SDK, then terminal cleanup removes both atomically", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({
      kind: "committed",
    });
    const fresh = await cloneRecoverySqlite();
    const root = await requireActionRoot(fresh);
    const originalBytes = root.localRecoverySnapshotJson;
    expect(typeof originalBytes).toBe("string");
    const privateSnapshot = readPrivateOwnedRoot(root);
    expect(privateSnapshot.queuePreimage?.disposition).toBe("pruned_empty");
    expect(privateSnapshot.smsDrafts.length).toBeGreaterThan(0);
    expect(
      privateSnapshot.smsDrafts.every(
        (draft) => draft.retentionState === "available"
      )
    ).toBe(true);
    const originalSms = await physicalSmsSnapshot(fresh);
    expect(
      originalSms.queues.some((queue) => queue._status === "deleted")
    ).toBe(true);
    expect(
      originalSms.drafts.some((draft) => draft._status === "deleted")
    ).toBe(true);
    const accepted = {
      ...cloudRoot(root),
      ...acceptedReviewTransport(sql090ReviewAcceptedReceipt(root)),
    };
    // Default Main withholding is unchanged. Only the bounded
    // protected-writer opt-in forwards this claimed SQL090 receipt.
    expect(
      await shapeFinancialActionRootPull(fresh, OWNER, [
        { ...accepted, id: CLOUD_ID },
      ])
    ).toEqual([]);
    expect(
      await shapeFinancialActionRootPull(
        fresh,
        OWNER,
        [{ ...accepted, id: CLOUD_ID }],
        { admitAcceptedAddToProtectedWriter: true }
      )
    ).toEqual([{ ...accepted, id: CLOUD_ID }]);
    mockCapturedFrom.mockReturnValue(transportChain([accepted]));
    const changes = await pullMetalDedicatedTable(
      "financial_action_groups",
      OWNER,
      null,
      UPPER,
      fresh
    );
    const updates = Array.from<unknown>(changes.updated);
    expect(updates[0]).toMatchObject({
      id: CLOUD_ID,
      [LOCAL_FIELD]: '{"injected":"untrusted"}',
    });
    const beforeApplyRemoteChangesInWriter = jest.fn(
      (captured: SyncDatabaseChangeSet): Promise<SyncDatabaseChangeSet> =>
        protectNetworkRootInWriter(fresh, captured)
    );
    const beforePullCheckpointInWriter = jest.fn(async (): Promise<void> => {
      const applied = await requireActionRoot(fresh);
      expect(applied.id).toBe(root.id);
      expect(applied.state).toBe("accepted");
      expect(applied.localRecoverySnapshotJson).toBe(originalBytes);
    });
    // The injected network push has not transmitted device-local SMS
    // tombstones. Explicitly retain their captured IDs in SDK rejection
    // authority so no fake successful push erases them before terminal proof.
    const heldPrivateSmsIds = {
      sms_review_queues: originalSms.queues.map((row) => String(row.id)),
      sms_review_draft_items: originalSms.drafts.map((row) => String(row.id)),
    };
    const options = {
      database: fresh,
      pullChanges: (): Promise<SyncPullResult> =>
        Promise.resolve({
          changes: { financial_action_groups: changes },
          timestamp: Date.parse(UPPER),
        }),
      pushChanges: () =>
        Promise.resolve({ experimentalRejectedIds: heldPrivateSmsIds }),
      sendCreatedAsUpdated: true,
      beforeApplyRemoteChangesInWriter,
      beforePullCheckpointInWriter,
    };
    await synchronize(options);
    expect(beforeApplyRemoteChangesInWriter).toHaveBeenCalledTimes(1);
    expect(beforePullCheckpointInWriter).toHaveBeenCalledTimes(1);
    expect(await fresh.adapter.getLocal(SYNC_CHECKPOINT_KEY)).toBe(
      String(Date.parse(UPPER))
    );
    const persisted = await requireActionRoot(fresh);
    expect(persisted.id).toBe(root.id);
    expect(persisted.state).toBe("accepted");
    expect(persisted.localRecoverySnapshotJson).toBe(originalBytes);
    expect(readPrivateOwnedRoot(persisted)).toEqual(privateSnapshot);
    expect(await physicalSmsSnapshot(fresh)).toEqual(originalSms);

    // Only the existing accepted-only owner-bound terminal service may
    // atomically destroy the proven physical SMS originals and clear private
    // bytes. A server accepted label alone cannot do this inside pull.
    await clearAcceptedAccountReviewPrivateEvidence({
      database: fresh,
      actionId: root.actionId,
    });
    const cleaned = await requireActionRoot(fresh);
    expect(cleaned.id).toBe(root.id);
    expect(cleaned.state).toBe("accepted");
    expect(cleaned.localRecoverySnapshotJson).toBeNull();
    expect(await physicalSmsSnapshot(fresh)).toEqual({
      queues: [],
      drafts: [],
    });
  });

  it("R03-I idempotent SQL090 SMS receipt still preserves sealed originals and local private bytes", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({
      kind: "committed",
    });
    const fresh = await cloneRecoverySqlite();
    const root = await requireActionRoot(fresh);
    const originalId = root.id;
    const privateBytes = root.localRecoverySnapshotJson;
    expect(typeof privateBytes).toBe("string");
    const physicalBefore = await physicalSmsSnapshot(fresh);
    const receipt = sql090ReviewAcceptedReceipt(root, "idempotent");
    seedNetworkPull(root, acceptedReviewTransport(receipt, "idempotent"));
    const pulled = await pullAtomicChanges(null, OWNER, fresh);
    requireCompletedPull(pulled);
    expect(
      Array.from<unknown>(
        (pulled.changes as AppSyncDatabaseChangeSet).financial_action_groups
          ?.updated ?? []
      )
    ).toEqual([
      expect.objectContaining({
        id: CLOUD_ID,
        state: "accepted",
        server_outcome: "idempotent",
      }),
    ]);
    const beforeApplyRemoteChangesInWriter = jest.fn(
      (captured: SyncDatabaseChangeSet): Promise<SyncDatabaseChangeSet> =>
        protectNetworkRootInWriter(fresh, captured)
    );
    const beforePullCheckpointInWriter = jest.fn(async (): Promise<void> => {
      const committed = await requireActionRoot(fresh);
      expect(committed.id).toBe(originalId);
      expect(committed.localRecoverySnapshotJson).toBe(privateBytes);
      expect(committed.serverOutcome).toBe("idempotent");
    });
    // The injected network push has not transmitted device-local SMS
    // tombstones. Explicitly retain their captured IDs in SDK rejection
    // authority so no fake successful push erases them before terminal proof.
    const heldPrivateSmsIds = {
      sms_review_queues: physicalBefore.queues.map((row) => String(row.id)),
      sms_review_draft_items: physicalBefore.drafts.map((row) =>
        String(row.id)
      ),
    };
    const options = {
      database: fresh,
      pullChanges: (): Promise<SyncPullResult> => Promise.resolve(pulled),
      pushChanges: () =>
        Promise.resolve({ experimentalRejectedIds: heldPrivateSmsIds }),
      sendCreatedAsUpdated: true,
      beforeApplyRemoteChangesInWriter,
      beforePullCheckpointInWriter,
    };
    await synchronize(options);
    expect(beforeApplyRemoteChangesInWriter).toHaveBeenCalledTimes(1);
    expect(beforePullCheckpointInWriter).toHaveBeenCalledTimes(1);
    expect((await requireActionRoot(fresh)).localRecoverySnapshotJson).toBe(
      privateBytes
    );
    expect(await physicalSmsSnapshot(fresh)).toEqual(physicalBefore);
    expect(await fresh.adapter.getLocal(SYNC_CHECKPOINT_KEY)).toBe(
      String(Date.parse(UPPER))
    );
  });

  it("R03-V accepted Voice Review clears validated private bytes without any SMS physical originals", async () => {
    const fixture = makeSaveFixture("voice-existing");
    expect(fixture.session.source).toBe("VOICE");
    await expect(saveReview(fixture)).resolves.toMatchObject({
      kind: "committed",
    });
    const fresh = await cloneRecoverySqlite();
    const root = await requireActionRoot(fresh);
    const originalBytes = root.localRecoverySnapshotJson;
    expect(typeof originalBytes).toBe("string");
    const privateSnapshot = readPrivateOwnedRoot(root);
    expect(privateSnapshot.queuePreimage).toBeNull();
    expect(privateSnapshot.smsDrafts).toEqual([]);
    const originalSms = await physicalSmsSnapshot(fresh);
    expect(originalSms).toEqual({ queues: [], drafts: [] });
    const accepted = {
      ...cloudRoot(root),
      ...acceptedReviewTransport(sql090ReviewAcceptedReceipt(root)),
    };
    mockCapturedFrom.mockReturnValue(transportChain([accepted]));
    const pulled = await pullMetalDedicatedTable(
      "financial_action_groups",
      OWNER,
      null,
      UPPER,
      fresh
    );
    expect(Array.from<unknown>(pulled.updated)).toEqual([
      expect.objectContaining({
        id: CLOUD_ID,
        action_id: root.actionId,
        state: "accepted",
      }),
    ]);
    const beforeApplyRemoteChangesInWriter = jest.fn(
      (captured: SyncDatabaseChangeSet): Promise<SyncDatabaseChangeSet> =>
        protectNetworkRootInWriter(fresh, captured)
    );
    const beforePullCheckpointInWriter = jest.fn(async (): Promise<void> => {
      const projected = await requireActionRoot(fresh);
      expect(projected.id).toBe(root.id);
      expect(projected.state).toBe("accepted");
      expect(projected.localRecoverySnapshotJson).toBeNull();
    });
    await synchronize({
      database: fresh,
      pullChanges: (): Promise<SyncPullResult> =>
        Promise.resolve({
          changes: { financial_action_groups: pulled },
          timestamp: Date.parse(UPPER),
        }),
      pushChanges: (): Promise<void> => Promise.resolve(),
      sendCreatedAsUpdated: true,
      beforeApplyRemoteChangesInWriter,
      beforePullCheckpointInWriter,
    });
    expect(beforeApplyRemoteChangesInWriter).toHaveBeenCalledTimes(1);
    expect(beforePullCheckpointInWriter).toHaveBeenCalledTimes(1);
    expect(await fresh.adapter.getLocal(SYNC_CHECKPOINT_KEY)).toBe(
      String(Date.parse(UPPER))
    );
    const persisted = await requireActionRoot(fresh);
    expect(persisted.id).toBe(root.id);
    expect(persisted.state).toBe("accepted");
    expect(persisted.localRecoverySnapshotJson).toBeNull();
    expect(await physicalSmsSnapshot(fresh)).toEqual(originalSms);
  });

  it.each(badReviewReceipts)(
    "R03-NEG $name: an incomplete accepted Review receipt cannot clear private evidence or checkpoint",
    async ({ tamper }) => {
      const fixture = makeSaveFixture("sms-new-bank");
      await seedBoundSmsReview(fixture);
      await expect(saveReview(fixture)).resolves.toMatchObject({
        kind: "committed",
      });
      const fresh = await cloneRecoverySqlite();
      const owned = await requireActionRoot(fresh);
      const privateBytes = owned.localRecoverySnapshotJson;
      const physicalBefore = await physicalSaveLedgerSnapshot(fresh);
      const checkpointBefore =
        await fresh.adapter.getLocal(SYNC_CHECKPOINT_KEY);
      expect(checkpointBefore).toBeNull();
      const receipt = sql090ReviewAcceptedReceipt(owned);
      seedNetworkPull(owned, acceptedReviewTransport(tamper(receipt)));
      const result = await pullAtomicChanges(null, OWNER, fresh);
      requireCompletedPull(result);
      const beforeApplyRemoteChangesInWriter = jest.fn(
        (captured: SyncDatabaseChangeSet): Promise<SyncDatabaseChangeSet> =>
          protectNetworkRootInWriter(fresh, captured)
      );
      const beforePullCheckpointInWriter = jest.fn(
        (): Promise<void> => Promise.resolve()
      );
      const pushChanges = jest.fn((): Promise<void> => Promise.resolve());
      const options = {
        database: fresh,
        pullChanges: (): Promise<SyncPullResult> => Promise.resolve(result),
        pushChanges,
        sendCreatedAsUpdated: true,
        beforeApplyRemoteChangesInWriter,
        beforePullCheckpointInWriter,
      };
      await expect(synchronize(options)).rejects.toThrow(
        "financial_action_root_pull_invalid_review_acceptance_receipt"
      );
      expect(beforeApplyRemoteChangesInWriter).toHaveBeenCalledTimes(1);
      expect(beforePullCheckpointInWriter).not.toHaveBeenCalled();
      expect(pushChanges).not.toHaveBeenCalled();
      expect(await fresh.adapter.getLocal(SYNC_CHECKPOINT_KEY)).toBe(
        checkpointBefore
      );
      expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(physicalBefore);
      const persisted = await requireActionRoot(fresh);
      expect(persisted.id).toBe(owned.id);
      expect(persisted.localRecoverySnapshotJson).toBe(privateBytes);
      expect(persisted.state).toBe(owned.state);
    }
  );

  it("R03-NEG state/receipt status mismatch is not an idempotent authorization", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({
      kind: "committed",
    });
    const fresh = await cloneRecoverySqlite();
    const owned = await requireActionRoot(fresh);
    const privateBytes = owned.localRecoverySnapshotJson;
    const prior = await physicalSaveLedgerSnapshot(fresh);
    seedNetworkPull(
      owned,
      acceptedReviewTransport(
        sql090ReviewAcceptedReceipt(owned, "idempotent"),
        "accepted"
      )
    );
    const pulled = await pullAtomicChanges(null, OWNER, fresh);
    requireCompletedPull(pulled);
    const beforeApplyRemoteChangesInWriter = jest.fn(
      (captured: SyncDatabaseChangeSet): Promise<SyncDatabaseChangeSet> =>
        protectNetworkRootInWriter(fresh, captured)
    );
    const beforePullCheckpointInWriter = jest.fn(
      (): Promise<void> => Promise.resolve()
    );
    const options = {
      database: fresh,
      pullChanges: (): Promise<SyncPullResult> => Promise.resolve(pulled),
      pushChanges: (): Promise<void> => Promise.resolve(),
      sendCreatedAsUpdated: true,
      beforeApplyRemoteChangesInWriter,
      beforePullCheckpointInWriter,
    };
    await expect(synchronize(options)).rejects.toThrow(
      "financial_action_root_pull_invalid_review_acceptance_receipt"
    );
    expect(beforeApplyRemoteChangesInWriter).toHaveBeenCalledTimes(1);
    expect(beforePullCheckpointInWriter).not.toHaveBeenCalled();
    expect(await fresh.adapter.getLocal(SYNC_CHECKPOINT_KEY)).toBeNull();
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(prior);
    expect((await requireActionRoot(fresh)).localRecoverySnapshotJson).toBe(
      privateBytes
    );
  });

  it("R03-RAW reordered/whitespace SQL090 SMS receipt normalizes yet retains sealed private bytes", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({
      kind: "committed",
    });
    const fresh = await cloneRecoverySqlite();
    const root = await requireActionRoot(fresh);
    const originalId = root.id;
    const privateBytes = root.localRecoverySnapshotJson;
    expect(typeof privateBytes).toBe("string");
    const physicalBefore = await physicalSmsSnapshot(fresh);
    const valid = sql090ReviewAcceptedReceipt(root);
    const reordered = {
      status: valid.status,
      serverAcceptedAt: valid.serverAcceptedAt,
      holdingRevision: valid.holdingRevision,
      effectiveEventId: valid.effectiveEventId,
      actionId: valid.actionId,
      accountRevisions: valid.accountRevisions,
    };
    const raw = " \n " + JSON.stringify(reordered, null, 2) + " \n";
    seedNetworkPull(root, rawAcceptedReviewTransport(raw));
    const pulled = await pullAtomicChanges(null, OWNER, fresh);
    requireCompletedPull(pulled);
    const beforeApplyRemoteChangesInWriter = jest.fn(
      (captured: SyncDatabaseChangeSet): Promise<SyncDatabaseChangeSet> =>
        protectNetworkRootInWriter(fresh, captured)
    );
    const beforePullCheckpointInWriter = jest.fn(async (): Promise<void> => {
      const committed = await requireActionRoot(fresh);
      expect(committed.id).toBe(originalId);
      expect(committed.state).toBe("accepted");
      expect(committed.localRecoverySnapshotJson).toBe(privateBytes);
      expect(committed.outcomeJson).toBe(
        JSON.stringify(
          Object.fromEntries(
            Object.entries(valid).sort(([a], [b]) =>
              a < b ? -1 : a > b ? 1 : 0
            )
          )
        )
      );
    });
    // The injected network push has not transmitted device-local SMS
    // tombstones. Explicitly retain their captured IDs in SDK rejection
    // authority so no fake successful push erases them before terminal proof.
    const heldPrivateSmsIds = {
      sms_review_queues: physicalBefore.queues.map((row) => String(row.id)),
      sms_review_draft_items: physicalBefore.drafts.map((row) =>
        String(row.id)
      ),
    };
    const options = {
      database: fresh,
      pullChanges: (): Promise<SyncPullResult> => Promise.resolve(pulled),
      pushChanges: () =>
        Promise.resolve({ experimentalRejectedIds: heldPrivateSmsIds }),
      sendCreatedAsUpdated: true,
      beforeApplyRemoteChangesInWriter,
      beforePullCheckpointInWriter,
    };
    await synchronize(options);
    expect(beforeApplyRemoteChangesInWriter).toHaveBeenCalledTimes(1);
    expect(beforePullCheckpointInWriter).toHaveBeenCalledTimes(1);
    expect(await fresh.adapter.getLocal(SYNC_CHECKPOINT_KEY)).toBe(
      String(Date.parse(UPPER))
    );
    expect((await requireActionRoot(fresh)).localRecoverySnapshotJson).toBe(
      privateBytes
    );
    expect(await physicalSmsSnapshot(fresh)).toEqual(physicalBefore);
  });

  it.each(invalidRawReceipts)(
    "R03-RAW-NEG $name: original raw receipt cannot bypass financial evidence parser or advance SDK",
    async ({ raw }) => {
      const fixture = makeSaveFixture("sms-new-bank");
      await seedBoundSmsReview(fixture);
      await expect(saveReview(fixture)).resolves.toMatchObject({
        kind: "committed",
      });
      const fresh = await cloneRecoverySqlite();
      const root = await requireActionRoot(fresh);
      const beforeBytes = root.localRecoverySnapshotJson;
      const beforeRootId = root.id;
      const beforeLedger = await physicalSaveLedgerSnapshot(fresh);
      const beforeCheckpoint =
        await fresh.adapter.getLocal(SYNC_CHECKPOINT_KEY);
      expect(beforeCheckpoint).toBeNull();
      const exactRaw = raw(sql090ReviewAcceptedReceipt(root));
      // The transport stage may parse JSON for shape, but must carry its
      // original exact-text alias unchanged to the authenticated writer.
      seedNetworkPull(root, rawAcceptedReviewTransport(exactRaw));
      const pulled = await pullAtomicChanges(null, OWNER, fresh);
      requireCompletedPull(pulled);
      const rootNetworkRows = Array.from<unknown>(
        (pulled.changes as AppSyncDatabaseChangeSet).financial_action_groups
          ?.updated ?? []
      );
      expect(rootNetworkRows).toHaveLength(1);
      expect(rootNetworkRows[0]).toMatchObject({ outcome_json: exactRaw });
      const beforeApplyRemoteChangesInWriter = jest.fn(
        (captured: SyncDatabaseChangeSet): Promise<SyncDatabaseChangeSet> =>
          protectNetworkRootInWriter(fresh, captured)
      );
      const beforePullCheckpointInWriter = jest.fn(
        (): Promise<void> => Promise.resolve()
      );
      const pushChanges = jest.fn((): Promise<void> => Promise.resolve());
      const options = {
        database: fresh,
        pullChanges: (): Promise<SyncPullResult> => Promise.resolve(pulled),
        pushChanges,
        sendCreatedAsUpdated: true,
        beforeApplyRemoteChangesInWriter,
        beforePullCheckpointInWriter,
      };
      await expect(synchronize(options)).rejects.toThrow(
        "financial_action_root_pull_invalid_outcome_json"
      );
      expect(beforeApplyRemoteChangesInWriter).toHaveBeenCalledTimes(1);
      expect(beforePullCheckpointInWriter).not.toHaveBeenCalled();
      expect(pushChanges).not.toHaveBeenCalled();
      expect(await fresh.adapter.getLocal(SYNC_CHECKPOINT_KEY)).toBe(
        beforeCheckpoint
      );
      expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(beforeLedger);
      const unchanged = await requireActionRoot(fresh);
      expect(unchanged.id).toBe(beforeRootId);
      expect(unchanged.localRecoverySnapshotJson).toBe(beforeBytes);
      expect(unchanged.state).toBe(root.state);
    }
  );

  it("R04 production atomic pull withholds an unresolved echo and preserves the private local root", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({
      kind: "committed",
    });
    const fresh = await cloneRecoverySqlite();
    const root = await requireActionRoot(fresh);
    const originalBytes = root.localRecoverySnapshotJson;
    if (typeof originalBytes !== "string")
      throw new Error("missing_owned_private_root");
    const rootChain = seedNetworkPull(root);
    const result = await pullAtomicChanges(null, OWNER, fresh);
    requireCompletedPull(result);
    const byTable: AppSyncDatabaseChangeSet = result.changes;
    const changes = byTable.financial_action_groups;
    if (!changes) throw new Error("dedicated_root_missing_from_atomic_pull");
    // A nonterminal cloud echo has no SQL090 receipt and cannot override
    // the device-private unresolved root through the production callback.
    expect(Array.from<unknown>(changes.updated)).toEqual([]);
    expect(Array.from<unknown>(changes.deleted)).toEqual([]);
    const protectedChanges = await fresh.write(() =>
      protectNetworkRootInWriter(fresh, byTable)
    );
    expect(
      Array.from<unknown>(
        (protectedChanges as AppSyncDatabaseChangeSet).financial_action_groups
          ?.updated ?? []
      )
    ).toEqual([]);
    expect(result.timestamp).toBe(Date.parse(UPPER));
    expect(rootChain.eq).toHaveBeenCalledWith("user_id", OWNER);
    expect(rootChain.select).toHaveBeenCalledWith(
      expect.stringContaining("payload_json_text:payload_json::text"),
      { count: "exact" }
    );
    expect(
      Array.from<unknown>(byTable.metal_holding_states?.updated ?? [])
    ).toEqual([]);
    expect((await requireActionRoot(fresh)).localRecoverySnapshotJson).toBe(
      originalBytes
    );
  });

  it("R05 rejects owner switch during the actual network-to-atomic pull without mutating the local root", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({
      kind: "committed",
    });
    const fresh = await cloneRecoverySqlite();
    const root = await requireActionRoot(fresh);
    const originalBytes = root.localRecoverySnapshotJson;
    const physicalBefore = await physicalSaveLedgerSnapshot(fresh);
    const checkpointBefore = await fresh.adapter.getLocal(SYNC_CHECKPOINT_KEY);
    const network = seedNetworkPull(root, {}, () => {
      mockCurrentActor.mockResolvedValue(
        "ffffffff-ffff-4fff-8fff-ffffffffffff"
      );
    });
    // The current outer atomic-pull actor fence refuses immediately after
    // network fetch; the inner physical-root writer is never entered.
    await expect(pullAtomicChanges(null, OWNER, fresh)).rejects.toThrow(
      "sync_pull_auth_scope_lost"
    );
    expect(network.eq).toHaveBeenCalledWith("user_id", OWNER);
    expect(await fresh.adapter.getLocal(SYNC_CHECKPOINT_KEY)).toBe(
      checkpointBefore
    );
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(physicalBefore);
    const stored = await requireActionRoot(fresh);
    expect(stored.payloadHash).toBe(root.payloadHash);
    expect(stored.localRecoverySnapshotJson).toBe(originalBytes);
    expect(stored.state).toBe(root.state);
  });

  it("R06 withholds unsupported reconciliation and preserves owned private evidence", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({
      kind: "committed",
    });
    const fresh = await cloneRecoverySqlite();
    const root = await requireActionRoot(fresh);
    const originalBytes = root.localRecoverySnapshotJson;
    seedNetworkPull(root, {
      state: "reconciliation_incomplete",
      server_outcome: null,
      outcome_json: null,
      outcome_json_text: null,
      rejection_code: "unsupported_version",
      [LOCAL_FIELD]: '{"forged":"server-data"}',
    });
    const result = await pullAtomicChanges(null, OWNER, fresh);
    requireCompletedPull(result);
    const byTable: AppSyncDatabaseChangeSet = result.changes;
    const rows = byTable.financial_action_groups?.updated;
    // Main intentionally refuses a nonterminal unsupported-version outcome.
    // The private root remains available for separately owned recovery.
    expect(Array.from<unknown>(rows ?? [])).toEqual([]);
    const protectedChanges = await fresh.write(() =>
      protectNetworkRootInWriter(fresh, byTable)
    );
    expect(
      Array.from<unknown>(
        (protectedChanges as AppSyncDatabaseChangeSet).financial_action_groups
          ?.updated ?? []
      )
    ).toEqual([]);
    const persisted = await requireActionRoot(fresh);
    expect(persisted.id).toBe(root.id);
    expect(persisted.state).toBe(root.state);
    expect(persisted.localRecoverySnapshotJson).toBe(originalBytes);
  });

  it("R07 keeps legacy metal dedicated pulls independent of an owned database", async () => {
    const chain = transportChain([]);
    mockCapturedFrom.mockReturnValue(chain);
    await expect(
      pullMetalDedicatedTable("metal_holding_states", OWNER, null, UPPER)
    ).resolves.toEqual({ created: [], updated: [], deleted: [] });
    expect(chain.eq).toHaveBeenCalledWith("user_id", OWNER);
    expect(chain.lte).toHaveBeenCalledWith("updated_at", UPPER);
  });
});
