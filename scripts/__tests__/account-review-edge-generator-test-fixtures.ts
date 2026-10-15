/** Shared pure test assertions and canonical synthetic Edge-provider fixtures.
 * No generated contract import, networking, subprocesses, or provider execution.
 */
import assert from "node:assert/strict";
import { makeSmsV2Response } from "../../packages/logic/src/account-review/__tests__/fixtures";

export const GENERATED_RELATIVE = [
  "supabase/functions/_shared/account-review-contract.ts",
  "supabase/functions/_shared/account-review-parser-contract.ts",
  "supabase/functions/_shared/account-review-provider-projections.ts",
] as const;

export function readGeneratedMap(output: string): ReadonlyMap<string, string> {
  const parsed: unknown = JSON.parse(output);
  assert.ok(
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed),
    "Generator stdout must be a filename-to-content JSON map"
  );
  const entries = Object.entries(parsed);
  assert.deepEqual(
    entries.map(([name]) => name),
    [...GENERATED_RELATIVE],
    "Generator stdout keys must be complete and ASCII sorted"
  );
  const result = new Map<string, string>();
  for (const [filename, content] of entries) {
    if (typeof content !== "string") {
      assert.fail("Nontext generated module: " + filename);
    }
    assert.ok(content.length > 80, "Generated module is a placeholder");
    result.set(filename, content);
  }
  return result;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function jsonObject(value: unknown, field: string): Record<string, unknown> {
  assert.ok(isPlainRecord(value), "Expected JSON object at " + field);
  return value;
}

export function jsonArray(value: unknown, field: string): readonly unknown[] {
  assert.ok(Array.isArray(value), "Expected JSON array at " + field);
  return value;
}

export function property(parent: unknown, field: string): Record<string, unknown> {
  const o = jsonObject(parent, "parent");
  const members = jsonObject(o.properties, "properties");
  assert.ok(Object.hasOwn(members, field), "Missing provider field: " + field);
  return jsonObject(members[field], field);
}

export function fieldsRequired(parent: unknown): readonly unknown[] {
  return jsonArray(jsonObject(parent, "schema").required, "required");
}

export function isNullable(schema: unknown): boolean {
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

export function isNullableString(schema: unknown): boolean {
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

export function verifyGeminiWhitelist(value: unknown, where = "root"): void {
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

export function verifyDeepInfraStrict(value: unknown, where = "root"): void {
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

/** Pure, source-derived synthetic provider response fixture. No transport or calls. */
export function makeSyntheticSmsProviderReply(): {
  readonly fixture: ReturnType<typeof makeSmsV2Response>;
  readonly modelResponse: Pick<
    ReturnType<typeof makeSmsV2Response>,
    "reviewContractVersion" | "transactions" | "suggestedAccounts"
  >;
} {
  const fixture = makeSmsV2Response();
  return {
    fixture,
    modelResponse: {
      reviewContractVersion: fixture.reviewContractVersion,
      transactions: fixture.transactions,
      suggestedAccounts: fixture.suggestedAccounts,
    },
  };
}
