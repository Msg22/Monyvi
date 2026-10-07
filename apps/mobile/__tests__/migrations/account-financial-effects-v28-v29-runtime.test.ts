interface SqliteStatement {
  readonly all: <T>() => T[];
  readonly run: (...parameters: readonly unknown[]) => unknown;
}

interface SqliteDatabase {
  readonly close: () => void;
  readonly exec: (sql: string) => void;
  readonly prepare: (sql: string) => SqliteStatement;
}

interface BetterSqliteModule {
  new (filename: string): SqliteDatabase;
}

interface RevisionRow {
  readonly financial_revision: string;
  readonly id: string;
}

const BetterSqlite = jest.requireActual<BetterSqliteModule>("better-sqlite3");
const migrationsModule = jest.requireActual<Record<string, unknown>>(
  "../../../../packages/db/src/migrations"
);

function accountFinancialEffectsV29BackfillSql(): string {
  const value = migrationsModule.ACCOUNT_FINANCIAL_EFFECTS_V29_BACKFILL_SQL;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("account_financial_effects_v29_backfill_missing");
  }
  return value;
}

function createV28Database(): SqliteDatabase {
  const database = new BetterSqlite(":memory:");
  database.exec(`
    create table accounts (
      id text primary key,
      balance real not null,
      _status text not null default 'synced',
      _changed text not null default ''
    );
    create table recurring_payments (
      id text primary key,
      amount real not null,
      _status text not null default 'synced',
      _changed text not null default ''
    );
    insert into accounts (id, balance) values
      ('account-existing', 125.5),
      ('account-dirty', 80.25);
    update accounts
      set _status = 'updated', _changed = 'name'
      where id = 'account-dirty';
    insert into recurring_payments (id, amount) values
      ('recurring-existing', 20.5);
  `);
  return database;
}

function applyV29RevisionColumns(database: SqliteDatabase): void {
  database.exec(`
    alter table accounts
      add column financial_revision text not null default '';
    alter table recurring_payments
      add column financial_revision text not null default '';
  `);
  database.exec(accountFinancialEffectsV29BackfillSql());
}

function readRevisions(
  database: SqliteDatabase,
  table: "accounts" | "recurring_payments"
): readonly RevisionRow[] {
  return database
    .prepare(
      `select id, financial_revision from ${table} order by id`
    )
    .all<RevisionRow>();
}

describe("WatermelonDB v28 to v29 account financial-effects migration", () => {
  let database: SqliteDatabase;

  beforeEach(() => {
    database = createV28Database();
  });

  afterEach(() => {
    database.close();
  });

  it("backfills the required-string default to canonical zero on real SQLite rows", () => {
    applyV29RevisionColumns(database);

    expect(readRevisions(database, "accounts")).toEqual([
      { financial_revision: "0", id: "account-dirty" },
      { financial_revision: "0", id: "account-existing" },
    ]);
    expect(readRevisions(database, "recurring_payments")).toEqual([
      { financial_revision: "0", id: "recurring-existing" },
    ]);
  });

  it("preserves unrelated local dirty metadata while initializing revisions", () => {
    applyV29RevisionColumns(database);

    expect(
      database
        .prepare(
          `select _status, _changed, balance, financial_revision
           from accounts where id = 'account-dirty'`
        )
        .all<{
          readonly _changed: string;
          readonly _status: string;
          readonly balance: number;
          readonly financial_revision: string;
        }>()
    ).toEqual([
      {
        _changed: "name",
        _status: "updated",
        balance: 80.25,
        financial_revision: "0",
      },
    ]);
  });
});
