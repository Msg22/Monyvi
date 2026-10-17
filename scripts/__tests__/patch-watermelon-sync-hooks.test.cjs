"use strict";

/**
 * T069 — exact installed-content postinstall extension verification.
 *
 * Uses node:test + TEMPORARY file copies only. Never invokes the patcher on
 * shared node_modules, a database, emulator, provider or device. Initial
 * fixtures are reconstructed from the installed package's pinned pre/post
 * images; no dependency on ignored .tmp snapshot inputs in final CI.
 *
 * Root runs explicitly:
 * node --test scripts/__tests__/patch-watermelon-sync-hooks.test.cjs
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  DEFAULT_PACKAGE_DIRECTORY,
  PINNED_SHA256,
  PATCHED_SHA256,
  PATCH_OPERATIONS,
  PATCH_PATHS,
  MONYVI_SYNC_WRITER_GUARDS,
  SNAPSHOT_COMPAT_PATHS,
  SNAPSHOT_COMPAT_OPERATIONS,
  isSnapshotCompatiblePostimage,
  PRIOR_SNAPSHOT_COMPAT_OPERATIONS,
  isPriorSnapshotCompatiblePostimage,
  patchWatermelonSyncHooks,
} = require("../patch-watermelon-sync-hooks.cjs");

const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");

function pristineFromInstalled(relative) {
  const content = fs.readFileSync(
    path.join(DEFAULT_PACKAGE_DIRECTORY, relative)
  );
  const found = digest(content);
  if (found === PINNED_SHA256[relative]) {
    return content;
  }
  // A v2 installation proves its exact v1 byte predecessor by reversing
  // only the scoped strategy additions; unknown modifications are refused.
  let baseline = content.toString("utf8");
  if (
    SNAPSHOT_COMPAT_OPERATIONS[relative] &&
    isSnapshotCompatiblePostimage(relative, content)
  ) {
    for (const { needle, replacement } of [
      ...SNAPSHOT_COMPAT_OPERATIONS[relative],
    ].reverse()) {
      assert.equal(baseline.split(replacement).length - 1, 1);
      baseline = baseline.replace(replacement, needle);
    }
  } else if (
    PRIOR_SNAPSHOT_COMPAT_OPERATIONS &&
    PRIOR_SNAPSHOT_COMPAT_OPERATIONS[relative] &&
    isPriorSnapshotCompatiblePostimage &&
    isPriorSnapshotCompatiblePostimage(relative, content)
  ) {
    for (const { needle, replacement } of [
      ...PRIOR_SNAPSHOT_COMPAT_OPERATIONS[relative],
    ].reverse()) {
      assert.equal(baseline.split(replacement).length - 1, 1);
      baseline = baseline.replace(replacement, needle);
    }
  }
  assert.equal(
    digest(Buffer.from(baseline, "utf8")),
    PATCHED_SHA256[relative],
    "Installed SDK must be one of the known exact input/postimage hashes: " +
      relative
  );
  const operations = [...PATCH_OPERATIONS[relative]].reverse();
  let pristine = baseline;
  for (const { needle, replacement } of operations) {
    assert.equal(
      pristine.split(replacement).length - 1,
      1,
      "Can only reconstruct exact pinned SDK source: " + relative
    );
    pristine = pristine.replace(replacement, needle);
  }
  const bytes = Buffer.from(pristine, "utf8");
  assert.equal(digest(bytes), PINNED_SHA256[relative]);
  return bytes;
}

function createFixture() {
  const scratch = fs.mkdtempSync(
    path.join(os.tmpdir(), "monyvi-395-watermelon-")
  );
  const packageDir = path.join(
    scratch,
    "node_modules",
    "@nozbe",
    "watermelondb"
  );
  fs.mkdirSync(packageDir, { recursive: true });

  for (const relative of Object.keys(PINNED_SHA256)) {
    const destination = path.join(packageDir, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const original = PATCH_OPERATIONS[relative]
      ? pristineFromInstalled(relative)
      : fs.readFileSync(path.join(DEFAULT_PACKAGE_DIRECTORY, relative));
    assert.equal(
      digest(original),
      PINNED_SHA256[relative],
      "Untouched SDK context must match pinned installed SHA256: " + relative
    );
    fs.writeFileSync(destination, original);
  }

  return {
    packageDir,
    dispose: () => fs.rmSync(scratch, { recursive: true, force: true }),
  };
}

function fileHash(root, relative) {
  return digest(fs.readFileSync(path.join(root, relative)));
}

function beforeSnapshot(root) {
  return Object.fromEntries(
    Object.keys(PINNED_SHA256).map((relative) => [
      relative,
      fileHash(root, relative),
    ])
  );
}

function assertAllOriginal(root) {
  for (const [relative, hash] of Object.entries(PINNED_SHA256)) {
    assert.equal(
      fileHash(root, relative),
      hash,
      "Expected original: " + relative
    );
  }
}

function assertAllPatched(root) {
  for (const [relative, hash] of Object.entries(PATCHED_SHA256)) {
    if (SNAPSHOT_COMPAT_OPERATIONS[relative]) {
      assert.equal(
        isSnapshotCompatiblePostimage(
          relative,
          fs.readFileSync(path.join(root, relative))
        ),
        true,
        "Expected SHA-bound v2 snapshot postimage: " + relative
      );
    } else {
      assert.equal(
        fileHash(root, relative),
        hash,
        "Expected patched: " + relative
      );
    }
  }
  for (const [relative, hash] of Object.entries(PINNED_SHA256)) {
    if (!(relative in PATCHED_SHA256)) {
      assert.equal(fileHash(root, relative), hash, "Untouched: " + relative);
    }
  }
}

function withFixture(operation) {
  const fixture = createFixture();
  try {
    return operation(fixture.packageDir);
  } finally {
    fixture.dispose();
  }
}

function regenerateOnePostimage(pristine, relative) {
  let output = pristine.toString("utf8");
  for (const { needle, replacement } of PATCH_OPERATIONS[relative]) {
    assert.equal(output.split(needle).length - 1, 1);
    output = output.replace(needle, replacement);
  }
  const patched = Buffer.from(output, "utf8");
  assert.equal(digest(patched), PATCHED_SHA256[relative]);
  return patched;
}

test("exact 0.28.0 preimages stage all CJS/Flow/types and complete idempotent postimages", () =>
  withFixture((root) => {
    assert.equal(
      MONYVI_SYNC_WRITER_GUARDS,
      "monyvi/watermelon-sync-writer-guards/0.28.0/v1"
    );
    assert.deepEqual(patchWatermelonSyncHooks(root), {
      status: "applied",
      files: PATCH_PATHS.length,
    });
    assertAllPatched(root);
    const firstHashes = beforeSnapshot(root);
    assert.deepEqual(patchWatermelonSyncHooks(root), {
      status: "already-patched",
      files: PATCH_PATHS.length,
    });
    assert.deepEqual(beforeSnapshot(root), firstHashes);
  }));

test("v1 exact installed writer hooks upgrade only two synchronizer files, then remain idempotent", () =>
  withFixture((root) => {
    for (const relative of PATCH_PATHS) {
      const target = path.join(root, relative);
      const pristine = fs.readFileSync(target);
      const oldV1 = regenerateOnePostimage(pristine, relative);
      fs.writeFileSync(target, oldV1);
    }
    const v1 = beforeSnapshot(root);
    assert.deepEqual(patchWatermelonSyncHooks(root), {
      status: "applied",
      files: SNAPSHOT_COMPAT_PATHS.length,
    });
    assertAllPatched(root);
    for (const relative of PATCH_PATHS) {
      if (!SNAPSHOT_COMPAT_OPERATIONS[relative]) {
        assert.equal(fileHash(root, relative), v1[relative]);
      }
    }
    const after = beforeSnapshot(root);
    assert.deepEqual(patchWatermelonSyncHooks(root), {
      status: "already-patched",
      files: PATCH_PATHS.length,
    });
    assert.deepEqual(beforeSnapshot(root), after);
  }));

test("mixed v1/v2 synchronizer postimages refuse before any writes", () =>
  withFixture((root) => {
    for (const relative of PATCH_PATHS) {
      const target = path.join(root, relative);
      fs.writeFileSync(
        target,
        regenerateOnePostimage(fs.readFileSync(target), relative)
      );
    }
    const cjsTarget = "sync/impl/synchronize.js";
    let upgraded = fs.readFileSync(path.join(root, cjsTarget), "utf8");
    for (const { needle, replacement } of SNAPSHOT_COMPAT_OPERATIONS[
      cjsTarget
    ]) {
      assert.equal(upgraded.split(needle).length - 1, 1);
      upgraded = upgraded.replace(needle, replacement);
    }
    fs.writeFileSync(path.join(root, cjsTarget), upgraded);
    const before = beforeSnapshot(root);
    assert.throws(
      () => patchWatermelonSyncHooks(root),
      /Mixed\/incomplete SDK patch/
    );
    assert.deepEqual(beforeSnapshot(root), before);
  }));

test("wrong package version fails before touching ANY other file", () =>
  withFixture((root) => {
    const packageFile = path.join(root, "package.json");
    const pkg = JSON.parse(fs.readFileSync(packageFile, "utf8"));
    fs.writeFileSync(
      packageFile,
      JSON.stringify({ ...pkg, version: "0.28.1" })
    );
    const snapshot = beforeSnapshot(root);
    assert.throws(
      () => patchWatermelonSyncHooks(root),
      /Wrong Watermelon installation/
    );
    assert.deepEqual(beforeSnapshot(root), snapshot);
  }));

test("unknown source hash fails closed, without changing even a second valid entrypoint", () =>
  withFixture((root) => {
    const target = path.join(root, "sync", "impl", "synchronize.js");
    fs.appendFileSync(target, "\n// unexpected injected byte\n");
    const snapshot = beforeSnapshot(root);
    assert.throws(
      () => patchWatermelonSyncHooks(root),
      /Unknown installed content/
    );
    assert.deepEqual(beforeSnapshot(root), snapshot);
  }));

test("missing CJS synchronizer or absent-type-path mismatch fails before writes", () =>
  withFixture((root) => {
    fs.unlinkSync(path.join(root, "sync", "impl", "synchronize.js"));
    assert.throws(
      () => patchWatermelonSyncHooks(root),
      /ENOENT|missing|no such file/i
    );
    for (const relative of PATCH_PATHS) {
      if (relative !== "sync/impl/synchronize.js") {
        assert.equal(fileHash(root, relative), PINNED_SHA256[relative]);
      }
    }
  }));

test("unexpected src/sync/index.d.ts is refused: the real installed declaration is sync/index.d.ts", () =>
  withFixture((root) => {
    fs.writeFileSync(
      path.join(root, "src", "sync", "index.d.ts"),
      "export {};\n"
    );
    const snapshot = beforeSnapshot(root);
    assert.throws(
      () => patchWatermelonSyncHooks(root),
      /Unexpected entrypoint exists/
    );
    assert.deepEqual(beforeSnapshot(root), snapshot);
  }));

test("partial, mixed CJS/Flow patch cannot be silently treated as installed capability", () =>
  withFixture((root) => {
    const single = "sync/index.js";
    fs.writeFileSync(
      path.join(root, single),
      regenerateOnePostimage(fs.readFileSync(path.join(root, single)), single)
    );
    const snapshot = beforeSnapshot(root);
    assert.throws(
      () => patchWatermelonSyncHooks(root),
      /Mixed\/incomplete SDK patch/
    );
    assert.deepEqual(beforeSnapshot(root), snapshot);
  }));

test("unknown modified postimage is never considered an idempotent install", () =>
  withFixture((root) => {
    patchWatermelonSyncHooks(root);
    const target = path.join(root, "src", "sync", "impl", "markAsSynced.js");
    fs.appendFileSync(target, "\n// changed after patch\n");
    const snapshot = beforeSnapshot(root);
    assert.throws(
      () => patchWatermelonSyncHooks(root),
      /Unknown installed content/
    );
    assert.deepEqual(beforeSnapshot(root), snapshot);
  }));

test("injected mid-rename failure restores every original SDK file and cleans staged temp files", () =>
  withFixture((root) => {
    let renameCalls = 0;
    const injectedIo = {
      ...fs,
      renameSync: (source, target) => {
        renameCalls++;
        if (renameCalls === 3) {
          throw new Error("t069-injected-rename-failure");
        }
        return fs.renameSync(source, target);
      },
    };
    assert.throws(
      () => patchWatermelonSyncHooks(root, injectedIo),
      /t069-injected-rename-failure/
    );
    assertAllOriginal(root);
    for (const relative of PATCH_PATHS) {
      const directory = path.dirname(path.join(root, relative));
      assert.equal(
        fs
          .readdirSync(directory)
          .some((name) => name.includes(".monyvi-sync-")),
        false,
        "No temporary staged SDK files may survive rollback: " + directory
      );
    }
  }));

/**
 * Parity is exercised from the REAL generated SDK files, not by checking a
 * replacement string or inventing an alternate synchronization engine.
 * Babel strips types from precisely the original Flow helper AST nodes; the
 * same tests execute the published CJS helpers. No node_modules mutation.
 *
 * This is helper-runtime parity, NOT a full Metro/SDK writer execution.
 */
function actualGeneratedAckHelpers(source, names, isFlow) {
  const babel = require("@babel/core");
  const generate = require("@babel/generator").default;
  const vm = require("node:vm");
  const ast = babel.parseSync(source, {
    babelrc: false,
    configFile: false,
    sourceType: isFlow ? "module" : "script",
    parserOpts: { plugins: isFlow ? ["flow"] : [] },
  });
  assert.ok(ast && ast.program, "Real generated SDK module must parse");
  const wanted = new Set(names);
  const selected = ast.program.body.filter((node) => {
    if (node.type === "FunctionDeclaration")
      return node.id && wanted.has(node.id.name);
    if (node.type === "VariableDeclaration")
      return node.declarations.some(
        (decl) => decl.id.type === "Identifier" && wanted.has(decl.id.name)
      );
    return false;
  });
  const discovered = selected.flatMap((node) =>
    node.type === "FunctionDeclaration"
      ? [node.id.name]
      : node.declarations.map((decl) => decl.id.name)
  );
  assert.deepEqual(
    [...discovered].sort(),
    [...names].sort(),
    "Missing or duplicated real installed ACK helper definition"
  );
  const actualDeclarations = selected
    .map((node) => generate(node).code)
    .join("\n");
  const executable = isFlow
    ? babel.transformSync(actualDeclarations, {
        babelrc: false,
        configFile: false,
        plugins: ["@babel/plugin-transform-flow-strip-types"],
      }).code
    : actualDeclarations;
  assert.ok(executable, "Actual ACK helpers must transpile");
  const isolatedModule = { exports: {} };
  vm.runInNewContext(
    executable + "\nmodule.exports = { " + names.join(", ") + " };",
    { module: isolatedModule },
    { timeout: 2000 }
  );
  for (const name of names)
    assert.equal(typeof isolatedModule.exports[name], "function");
  return isolatedModule.exports;
}

function loadGeneratedAckParity(root) {
  // Regenerated by the exact-version/SHA pinned patcher in temporary SDK files.
  const cjsSource = fs.readFileSync(
    path.join(root, "sync", "impl", "markAsSynced.js"),
    "utf8"
  );
  const flowSource = fs.readFileSync(
    path.join(root, "src", "sync", "impl", "markAsSynced.js"),
    "utf8"
  );
  const cjs = actualGeneratedAckHelpers(
    cjsSource,
    ["monyviCopyRejectedIds", "monyviCopyCapturedChanges"],
    false
  );
  const flow = actualGeneratedAckHelpers(
    flowSource,
    [
      "copyRejectedIdsForHook",
      "cloneAckCapturedRaw",
      "copyCapturedChangesForHook",
    ],
    true
  );
  return {
    cjsReject: cjs.monyviCopyRejectedIds,
    cjsChanges: cjs.monyviCopyCapturedChanges,
    flowReject: flow.copyRejectedIdsForHook,
    flowChanges: flow.copyCapturedChangesForHook,
  };
}

function generatedSnapshotGuards(root) {
  const cjs = fs.readFileSync(
    path.join(root, "sync", "impl", "synchronize.js"),
    "utf8"
  );
  const flow = fs.readFileSync(
    path.join(root, "src", "sync", "impl", "synchronize.js"),
    "utf8"
  );
  return [
    [
      "CJS",
      actualGeneratedAckHelpers(
        cjs,
        ["monyviApproveSnapshotReplacement"],
        false
      ).monyviApproveSnapshotReplacement,
    ],
    [
      "Flow via Babel",
      actualGeneratedAckHelpers(
        flow,
        ["monyviApproveSnapshotReplacement"],
        true
      ).monyviApproveSnapshotReplacement,
    ],
  ];
}

const SNAPSHOT_TABLES = [
  "daily_snapshot_assets",
  "daily_snapshot_balance",
  "daily_snapshot_net_worth",
];
const BOUNDED_OWNER = "11111111-1111-4111-8111-111111111111";
const UPPER = Date.parse("2026-10-17T16:30:00.000Z");
const CUTOFF = Date.parse("2026-07-19T16:30:00.000Z");
const where = (left, operator, value) => ({
  type: "where",
  left,
  comparison: { operator, right: { value } },
});
function boundedQuery() {
  return [
    where("user_id", "eq", BOUNDED_OWNER),
    where("created_at", "gt", CUTOFF),
    where("created_at", "lte", UPPER),
    where("_status", "eq", "synced"),
  ];
}
function strategyFor(query = boundedQuery) {
  return {
    default: "incremental",
    override: Object.fromEntries(
      SNAPSHOT_TABLES.map((table) => [table, "replacement"])
    ),
    experimentalQueryRecordsForReplacement: Object.fromEntries(
      SNAPSHOT_TABLES.map((table) => [table, query])
    ),
  };
}

test("genuine generated CJS/Flow guards accept only PR385's three bounded snapshot replacements", () =>
  withFixture((root) => {
    patchWatermelonSyncHooks(root);
    // The allowance is inside the *original* serialized writer pipeline;
    // it does not replace or omit any owner/checkpoint/final raw-ACK seam.
    for (const relative of [
      "sync/impl/synchronize.js",
      "src/sync/impl/synchronize.js",
    ]) {
      const generated = fs.readFileSync(path.join(root, relative), "utf8");
      assert.match(generated, /beforeApplyRemoteChangesInWriter/);
      assert.match(generated, /beforePullCheckpointInWriter/);
      assert.match(generated, /beforeMarkLocalChangesAsSyncedInWriter/);
      assert.match(generated, /experimentalStrategy/);
    }
    for (const [entrypoint, approve] of generatedSnapshotGuards(root)) {
      let first = true;
      const supplied = strategyFor(() => {
        const clauses = boundedQuery();
        if (!first) clauses[0].comparison.right.value = "foreign-owner";
        first = false;
        return clauses;
      });
      const pull = { timestamp: UPPER, experimentalStrategy: supplied };
      assert.equal(approve(pull, UPPER), true, entrypoint);
      const accepted = pull.experimentalStrategy;
      assert.notEqual(accepted, supplied);
      assert.equal(accepted.default, "incremental");
      assert.deepEqual(Object.keys(accepted.override), SNAPSHOT_TABLES);
      assert.deepEqual(
        Object.keys(accepted.experimentalQueryRecordsForReplacement),
        SNAPSHOT_TABLES
      );
      for (const table of SNAPSHOT_TABLES) {
        const actual = accepted.experimentalQueryRecordsForReplacement[table]();
        assert.equal(actual[0].comparison.right.value, BOUNDED_OWNER);
        assert.equal(actual[1].comparison.right.value, CUTOFF);
        assert.equal(actual[2].comparison.right.value, UPPER);
        assert.equal(actual[3].comparison.right.value, "synced");
      }
      assert.equal(Object.isFrozen(accepted), true);
      assert.equal(
        Object.getOwnPropertyDescriptor(pull, "experimentalStrategy").writable,
        false
      );
      for (const [windowLabel, testCutoff] of [
        ["equal finite window", UPPER],
        ["reversed finite window", UPPER + 86400000],
      ]) {
        const pullWindow = {
          timestamp: UPPER,
          experimentalStrategy: strategyFor(() => [
            where("user_id", "eq", BOUNDED_OWNER),
            where("created_at", "gt", testCutoff),
            where("created_at", "lte", UPPER),
            where("_status", "eq", "synced"),
          ]),
        };
        assert.equal(
          approve(pullWindow, UPPER),
          true,
          entrypoint + ": " + windowLabel
        );
      }
    }
  }));

test("CJS/Flow guards reject financial, arbitrary, unbounded and foreign snapshot strategies", () =>
  withFixture((root) => {
    patchWatermelonSyncHooks(root);
    for (const [entrypoint, approve] of generatedSnapshotGuards(root)) {
      const variants = [
        ["unscoped all-replacement", "replacement"],
        [
          "finance replacement",
          {
            ...strategyFor(),
            override: {
              ...strategyFor().override,
              financial_action_groups: "replacement",
            },
          },
        ],
        ["unsafe default", { ...strategyFor(), default: "replacement" }],
        [
          "no one snapshot",
          {
            ...strategyFor(),
            override: { daily_snapshot_assets: "replacement" },
          },
        ],
        [
          "unknown query table",
          {
            ...strategyFor(),
            experimentalQueryRecordsForReplacement: {
              ...strategyFor().experimentalQueryRecordsForReplacement,
              account_financial_effects: boundedQuery,
            },
          },
        ],
        ["unsafe SQL query", strategyFor(() => [{ type: "sql", expr: "1=1" }])],
        [
          "foreign soft-delete selector",
          strategyFor(() => [
            where("user_id", "eq", BOUNDED_OWNER),
            where("created_at", "gt", CUTOFF),
            where("created_at", "lte", UPPER),
            where("_status", "eq", "deleted"),
          ]),
        ],
        [
          "wrong owner column",
          strategyFor(() => [
            where("user_id", "notEq", BOUNDED_OWNER),
            where("created_at", "gt", CUTOFF),
            where("created_at", "lte", UPPER),
            where("_status", "eq", "synced"),
          ]),
        ],
        [
          "nonfinite historical cutoff",
          strategyFor(() => [
            where("user_id", "eq", BOUNDED_OWNER),
            where("created_at", "gt", Number.POSITIVE_INFINITY),
            where("created_at", "lte", UPPER),
            where("_status", "eq", "synced"),
          ]),
        ],
        [
          "wrong high watermark",
          strategyFor(() => [
            where("user_id", "eq", BOUNDED_OWNER),
            where("created_at", "gt", CUTOFF),
            where("created_at", "lte", UPPER + 1),
            where("_status", "eq", "synced"),
          ]),
        ],
        [
          "additional predicate",
          strategyFor(() => [...boundedQuery(), where("deleted", "eq", false)]),
        ],
      ];
      for (const [reason, variant] of variants) {
        const pull = { timestamp: UPPER, experimentalStrategy: variant };
        assert.equal(approve(pull, UPPER), false, entrypoint + ": " + reason);
        assert.equal(pull.experimentalStrategy, variant);
      }
    }
  }));

function ownProtoDictionary(value) {
  const map = Object.create(null);
  Object.defineProperty(map, "__proto__", {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return map;
}

test("real patched Flow/Babel and CJS rejected-ID helpers preserve __proto__ as an OWN table key", () =>
  withFixture((root) => {
    assert.equal(patchWatermelonSyncHooks(root).status, "applied");
    const helpers = loadGeneratedAckParity(root);
    for (const [entrypoint, copyRejected] of [
      ["Flow via Babel", helpers.flowReject],
      ["CJS", helpers.cjsReject],
    ]) {
      const original = ownProtoDictionary(["prior-rejected-id"]);
      const copied = copyRejected(original);
      // This fails on the prior Flow '{}' implementation: assignment to
      // __proto__ changes the prototype and drops the own table entry.
      assert.equal(
        Object.getPrototypeOf(copied),
        null,
        entrypoint + " must allocate null-prototype rejection dictionary"
      );
      assert.deepEqual(
        Object.keys(copied),
        ["__proto__"],
        entrypoint + " must retain the original own table key"
      );
      assert.equal(copied["__proto__"].join(","), "prior-rejected-id");
      copied["__proto__"].push("hook-attempted-mutation");
      assert.equal(
        original["__proto__"].join(","),
        "prior-rejected-id",
        entrypoint + " must not alias original rejection arrays"
      );
    }
  }));

test("real patched Flow/Babel and CJS captured-change helpers preserve __proto__ as a table and isolate raws", () =>
  withFixture((root) => {
    assert.equal(patchWatermelonSyncHooks(root).status, "applied");
    const helpers = loadGeneratedAckParity(root);
    for (const [entrypoint, copyChanges] of [
      ["Flow via Babel", helpers.flowChanges],
      ["CJS", helpers.cjsChanges],
    ]) {
      const original = ownProtoDictionary({
        created: [{ id: "pending-id", name: "original" }],
        updated: [{ id: "updated-id", name: "unsent-pending" }],
        deleted: ["deleted-id"],
      });
      const copied = copyChanges(original);
      assert.equal(
        Object.getPrototypeOf(copied),
        null,
        entrypoint + " must allocate null-prototype captured-change dictionary"
      );
      assert.deepEqual(Object.keys(copied), ["__proto__"]);
      const table = copied["__proto__"];
      assert.equal(table.created[0].name, "original");
      assert.equal(table.updated[0].name, "unsent-pending");
      assert.equal(table.deleted.join(","), "deleted-id");
      table.created[0].name = "hook-rewritten";
      table.updated[0].name = "hook-rewritten";
      table.deleted.push("hook-created-delete");
      assert.equal(original["__proto__"].created[0].name, "original");
      assert.equal(original["__proto__"].updated[0].name, "unsent-pending");
      assert.equal(original["__proto__"].deleted.join(","), "deleted-id");
    }
  }));
