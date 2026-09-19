import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ImportMarketRatesModule {
  readonly REQUIRED_FIAT_CODES: readonly string[];
  buildImportSql(units: readonly unknown[]): string;
  buildLegacySnapshotUnit(row: Record<string, unknown>): {
    readonly observations: readonly Record<string, unknown>[];
    readonly root: Record<string, unknown>;
  };
  getLinkedLegacyMarketRateQueryArgs(): readonly string[];
  getLinkedMarketRateSnapshotsQueryArgs(request: {
    readonly cursor: null;
    readonly limit: number;
    readonly upperWatermark: null;
  }): readonly string[];
  getSupabaseSpawnArgs(args: readonly string[]): readonly string[];
  parseImportMarketRatesArgs(argv?: readonly string[]): {
    readonly bestEffort: boolean;
  };
  parseSupabaseQueryRows(output: string): readonly unknown[];
  isMissingSnapshotRpcError(error: unknown): boolean;
}

const marketRatesImporter = jest.requireActual(
  "../../../../scripts/import-market-rates-to-local"
) as ImportMarketRatesModule;

describe("import-market-rates-to-local helpers", () => {
  it("runs the local Supabase CLI shim without Windows shell argument parsing", () => {
    expect(marketRatesImporter.getSupabaseSpawnArgs(["db", "query"])).toEqual([
      process.execPath,
      expect.stringMatching(/supabase[\\/]dist[\\/]supabase\.js$/),
      "db",
      "query",
    ]);
  });

  it("queries complete remote snapshot pages through the linked RPC", () => {
    expect(
      marketRatesImporter.getLinkedMarketRateSnapshotsQueryArgs({
        cursor: null,
        limit: 50,
        upperWatermark: null,
      })
    ).toEqual([
      "db",
      "query",
      "--agent=no",
      "--linked",
      "-o",
      "json",
      expect.stringContaining("pull_market_rate_snapshots_page_v2"),
    ]);
  });

  it("queries the newest legacy row when the atomic snapshot RPC is not deployed", () => {
    expect(marketRatesImporter.getLinkedLegacyMarketRateQueryArgs()).toEqual([
      "db",
      "query",
      "--agent=no",
      "--linked",
      "-o",
      "json",
      expect.stringMatching(
        /from public\.market_rates[\s\S]*order by created_at desc, id desc[\s\S]*limit 1/i
      ),
    ]);
  });

  it("adapts one legacy root into an honest complete local snapshot", () => {
    const fiatColumns = Object.fromEntries(
      marketRatesImporter.REQUIRED_FIAT_CODES.filter(
        (code) => code !== "USD"
      ).map((code) => [`${code.toLowerCase()}_usd`, "0.5"])
    );
    const unit = marketRatesImporter.buildLegacySnapshotUnit({
      id: "19f3212b-9d32-4a4c-9bf9-968e9cea5d64",
      created_at: "2026-09-19T12:00:02.292Z",
      updated_at: "2026-09-19T12:00:02.965967Z",
      gold_usd_per_gram: "140.7815",
      silver_usd_per_gram: "2.1302",
      platinum_usd_per_gram: "57.8842",
      palladium_usd_per_gram: "41.7145",
      timestamp_metal: "2026-09-19T11:59:07.631Z",
      timestamp_currency: "2026-09-19T11:58:07.953Z",
      ...fiatColumns,
      egp_usd: "0.0191",
      btc_usd: "81276.3640",
    });

    expect(unit.root).toMatchObject({
      id: "19f3212b-9d32-4a4c-9bf9-968e9cea5d64",
      egp_usd: "0.0191",
      gold_usd_per_gram: "140.7815",
      silver_usd_per_gram: "2.1302",
    });
    expect(unit.observations).toHaveLength(38);
    expect(unit.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instrument_code: "currency:EGP",
          source: "legacy:market_rates",
          value_decimal: "0.0191",
        }),
        expect.objectContaining({
          instrument_code: "currency:USD",
          source: "legacy:market_rates",
          value_decimal: "1",
        }),
      ])
    );
  });

  it("falls back only when the linked atomic snapshot RPC is absent", () => {
    expect(
      marketRatesImporter.isMissingSnapshotRpcError(
        new Error(
          "ERROR: 42883: function public.pull_market_rate_snapshots_page_v2 does not exist"
        )
      )
    ).toBe(true);
    expect(
      marketRatesImporter.isMissingSnapshotRpcError(
        new Error("network connection failed")
      )
    ).toBe(false);
  });

  it("imports the replacement atomically as one CLI-compatible statement", () => {
    const sql = marketRatesImporter.buildImportSql([
      {
        root: {
          id: "19f3212b-9d32-4a4c-9bf9-968e9cea5d64",
        },
        observations: [],
      },
    ]);

    expect(sql).toMatch(/^do \$market_import\$/);
    expect(sql).toContain("delete from public.market_rate_observations;");
    expect(sql).toContain("delete from public.market_rates;");
    expect(sql).not.toMatch(/\bbegin;|\bcommit;/);
  });

  it("ignores temporary SQL files created during market-rate import", () => {
    const gitignore = readFileSync(
      resolve(__dirname, "../../../../.gitignore"),
      "utf8"
    );

    expect(gitignore).toContain(".tmp-market-rates-*.sql");
  });

  it("parses Supabase agent JSON envelopes", () => {
    expect(
      marketRatesImporter.parseSupabaseQueryRows(
        JSON.stringify({
          boundary: "abc",
          rows: [{ id: "rate-1" }],
          warning: "untrusted data",
        })
      )
    ).toEqual([{ id: "rate-1" }]);
  });

  it("parses Supabase non-agent JSON arrays", () => {
    expect(
      marketRatesImporter.parseSupabaseQueryRows(
        JSON.stringify([{ id: "rate-1" }])
      )
    ).toEqual([{ id: "rate-1" }]);
  });

  it("parses best-effort mode for manual seed imports", () => {
    expect(
      marketRatesImporter.parseImportMarketRatesArgs(["--best-effort"])
    ).toEqual({ bestEffort: true });
    expect(marketRatesImporter.parseImportMarketRatesArgs([])).toEqual({
      bestEffort: false,
    });
  });

  it("ignores non-JSON CLI text around the result", () => {
    expect(
      marketRatesImporter.parseSupabaseQueryRows(
        `Connecting to database...\n${JSON.stringify([{ id: "rate-1" }])}\nA new version is available.`
      )
    ).toEqual([{ id: "rate-1" }]);
  });
});
