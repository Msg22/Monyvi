import { createHash } from "node:crypto";

import type { Database, Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  hashFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "../../../../packages/logic/src/financial-actions";

interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: Array<typeof Model>;
}

let mockSqliteCurrentUserId = "018f0c7a-1234-7abc-8def-000000000003";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown => {
  const dispatcherModule: unknown = jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  );
  return dispatcherModule;
});

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
  const { FinancialActionGroup } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/FinancialActionGroup")
  >("../../../../packages/db/src/models/FinancialActionGroup");
  const adapter = new SQLiteAdapter({ schema });
  const modelClasses = [FinancialActionGroup];
  const database = new WatermelonDatabase({ adapter, modelClasses });

  return {
    database,
    FinancialActionGroup,
    __adapter: adapter,
    __modelClasses: modelClasses,
  };
});

jest.mock("../../services/user-data-access", () => {
  const { Q } = jest.requireActual<typeof import("@nozbe/watermelondb")>(
    "@nozbe/watermelondb"
  );
  return {
    getCurrentUserDataScope: jest.fn(() => Promise.resolve({
      userId: mockSqliteCurrentUserId,
      queryOwned: (
        collection: { query: (...clauses: unknown[]) => unknown },
        ...clauses: unknown[]
      ) =>
        collection.query(
          Q.where("user_id", mockSqliteCurrentUserId),
          ...clauses
        ),
      assertOwned: <T extends { userId: string }>(record: T): T => {
        if (record.userId !== mockSqliteCurrentUserId) {
          throw new Error("ownership_failed");
        }
        return record;
      },
    })),
    assertExpectedCurrentUser: jest.fn(
      (expectedUserId: string): Promise<void> => {
        if (expectedUserId !== mockSqliteCurrentUserId) {
          throw new Error("auth_scope_changed");
        }
        return Promise.resolve();
      }
    ),
  };
});

import type { FinancialActionGroup } from "@monyvi/db";
import { createFinancialActionFoundationRepository } from "../../services/financial-action-foundation-repository";

const {
  database,
  __adapter: adapter,
  __modelClasses: modelClasses,
} = jest.requireMock<TestDatabaseModule>("@monyvi/db");

const ACTION_ID = "018f0c7a-1234-7abc-8def-000000000001";
const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
const FOREIGN_USER_ID = "018f0c7a-1234-7abc-8def-000000000099";
const sha256Provider: Sha256Provider = {
  digestUtf8: (canonicalText: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(canonicalText, "utf8").digest("hex")),
};

function envelope(userId = USER_ID): FinancialActionEnvelopeV1 {
  return {
    actionId: ACTION_ID,
    domain: "metals",
    domainReferenceId: "018f0c7a-1234-7abc-8def-000000000002",
    envelopeVersion: "monyvi.financial-action/v1",
    accountGuards: [],
    kind: "sell",
    occurredAt: "2026-08-31T10:15:30.123Z",
    payload: {
      feeMinorUnits: "80000",
      grossProceedsDecimal: "35500",
      holdingId: "018f0c7a-1234-7abc-8def-000000000004",
      includeAccountCredit: false,
      netProceedsMinorUnits: "3470000",
      notes: "ذهب",
      rateReferenceIds: [],
    },
    payloadVersion: "metals.sell/v1",
    userId,
  };
}

async function openFreshDatabase(): Promise<Database> {
  const clonedAdapter = await adapter.testClone();
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return new WatermelonDatabase({ adapter: clonedAdapter, modelClasses });
}

async function fetchAll(db: Database): Promise<FinancialActionGroup[]> {
  return db
    .get<FinancialActionGroup>("financial_action_groups")
    .query()
    .fetch();
}

function createRepository(
  db: Database
): ReturnType<typeof createFinancialActionFoundationRepository> {
  return createFinancialActionFoundationRepository({
    database: db,
    getCurrentUserDataScope: () => Promise.resolve({
      userId: mockSqliteCurrentUserId,
      queryOwned: (collection, ...clauses) =>
        collection.query(
          jest
            .requireActual<
              typeof import("@nozbe/watermelondb")
            >("@nozbe/watermelondb")
            .Q.where("user_id", mockSqliteCurrentUserId),
          ...clauses
        ),
      assertOwned: <T extends { userId: string }>(record: T): T => {
        if (record.userId !== mockSqliteCurrentUserId)
          throw new Error("ownership_failed");
        return record;
      },
    }),
    assertExpectedCurrentUser: (
      expectedUserId: string
    ): Promise<void> => {
      if (expectedUserId !== mockSqliteCurrentUserId) {
        throw new Error("auth_scope_changed");
      }
      return Promise.resolve();
    },
    registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
  });
}

describe("financial action foundation SQLite persistence", () => {
  beforeEach(async () => {
    await adapter.initializingPromise;
    mockSqliteCurrentUserId = USER_ID;
    await database.write(async (): Promise<void> => {
      await database.unsafeResetDatabase();
    });
    jest.restoreAllMocks();
  });

  it("persists an independent row id and replays after database re-instantiation", async () => {
    const repository = createRepository(database);
    const created = await repository.createFinancialActionGroup({
      envelope: envelope(),
      hashProvider: sha256Provider,
    });
    const reopened = await openFreshDatabase();
    const reopenedRepository = createRepository(reopened);

    expect(created.record.id).not.toBe(ACTION_ID);
    expect(await fetchAll(reopened)).toHaveLength(1);
    await expect(
      reopenedRepository.createFinancialActionGroup({
        envelope: envelope(),
        hashProvider: sha256Provider,
      })
    ).resolves.toMatchObject({ kind: "replay" });
    expect(await fetchAll(await openFreshDatabase())).toHaveLength(1);
  });

  it("rolls back a failed writer without leaving a durable row", async () => {
    const repository = createRepository(database);
    jest
      .spyOn(database.adapter, "batch")
      .mockRejectedValueOnce(new Error("write_failed"));

    await expect(
      repository.createFinancialActionGroup({
        envelope: envelope(),
        hashProvider: sha256Provider,
      })
    ).rejects.toThrow("write_failed");
    expect(await fetchAll(await openFreshDatabase())).toHaveLength(0);
  });

  it("rejects duplicate owner-scoped action identities in SQLite", async () => {
    const repository = createRepository(database);
    const actionEnvelope = envelope();
    const payload = await hashFinancialActionEnvelope(
      actionEnvelope,
      sha256Provider
    );
    await repository.createFinancialActionGroup({
      envelope: actionEnvelope,
      hashProvider: sha256Provider,
    });

    await expect(
      database.write(async (): Promise<void> => {
        await database
          .get<FinancialActionGroup>("financial_action_groups")
          .create((record) => {
            record.actionId = actionEnvelope.actionId;
            record.userId = actionEnvelope.userId;
            record.domain = actionEnvelope.domain;
            record.kind = actionEnvelope.kind;
            record.domainReferenceId = actionEnvelope.domainReferenceId;
            record.payloadJson = payload.canonicalText;
            record.payloadHash = payload.payloadHash;
            record.accountGuardsJson = "[]";
            record.state = "pending_local";
            record.serverOutcome = null;
            record.outcomeJson = null;
            record.rejectionCode = null;
            record.deleted = false;
            record.updatedAt = new Date();
          });
      })
    ).rejects.toMatchObject({
      name: "SqliteError",
      message:
        "UNIQUE constraint failed: financial_action_groups.user_id, financial_action_groups.action_id",
    });
    expect(await fetchAll(await openFreshDatabase())).toHaveLength(1);
  });

  it("persists retry transitions across fresh database instances", async () => {
    const repository = createRepository(database);
    await repository.createFinancialActionGroup({
      envelope: envelope(),
      hashProvider: sha256Provider,
    });
    const created = (await fetchAll(database))[0]!;
    await database.write(async (): Promise<void> => {
      await created.update((record) => {
        record.state = "sync_failed";
        record.rejectionCode = "offline";
      });
    });
    expect((await fetchAll(await openFreshDatabase()))[0]).toMatchObject({
      state: "sync_failed",
      rejectionCode: "offline",
    });

    const reopened = await openFreshDatabase();
    const reopenedRepository = createRepository(reopened);
    await reopenedRepository.retryFinancialActionGroup(ACTION_ID);
    expect((await fetchAll(await openFreshDatabase()))[0]).toMatchObject({
      state: "sync_pending",
      rejectionCode: null,
      deleted: false,
    });
  });

  it("preserves a foreign owner's same action id", async () => {
    const repository = createRepository(database);
    const foreignEnvelope = envelope(FOREIGN_USER_ID);
    const foreignPayload = await hashFinancialActionEnvelope(
      foreignEnvelope,
      sha256Provider
    );
    await database.write(async (): Promise<void> => {
      await database
        .get<FinancialActionGroup>("financial_action_groups")
        .create((record) => {
          record.actionId = ACTION_ID;
          record.userId = FOREIGN_USER_ID;
          record.domain = foreignEnvelope.domain;
          record.kind = foreignEnvelope.kind;
          record.domainReferenceId = foreignEnvelope.domainReferenceId;
          record.payloadJson = foreignPayload.canonicalText;
          record.payloadHash = foreignPayload.payloadHash;
          record.accountGuardsJson = "[]";
          record.state = "pending_local";
          record.serverOutcome = null;
          record.outcomeJson = null;
          record.rejectionCode = null;
          record.deleted = false;
          record.updatedAt = new Date();
        });
    });

    await repository.createFinancialActionGroup({
      envelope: envelope(),
      hashProvider: sha256Provider,
    });
    const rows = await fetchAll(await openFreshDatabase());
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.actionId === ACTION_ID)).toHaveLength(2);
    expect(rows.find((row) => row.userId === FOREIGN_USER_ID)).toMatchObject({
      deleted: false,
      state: "pending_local",
    });
  });
});
