import { Database, type Model } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { schema } from "../../../../packages/db/src/schema";
import { FinancialActionGroup } from "../../../../packages/db/src/models/FinancialActionGroup";
import { MetalHoldingState } from "../../../../packages/db/src/models/MetalHoldingState";
import { MetalLifecycleEvent } from "../../../../packages/db/src/models/MetalLifecycleEvent";
import { repairLegacyMetalEdits } from "../../services/legacy-metal-edit-repair-service";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("../../services/supabase", () => ({
  getCurrentUserId: jest.fn().mockResolvedValue("user-1"),
  supabase: {},
}));

const USER_ID = "user-1";
const HOLDING_ID = "10000000-0000-4000-8000-000000000001";
const CREATED_ACTION_ID = "20000000-0000-4000-8000-000000000002";
const CREATED_EVENT_ID = "20000000-0000-4000-8000-000000000003";
const EDIT_ACTION_ID = "20000000-0000-4000-8000-000000000004";
const EDIT_EVENT_ID = "20000000-0000-4000-8000-000000000005";
const STATE_ID = "20000000-0000-4000-8000-000000000006";
const ROOT_ID = "20000000-0000-4000-8000-000000000007";
const NOW = new Date("2026-09-27T10:00:00.000Z");

const models: Array<typeof Model> = [
  FinancialActionGroup,
  MetalHoldingState,
  MetalLifecycleEvent,
];

async function createDatabase(): Promise<Database> {
  const adapter = new SQLiteAdapter({ schema });
  await adapter.initializingPromise;
  return new Database({ adapter, modelClasses: models });
}

interface SeedOptions {
  readonly userId?: string;
  readonly serverOutcome?: string | null;
  readonly rootState?: string;
}

async function seedLegacyEdit(
  database: Database,
  options: SeedOptions = {}
): Promise<void> {
  const userId = options.userId ?? USER_ID;
  const serverOutcome = options.serverOutcome ?? null;
  const rootState = options.rootState ?? "local_complete";
  await database.write(async () => {
    const state = database
      .get<MetalHoldingState>("metal_holding_states")
      .prepareCreate((row) => {
        row._raw.id = STATE_ID;
        row.deleted = false;
        row.effectiveActionId = EDIT_ACTION_ID;
        row.effectiveEventId = EDIT_EVENT_ID;
        row.financialRevision = "1";
        row.holdingId = HOLDING_ID;
        row.isVisible = true;
        row.reconciliationState = "sync_pending";
        row.status = "active";
        row.updatedAt = NOW;
        row.userId = userId;
      });
    const createdEvent = database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .prepareCreate((row) => {
        row._raw.id = CREATED_EVENT_ID;
        row.actionId = CREATED_ACTION_ID;
        row.deleted = false;
        row.holdingId = HOLDING_ID;
        row.isEffective = false;
        row.isHistoryVisible = true;
        row.kind = "add";
        row.occurredAt = NOW;
        row.payloadJson = "{}";
        row.predecessorEventId = null;
        row.reversesEventId = null;
        row.updatedAt = NOW;
        row.userId = userId;
      });
    const correctionEvent = database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .prepareCreate((row) => {
        row._raw.id = EDIT_EVENT_ID;
        row.actionId = EDIT_ACTION_ID;
        row.deleted = false;
        row.holdingId = HOLDING_ID;
        row.isEffective = true;
        row.isHistoryVisible = true;
        row.kind = "corrected";
        row.occurredAt = NOW;
        row.payloadJson = "{}";
        row.predecessorEventId = CREATED_EVENT_ID;
        row.reversesEventId = null;
        row.updatedAt = NOW;
        row.userId = userId;
      });
    const root = database
      .get<FinancialActionGroup>("financial_action_groups")
      .prepareCreate((row) => {
        row._raw.id = ROOT_ID;
        row.accountGuardsJson = "[]";
        row.actionId = EDIT_ACTION_ID;
        row.deleted = false;
        row.domain = "metals";
        row.domainReferenceId = HOLDING_ID;
        row.kind = "correct";
        row.outcomeJson = null;
        row.payloadHash = "hash";
        row.payloadJson = JSON.stringify({
          actionId: EDIT_ACTION_ID,
          domainReferenceId: HOLDING_ID,
          kind: "correct",
          payload: { holdingId: HOLDING_ID },
          userId,
        });
        row.rejectionCode = null;
        row.serverOutcome = serverOutcome;
        row.state = rootState;
        row.updatedAt = NOW;
        row.userId = userId;
      });
    await database.batch(state, createdEvent, correctionEvent, root);
  });
}

async function fetchEvents(
  database: Database
): Promise<MetalLifecycleEvent[]> {
  return database.get<MetalLifecycleEvent>("metal_lifecycle_events").query().fetch();
}

describe("legacy Metal Edit repair", () => {
  it("repairs a pending legacy Edit atomically and is idempotent", async () => {
    const database = await createDatabase();
    await seedLegacyEdit(database);

    const first = await repairLegacyMetalEdits(database, "user-1");
    expect(first).toEqual({ repaired: 1, skipped: [] });

    const events = await fetchEvents(database);
    expect(
      events.find((event) => event.id === EDIT_EVENT_ID)?.kind
    ).toBe("correct");
    expect(
      events.find((event) => event.id === CREATED_EVENT_ID)?.isEffective
    ).toBe(true);

    const second = await repairLegacyMetalEdits(database, "user-1");
    expect(second).toEqual({ repaired: 0, skipped: [] });
  });

  it("never mutates accepted server evidence", async () => {
    const database = await createDatabase();
    await seedLegacyEdit(database, { serverOutcome: "accepted" });

    const result = await repairLegacyMetalEdits(database, "user-1");
    expect(result).toEqual({ repaired: 0, skipped: [] });

    const events = await fetchEvents(database);
    expect(
      events.find((event) => event.id === EDIT_EVENT_ID)?.kind
    ).toBe("corrected");
    expect(
      events.find((event) => event.id === CREATED_EVENT_ID)?.isEffective
    ).toBe(false);
  });

  it("reports a superseded correction and leaves it untouched", async () => {
    const database = await createDatabase();
    await seedLegacyEdit(database);
    await database.write(async () => {
      const state = (
        await database
          .get<MetalHoldingState>("metal_holding_states")
          .query()
          .fetch()
      )[0];
      await state.update((row) => {
        row.effectiveEventId = "30000000-0000-4000-8000-000000000009";
      });
    });

    const result = await repairLegacyMetalEdits(database, "user-1");
    expect(result).toEqual({
      repaired: 0,
      skipped: [{ actionId: EDIT_ACTION_ID, reason: "superseded" }],
    });
    const events = await fetchEvents(database);
    expect(
      events.find((event) => event.id === EDIT_EVENT_ID)?.kind
    ).toBe("corrected");
  });

  it("reports a chained successor and leaves the chain untouched", async () => {
    const database = await createDatabase();
    await seedLegacyEdit(database);
    await database.write(async () => {
      await database.get<MetalLifecycleEvent>("metal_lifecycle_events").create(
        (row) => {
          row._raw.id = "30000000-0000-4000-8000-000000000010";
          row.actionId = "30000000-0000-4000-8000-000000000011";
          row.deleted = false;
          row.holdingId = HOLDING_ID;
          row.isEffective = true;
          row.isHistoryVisible = true;
          row.kind = "sell";
          row.occurredAt = NOW;
          row.payloadJson = "{}";
          row.predecessorEventId = EDIT_EVENT_ID;
          row.reversesEventId = null;
          row.updatedAt = NOW;
          row.userId = USER_ID;
        }
      );
    });

    const result = await repairLegacyMetalEdits(database, "user-1");
    expect(result).toEqual({
      repaired: 0,
      skipped: [{ actionId: EDIT_ACTION_ID, reason: "chained_successor" }],
    });
    const events = await fetchEvents(database);
    expect(
      events.find((event) => event.id === EDIT_EVENT_ID)?.kind
    ).toBe("corrected");
  });

  it("never rewrites another user's pending Edit", async () => {
    const database = await createDatabase();
    await seedLegacyEdit(database, { userId: "user-2" });

    const result = await repairLegacyMetalEdits(database, "user-1");
    expect(result).toEqual({ repaired: 0, skipped: [] });

    const events = await fetchEvents(database);
    expect(
      events.find((event) => event.id === EDIT_EVENT_ID)?.kind
    ).toBe("corrected");
    expect(
      events.find((event) => event.id === CREATED_EVENT_ID)?.isEffective
    ).toBe(false);
  });

  it("preserves the accepted predecessor's updatedAt instead of re-dirtying it", async () => {
    const database = await createDatabase();
    await seedLegacyEdit(database);

    const result = await repairLegacyMetalEdits(database, "user-1");
    expect(result).toEqual({ repaired: 1, skipped: [] });

    const events = await fetchEvents(database);
    const predecessor = events.find((event) => event.id === CREATED_EVENT_ID);
    expect(predecessor?.isEffective).toBe(true);
    expect(predecessor?.updatedAt.getTime()).toBe(NOW.getTime());
  });

  it("skips a root whose repair throws without aborting the repair", async () => {
    const database = await createDatabase();
    await seedLegacyEdit(database);

    const updateSpy = jest
      .spyOn(MetalLifecycleEvent.prototype, "update")
      .mockImplementationOnce((_updater) =>
        Promise.reject(new Error("poison action"))
      );

    const result = await repairLegacyMetalEdits(database, "user-1");
    updateSpy.mockRestore();

    expect(result).toEqual({
      repaired: 0,
      skipped: [{ actionId: EDIT_ACTION_ID, reason: "malformed" }],
    });
  });

  it("resolves without aborting when the predecessor was rekeyed away", async () => {
    const database = await createDatabase();
    await seedLegacyEdit(database);
    await database.write(async () => {
      const correction = (
        await database
          .get<MetalLifecycleEvent>("metal_lifecycle_events")
          .query()
          .fetch()
      ).find((event) => event.id === EDIT_EVENT_ID);
      await correction!.update((row) => {
        row.predecessorEventId = "30000000-0000-4000-8000-000000000099";
      });
    });

    const result = await repairLegacyMetalEdits(database, "user-1");
    expect(result).toEqual({
      repaired: 0,
      skipped: [{ actionId: EDIT_ACTION_ID, reason: "missing_predecessor" }],
    });
  });
});
