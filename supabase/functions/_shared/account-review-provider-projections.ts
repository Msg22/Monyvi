/* GENERATED from canonical T009 Zod. Do not edit. */

import { z } from "zod";

import {
  ACCOUNT_REVIEW_CURRENCIES,
  accountReviewVoiceResponseV2Schema,
  accountReviewSmsResponseV2Schema,
} from "./account-review-parser-contract.ts";

type ProviderMode = "gemini" | "deepinfra";
type ProviderObject = Record<string, unknown>;
const MODEL_KEYWORDS = new Set<string>([
  "$schema",
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "format",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
  "pattern",
  "minLength",
  "maxLength",
  "uniqueItems",
  "default",
  "description",
  "title",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "anyOf",
  "oneOf",
]);
const MODEL_PRIMITIVES = new Set<string>([
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
  "null",
]);

function isProviderObject(value: unknown): value is ProviderObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaRecord(value: unknown, where: string): ProviderObject {
  if (!isProviderObject(value))
    throw new Error("Invalid canonical JSON Schema at " + where);
  return value;
}

function schemaRecords(value: unknown, where: string): ProviderObject[] {
  if (!Array.isArray(value))
    throw new Error("Invalid canonical array at " + where);
  return value.map((item: unknown) => schemaRecord(item, where + "[]"));
}

function collapseUnion(schema: ProviderObject): ProviderObject {
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants === undefined) return schema;
  const list = schemaRecords(variants, "union member");
  if (list.length < 2) throw new Error("Unrecognized provider union");
  const nonnull = list.filter((item) => item.type !== "null");
  if (nonnull.length === 1 && list.length === 2) {
    const part = collapseUnion(nonnull[0]);
    if (typeof part.type !== "string")
      throw new Error("Unsupported nullable union");
    const converted: ProviderObject = { ...part, type: [part.type, "null"] };
    if (part.enum !== undefined) {
      if (!Array.isArray(part.enum)) throw new Error("Non-array nullable enum");
      converted.enum = [...part.enum, null];
    }
    return converted;
  }
  if (
    nonnull.length === list.length &&
    list.every((item) => item.type === "string")
  ) {
    return { type: "string" };
  }
  throw new Error("Unrepresentable provider union; Zod remains authoritative");
}

function supportedType(value: unknown): string | string[] {
  const values: unknown[] = Array.isArray(value) ? value : [value];
  if (
    !values.every(
      (item): item is string =>
        typeof item === "string" && MODEL_PRIMITIVES.has(item)
    )
  ) {
    throw new Error("Unsupported provider JSON type");
  }
  return Array.isArray(value) ? values : values[0];
}

function projectCurrencyEnum(
  values: readonly unknown[],
  supported: readonly string[] | null
): readonly unknown[] {
  const present = values.filter((item) => item !== null);
  const canonical: readonly string[] = ACCOUNT_REVIEW_CURRENCIES;
  const isCurrency =
    present.length === canonical.length &&
    canonical.every((currency) => present.includes(currency));
  if (!isCurrency || supported === null) return values;
  return [...supported, ...(values.includes(null) ? [null] : [])];
}

function requiredFields(value: unknown, where: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item: unknown): item is string => typeof item === "string")
  ) {
    throw new Error("Invalid required keys at " + where);
  }
  return value;
}

function lowerProviderSchema(
  input: unknown,
  mode: ProviderMode,
  supported: readonly string[] | null,
  where: string
): ProviderObject {
  const schema = collapseUnion(schemaRecord(input, where));
  for (const keyword of Object.keys(schema)) {
    if (!MODEL_KEYWORDS.has(keyword))
      throw new Error(
        "Unsupported canonical keyword " + keyword + " at " + where
      );
  }
  const type = supportedType(schema.type);
  const result: ProviderObject = { type };
  const enumValues =
    schema.enum ?? (schema.const === undefined ? undefined : [schema.const]);
  if (enumValues !== undefined) {
    if (!Array.isArray(enumValues)) throw new Error("Non-array schema enum");
    result.enum = projectCurrencyEnum(enumValues, supported);
  }
  for (const keyword of [
    "format",
    "minimum",
    "maximum",
    "minItems",
    "maxItems",
  ]) {
    if (schema[keyword] !== undefined) result[keyword] = schema[keyword];
  }
  const kinds = Array.isArray(type) ? type : [type];
  if (kinds.includes("object"))
    return lowerObject(schema, result, mode, supported, where);
  if (kinds.includes("array")) {
    result.items = lowerProviderSchema(
      schema.items,
      mode,
      supported,
      where + "[]"
    );
  }
  return result;
}

function lowerObject(
  schema: ProviderObject,
  output: ProviderObject,
  mode: ProviderMode,
  supported: readonly string[] | null,
  where: string
): ProviderObject {
  if (schema.additionalProperties !== false)
    throw new Error("Open object " + where);
  const members = schemaRecord(schema.properties, where + ".properties");
  const required = requiredFields(schema.required, where);
  const projected: ProviderObject = {};
  for (const [name, value] of Object.entries(members)) {
    if (mode === "deepinfra" && !required.includes(name)) continue;
    projected[name] = lowerProviderSchema(
      value,
      mode,
      supported,
      where + "." + name
    );
  }
  for (const name of required) {
    if (!Object.hasOwn(projected, name))
      throw new Error("Lost required field " + where + "." + name);
  }
  output.properties = projected;
  output.required = mode === "deepinfra" ? Object.keys(projected) : required;
  output.additionalProperties = false;
  return output;
}

function canonicalInputSchema(validator: z.ZodType): ProviderObject {
  return schemaRecord(
    z.toJSONSchema(validator, {
      io: "input",
      reused: "inline",
      unrepresentable: "throw",
    }),
    "canonical input"
  );
}

export function buildAccountReviewGeminiResponseSchema(): ProviderObject {
  return lowerProviderSchema(
    canonicalInputSchema(accountReviewVoiceResponseV2Schema),
    "gemini",
    null,
    "Voice"
  );
}

export function buildAccountReviewDeepInfraResponseSchema(
  supportedCurrencies: readonly string[]
): ProviderObject {
  const canonical: readonly string[] = ACCOUNT_REVIEW_CURRENCIES;
  if (
    !Array.isArray(supportedCurrencies) ||
    supportedCurrencies.length < 1 ||
    supportedCurrencies.some((code) => !canonical.includes(code)) ||
    new Set(supportedCurrencies).size !== supportedCurrencies.length
  ) {
    throw new Error("Invalid supported SMS currency vocabulary");
  }
  return lowerProviderSchema(
    canonicalInputSchema(accountReviewSmsResponseV2Schema),
    "deepinfra",
    supportedCurrencies,
    "SMS"
  );
}
