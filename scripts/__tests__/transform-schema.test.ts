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
  readonly formatContent: (
    filePath: string,
    content: string,
    prettierModule?: unknown
  ) => Promise<string>;
  readonly writeIfChanged: (
    filePath: string,
    content: string,
    fsModule?: unknown,
    prettierModule?: unknown
  ) => Promise<boolean>;
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

test("formatContent formats code using installed Prettier configuration", async () => {
  const unformatted = "export const x:   number=1;\n";
  const formatted = await transformSchema.formatContent(
    "dummy.ts",
    unformatted
  );
  assert.equal(formatted, "export const x: number = 1;\n");
});

test("writeIfChanged writes formatted content, skips on second identical run, and fails closed", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const tmpDir = path.join(
    __dirname,
    "../../.tmp/test-transform-write-" + Date.now()
  );
  fs.mkdirSync(tmpDir, { recursive: true });
  const testFile = path.join(tmpDir, "test.ts");

  try {
    const unformatted = "export  const   y:string='hello';\n";
    // 1. First write formats and writes file
    const changed1 = await transformSchema.writeIfChanged(
      testFile,
      unformatted
    );
    assert.equal(changed1, true);
    const contentOnDisk1 = fs.readFileSync(testFile, "utf8");
    assert.equal(contentOnDisk1, 'export const y: string = "hello";\n');

    // 2. Second identical write causes zero writes (skips and returns false)
    const changed2 = await transformSchema.writeIfChanged(
      testFile,
      unformatted
    );
    assert.equal(changed2, false);
    const contentOnDisk2 = fs.readFileSync(testFile, "utf8");
    assert.equal(contentOnDisk2, contentOnDisk1);

    // 3. Formatting rejection fails closed and leaves old bytes intact
    const brokenPrettier = {
      resolveConfig: async () => null,
      format: async () => {
        throw new Error("Syntax error in Prettier");
      },
    };
    await assert.rejects(
      () =>
        transformSchema.writeIfChanged(
          testFile,
          "invalid syntax",
          fs,
          brokenPrettier
        ),
      /Syntax error in Prettier/
    );
    assert.equal(fs.readFileSync(testFile, "utf8"), contentOnDisk1);

    // 4. Disk write failure propagates and leaves old bytes intact
    const failingWriteFs = {
      ...fs,
      writeFileSync: () => {
        throw new Error("ENOSPC: disk full");
      },
    };
    await assert.rejects(
      () =>
        transformSchema.writeIfChanged(
          testFile,
          "export const z = 2;\n",
          failingWriteFs
        ),
      /ENOSPC: disk full/
    );
    assert.equal(fs.readFileSync(testFile, "utf8"), contentOnDisk1);

    // 5. Rename failure propagates and leaves old bytes intact
    const failingRenameFs = {
      ...fs,
      renameSync: () => {
        throw new Error("EPERM: rename failed");
      },
    };
    await assert.rejects(
      () =>
        transformSchema.writeIfChanged(
          testFile,
          "export const w = 3;\n",
          failingRenameFs
        ),
      /Failed to rename temporary file: EPERM/
    );
    assert.equal(fs.readFileSync(testFile, "utf8"), contentOnDisk1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("generates explicit SQL-null fields only for approved model capabilities", () => {
  const parsed = transformSchema.parseSupabaseTypes(`
export type Database = {
  public: {
    Tables: {
      financial_action_groups: {
        Row: {
          account_guards_json: Json;
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
      assets: {
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
  const assetModel = transformSchema.generateBaseModel(
    "assets",
    parsed.tables.assets.columns,
    relationships,
    parsed.tables
  );

  assert.match(financialActionModel, /accountGuardsJson!: string;/);
  assert.match(financialActionModel, /outcomeJson!: string \| null;/);
  assert.match(financialActionModel, /rejectionCode!: string \| null;/);
  assert.match(financialActionModel, /serverOutcome!: string \| null;/);
  assert.match(assetModel, /notes!: string \| null;/);
  assert.match(ordinaryModel, /notes\?: string;/);
});

test("financial action nullable outcome generation is deterministic", () => {
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
  assert.equal(
    (generated.match(/!: (?:number|string) \| null;/g) ?? []).length,
    3
  );
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

test("generates exact local account revisions, effects, and uniqueness", () => {
  const parsed = transformSchema.parseSupabaseTypes(
    readFileSync(
      new URL("../../packages/db/src/supabase-types.ts", import.meta.url),
      "utf8"
    )
  );
  const generatedSchema = transformSchema.generateSchema(parsed.tables);
  const generatedEffectModel = transformSchema.generateBaseModel(
    "account_financial_effects",
    parsed.tables.account_financial_effects.columns,
    parsed.relationships ?? {},
    parsed.tables
  );
  const generatedRecurringModel = transformSchema.generateBaseModel(
    "recurring_payments",
    parsed.tables.recurring_payments.columns,
    parsed.relationships ?? {},
    parsed.tables
  );

  assert.match(
    generatedSchema,
    /account_financial_effects_user_action_account_kind_unique/
  );
  assert.match(generatedSchema, /accepted_account_revision", type: "string"/);
  assert.match(generatedSchema, /amount_minor_units", type: "string"/);
  assert.match(generatedSchema, /financial_revision", type: "string"/);
  assert.match(generatedEffectModel, /acceptedAccountRevision!: string;/);
  assert.match(generatedEffectModel, /amountMinorUnits!: string;/);
  assert.match(generatedEffectModel, /compensatedAt!: Date \| null;/);
  assert.match(generatedRecurringModel, /financialRevision!: string;/);
});

test("excludes voice AI operational tables from Watermelon schema generation", () => {
  const parsed = transformSchema.parseSupabaseTypes(`
export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: { id: string; name: string; };
        Insert: {};
        Update: {};
        Relationships: [];
      };
      sms_ai_work_requests: {
        Row: { id: string; user_id: string; request_key: string; };
        Insert: {};
        Update: {};
        Relationships: [];
      };
      voice_ai_usage_windows: {
        Row: { user_id: string; time_zone: string; };
        Insert: {};
        Update: {};
        Relationships: [];
      };
      voice_ai_work_requests: {
        Row: { id: string; user_id: string; request_key: string; };
        Insert: {};
        Update: {};
        Relationships: [];
      };
    }
    Enums: { [_ in never]: never }
  }
}`);

  assert.deepEqual(Object.keys(parsed.tables), ["accounts"]);
  const generatedSchema = transformSchema.generateSchema(parsed.tables);
  assert.doesNotMatch(
    generatedSchema,
    /sms_ai_work_requests|voice_ai_usage_windows|voice_ai_work_requests/
  );
});

test("renames colliding relation property to rateBatch for market_rate_observations while preserving ordinary relations", () => {
  const parsed = transformSchema.parseSupabaseTypes(`
export type Database = {
  public: {
    Tables: {
      market_rates: {
        Row: { id: string; };
        Insert: {};
        Update: {};
        Relationships: [];
      };
      market_rate_observations: {
        Row: { id: string; batch_id: string; };
        Insert: {};
        Update: {};
        Relationships: [
          {
            foreignKeyName: "market_rate_observations_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "market_rates";
            referencedColumns: ["id"];
          }
        ];
      };
      ordinary_items: {
        Row: { id: string; account_id: string; };
        Insert: {};
        Update: {};
        Relationships: [
          {
            foreignKeyName: "ordinary_items_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          }
        ];
      };
      accounts: {
        Row: { id: string; };
        Insert: {};
        Update: {};
        Relationships: [];
      };
    }
    Enums: { [_ in never]: never }
  }
}`);

  const observationModel = transformSchema.generateBaseModel(
    "market_rate_observations",
    [
      { name: "id", wmType: "string" },
      { name: "batch_id", wmType: "string" },
    ],
    parsed.relationships!,
    parsed.tables
  );

  const ordinaryModel = transformSchema.generateBaseModel(
    "ordinary_items",
    [
      { name: "id", wmType: "string" },
      { name: "account_id", wmType: "string" },
    ],
    parsed.relationships!,
    parsed.tables
  );

  // MarketRateObservation uses rateBatch to avoid shadowing WatermelonDB Model.batch
  assert.match(
    observationModel,
    /@relation\("market_rates", "batch_id"\) rateBatch!: Relation<BaseMarketRate>;/
  );
  assert.doesNotMatch(
    observationModel,
    /@relation\("market_rates", "batch_id"\) batch!:/
  );

  // Ordinary relations remain unmodified (e.g. account_id -> account)
  assert.match(
    ordinaryModel,
    /@relation\("accounts", "account_id"\) account!: Relation<BaseAccount>;/
  );
});
