/**
 * #395 T053: actual Supabase dedicated-root request, protected projection,
 * and the genuine Watermelon synchronize() atomic remote-apply boundary.
 * Only network responses are injected; no sync or root pull SUT mock.
 */
import {
  synchronize,
  type SyncPullResult,
} from "@nozbe/watermelondb/sync";
import type { AppSyncDatabaseChangeSet } from "../../services/sync/types";
jest.unmock("@nozbe/watermelondb/sync");
import type { FinancialActionGroup } from "@monyvi/db";
import {
  pullMetalDedicatedTable,
} from "../../services/sync/pull-strategies";
import { pullChanges as pullAtomicChanges } from
  "../../services/sync/atomic-pull-strategies";
import {
  OWNER, makeSaveFixture, testUuid,
} from "./account-review-save-test-fixtures";
import {
  cloneRecoverySqlite, readPrivateOwnedRoot,
  requireActionRoot, resetRecoverySqlite, saveReview, seedBoundSmsReview,
} from "./account-review-local-recovery-test-harness";

const mockCapturedFrom = jest.fn();
const mockRpc = jest.fn();
const mockCurrentActor = jest.fn<Promise<string | null>, []>();
const UPPER = "2026-10-16T14:00:00.000Z";
const CLOUD_ID = testUuid(861);
const LOCAL_FIELD = "local_recovery_snapshot_json";

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
    database, __adapter: adapter, schema, Q: wm.Q,
    ...Object.fromEntries(models.map((model) => [model.name, model])),
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
      return Promise.resolve({ data: rows, error: null, count: rows.length })
        .then(accept, reject);
    },
  };
  return chain;
}
function cloudRoot(root: FinancialActionGroup): Record<string, unknown> {
  const publicFields = Object.fromEntries(
    Object.entries(root._raw).filter(([key]) =>
      key !== LOCAL_FIELD && key !== "_status" && key !== "_changed")
  );
  return {
    ...publicFields, id: CLOUD_ID,
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
  const rootChain = transportChain([{ ...cloudRoot(root), ...override }], onRootFetch);
  mockCapturedFrom.mockImplementation((table: string): Chain =>
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
        data: { rows: [], count: 0, upperWatermark: UPPER }, error: null,
      });
    return Promise.reject(new Error("unexpected_network_rpc_" + name));
  });
  await resetRecoverySqlite();
});

describe("#395 T053 actual network-to-atomic-sync financial root connection", () => {
  it("R01 fetches only the owned root and returns a protected local-ID projection", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await cloneRecoverySqlite();
    const root = await requireActionRoot(fresh);
    const chain = transportChain([cloudRoot(root)]);
    mockCapturedFrom.mockReturnValue(chain);
    const changes = await pullMetalDedicatedTable(
      "financial_action_groups", OWNER, null, UPPER, fresh
    );
    expect(mockCapturedFrom).toHaveBeenCalledWith("financial_action_groups");
    expect(chain.eq).toHaveBeenCalledWith("user_id", OWNER);
    expect(chain.lte).toHaveBeenCalledWith("updated_at", UPPER);
    expect(chain.select).toHaveBeenCalledWith(
      expect.stringContaining("payload_json_text:payload_json::text"),
      { count: "exact" }
    );
    const updated = Array.from<unknown>(changes.updated);
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      id: root.id,
      action_id: root.actionId,
      [LOCAL_FIELD]: root.localRecoverySnapshotJson,
    });
    expect(await requireActionRoot(fresh)).toBe(root);
  });

  it("R02 applies dedicated protected root with real synchronize() once", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await cloneRecoverySqlite();
    const root = await requireActionRoot(fresh);
    const originalBytes = root.localRecoverySnapshotJson;
    mockCapturedFrom.mockReturnValue(transportChain([cloudRoot(root)]));
    const rootChanges = await pullMetalDedicatedTable(
      "financial_action_groups", OWNER, null, UPPER, fresh
    );
    await synchronize({
      database: fresh,
      pullChanges: (): Promise<SyncPullResult> => Promise.resolve({
        changes: { financial_action_groups: rootChanges },
        timestamp: Date.parse(UPPER),
      }),
      pushChanges: (): Promise<void> => Promise.resolve(),
      sendCreatedAsUpdated: true,
    });
    const persisted = await requireActionRoot(fresh);
    expect(persisted.id).toBe(root.id);
    expect(persisted.localRecoverySnapshotJson).toBe(originalBytes);
    expect(readPrivateOwnedRoot(persisted).actionId).toBe(fixture.intent.actionId);
  });
  it("R03 atomically clears accepted private evidence via genuine synchronize()", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await cloneRecoverySqlite();
    const root = await requireActionRoot(fresh);
    expect(root.localRecoverySnapshotJson).toEqual(expect.any(String));
    const accepted = {
      ...cloudRoot(root),
      state: "accepted",
      server_outcome: "accepted",
      outcome_json_text: '{"status":"accepted"}',
    };
    mockCapturedFrom.mockReturnValue(transportChain([accepted]));
    const changes = await pullMetalDedicatedTable(
      "financial_action_groups", OWNER, null, UPPER, fresh
    );
    const updates = Array.from<unknown>(changes.updated);
    expect(updates[0]).toMatchObject({ [LOCAL_FIELD]: null });
    await synchronize({
      database: fresh,
      pullChanges: (): Promise<SyncPullResult> => Promise.resolve({
        changes: { financial_action_groups: changes },
        timestamp: Date.parse(UPPER),
      }),
      pushChanges: (): Promise<void> => Promise.resolve(),
      sendCreatedAsUpdated: true,
    });
    const persisted = await requireActionRoot(fresh);
    expect(persisted.state).toBe("accepted");
    expect(persisted.localRecoverySnapshotJson).toBeNull();
  });

  it("R04 uses production atomic pullChanges with a real owned root and private-safe mapping", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
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
    expect(Array.from<unknown>(changes.updated)).toEqual([
      expect.objectContaining({
        id: root.id,
        action_id: root.actionId,
        [LOCAL_FIELD]: originalBytes,
      }),
    ]);
    expect(result.timestamp).toBe(Date.parse(UPPER));
    expect(rootChain.eq).toHaveBeenCalledWith("user_id", OWNER);
    expect(rootChain.select).toHaveBeenCalledWith(
      expect.stringContaining("payload_json_text:payload_json::text"),
      { count: "exact" }
    );
    expect(Array.from<unknown>(byTable.metal_holding_states?.updated ?? []))
      .toEqual([]);
    expect((await requireActionRoot(fresh)).localRecoverySnapshotJson)
      .toBe(originalBytes);
  });

  it("R05 rejects owner switch during the actual network-to-atomic pull without mutating the local root", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await cloneRecoverySqlite();
    const root = await requireActionRoot(fresh);
    const originalBytes = root.localRecoverySnapshotJson;
    seedNetworkPull(root, {}, () => {
      mockCurrentActor.mockResolvedValue("ffffffff-ffff-4fff-8fff-ffffffffffff");
    });
    await expect(pullAtomicChanges(null, OWNER, fresh))
      .rejects.toThrow("financial_action_root_pull_auth_scope_changed");
    const stored = await requireActionRoot(fresh);
    expect(stored.payloadHash).toBe(root.payloadHash);
    expect(stored.localRecoverySnapshotJson).toBe(originalBytes);
    expect(stored.state).toBe(root.state);
  });

  it("R06 preserves owned private evidence for unsupported reconciliation in the real atomic pull", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
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
    expect(Array.from<unknown>(rows ?? [])).toEqual([
      expect.objectContaining({
        id: root.id,
        state: "reconciliation_incomplete",
        [LOCAL_FIELD]: originalBytes,
      }),
    ]);
    expect((await requireActionRoot(fresh)).localRecoverySnapshotJson)
      .toBe(originalBytes);
  });

  it("R07 keeps legacy metal dedicated pulls independent of an owned database", async () => {
    const chain = transportChain([]);
    mockCapturedFrom.mockReturnValue(chain);
    await expect(pullMetalDedicatedTable(
      "metal_holding_states", OWNER, null, UPPER
    )).resolves.toEqual({ created: [], updated: [], deleted: [] });
    expect(chain.eq).toHaveBeenCalledWith("user_id", OWNER);
    expect(chain.lte).toHaveBeenCalledWith("updated_at", UPPER);
  });
});
