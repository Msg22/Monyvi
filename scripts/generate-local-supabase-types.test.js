"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const {
  extractNumericPrefix,
  validateCliCellVersion,
  parseLocalMigrationVersions,
  getDiskMigrationVersions,
  validateMigrationHistoryMatch,
  validateGeneratedDatabaseTypes,
  generateLocalSupabaseTypes,
} = require("./generate-local-supabase-types.cjs");

const VALID_DB_TS = `
export type Database = {
  public: {
    Tables: { accounts: { Row: { id: string } } };
    Functions: { get_rate: { Args: {}; Returns: number } };
    Enums: { account_type: "CASH" | "BANK" };
  };
};
`;

function createTmpWorkspace(prefix) {
  const dir = path.join(__dirname, "../.tmp/" + prefix + "-" + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  const migrationsDir = path.join(dir, "migrations");
  fs.mkdirSync(migrationsDir, { recursive: true });
  const targetPath = path.join(dir, "supabase-types.ts");
  return {
    dir,
    migrationsDir,
    targetPath,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

function createMockRunner(opts = {}) {
  const {
    listStatus = 0,
    listStdout = "",
    listStderr = "",
    genStatus = 0,
    genStdout = VALID_DB_TS,
    genStderr = "",
    onGenCalled = () => {},
  } = opts;

  return (cliPath, args) => {
    if (args.includes("migration") && args.includes("list")) {
      return { status: listStatus, stdout: listStdout, stderr: listStderr };
    }
    if (args.includes("gen") && args.includes("types")) {
      onGenCalled(args);
      return { status: genStatus, stdout: genStdout, stderr: genStderr };
    }
    return { status: 1, stdout: "", stderr: "Unknown command" };
  };
}

test("extractNumericPrefix parses numeric prefix with any number of digits before underscore", () => {
  assert.equal(extractNumericPrefix("001_initial.sql"), "001");
  assert.equal(extractNumericPrefix("087_voice_ai.sql"), "087");
  assert.equal(extractNumericPrefix("1_small.sql"), "1");
  assert.equal(extractNumericPrefix("12345_big.sql"), "12345");
  assert.equal(extractNumericPrefix("initial.sql"), null);
  assert.equal(extractNumericPrefix("001.sql"), null);
});

test("validateCliCellVersion accepts exact digits and rejects non-digit strings", () => {
  assert.equal(validateCliCellVersion("001"), "001");
  assert.equal(validateCliCellVersion("087"), "087");
  assert.throws(
    () => validateCliCellVersion("001_suffix"),
    /must be exact digits/
  );
  assert.throws(() => validateCliCellVersion("001abc"), /must be exact digits/);
  assert.throws(() => validateCliCellVersion("abc"), /must be exact digits/);
});

test("getDiskMigrationVersions collects versions and rejects files without proper prefix", () => {
  const ws = createTmpWorkspace("test-disk-migrations");
  try {
    fs.writeFileSync(path.join(ws.migrationsDir, "001_init.sql"), "-- 1");
    fs.writeFileSync(path.join(ws.migrationsDir, "002_core.sql"), "-- 2");
    assert.deepEqual(
      Array.from(getDiskMigrationVersions(ws.migrationsDir)).sort(),
      ["001", "002"]
    );

    fs.writeFileSync(path.join(ws.migrationsDir, "invalid.sql"), "-- bad");
    assert.throws(
      () => getDiskMigrationVersions(ws.migrationsDir),
      /does not match numeric prefix convention/
    );
  } finally {
    ws.cleanup();
  }
});

test("parseLocalMigrationVersions extracts applied migrations from Remote column", () => {
  const sample = `
 Local | Remote | Time (UTC) 
-------|--------|------------
 001   | 001    | 001        
 002   | 002    | 002        
 087   | 087    | 087        
`;
  const disk = new Set(["001", "002", "087"]);
  assert.deepEqual(
    Array.from(parseLocalMigrationVersions(sample, disk)).sort(),
    ["001", "002", "087"]
  );
});

test("parseLocalMigrationVersions parses real pending row and extra applied row", () => {
  const pendingSample = `
 Local | Remote | Time (UTC) 
-------|--------|------------
 001   | 001    | 001        
 087   |        | 087        
`;
  assert.deepEqual(
    Array.from(
      parseLocalMigrationVersions(pendingSample, new Set(["001", "087"]))
    ),
    ["001"]
  );

  const extraSample = `
 Local | Remote | Time (UTC) 
-------|--------|------------
 001   | 001    | 001        
       | 088    | 088        
`;
  assert.deepEqual(
    Array.from(
      parseLocalMigrationVersions(extraSample, new Set(["001"]))
    ).sort(),
    ["001", "088"]
  );
});

test("parseLocalMigrationVersions row validations", () => {
  assert.throws(
    () =>
      parseLocalMigrationVersions(
        " Local | Remote | Time\n---|---|---\n | | ",
        new Set()
      ),
    /Both Local and Remote cells cannot be blank/
  );
  assert.throws(
    () =>
      parseLocalMigrationVersions(
        " Local | Remote | Time\n---|---|---\n 001 | 002 | 001",
        new Set(["001", "002"])
      ),
    /Local version '001' and Remote version '002' must match/
  );
  assert.throws(
    () =>
      parseLocalMigrationVersions(
        " Local | Remote | Time\n---|---|---\n 001 | 001",
        new Set(["001"])
      ),
    /Row must have exactly 3 columns/
  );
  assert.throws(
    () =>
      parseLocalMigrationVersions(
        " Local | Remote | Time\n---|---|---\n 001_a | 001_a | 001",
        new Set(["001"])
      ),
    /must be exact digits/
  );
  assert.throws(
    () =>
      parseLocalMigrationVersions(
        " Local | Remote | Time\n---|---|---\n 999 | 999 | 001",
        new Set(["001"])
      ),
    /Local disk version '999' does not exist in disk migrations/
  );
  assert.throws(
    () =>
      parseLocalMigrationVersions(
        " Local | Remote | Time\n---|---|---\n 001 | 001 | 1\n 001 | 001 | 2",
        new Set(["001"])
      ),
    /Duplicate migration version '001'/
  );
  assert.throws(
    () => parseLocalMigrationVersions("unparseable header", new Set()),
    /Unparseable local migration history table/
  );
});

test("validateMigrationHistoryMatch validations", () => {
  assert.doesNotThrow(() =>
    validateMigrationHistoryMatch(new Set(["001"]), new Set(["001"]))
  );
  assert.throws(
    () =>
      validateMigrationHistoryMatch(new Set(["001", "087"]), new Set(["001"])),
    /missing pending migrations: 087/
  );
  assert.throws(
    () =>
      validateMigrationHistoryMatch(new Set(["001"]), new Set(["001", "088"])),
    /applied migrations not present on disk: 088/
  );
});

test("validateGeneratedDatabaseTypes validations", () => {
  assert.doesNotThrow(() => validateGeneratedDatabaseTypes(VALID_DB_TS));
  assert.throws(
    () => validateGeneratedDatabaseTypes(""),
    /Generated type output is empty/
  );
  assert.throws(
    () => validateGeneratedDatabaseTypes("export type J = 1;"),
    /Missing exported type 'Database'/
  );
  assert.throws(
    () =>
      validateGeneratedDatabaseTypes(
        "export type Database = { public: { Tables: string; Functions: {}; Enums: {} } };"
      ),
    /'Tables' in public schema must be a type literal object/
  );
  assert.throws(
    () =>
      validateGeneratedDatabaseTypes(
        "export type Database = { public: { Tables: {}; Functions: string; Enums: {} } };"
      ),
    /'Functions' in public schema must be a type literal object/
  );
  assert.throws(
    () =>
      validateGeneratedDatabaseTypes(
        "export type Database = { public: { Tables: {}; Functions: {}; Enums: string } };"
      ),
    /'Enums' in public schema must be a type literal object/
  );
  assert.throws(
    () =>
      validateGeneratedDatabaseTypes(
        "export type Database = { public: { Tables: {"
      ),
    /Syntactically invalid TypeScript/
  );
});

test("orchestration: success pins --schema public and replaces target atomically", () => {
  const ws = createTmpWorkspace("test-gen-success");
  try {
    fs.writeFileSync(path.join(ws.migrationsDir, "001_init.sql"), "-- 1");
    fs.writeFileSync(ws.targetPath, "// original\n");

    let capturedArgs = null;
    const runner = createMockRunner({
      listStdout: " Local | Remote | Time\n---|---|---\n 001 | 001 | 001\n",
      onGenCalled: (args) => {
        capturedArgs = args;
      },
    });

    generateLocalSupabaseTypes({
      migrationsDir: ws.migrationsDir,
      targetPath: ws.targetPath,
      runner,
    });

    assert.deepEqual(capturedArgs, [
      "gen",
      "types",
      "typescript",
      "--local",
      "--schema",
      "public",
    ]);
    assert.match(
      fs.readFileSync(ws.targetPath, "utf8"),
      /export type Database/
    );
    assert.deepEqual(fs.readdirSync(ws.dir).sort(), [
      "migrations",
      "supabase-types.ts",
    ]);
  } finally {
    ws.cleanup();
  }
});

test("orchestration: pending and extra migrations abort without calling gen", () => {
  const ws = createTmpWorkspace("test-gen-mismatch");
  try {
    fs.writeFileSync(path.join(ws.migrationsDir, "001_init.sql"), "-- 1");
    fs.writeFileSync(path.join(ws.migrationsDir, "087_voice.sql"), "-- 87");
    const originalBytes = Buffer.from("// untouched\n");
    fs.writeFileSync(ws.targetPath, originalBytes);

    let genCalled = false;
    const pendingRunner = createMockRunner({
      listStdout:
        " Local | Remote | Time\n---|---|---\n 001 | 001 | 1\n 087 | | 2\n",
      onGenCalled: () => {
        genCalled = true;
      },
    });

    assert.throws(
      () =>
        generateLocalSupabaseTypes({
          migrationsDir: ws.migrationsDir,
          targetPath: ws.targetPath,
          runner: pendingRunner,
        }),
      /missing pending migrations: 087/
    );
    assert.equal(genCalled, false);
    assert.deepEqual(fs.readFileSync(ws.targetPath), originalBytes);

    // Extra applied
    fs.unlinkSync(path.join(ws.migrationsDir, "087_voice.sql"));
    const extraRunner = createMockRunner({
      listStdout:
        " Local | Remote | Time\n---|---|---\n 001 | 001 | 1\n | 088 | 2\n",
      onGenCalled: () => {
        genCalled = true;
      },
    });
    assert.throws(
      () =>
        generateLocalSupabaseTypes({
          migrationsDir: ws.migrationsDir,
          targetPath: ws.targetPath,
          runner: extraRunner,
        }),
      /applied migrations not present on disk: 088/
    );
    assert.equal(genCalled, false);
    assert.deepEqual(fs.readFileSync(ws.targetPath), originalBytes);
  } finally {
    ws.cleanup();
  }
});

test("orchestration: CLI list and gen failures preserve target and clean temp", () => {
  const ws = createTmpWorkspace("test-gen-cli-failures");
  try {
    fs.writeFileSync(path.join(ws.migrationsDir, "001_init.sql"), "-- 1");
    const originalBytes = Buffer.from("// untouched cli fail\n");
    fs.writeFileSync(ws.targetPath, originalBytes);

    // 1. List failure
    let genCalled = false;
    const listFailRunner = createMockRunner({
      listStatus: 1,
      listStderr: "conn error",
      onGenCalled: () => {
        genCalled = true;
      },
    });
    assert.throws(
      () =>
        generateLocalSupabaseTypes({
          migrationsDir: ws.migrationsDir,
          targetPath: ws.targetPath,
          runner: listFailRunner,
        }),
      /Failed to query local migration list/
    );
    assert.equal(genCalled, false);
    assert.deepEqual(fs.readFileSync(ws.targetPath), originalBytes);

    // 2. Gen failure with partial output
    const genFailRunner = createMockRunner({
      listStdout: " Local | Remote | Time\n---|---|---\n 001 | 001 | 1\n",
      genStatus: 1,
      genStdout: "export type Json = string;\n// partial",
      genStderr: "crash",
    });
    assert.throws(
      () =>
        generateLocalSupabaseTypes({
          migrationsDir: ws.migrationsDir,
          targetPath: ws.targetPath,
          runner: genFailRunner,
        }),
      /Failed to generate local Supabase types via CLI/
    );
    assert.deepEqual(fs.readFileSync(ws.targetPath), originalBytes);
    assert.deepEqual(fs.readdirSync(ws.dir).sort(), [
      "migrations",
      "supabase-types.ts",
    ]);
  } finally {
    ws.cleanup();
  }
});

test("orchestration: empty or syntax-invalid CLI output preserves target", () => {
  const ws = createTmpWorkspace("test-gen-invalid-syntax");
  try {
    fs.writeFileSync(path.join(ws.migrationsDir, "001_init.sql"), "-- 1");
    const originalBytes = Buffer.from("// pristine untouched\n");
    fs.writeFileSync(ws.targetPath, originalBytes);

    const emptyRunner = createMockRunner({
      listStdout: " Local | Remote | Time\n---|---|---\n 001 | 001 | 1\n",
      genStdout: "",
    });
    assert.throws(
      () =>
        generateLocalSupabaseTypes({
          migrationsDir: ws.migrationsDir,
          targetPath: ws.targetPath,
          runner: emptyRunner,
        }),
      /Generated type output is empty/
    );
    assert.deepEqual(fs.readFileSync(ws.targetPath), originalBytes);

    const syntaxRunner = createMockRunner({
      listStdout: " Local | Remote | Time\n---|---|---\n 001 | 001 | 1\n",
      genStdout: "export type Database = { public: { Tables: {",
    });
    assert.throws(
      () =>
        generateLocalSupabaseTypes({
          migrationsDir: ws.migrationsDir,
          targetPath: ws.targetPath,
          runner: syntaxRunner,
        }),
      /Syntactically invalid TypeScript/
    );
    assert.deepEqual(fs.readFileSync(ws.targetPath), originalBytes);
    assert.deepEqual(fs.readdirSync(ws.dir).sort(), [
      "migrations",
      "supabase-types.ts",
    ]);
  } finally {
    ws.cleanup();
  }
});

test("orchestration: filesystem failures during write and rename", () => {
  const ws = createTmpWorkspace("test-gen-fs-failures");
  try {
    fs.writeFileSync(path.join(ws.migrationsDir, "001_init.sql"), "-- 1");
    const originalBytes = Buffer.from("// pristine fs\n");
    fs.writeFileSync(ws.targetPath, originalBytes);

    const runner = createMockRunner({
      listStdout: " Local | Remote | Time\n---|---|---\n 001 | 001 | 1\n",
    });

    // Write failure with cleanup
    const writeFailFs = {
      ...fs,
      writeFileSync: (f) => {
        fs.writeFileSync(f, "partial");
        throw new Error("ENOSPC: disk full");
      },
    };
    assert.throws(
      () =>
        generateLocalSupabaseTypes({
          migrationsDir: ws.migrationsDir,
          targetPath: ws.targetPath,
          runner,
          fsModule: writeFailFs,
        }),
      /ENOSPC: disk full/
    );
    assert.deepEqual(fs.readFileSync(ws.targetPath), originalBytes);
    assert.deepEqual(fs.readdirSync(ws.dir).sort(), [
      "migrations",
      "supabase-types.ts",
    ]);

    // Write failure with cleanup failure
    const writeCleanFailFs = {
      ...fs,
      writeFileSync: () => {
        throw new Error("ENOSPC: write failed");
      },
      existsSync: () => true,
      unlinkSync: () => {
        throw new Error("EACCES: unlink failed");
      },
    };
    assert.throws(
      () =>
        generateLocalSupabaseTypes({
          migrationsDir: ws.migrationsDir,
          targetPath: ws.targetPath,
          runner,
          fsModule: writeCleanFailFs,
        }),
      (err) =>
        err instanceof Error &&
        err.message.includes("ENOSPC: write failed") &&
        /failed to clean up temporary file/i.test(err.message)
    );

    // Rename failure with successful cleanup
    const renameCleanFs = {
      ...fs,
      renameSync: () => {
        throw new Error("EXDEV: cross-device");
      },
    };
    assert.throws(
      () =>
        generateLocalSupabaseTypes({
          migrationsDir: ws.migrationsDir,
          targetPath: ws.targetPath,
          runner,
          fsModule: renameCleanFs,
        }),
      /Failed to rename temporary file: EXDEV/
    );
    assert.deepEqual(fs.readdirSync(ws.dir).sort(), [
      "migrations",
      "supabase-types.ts",
    ]);

    // Rename failure with cleanup failure
    const renameCleanFailFs = {
      ...fs,
      renameSync: () => {
        throw new Error("EPERM: rename failed");
      },
      unlinkSync: () => {
        throw new Error("EACCES: unlink failed");
      },
    };
    assert.throws(
      () =>
        generateLocalSupabaseTypes({
          migrationsDir: ws.migrationsDir,
          targetPath: ws.targetPath,
          runner,
          fsModule: renameCleanFailFs,
        }),
      (err) =>
        err instanceof Error &&
        err.message.includes("EPERM: rename failed") &&
        /failed to clean up temporary file/i.test(err.message)
    );
    assert.deepEqual(fs.readFileSync(ws.targetPath), originalBytes);
  } finally {
    ws.cleanup();
  }
});
