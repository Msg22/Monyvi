import type { Database, Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";

interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: Array<typeof Model>;
}

/** Actual models/schema/SQLite adapter; only the native dispatcher is redirected. */
export function createSmsReviewSqliteTestDatabase(): TestDatabaseModule {
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  const Adapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const names = [
    "SmsReviewQueue",
    "SmsReviewDraftItem",
    "DismissedSmsFingerprint",
    "Transaction",
    "Transfer",
    "Account",
    "BankDetails",
    "AccountSmsSender",
    "Profile",
    "Category",
  ];
  const models = Object.fromEntries(
    names.map((name): readonly [string, typeof Model] => {
      const module = jest.requireActual<Record<string, typeof Model>>(
        `../../../../packages/db/src/models/${name}`
      );
      const model = module[name];
      if (!model) throw new Error("Missing real SQLite fixture model");
      return [name, model];
    })
  );
  const modelClasses = Object.values(models);
  const adapter = new Adapter({ schema });
  return {
    ...models,
    database: new WatermelonDatabase({ adapter, modelClasses }),
    __adapter: adapter,
    __modelClasses: modelClasses,
  };
}
