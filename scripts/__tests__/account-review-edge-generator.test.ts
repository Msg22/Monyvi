import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import * as prettier from "prettier";
import * as ts from "typescript";
import { z } from "zod";

import {
  accountReviewRequestContextSchema as canonicalRequest,
  accountReviewEvidenceSpanSchema as canonicalSpan,
  accountReviewAccountEvidenceSchema as canonicalAccountEvidence,
  accountReviewCurrencyEvidenceSchema as canonicalCurrencyEvidence,
  accountReviewSuggestedAccountSchema as canonicalSuggested,
  accountReviewVoiceResponseV2Schema as canonicalVoice,
  accountReviewSmsResponseV2Schema as canonicalSms,
} from "../../packages/logic/src/account-review/schemas";
import {
  makeAccountEvidence,
  makeCurrencyEvidence,
  makeGroundedVoiceCashV2Response,
  makeReviewRequestContext,
  makeSuggestedAccount,
  makeSmsV2Response,
  makeVoiceV2Response,
} from "../../packages/logic/src/account-review/__tests__/fixtures";
import type { SmsAiProviderConfig } from "../../supabase/functions/_shared/sms-ai/sms-ai-provider-config.ts";
import {
  DeepInfraSmsProvider,
  DEEPINFRA_SMS_ENDPOINT,
} from "../../supabase/functions/_shared/sms-ai/providers/deepinfra-sms-provider.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GENERATOR = join(ROOT, "scripts/generate-edge-account-review-contract.cjs");
const GENERATED = join(ROOT, "supabase/functions/_shared/account-review-contract.ts");
const VERSION = "account-review-edge/v1";
const HASH_DOMAIN = "monyvi.account-review.edge.canonical.v1";

const REQUIRED_CANONICAL_PATHS = [
  "packages/logic/src/account-review/schemas.ts",
  "packages/logic/src/account-review/parser-schemas.ts",
  "packages/logic/src/account-review/parser-advisory-validation.ts",
  "packages/logic/src/account-review/schema-primitives.ts",
  "packages/logic/src/account-review/review-schemas.ts",
  "packages/logic/src/account-review/review-value-primitives.ts",
  "packages/logic/src/account-review/generated-vocabulary.ts",
] as const;

function requireExisting(path: string, label: string): void {
  assert.ok(existsSync(path), "Missing " + label + ": " + path);
}

function safeCanonicalPaths(paths: readonly string[]): string[] {
  const sorted = [...paths].sort();
  assert.deepEqual(paths, sorted, "Canonical path manifest is not ASCII sorted");
  assert.equal(new Set(paths).size, paths.length, "Duplicate source path");
  for (const path of paths) {
    assert.match(path, /^[A-Za-z0-9._/-]+$/, "Non-ASCII canonical source path");
    assert.ok(!path.startsWith("/") && !path.includes(".."), "Unsafe source path");
    assert.ok(path.startsWith("packages/logic/src/"), "Unreviewed source root");
    requireExisting(join(ROOT, path), "canonical source");
  }
  return sorted;
}

function computeCanonicalHash(sortedPaths: readonly string[]): string {
  const hash = createHash("sha256");
  hash.update(HASH_DOMAIN + "\0" + VERSION + "\0", "utf8");
  for (const path of sortedPaths) {
    const bytes = readFileSync(join(ROOT, path));
    hash.update(path + "\0" + bytes.byteLength.toString(10) + "\0", "utf8");
    hash.update(bytes);
    hash.update("\0", "utf8");
  }
  return hash.digest("hex");
}

function runGenerator(mode: "--stdout" | "--check"): string {
  requireExisting(GENERATOR, "T011 generator");
  return execFileSync(process.execPath, [GENERATOR, mode], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function loadGeneratedEdge() {
  return import("../../supabase/functions/_shared/account-review-contract");
}

async function independentlyBundleSource(entry: string) {
  return build({
    absWorkingDir: ROOT,
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    external: ["zod"],
    packages: "bundle",
    treeShaking: true,
    minify: false,
    metafile: true,
    write: false,
    logLevel: "silent",
  });
}

function localInputs(inputs: readonly string[]): string[] {
  return [...inputs]
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => path.startsWith("packages/logic/src/"))
    .sort();
}

test("T011 generator --stdout repeats and exactly matches hook-clean tracked bytes", async () => {
  requireExisting(GENERATED, "standalone Edge contract");
  const first = runGenerator("--stdout");
  const second = runGenerator("--stdout");
  assert.ok(first.length > 1000, "Generated module is an empty placeholder");
  assert.equal(first, second, "Non-deterministic standalone renders");
  assert.equal(first, readFileSync(GENERATED, "utf8"), "Tracked artifact differs");
  const config = await prettier.resolveConfig(GENERATED);
  const formatted = await prettier.format(first, {
    ...config,
    filepath: GENERATED,
  });
  assert.equal(first, formatted, "Generator must format before writing");
  assert.ok(
    first.split("\n").length < 900,
    "Standalone artifact exceeds 899 formatted lines; propose a module split, never minify"
  );
});

test("T011 --check validates without modifying tracked contents or mtime", () => {
  requireExisting(GENERATED, "standalone Edge contract");
  const before = readFileSync(GENERATED, "utf8");
  const beforeMtime = statSync(GENERATED).mtimeMs;
  runGenerator("--check");
  assert.equal(readFileSync(GENERATED, "utf8"), before);
  assert.equal(statSync(GENERATED).mtimeMs, beforeMtime);
});

test("T011 reviewed manifest includes all T009 modules plus actual parser helper inputs", async () => {
  const edge = await loadGeneratedEdge();
  assert.equal(edge.ACCOUNT_REVIEW_EDGE_GENERATOR_VERSION, VERSION);
  const supplied: readonly string[] = edge.ACCOUNT_REVIEW_CANONICAL_SOURCE_PATHS;
  assert.ok(Array.isArray(supplied), "No inspectable canonical source manifest");
  const sorted = safeCanonicalPaths(supplied);
  for (const path of REQUIRED_CANONICAL_PATHS) {
    assert.ok(sorted.includes(path), "Missing reviewed module: " + path);
  }

  const independent = await independentlyBundleSource(
    "packages/logic/src/account-review/schemas.ts"
  );
  assert.ok(independent.metafile, "esbuild did not provide input evidence");
  const inputs = localInputs(Object.keys(independent.metafile.inputs));
  for (const path of inputs) {
    assert.ok(sorted.includes(path), "Unhashed actual parser input: " + path);
  }
  assert.deepEqual(
    sorted,
    [...new Set([...REQUIRED_CANONICAL_PATHS, ...inputs])].sort(),
    "Canonical metadata contains unreviewed or missing local sources"
  );
});

test("T011 SHA-256 marker independently hashes sorted raw paths, lengths and bytes", async () => {
  const edge = await loadGeneratedEdge();
  const manifest: readonly string[] = edge.ACCOUNT_REVIEW_CANONICAL_SOURCE_PATHS;
  const sorted = safeCanonicalPaths(manifest);
  assert.match(edge.ACCOUNT_REVIEW_CANONICAL_SHA256, /^[0-9a-f]{64}$/);
  assert.equal(edge.ACCOUNT_REVIEW_CANONICAL_SHA256, computeCanonicalHash(sorted));
  assert.ok(!JSON.stringify(sorted).includes("node_modules"));
});

test("T011 parser entry and standalone artifact have no Decimal, registry or DB runtime dependencies", async () => {
  const independent = await independentlyBundleSource(
    "packages/logic/src/account-review/parser-schemas.ts"
  );
  assert.ok(independent.metafile, "Missing bundler metadata");
  const retained = Object.values(independent.metafile.outputs).flatMap((output) =>
    Object.entries(output.inputs)
      .filter(([, entry]) => entry.bytesInOutput > 0)
      .map(([path]) => path.replaceAll("\\", "/"))
  );
  for (const path of retained) {
    assert.doesNotMatch(
      path,
      /decimal\.js|financial-actions|action-registry|metals|apps\/mobile|packages\/db/,
      "An unrelated module survived parser-only tree-shaking"
    );
  }

  requireExisting(GENERATED, "standalone Edge contract");
  const source = readFileSync(GENERATED, "utf8");
  const syntax = ts.createSourceFile(GENERATED, source, ts.ScriptTarget.Latest, true);
  const runtimeImports: string[] = [];
  function inspect(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      assert.ok(ts.isStringLiteral(node.moduleSpecifier));
      assert.equal(
        node.importClause?.isTypeOnly, false,
        "Standalone Edge artifact must not retain a type-only import"
      );
      runtimeImports.push(node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      assert.fail("Standalone Edge output cannot reexport unresolved modules");
    }
    if (ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
       ts.isIdentifier(node.expression) && node.expression.text === "require")) {
      assert.fail("Standalone Edge output cannot use runtime dynamic imports or require()");
    }
    ts.forEachChild(node, inspect);
  }
  inspect(syntax);
  assert.ok(runtimeImports.length > 0, "Expected a runtime Zod dependency");
  assert.deepEqual(
    [...new Set(runtimeImports)].sort(),
    ["zod"],
    "Only the unique bare Zod dependency may remain external"
  );
  for (const bareImport of runtimeImports) {
    assert.equal(bareImport, "zod", "No relative/Node/DB imports are permitted");
  }
  assert.doesNotMatch(
    source,
    /createFinancialActionRegistry|DEFAULT_FINANCIAL_ACTION_REGISTRY|class Decimal|process\.env|Deno\.env/,
    "Bundled non-parser runtime or environmental side effects"
  );
});

test("T011 refactor isolates review-only revision and decimal validators from provider primitives", () => {
  const shared = readFileSync(
    join(ROOT, "packages/logic/src/account-review/schema-primitives.ts"),
    "utf8"
  );
  const review = readFileSync(
    join(ROOT, "packages/logic/src/account-review/review-schemas.ts"),
    "utf8"
  );
  const valuePath = join(
    ROOT,
    "packages/logic/src/account-review/review-value-primitives.ts"
  );
  requireExisting(valuePath, "dedicated review value primitives");
  const values = readFileSync(valuePath, "utf8");
  assert.doesNotMatch(shared, /parseCanonicalUnsignedIntegerString|from "decimal\.js"/);
  assert.doesNotMatch(shared, /export const (recordRevision|canonicalDecimal) =/);
  assert.match(values, /export const recordRevision =/);
  assert.match(values, /export const canonicalDecimal =/);
  assert.match(review, /from "\.\/review-value-primitives"/);
  assert.doesNotMatch(values, /@monyvi\/db|apps\/mobile/);
});


function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonObject(value: unknown, field: string): Record<string, unknown> {
  assert.ok(isPlainRecord(value), "Expected JSON object at " + field);
  return value;
}

function jsonArray(value: unknown, field: string): readonly unknown[] {
  assert.ok(Array.isArray(value), "Expected JSON array at " + field);
  return value;
}

function property(parent: unknown, field: string): Record<string, unknown> {
  const o = jsonObject(parent, "parent");
  const members = jsonObject(o.properties, "properties");
  assert.ok(Object.hasOwn(members, field), "Missing provider field: " + field);
  return jsonObject(members[field], field);
}

function fieldsRequired(parent: unknown): readonly unknown[] {
  return jsonArray(jsonObject(parent, "schema").required, "required");
}

function isNullable(schema: unknown): boolean {
  const source = jsonObject(schema, "nullable field");
  if (source.type === "null") return true;
  if (Array.isArray(source.type) && source.type.includes("null")) return true;
  for (const key of ["anyOf", "oneOf"]) {
    if (Array.isArray(source[key]) &&
      source[key].some((variant) => isNullable(variant))) {
      return true;
    }
  }
  return false;
}

function isNullableString(schema: unknown): boolean {
  const types = jsonObject(schema, "currency").type;
  return isNullable(schema) &&
    Array.isArray(types) &&
    types.includes("string") &&
    types.includes("null");
}

const GEMINI_STRUCTURAL_KEYWORDS = new Set([
  "type", "properties", "required", "additionalProperties", "enum",
  "format", "minimum", "maximum", "items", "minItems", "maxItems",
]);

function verifyGeminiWhitelist(value: unknown, where = "root"): void {
  const schema = jsonObject(value, where);
  for (const name of Object.keys(schema)) {
    assert.ok(GEMINI_STRUCTURAL_KEYWORDS.has(name), "Unsupported Gemini keyword " + where + "." + name);
  }
  if (schema.type === "object" ||
      Array.isArray(schema.type) && schema.type.includes("object")) {
    assert.equal(schema.additionalProperties, false);
    const properties = jsonObject(schema.properties, where + ".properties");
    for (const [name, child] of Object.entries(properties)) {
      verifyGeminiWhitelist(child, where + "." + name);
    }
  } else if (schema.type === "array" ||
             Array.isArray(schema.type) && schema.type.includes("array")) {
    verifyGeminiWhitelist(schema.items, where + "[]");
  }
}

function verifyDeepInfraStrict(value: unknown, where = "root"): void {
  const schema = jsonObject(value, where);
  assert.ok(!Object.hasOwn(schema, "default"), "Model schema must not supply default values");
  if (schema.type === "object" ||
      Array.isArray(schema.type) && schema.type.includes("object")) {
    assert.equal(schema.additionalProperties, false, "Non-closed provider object at " + where);
    const properties = jsonObject(schema.properties, where + ".properties");
    const required = jsonArray(schema.required, where + ".required");
    assert.deepEqual(
      [...required].sort(),
      Object.keys(properties).sort(),
      "DeepInfra strict objects require every modeled property at " + where
    );
    for (const [name, child] of Object.entries(properties)) {
      verifyDeepInfraStrict(child, where + "." + name);
    }
  } else if (schema.type === "array" ||
             Array.isArray(schema.type) && schema.type.includes("array")) {
    verifyDeepInfraStrict(schema.items, where + "[]");
  } else if (Array.isArray(schema.anyOf)) {
    for (const [index, variant] of schema.anyOf.entries()) {
      verifyDeepInfraStrict(variant, where + ".anyOf[" + index + "]");
    }
  } else if (Array.isArray(schema.oneOf)) {
    for (const [index, variant] of schema.oneOf.entries()) {
      verifyDeepInfraStrict(variant, where + ".oneOf[" + index + "]");
    }
  }
}



test("T011 generated Edge TS passes a full strict compiler diagnostic check", () => {
  requireExisting(GENERATED, "canonical generated Edge contract");
  const configPath = ts.findConfigFile(
    join(ROOT, "packages/logic"), ts.sys.fileExists, "tsconfig.json"
  );
  assert.ok(configPath, "Missing canonical logic TypeScript settings");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    assert.fail(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config, ts.sys, dirname(configPath)
  );
  assert.equal(parsed.errors.length, 0, "Invalid inherited logic compiler config");
  const program = ts.createProgram([GENERATED], {
    ...parsed.options,
    strict: true,
    noImplicitAny: true,
    noEmit: true,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program).filter(
    (issue) => issue.category === ts.DiagnosticCategory.Error
  );
  const formatted = ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (name): string => name,
    getCurrentDirectory: (): string => ROOT,
    getNewLine: (): string => "\n",
  });
  assert.equal(diagnostics.length, 0, formatted);
});

test("T011 standalone exposes all seven canonical T004 validators without detached copies", async () => {
  const edge = await loadGeneratedEdge();
  const sampleVoice = makeVoiceV2Response();
  const sampleSms = makeSmsV2Response();
  const cases = [
    [edge.accountReviewRequestContextSchema, canonicalRequest, makeReviewRequestContext()],
    [edge.accountReviewEvidenceSpanSchema, canonicalSpan, makeAccountEvidence().evidenceSpans[0]],
    [edge.accountReviewAccountEvidenceSchema, canonicalAccountEvidence, makeAccountEvidence()],
    [edge.accountReviewCurrencyEvidenceSchema, canonicalCurrencyEvidence, makeCurrencyEvidence()],
    [edge.accountReviewSuggestedAccountSchema, canonicalSuggested, makeSuggestedAccount()],
    [edge.accountReviewVoiceResponseV2Schema, canonicalVoice, sampleVoice],
    [edge.accountReviewSmsResponseV2Schema, canonicalSms, sampleSms],
  ] as const;
  assert.equal(cases.length, 7);
  for (const [standalone, logic, value] of cases) {
    assert.equal(typeof standalone?.safeParse, "function");
    assert.equal(logic.safeParse(value).success, true);
    assert.equal(standalone.safeParse(value).success, true);
  }
  const malformed = {
    ...makeAccountEvidence(),
    privateBalance: "untrusted",
  };
  assert.equal(canonicalAccountEvidence.safeParse(malformed).success, false);
  assert.equal(edge.accountReviewAccountEvidenceSchema.safeParse(malformed).success, false);
});

test("T011 actual Gemini projection stays inside the supported structural subset and preserves v2 evidence", async () => {
  const edge = await loadGeneratedEdge();
  const output = edge.buildAccountReviewGeminiResponseSchema();
  const request = {
    responseMimeType: "application/json",
    responseJsonSchema: output,
  };
  assert.equal(request.responseMimeType, "application/json");
  verifyGeminiWhitelist(request.responseJsonSchema);
  const root = jsonObject(output, "Gemini output");
  for (const key of [
    "reviewContractVersion", "transcript", "original_transcript",
    "detected_language", "transactions", "suggestedAccounts",
  ]) {
    assert.ok(fieldsRequired(root).includes(key), "Gemini v2 field omitted: " + key);
  }
  const transaction = jsonObject(property(root, "transactions").items, "Voice transaction");
  for (const key of [
    "amount", "type", "categorySystemName", "currency",
    "accountEvidence", "currencyEvidence", "toAccountEvidence",
    "transactionRef", "suggestionRef",
  ]) {
    assert.ok(fieldsRequired(transaction).includes(key), "Gemini row omitted " + key);
  }
  assert.ok(
    isNullableString(property(transaction, "currency")),
    "Unconfirmed Voice currency cannot be coerced to a preferred currency"
  );
  assert.deepEqual(
    jsonArray(property(root, "reviewContractVersion").enum, "Gemini version"),
    ["account-review/v2"]
  );

  // The source is the only authority for exact required-key and nullability
  // relations; the provider projection may intentionally omit refinements.
  const canonicalProjection = jsonObject(
    z.toJSONSchema(canonicalVoice, {
      io: "input",
      reused: "inline",
      unrepresentable: "throw",
    }),
    "canonical Voice input JSON Schema"
  );
  for (const key of fieldsRequired(canonicalProjection)) {
    assert.ok(fieldsRequired(root).includes(key), "Lost canonical required key: " + String(key));
  }
  assert.deepEqual(
    Object.keys(jsonObject(root.properties, "Gemini properties")).sort(),
    Object.keys(jsonObject(canonicalProjection.properties, "canonical properties")).sort()
  );

  const goodCash = makeGroundedVoiceCashV2Response();
  assert.equal(canonicalVoice.safeParse(goodCash).success, true);
  assert.equal(edge.accountReviewVoiceResponseV2Schema.safeParse(goodCash).success, true);
  const mismatchedSpan = {
    ...goodCash,
    transactions: [{
      ...goodCash.transactions[0],
      accountEvidence: {
        ...goodCash.transactions[0].accountEvidence,
        evidenceSpans: [{
          ...goodCash.transactions[0].accountEvidence.evidenceSpans[0],
          text: "different speech",
        }],
      },
    }],
  };
  assert.equal(canonicalVoice.safeParse(mismatchedSpan).success, false);
  assert.equal(edge.accountReviewVoiceResponseV2Schema.safeParse(mismatchedSpan).success, false);
});

test("T011 DeepInfra strict projection runs through real request serializer with injected transport", async () => {
  const edge = await loadGeneratedEdge();
  const projected = edge.buildAccountReviewDeepInfraResponseSchema(["EGP", "USD"]);
  verifyDeepInfraStrict(projected);
  const root = jsonObject(projected, "DeepInfra provider output");
  const expectedModelFields = [
    "reviewContractVersion", "suggestedAccounts", "transactions",
  ];
  assert.deepEqual(
    Object.keys(jsonObject(root.properties, "provider properties")).sort(),
    expectedModelFields.sort(),
    "Server completion, retry and fingerprint bookkeeping cannot be model-authored"
  );
  const row = jsonObject(property(root, "transactions").items, "DeepInfra row");
  const canonicalInput = z.toJSONSchema(canonicalSms, {
    io: "input",
    reused: "inline",
    unrepresentable: "throw",
  });
  const canonicalRow = jsonObject(
    property(canonicalInput, "transactions").items,
    "canonical SMS input row"
  );
  const canonicalRowProperties = jsonObject(
    canonicalRow.properties,
    "canonical SMS row fields"
  );
  const modelRowProperties = jsonObject(row.properties, "model SMS row fields");
  for (const name of Object.keys(modelRowProperties)) {
    assert.ok(
      Object.hasOwn(canonicalRowProperties, name),
      "Provider created an unmodeled financial field: " + name
    );
  }
  for (const key of fieldsRequired(canonicalRow)) {
    assert.ok(fieldsRequired(row).includes(key), "Lost canonical required field " + String(key));
  }
  for (const name of [
    "messageId", "amount", "currency", "type", "categorySystemName",
    "accountEvidence", "currencyEvidence", "transactionRef", "suggestionRef",
  ]) {
    assert.ok(fieldsRequired(row).includes(name), "Missing SMS v2 row field: " + name);
  }
  assert.ok(isNullableString(property(row, "currency")));
  assert.deepEqual(
    jsonArray(property(root, "reviewContractVersion").enum, "version enum"),
    ["account-review/v2"]
  );
  const currencyEvidence = property(row, "currencyEvidence");
  const candidates = property(currencyEvidence, "candidateCodes");
  assert.deepEqual(
    jsonArray(jsonObject(candidates.items, "candidate currency").enum, "currency enum"),
    ["EGP", "USD"],
    "Provider candidates must be constrained to requested supported codes"
  );

  for (const optional of ["cardLast4", "isAtmWithdrawal"]) {
    const properties = jsonObject(row.properties, "row.properties");
    if (Object.hasOwn(properties, optional)) {
      assert.ok(fieldsRequired(row).includes(optional));
      assert.equal(
        isNullable(properties[optional]), false,
        "Provider must not widen a legacy nonnullable optional field to null"
      );
    }
  }

  const original = makeSmsV2Response();
  assert.equal(
    canonicalSms.safeParse({
      ...original,
      transactions: [{ ...original.transactions[0], cardLast4: null }],
    }).success,
    false,
    "Legacy card suffix cannot be widened to null merely to satisfy strict output"
  );
  assert.throws(
    () => edge.buildAccountReviewDeepInfraResponseSchema(["EGP", "NOT_SUPPORTED"]),
    "Unsupported provider currency must not become a new enum member"
  );

  const config: SmsAiProviderConfig = {
    provider: "deepinfra",
    model: "deepseek-ai/DeepSeek-V4-Flash-0731",
    serviceTier: "default",
    apiKey: "test-injected-transport-only",
  };
  const fixture = makeSmsV2Response();
  const modelResponse = {
    reviewContractVersion: fixture.reviewContractVersion,
    transactions: fixture.transactions,
    suggestedAccounts: fixture.suggestedAccounts,
  };
  let urlCaptured = "";
  let bodyCaptured: unknown;
  const provider = new DeepInfraSmsProvider(config, {
    fetch: async (url, init) => {
      urlCaptured = String(url);
      bodyCaptured = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        id: "chatcmpl-injected",
        choices: [{
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify(modelResponse),
          },
        }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    createTimeoutSignal: () => new AbortController().signal,
  });
  const response = await provider.execute({
    responseSchema: projected,
    messages: [{ role: "user", content: "synthetic noncustomer fixture" }],
  });
  assert.equal(urlCaptured, DEEPINFRA_SMS_ENDPOINT);
  const captured = jsonObject(bodyCaptured, "DeepInfra HTTP body");
  const responseFormat = jsonObject(captured.response_format, "response_format");
  assert.equal(responseFormat.type, "json_schema");
  const wrapper = jsonObject(responseFormat.json_schema, "json_schema");
  assert.equal(wrapper.strict, true);
  assert.equal(wrapper.name, "monyvi_sms_transactions");
  assert.deepEqual(wrapper.schema, projected);
  assert.equal(response.completionStatus, "complete");
  const parsed: unknown = JSON.parse(response.content);
  assert.equal(edge.accountReviewSmsResponseV2Schema.safeParse(parsed).success, true);
  assert.equal(canonicalSms.safeParse(parsed).success, true);

  assert.equal(edge.accountReviewSmsResponseV2Schema.safeParse({
    ...modelResponse,
    transactions: [{ ...fixture.transactions[0], categorySystemName: null }],
  }).success, false);
  assert.equal(edge.accountReviewSmsResponseV2Schema.safeParse({
    ...modelResponse,
    transactions: [{
      ...fixture.transactions[0],
      suggestionRef: "foreign-ref",
    }],
  }).success, false);
});
