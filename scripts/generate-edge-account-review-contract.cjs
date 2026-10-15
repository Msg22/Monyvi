"use strict";

/** Deterministic T011 canonical parser Zod -> standalone Edge contract. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const prettier = require("prettier");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const GENERATED_PATHS = [
  "supabase/functions/_shared/account-review-contract.ts",
  "supabase/functions/_shared/account-review-parser-contract.ts",
  "supabase/functions/_shared/account-review-provider-projections.ts",
];
const OUTPUT = path.join(ROOT, GENERATED_PATHS[0]);
const VERSION = "account-review-edge/v1";
const HASH_DOMAIN = "monyvi.account-review.edge.canonical.v1";
const REVIEWED_PATHS = [
  "packages/logic/src/account-review/schemas.ts",
  "packages/logic/src/account-review/parser-schemas.ts",
  "packages/logic/src/account-review/parser-advisory-validation.ts",
  "packages/logic/src/account-review/schema-primitives.ts",
  "packages/logic/src/account-review/review-schemas.ts",
  "packages/logic/src/account-review/review-value-primitives.ts",
  "packages/logic/src/account-review/generated-vocabulary.ts",
];
const PARSER_ENTRY = "packages/logic/src/account-review/parser-schemas.ts";
const PARSER_RUNTIME_FILES = [
  "packages/logic/src/account-review/generated-vocabulary.ts",
  "packages/logic/src/utils/amount-limits.ts",
  "packages/logic/src/account-review/schema-primitives.ts",
  "packages/logic/src/account-review/parser-advisory-validation.ts",
  "packages/logic/src/account-review/parser-schemas.ts",
];
const FULL_ENTRY = "packages/logic/src/account-review/schemas.ts";
const FORBIDDEN_RETAINED = /decimal\.js|financial-actions|action-registry|metals|apps\/mobile|packages\/db/;

function loadEsbuild() {
  try {
    return require("esbuild");
  } catch {
    let tsxEntry;
    try {
      tsxEntry = require.resolve("tsx/package.json");
    } catch {
      tsxEntry = require.resolve("tsx");
    }
    const tsxDirectory = path.dirname(tsxEntry);
    return require(require.resolve("esbuild", { paths: [tsxDirectory] }));
  }
}

function checkRequestedMode() {
  const args = process.argv.slice(2);
  if (args.length === 0) return "write";
  if (args.length !== 1 || !["--stdout", "--check"].includes(args[0])) {
    throw new Error("Usage: node generate-edge-account-review-contract.cjs [--stdout|--check]");
  }
  return args[0];
}

function buildOptions(entry, metafile = true) {
  return {
    absWorkingDir: ROOT,
    entryPoints: [entry],
    bundle: true,
    platform: "neutral",
    target: "es2022",
    format: "esm",
    external: ["zod"],
    packages: "bundle",
    minify: false,
    treeShaking: true,
    sourcemap: false,
    legalComments: "none",
    write: false,
    metafile,
    logLevel: "silent",
  };
}

async function canonicalManifest(esbuild) {
  const result = await esbuild.build(buildOptions(FULL_ENTRY));
  if (!result.metafile) throw new Error("Missing full canonical metafile");
  const actual = Object.keys(result.metafile.inputs)
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => file.startsWith("packages/logic/src/"));
  const paths = [...new Set([...REVIEWED_PATHS, ...actual])].sort();
  for (const relative of paths) {
    if (!/^[A-Za-z0-9._/-]+$/.test(relative) ||
        relative.startsWith("/") || relative.includes("..") ||
        !relative.startsWith("packages/logic/src/")) {
      throw new Error("Unsafe canonical input path " + relative);
    }
    if (!fs.existsSync(path.join(ROOT, relative))) {
      throw new Error("Canonical source not found " + relative);
    }
  }
  return paths;
}

function hashManifest(paths) {
  const hash = crypto.createHash("sha256");
  hash.update(HASH_DOMAIN + "\0" + VERSION + "\0", "utf8");
  for (const relative of paths) {
    const bytes = fs.readFileSync(path.join(ROOT, relative));
    hash.update(relative + "\0" + bytes.byteLength.toString(10) + "\0", "utf8");
    hash.update(bytes);
    hash.update("\0", "utf8");
  }
  return hash.digest("hex");
}

function validateParserOnlyGraph(metafile) {
  if (!metafile) throw new Error("Missing parser bundler metafile");
  const retained = Object.values(metafile.outputs).flatMap((output) =>
    Object.entries(output.inputs).filter(([, input]) => input.bytesInOutput > 0)
      .map(([file]) => file.replaceAll("\\", "/"))
  );
  for (const relative of retained) {
    if (FORBIDDEN_RETAINED.test(relative)) {
      throw new Error("Unsafe parser runtime dependency: " + relative);
    }
  }
}

const PROJECTION_SOURCE = [
  "",
  "type ProviderMode = \"gemini\" | \"deepinfra\";",
  "type ProviderObject = Record<string, unknown>;",
  "const MODEL_KEYWORDS = new Set<string>([",
  "  \"$schema\", \"type\", \"properties\", \"required\", \"additionalProperties\",",
  "  \"items\", \"enum\", \"const\", \"format\", \"minimum\", \"maximum\",",
  "  \"minItems\", \"maxItems\", \"pattern\", \"minLength\", \"maxLength\",",
  "  \"uniqueItems\", \"default\", \"description\", \"title\",",
  "  \"exclusiveMinimum\", \"exclusiveMaximum\", \"anyOf\", \"oneOf\",",
  "]);",
  "const MODEL_PRIMITIVES = new Set<string>([",
  "  \"string\", \"number\", \"integer\", \"boolean\", \"object\", \"array\", \"null\",",
  "]);",
  "",
  "function isProviderObject(value: unknown): value is ProviderObject {",
  "  return typeof value === \"object\" && value !== null && !Array.isArray(value);",
  "}",
  "",
  "function schemaRecord(value: unknown, where: string): ProviderObject {",
  "  if (!isProviderObject(value)) throw new Error(\"Invalid canonical JSON Schema at \" + where);",
  "  return value;",
  "}",
  "",
  "function schemaRecords(value: unknown, where: string): ProviderObject[] {",
  "  if (!Array.isArray(value)) throw new Error(\"Invalid canonical array at \" + where);",
  "  return value.map((item: unknown) => schemaRecord(item, where + \"[]\"));",
  "}",
  "",
  "function collapseUnion(schema: ProviderObject): ProviderObject {",
  "  const variants = schema.anyOf ?? schema.oneOf;",
  "  if (variants === undefined) return schema;",
  "  const list = schemaRecords(variants, \"union member\");",
  "  if (list.length < 2) throw new Error(\"Unrecognized provider union\");",
  "  const nonnull = list.filter((item) => item.type !== \"null\");",
  "  if (nonnull.length === 1 && list.length === 2) {",
  "    const part = collapseUnion(nonnull[0]);",
  "    if (typeof part.type !== \"string\") throw new Error(\"Unsupported nullable union\");",
  "    const converted: ProviderObject = { ...part, type: [part.type, \"null\"] };",
  "    if (part.enum !== undefined) {",
  "      if (!Array.isArray(part.enum)) throw new Error(\"Non-array nullable enum\");",
  "      converted.enum = [...part.enum, null];",
  "    }",
  "    return converted;",
  "  }",
  "  if (nonnull.length === list.length &&",
  "      list.every((item) => item.type === \"string\")) {",
  "    return { type: \"string\" };",
  "  }",
  "  throw new Error(\"Unrepresentable provider union; Zod remains authoritative\");",
  "}",
  "",
  "function supportedType(value: unknown): string | string[] {",
  "  const values: unknown[] = Array.isArray(value) ? value : [value];",
  "  if (!values.every((item): item is string =>",
  "    typeof item === \"string\" && MODEL_PRIMITIVES.has(item))) {",
  "    throw new Error(\"Unsupported provider JSON type\");",
  "  }",
  "  return Array.isArray(value) ? values : values[0];",
  "}",
  "",
  "function projectCurrencyEnum(",
  "  values: readonly unknown[],",
  "  supported: readonly string[] | null",
  "): readonly unknown[] {",
  "  const present = values.filter((item) => item !== null);",
  "  const canonical: readonly string[] = ACCOUNT_REVIEW_CURRENCIES;",
  "  const isCurrency = present.length === canonical.length &&",
  "    canonical.every((currency) => present.includes(currency));",
  "  if (!isCurrency || supported === null) return values;",
  "  return [...supported, ...(values.includes(null) ? [null] : [])];",
  "}",
  "",
  "function requiredFields(value: unknown, where: string): string[] {",
  "  if (!Array.isArray(value) ||",
  "      !value.every((item: unknown): item is string => typeof item === \"string\")) {",
  "    throw new Error(\"Invalid required keys at \" + where);",
  "  }",
  "  return value;",
  "}",
  "",
  "function lowerProviderSchema(",
  "  input: unknown, mode: ProviderMode,",
  "  supported: readonly string[] | null, where: string",
  "): ProviderObject {",
  "  const schema = collapseUnion(schemaRecord(input, where));",
  "  for (const keyword of Object.keys(schema)) {",
  "    if (!MODEL_KEYWORDS.has(keyword)) throw new Error(\"Unsupported canonical keyword \" + keyword + \" at \" + where);",
  "  }",
  "  const type = supportedType(schema.type);",
  "  const result: ProviderObject = { type };",
  "  const enumValues = schema.enum ?? (schema.const === undefined ? undefined : [schema.const]);",
  "  if (enumValues !== undefined) {",
  "    if (!Array.isArray(enumValues)) throw new Error(\"Non-array schema enum\");",
  "    result.enum = projectCurrencyEnum(enumValues, supported);",
  "  }",
  "  for (const keyword of [\"format\", \"minimum\", \"maximum\", \"minItems\", \"maxItems\"]) {",
  "    if (schema[keyword] !== undefined) result[keyword] = schema[keyword];",
  "  }",
  "  const kinds = Array.isArray(type) ? type : [type];",
  "  if (kinds.includes(\"object\")) return lowerObject(schema, result, mode, supported, where);",
  "  if (kinds.includes(\"array\")) {",
  "    result.items = lowerProviderSchema(schema.items, mode, supported, where + \"[]\");",
  "  }",
  "  return result;",
  "}",
  "",
  "function lowerObject(",
  "  schema: ProviderObject, output: ProviderObject,",
  "  mode: ProviderMode, supported: readonly string[] | null, where: string",
  "): ProviderObject {",
  "  if (schema.additionalProperties !== false) throw new Error(\"Open object \" + where);",
  "  const members = schemaRecord(schema.properties, where + \".properties\");",
  "  const required = requiredFields(schema.required, where);",
  "  const projected: ProviderObject = {};",
  "  for (const [name, value] of Object.entries(members)) {",
  "    if (mode === \"deepinfra\" && !required.includes(name)) continue;",
  "    projected[name] = lowerProviderSchema(value, mode, supported, where + \".\" + name);",
  "  }",
  "  for (const name of required) {",
  "    if (!Object.hasOwn(projected, name)) throw new Error(\"Lost required field \" + where + \".\" + name);",
  "  }",
  "  output.properties = projected;",
  "  output.required = mode === \"deepinfra\" ? Object.keys(projected) : required;",
  "  output.additionalProperties = false;",
  "  return output;",
  "}",
  "",
  "function canonicalInputSchema(validator: z.ZodType): ProviderObject {",
  "  return schemaRecord(",
  "    z.toJSONSchema(validator, {",
  "      io: \"input\", reused: \"inline\", unrepresentable: \"throw\",",
  "    }),",
  "    \"canonical input\"",
  "  );",
  "}",
  "",
  "export function buildAccountReviewGeminiResponseSchema(): ProviderObject {",
  "  return lowerProviderSchema(",
  "    canonicalInputSchema(accountReviewVoiceResponseV2Schema),",
  "    \"gemini\", null, \"Voice\"",
  "  );",
  "}",
  "",
  "export function buildAccountReviewDeepInfraResponseSchema(",
  "  supportedCurrencies: readonly string[]",
  "): ProviderObject {",
  "  const canonical: readonly string[] = ACCOUNT_REVIEW_CURRENCIES;",
  "  if (!Array.isArray(supportedCurrencies) || supportedCurrencies.length < 1 ||",
  "      supportedCurrencies.some((code) => !canonical.includes(code)) ||",
  "      new Set(supportedCurrencies).size !== supportedCurrencies.length) {",
  "    throw new Error(\"Invalid supported SMS currency vocabulary\");",
  "  }",
  "  return lowerProviderSchema(",
  "    canonicalInputSchema(accountReviewSmsResponseV2Schema),",
  "    \"deepinfra\", supportedCurrencies, \"SMS\"",
  "  );",
  "}",
  "",
].join("\n");

function assertSupportedSourceImports(source, relativePath) {
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const moduleName = statement.moduleSpecifier.text;
    if (moduleName === "zod" || moduleName.startsWith(".")) continue;
    if (statement.importClause?.isTypeOnly) continue;
    throw new Error("Unexpected canonical runtime import in " + relativePath + ": " + moduleName);
  }
}

function emitVocabularyStatement(statement, source) {
  if (!ts.isVariableStatement(statement)) return null;
  const declarations = statement.declarationList.declarations;
  if (declarations.length !== 1) throw new Error("Unexpected generated vocabulary statement");
  const declaration = declarations[0];
  if (!ts.isIdentifier(declaration.name) ||
      !declaration.name.text.startsWith("ACCOUNT_REVIEW_")) return null;
  const initializer = declaration.initializer;
  if (!initializer || !ts.isSatisfiesExpression(initializer)) {
    throw new Error("Expected canonical generated-vocabulary type assertion");
  }
  const raw = statement.getText(source);
  return raw.replace(initializer.getText(source), initializer.expression.getText(source));
}

function extractCanonicalDeclarations(relativePath) {
  const original = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
  const source = ts.createSourceFile(relativePath, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (source.parseDiagnostics.length > 0) throw new Error("Canonical TypeScript syntax failure " + relativePath);
  assertSupportedSourceImports(source, relativePath);
  const vocab = relativePath.endsWith("/generated-vocabulary.ts");
  const declarations = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) continue;
    if (vocab) {
      const rendered = emitVocabularyStatement(statement, source);
      if (rendered !== null) declarations.push(rendered);
      continue;
    }
    if (ts.isVariableStatement(statement) || ts.isFunctionDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      declarations.push(statement.getText(source));
      continue;
    }
    throw new Error("Unexpected canonical TypeScript declaration " + relativePath);
  }
  if (declarations.length === 0) throw new Error("Empty canonical declarations " + relativePath);
  return "// Canonical source: " + relativePath + "\n" + declarations.join("\n\n");
}

function verifyParserInputs(metafile) {
  validateParserOnlyGraph(metafile);
  const retained = Object.keys(metafile.inputs)
    .filter((entry) => entry.startsWith("packages/logic/src/"));
  for (const relative of retained) {
    if (!PARSER_RUNTIME_FILES.includes(relative)) {
      throw new Error("Unexpected parser runtime file: " + relative);
    }
  }
  for (const required of PARSER_RUNTIME_FILES) {
    if (!retained.includes(required)) throw new Error("Missing parser module: " + required);
  }
}

function parserModule() {
  return [
    "/* GENERATED from canonical T009 Zod. Do not edit. */",
    'import { z } from "zod";',
    ...PARSER_RUNTIME_FILES.map(extractCanonicalDeclarations),
  ].join("\n\n");
}

function providerProjectionModule() {
  return [
    "/* GENERATED from canonical T009 Zod. Do not edit. */",
    'import { z } from "zod";',
    'import { ACCOUNT_REVIEW_CURRENCIES, accountReviewVoiceResponseV2Schema, accountReviewSmsResponseV2Schema } from "./account-review-parser-contract.ts";',
    PROJECTION_SOURCE,
  ].join("\n\n");
}

function publicFacadeModule(paths, hash) {
  return [
    "/* GENERATED from canonical T009 Zod. Do not edit. */",
    'export { accountReviewRequestContextSchema, accountReviewEvidenceSpanSchema, accountReviewAccountEvidenceSchema, accountReviewCurrencyEvidenceSchema, accountReviewSuggestedAccountSchema, accountReviewVoiceResponseV2Schema, accountReviewSmsResponseV2Schema } from "./account-review-parser-contract.ts";',
    'export { buildAccountReviewGeminiResponseSchema, buildAccountReviewDeepInfraResponseSchema } from "./account-review-provider-projections.ts";',
    'export const ACCOUNT_REVIEW_EDGE_GENERATOR_VERSION = ' + JSON.stringify(VERSION) + ";",
    'export const ACCOUNT_REVIEW_CANONICAL_SHA256 = ' + JSON.stringify(hash) + ";",
    'export const ACCOUNT_REVIEW_CANONICAL_SOURCE_PATHS = Object.freeze(' + JSON.stringify(paths) + ");",
  ].join("\n\n");
}

/** Traverse emitted TypeScript once, rejecting dynamic imports and unapproved edges. */
function inspectGeneratedModuleEdges(node) {
  const imports = [];
  const exports = [];
  function visit(part) {
    if (ts.isImportDeclaration(part)) {
      if (!ts.isStringLiteral(part.moduleSpecifier)) throw new Error("Invalid generated import");
      if (part.importClause?.isTypeOnly) throw new Error("Unexpected type-only runtime import");
      imports.push(part.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(part) && part.moduleSpecifier) {
      if (!ts.isStringLiteral(part.moduleSpecifier)) throw new Error("Invalid generated export");
      if (part.isTypeOnly) throw new Error("Unexpected type-only reexport");
      exports.push(part.moduleSpecifier.text);
    }
    if (ts.isCallExpression(part) &&
        (part.expression.kind === ts.SyntaxKind.ImportKeyword ||
         (ts.isIdentifier(part.expression) && part.expression.text === "require"))) {
      throw new Error("Generated dynamic import/require forbidden");
    }
    ts.forEachChild(part, visit);
  }
  visit(node);
  return { imports, exports };
}

function checkGraphModule(relative, code, allowedImports, allowedExports) {
  const node = ts.createSourceFile(relative, code, ts.ScriptTarget.Latest, true);
  if (node.parseDiagnostics.length > 0) throw new Error("Invalid generated TS " + relative);
  const { imports, exports } = inspectGeneratedModuleEdges(node);
  if (JSON.stringify(imports.sort()) !== JSON.stringify([...allowedImports].sort()) ||
      JSON.stringify(exports.sort()) !== JSON.stringify([...allowedExports].sort())) {
    throw new Error("Generated import/export graph changed: " + relative);
  }
  if (/Deno\.env|process\.env|createFinancialActionRegistry|class Decimal/.test(code)) {
    throw new Error("Generated runtime includes forbidden operations " + relative);
  }
}

function validateGeneratedGraph(sources) {
  checkGraphModule(GENERATED_PATHS[0], sources.get(GENERATED_PATHS[0]),
    [], ["./account-review-parser-contract.ts", "./account-review-provider-projections.ts"]);
  checkGraphModule(GENERATED_PATHS[1], sources.get(GENERATED_PATHS[1]),
    ["zod"], []);
  checkGraphModule(GENERATED_PATHS[2], sources.get(GENERATED_PATHS[2]),
    ["zod", "./account-review-parser-contract.ts"], []);
}

function validateGeneratedTypes(sources) {
  const configPath = path.join(ROOT, "packages/logic/tsconfig.json");
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error) throw new Error("Invalid logic TS config");
  const parsed = ts.parseJsonConfigFileContent(
    loaded.config, ts.sys, path.dirname(configPath)
  );
  if (parsed.errors.length > 0) throw new Error("Invalid inherited TS config");
  const generated = new Map(GENERATED_PATHS.map((relative) => [
    path.resolve(ROOT, relative), sources.get(relative),
  ]));
  const options = {
    ...parsed.options, strict: true, noImplicitAny: true,
    allowImportingTsExtensions: true, noEmit: true,
  };
  const host = ts.createCompilerHost(options);
  const fromDisk = host.getSourceFile.bind(host);
  host.getSourceFile = (filename, languageVersion, onError, fresh) => {
    const virtual = generated.get(path.resolve(filename));
    return virtual === undefined
      ? fromDisk(filename, languageVersion, onError, fresh)
      : ts.createSourceFile(filename, virtual, languageVersion, true);
  };
  const originalExists = host.fileExists.bind(host);
  host.fileExists = (filename) => generated.has(path.resolve(filename)) ||
    originalExists(filename);
  const program = ts.createProgram(
    [...generated.keys()], options, host
  );
  const diagnostics = ts.getPreEmitDiagnostics(program).filter(
    (item) => item.category === ts.DiagnosticCategory.Error
  );
  if (diagnostics.length > 0) {
    throw new Error(ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (filename) => filename,
      getCurrentDirectory: () => ROOT,
      getNewLine: () => "\n",
    }));
  }
}

async function renderContract() {
  const esbuild = loadEsbuild();
  if (esbuild.version !== "0.28.1" || ts.version !== "5.9.3") {
    throw new Error("Unreviewed bundler/compiler version");
  }
  const paths = await canonicalManifest(esbuild);
  const parser = await esbuild.build(buildOptions(PARSER_ENTRY));
  verifyParserInputs(parser.metafile);
  const hash = hashManifest(paths);
  const sourceByPath = new Map([
    [GENERATED_PATHS[0], publicFacadeModule(paths, hash)],
    [GENERATED_PATHS[1], parserModule()],
    [GENERATED_PATHS[2], providerProjectionModule()],
  ]);
  const formatted = new Map();
  for (const relative of GENERATED_PATHS) {
    const absolute = path.join(ROOT, relative);
    const config = (await prettier.resolveConfig(absolute)) ?? {};
    const text = await prettier.format(sourceByPath.get(relative), {
      ...config, filepath: absolute,
    });
    if (text.split("\n").length >= 900) {
      throw new Error("Generated module exceeds 899 formatted lines: " + relative);
    }
    formatted.set(relative, text);
  }
  validateGeneratedGraph(formatted);
  validateGeneratedTypes(formatted);
  return formatted;
}

async function main() {
  const mode = checkRequestedMode();
  // No output is written before every module passes formatting, graph,
  // type and size checks.
  const rendered = await renderContract();
  if (mode === "--stdout") {
    process.stdout.write(JSON.stringify(Object.fromEntries(rendered)) + "\n");
    return;
  }
  if (mode === "--check") {
    for (const [relative, bytes] of rendered) {
      const absolute = path.join(ROOT, relative);
      if (!fs.existsSync(absolute) || fs.readFileSync(absolute, "utf8") !== bytes) {
        throw new Error("Stale or missing generated Edge module: " + relative);
      }
    }
    return;
  }
  for (const [relative, bytes] of rendered) {
    const absolute = path.join(ROOT, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    if (!fs.existsSync(absolute) || fs.readFileSync(absolute, "utf8") !== bytes) {
      fs.writeFileSync(absolute, bytes, "utf8");
    }
  }
}

main().catch((error) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});
