import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ImportMarketRatesModule {
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
      expect.stringContaining("pull_market_rate_snapshots_page_v1"),
    ]);
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
