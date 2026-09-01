import {
  createMetalsActionPayloadRegistry,
  type MetalsSellPayloadV1,
} from "./metals-action-payload-registry";

export const ACTION_REGISTRY_ERROR_CODES = {
  DUPLICATE_DEFINITION: "financial_action_duplicate_definition",
  UNKNOWN_DEFINITION: "financial_action_unknown_definition",
  INVALID_PAYLOAD: "financial_action_invalid_payload",
} as const;

export const MAX_CANONICAL_FINANCIAL_DIGITS = 50;
export const MAX_CANONICAL_DECIMAL_SCALE = 18;
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

export interface FinancialActionValidationInput {
  readonly cairoTodayDate?: string;
}

export interface FinancialActionDefinition {
  readonly domain: string;
  readonly kind: string;
  readonly payloadVersion: string;
  readonly validatePayload: (
    value: unknown,
    validationInput?: FinancialActionValidationInput
  ) => RegisteredActionPayload;
}

export interface FinancialActionRegistry {
  readonly definitions: readonly FinancialActionDefinition[];
  readonly resolve: (
    domain: string,
    kind: string,
    payloadVersion: string
  ) => FinancialActionDefinition;
}

export function getFinancialActionUtf8ByteLength(value: string): number {
  let byteLength = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    byteLength +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return byteLength;
}

export function isCanonicalPositiveFinancialDecimal(value: string): boolean {
  if (!/^(?:[1-9][0-9]*|(?:0|[1-9][0-9]*)\.[0-9]*[1-9])$/.test(value)) {
    return false;
  }
  const [integerPart, fractionalPart = ""] = value.split(".");
  return (
    integerPart.length + fractionalPart.length <=
      MAX_CANONICAL_FINANCIAL_DIGITS &&
    fractionalPart.length <= MAX_CANONICAL_DECIMAL_SCALE
  );
}

export function isCanonicalNonNegativeMinorUnits(value: string): boolean {
  return (
    /^(?:0|[1-9][0-9]*)$/.test(value) &&
    value.length <= MAX_CANONICAL_FINANCIAL_DIGITS
  );
}

function fail(code: string): never {
  throw new Error(code);
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
    if (registered.has(key))
      fail(ACTION_REGISTRY_ERROR_CODES.DUPLICATE_DEFINITION);
    registered.set(key, immutableDefinition);
    return immutableDefinition;
  });

  return Object.freeze({
    definitions: Object.freeze(immutableDefinitions),
    resolve: (
      domain: string,
      kind: string,
      payloadVersion: string
    ): FinancialActionDefinition => {
      const definition = registered.get(
        registryKey(domain, kind, payloadVersion)
      );
      if (!definition) fail(ACTION_REGISTRY_ERROR_CODES.UNKNOWN_DEFINITION);
      return definition;
    },
  });
}

const metalsRegistry = createMetalsActionPayloadRegistry({
  invalidPayloadCode: ACTION_REGISTRY_ERROR_CODES.INVALID_PAYLOAD,
  isCanonicalNonNegativeMinorUnits,
  isCanonicalPositiveFinancialDecimal,
  maxCanonicalFinancialDigits: MAX_CANONICAL_FINANCIAL_DIGITS,
  utf8ByteLength: getFinancialActionUtf8ByteLength,
});

export const MAX_ACTION_NAME_UTF8_BYTES = metalsRegistry.maxNameUtf8Bytes;
export const MAX_ACTION_REASON_UTF8_BYTES = metalsRegistry.maxReasonUtf8Bytes;
export const MAX_ACTION_NOTES_UTF8_BYTES = metalsRegistry.maxNotesUtf8Bytes;
export const MAX_ACTION_RATE_REFERENCE_IDS = metalsRegistry.maxRateReferenceIds;

/** @deprecated Registered only by explicit legacy-test registries, never by default. */
export type { MetalsSellPayloadV1 };

/** @deprecated Kept as an explicit legacy-registry validator; production uses sell/v2. */
export const validateMetalsSellPayloadV1 = metalsRegistry.validateLegacySellV1;

export const DEFAULT_FINANCIAL_ACTION_REGISTRY = createFinancialActionRegistry(
  metalsRegistry.definitions
);
