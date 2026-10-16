"use strict";

const nodeFs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ts = require("typescript");

/**
 * Extracts a numeric prefix from a migration filename: /^([0-9]+)_.+\.sql$/
 *
 * @param {string} filename
 * @returns {string | null}
 */
function extractNumericPrefix(filename) {
  const match = filename.match(/^([0-9]+)_.+\.sql$/);
  return match ? match[1] : null;
}

/**
 * Validates that a CLI migration cell value consists of exact digits.
 *
 * @param {string} val
 * @returns {string}
 */
function validateCliCellVersion(val) {
  if (!/^\d+$/.test(val)) {
    throw new Error(
      `CLI migration version '${val}' must be exact digits (/^\\d+$/).`
    );
  }
  return val;
}

/**
 * Scans a directory for SQL migration files and returns their numeric prefixes.
 *
 * @param {string} migrationsDir
 * @param {typeof nodeFs} [fsModule]
 * @returns {Set<string>}
 */
function getDiskMigrationVersions(migrationsDir, fsModule = nodeFs) {
  if (!fsModule.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const files = fsModule
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"));

  const versions = new Set();
  for (const file of files) {
    const prefix = extractNumericPrefix(file);
    if (!prefix) {
      throw new Error(
        `Migration file '${file}' does not match numeric prefix convention (e.g. 001_name.sql).`
      );
    }
    if (versions.has(prefix)) {
      throw new Error(
        `Duplicate migration prefix '${prefix}' on disk: ${file}`
      );
    }
    versions.add(prefix);
  }

  return versions;
}

/**
 * Validates the basic shape and version alignment of a migration row.
 *
 * @param {string[]} parts
 */
function validateMigrationRowShape(parts) {
  if (parts.length !== 3) {
    throw new Error(
      `Row must have exactly 3 columns (Local | Remote | Time): ${parts.join(" | ")}`
    );
  }
  const diskCol = parts[0];
  const remoteCol = parts[1];
  if (!diskCol && !remoteCol) {
    throw new Error(
      "Both Local and Remote cells cannot be blank in a migration row."
    );
  }
  if (diskCol && remoteCol && diskCol !== remoteCol) {
    throw new Error(
      `Local version '${diskCol}' and Remote version '${remoteCol}' must match when both are present.`
    );
  }
}

/**
 * Validates and records the disk version cell of a migration row.
 *
 * @param {string} diskCol
 * @param {Set<string>} diskVersions
 * @param {Set<string>} seenLocalDiskEntries
 */
function recordDiskMigrationCell(diskCol, diskVersions, seenLocalDiskEntries) {
  if (!diskCol) return;
  const diskVer = validateCliCellVersion(diskCol);
  if (!diskVersions.has(diskVer)) {
    throw new Error(
      `Local disk version '${diskVer}' does not exist in disk migrations.`
    );
  }
  if (seenLocalDiskEntries.has(diskVer)) {
    throw new Error(
      `Duplicate migration version '${diskVer}' in Local column.`
    );
  }
  seenLocalDiskEntries.add(diskVer);
}

/**
 * Validates and records the remote (applied) version cell of a migration row.
 *
 * @param {string} remoteCol
 * @param {Set<string>} appliedVersions
 */
function recordRemoteMigrationCell(remoteCol, appliedVersions) {
  if (!remoteCol) return;
  const remoteVer = validateCliCellVersion(remoteCol);
  if (appliedVersions.has(remoteVer)) {
    throw new Error(
      `Duplicate migration version '${remoteVer}' in Remote column.`
    );
  }
  appliedVersions.add(remoteVer);
}

/**
 * Validates and processes a single parsed row from the migration list output.
 *
 * @param {string[]} parts
 * @param {Set<string>} diskVersions
 * @param {Set<string>} appliedVersions
 * @param {Set<string>} seenLocalDiskEntries
 */
function processMigrationRow(
  parts,
  diskVersions,
  appliedVersions,
  seenLocalDiskEntries
) {
  validateMigrationRowShape(parts);
  recordDiskMigrationCell(parts[0], diskVersions, seenLocalDiskEntries);
  recordRemoteMigrationCell(parts[1], appliedVersions);
}

/**
 * Parses the table output of `supabase migration list --local`.
 * In Supabase CLI local listing, the columns are: Local | Remote | Time (UTC)
 * where 'Local' represents the migration on disk and 'Remote' represents applied history in local DB.
 *
 * @param {string} output
 * @param {Set<string>} diskVersions
 * @returns {Set<string>} Set of versions applied to the local database
 */
function parseLocalMigrationVersions(output, diskVersions) {
  const lines = output.split(/\r?\n/);
  const headerIndex = lines.findIndex(
    (line) => line.includes("Local") && line.includes("Remote")
  );

  if (headerIndex === -1) {
    throw new Error(
      `Unparseable local migration history table. Header 'Local | Remote' not found.\nCLI Output:\n${output}`
    );
  }

  const appliedVersions = new Set();
  const seenLocalDiskEntries = new Set();

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (
      !line ||
      line.startsWith("Connecting") ||
      line.startsWith("A new version")
    ) {
      continue;
    }
    if (line.includes("---|---") || line.includes("-------|--------")) {
      continue;
    }

    const parts = line.split("|").map((p) => p.trim());
    processMigrationRow(
      parts,
      diskVersions,
      appliedVersions,
      seenLocalDiskEntries
    );
  }

  return appliedVersions;
}

/**
 * Validates that local applied migration history matches disk migrations exactly.
 *
 * @param {Set<string>} diskVersions
 * @param {Set<string>} appliedVersions
 */
function validateMigrationHistoryMatch(diskVersions, appliedVersions) {
  const pending = [];
  for (const v of diskVersions) {
    if (!appliedVersions.has(v)) {
      pending.push(v);
    }
  }

  const extra = [];
  for (const v of appliedVersions) {
    if (!diskVersions.has(v)) {
      extra.push(v);
    }
  }

  if (pending.length > 0 || extra.length > 0) {
    const errors = [];
    if (pending.length > 0) {
      errors.push(
        `Local database is missing pending migrations: ${pending.sort().join(", ")}. Run 'npx --no-install supabase migration up --local' to apply pending local migrations.`
      );
    }
    if (extra.length > 0) {
      errors.push(
        `Local database has applied migrations not present on disk: ${extra.sort().join(", ")}.`
      );
    }
    throw new Error(errors.join("\n"));
  }
}

/**
 * Inspects a TypeScript AST node for the public schema of Database.
 *
 * @param {ts.TypeLiteralNode} typeLiteral
 * @returns {{ hasTables: boolean, hasFunctions: boolean, hasEnums: boolean }}
 */
function inspectPublicSchema(typeLiteral) {
  let hasTables = false;
  let hasFunctions = false;
  let hasEnums = false;

  for (const member of typeLiteral.members) {
    if (
      ts.isPropertySignature(member) &&
      member.name &&
      ts.isIdentifier(member.name)
    ) {
      const memberName = member.name.text;
      const isLiteral = member.type && ts.isTypeLiteralNode(member.type);

      if (memberName === "Tables") {
        if (!isLiteral) {
          throw new Error(
            "'Tables' in public schema must be a type literal object."
          );
        }
        hasTables = true;
      } else if (memberName === "Functions") {
        if (!isLiteral) {
          throw new Error(
            "'Functions' in public schema must be a type literal object."
          );
        }
        hasFunctions = true;
      } else if (memberName === "Enums") {
        if (!isLiteral) {
          throw new Error(
            "'Enums' in public schema must be a type literal object."
          );
        }
        hasEnums = true;
      }
    }
  }

  return { hasTables, hasFunctions, hasEnums };
}

/**
 * Finds and inspects the public schema inside a Database type alias statement.
 *
 * @param {ts.TypeAliasDeclaration} statement
 * @returns {{ hasExportedDatabase: boolean, publicStatus: { hasTables: boolean, hasFunctions: boolean, hasEnums: boolean } }}
 */
function extractDatabasePublicStatus(statement) {
  const isExported =
    statement.modifiers &&
    statement.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  if (!isExported || statement.name.text !== "Database") {
    return {
      hasExportedDatabase: false,
      publicStatus: { hasTables: false, hasFunctions: false, hasEnums: false },
    };
  }

  let publicStatus = { hasTables: false, hasFunctions: false, hasEnums: false };
  if (ts.isTypeLiteralNode(statement.type)) {
    for (const member of statement.type.members) {
      if (
        ts.isPropertySignature(member) &&
        member.name &&
        ts.isIdentifier(member.name) &&
        member.name.text === "public" &&
        member.type &&
        ts.isTypeLiteralNode(member.type)
      ) {
        publicStatus = inspectPublicSchema(member.type);
      }
    }
  }

  return { hasExportedDatabase: true, publicStatus };
}

/**
 * Parses and verifies syntax diagnostics for TypeScript code.
 *
 * @param {string} code
 * @returns {ts.SourceFile}
 */
function parseTypeScriptSource(code) {
  if (!code || typeof code !== "string" || code.trim().length === 0) {
    throw new Error("Generated type output is empty.");
  }

  const sourceFile = ts.createSourceFile(
    "supabase-types.ts",
    code,
    ts.ScriptTarget.Latest,
    true
  );

  const parseDiagnostics = sourceFile.parseDiagnostics || [];
  if (parseDiagnostics.length > 0) {
    const errorMsg = parseDiagnostics.map((d) => d.messageText).join("; ");
    throw new Error(`Syntactically invalid TypeScript: ${errorMsg}`);
  }

  return sourceFile;
}

/**
 * Validates that the generated TypeScript code contains an exported `Database`
 * type with public `Tables`, `Functions`, and `Enums` type-literal objects.
 *
 * @param {string} code
 */
function validateGeneratedDatabaseTypes(code) {
  const sourceFile = parseTypeScriptSource(code);
  let hasExportedDatabase = false;
  let publicStatus = { hasTables: false, hasFunctions: false, hasEnums: false };

  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement)) {
      const result = extractDatabasePublicStatus(statement);
      if (result.hasExportedDatabase) {
        hasExportedDatabase = true;
        publicStatus = result.publicStatus;
      }
    }
  }

  if (!hasExportedDatabase) {
    throw new Error("Missing exported type 'Database' in generated types.");
  }
  if (!publicStatus.hasTables) {
    throw new Error("Missing 'Tables' in public schema of Database type.");
  }
  if (!publicStatus.hasFunctions) {
    throw new Error("Missing 'Functions' in public schema of Database type.");
  }
  if (!publicStatus.hasEnums) {
    throw new Error("Missing 'Enums' in public schema of Database type.");
  }
}

/**
 * Resolves the installed supabase CLI executable path.
 *
 * @returns {string}
 */
function resolveSupabaseCliEntry() {
  const pkgJsonPath = require.resolve("supabase/package.json");
  const pkgDir = path.dirname(pkgJsonPath);
  const cliEntry = path.join(pkgDir, "dist", "supabase.js");
  if (!nodeFs.existsSync(cliEntry)) {
    throw new Error(
      `Could not locate installed Supabase CLI binary entry at: ${cliEntry}`
    );
  }
  return cliEntry;
}

/**
 * Default command runner executing installed Supabase CLI via node without network or npx.
 *
 * @param {string} cliPath
 * @param {string[]} args
 * @param {string} cwd
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function defaultCliRunner(cliPath, args, cwd) {
  const res = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  return {
    status: res.status ?? 1,
    stdout: res.stdout || "",
    stderr: res.stderr || (res.error ? res.error.message : ""),
  };
}

/**
 * Safely removes a file, returning null on success or an Error on failure.
 *
 * @param {string} filePath
 * @param {typeof nodeFs} fsModule
 * @returns {Error | null}
 */
function safeUnlink(filePath, fsModule) {
  if (fsModule.existsSync(filePath)) {
    try {
      fsModule.unlinkSync(filePath);
    } catch (err) {
      return err instanceof Error ? err : new Error(String(err));
    }
  }
  return null;
}

/**
 * Safely writes generated types to temp file and renames to target with combined error reporting.
 *
 * @param {string} tempPath
 * @param {string} targetPath
 * @param {string} content
 * @param {typeof nodeFs} fsModule
 */
function atomicReplaceFile(tempPath, targetPath, content, fsModule) {
  try {
    fsModule.writeFileSync(tempPath, content, "utf8");
  } catch (writeErr) {
    const cleanupErr = safeUnlink(tempPath, fsModule);
    const writeMsg =
      writeErr instanceof Error ? writeErr.message : String(writeErr);
    if (cleanupErr) {
      throw new Error(
        `Failed to write temporary file: ${writeMsg}. Additionally, failed to clean up temporary file '${tempPath}': ${cleanupErr.message}`
      );
    }
    throw new Error(`Failed to write temporary file: ${writeMsg}`);
  }

  try {
    fsModule.renameSync(tempPath, targetPath);
  } catch (renameErr) {
    const cleanupErr = safeUnlink(tempPath, fsModule);
    const renameMsg =
      renameErr instanceof Error ? renameErr.message : String(renameErr);
    if (cleanupErr) {
      throw new Error(
        `Failed to rename temporary file: ${renameMsg}. Additionally, failed to clean up temporary file '${tempPath}': ${cleanupErr.message}`
      );
    }
    throw new Error(`Failed to rename temporary file: ${renameMsg}`);
  }
}

/**
 * Queries and verifies local database migration history against disk files.
 *
 * @param {string} migrationsDir
 * @param {typeof nodeFs} fsModule
 * @param {Function} runner
 * @param {string} cliPath
 * @param {string} cwd
 */
function verifyLocalMigrations(migrationsDir, fsModule, runner, cliPath, cwd) {
  const diskVersions = getDiskMigrationVersions(migrationsDir, fsModule);
  const listResult = runner(cliPath, ["migration", "list", "--local"], cwd);
  if (listResult.status !== 0) {
    throw new Error(
      `Failed to query local migration list via Supabase CLI (exit ${listResult.status}):\n${listResult.stderr || listResult.stdout}`
    );
  }
  const appliedVersions = parseLocalMigrationVersions(
    listResult.stdout,
    diskVersions
  );
  validateMigrationHistoryMatch(diskVersions, appliedVersions);
}

/**
 * Generates and validates TypeScript types via Supabase CLI.
 *
 * @param {Function} runner
 * @param {string} cliPath
 * @param {string} cwd
 * @returns {string}
 */
function executeAndValidateTypeGeneration(runner, cliPath, cwd) {
  const genResult = runner(
    cliPath,
    ["gen", "types", "typescript", "--local", "--schema", "public"],
    cwd
  );
  if (genResult.status !== 0) {
    throw new Error(
      `Failed to generate local Supabase types via CLI (exit ${genResult.status}):\n${genResult.stderr || genResult.stdout}`
    );
  }
  const generatedTypes = genResult.stdout;
  validateGeneratedDatabaseTypes(generatedTypes);
  return generatedTypes;
}

/**
 * Coordinates safe local type generation.
 *
 * @param {{
 *   migrationsDir?: string,
 *   targetPath?: string,
 *   runner?: (cliPath: string, args: string[], cwd: string) => { status: number, stdout: string, stderr: string },
 *   cliPath?: string,
 *   cwd?: string,
 *   fsModule?: typeof nodeFs
 * }} options
 */
function generateLocalSupabaseTypes(options = {}) {
  const fsModule = options.fsModule || nodeFs;
  const cwd = options.cwd || path.resolve(__dirname, "..");
  const migrationsDir =
    options.migrationsDir || path.resolve(cwd, "supabase/migrations");
  const targetPath =
    options.targetPath ||
    path.resolve(cwd, "packages/db/src/supabase-types.ts");
  const runner = options.runner || defaultCliRunner;
  const cliPath = options.cliPath || resolveSupabaseCliEntry();

  verifyLocalMigrations(migrationsDir, fsModule, runner, cliPath, cwd);
  const generatedTypes = executeAndValidateTypeGeneration(runner, cliPath, cwd);

  const targetDir = path.dirname(targetPath);
  const tempPath = path.join(
    targetDir,
    `.supabase-types.${Date.now()}.${process.pid}.tmp`
  );
  atomicReplaceFile(tempPath, targetPath, generatedTypes, fsModule);
}

if (require.main === module) {
  try {
    generateLocalSupabaseTypes();
    console.log("Successfully generated local Supabase types.");
  } catch (error) {
    console.error(
      `\n❌ Local Supabase type generation aborted:\n${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  }
}

module.exports = {
  extractNumericPrefix,
  validateCliCellVersion,
  getDiskMigrationVersions,
  validateMigrationRowShape,
  recordDiskMigrationCell,
  recordRemoteMigrationCell,
  processMigrationRow,
  parseLocalMigrationVersions,
  validateMigrationHistoryMatch,
  inspectPublicSchema,
  extractDatabasePublicStatus,
  parseTypeScriptSource,
  validateGeneratedDatabaseTypes,
  resolveSupabaseCliEntry,
  defaultCliRunner,
  safeUnlink,
  atomicReplaceFile,
  verifyLocalMigrations,
  executeAndValidateTypeGeneration,
  generateLocalSupabaseTypes,
};
