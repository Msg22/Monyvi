import { createHash } from "node:crypto";

import { Database, type Model } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type { Sha256Provider } from "../../../../packages/logic/src/financial-actions";
import { schema } from "../../../../packages/db/src/schema";
import { FinancialActionGroup } from "../../../../packages/db/src/models/FinancialActionGroup";
import { MetalActionEvidence } from "../../../../packages/db/src/models/MetalActionEvidence";
import { MetalHoldingState } from "../../../../packages/db/src/models/MetalHoldingState";
import { MetalLifecycleEvent } from "../../../../packages/db/src/models/MetalLifecycleEvent";
import {
  METAL_ACTION_KINDS,
  assertCanonicalMetalRevision,
  createMetalFinancialActionEnvelope,
} from "../../services/metal-financial-action-adapter";
import { createMetalHoldingCommandService } from "../../services/metal-holding-command-service";
import {
  createMetalFinancialActionRepository,
  createWatermelonMetalFinancialActionRepositoryDependencies,
  type MetalFinancialActionRepositoryDependencies,
} from "../../services/metal-financial-action-repository";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual("@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js")
);

const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
const HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000004";
const sha256Provider: Sha256Provider = {
  digestUtf8: (value: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(value).digest("hex")),
};

function createDependencies(): MetalFinancialActionRepositoryDependencies & {
  readonly rows: Array<Record<string, unknown>>;
} {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    getCurrentUserId: () => Promise.resolve(USER_ID),
    runWriter: async <T>(writer: () => Promise<T>): Promise<T> => writer(),
    findAction: (userId, actionId) =>
      Promise.resolve(rows.find((row) => row.userId === userId && row.actionId === actionId) ?? null),
    persistAtomically: (records) => {
      rows.push(...records.map((record) => ({ ...record })));
      return Promise.resolve();
    },
  };
}

describe("Metals financial action foundation", () => {
  it("persists one owner/action winner and replays from a fresh real-SQLite database", async () => {
    const adapter = new SQLiteAdapter({ schema });
    const modelClasses: Array<typeof Model> = [
      FinancialActionGroup,
      MetalActionEvidence,
      MetalHoldingState,
      MetalLifecycleEvent,
    ];
    const database = new Database({ adapter, modelClasses });
    const service = createMetalHoldingCommandService({
      repository: createMetalFinancialActionRepository(
        createWatermelonMetalFinancialActionRepositoryDependencies({ database, userId: USER_ID })
      ),
      hashProvider: sha256Provider,
    });
    const input = {
      actionId: "018f0c7a-1234-7abc-8def-000000000001",
      userId: USER_ID,
      holdingId: HOLDING_ID,
      kind: "add" as const,
      expectedHoldingRevision: null,
      occurredAt: "2026-08-31T10:15:30.123Z",
      domainPayload: { includeAccountCredit: false },
    };

    await expect(service.execute(input)).resolves.toMatchObject({ kind: "committed" });
    const clonedAdapter = await adapter.testClone();
    const reopened = new Database({ adapter: clonedAdapter, modelClasses });
    const reopenedService = createMetalHoldingCommandService({
      repository: createMetalFinancialActionRepository(
        createWatermelonMetalFinancialActionRepositoryDependencies({ database: reopened, userId: USER_ID })
      ),
      hashProvider: sha256Provider,
    });

    await expect(reopenedService.execute(input)).resolves.toMatchObject({ kind: "replay" });
    await expect(
      reopened.get<FinancialActionGroup>("financial_action_groups").query().fetchCount()
    ).resolves.toBe(1);
    await expect(
      reopened.get<MetalActionEvidence>("metal_action_evidence").query().fetchCount()
    ).resolves.toBe(1);
    await expect(
      reopened.get<MetalLifecycleEvent>("metal_lifecycle_events").query().fetchCount()
    ).resolves.toBe(1);
    await expect(
      reopened.get<MetalHoldingState>("metal_holding_states").query().fetchCount()
    ).resolves.toBe(1);
    const [state] = await reopened.get<MetalHoldingState>("metal_holding_states").query().fetch();
    const [event] = await reopened.get<MetalLifecycleEvent>("metal_lifecycle_events").query().fetch();
    expect(state?.effectiveEventId).toBe(event?.id);
  });

  it("keeps every expected holding revision in Metals evidence only", async () => {
    const dependencies = createDependencies();
    const service = createMetalHoldingCommandService({
      repository: createMetalFinancialActionRepository(dependencies),
      hashProvider: sha256Provider,
    });

    for (const [index, kind] of METAL_ACTION_KINDS.entries()) {
      dependencies.rows.splice(0);
      const actionId = `018f0c7a-1234-7abc-8def-${String(index + 1).padStart(12, "0")}`;
      const result = await service.execute({
        actionId,
        userId: USER_ID,
        holdingId: HOLDING_ID,
        kind,
        expectedHoldingRevision: kind === "add" ? null : String(index),
        occurredAt: "2026-08-31T10:15:30.123Z",
        domainPayload: { includeAccountCredit: false },
      });

      expect(result.kind).toBe("committed");
      expect(dependencies.rows.find((row) => row.table === "financial_action_groups")).not.toHaveProperty(
        "expectedHoldingRevision"
      );
      expect(dependencies.rows.find((row) => row.table === "metal_action_evidence")).toMatchObject({
        actionId,
        expectedHoldingRevision: kind === "add" ? null : String(index),
      });
      expect(dependencies.rows.find((row) => row.table === "metal_lifecycle_events")).toMatchObject({
        actionId,
        kind,
      });
    }
  });

  it("rejects a stale expected holding revision atomically in real SQLite", async () => {
    const adapter = new SQLiteAdapter({ schema });
    const modelClasses: Array<typeof Model> = [
      FinancialActionGroup,
      MetalActionEvidence,
      MetalHoldingState,
      MetalLifecycleEvent,
    ];
    const database = new Database({ adapter, modelClasses });
    const service = createMetalHoldingCommandService({
      repository: createMetalFinancialActionRepository(
        createWatermelonMetalFinancialActionRepositoryDependencies({ database, userId: USER_ID })
      ),
      hashProvider: sha256Provider,
    });

    await service.execute({
      actionId: "018f0c7a-1234-7abc-8def-000000000010",
      userId: USER_ID,
      holdingId: HOLDING_ID,
      kind: "add",
      expectedHoldingRevision: null,
      occurredAt: "2026-08-31T10:15:30.123Z",
      domainPayload: {},
    });
    await expect(
      service.execute({
        actionId: "018f0c7a-1234-7abc-8def-000000000011",
        userId: USER_ID,
        holdingId: HOLDING_ID,
        kind: "correct",
        expectedHoldingRevision: "9",
        occurredAt: "2026-08-31T10:16:30.123Z",
        domainPayload: {},
      })
    ).rejects.toThrow("metal_holding_revision_stale");

    const states = await database.get<MetalHoldingState>("metal_holding_states").query().fetch();
    expect(states).toHaveLength(1);
    expect(states[0]?.financialRevision).toBe("0");
    await expect(
      database.get<FinancialActionGroup>("financial_action_groups").query().fetchCount()
    ).resolves.toBe(1);
  });

  it("replays the same action/hash and rejects a different payload", async () => {
    const dependencies = createDependencies();
    const service = createMetalHoldingCommandService({
      repository: createMetalFinancialActionRepository(dependencies),
      hashProvider: sha256Provider,
    });
    const input = {
      actionId: "018f0c7a-1234-7abc-8def-000000000001",
      userId: USER_ID,
      holdingId: HOLDING_ID,
      kind: "sell" as const,
      expectedHoldingRevision: "4",
      occurredAt: "2026-08-31T10:15:30.123Z",
      domainPayload: { includeAccountCredit: false },
    };

    await expect(service.execute(input)).resolves.toMatchObject({ kind: "committed" });
    await expect(service.execute(input)).resolves.toMatchObject({ kind: "replay" });
    await expect(
      service.execute({ ...input, domainPayload: { includeAccountCredit: true } })
    ).rejects.toThrow("action_id_payload_mismatch");
  });

  it("rolls back a failed atomic writer and never crosses user scope", async () => {
    const dependencies = createDependencies();
    const repository = createMetalFinancialActionRepository({
      ...dependencies,
      persistAtomically: () => Promise.reject(new Error("write_failed")),
    });
    const envelope = createMetalFinancialActionEnvelope({
      actionId: "018f0c7a-1234-7abc-8def-000000000001",
      userId: USER_ID,
      holdingId: HOLDING_ID,
      kind: "dispose",
      expectedHoldingRevision: "2",
      occurredAt: "2026-08-31T10:15:30.123Z",
      domainPayload: {},
    });

    await expect(repository.commit({ envelope, hashProvider: sha256Provider })).rejects.toThrow(
      "write_failed"
    );
    expect(dependencies.rows).toHaveLength(0);
    await expect(
      repository.commit({ envelope: { ...envelope, userId: "foreign" }, hashProvider: sha256Provider })
    ).rejects.toThrow("metal_action_auth_scope_changed");
  });

  it("rejects noncanonical or overflowing revision values before persistence", () => {
    for (const revision of ["", "00", "01", "-1", "1.0", "9223372036854775808"]) {
      expect(() => assertCanonicalMetalRevision(revision)).toThrow("invalid_metal_revision");
    }
    expect(assertCanonicalMetalRevision("9223372036854775807")).toBe(
      "9223372036854775807"
    );
  });
});
