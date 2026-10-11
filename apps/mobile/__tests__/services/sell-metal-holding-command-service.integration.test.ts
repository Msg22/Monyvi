import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  Account,
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
  MetalRateReference,
} from "@monyvi/db";
import { DEFAULT_FINANCIAL_ACTION_REGISTRY } from "@monyvi/logic";

import { createFinancialActionFoundationRepository } from "../../services/financial-action-foundation-repository";
import type { SellMetalHoldingCommandService } from "../../services/sell-metal-holding-command-service";
import { seedRestoredLegacyChain } from "./sell-metal-holding-lifecycle-fixtures";
import {
  IDS,
  command,
  createEnvelope,
  createService as buildCommandService,
  exactMetalRate,
  loadCommandModule,
  loadPreviewModule,
  mockScopeValue,
  openFreshDatabase as openFreshDatabaseFixture,
  previewInput,
  seedHolding as seedHoldingFixture,
  sha256Provider,
  type TestDatabaseModule,
} from "./sell-metal-holding-command-fixtures";

jest.mock("../../services/user-data-access", () => {
  const { Q: WatermelonQuery } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return {
    getCurrentUserDataScope: jest.fn(() => Promise.resolve(mockScopeValue())),
    assertExpectedCurrentUser: jest.fn(() => Promise.resolve()),
    findOwnedById: async <T extends { readonly userId: string }>(
      collection: { readonly find: (id: string) => Promise<T> },
      id: string,
      expectedUserId: string
    ): Promise<T> => {
      const record = await collection.find(id);
      if (record.userId !== expectedUserId) throw new Error("ownership_failed");
      return record;
    },
    queryChildrenOfOwnedParent: (
      collection: { readonly query: (...clauses: unknown[]) => unknown },
      parent: { readonly id: string; readonly userId: string },
      expectedUserId: string,
      foreignKey: string,
      ...clauses: unknown[]
    ): unknown => {
      if (parent.userId !== expectedUserId) throw new Error("ownership_failed");
      return collection.query(
        WatermelonQuery.where(foreignKey, parent.id),
        ...clauses
      );
    },
  };
});

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);

jest.mock("@monyvi/db", () => {
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  const SQLiteAdapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const modelClasses = [
    "Account",
    "Asset",
    "AssetMetal",
    "FinancialActionGroup",
    "MetalActionEvidence",
    "MetalHoldingState",
    "MetalLifecycleEvent",
    "MetalRateReference",
    "Transaction",
  ].map(
    (name) =>
      jest.requireActual<
        Record<string, typeof import("@nozbe/watermelondb").Model>
      >(`../../../../packages/db/src/models/${name}`)[name]
  );
  const adapter = new SQLiteAdapter({ schema });
  return {
    database: new WatermelonDatabase({ adapter, modelClasses }),
    __adapter: adapter,
    __modelClasses: modelClasses,
  };
});

const {
  database,
  __adapter: adapter,
  __modelClasses: modelClasses,
} = jest.requireMock<TestDatabaseModule>("@monyvi/db");

function createService(
  db: Database = database
): SellMetalHoldingCommandService {
  return buildCommandService(db);
}

function openFreshDatabase(): Promise<Database> {
  return openFreshDatabaseFixture(adapter, modelClasses);
}

function seedHolding(status: "active" | "sold" = "active"): Promise<void> {
  return seedHoldingFixture(database, status);
}

describe("Sell metal holding exact preview", () => {
  it("calculates gross, same-currency fee, net proceeds, and realized P/L exactly", (): void => {
    const result =
      loadPreviewModule().buildSellMetalHoldingPreview(previewInput());
    expect(result).toMatchObject({
      validationErrors: {},
      grossProceedsMinorUnits: "17000000",
      feeMinorUnits: "50000",
      netProceedsMinorUnits: "16950000",
      netProceedsDecimal: "169500",
      realizedProfitLossDecimal: "18221.8",
      requiresRateAcknowledgment: false,
      canSubmit: true,
    });
  });

  it("treats an omitted optional fee as exact zero in the sale currency", (): void => {
    const result = loadPreviewModule().buildSellMetalHoldingPreview(
      previewInput({ feeDecimal: "" })
    );
    expect(result).toMatchObject({
      feeMinorUnits: "0",
      grossProceedsMinorUnits: "17000000",
      netProceedsMinorUnits: "17000000",
      netProceedsDecimal: "170000",
      realizedProfitLossDecimal: "18721.8",
      canSubmit: true,
    });
  });

  it.each([
    ["zero gross", { grossProceedsDecimal: "0" }, "grossProceedsDecimal"],
    ["negative fee", { feeDecimal: "-1" }, "feeDecimal"],
    ["fee above gross", { feeDecimal: "170000.01" }, "feeDecimal"],
    ["future date", { saleDate: "2026-09-02" }, "saleDate"],
    ["before purchase", { saleDate: "2024-03-13" }, "saleDate"],
  ] as const)(
    "blocks %s without rounding or persistence",
    (_name, overrides, field) => {
      const result = loadPreviewModule().buildSellMetalHoldingPreview(
        previewInput(overrides)
      );
      expect(result.validationErrors[field]).toBeDefined();
      expect(result.canSubmit).toBe(false);
    }
  );

  it("does not require acknowledgment for unused same-currency rates", (): void => {
    const stale = exactMetalRate("terminal_metal", "104.405044", "stale");
    const result = loadPreviewModule().buildSellMetalHoldingPreview(
      previewInput({ saleMetalRate: stale, hasAcknowledgedRateRisk: false })
    );
    expect(result.requiresRateAcknowledgment).toBe(false);
    expect(result.canSubmit).toBe(true);
  });
});

describe("Sell metal holding command SQLite atomicity", () => {
  it.each(["PLATINUM", "PALLADIUM"] as const)(
    "rejects unsupported %s instead of shaping a sellable holding",
    async (metalType): Promise<void> => {
      await seedHolding();
      const [metal] = await database
        .get<AssetMetal>("asset_metals")
        .query()
        .fetch();
      if (!metal) throw new Error("missing_metal_fixture");
      await database.write(async (): Promise<void> => {
        await metal.update((record): void => {
          record.metalType = metalType;
        });
      });
      const { loadSellableMetalHolding } = jest.requireActual<
        typeof import("../../services/sell-metal-holding-facade-service")
      >("../../services/sell-metal-holding-facade-service");
      await expect(
        loadSellableMetalHolding(database, IDS.holding, "en")
      ).rejects.toThrow("metal_holding_not_found");
    }
  );

  beforeEach(async (): Promise<void> => {
    await adapter.initializingPromise;
    await database.write(
      async (): Promise<void> => database.unsafeResetDatabase()
    );
    jest.restoreAllMocks();
  });

  it("sells only an active whole holding and persists immutable local-first History evidence", async (): Promise<void> => {
    await seedHolding();
    await expect(createService().sell(command())).resolves.toEqual({
      kind: "committed",
      holdingId: IDS.holding,
    });
    const state = (
      await database
        .get<MetalHoldingState>("metal_holding_states")
        .query()
        .fetch()
    )[0];
    expect(state).toMatchObject({
      status: "sold",
      financialRevision: "1",
      effectiveActionId: IDS.saleAction,
      effectiveEventId: IDS.saleAction,
      reconciliationState: "sync_pending",
    });
    const events = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query(Q.sortBy("occurred_at", Q.asc))
      .fetch();
    expect(events).toHaveLength(2);
    expect(events[0].isEffective).toBe(true);
    expect(events[1]).toMatchObject({
      actionId: IDS.saleAction,
      kind: "sell",
      isEffective: true,
      isHistoryVisible: true,
      predecessorEventId: IDS.createdEvent,
    });
    expect(
      await database
        .get<MetalActionEvidence>("metal_action_evidence")
        .query()
        .fetch()
    ).toHaveLength(1);
    expect(
      await database
        .get<MetalRateReference>("metal_rate_references")
        .query()
        .fetch()
    ).toHaveLength(3);
  });

  it("creates no account or ordinary-income side effect and removes active net-worth contribution", async (): Promise<void> => {
    await seedHolding();
    const before = await database.get<Account>("accounts").find(IDS.account);
    expect(before.balance).toBe(2500);
    await createService().sell(command());
    const after = await database.get<Account>("accounts").find(IDS.account);
    expect(after.balance).toBe(2500);
    expect(
      await database.get<Model>("transactions").query().fetch()
    ).toHaveLength(0);
    const [state] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    if (!state) throw new Error("missing_holding_state_fixture");
    expect(state.status).toBe("sold");
  });

  it("survives database re-instantiation with the sold state, immutable History, and unchanged account", async (): Promise<void> => {
    await seedHolding();
    await createService().sell(command());

    const reopened = await openFreshDatabase();
    const [state] = await reopened
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    const events = await reopened
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query()
      .fetch();
    const account = await reopened.get<Account>("accounts").find(IDS.account);
    expect(state).toMatchObject({
      status: "sold",
      effectiveActionId: IDS.saleAction,
      effectiveEventId: IDS.saleAction,
      reconciliationState: "sync_pending",
    });
    expect(events).toHaveLength(2);
    expect(events.find((event) => event.id === IDS.saleAction)).toMatchObject({
      kind: "sell",
      isEffective: true,
      isHistoryVisible: true,
    });
    expect(account.balance).toBe(2500);
    expect(
      await reopened.get<Model>("transactions").query().fetch()
    ).toHaveLength(0);
  });

  it.each(["sold", "disposed"] as const)(
    "rejects a %s holding without writing a sale action",
    async (status): Promise<void> => {
      await seedHolding(status === "sold" ? "sold" : "active");
      if (status === "disposed") {
        await database.write(async (): Promise<void> => {
          await (
            await database
              .get<MetalHoldingState>("metal_holding_states")
              .query()
              .fetch()
          )[0].update((record): void => {
            record.status = "disposed";
          });
        });
      }
      await expect(createService().sell(command())).rejects.toThrow(
        "metal_holding_not_active"
      );
      expect(
        await database
          .get<FinancialActionGroup>("financial_action_groups")
          .query()
          .fetch()
      ).toHaveLength(1);
    }
  );

  it("replays exactly once across service recreation and rejects a changed payload", async (): Promise<void> => {
    await seedHolding();
    await createService().sell(command());
    await expect(createService().sell(command())).resolves.toEqual({
      kind: "replay",
      holdingId: IDS.holding,
    });
    await expect(
      createService().sell(command({ notes: "Changed payload" }))
    ).rejects.toThrow("action_id_payload_mismatch");
    expect(
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch()
    ).toHaveLength(2);
  });

  it("rolls back root, state, History, rates, and account when SQLite batch fails, then permits retry", async (): Promise<void> => {
    await seedHolding();
    const batch = jest
      .spyOn(database, "batch")
      .mockRejectedValueOnce(new Error("fixture_sqlite_failure"));
    const service = createService();
    await expect(service.sell(command())).rejects.toThrow(
      "fixture_sqlite_failure"
    );
    batch.mockRestore();
    expect(
      await database
        .get<FinancialActionGroup>("financial_action_groups")
        .query()
        .fetch()
    ).toHaveLength(1);
    expect(
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch()
    ).toHaveLength(1);
    expect(
      (
        await database
          .get<MetalHoldingState>("metal_holding_states")
          .query()
          .fetch()
      )[0].status
    ).toBe("active");
    expect(
      (await database.get<Account>("accounts").find(IDS.account)).balance
    ).toBe(2500);
    await expect(service.sell(command())).resolves.toEqual({
      kind: "committed",
      holdingId: IDS.holding,
    });
  });
  it("rejects cross-currency sale before any write", async (): Promise<void> => {
    await seedHolding();
    await expect(
      createService().sell(command({ saleCurrency: "USD", rateSnapshots: [] }))
    ).rejects.toThrow("metal_sale_currency_mismatch");
    expect(
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch()
    ).toHaveLength(1);
  });
  it("rechecks holding revision inside the queued writer", async (): Promise<void> => {
    await seedHolding();
    const first = createService().sell(command());
    const second = createService().sell(
      command({ actionId: IDS.saleEvidence })
    );
    const results = await Promise.allSettled([first, second]);
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch()
    ).toHaveLength(2);
  });
  it("fails owner changes before projection access", async (): Promise<void> => {
    await seedHolding();
    const dependencies = {
      database,
      getCurrentUserDataScope: () =>
        Promise.resolve({
          ...mockScopeValue(),
          userId: "018f0c7a-1234-7abc-8def-000000000999",
        }),
      commitFinancialActionGroupLocally:
        createFinancialActionFoundationRepository({
          database,
          getCurrentUserDataScope: () => Promise.resolve(mockScopeValue()),
          assertExpectedCurrentUser: () => Promise.resolve(),
          registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
        }).commitFinancialActionGroupLocally,
      createEnvelope,
      hashProvider: sha256Provider,
    };
    await expect(
      loadCommandModule()
        .createSellMetalHoldingCommandService(dependencies)
        .sell(command())
    ).rejects.toThrow("financial_action_auth_scope_changed");
    expect(
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch()
    ).toHaveLength(1);
  });

  it.each([1, 2, 3])(
    "sells a migrated holding after %i immutable Dispose/Undo pairs",
    async (pairs): Promise<void> => {
      await seedHolding();
      const head = await seedRestoredLegacyChain(database, IDS, pairs);
      const before = await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch();
      const originalPayloads = before.map((event) => [
        event.id,
        event.payloadJson,
        event.predecessorEventId,
        event.reversesEventId,
      ]);
      await expect(createService().sell(command(head))).resolves.toEqual({
        kind: "committed",
        holdingId: IDS.holding,
      });
      const state = await database
        .get<MetalHoldingState>("metal_holding_states")
        .find(IDS.state);
      expect(state).toMatchObject({
        status: "sold",
        financialRevision: String(pairs * 2 + 1),
        effectiveEventId: IDS.saleAction,
      });
      const after = await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch();
      expect(after).toHaveLength(pairs * 2 + 1);
      expect(
        after
          .filter((event) => event.id !== IDS.saleAction)
          .map((event) => [
            event.id,
            event.payloadJson,
            event.predecessorEventId,
            event.reversesEventId,
          ])
      ).toEqual(originalPayloads);
    }
  );

  it.each([
    "pending_local",
    "reconciliation_incomplete",
    "unknown_state",
    "accepted_missing_outcome",
    "sync_failed_missing_code",
    "local_complete_with_outcome",
    "malformed_envelope",
    "event_payload_mismatch",
    "missing_root",
    "rejected_compensating",
    "reconciled",
  ])(
    "blocks a production-shaped chain with %s root evidence",
    async (variant): Promise<void> => {
      await seedHolding();
      await database.write(async (): Promise<void> => {
        await (
          await database
            .get<FinancialActionGroup>("financial_action_groups")
            .find(IDS.createdAction)
        ).update((record): void => {
          record.state =
            variant === "accepted_missing_outcome"
              ? "accepted"
              : variant === "sync_failed_missing_code"
                ? "sync_failed"
                : [
                      "local_complete_with_outcome",
                      "malformed_envelope",
                      "event_payload_mismatch",
                      "missing_root",
                    ].includes(variant)
                  ? "local_complete"
                  : variant;
          if (variant === "reconciliation_incomplete")
            record.rejectionCode = "recovery_required";
          if (
            [
              "rejected_compensating",
              "reconciled",
              "local_complete_with_outcome",
            ].includes(variant)
          ) {
            record.serverOutcome = "rejected";
            record.outcomeJson = '{"kind":"rejected"}';
            record.rejectionCode = "holding_revision_conflict";
          }
          if (variant === "malformed_envelope") record.payloadJson = "{}";
        });
        if (variant === "event_payload_mismatch")
          await (
            await database
              .get<MetalLifecycleEvent>("metal_lifecycle_events")
              .find(IDS.createdEvent)
          ).update((record): void => {
            record.payloadJson = "{}";
          });
        if (variant === "missing_root")
          await (
            await database
              .get<FinancialActionGroup>("financial_action_groups")
              .find(IDS.createdAction)
          ).destroyPermanently();
      });
      await expect(createService().sell(command())).rejects.toThrow(
        "metal_sell_lifecycle_conflict"
      );
      expect(
        await database
          .get<FinancialActionGroup>("financial_action_groups")
          .query()
          .fetch()
      ).toHaveLength(variant === "missing_root" ? 0 : 1);
      expect(
        await database
          .get<MetalLifecycleEvent>("metal_lifecycle_events")
          .query()
          .fetch()
      ).toHaveLength(1);
      expect(
        await database
          .get<MetalActionEvidence>("metal_action_evidence")
          .query()
          .fetch()
      ).toHaveLength(0);
      expect(
        await database
          .get<MetalHoldingState>("metal_holding_states")
          .find(IDS.state)
      ).toMatchObject({ status: "active", financialRevision: "0" });
    }
  );

  it.each(["local_complete", "sync_pending", "sync_failed", "accepted"])(
    "allows complete %s root evidence",
    async (state): Promise<void> => {
      await seedHolding();
      await database.write(async (): Promise<void> => {
        await (
          await database
            .get<FinancialActionGroup>("financial_action_groups")
            .find(IDS.createdAction)
        ).update((record): void => {
          record.state = state;
          if (state === "sync_failed")
            record.rejectionCode = "transport_failed";
          if (state === "accepted") {
            record.serverOutcome = "accepted";
            record.outcomeJson = '{"kind":"accepted"}';
          }
        });
      });
      await expect(createService().sell(command())).resolves.toEqual({
        kind: "committed",
        holdingId: IDS.holding,
      });
    }
  );

  it("rejects inconsistent root-event timestamps before recording a sale", async (): Promise<void> => {
    await seedHolding();
    const acquisition = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .find(IDS.createdEvent);
    await database.write(async (): Promise<void> => {
      await acquisition.update((event): void => {
        event.occurredAt = new Date("2024-03-15T00:00:00.000Z");
      });
    });
    await expect(createService().sell(command())).rejects.toThrow(
      "metal_sell_lifecycle_conflict"
    );
    expect(
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch()
    ).toHaveLength(1);
    expect(
      await database
        .get<MetalActionEvidence>("metal_action_evidence")
        .query()
        .fetch()
    ).toHaveLength(0);
  });

  it("rejects malformed original Dispose proof on an apparently restored migrated holding", async (): Promise<void> => {
    await seedHolding();
    const head = await seedRestoredLegacyChain(database, IDS, 1);
    await database.write(async (): Promise<void> => {
      await (
        await database
          .get<FinancialActionGroup>("financial_action_groups")
          .find("018f0c7a-1234-7abc-8def-000000000200")
      ).update((record): void => {
        record.payloadJson = "{}";
      });
    });
    await expect(createService().sell(command(head))).rejects.toThrow(
      "metal_sell_lifecycle_conflict"
    );
    expect(
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch()
    ).toHaveLength(2);
  });

  it.each(["local", "legacy"])(
    "preserves the %s purchase calendar day in facade and queued date validation",
    async (storage): Promise<void> => {
      await seedHolding();
      const stored =
        storage === "local"
          ? new Date("2026-08-26T21:00:00.000Z")
          : new Date("2026-08-27T00:00:00.000Z");
      // Simulate Cairo local components portably; SQLite still holds the real timestamp.
      jest.spyOn(stored, "getFullYear").mockReturnValue(2026);
      jest.spyOn(stored, "getMonth").mockReturnValue(7);
      jest
        .spyOn(stored, "getDate")
        .mockReturnValue(storage === "local" ? 27 : 26);
      const asset = await database.get<Asset>("assets").find(IDS.holding);
      await database.write(async (): Promise<void> => {
        await asset.update((record): void => {
          record.purchaseDate = stored;
        });
      });
      const purchaseDate = jest
        .spyOn(asset, "purchaseDate", "get")
        .mockReturnValue(stored);
      const { loadSellableMetalHolding } = jest.requireActual<
        typeof import("../../services/sell-metal-holding-facade-service")
      >("../../services/sell-metal-holding-facade-service");
      expect(
        (await loadSellableMetalHolding(database, IDS.holding, "en"))
          .purchaseDate
      ).toBe("2026-08-27");
      await expect(
        createService().sell(command({ saleDate: "2026-08-26" }))
      ).rejects.toThrow("metal_sell_date_before_acquisition");
      await expect(
        createService().sell(command({ saleDate: "2026-08-27" }))
      ).resolves.toEqual({ kind: "committed", holdingId: IDS.holding });
      purchaseDate.mockRestore();
    }
  );
});
