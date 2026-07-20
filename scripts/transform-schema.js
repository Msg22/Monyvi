/**
 * Transform Supabase Types to WatermelonDB Schema & Models
 *
 * This script reads the generated supabase-types.ts file and produces:
 * - schema.ts (WatermelonDB appSchema)
 * - types.ts (TypeScript type definitions from enums)
 * - models/base-*.ts (Abstract base model classes - AUTO-GENERATED)
 * - models/*.ts (Extended model classes - only created if missing)
 *
 * Usage: node scripts/transform-schema.js
 */

const { execFileSync } = require("child_process");

const fs = require("fs");
const path = require("path");

const ESLINT_BIN = path.join(
  path.dirname(require.resolve("eslint/package.json")),
  "bin",
  "eslint.js"
);
const PRETTIER_BIN = path.join(
  path.dirname(require.resolve("prettier/package.json")),
  "bin",
  "prettier.cjs"
);

function formatWithPrettier(paths) {
  execFileSync(process.execPath, [PRETTIER_BIN, "--write", ...paths], {
    stdio: "inherit",
  });
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUPABASE_TYPES_PATH = path.join(
  __dirname,
  "../packages/db/src/supabase-types.ts"
);
const OUTPUT_DIR = path.join(__dirname, "../packages/db/src");
const MODELS_DIR = path.join(OUTPUT_DIR, "models");
const BASE_MODELS_DIR = path.join(MODELS_DIR, "base");

// Tables to exclude (cloud-only, computed data, or internal)
const EXCLUDED_TABLES = [
  "__InternalSupabase",
  "sms_ai_work_requests",
  "sms_ai_usage_events",
  "sms_ai_scan_sessions",
];

// Mapping from table names to class names (for irregular plurals)
const TABLE_TO_CLASS = {
  accounts: "Account",
  asset_metals: "AssetMetal",
  assets: "Asset",
  bank_details: "BankDetails",
  budgets: "Budget",
  categories: "Category",
  daily_snapshot_assets: "DailySnapshotAssets",
  daily_snapshot_balance: "DailySnapshotBalance",
  daily_snapshot_net_worth: "DailySnapshotNetWorth",
  debts: "Debt",
  profiles: "Profile",
  recurring_payments: "RecurringPayment",
  transactions: "Transaction",
  transfers: "Transfer",
  user_category_settings: "UserCategorySettings",
};

// Fields that should be indexed
const INDEXED_FIELDS = ["user_id", "sms_fingerprint"];

// Fields that are timestamps (stored as number in WatermelonDB)
const TIMESTAMP_FIELDS = [
  "created_at",
  "updated_at",
  "date",
  "due_date",
  "start_date",
  "end_date",
  "next_due_date",
  "purchase_date",
  "period_start",
  "period_end",
  "snapshot_date",
];

// Fields that are readonly
const READONLY_FIELDS = ["created_at"];

// JSON fields - these get a "Raw" suffix and require manual getters in extended models
// The getter should parse the JSON string into the proper TypeScript interface
const JSON_FIELDS = [
  "notification_settings",
  "onboarding_flags",
  "ai_processing_consent",
];

// =============================================================================
// VERSION RESOLUTION
// =============================================================================

/**
 * Read the schema version from migrations.ts (source of truth).
 * Returns the highest `toVersion` found, or 1 if no migrations exist.
 */
function getSchemaVersion() {
  const migrationsPath = path.join(OUTPUT_DIR, "migrations.ts");
  if (fs.existsSync(migrationsPath)) {
    const content = fs.readFileSync(migrationsPath, "utf-8");
    const versions = [...content.matchAll(/toVersion:\s*(\d+)/g)].map((m) =>
      parseInt(m[1], 10)
    );
    if (versions.length > 0) {
      const version = Math.max(...versions);
      console.log(`   Schema version resolved from migrations.ts: ${version}`);
      return version;
    }
  }
  console.log("   No migrations found, using default schema version: 1");
  return 1;
}

// =============================================================================
// PARSING HELPERS
// =============================================================================

/**
 * Parse the supabase-types.ts file and extract table definitions and enums
 */
function extractSchemaBlock(content, schemaName) {
  const schemaMatch = new RegExp(`\\b${schemaName}:\\s*\\{`).exec(content);
  if (!schemaMatch) return null;

  const openingBrace = content.indexOf("{", schemaMatch.index);
  let braceDepth = 0;
  for (let index = openingBrace; index < content.length; index += 1) {
    if (content[index] === "{") braceDepth += 1;
    if (content[index] !== "}") continue;
    braceDepth -= 1;
    if (braceDepth === 0) {
      return content.slice(openingBrace + 1, index);
    }
  }

  throw new Error(
    `Malformed supabase-types.ts: ${schemaName} schema is unclosed`
  );
}

function parseSupabaseTypes(content) {
  const tables = {};
  const enums = {};
  const relationships = {};
  const publicSchema = extractSchemaBlock(content, "public");
  if (publicSchema === null) {
    throw new Error("Could not find public schema in supabase-types.ts");
  }

  // Extract enums using brace-counting (handles multi-line enum values)
  const enumsBlock = extractSchemaBlock(publicSchema, "Enums");
  if (enumsBlock !== null) {
    const enumRegex = /(\w+):\s*([^;]+);/g;
    let match;
    while ((match = enumRegex.exec(enumsBlock)) !== null) {
      const enumName = match[1];
      const enumValues = match[2]
        .split("|")
        .map((v) => v.trim().replace(/"/g, ""))
        .filter((v) => v);
      enums[enumName] = enumValues;
    }
  }

  // Extract tables from the Tables block
  const tablesBlock = extractSchemaBlock(publicSchema, "Tables");
  if (tablesBlock === null) {
    console.error("Could not find Tables block in supabase-types.ts");
    return { tables, enums, relationships };
  }

  // More robust regex that handles empty Relationships: []
  const tableRegex =
    /(\w+):\s*\{\s*Row:\s*\{([\s\S]*?)\};\s*Insert:[\s\S]*?Update:[\s\S]*?Relationships:\s*\[([\s\S]*?)\];\s*\};/g;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(tablesBlock)) !== null) {
    const tableName = tableMatch[1];

    if (EXCLUDED_TABLES.includes(tableName)) {
      continue;
    }

    const rowBlock = tableMatch[2];
    const relationshipsBlock = tableMatch[3] || "";

    // Parse columns from Row block
    const columns = [];
    const columnRegex = /(\w+):\s*([^;]+);/g;
    let colMatch;

    while ((colMatch = columnRegex.exec(rowBlock)) !== null) {
      const colName = colMatch[1];
      const colType = colMatch[2].trim();

      // Skip the 'id' column (WatermelonDB handles this)
      if (colName === "id") continue;

      columns.push({
        name: colName,
        rawType: colType,
        ...parseColumnType(colType, colName, enums),
      });
    }

    tables[tableName] = { columns };

    // Parse relationships (only if not empty)
    if (relationshipsBlock.trim()) {
      const relRegex =
        /foreignKeyName:\s*"([^"]+)"[\s\S]*?columns:\s*\["([^"]+)"\][\s\S]*?referencedRelation:\s*"([^"]+)"/g;
      let relMatch;
      relationships[tableName] = relationships[tableName] || [];

      while ((relMatch = relRegex.exec(relationshipsBlock)) !== null) {
        const referencedTable = relMatch[3];
        // Skip relationships to excluded tables (they won't have models)
        if (EXCLUDED_TABLES.includes(referencedTable)) {
          continue;
        }
        relationships[tableName].push({
          foreignKey: relMatch[2],
          referencedTable,
        });
      }
    }
  }

  return { tables, enums, relationships };
}

/**
 * Parse a column type from Supabase types to WatermelonDB type
 */
function parseColumnType(rawType, columnName, enums) {
  // JSON columns are stored as TEXT in WatermelonDB and may legitimately
  // hold an empty string between migration and the first server sync,
  // even when the upstream Supabase column is `NOT NULL DEFAULT '{}'`.
  // Marking them `isOptional: true` mirrors the way `notification_settings`
  // is treated and silences "string vs string|null" mismatches against the
  // raw column the getter parses (round-2 review #18).
  const isJsonColumn = JSON_FIELDS.includes(columnName);
  const isOptional = rawType.includes("| null") || isJsonColumn;
  const cleanType = rawType.replace(/\s*\|\s*null/g, "").trim();

  // Check if it's an enum reference
  const enumMatch = cleanType.match(
    /Database\["public"\]\["Enums"\]\["(\w+)"\]/
  );
  if (enumMatch) {
    return {
      wmType: "string",
      isOptional,
      isEnum: true,
      enumName: enumMatch[1],
    };
  }

  // Determine WatermelonDB type
  let wmType = "string";
  if (cleanType === "number") {
    wmType = "number";
  } else if (cleanType === "boolean") {
    wmType = "boolean";
  } else if (cleanType === "string") {
    wmType = "string";
  } else if (cleanType === "Json") {
    wmType = "string"; // JSON stored as string in SQLite
  }

  // Check if it's a known JSON field (needs Raw suffix and manual getter)
  const isJsonField = cleanType === "Json" && JSON_FIELDS.includes(columnName);

  // Check if it should be indexed
  const isIndexed =
    INDEXED_FIELDS.includes(columnName) || columnName.endsWith("_id");

  // Check if it's a timestamp
  const isTimestamp = TIMESTAMP_FIELDS.includes(columnName);
  if (isTimestamp) {
    wmType = "number";
  }

  return {
    wmType,
    isOptional,
    isIndexed,
    isTimestamp,
    isReadonly: READONLY_FIELDS.includes(columnName),
    isJsonField,
  };
}

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generate schema.ts content
 */
function generateSchema(tables) {
  const tableSchemas = Object.entries(tables)
    .map(([tableName, { columns }]) => {
      const columnDefs = columns
        .map((col) => {
          const parts = [`{ name: "${col.name}", type: "${col.wmType}"`];
          if (col.isOptional) parts.push("isOptional: true");
          if (col.isIndexed) parts.push("isIndexed: true");
          return `        ${parts.join(", ")} }`;
        })
        .join(",\n");

      return `    tableSchema({
      name: "${tableName}",
      columns: [
${columnDefs},
      ],
    })`;
    })
    .join(",\n\n");

  return `/**
 * WatermelonDB Schema for Monyvi
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run 'npm run db:sync' to regenerate
 */

import { appSchema, tableSchema } from "@nozbe/watermelondb";

export const schema = appSchema({
  version: ${getSchemaVersion()},
  tables: [
${tableSchemas},
  ],
});
`;
}

/**
 * Generate types.ts content
 */
function generateTypes(enums) {
  const typeExports = Object.entries(enums)
    .map(([enumName, values]) => {
      const pascalName = snakeToPascal(enumName);
      const valueUnion = values.map((v) => `"${v}"`).join(" | ");
      return `export type ${pascalName} = ${valueUnion};`;
    })
    .join("\n");

  // Add common interfaces
  return `/**
 * Shared Types for WatermelonDB Models
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run 'npm run db:sync' to regenerate
 */

// =============================================================================
// ENUM TYPES (from Supabase)
// =============================================================================

${typeExports}

// =============================================================================
// COMPLEX TYPES
// =============================================================================

export interface NotificationSettings {
  sms_transaction_confirmation: boolean;
  recurring_reminders: boolean;
  budget_alerts: boolean;
  low_balance_warnings: boolean;
}

export interface OnboardingFlags {
  readonly cash_account_tooltip_dismissed?: boolean;
  readonly voice_tooltip_seen?: boolean;
}

export interface AiProcessingConsent {
  readonly version: string;
  readonly consentedAt: string;
  readonly revokedAt: string | null;
}
`;
}

/**
 * Generate a base model file (abstract class)
 */
function generateBaseModel(tableName, columns, relationships, allTables) {
  const className = tableToClassName(tableName);
  const baseClassName = `Base${className}`;
  // Filter relationships to only include tables that exist in allTables (not excluded)
  const rels = (relationships[tableName] || []).filter(
    (rel) => allTables[rel.referencedTable]
  );

  // Find reverse relationships (has_many) - only from tables that exist in allTables
  const hasMany = [];
  for (const [otherTable, otherRels] of Object.entries(relationships)) {
    if (otherTable === tableName) continue;
    // Skip if the referencing table is not in allTables
    if (!allTables[otherTable]) continue;
    for (const rel of otherRels || []) {
      if (rel.referencedTable === tableName) {
        hasMany.push({
          table: otherTable,
          foreignKey: rel.foreignKey,
        });
      }
    }
  }

  // Build associations
  const associations = [];
  const seenBelongsToTables = new Map(); // Track table occurrences for belongs_to

  // First pass: count occurrences of each referenced table for belongs_to
  for (const rel of rels) {
    seenBelongsToTables.set(
      rel.referencedTable,
      (seenBelongsToTables.get(rel.referencedTable) || 0) + 1
    );
  }

  // Second pass: generate associations with unique keys
  const usedBelongsToTables = new Map();
  for (const rel of rels) {
    const count = seenBelongsToTables.get(rel.referencedTable);
    let assocKey = rel.referencedTable;

    // If this table is referenced multiple times, prefix with foreign key
    if (count > 1) {
      assocKey = rel.foreignKey.replace(/_id$/, "_") + rel.referencedTable;
    }

    usedBelongsToTables.set(
      rel.referencedTable,
      (usedBelongsToTables.get(rel.referencedTable) || 0) + 1
    );

    associations.push(
      `    ${assocKey}: { type: "belongs_to", key: "${rel.foreignKey}" }`
    );
  }

  const seenHasManyTables = new Set();
  for (const rel of hasMany) {
    // Use unique key when same table has multiple foreign keys
    const assocKey = seenHasManyTables.has(rel.table)
      ? `${rel.table}_${rel.foreignKey.replace(/_id$/, "")}`
      : rel.table;
    seenHasManyTables.add(rel.table);
    associations.push(
      `    ${assocKey}: { type: "has_many", foreignKey: "${rel.foreignKey}" }`
    );
  }

  // Build consolidated WatermelonDB imports
  const wmImports = ["Model"];
  const decorators = new Set(["field"]);

  for (const col of columns) {
    if (col.isTimestamp) decorators.add("date");
    if (col.isReadonly) decorators.add("readonly");
  }

  if (rels.length > 0) {
    decorators.add("relation");
    wmImports.push("type Relation");
  }
  if (hasMany.length > 0) {
    decorators.add("children");
    wmImports.push("Query");
  }

  const imports = [
    `import { ${wmImports.join(", ")} } from "@nozbe/watermelondb";`,
  ];

  imports.push(
    `import { ${Array.from(decorators).sort().join(", ")} } from "@nozbe/watermelondb/decorators";`
  );

  if (associations.length > 0) {
    imports.push(
      'import type { Associations } from "@nozbe/watermelondb/Model";'
    );
  }

  // Add type imports
  const typeImports = [];
  for (const col of columns) {
    if (col.isEnum && col.enumName) {
      typeImports.push(snakeToPascal(col.enumName));
    }
  }
  if (typeImports.length > 0) {
    imports.push(
      `import type { ${[...new Set(typeImports)].join(", ")} } from "../../types";`
    );
  }

  // Build field declarations
  const fieldDeclarations = columns
    .map((col) => {
      // JSON fields get a "Raw" suffix to indicate they need parsing
      const propName = col.isJsonField
        ? snakeToCamel(col.name) + "Raw"
        : snakeToCamel(col.name);
      const decorator = col.isTimestamp ? "date" : "field";
      const readonly = col.isReadonly ? "@readonly " : "";
      const optional = col.isOptional ? "?" : "!";
      let tsType = "string";

      if (col.wmType === "number") tsType = col.isTimestamp ? "Date" : "number";
      else if (col.wmType === "boolean") tsType = "boolean";
      else if (col.isEnum && col.enumName) tsType = snakeToPascal(col.enumName);
      // JSON fields stay as string - they need manual getters to parse

      return `  ${readonly}@${decorator}("${col.name}") ${propName}${optional}: ${tsType};`;
    })
    .join("\n");

  // Build relation declarations - use Base prefix for types
  const relationDeclarations = rels
    .map((rel) => {
      const propName = snakeToCamel(rel.foreignKey.replace(/_id$/, ""));
      const relClassName = tableToClassName(rel.referencedTable);
      return `  @relation("${rel.referencedTable}", "${rel.foreignKey}") ${propName}!: Relation<Base${relClassName}>;`;
    })
    .join("\n");

  // Build children declarations
  const seenChildTables = new Set();
  const childrenDeclarations = hasMany
    .map((rel) => {
      const propName = seenChildTables.has(rel.table)
        ? snakeToCamel(`${rel.table}_${rel.foreignKey.replace(/_id$/, "")}`)
        : snakeToCamel(rel.table);
      seenChildTables.add(rel.table);
      return `  @children("${rel.table}") ${propName}!: Query<Model>;`;
    })
    .join("\n");

  // Add related model imports - use base- prefix for imports
  // Use a Set to avoid duplicate imports when multiple FKs point to same table
  const addedImports = new Set();
  for (const rel of rels) {
    const relClassName = tableToClassName(rel.referencedTable);
    const importStatement = `import type { Base${relClassName} } from "./base-${pascalToKebab(relClassName)}";`;
    if (relClassName !== className && !addedImports.has(importStatement)) {
      imports.push(importStatement);
      addedImports.add(importStatement);
    }
  }

  const associationsStr =
    associations.length > 0
      ? `  static associations: Associations = {\n${associations.join(",\n")},\n  };`
      : "";

  return `
/**
 * Base${className} - Abstract Base Model for WatermelonDB
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run 'npm run db:sync' to regenerate
 * 
 * Extend this class in ../${className}.ts to add custom methods
*/

${imports.join("\n")}

export abstract class ${baseClassName} extends Model {
  static table = "${tableName}";
${associationsStr}

${fieldDeclarations}
${relationDeclarations ? "\n" + relationDeclarations : ""}${childrenDeclarations ? "\n" + childrenDeclarations : ""}
}
`;
}

/**
 * Generate an extended model file (only if it doesn't exist)
 */
function generateExtendedModel(tableName) {
  const className = tableToClassName(tableName);
  const baseClassName = `Base${className}`;
  const baseFileName = `base-${pascalToKebab(className)}`;

  return `

import { ${baseClassName} } from "./base/${baseFileName}";

export class ${className} extends ${baseClassName} {
}
`;
}

// =============================================================================
// UTILITIES
// =============================================================================

function snakeToPascal(str) {
  return str
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function snakeToCamel(str) {
  const pascal = snakeToPascal(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function pascalToKebab(str) {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function tableToClassName(tableName) {
  return (
    TABLE_TO_CLASS[tableName] || snakeToPascal(tableName.replace(/s$/, ""))
  );
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  console.log("🔄 Reading supabase-types.ts...");
  const content = fs.readFileSync(SUPABASE_TYPES_PATH, "utf-8");

  console.log("📊 Parsing types and tables...");
  const { tables, enums, relationships } = parseSupabaseTypes(content);

  console.log(`   Found ${Object.keys(tables).length} tables`);
  console.log(`   Found ${Object.keys(enums).length} enums`);
  console.log(`   Excluded: ${EXCLUDED_TABLES.join(", ")}`);

  // Ensure models directory exists
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }
  // Ensure base models directory exists
  if (!fs.existsSync(BASE_MODELS_DIR)) {
    fs.mkdirSync(BASE_MODELS_DIR, { recursive: true });
  }

  // Generate schema.ts
  console.log("📝 Generating schema.ts...");
  const schemaContent = generateSchema(tables);
  const schemaPath = path.join(OUTPUT_DIR, "schema.ts");
  fs.writeFileSync(schemaPath, schemaContent);

  // Generate types.ts
  console.log("📝 Generating types.ts...");
  const typesContent = generateTypes(enums);
  const typesPath = path.join(OUTPUT_DIR, "types.ts");
  fs.writeFileSync(typesPath, typesContent);

  // Format schema.ts and types.ts with Prettier so the output matches
  // the editor / pre-commit formatter and avoids phantom git diffs.
  formatWithPrettier([schemaPath, typesPath]);

  // Generate base model files (always overwritten)
  console.log("📝 Generating base model files...");
  for (const [tableName, { columns }] of Object.entries(tables)) {
    const className = tableToClassName(tableName);
    const baseFileName = `base-${pascalToKebab(className)}.ts`;
    const baseModelContent = generateBaseModel(
      tableName,
      columns,
      relationships,
      tables
    );
    fs.writeFileSync(
      path.join(BASE_MODELS_DIR, baseFileName),
      baseModelContent
    );
    console.log(`   ✅ base/${baseFileName}`);
  }

  // Generate extended model files (only if missing)
  console.log("📝 Checking extended model files...");
  for (const tableName of Object.keys(tables)) {
    const className = tableToClassName(tableName);
    const extendedFileName = `${className}.ts`;
    const extendedFilePath = path.join(MODELS_DIR, extendedFileName);

    if (!fs.existsSync(extendedFilePath)) {
      const extendedModelContent = generateExtendedModel(tableName);
      fs.writeFileSync(extendedFilePath, extendedModelContent);
      console.log(`   ✅ ${extendedFileName} (created)`);
    } else {
      console.log(`   ⏭️  ${extendedFileName} (exists, skipped)`);
    }
  }

  // Format the generated base model files with Prettier
  console.log("\n🎨 Formatting base model files...");

  formatWithPrettier([`${BASE_MODELS_DIR}/**/*.ts`]);
  console.log("   ✅ Base models formatted");

  console.log("\nLinting base model files...");
  try {
    const eslintRulesDir = path.join(__dirname, "eslint-rules");
    execFileSync(
      process.execPath,
      [
        ESLINT_BIN,
        BASE_MODELS_DIR,
        "--rulesdir",
        eslintRulesDir,
        "--ext",
        ".ts",
        "--fix",
      ],
      {
        stdio: "inherit",
      }
    );
    console.log("   ✅ Base models linted");
  } catch (error) {
    console.error("ESLint failed:", error.message);
    process.exit(1);
  }

  console.log("\n✨ Schema sync complete!");
  console.log("   Base models (base-*.ts) are regenerated each time.");
  console.log("   Extended models (*.ts) are only created if missing.");
}

if (require.main === module) {
  main();
}

module.exports = { parseSupabaseTypes };
