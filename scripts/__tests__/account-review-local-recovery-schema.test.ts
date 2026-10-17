/**
 * #395 T053 — generator-owned Watermelon-only recovery carrier.
 * Run independently from the missing private Zod module: these cases must
 * become behavioral Red on the actual generated/schema/migration boundaries.
 * No generator, migration or repository file is mutated by the test itself.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

interface ParsedColumn {
  readonly name: string;
  readonly wmType: string;
  readonly isOptional?: boolean;
  readonly isIndexed?: boolean;
}
interface ParsedSupabaseTypes {
  readonly tables: Readonly<
    Record<string, { readonly columns: readonly ParsedColumn[] }>
  >;
  readonly enums: Readonly<Record<string, readonly string[]>>;
  readonly relationships: Readonly<Record<string, readonly unknown[]>>;
}
interface TransformSchemaModule {
  readonly parseSupabaseTypes: (content: string) => ParsedSupabaseTypes;
  readonly generateSchema: (tables: ParsedSupabaseTypes["tables"]) => string;
  readonly generateBaseModel: (
    tableName: string,
    columns: readonly ParsedColumn[],
    relationships: ParsedSupabaseTypes["relationships"],
    tables: ParsedSupabaseTypes["tables"]
  ) => string;
  readonly formatContent: (path: string, content: string) => Promise<string>;
  readonly writeIfChanged: (path: string, content: string) => Promise<boolean>;
}

function isTransformSchemaModule(
  value: unknown
): value is TransformSchemaModule {
  return (
    typeof value === "object" &&
    value !== null &&
    "parseSupabaseTypes" in value &&
    typeof value.parseSupabaseTypes === "function" &&
    "generateSchema" in value &&
    typeof value.generateSchema === "function" &&
    "generateBaseModel" in value &&
    typeof value.generateBaseModel === "function" &&
    "formatContent" in value &&
    typeof value.formatContent === "function" &&
    "writeIfChanged" in value &&
    typeof value.writeIfChanged === "function"
  );
}
const importedTransform: unknown = require("../transform-schema.js");
if (!isTransformSchemaModule(importedTransform))
  throw new Error("Missing actual supported transform-schema generator API");
const transform = importedTransform;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT_TABLE = "financial_action_groups";
const PRIVATE_COLUMN = "local_recovery_snapshot_json";
const PRIVATE_PROPERTY = "localRecoverySnapshotJson";
const SCHEMA_PATH = "packages/db/src/schema.ts";
const MIGRATIONS_PATH = "packages/db/src/migrations.ts";
const MODEL_PATH = "packages/db/src/models/FinancialActionGroup.ts";
const BASE_MODEL_PATH =
  "packages/db/src/models/base/base-financial-action-group.ts";
const PUBLIC_TYPES_PATH = "packages/db/src/supabase-types.ts";

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}
function parsedSource(): ParsedSupabaseTypes {
  return transform.parseSupabaseTypes(read(PUBLIC_TYPES_PATH));
}
function financialTable(source: string): string {
  const marker = `name: "${ROOT_TABLE}"`;
  const index = source.indexOf(marker);
  assert.ok(index >= 0, "Expected the actual financial root table");
  const end = source.indexOf("\n    }),", index);
  assert.ok(end > index, "Expected the financial root table boundary");
  return source.slice(index, end);
}
function migrationVersions(): number[] {
  return [...read(MIGRATIONS_PATH).matchAll(/\btoVersion:\s*(\d+)\b/g)].map(
    (match) => Number(match[1])
  );
}
function migration31(): string {
  const migration = read(MIGRATIONS_PATH);
  const begin = migration.indexOf("toVersion: 31");
  assert.ok(begin >= 0, "Missing device-only Watermelon migration31");
  const next = migration.indexOf("toVersion: 32", begin);
  return migration.slice(begin, next >= 0 ? next : undefined);
}

test("T053 adds exactly one nullable device-local column to the actual generated root", () => {
  const table = financialTable(read(SCHEMA_PATH));
  const matches = [
    ...table.matchAll(/name:\s*"local_recovery_snapshot_json"/g),
  ];
  assert.equal(matches.length, 1, "Missing or duplicated private column");
  assert.match(
    table,
    /\{\s*name:\s*"local_recovery_snapshot_json",\s*type:\s*"string",\s*isOptional:\s*true,?\s*\}/,
    "Private root field must be nullable string"
  );
});

test("T053 exposes exactly one device-only column across the complete schema", () => {
  const parsed = parsedSource();
  const generated = transform.generateSchema(parsed.tables);
  const tracked = read(SCHEMA_PATH);
  for (const value of [generated, tracked]) {
    assert.equal(
      [...value.matchAll(/name:\s*"local_recovery_snapshot_json"/g)].length,
      1,
      "Private recovery must extend only one local Watermelon column"
    );
    assert.match(
      financialTable(value),
      /name:\s*"local_recovery_snapshot_json"/
    );
  }
});

test("T053 private column is declared in one real packages/db local-schema module consumed by transform", () => {
  const directory = "packages/db/src/local-schema";
  const modules = readdirSync(join(ROOT, directory)).filter(
    (name) =>
      name.endsWith(".ts") &&
      read(directory + "/" + name).includes(PRIVATE_COLUMN)
  );
  assert.equal(
    modules.length,
    1,
    "One generator-owned private-column source must live in packages/db/src/local-schema"
  );
  const file = modules[0];
  assert.ok(file);
  const importedPath = "local-schema/" + file.slice(0, -".ts".length);
  assert.ok(
    read("scripts/transform-schema.js").includes(importedPath),
    "Actual transform must consume the durable private column override"
  );
});

test("T053 durable transform preserves private field without a dummy cloud column", () => {
  const parsed = parsedSource();
  const parent = parsed.tables[ROOT_TABLE];
  assert.ok(parent, "Root must be parsed from real generated Supabase types");
  assert.equal(
    parent.columns.some((column) => column.name === PRIVATE_COLUMN),
    false,
    "Private recovery data is NOT Supabase-owned"
  );
  const generated = transform.generateSchema(parsed.tables);
  const table = financialTable(generated);
  assert.match(
    table,
    /\{\s*name:\s*"local_recovery_snapshot_json",\s*type:\s*"string",\s*isOptional:\s*true,?\s*\}/,
    "Transform must consume a durable device-only root-column override"
  );
  assert.equal(
    [...table.matchAll(/name:\s*"local_recovery_snapshot_json"/g)].length,
    1,
    "Local override must be applied exactly once"
  );
});

test("T053 local override preserves every generated public financial-root column", () => {
  const parsed = parsedSource();
  const parent = parsed.tables[ROOT_TABLE];
  assert.ok(parent, "Missing server-authoritative financial root");
  const actual = financialTable(transform.generateSchema(parsed.tables));
  const persisted = financialTable(read(SCHEMA_PATH));
  for (const column of parent.columns) {
    const fragment = `name: "${column.name}"`;
    assert.ok(actual.includes(fragment), "Generator dropped " + fragment);
    assert.ok(
      persisted.includes(fragment),
      "Tracked schema dropped " + fragment
    );
  }
  assert.ok(actual.includes(`name: "${PRIVATE_COLUMN}"`));
  assert.equal(
    [...actual.matchAll(/name:\s*"local_recovery_snapshot_json"/g)].length,
    1
  );
});

test("T053 root extension owns the field while the generated base remains cloud-only", () => {
  const custom = read(MODEL_PATH);
  const base = read(BASE_MODEL_PATH);
  assert.match(
    custom,
    /class FinancialActionGroup extends BaseFinancialActionGroup/
  );
  assert.match(
    custom,
    /@field\(\s*"local_recovery_snapshot_json"\s*\)[\s\S]*?localRecoverySnapshotJson\s*!:\s*string\s*\|\s*null/,
    "Only the non-generated root extension declares the private decorator"
  );
  assert.ok(!base.includes(PRIVATE_COLUMN));
  assert.ok(!base.includes(PRIVATE_PROPERTY));
  assert.ok(base.includes('@field("payload_hash")'));
  assert.ok(base.includes('@field("action_id")'));
});

test("T053 generator does not place device-only recovery in public Supabase types", () => {
  const cloud = read(PUBLIC_TYPES_PATH);
  assert.ok(!cloud.includes(PRIVATE_COLUMN));
  assert.ok(!cloud.includes(PRIVATE_PROPERTY));
  const baseGenerated = parsedSource();
  const parent = baseGenerated.tables[ROOT_TABLE];
  assert.ok(parent);
  const output = transform.generateBaseModel(
    ROOT_TABLE,
    parent.columns,
    baseGenerated.relationships,
    baseGenerated.tables
  );
  assert.ok(!output.includes(PRIVATE_COLUMN));
  assert.ok(!output.includes(PRIVATE_PROPERTY));
  assert.match(output, /payloadHash/);
});

test("T053 migration31 adds only the nullable private root column after 30", () => {
  const versions = migrationVersions();
  assert.ok(
    versions.includes(30),
    "Existing Metal cache migration30 must remain"
  );
  assert.equal(versions.filter((version) => version === 31).length, 1);
  const step = migration31();
  assert.match(step, /addColumns\(\s*\{/);
  assert.match(step, /table:\s*"financial_action_groups"/);
  assert.match(
    step,
    /name:\s*"local_recovery_snapshot_json",\s*type:\s*"string",\s*isOptional:\s*true/,
    "Migration31 must safely initialize existing local roots with NULL"
  );
  assert.ok(!step.includes("supabase/migrations"));
  assert.ok(!step.includes("metal_metadata_edit_outcomes"));
});

test("T053 actual Watermelon schema version follows every sequential local migration", () => {
  const match = read(SCHEMA_PATH).match(/\bversion:\s*(\d+)\b/);
  assert.ok(match);
  const schemaVersion = Number(match[1]);
  assert.ok(schemaVersion >= 31);
  const versions = migrationVersions();
  assert.equal(schemaVersion, Math.max(...versions));
  assert.equal(new Set(versions).size, versions.length);
  for (let version = 30; version <= schemaVersion; version += 1) {
    assert.ok(
      versions.includes(version),
      `Missing Watermelon migration ${version}`
    );
  }
});

test("T053 generated Watermelon bytes remain reproducible through real formatter", async () => {
  const parsed = parsedSource();
  const first = transform.generateSchema(parsed.tables);
  const second = transform.generateSchema(parsed.tables);
  assert.equal(first, second, "Non-deterministic schema generator");
  const formatted = await transform.formatContent(
    join(ROOT, SCHEMA_PATH),
    first
  );
  const repeated = await transform.formatContent(
    join(ROOT, SCHEMA_PATH),
    second
  );
  assert.equal(formatted, repeated, "Generated output is not idempotent");
  assert.equal(
    financialTable(formatted),
    financialTable(read(SCHEMA_PATH)),
    "Tracked local root projection must match repeatable generator output"
  );
});

test("T053 real generator writeIfChanged is idempotent in a disposable sandbox", async (t: TestContext) => {
  const parsed = parsedSource();
  const generated = transform.generateSchema(parsed.tables);
  assert.ok(
    financialTable(generated).includes(`name: "${PRIVATE_COLUMN}"`),
    "Missing local-only column in generated source"
  );
  const temp = mkdtempSync(join(tmpdir(), "monyvi-review-local-schema-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const output = join(temp, "schema.ts");
  assert.equal(await transform.writeIfChanged(output, generated), true);
  const first = readFileSync(output, "utf8");
  assert.equal(await transform.writeIfChanged(output, generated), false);
  assert.equal(readFileSync(output, "utf8"), first);
  assert.ok(financialTable(first).includes(`name: "${PRIVATE_COLUMN}"`));
});
