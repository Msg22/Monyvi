import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

interface ParsedSchema {
  readonly tables: Readonly<Record<string, unknown>>;
  readonly enums: Readonly<Record<string, readonly string[]>>;
}

interface TransformSchemaModule {
  readonly parseSupabaseTypes: (content: string) => ParsedSchema;
}

const transformSchema =
  require("../transform-schema.js") as TransformSchemaModule;

test("parses the public schema when GraphQL is emitted first", () => {
  const parsed = transformSchema.parseSupabaseTypes(`
export type Database = {
  graphql_public: {
    Tables: { [_ in never]: never }
    Enums: { [_ in never]: never }
  }
  public: {
    Tables: {
      accounts: {
        Row: { id: string; name: string; };
        Insert: { id?: string; name: string; };
        Update: { id?: string; name?: string; };
        Relationships: [];
      };
    }
    Enums: {
      account_type: "CASH" | "BANK";
    }
  }
}`);

  assert.deepEqual(Object.keys(parsed.tables), ["accounts"]);
  assert.deepEqual(parsed.enums.account_type, ["CASH", "BANK"]);
});

test("generated-file formatting uses the local Prettier binary and fails closed", () => {
  const source = readFileSync(
    new URL("../transform-schema.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /PRETTIER_BIN/);
  assert.match(source, /execFileSync\([\s\S]*PRETTIER_BIN/);
  assert.doesNotMatch(
    source,
    /Prettier formatting (?:failed|of schema\/types skipped)/
  );
});
