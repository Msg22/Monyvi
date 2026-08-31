export const ACTION_REGISTRY_ERROR_CODES = {
  DUPLICATE_DEFINITION: "financial_action_duplicate_definition",
  UNKNOWN_DEFINITION: "financial_action_unknown_definition",
  INVALID_PAYLOAD: "financial_action_invalid_payload",
} as const;

export const MAX_CANONICAL_FINANCIAL_DIGITS = 50;
export const MAX_CANONICAL_DECIMAL_SCALE = 18;
export const MAX_ACTION_NOTES_UTF8_BYTES = 4096;
export const MAX_ACTION_RATE_REFERENCE_IDS = 16;
export const MAX_CANONICAL_ACTION_UTF8_BYTES = 65536;

export type CanonicalJsonValue =
  | string
  | boolean
  | null
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

export interface RegisteredActionPayload {
  readonly [key: string]: CanonicalJsonValue;
}

export interface MetalsSellPayloadV1 extends RegisteredActionPayload {
  readonly feeMinorUnits: string;
  readonly grossProceedsDecimal: string;
  readonly holdingId: string;
  readonly includeAccountCredit: boolean;
  readonly netProceedsMinorUnits: string;
  readonly notes: string;
  readonly rateReferenceIds: readonly string[];
}

export interface FinancialActionDefinition {
  readonly domain: string;
  readonly kind: string;
  readonly payloadVersion: string;
  readonly validatePayload: (value: unknown) => RegisteredActionPayload;
}

export interface FinancialActionRegistry {
  readonly definitions: readonly FinancialActionDefinition[];
  readonly resolve: (
    domain: string,
    kind: string,
    payloadVersion: string
  ) => FinancialActionDefinition;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const POSITIVE_DECIMAL_PATTERN =
  /^(?:[1-9][0-9]*|(?:0|[1-9][0-9]*)\.[0-9]*[1-9])$/;
const NON_NEGATIVE_MINOR_UNITS_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const METALS_SELL_PAYLOAD_KEYS = [
  "feeMinorUnits",
  "grossProceedsDecimal",
  "holdingId",
  "includeAccountCredit",
  "netProceedsMinorUnits",
  "notes",
  "rateReferenceIds",
] as const;

function fail(code: string): never {
  throw new Error(code);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[]
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpected.length &&
    actualKeys.every((key, index) => key === sortedExpected[index])
  );
}

export function getFinancialActionUtf8ByteLength(value: string): number {
  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      byteLength += 1;
    } else if (codeUnit <= 0x7ff) {
      byteLength += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        byteLength += 4;
        index += 1;
      } else {
        byteLength += 3;
      }
    } else {
      byteLength += 3;
    }
  }
  return byteLength;
}

export function isCanonicalPositiveFinancialDecimal(value: string): boolean {
  if (!POSITIVE_DECIMAL_PATTERN.test(value)) return false;
  const [integerPart, fractionalPart = ""] = value.split(".");
  return (
    integerPart.length + fractionalPart.length <= MAX_CANONICAL_FINANCIAL_DIGITS &&
    fractionalPart.length <= MAX_CANONICAL_DECIMAL_SCALE
  );
}

export function isCanonicalNonNegativeMinorUnits(value: string): boolean {
  return (
    NON_NEGATIVE_MINOR_UNITS_PATTERN.test(value) &&
    value.length <= MAX_CANONICAL_FINANCIAL_DIGITS
  );
}

function validateMetalsSellPayload(value: unknown): MetalsSellPayloadV1 {
  if (!isPlainObject(value) || !hasExactKeys(value, METALS_SELL_PAYLOAD_KEYS)) {
    fail(ACTION_REGISTRY_ERROR_CODES.INVALID_PAYLOAD);
  }
  if (
    typeof value.feeMinorUnits !== "string" ||
    !isCanonicalNonNegativeMinorUnits(value.feeMinorUnits) ||
    typeof value.grossProceedsDecimal !== "string" ||
    !isCanonicalPositiveFinancialDecimal(value.grossProceedsDecimal) ||
    typeof value.holdingId !== "string" ||
    !UUID_PATTERN.test(value.holdingId) ||
    value.includeAccountCredit !== false ||
    typeof value.netProceedsMinorUnits !== "string" ||
    !isCanonicalNonNegativeMinorUnits(value.netProceedsMinorUnits) ||
    typeof value.notes !== "string" ||
    getFinancialActionUtf8ByteLength(value.notes) > MAX_ACTION_NOTES_UTF8_BYTES ||
    !Array.isArray(value.rateReferenceIds) ||
    value.rateReferenceIds.length > MAX_ACTION_RATE_REFERENCE_IDS ||
    !value.rateReferenceIds.every(
      (referenceId) =>
        typeof referenceId === "string" && UUID_PATTERN.test(referenceId)
    )
  ) {
    fail(ACTION_REGISTRY_ERROR_CODES.INVALID_PAYLOAD);
  }
  return {
    feeMinorUnits: value.feeMinorUnits,
    grossProceedsDecimal: value.grossProceedsDecimal,
    holdingId: value.holdingId,
    includeAccountCredit: value.includeAccountCredit,
    netProceedsMinorUnits: value.netProceedsMinorUnits,
    notes: value.notes,
    rateReferenceIds: [...value.rateReferenceIds],
  };
}

function registryKey(
  domain: string,
  kind: string,
  payloadVersion: string
): string {
  return `${domain}\u0000${kind}\u0000${payloadVersion}`;
}

export function createFinancialActionRegistry(
  definitions: readonly FinancialActionDefinition[]
): FinancialActionRegistry {
  const registered = new Map<string, FinancialActionDefinition>();
  const immutableDefinitions = definitions.map((definition) => {
    const immutableDefinition = Object.freeze({ ...definition });
    const key = registryKey(
      immutableDefinition.domain,
      immutableDefinition.kind,
      immutableDefinition.payloadVersion
    );
    if (registered.has(key)) {
      fail(ACTION_REGISTRY_ERROR_CODES.DUPLICATE_DEFINITION);
    }
    registered.set(key, immutableDefinition);
    return immutableDefinition;
  });

  const registry: FinancialActionRegistry = {
    definitions: Object.freeze(immutableDefinitions),
    resolve: (domain, kind, payloadVersion) => {
      const definition = registered.get(registryKey(domain, kind, payloadVersion));
      if (!definition) fail(ACTION_REGISTRY_ERROR_CODES.UNKNOWN_DEFINITION);
      return definition;
    },
  };
  return Object.freeze(registry);
}

export const DEFAULT_FINANCIAL_ACTION_REGISTRY = createFinancialActionRegistry([
  {
    domain: "metals",
    kind: "sell",
    payloadVersion: "metals.sell/v1",
    validatePayload: validateMetalsSellPayload,
  },
]);
