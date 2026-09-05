import { METALS_V27_BACKFILL_SQL } from "../migrations";

interface SqliteStatement {
  run(...parameters: readonly unknown[]): unknown;
  all<T>(): T[];
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface BetterSqliteModule {
  new (filename: string): SqliteDatabase;
}

interface ExactRow {
  readonly id: string;
  readonly purchase_currency: string | null;
  readonly purchase_price_decimal: string | null;
  readonly purity_catalog_version: string | null;
  readonly purity_code: string | null;
  readonly purity_factor_decimal: string | null;
  readonly state_id: string | null;
  readonly weight_grams_decimal: string | null;
}

const BetterSqlite = jest.requireActual<BetterSqliteModule>("better-sqlite3");

function createLegacyDatabase(): SqliteDatabase {
  const database = new BetterSqlite(":memory:");
  database.exec(`
    create table assets (
      id text primary key,
      user_id text not null,
      purchase_price real not null,
      currency text not null,
      purchase_price_decimal text,
      purchase_currency text,
      created_at integer not null,
      updated_at integer not null,
      deleted integer not null,
      _status text not null default 'synced',
      _changed text not null default ''
    );
    create table asset_metals (
      id text primary key,
      asset_id text not null,
      metal_type text not null,
      weight_grams real not null,
      purity_fraction real not null,
      weight_grams_decimal text,
      purity_code text,
      purity_factor_decimal text,
      purity_catalog_version text,
      _status text not null default 'synced',
      _changed text not null default ''
    );
    create table metal_holding_states (
      id text primary key,
      user_id text not null,
      holding_id text not null unique,
      status text not null,
      financial_revision text not null,
      effective_event_id text,
      effective_action_id text,
      is_visible integer not null,
      reconciliation_state text not null,
      created_at integer not null,
      updated_at integer not null,
      deleted integer not null,
      _status text not null,
      _changed text not null
    );
  `);
  return database;
}

function insertLegacyHolding(
  database: SqliteDatabase,
  input: {
    readonly id: string;
    readonly currency?: string;
    readonly metalType?: "GOLD" | "SILVER";
    readonly purchasePrice?: number;
    readonly purityFraction: number;
    readonly weightGrams: number;
  }
): void {
  database
    .prepare(
      `insert into assets (
        id, user_id, purchase_price, currency, created_at, updated_at, deleted
      ) values (?, 'owner', ?, ?, 1, 2, 0)`
    )
    .run(input.id, input.purchasePrice ?? 100.25, input.currency ?? "EGP");
  database
    .prepare(
      `insert into asset_metals (
        id, asset_id, metal_type, weight_grams, purity_fraction
      ) values (?, ?, ?, ?, ?)`
    )
    .run(
      `metal-${input.id}`,
      input.id,
      input.metalType ?? "GOLD",
      input.weightGrams,
      input.purityFraction
    );
}

function readExactRows(database: SqliteDatabase): readonly ExactRow[] {
  return database
    .prepare(
      `select
        assets.id,
        assets.purchase_currency,
        assets.purchase_price_decimal,
        asset_metals.weight_grams_decimal,
        asset_metals.purity_code,
        asset_metals.purity_factor_decimal,
        asset_metals.purity_catalog_version,
        metal_holding_states.id as state_id
      from assets
      join asset_metals on asset_metals.asset_id = assets.id
      left join metal_holding_states
        on metal_holding_states.holding_id = assets.id
      order by assets.id`
    )
    .all<ExactRow>();
}

describe("WatermelonDB v27 Metals backfill", () => {
  let database: SqliteDatabase;

  beforeEach(() => {
    database = createLegacyDatabase();
  });

  afterEach(() => {
    database.close();
  });

  it("backfills only exact weights, approved fiat, and known metal-matched purity", () => {
    insertLegacyHolding(database, {
      id: "gold-22k",
      purityFraction: 22 / 24,
      weightGrams: 1.234,
    });
    insertLegacyHolding(database, {
      id: "gold-14k-remote",
      purityFraction: 0.5833,
      weightGrams: 2.5,
    });
    insertLegacyHolding(database, {
      id: "gold-invalid",
      currency: "BTC",
      purityFraction: 1,
      weightGrams: 1.2345,
    });
    insertLegacyHolding(database, {
      id: "silver-cross-metal",
      metalType: "SILVER",
      purityFraction: 0.75,
      weightGrams: 3,
    });

    database.exec(METALS_V27_BACKFILL_SQL);

    expect(readExactRows(database)).toEqual([
      expect.objectContaining({
        id: "gold-14k-remote",
        purchase_currency: "EGP",
        purity_catalog_version: "1",
        purity_code: "gold-58333",
        purity_factor_decimal: "0.58333",
        state_id: "gold-14k-remote",
        weight_grams_decimal: "2.5",
      }),
      expect.objectContaining({
        id: "gold-22k",
        purchase_currency: "EGP",
        purity_catalog_version: "1",
        purity_code: "gold-9167",
        purity_factor_decimal: "0.9167",
        state_id: "gold-22k",
        weight_grams_decimal: "1.234",
      }),
      expect.objectContaining({
        id: "gold-invalid",
        purchase_currency: null,
        purity_catalog_version: null,
        purity_code: null,
        purity_factor_decimal: null,
        state_id: "gold-invalid",
        weight_grams_decimal: null,
      }),
      expect.objectContaining({
        id: "silver-cross-metal",
        purchase_currency: "EGP",
        purity_catalog_version: null,
        purity_code: null,
        purity_factor_decimal: null,
        state_id: "silver-cross-metal",
        weight_grams_decimal: "3.0",
      }),
    ]);
  });

  it("normalizes both local and rounded remote 14K while leaving legacy 24K and 10K unavailable", () => {
    insertLegacyHolding(database, {
      id: "gold-14k-local",
      purityFraction: 14 / 24,
      weightGrams: 1,
    });
    insertLegacyHolding(database, {
      id: "gold-24k",
      purityFraction: 1,
      weightGrams: 1,
    });
    insertLegacyHolding(database, {
      id: "gold-10k",
      purityFraction: 10 / 24,
      weightGrams: 1,
    });

    database.exec(METALS_V27_BACKFILL_SQL);

    const rows = readExactRows(database);
    expect(rows.find((row) => row.id === "gold-14k-local")).toMatchObject({
      purity_code: "gold-58333",
      purity_factor_decimal: "0.58333",
      purity_catalog_version: "1",
    });
    expect(rows.find((row) => row.id === "gold-24k")).toMatchObject({
      purity_code: null,
      purity_factor_decimal: null,
      purity_catalog_version: null,
    });
    expect(rows.find((row) => row.id === "gold-10k")).toMatchObject({
      purity_code: null,
      purity_factor_decimal: null,
      purity_catalog_version: null,
    });
  });

  it("preserves populated exact values and is rerunnable", () => {
    insertLegacyHolding(database, {
      id: "preserved",
      purityFraction: 0.925,
      weightGrams: 5,
    });
    database.exec(`
      update assets
      set purchase_price_decimal = '999.01', purchase_currency = 'USD'
      where id = 'preserved';
      update asset_metals
      set weight_grams_decimal = '4.999',
          purity_code = 'silver-925',
          purity_factor_decimal = '0.925',
          purity_catalog_version = '1',
          metal_type = 'SILVER'
      where asset_id = 'preserved';
    `);

    database.exec(METALS_V27_BACKFILL_SQL);
    const first = readExactRows(database);
    database.exec(METALS_V27_BACKFILL_SQL);

    expect(readExactRows(database)).toEqual(first);
    expect(first[0]).toMatchObject({
      purchase_currency: "USD",
      purchase_price_decimal: "999.01",
      purity_catalog_version: "1",
      purity_code: "silver-925",
      purity_factor_decimal: "0.925",
      state_id: "preserved",
      weight_grams_decimal: "4.999",
    });
  });
});
