/** #395 L4 accepted-only closed tombstone cleanup, genuine local SQLite.
 * Independent synthetic test runtime; no raw user SMS, credentials or provider.
 */
import { type Database } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";
import { serializeCanonicalJsonValue } from "@monyvi/logic";
import { clearAcceptedAccountReviewPrivateEvidence } from "../../services/account-review-retention-terminal";
import {
  database,
  resetRecoverySqlite,
  cloneRecoverySqlite,
  saveReview,
  seedBoundSmsReview,
} from "./account-review-local-recovery-test-harness";
import { financialRepository } from "./account-review-durable-recovery-test-helpers";
import { physicalSaveLedgerSnapshot } from "./account-review-save-sqlite-test-helpers";
import {
  physicalSmsSnapshot,
  root,
} from "./account-review-all-dedup-physical-test-helpers";
import {
  ACTION,
  makeSaveFixture,
  testUuid,
} from "./account-review-save-test-fixtures";

let mockRandomUuid = 0;
jest.mock("expo-crypto", () => {
  const { createHash } =
    jest.requireActual<typeof import("node:crypto")>("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: (algorithm: string, source: string): Promise<string> =>
      algorithm === "SHA-256"
        ? Promise.resolve(createHash("sha256").update(source).digest("hex"))
        : Promise.reject(new Error("unsupported")),
    randomUUID: (): string =>
      "e1000000-0000-4000-8000-" + String(++mockRandomUuid).padStart(12, "0"),
  };
});
jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("@monyvi/db", () => {
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
  const initial: Database = new wm.Database({ adapter, modelClasses: models });
  return {
    database: initial,
    __initial: initial,
    __adapter: adapter,
    schema,
    Q: wm.Q,
    ...Object.fromEntries(models.map((m) => [m.name, m])),
  };
});
jest.mock("@/services/supabase", () => ({
  // Hoist-safe synthetic test owner: testUuid(1) in the shared fixture.
  getCurrentUserId: (): Promise<string> =>
    Promise.resolve("018f0c7a-1234-4abc-8def-000000000001"),
  supabase: {},
}));
interface Runtime {
  readonly __initial: Database;
  readonly __adapter: SQLiteAdapter;
}
// Keep the real SQLite mock-module initialization; no unused runtime binding.
jest.requireMock<Runtime>("@monyvi/db");
let nextId = 70000;
beforeEach(async (): Promise<void> => {
  mockRandomUuid = 0;
  setGenerator(() => testUuid(++nextId));
  await resetRecoverySqlite();
});
afterEach((): void => {
  jest.restoreAllMocks();
});

describe("L4 sealed accepted-only SMS terminal cleanup", () => {
  it("L4-TERMINAL-FULL seals and purges fully saved deleted-only queue on accepted ACK", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toEqual({ kind: "committed" });
    const before = await physicalSmsSnapshot(await cloneRecoverySqlite());
    expect(before.queues.some((row) => row._status === "deleted")).toBe(true);
    expect(before.drafts.some((row) => row._status === "deleted")).toBe(true);
    const repository = financialRepository(database);
    await repository.markFinancialActionGroupSyncPending(ACTION);
    await repository.recordFinancialActionGroupServerOutcome(
      ACTION,
      "accepted",
      serializeCanonicalJsonValue({
        actionId: ACTION,
        status: "accepted",
        accountRevisions: [],
        canonicalAccounts: [],
      }),
      null
    );
    const financialBefore = await physicalSaveLedgerSnapshot(
      await cloneRecoverySqlite()
    );
    await clearAcceptedAccountReviewPrivateEvidence({
      database,
      actionId: ACTION,
    });
    expect((await root(database, ACTION)).state).toBe("accepted");
    expect((await root(database, ACTION)).localRecoverySnapshotJson).toBeNull();
    expect(await physicalSmsSnapshot(await cloneRecoverySqlite())).toEqual({
      queues: [],
      drafts: [],
    });
    const financialAfter = await physicalSaveLedgerSnapshot(
      await cloneRecoverySqlite()
    );
    for (const table of [
      "accounts",
      "transactions",
      "transfers",
      "account_financial_effects",
      "bank_details",
      "account_sms_senders",
    ]) {
      expect(financialAfter.find((x) => x.table === table)?.rows).toEqual(
        financialBefore.find((x) => x.table === table)?.rows
      );
    }
  });
});
