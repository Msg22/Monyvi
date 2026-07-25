export interface SmsCapabilitySafeguardPolicy {
  readonly isEnabled: boolean;
  readonly maxUnitsPerRequest: number;
  readonly maxUnitsPerRollingWindow: number;
  readonly rollingWindowMs: number;
  readonly maxProviderStartsPerBurst: number;
  readonly burstWindowMs: number;
}

export interface SmsFullParserSafeguardPolicy extends SmsCapabilitySafeguardPolicy {
  readonly maxUnitsPerScan: number;
  readonly maxPayloadBytes: number;
  readonly maxEstimatedInputTokens: number;
}

export interface SmsSafeguardPolicy {
  readonly version: number;
  readonly processingPolicyVersion: number;
  readonly lookbackDays: number;
  readonly checkpointOverlapMs: number;
  readonly canSelectCustomRange: boolean;
  readonly historyRescanEnabled: boolean;
  readonly historyCooldownMs: number;
  readonly reservationLeaseMs: number;
  readonly negativeStrikeThreshold: number;
  readonly fullParser: SmsFullParserSafeguardPolicy;
  readonly categoryEnrichment: SmsCapabilitySafeguardPolicy;
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const DEFAULT_SMS_SAFEGUARD_POLICY: SmsSafeguardPolicy = Object.freeze({
  version: 1,
  processingPolicyVersion: 1,
  lookbackDays: 30,
  checkpointOverlapMs: 5 * MINUTE_MS,
  canSelectCustomRange: false,
  historyRescanEnabled: true,
  historyCooldownMs: DAY_MS,
  reservationLeaseMs: 5 * MINUTE_MS,
  negativeStrikeThreshold: 3,
  fullParser: Object.freeze({
    isEnabled: true,
    maxUnitsPerRequest: 50,
    maxUnitsPerScan: 200,
    maxUnitsPerRollingWindow: 200,
    rollingWindowMs: DAY_MS,
    maxPayloadBytes: 128 * 1024,
    maxEstimatedInputTokens: 32_000,
    maxProviderStartsPerBurst: 30,
    burstWindowMs: MINUTE_MS,
  }),
  categoryEnrichment: Object.freeze({
    isEnabled: true,
    maxUnitsPerRequest: 20,
    maxUnitsPerRollingWindow: 100,
    rollingWindowMs: DAY_MS,
    maxProviderStartsPerBurst: 30,
    burstWindowMs: MINUTE_MS,
  }),
});

type GetEnvironmentValue = (name: string) => string | undefined;

function readOptionalEnvironmentBoolean(
  getEnvironmentValue: GetEnvironmentValue,
  name: string,
  fallback: boolean
): boolean {
  const rawValue = getEnvironmentValue(name);
  if (rawValue === undefined) return fallback;

  const normalizedValue = rawValue.trim().toLowerCase();
  if (normalizedValue === "true") return true;
  if (normalizedValue === "false") return false;
  throw new Error(`${name} must be true or false`);
}

export function readSmsSafeguardPolicyFromEnvironment(
  getEnvironmentValue: GetEnvironmentValue
): SmsSafeguardPolicy {
  return parseSmsSafeguardPolicy({
    ...DEFAULT_SMS_SAFEGUARD_POLICY,
    fullParser: {
      ...DEFAULT_SMS_SAFEGUARD_POLICY.fullParser,
      isEnabled: readOptionalEnvironmentBoolean(
        getEnvironmentValue,
        "SMS_FULL_PARSER_ENABLED",
        DEFAULT_SMS_SAFEGUARD_POLICY.fullParser.isEnabled
      ),
    },
    categoryEnrichment: {
      ...DEFAULT_SMS_SAFEGUARD_POLICY.categoryEnrichment,
      isEnabled: readOptionalEnvironmentBoolean(
        getEnvironmentValue,
        "SMS_CATEGORY_ENRICHMENT_ENABLED",
        DEFAULT_SMS_SAFEGUARD_POLICY.categoryEnrichment.isEnabled
      ),
    },
  });
}

function assertRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readBoolean(record: Record<string, unknown>, field: string): boolean {
  if (typeof record[field] !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return record[field];
}

function readInteger(
  record: Record<string, unknown>,
  field: string,
  minimum: number
): number {
  const value = record[field];
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new Error(
      `${field} must be an integer greater than or equal to ${minimum}`
    );
  }
  return value as number;
}

function parseCapabilityPolicy(
  value: unknown,
  label: string
): SmsCapabilitySafeguardPolicy {
  const record = assertRecord(value, label);
  return Object.freeze({
    isEnabled: readBoolean(record, "isEnabled"),
    maxUnitsPerRequest: readInteger(record, "maxUnitsPerRequest", 1),
    maxUnitsPerRollingWindow: readInteger(
      record,
      "maxUnitsPerRollingWindow",
      1
    ),
    rollingWindowMs: readInteger(record, "rollingWindowMs", 1),
    maxProviderStartsPerBurst: readInteger(
      record,
      "maxProviderStartsPerBurst",
      1
    ),
    burstWindowMs: readInteger(record, "burstWindowMs", 1),
  });
}

export function parseSmsSafeguardPolicy(value: unknown): SmsSafeguardPolicy {
  const record = assertRecord(value, "policy");
  const fullParserRecord = assertRecord(record.fullParser, "fullParser");
  const fullParser = Object.freeze({
    ...parseCapabilityPolicy(fullParserRecord, "fullParser"),
    maxUnitsPerScan: readInteger(fullParserRecord, "maxUnitsPerScan", 1),
    maxPayloadBytes: readInteger(fullParserRecord, "maxPayloadBytes", 1),
    maxEstimatedInputTokens: readInteger(
      fullParserRecord,
      "maxEstimatedInputTokens",
      1
    ),
  });

  if (fullParser.maxUnitsPerScan < fullParser.maxUnitsPerRequest) {
    throw new Error("maxUnitsPerScan must cover at least one request");
  }

  return Object.freeze({
    version: readInteger(record, "version", 1),
    processingPolicyVersion: readInteger(record, "processingPolicyVersion", 1),
    lookbackDays: readInteger(record, "lookbackDays", 1),
    checkpointOverlapMs: readInteger(record, "checkpointOverlapMs", 0),
    canSelectCustomRange: readBoolean(record, "canSelectCustomRange"),
    historyRescanEnabled: readBoolean(record, "historyRescanEnabled"),
    historyCooldownMs: readInteger(record, "historyCooldownMs", 1),
    reservationLeaseMs: readInteger(record, "reservationLeaseMs", 1),
    negativeStrikeThreshold: readInteger(record, "negativeStrikeThreshold", 2),
    fullParser,
    categoryEnrichment: parseCapabilityPolicy(
      record.categoryEnrichment,
      "categoryEnrichment"
    ),
  });
}
