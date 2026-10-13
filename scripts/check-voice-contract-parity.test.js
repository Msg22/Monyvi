"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..");
const canonicalContractPath = path.join(
  repoRoot,
  "packages/logic/src/voice-ai-safeguard-contract.ts"
);
const edgeContractPath = path.join(
  repoRoot,
  "supabase/functions/_shared/voice-ai-safeguard-contract.ts"
);
const supabaseFunctionsDir = path.join(repoRoot, "supabase/functions");
const supabaseDir = path.join(repoRoot, "supabase");

test("edge voice safeguard contract is byte-identical to canonical packages/logic contract", () => {
  assert.ok(
    fs.existsSync(canonicalContractPath),
    "Canonical contract must exist in packages/logic"
  );
  assert.ok(
    fs.existsSync(edgeContractPath),
    "Edge contract must exist in supabase/functions/_shared"
  );

  const canonicalContent = fs.readFileSync(canonicalContractPath, "utf8");
  const edgeContent = fs.readFileSync(edgeContractPath, "utf8");

  assert.equal(
    edgeContent,
    canonicalContent,
    "supabase/functions/_shared/voice-ai-safeguard-contract.ts must be a byte-identical copy of packages/logic/src/voice-ai-safeguard-contract.ts"
  );
});

test("edge voice safeguard contract runtime imports only third-party zod", () => {
  const edgeContent = fs.readFileSync(edgeContractPath, "utf8");
  const sourceFile = ts.createSourceFile(
    edgeContractPath,
    edgeContent,
    ts.ScriptTarget.Latest,
    true
  );

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (statement.importClause && statement.importClause.isTypeOnly) {
        continue;
      }
      assert.ok(
        ts.isStringLiteral(statement.moduleSpecifier),
        "Import specifier must be string literal"
      );
      const specifier = statement.moduleSpecifier.text;
      assert.equal(
        specifier,
        "zod",
        `Contract runtime imports must only target "zod", but found: ${specifier}`
      );
    }
  }
});

function findRuntimeRelativeImports(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const runtimeSpecifiers = [];

  function checkModuleSpecifier(specifierNode) {
    if (specifierNode && ts.isStringLiteral(specifierNode)) {
      const text = specifierNode.text;
      if (text.startsWith(".")) {
        runtimeSpecifiers.push(text);
      }
    }
  }

  function visit(node) {
    // 1. ImportDeclaration
    if (ts.isImportDeclaration(node)) {
      // Ignore `import type ...`
      if (node.importClause && node.importClause.isTypeOnly) {
        return;
      }
      // Check if all imported elements are type-only
      if (
        node.importClause &&
        node.importClause.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings)
      ) {
        const elements = node.importClause.namedBindings.elements;
        const allTypeOnly =
          elements.length > 0 && elements.every((el) => el.isTypeOnly);
        if (allTypeOnly && !node.importClause.name) {
          return;
        }
      }
      checkModuleSpecifier(node.moduleSpecifier);
      return;
    }

    // 2. ExportDeclaration (re-exports)
    if (ts.isExportDeclaration(node)) {
      if (node.isTypeOnly) {
        return;
      }
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        const elements = node.exportClause.elements;
        const allTypeOnly =
          elements.length > 0 && elements.every((el) => el.isTypeOnly);
        if (allTypeOnly) {
          return;
        }
      }
      checkModuleSpecifier(node.moduleSpecifier);
      return;
    }

    // 3. Dynamic import: import(...)
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        checkModuleSpecifier(arg);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return runtimeSpecifiers;
}

function traverseRuntimeImports(entryFilePath, visited = new Set()) {
  const resolvedEntry = path.resolve(entryFilePath);
  if (visited.has(resolvedEntry)) return;
  visited.add(resolvedEntry);

  const imports = findRuntimeRelativeImports(resolvedEntry);
  for (const specifier of imports) {
    const dir = path.dirname(resolvedEntry);
    let target = path.resolve(dir, specifier);

    if (!fs.existsSync(target)) {
      for (const ext of [".ts", ".js", ".json"]) {
        if (fs.existsSync(target + ext)) {
          target = target + ext;
          break;
        }
      }
    }

    assert.ok(
      fs.existsSync(target),
      `Runtime import target must exist: ${specifier} in ${resolvedEntry}`
    );

    // Enforce that the runtime import does NOT escape supabase/
    const relativeToSupabase = path.relative(supabaseDir, target);
    assert.ok(
      !relativeToSupabase.startsWith("..") &&
        !path.isAbsolute(relativeToSupabase),
      `Runtime import graph escaped supabase directory: ${target} imported from ${resolvedEntry}`
    );

    traverseRuntimeImports(target, visited);
  }
}

test("parse-voice entrypoint runtime import graph remains strictly closed within supabase directory", () => {
  const parseVoiceEntry = path.join(
    supabaseFunctionsDir,
    "parse-voice/index.ts"
  );
  assert.ok(fs.existsSync(parseVoiceEntry));
  const visited = new Set();
  traverseRuntimeImports(parseVoiceEntry, visited);
  assert.ok(visited.size > 0, "Traversed modules must not be empty");
});

test("voice-ai-availability entrypoint runtime import graph remains strictly closed within supabase directory", () => {
  const availabilityEntry = path.join(
    supabaseFunctionsDir,
    "voice-ai-availability/index.ts"
  );
  assert.ok(fs.existsSync(availabilityEntry));
  const visited = new Set();
  traverseRuntimeImports(availabilityEntry, visited);
  assert.ok(visited.size > 0, "Traversed modules must not be empty");
});
