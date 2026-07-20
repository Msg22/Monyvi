/**
 * SQL to WatermelonDB Migration Converter
 *
 * Parses a Supabase SQL migration file and generates a WatermelonDB migration
 * step in packages/db/src/migrations.ts.
 *
 * Supported SQL patterns:
 *   - ALTER TABLE x ADD COLUMN [IF NOT EXISTS] y type [constraints]
 *   - CREATE TABLE [IF NOT EXISTS] x (columns...)
 *
 * Intentionally skipped (Supabase-only, no WatermelonDB equivalent):
 *   - DML (UPDATE, INSERT, DELETE)
 *   - Functions, triggers, indexes, enums, grants, comments
 *   - DROP/ALTER/RENAME column operations
 *
 * Usage:
 *   node scripts/sql-to-watermelon-migration.js <path-to-sql-file>
 *   node scripts/sql-to-watermelon-migration.js --latest
 */

const fs = require("fs");
const path = require("path");

// =============================================================================
// CONFIGURATION (shared with transform-schema.js)
// =============================================================================

const MIGRATIONS_TS_PATH = path.join(
  __dirname,
  "../packages/db/src/migrations.ts"
);

const SCHEMA_TS_PATH = path.join(__dirname, "../packages/db/src/schema.ts");

const SUPABASE_MIGRATIONS_DIR = path.join(__dirname, "../supabase/migrations");

// Tables excluded from WatermelonDB
const EXCLUDED_TABLES = [
  "__InternalSupabase",
  "sms_ai_work_requests",
  "sms_ai_usage_events",
];

// Timestamp fields — these use WatermelonDB type "number" regardless of SQL type
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

// Fields that should be indexed in WatermelonDB
const INDEXED_FIELDS = ["user_id", "sms_fingerprint"];

// =============================================================================
// SQL TYPE MAPPING
// =============================================================================

/**
 * Map a SQL column type to a WatermelonDB column type.
 * @param {string} sqlType - The raw SQL type string (e.g., "integer", "text", "decimal(15,2)")
 * @param {string} columnName - The column name (used for timestamp overrides)
 * @returns {"string" | "number" | "boolean"}
 */
function sqlTypeToWatermelon(sqlType, columnName) {
  // Timestamp fields always map to "number" in WatermelonDB
  if (TIMESTAMP_FIELDS.includes(columnName)) {
    return "number";
  }

  const normalized = sqlType.toLowerCase().trim();

  // Number types
  if (
    /^(integer|int|bigint|smallint|serial|bigserial|real|float|double\s+precision|numeric|decimal)/.test(
      normalized
    )
  ) {
    return "number";
  }

  // Boolean types
  if (/^bool(ean)?(?:\s|$)/.test(normalized)) {
    return "boolean";
  }

  // Everything else is "string" (text, varchar, uuid, json, jsonb, timestamp, date, etc.)
  return "string";
}

// =============================================================================
// SQL PARSING
// =============================================================================

/**
 * Parse a SQL migration file and extract schema-changing statements.
 *
 * @param {string} sql - The full SQL file content
 * @returns {{ addColumns: Record<string, Array<{name: string, type: string, isOptional: boolean, isIndexed: boolean, isIfNotExists?: boolean}>>, createTables: Record<string, Array<{name: string, type: string, isOptional: boolean, isIndexed: boolean, isIfNotExists?: boolean}>>, warnings: string[] }}
 */
function parseSql(sql) {
  /** @type {Record<string, Array<{name: string, type: string, isOptional: boolean, isIndexed: boolean, isIfNotExists?: boolean}>>} */
  const addColumns = {};
  /** @type {Record<string, Array<{name: string, type: string, isOptional: boolean, isIndexed: boolean, isIfNotExists?: boolean}>>} */
  const createTables = {};
  /** @type {string[]} */
  const warnings = [];

  // Normalize: remove block comments
  const cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, "");

  // Split into individual statements
  const statements = cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    // Skip comment-only lines
    const withoutLineComments = stmt
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim();

    if (!withoutLineComments) continue;

    // Try to parse ALTER TABLE ... ADD COLUMN
    if (parseAlterTableAddColumn(withoutLineComments, addColumns)) {
      continue;
    }

    // Try to parse CREATE TABLE
    if (parseCreateTable(withoutLineComments, createTables)) {
      continue;
    }

    // Check if this is something we intentionally skip
    if (isSkippableStatement(withoutLineComments)) {
      continue;
    }

    // Unrecognized DDL — warn
    const preview = withoutLineComments.substring(0, 80).replace(/\n/g, " ");
    warnings.push(`Skipped unrecognized statement: ${preview}...`);
  }

  return { addColumns, createTables, warnings };
}

/**
 * Try to parse an ALTER TABLE ... ADD COLUMN statement.
 * Handles: ALTER TABLE [schema.]table ADD COLUMN [IF NOT EXISTS] col_name type [constraints]
 * Also handles multi-column ADD: ALTER TABLE x ADD COLUMN a type, ADD COLUMN b type
 *
 * @param {string} stmt
 * @param {Record<string, Array<{name: string, type: string, isOptional: boolean, isIndexed: boolean, isIfNotExists?: boolean}>>} result
 * @returns {boolean}
 */
function parseAlterTableAddColumn(stmt, result) {
  // Match ALTER TABLE with ADD COLUMN
  const alterMatch = stmt.match(
    /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:\w+\.)?(\w+)/i
  );
  if (!alterMatch) return false;

  // Check if it contains ADD COLUMN
  if (!/ADD\s+COLUMN/i.test(stmt)) return false;

  const tableName = alterMatch[1];

  // Skip excluded tables
  if (EXCLUDED_TABLES.includes(tableName)) return true;

  // Extract individual ADD COLUMN clauses
  // Handles comma-separated multi-column ADD statements
  // The type capture group matches everything after the column name up to the
  // next ADD COLUMN clause, a trailing comma, or end-of-statement. This handles
  // complex DEFAULT expressions like `'{}'::JSONB`, `NOW()`, `gen_random_uuid()`.
  const addColumnRegex =
    /ADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?(\w+)\s+([\s\S]+?)(?=\s*(?:,\s*ADD\s+COLUMN|$))/gi;

  let match;
  while ((match = addColumnRegex.exec(stmt)) !== null) {
    const isIfNotExists = Boolean(match[1]);
    const colName = match[2];
    const rawType = match[3].trim();

    // Skip 'id' column — WatermelonDB handles it
    if (colName === "id") continue;

    // Determine WatermelonDB type
    const wmType = sqlTypeToWatermelon(rawType, colName);

    // Check if optional (NOT NULL absent means nullable)
    const isOptional = !/NOT\s+NULL/i.test(rawType);

    // Check if indexed
    const isIndexed =
      INDEXED_FIELDS.includes(colName) || colName.endsWith("_id");

    if (!result[tableName]) {
      result[tableName] = [];
    }

    result[tableName].push({
      name: colName,
      type: wmType,
      isOptional,
      isIndexed,
      isIfNotExists,
    });
  }

  return true;
}

/**
 * Try to parse a CREATE TABLE statement.
 *
 * @param {string} stmt
 * @param {Record<string, Array<{name: string, type: string, isOptional: boolean, isIndexed: boolean, isIfNotExists?: boolean}>>} result
 * @returns {boolean}
 */
function parseCreateTable(stmt, result) {
  const createMatch = stmt.match(
    /^CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?(\w+)\s*\(([\s\S]+)\)/i
  );
  if (!createMatch) return false;

  const isIfNotExists = Boolean(createMatch[1]);
  const tableName = createMatch[2];
  const columnsBlock = createMatch[3];

  // Skip excluded tables
  if (EXCLUDED_TABLES.includes(tableName)) return true;

  const columns = [];

  // Split columns — need to handle nested parentheses in types like DECIMAL(15,2)
  const columnDefs = splitColumnDefs(columnsBlock);

  for (const colDef of columnDefs) {
    const trimmed = colDef.trim();

    // Skip constraints (PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK, CONSTRAINT)
    if (
      /^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT)/i.test(trimmed)
    ) {
      continue;
    }

    // Parse: column_name type [constraints]
    const colMatch = trimmed.match(/^(\w+)\s+([A-Za-z][A-Za-z0-9_ (),.]*)/);
    if (!colMatch) continue;

    const colName = colMatch[1];
    const rawType = colMatch[2].trim();

    // Skip 'id' column
    if (colName === "id") continue;

    const wmType = sqlTypeToWatermelon(rawType, colName);
    const isOptional = !/NOT\s+NULL/i.test(trimmed);
    const isIndexed =
      INDEXED_FIELDS.includes(colName) || colName.endsWith("_id");

    columns.push({
      name: colName,
      type: wmType,
      isOptional,
      isIndexed,
      isIfNotExists,
    });
  }

  if (columns.length > 0) {
    result[tableName] = columns;
  }

  return true;
}

/**
 * Split column definitions while respecting parentheses (e.g., DECIMAL(15,2)).
 *
 * @param {string} block
 * @returns {string[]}
 */
function splitColumnDefs(block) {
  const parts = [];
  let depth = 0;
  let current = "";

  for (const char of block) {
    if (char === "(") {
      depth++;
      current += char;
    } else if (char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    parts.push(current);
  }

  return parts;
}

/**
 * Check if a SQL statement is something we intentionally skip.
 *
 * @param {string} stmt
 * @returns {boolean}
 */
function isSkippableStatement(stmt) {
  const skippable = [
    /^UPDATE\s/i,
    /^INSERT\s/i,
    /^DELETE\s/i,
    /^SELECT\s/i,
    /^CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i,
    /^CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/i,
    /^CREATE\s+(OR\s+REPLACE\s+)?VIEW/i,
    /^CREATE\s+TYPE/i,
    /^CREATE\s+(UNIQUE\s+)?INDEX/i,
    /^DROP\s/i,
    /^ALTER\s+TYPE/i,
    /^ALTER\s+TABLE\s+.*\s+(DROP|ALTER|RENAME|ADD\s+CONSTRAINT)\s/i,
    /^REVOKE\s/i,
    /^GRANT\s/i,
    /^COMMENT\s/i,
    /^SET\s/i,
    /^BEGIN/i,
    /^END/i,
    /^COMMIT/i,
  ];

  return skippable.some((pattern) => pattern.test(stmt));
}

// =============================================================================
// MIGRATIONS.TS CODE GENERATION
// =============================================================================

/**
 * Read the current highest toVersion from migrations.ts.
 *
 * @returns {number} The highest toVersion, or 0 if no migrations exist.
 */
function getCurrentVersion() {
  if (!fs.existsSync(MIGRATIONS_TS_PATH)) {
    return 0;
  }

  const content = fs.readFileSync(MIGRATIONS_TS_PATH, "utf-8");
  const versions = [...content.matchAll(/toVersion:\s*(\d+)/g)].map((m) =>
    parseInt(m[1], 10)
  );

  return versions.length > 0 ? Math.max(...versions) : 0;
}

/**
 * Generate the import statement for the needed WatermelonDB migration functions.
 *
 * @param {boolean} hasAddColumns
 * @param {boolean} hasCreateTables
 * @param {boolean} hasUnsafeExecuteSql
 * @returns {string}
 */
function generateImports(hasAddColumns, hasCreateTables, hasUnsafeExecuteSql) {
  const imports = ["schemaMigrations"];
  if (hasAddColumns) imports.unshift("addColumns");
  if (hasCreateTables) imports.unshift("createTable");
  if (hasUnsafeExecuteSql) imports.unshift("unsafeExecuteSql");

  return `import {\n  ${imports.join(",\n  ")},\n} from "@nozbe/watermelondb/Schema/migrations";`;
}

/**
 * Generate a single WatermelonDB migration step as a code string.
 *
 * @param {number} toVersion
 * @param {Record<string, Array<{name: string, type: string, isOptional: boolean, isIndexed: boolean, isIfNotExists?: boolean}>>} addColumnsData
 * @param {Record<string, Array<{name: string, type: string, isOptional: boolean, isIndexed: boolean, isIfNotExists?: boolean}>>} createTablesData
 * @returns {string}
 */
function generateMigrationStep(toVersion, addColumnsData, createTablesData) {
  const steps = [];

  // Generate addColumns steps
  for (const [table, columns] of Object.entries(addColumnsData)) {
    const colDefs = columns
      .map((col) => {
        const parts = [`name: "${col.name}", type: "${col.type}"}`];
        if (col.isOptional) {
          parts[0] = `name: "${col.name}", type: "${col.type}", isOptional: true }`;
        }
        return `          { ${parts[0]}`;
      })
      .join(",\n");

    steps.push(
      `        addColumns({\n          table: "${table}",\n          columns: [\n${colDefs},\n          ],\n        })`
    );
  }

  // Generate createTable steps
  for (const [table, columns] of Object.entries(createTablesData)) {
    const colDefs = columns
      .map((col) => {
        const parts = [`name: "${col.name}", type: "${col.type}"}`];
        if (col.isOptional) {
          parts[0] = `name: "${col.name}", type: "${col.type}", isOptional: true }`;
        }
        if (col.isIndexed) {
          parts[0] = parts[0].replace("}", ", isIndexed: true }");
        }
        return `          { ${parts[0]}`;
      })
      .join(",\n");

    steps.push(
      `        createTable({\n          name: "${table}",\n          columns: [\n${colDefs},\n          ],\n        })`
    );
  }

  return `    {\n      toVersion: ${toVersion},\n      steps: [\n${steps.join(",\n")},\n      ],\n    }`;
}

/**
 * Generate the full migrations.ts file content.
 *
 * @param {string[]} allMigrationSteps - Array of migration step code strings
 * @param {boolean} hasAddColumns
 * @param {boolean} hasCreateTables
 * @param {boolean} hasUnsafeExecuteSql
 * @returns {string}
 */
function generateMigrationsFile(
  allMigrationSteps,
  hasAddColumns,
  hasCreateTables,
  hasUnsafeExecuteSql
) {
  const imports = generateImports(
    hasAddColumns,
    hasCreateTables,
    hasUnsafeExecuteSql
  );

  return `/**
 * WatermelonDB Schema Migrations
 * AUTO-MANAGED by sql-to-watermelon-migration.js
 *
 * Each migration must target the next sequential version.
 * The schema version in schema.ts is auto-resolved from the highest toVersion here.
 *
 * @see https://watermelondb.dev/docs/Advanced/Migrations
 */

${imports}

export const migrations = schemaMigrations({
  migrations: [
${allMigrationSteps.join(",\n")},
  ],
});
`;
}

/**
 * Parse existing migration steps from the current migrations.ts file.
 *
 * @returns {{ steps: string[], hasAddColumns: boolean, hasCreateTables: boolean, hasUnsafeExecuteSql: boolean }}
 */
function parseExistingMigrations() {
  if (!fs.existsSync(MIGRATIONS_TS_PATH)) {
    return {
      steps: [],
      hasAddColumns: false,
      hasCreateTables: false,
      hasUnsafeExecuteSql: false,
    };
  }

  const content = fs.readFileSync(MIGRATIONS_TS_PATH, "utf-8");

  // Check what functions are used
  const hasAddColumns = content.includes("addColumns(");
  const hasCreateTables = content.includes("createTable(");
  const hasUnsafeExecuteSql = content.includes("unsafeExecuteSql(");

  // Extract individual migration objects from the migrations array
  // Each migration object is { toVersion: N, steps: [...] }
  const migrationsArrayMatch = content.match(
    /migrations:\s*\[([\s\S]*?)\],\s*\}\);/
  );
  if (!migrationsArrayMatch) {
    return {
      steps: [],
      hasAddColumns,
      hasCreateTables,
      hasUnsafeExecuteSql,
    };
  }

  const migrationsArray = migrationsArrayMatch[1];

  // Split by migration objects — each starts with { and contains toVersion
  const steps = [];
  let depth = 0;
  let current = "";
  let inMigration = false;

  for (const char of migrationsArray) {
    if (char === "{" && depth === 0) {
      inMigration = true;
      depth++;
      current += char;
    } else if (char === "{") {
      depth++;
      current += char;
    } else if (char === "}") {
      depth--;
      current += char;
      if (depth === 0 && inMigration) {
        steps.push(current.trim());
        current = "";
        inMigration = false;
      }
    } else if (inMigration) {
      current += char;
    }
  }

  // Indent each step to match the expected indentation
  const indentedSteps = steps.map((step) => {
    // Normalize indentation to 4 spaces
    return (
      "    " +
      step.replace(/^\s+/gm, (match) => {
        const spaces = match.length;
        return " ".repeat(spaces);
      })
    );
  });

  return {
    steps: indentedSteps,
    hasAddColumns,
    hasCreateTables,
    hasUnsafeExecuteSql,
  };
}

// =============================================================================
// FILE RESOLUTION
// =============================================================================

/**
 * Extract the numeric prefix from a migration filename.
 *
 * @param {string} filename
 * @returns {number} The numeric prefix, or -1 if unparseable.
 */
function extractNumericPrefix(filename) {
  const match = filename.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : -1;
}

/**
 * Check whether a filename uses the project's sequential naming convention
 * (e.g. "027_description.sql" — up to 4 leading digits).
 *
 * Timestamps from `supabase db pull` use 14-digit prefixes and
 * should not be treated as the "latest" sequential migration.
 *
 * @param {string} filename
 * @returns {boolean}
 */
function isSequentialMigration(filename) {
  return /^\d{1,4}_/.test(filename);
}

/**
 * Find the latest SQL migration file in supabase/migrations/.
 *
 * Prefers files that follow the project's sequential `NNN_*` naming
 * convention. Falls back to timestamp-prefixed files only when no
 * sequential migrations exist.
 *
 * @returns {string} Absolute path to the latest .sql file
 */
function findLatestMigration() {
  if (!fs.existsSync(SUPABASE_MIGRATIONS_DIR)) {
    console.error(
      `❌ Supabase migrations directory not found: ${SUPABASE_MIGRATIONS_DIR}`
    );
    process.exit(1);
  }

  const allFiles = fs
    .readdirSync(SUPABASE_MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"));

  if (allFiles.length === 0) {
    console.error("❌ No .sql files found in supabase/migrations/");
    process.exit(1);
  }

  // Prefer sequential migrations (NNN_*) — the project's canonical convention
  const sequential = allFiles
    .filter(isSequentialMigration)
    .sort((a, b) => extractNumericPrefix(a) - extractNumericPrefix(b));

  const latest =
    sequential.length > 0
      ? sequential[sequential.length - 1]
      : allFiles.sort()[allFiles.length - 1];

  return path.join(SUPABASE_MIGRATIONS_DIR, latest);
}

// =============================================================================
// IDEMPOTENCY CHECK
// =============================================================================

/**
 * Escape special regex characters in a string for safe use in `new RegExp()`.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check whether a specific column addition already exists within an
 * addColumns block for the given table in the migrations content.
 */
function hasAddColumnInTable(content, table, colName) {
  const blocks = [...content.matchAll(/addColumns\(\s*\{([\s\S]*?)\}\s*\)/g)];
  return blocks.some(([, block]) => {
    return (
      new RegExp(`table:\\s*"${escapeRegex(table)}"`).test(block) &&
      new RegExp(`name:\\s*"${escapeRegex(colName)}"`).test(block)
    );
  });
}

/**
 * Check whether a createTable block for the given table already exists
 * in the migrations content.
 */
function hasCreateTable(content, table) {
  const blocks = [...content.matchAll(/createTable\(\s*\{([\s\S]*?)\}\s*\)/g)];
  return blocks.some(([, block]) =>
    new RegExp(`name:\\s*"${escapeRegex(table)}"`).test(block)
  );
}

/**
 * Find the column block for a specific table in the current WatermelonDB schema.
 *
 * @param {string} schemaContent
 * @param {string} table
 * @returns {string | null}
 */
function findTableSchemaColumns(schemaContent, table) {
  const tableMatch = schemaContent.match(
    new RegExp(
      `tableSchema\\(\\s*\\{\\s*name:\\s*"${escapeRegex(
        table
      )}"\\s*,\\s*columns:\\s*\\[([\\s\\S]*?)\\]\\s*,?\\s*\\}\\s*\\)`,
      "m"
    )
  );

  return tableMatch ? tableMatch[1] : null;
}

/**
 * Check whether the current WatermelonDB schema already defines a table.
 *
 * @param {string} schemaContent
 * @param {string} table
 * @returns {boolean}
 */
function hasTableInCurrentSchema(schemaContent, table) {
  return findTableSchemaColumns(schemaContent, table) !== null;
}

/**
 * Check whether the current WatermelonDB schema already defines a table column.
 *
 * @param {string} schemaContent
 * @param {string} table
 * @param {string} colName
 * @returns {boolean}
 */
function hasColumnInCurrentSchema(schemaContent, table, colName) {
  const columnsBlock = findTableSchemaColumns(schemaContent, table);

  if (!columnsBlock) {
    return false;
  }

  return new RegExp(`name:\\s*"${escapeRegex(colName)}"`).test(columnsBlock);
}

/**
 * Remove parsed SQL changes that already exist in the current WatermelonDB schema.
 * This prevents ADD COLUMN IF NOT EXISTS migrations from generating duplicate local
 * migrations when the remote database is catching up to a column Watermelon already has.
 *
 * @param {string} schemaContent
 * @param {Record<string, Array<{name: string, type: string, isOptional: boolean, isIndexed: boolean, isIfNotExists?: boolean}>>} addColumnsData
 * @param {Record<string, Array<{name: string, type: string, isOptional: boolean, isIndexed: boolean, isIfNotExists?: boolean}>>} createTablesData
 * @returns {{ addColumns: Record<string, Array<{name: string, type: string, isOptional: boolean, isIndexed: boolean, isIfNotExists?: boolean}>>, createTables: Record<string, Array<{name: string, type: string, isOptional: boolean, isIndexed: boolean, isIfNotExists?: boolean}>>, skipped: string[] }}
 */
function filterSchemaChangesAlreadyInWatermelon(
  schemaContent,
  addColumnsData,
  createTablesData
) {
  /** @type {Record<string, Array<{name: string, type: string, isOptional: boolean, isIndexed: boolean, isIfNotExists?: boolean}>>} */
  const filteredAddColumns = {};
  /** @type {Record<string, Array<{name: string, type: string, isOptional: boolean, isIndexed: boolean, isIfNotExists?: boolean}>>} */
  const filteredCreateTables = {};
  /** @type {string[]} */
  const skipped = [];

  for (const [table, columns] of Object.entries(addColumnsData)) {
    const newColumns = columns.filter((column) => {
      const alreadyExists = hasColumnInCurrentSchema(
        schemaContent,
        table,
        column.name
      );

      if (alreadyExists && column.isIfNotExists) {
        skipped.push(`${table}.${column.name}`);
        return false;
      }

      return true;
    });

    if (newColumns.length > 0) {
      filteredAddColumns[table] = newColumns;
    }
  }

  for (const [table, columns] of Object.entries(createTablesData)) {
    const isIfNotExists = columns.some((column) => column.isIfNotExists);

    if (isIfNotExists && hasTableInCurrentSchema(schemaContent, table)) {
      skipped.push(table);
      continue;
    }

    filteredCreateTables[table] = columns;
  }

  return {
    addColumns: filteredAddColumns,
    createTables: filteredCreateTables,
    skipped,
  };
}

function isAlreadyMigrated(content, addColumnsData, createTablesData) {
  // Check addColumns — every table+column pair must exist in the SAME block
  for (const [table, columns] of Object.entries(addColumnsData)) {
    for (const col of columns) {
      if (!hasAddColumnInTable(content, table, col.name)) return false;
    }
  }

  // Check createTables — table name must exist in a createTable block
  for (const table of Object.keys(createTablesData)) {
    if (!hasCreateTable(content, table)) return false;
  }

  return true;
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  // Resolve input file
  const args = process.argv.slice(2);
  let sqlFilePath;

  if (args.length === 0 || args[0] === "--latest") {
    sqlFilePath = findLatestMigration();
    console.log(`📂 Using latest migration: ${path.basename(sqlFilePath)}`);
  } else {
    sqlFilePath = path.resolve(args[0]);
  }

  if (!fs.existsSync(sqlFilePath)) {
    console.error(`❌ File not found: ${sqlFilePath}`);
    process.exit(1);
  }

  // Read and parse SQL
  console.log(`\n🔄 Reading SQL migration: ${path.basename(sqlFilePath)}`);
  const sql = fs.readFileSync(sqlFilePath, "utf-8");
  const {
    addColumns,
    createTables: parsedCreateTables,
    warnings,
  } = parseSql(sql);

  let addColumnsData = addColumns;
  let createTables = parsedCreateTables;

  if (fs.existsSync(SCHEMA_TS_PATH)) {
    const schemaContent = fs.readFileSync(SCHEMA_TS_PATH, "utf-8");
    const filtered = filterSchemaChangesAlreadyInWatermelon(
      schemaContent,
      addColumnsData,
      createTables
    );
    addColumnsData = filtered.addColumns;
    createTables = filtered.createTables;

    if (filtered.skipped.length > 0) {
      console.log(
        `\n✅ Skipped ${filtered.skipped.length} schema item(s) already present in schema.ts: ${filtered.skipped.join(", ")}`
      );
    }
  }

  // Print warnings
  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} statement(s) skipped:`);
    warnings.forEach((w) => console.log(`   ${w}`));
  }

  // Check if there's anything to migrate
  const hasNewAddColumns = Object.keys(addColumnsData).length > 0;
  const hasNewCreateTables = Object.keys(createTables).length > 0;

  if (!hasNewAddColumns && !hasNewCreateTables) {
    console.log(
      "\n✅ No schema changes detected (no ADD COLUMN or CREATE TABLE found)."
    );
    console.log(
      "   This is normal for migrations that only update data or create functions."
    );
    return;
  }

  // ── Idempotency: skip if these changes are already in migrations.ts ──
  if (fs.existsSync(MIGRATIONS_TS_PATH)) {
    const existingContent = fs.readFileSync(MIGRATIONS_TS_PATH, "utf-8");
    const alreadyApplied = isAlreadyMigrated(
      existingContent,
      addColumnsData,
      createTables
    );
    if (alreadyApplied) {
      console.log(
        "\n✅ Migration already present in migrations.ts — skipping."
      );
      return;
    }
  }

  // Summary
  console.log("\n📊 Schema changes detected:");
  for (const [table, cols] of Object.entries(addColumnsData)) {
    console.log(
      `   ADD COLUMN on "${table}": ${cols.map((c) => c.name).join(", ")}`
    );
  }
  for (const [table, cols] of Object.entries(createTables)) {
    console.log(
      `   CREATE TABLE "${table}": ${cols.map((c) => c.name).join(", ")}`
    );
  }

  // Read existing migrations and determine new version
  const currentVersion = getCurrentVersion();
  const newVersion = currentVersion === 0 ? 2 : currentVersion + 1;
  console.log(
    `\n📦 Current version: ${currentVersion || "none"} → New version: ${newVersion}`
  );

  // Parse existing migration steps
  const existing = parseExistingMigrations();

  // Generate new migration step
  const newStep = generateMigrationStep(
    newVersion,
    addColumnsData,
    createTables
  );

  // Combine existing + new steps
  const allSteps = [...existing.steps, newStep];

  // Determine all imports needed
  const needsAddColumns = hasNewAddColumns || existing.hasAddColumns;
  const needsCreateTable = hasNewCreateTables || existing.hasCreateTables;
  const needsUnsafeExecuteSql = existing.hasUnsafeExecuteSql;

  // Generate the full file
  const output = generateMigrationsFile(
    allSteps,
    needsAddColumns,
    needsCreateTable,
    needsUnsafeExecuteSql
  );

  // Write migrations.ts
  fs.writeFileSync(MIGRATIONS_TS_PATH, output);
  console.log(`\n✅ Updated migrations.ts (toVersion: ${newVersion})`);

  // Format with Prettier
  try {
    const { execSync } = require("child_process");
    execSync(`npx prettier --write "${MIGRATIONS_TS_PATH}"`, {
      stdio: "pipe",
    });
    console.log("🎨 Formatted with Prettier");
  } catch {
    console.warn("⚠️  Prettier formatting skipped");
  }

  console.log("\n✨ WatermelonDB migration generated successfully!");
  console.log(
    `   Next: run 'npm run db:sync' to regenerate schema.ts with version ${newVersion}`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  filterSchemaChangesAlreadyInWatermelon,
  parseSql,
};
