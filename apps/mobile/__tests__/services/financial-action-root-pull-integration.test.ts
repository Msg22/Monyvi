/**
 * #395 T053: actual Supabase dedicated-root request, protected projection,
 * and the genuine Watermelon synchronize() atomic remote-apply boundary.
 * Only network responses are injected; no sync or root pull SUT mock.
 */
import { synchronize, type SyncPullResult } from "@nozbe/watermelondb/sync";
jest.unmock("@nozbe/watermelondb/sync");
import type { FinancialActionGroup } from "@monyvi/db";
import {
  pullMetalDedicatedTable,
} from "../../services/sync/pull-strategies";
import {
  OWNER, makeSaveFixture, testUuid,
} from "./account-review-save-test-fixtures";
import {
  database, cloneRecoverySqlite, readPrivateOwnedRoot,
  requireActionRoot, resetRecoverySqlite, saveReview, seedBoundSmsReview,
} from "./account-review-local-recovery-test-harness";

const capturedFrom = jest.fn();
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
  getCurrentUserId: (): Promise<string> =>
    Promise.resolve("018f0c7a-1234-4abc-8def-000000000001"),
  supabase: { from: (table: string): unknown => capturedFrom(table) },
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
  rows: ReadonlyArray<Record<string, unknown>>
): Chain {
  const chain: Chain = {
    select: jest.fn((): Chain => chain),
    eq: jest.fn((): Chain => chain),
    lte: jest.fn((): Chain => chain),
    gt: jest.fn((): Chain => chain),
    or: jest.fn((): Chain => chain),
    order: jest.fn((): Chain => chain),
    limit: jest.fn((): Chain => chain),
    then: (accept, reject): Promise<unknown> =>
      Promise.resolve({ data: rows, error: null, count: rows.length })
        .then(accept, reject),
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

beforeEach(async (): Promise<void> => {
  capturedFrom.mockReset();
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
    capturedFrom.mockReturnValue(chain);
    const changes = await pullMetalDedicatedTable(
      "financial_action_groups", OWNER, null, UPPER, fresh
    );
    expect(capturedFrom).toHaveBeenCalledWith("financial_action_groups");
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
    capturedFrom.mockReturnValue(transportChain([cloudRoot(root)]));
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
    capturedFrom.mockReturnValue(transportChain([accepted]));
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
});
