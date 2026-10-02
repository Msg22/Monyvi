interface LocalAccountSeedModule {
  readonly buildAccountUpsertSql: (
    rows: ReadonlyArray<Record<string, unknown>>
  ) => string;
  readonly buildBalanceRestoreSql: (
    rows: ReadonlyArray<Record<string, unknown>>
  ) => string;
}

const { buildAccountUpsertSql, buildBalanceRestoreSql } =
  jest.requireActual<LocalAccountSeedModule>(
    "../../scripts/seed-fixtures/local-account-seed"
  );

const account = {
  id: "00000000-0000-0000-0000-000000000001",
  user_id: "00000000-0000-0000-0000-000000000002",
  name: "O'Brian Wallet",
  type: "CASH",
  balance: 2500,
  currency: "EGP",
  is_default: true,
  deleted: false,
  created_at: "2026-04-08T12:00:00.000Z",
  updated_at: "2026-09-27T12:00:00.000Z",
};

describe("local account seed SQL", () => {
  it("upserts fixture balances under local postgres without interpolating row values", () => {
    const sql = buildAccountUpsertSql([account]);

    expect(sql).toContain("current_user");
    expect(sql).toContain("jsonb_populate_recordset(NULL::public.accounts");
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(sql).toContain("WHERE public.accounts.user_id = EXCLUDED.user_id");
    expect(sql).not.toContain("user_id = EXCLUDED.user_id,");
    expect(sql).not.toContain(account.name);

    const encoded = sql.match(/decode\('([^']+)', 'base64'\)/)?.[1];
    expect(encoded).toBeDefined();
    expect(
      JSON.parse(Buffer.from(encoded ?? "", "base64").toString("utf8"))
    ).toEqual([account]);
  });

  it("restores balances only for matching account and owner and fails if rows are missing", () => {
    const sql = buildBalanceRestoreSql([account]);

    expect(sql).toContain("account.id = desired.id");
    expect(sql).toContain("account.user_id = desired.user_id");
    expect(sql).toContain("GET DIAGNOSTICS updated_count = ROW_COUNT");
    expect(sql).toContain("IF updated_count <> 1");
  });

  it("rejects unexpected account fields rather than silently losing fixture data", () => {
    expect(() =>
      buildAccountUpsertSql([{ ...account, unsupported_field: "value" }])
    ).toThrow("unsupported_field");
  });
});
