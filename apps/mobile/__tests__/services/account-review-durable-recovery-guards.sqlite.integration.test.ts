/**
 * #395 T051 physical negative tests added to the frozen twelve T044 cases.
 * Real Watermelon/SQLite, same established Save+root+production boundaries.
 */
import { Q, Database } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Account,
  AccountFinancialEffect,
  BankDetails,
  FinancialActionGroup,
} from "@monyvi/db";
import { productionFinancialActionReconciliationService } from
  "../../services/financial-action-reconciliation-production";
import {
  database, cloneRecoverySqlite, resetRecoverySqlite,
  saveReview, seedBoundSmsReview,
} from "./account-review-local-recovery-test-harness";
import {
  ACTION, BANK, OWNER, makeSaveFixture,
} from "./account-review-save-test-fixtures";
import {
  readPhysicalPrivateSnapshot, stageRejectedRoot,
} from "./account-review-durable-recovery-test-helpers";
import {
  physicalSaveLedgerSnapshot,
} from "./account-review-save-sqlite-test-helpers";

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
  const original = new wm.Database({ adapter, modelClasses: models });
  let current = original;
  return {
    get database(): Database { return current; },
    __original: original,
    __setDatabase: (value: Database): void => { current = value; },
    __adapter: adapter, schema, Q: wm.Q,
    ...Object.fromEntries(models.map((model) => [model.name, model])),
  };
});
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(OWNER),
  supabase: {},
}));
interface DbModule {
  readonly __original: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __setDatabase: (db: Database) => void;
}
const moduleDb = jest.requireMock<DbModule>("@monyvi/db");
beforeEach(async (): Promise<void> => {
  moduleDb.__setDatabase(moduleDb.__original);
  await resetRecoverySqlite();
});
afterEach((): void => {
  moduleDb.__setDatabase(moduleDb.__original);
});

describe("#395 T051 physical negative compensation rollback", () => {
  it("G01 missing actual created Bank child refuses recovery without deactivating a real effect", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    const privateSnapshot = await readPhysicalPrivateSnapshot(database);
    const bank = privateSnapshot.createdEntityRefs.find(
      (ref) => ref.entity === "bank_details"
    );
    if (!bank) throw new Error("expected_physical_bank_child");
    await stageRejectedRoot(database);
    const fresh = await cloneRecoverySqlite();
    moduleDb.__setDatabase(fresh);
    await fresh.write(async (): Promise<void> => {
      const child = await fresh.get<BankDetails>("bank_details").find(bank.id);
      await fresh.batch(child.prepareDestroyPermanently());
    });
    const before = await physicalSaveLedgerSnapshot(fresh);
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(ACTION)
    ).rejects.toThrow();
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(before);
    const effects = await fresh.get<AccountFinancialEffect>(
      "account_financial_effects"
    ).query(Q.where("action_id", ACTION)).fetch();
    expect(effects.length).toBeGreaterThan(0);
    expect(effects.every((effect) => effect.isEffective)).toBe(true);
    const roots = await fresh.get<FinancialActionGroup>(
      "financial_action_groups"
    ).query(Q.where("action_id", ACTION)).fetch();
    expect(roots[0]?.state).toBe("rejected_compensating");
  });

  it("G02 newer original-default choice refuses rollback of the new account and all linked effects", async () => {
    const fixture = makeSaveFixture("sms-new-wallet");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    await stageRejectedRoot(database);
    const fresh = await cloneRecoverySqlite();
    moduleDb.__setDatabase(fresh);
    await fresh.write(async (): Promise<void> => {
      const priorDefault = await fresh.get<Account>("accounts").find(BANK);
      await priorDefault.update((account): void => {
        account.isDefault = false;
      });
    });
    const before = await physicalSaveLedgerSnapshot(fresh);
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(ACTION)
    ).rejects.toThrow();
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(before);
    const root = await fresh.get<FinancialActionGroup>(
      "financial_action_groups"
    ).query(Q.where("action_id", ACTION)).fetch();
    expect(root[0]?.state).toBe("rejected_compensating");
  });
});
