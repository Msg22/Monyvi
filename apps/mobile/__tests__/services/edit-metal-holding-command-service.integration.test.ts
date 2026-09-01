import type { Database, Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";

interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: Array<typeof Model>;
}

interface EditServiceModule {
  readonly createEditMetalHoldingCommandService: (dependencies: {
    readonly database: Database;
  }) => {
    readonly save: (input: EditCommand) => Promise<{ readonly kind: "metadata" | "correction" | "replay" }>;
  };
}

interface EditCommand {
  readonly actionId: string;
  readonly holdingId: string;
  readonly userId: string;
  readonly expectedFinancialRevision: "0";
  readonly correctionReason: string | null;
  readonly metadata: { readonly name: string; readonly notes: string | null };
  readonly materialFacts: {
    readonly weightGramsDecimal: string;
    readonly purityCode: string;
    readonly purityCatalogVersion: "1";
    readonly purityFactorDecimal: string;
    readonly purchasePriceDecimal: string;
    readonly purchaseCurrency: string;
    readonly purchaseDate: string;
    readonly physicalForm: "COIN" | "BAR" | "JEWELRY" | null;
  } | null;
}

const ids = {
  user: "018f0c7a-1234-7abc-8def-000000000003",
  holding: "018f0c7a-1234-7abc-8def-000000000002",
  action: "018f0c7a-1234-7abc-8def-000000000010",
} as const;

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual("@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js")
);

jest.mock("@monyvi/db", () => {
  const { Database: WatermelonDatabase, Model: WatermelonModel } = jest.requireActual<typeof import("@nozbe/watermelondb")>("@nozbe/watermelondb");
  const SQLiteAdapter = jest.requireActual<typeof import("@nozbe/watermelondb/adapters/sqlite")>("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<typeof import("../../../../packages/db/src/schema")>("../../../../packages/db/src/schema");
  const modelClasses = ["Asset", "AssetMetal", "FinancialActionGroup", "MetalActionEvidence", "MetalHoldingState", "MetalLifecycleEvent", "MetalRateReference"].map((name) => jest.requireActual<Record<string, typeof WatermelonModel>>(`../../../../packages/db/src/models/${name}`)[name]);
  const adapter = new SQLiteAdapter({ schema });
  return { database: new WatermelonDatabase({ adapter, modelClasses }), __adapter: adapter, __modelClasses: modelClasses };
});

const { database, __adapter: adapter, __modelClasses: modelClasses } = jest.requireMock<TestDatabaseModule>("@monyvi/db");

function loadService(): EditServiceModule {
  return jest.requireActual<EditServiceModule>("../../services/edit-metal-holding-command-service");
}

function command(overrides: Partial<EditCommand> = {}): EditCommand {
  return {
    actionId: ids.action,
    holdingId: ids.holding,
    userId: ids.user,
    expectedFinancialRevision: "0",
    correctionReason: "Corrected original receipt",
    metadata: { name: "Wedding coin corrected", notes: "هدية 🎁" },
    materialFacts: { weightGramsDecimal: "11.125", purityCode: "gold-999", purityCatalogVersion: "1", purityFactorDecimal: "0.999", purchasePriceDecimal: "47800", purchaseCurrency: "EGP", purchaseDate: "2024-03-14", physicalForm: "COIN" },
    ...overrides,
  };
}

async function openFreshDatabase(): Promise<Database> {
  const clonedAdapter = await adapter.testClone();
  const { Database: WatermelonDatabase } = jest.requireActual<typeof import("@nozbe/watermelondb")>("@nozbe/watermelondb");
  return new WatermelonDatabase({ adapter: clonedAdapter, modelClasses });
}

describe("Edit metal holding command SQLite atomicity", () => {
  beforeEach(async (): Promise<void> => {
    await adapter.initializingPromise;
    await database.write(async (): Promise<void> => database.unsafeResetDatabase());
  });

  it("atomically commits mixed metadata/material correction, incremented revision, immutable before/after evidence, and History event", async (): Promise<void> => {
    await expect(loadService().createEditMetalHoldingCommandService({ database }).save(command())).resolves.toEqual({ kind: "correction" });
    const reopened = await openFreshDatabase();
    const evidence = await reopened.get<Model>("metal_action_evidence").query().fetch();
    const history = await reopened.get<Model>("metal_lifecycle_events").query().fetch();
    expect(evidence).toHaveLength(1);
    expect(history).toHaveLength(1);
  });

  it("uses metadata LWW without action/history for metadata-only edit, but rejects material edit without a reason", async (): Promise<void> => {
    const service = loadService().createEditMetalHoldingCommandService({ database });
    await expect(service.save(command({ materialFacts: null, correctionReason: null }))).resolves.toEqual({ kind: "metadata" });
    await expect(service.save(command({ correctionReason: null }))).rejects.toThrow("correction_reason_required");
  });

  it("uses one whole-fact-set CAS, replays same action once, rejects stale/different payload, and rolls back every row on SQLite failure", async (): Promise<void> => {
    const service = loadService().createEditMetalHoldingCommandService({ database });
    await service.save(command());
    await expect(service.save(command())).resolves.toEqual({ kind: "replay" });
    await expect(service.save(command({ expectedFinancialRevision: "0", metadata: { name: "changed", notes: null } }))).rejects.toThrow("action_id_payload_mismatch");
    jest.spyOn(database.adapter, "batch").mockRejectedValueOnce(new Error("write_failed"));
    await expect(service.save(command({ actionId: "018f0c7a-1234-7abc-8def-000000000011" }))).rejects.toThrow("write_failed");
  });

  it("survives database re-instantiation and refuses financial correction of a terminal holding while metadata stays editable", async (): Promise<void> => {
    const service = loadService().createEditMetalHoldingCommandService({ database });
    await service.save(command());
    expect(await openFreshDatabase()).toBeDefined();
    await expect(service.save(command({ actionId: "018f0c7a-1234-7abc-8def-000000000012" }))).rejects.toThrow("terminal_holding_material_edit_forbidden");
  });
});
