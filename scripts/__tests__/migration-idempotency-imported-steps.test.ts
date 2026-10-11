import fs from "node:fs";
import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  isAlreadyMigrated,
  parseSql,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require("../sql-to-watermelon-migration");

const ROOT = path.resolve(__dirname, "../..");

function readWorkspaceFile(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("WatermelonDB migration generator idempotency for imported steps", () => {
  it("detects createTable defined in local-schema modules imported by migrations.ts", () => {
    const migrationsTs = readWorkspaceFile("packages/db/src/migrations.ts");
    const migration087Sql = readWorkspaceFile(
      "supabase/migrations/087_metals_metadata_applied_history.sql"
    );

    const { addColumns, createTables } = parseSql(migration087Sql);

    expect(Object.keys(createTables)).toContain("metal_metadata_edit_outcomes");

    // Must return true because migrations.ts imports ./local-schema/metal-metadata-edit-migration
    // where createTable for metal_metadata_edit_outcomes is defined.
    const alreadyMigrated = isAlreadyMigrated(
      migrationsTs,
      addColumns,
      createTables
    );

    expect(alreadyMigrated).toBe(true);
  });

  it("does not report unimported tables as migrated", () => {
    const migrationsTs = readWorkspaceFile("packages/db/src/migrations.ts");

    const unimportedCreateTable = {
      unimported_test_table: [
        {
          name: "test_col",
          type: "string",
          isOptional: false,
          isIndexed: false,
        },
      ],
    };

    const alreadyMigrated = isAlreadyMigrated(
      migrationsTs,
      {},
      unimportedCreateTable
    );

    expect(alreadyMigrated).toBe(false);
  });

  it("preserves addColumns binding without weakening column checks", () => {
    const migrationsTs = readWorkspaceFile("packages/db/src/migrations.ts");

    // An addColumn on a table where the table exists but the column does not
    const missingColumn = {
      metal_metadata_edit_outcomes: [
        {
          name: "non_existent_column_for_test",
          type: "string",
          isOptional: true,
          isIndexed: false,
        },
      ],
    };

    const alreadyMigrated = isAlreadyMigrated(migrationsTs, missingColumn, {});

    expect(alreadyMigrated).toBe(false);
  });

  it("isolated temp fixture: --latest 087 represented by imported v31 does not mutate files or bump version", () => {
    // Construct isolated fixture to verify end-to-end idempotency detection without touching repo
    const tempDir = path.join(
      ROOT,
      "scripts/__tests__/.tmp-fixture-" + Date.now()
    );
    const tempLocalSchemaDir = path.join(tempDir, "local-schema");
    fs.mkdirSync(tempLocalSchemaDir, { recursive: true });

    try {
      const originalMigrations = readWorkspaceFile(
        "packages/db/src/migrations.ts"
      );
      const originalLocalSchema = readWorkspaceFile(
        "packages/db/src/local-schema/metal-metadata-edit-migration.ts"
      );

      const tempMigrationsPath = path.join(tempDir, "migrations.ts");
      const tempLocalSchemaPath = path.join(
        tempLocalSchemaDir,
        "metal-metadata-edit-migration.ts"
      );

      fs.writeFileSync(tempMigrationsPath, originalMigrations, "utf8");
      fs.writeFileSync(tempLocalSchemaPath, originalLocalSchema, "utf8");

      const migration087Sql = readWorkspaceFile(
        "supabase/migrations/087_metals_metadata_applied_history.sql"
      );
      const { addColumns, createTables } = parseSql(migration087Sql);

      const fixtureMigrationsContent = fs.readFileSync(
        tempMigrationsPath,
        "utf8"
      );
      const isMigrated = isAlreadyMigrated(
        fixtureMigrationsContent,
        addColumns,
        createTables,
        tempDir
      );

      expect(isMigrated).toBe(true);

      // Verify file content on disk remains completely identical (zero mutation)
      const afterCheckContent = fs.readFileSync(tempMigrationsPath, "utf8");
      expect(afterCheckContent).toBe(fixtureMigrationsContent);

      const versionMatches = [
        ...afterCheckContent.matchAll(/toVersion:\s*(\d+)/g),
      ].map((m) => parseInt(m[1], 10));
      const maxVersion = Math.max(...versionMatches);
      expect(maxVersion).toBe(31);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
