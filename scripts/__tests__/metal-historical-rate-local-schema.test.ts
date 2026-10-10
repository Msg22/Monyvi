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

  it("registers schema version 30 and its sequential local migration", () => {
    const schema = source("packages/db/src/schema.ts");
    const migrations = source("packages/db/src/migrations.ts");

    expect(schema).toContain("version: 30");
    expect(schema).toContain("...METAL_HISTORICAL_RATE_CACHE_TABLES");
    expect(migrations).toContain("toVersion: 30");
    expect(migrations).toContain('name: "metal_historical_rate_cache"');
    expect(migrations).toContain(
      "metal_historical_rate_cache_owner_provider_date_unique"
    );
  });

  it("registers one owner/provider/date uniqueness guard without adding a Supabase-generated table", () => {
    const localSchemaSource = source(
      "packages/db/src/local-schema/metal-historical-rate-cache-schema.ts"
    );
    expect(localSchemaSource).toContain(
      "metal_historical_rate_cache_owner_provider_date_unique"
    );
    expect(localSchemaSource).toContain(
      '"user_id", "provider_key", "rate_date"'
    );

    const transform = source("scripts/transform-schema.js");
    const excludedDeclaration = transform.match(
      /const EXCLUDED_TABLES = \[[\s\S]*?\];/
    );
    expect(excludedDeclaration?.[0]).not.toContain(
      "metal_historical_rate_cache"
    );
  });
});
