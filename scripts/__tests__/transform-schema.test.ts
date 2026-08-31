import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

interface ParsedSchema {
  readonly tables: Readonly<
    Record<string, { readonly columns: readonly unknown[] }>
  >;
  readonly enums: Readonly<Record<string, readonly string[]>>;
  readonly relationships?: Readonly<Record<string, readonly unknown[]>>;
}

interface TransformSchemaModule {
  readonly parseSupabaseTypes: (content: string) => ParsedSchema;
  readonly generateSchema: (tables: ParsedSchema["tables"]) => string;
  readonly generateBaseModel: (
    tableName: string,
    columns: readonly unknown[],
    relationships: Readonly<Record<string, readonly unknown[]>>,
    tables: ParsedSchema["tables"]
  ) => string;
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
  assert.match(
    source,
    /for \(const generatedPath of generatedBaseModelPaths\)/
  );
  assert.doesNotMatch(source, /BASE_MODELS_DIR}\/\*\*\/\*\.ts/);
  assert.doesNotMatch(
    source,
    /Prettier formatting (?:failed|of schema\/types skipped)/
  );
});

test("generates explicit SQL-null fields only for the financial action capability", () => {
  const parsed = transformSchema.parseSupabaseTypes(`
export type Database = {
  public: {
    Tables: {
      financial_action_groups: {
        Row: {
          expected_account_revision: number | null;
          outcome_json: string | null;
          rejection_code: string | null;
          server_outcome: string | null;
        };
        Insert: {};
        Update: {};
        Relationships: [];
      };
      ordinary_records: {
        Row: { notes: string | null; };
        Insert: {};
        Update: {};
        Relationships: [];
      };
    }
    Enums: { [_ in never]: never }
  }
}`);

  const relationships = parsed.relationships ?? {};
  const financialActionModel = transformSchema.generateBaseModel(
    "financial_action_groups",
    parsed.tables.financial_action_groups.columns,
    relationships,
    parsed.tables
  );
  const ordinaryModel = transformSchema.generateBaseModel(
    "ordinary_records",
    parsed.tables.ordinary_records.columns,
    relationships,
    parsed.tables
  );

  assert.match(
    financialActionModel,
    /expectedAccountRevision!: number \| null;/
  );
  assert.match(financialActionModel, /outcomeJson!: string \| null;/);
  assert.match(financialActionModel, /rejectionCode!: string \| null;/);
  assert.match(financialActionModel, /serverOutcome!: string \| null;/);
  assert.match(ordinaryModel, /notes\?: string;/);
});

test("financial action explicit-null generation is deterministic", () => {
  const source = readFileSync(
    new URL("../../packages/db/src/supabase-types.ts", import.meta.url),
    "utf8"
  );
  const parsed = transformSchema.parseSupabaseTypes(source);
  const relationships = parsed.relationships ?? {};
  const generated = transformSchema.generateBaseModel(
    "financial_action_groups",
    parsed.tables.financial_action_groups.columns,
    relationships,
    parsed.tables
  );

  assert.equal(
    generated,
    transformSchema.generateBaseModel(
      "financial_action_groups",
      parsed.tables.financial_action_groups.columns,
      relationships,
      parsed.tables
    )
  );
  assert.equal((generated.match(/!: (?:number|string) \| null;/g) ?? []).length, 4);
});

test("generated schema preserves owner-scoped financial action uniqueness", () => {
  const parsed = transformSchema.parseSupabaseTypes(
    readFileSync(
      new URL("../../packages/db/src/supabase-types.ts", import.meta.url),
      "utf8"
    )
  );
  const generated = transformSchema.generateSchema(parsed.tables);

  assert.match(
    generated,
    /financial_action_groups_user_action_unique[\s\S]*financial_action_groups[\s\S]*user_id[\s\S]*action_id/
  );
  assert.equal(
    (generated.match(/financial_action_groups_user_action_unique/g) ?? [])
      .length,
    1
  );
});
