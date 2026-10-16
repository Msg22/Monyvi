import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function source(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("#355 local historical cache schema preservation", () => {
  it("keeps the local schema appended during generated schema refresh", () => {
    const generator = source("scripts/transform-schema.js");
    expect(generator).toContain(
      'import { METAL_HISTORICAL_RATE_CACHE_TABLES } from "./local-schema/metal-historical-rate-cache-schema";'
    );
    expect(generator).toContain("...METAL_HISTORICAL_RATE_CACHE_TABLES");
  });

  it("keeps migration30 when later local versions belong to other features", () => {
    const schema = source("packages/db/src/schema.ts");
    const migrations = source("packages/db/src/migrations.ts");
    const versionMatch = schema.match(/version:\s*(\d+)\b/);
    expect(versionMatch).not.toBeNull();
    expect(schema).toContain("...METAL_HISTORICAL_RATE_CACHE_TABLES");
    const historicalMigration = migrations.indexOf("toVersion: 30");
    expect(historicalMigration).toBeGreaterThanOrEqual(0);
    expect(migrations).toContain('name: "metal_historical_rate_cache"');
    expect(migrations).toContain(
      "metal_historical_rate_cache_owner_date_unique"
    );
    const schemaVersion = Number(versionMatch?.[1]);
    expect(Number.isSafeInteger(schemaVersion)).toBe(true);
    expect(schemaVersion).toBeGreaterThanOrEqual(30);
    const laterVersions = [
      ...migrations.matchAll(/toVersion:\s*(\d+)\b/g),
    ].map((match) => Number(match[1]));
    expect(schemaVersion).toBe(Math.max(...laterVersions));
    for (let version = 31; version <= schemaVersion; version += 1) {
      expect(laterVersions).toContain(version);
      expect(migrations.indexOf("toVersion: " + version)).toBeGreaterThan(
        historicalMigration
      );
    }
  });

  it("registers owner/date uniqueness and nullable snapshot proof in schema and migration", () => {
    const localSchema = source(
      "packages/db/src/local-schema/metal-historical-rate-cache-schema.ts"
    );
    const migrations = source("packages/db/src/migrations.ts");
    for (const text of [localSchema, migrations]) {
      expect(text).toContain("metal_historical_rate_cache_owner_date_unique");
      expect(text).toContain('("user_id", "rate_date")');
      expect(text).not.toContain(
        "metal_historical_rate_cache_owner_provider_date_unique"
      );
      for (const field of [
        "snapshot_id",
        "metal_provider_observed_at",
        "currency_provider_observed_at",
      ]) {
        expect(text).toMatch(
          new RegExp(
            'name: "' + field + '",\\s*type: "string",\\s*isOptional: true'
          )
        );
      }
    }
  });

  it("keeps the local cache outside the Supabase generated table declarations", () => {
    const transform = source("scripts/transform-schema.js");
    const excludedDeclaration = transform.match(
      /const EXCLUDED_TABLES = \[[\s\S]*?\];/
    );
    expect(excludedDeclaration).not.toBeNull();
    expect(excludedDeclaration?.[0]).not.toContain(
      "metal_historical_rate_cache"
    );
    const remoteTypes = source("packages/db/src/supabase-types.ts");
    expect(remoteTypes).not.toContain("metal_historical_rate_cache:");
  });
});
