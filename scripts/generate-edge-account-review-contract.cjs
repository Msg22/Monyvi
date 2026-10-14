"use strict";

/** Deterministic T011 canonical parser Zod -> standalone Edge contract. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const prettier = require("prettier");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "supabase/functions/_shared/account-review-contract.ts");
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
  "function schemaRecord(value, where) {",
  "  if (!value || typeof value !== \"object\" || Array.isArray(value)) {",
  "    throw new Error(\"Invalid canonical JSON Schema at \" + where);",
  "  }",
  "  return value;",
  "}",
  "",
  "function collapseUnion(schema) {",
  "  const variants = schema.anyOf ?? schema.oneOf;",
  "  if (!variants) return schema;",
  "  if (!Array.isArray(variants) || variants.length < 2) {",
  "    throw new Error(\"Unrecognized provider union\");",
  "  }",
  "  const list = variants.map((part) => schemaRecord(part, \"union member\"));",
  "  const nonnull = list.filter((item) => item.type !== \"null\");",
  "  if (nonnull.length === 1 && list.length === 2) {",
  "    const part = collapseUnion(nonnull[0]);",
  "    if (typeof part.type !== \"string\") throw new Error(\"Unsupported nullable union\");",
  "    return {",
  "      ...part,",
  "      type: [part.type, \"null\"],",
  "      ...(part.enum ? { enum: [...part.enum, null] } : {}),",
  "    };",
  "  }",
  "  if (nonnull.length === list.length &&",
  "      list.every((item) => item.type === \"string\")) {",
  "    return { type: \"string\" };",
  "  }",
  "  throw new Error(\"Unrepresentable provider union; Zod remains authoritative\");",
  "}",
  "",
  "const MODEL_KEYWORDS = new Set([",
  "  \"$schema\", \"type\", \"properties\", \"required\", \"additionalProperties\",",
  "  \"items\", \"enum\", \"const\", \"format\", \"minimum\", \"maximum\",",
  "  \"minItems\", \"maxItems\", \"pattern\", \"minLength\", \"maxLength\",",
  "  \"uniqueItems\", \"default\", \"description\", \"title\",",
  "  \"exclusiveMinimum\", \"exclusiveMaximum\", \"anyOf\", \"oneOf\",",
  "]);",
  "const MODEL_PRIMITIVES = new Set([\"string\", \"number\", \"integer\", \"boolean\", \"object\", \"array\", \"null\"]);",
  "",
  "function supportedType(value) {",
  "  const values = Array.isArray(value) ? value : [value];",
  "  if (values.length < 1 || values.some((item) => !MODEL_PRIMITIVES.has(item))) {",
  "    throw new Error(\"Unsupported provider JSON type\");",
  "  }",
  "  return value;",
  "}",
  "",
  "function projectCurrencyEnum(values, supported) {",
  "  const present = values.filter((item) => item !== null);",
  "  const canonical = ACCOUNT_REVIEW_CURRENCIES;",
  "  const isCurrency = present.length === canonical.length &&",
  "    canonical.every((currency) => present.includes(currency));",
  "  if (!isCurrency || supported === null) return values;",
  "  return [...supported, ...(values.includes(null) ? [null] : [])];",
  "}",
  "",
  "function lowerProviderSchema(input, mode, supported, where) {",
  "  const schema = collapseUnion(schemaRecord(input, where));",
  "  for (const keyword of Object.keys(schema)) {",
  "    if (!MODEL_KEYWORDS.has(keyword)) throw new Error(\"Unsupported canonical keyword \" + keyword + \" at \" + where);",
  "  }",
  "  const type = supportedType(schema.type);",
  "  const result = { type };",
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
  "function lowerObject(schema, output, mode, supported, where) {",
  "  if (schema.additionalProperties !== false) throw new Error(\"Open object \" + where);",
  "  const members = schemaRecord(schema.properties, where + \".properties\");",
  "  if (!Array.isArray(schema.required)) throw new Error(\"Missing required array at \" + where);",
  "  const required = new Set(schema.required);",
  "  output.properties = {};",
  "  for (const [name, value] of Object.entries(members)) {",
  "    if (mode === \"deepinfra\" && !required.has(name)) continue;",
  "    output.properties[name] = lowerProviderSchema(value, mode, supported, where + \".\" + name);",
  "  }",
  "  output.required = mode === \"deepinfra\" ?",
  "    Object.keys(output.properties) : [...schema.required];",
  "  output.additionalProperties = false;",
  "  for (const name of schema.required) {",
  "    if (!Object.hasOwn(output.properties, name)) throw new Error(\"Lost required field \" + where + \".\" + name);",
  "  }",
  "  return output;",
  "}",
  "",
  "function canonicalInputSchema(validator) {",
  "  return z.toJSONSchema(validator, {",
  "    io: \"input\", reused: \"inline\", unrepresentable: \"throw\",",
  "  });",
  "}",
  "",
  "export function buildAccountReviewGeminiResponseSchema() {",
  "  return lowerProviderSchema(",
  "    canonicalInputSchema(accountReviewVoiceResponseV2Schema),",
  "    \"gemini\", null, \"Voice\"",
  "  );",
  "}",
  "",
  "export function buildAccountReviewDeepInfraResponseSchema(supportedCurrencies) {",
  "  if (!Array.isArray(supportedCurrencies) || supportedCurrencies.length < 1 ||",
  "      supportedCurrencies.some((code) => !ACCOUNT_REVIEW_CURRENCIES.includes(code)) ||",
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

function edgeEntrypoint(paths, hash) {
  return [
    'import { z } from "zod";',
    'import { ACCOUNT_REVIEW_CURRENCIES } from "./packages/logic/src/account-review/generated-vocabulary.ts";',
    'import { accountReviewVoiceResponseV2Schema, accountReviewSmsResponseV2Schema } from "./packages/logic/src/account-review/parser-schemas.ts";',
    'export { accountReviewRequestContextSchema, accountReviewEvidenceSpanSchema, accountReviewAccountEvidenceSchema, accountReviewCurrencyEvidenceSchema, accountReviewSuggestedAccountSchema, accountReviewVoiceResponseV2Schema, accountReviewSmsResponseV2Schema } from "./packages/logic/src/account-review/parser-schemas.ts";',
    'export const ACCOUNT_REVIEW_EDGE_GENERATOR_VERSION = ' + JSON.stringify(VERSION) + ";",
    'export const ACCOUNT_REVIEW_CANONICAL_SHA256 = ' + JSON.stringify(hash) + ";",
    'export const ACCOUNT_REVIEW_CANONICAL_SOURCE_PATHS = Object.freeze(' + JSON.stringify(paths) + ");",
    PROJECTION_SOURCE,
  ].join("\n");
}

async function renderContract() {
  const esbuild = loadEsbuild();
  if (esbuild.version !== "0.28.1") {
    throw new Error("Unsupported esbuild version " + esbuild.version);
  }
  const paths = await canonicalManifest(esbuild);
  const hash = hashManifest(paths);
  const content = edgeEntrypoint(paths, hash);
  const options = buildOptions(PARSER_ENTRY, true);
  delete options.entryPoints;
  options.stdin = {
    contents: content,
    resolveDir: ROOT,
    sourcefile: "account-review-edge-entry.ts",
    loader: "ts",
  };
  const result = await esbuild.build(options);
  validateParserOnlyGraph(result.metafile);
  if (!result.outputFiles || result.outputFiles.length !== 1) {
    throw new Error("Expected one standalone Edge output file");
  }
  const config = (await prettier.resolveConfig(OUTPUT)) ?? {};
  const formatted = await prettier.format(
    "/* GENERATED from canonical T009 Zod. Do not edit. */\n" + result.outputFiles[0].text,
    { ...config, filepath: OUTPUT }
  );
  if (formatted.split("\n").length >= 900) {
    throw new Error("Generated Edge contract exceeds 899 formatted lines: request a cohesive generated split");
  }
  return formatted;
}

async function main() {
  const mode = checkRequestedMode();
  const rendered = await renderContract();
  if (mode === "--stdout") {
    process.stdout.write(rendered);
    return;
  }
  if (mode === "--check") {
    if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, "utf8") !== rendered) {
      throw new Error("Stale or missing generated Edge contract");
    }
    return;
  }
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, "utf8") !== rendered) {
    fs.writeFileSync(OUTPUT, rendered, "utf8");
  }
}

main().catch((error) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});
