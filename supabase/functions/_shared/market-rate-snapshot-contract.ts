import { LosslessNumber, parse } from "lossless-json";
import { z } from "zod";

export type MarketRateSnapshotContractErrorCode =
  | "invalid_provider_shape"
  | "invalid_rate"
  | "snapshot_incomplete";

export class MarketRateSnapshotContractError extends Error {
  constructor(
    readonly code: MarketRateSnapshotContractErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "MarketRateSnapshotContractError";
  }
}

export interface MarketRateSnapshotObservation {
  readonly batchId: string;
  readonly capturedAt: string;
  readonly instrumentCode: string;
  readonly valueDecimal: string;
  readonly unit: string;
  readonly orientation: string;
  readonly providerObservedAt: string | null;
  readonly source: string;
  readonly quality: "valid";
}

export interface MarketRateRootExact {
  readonly goldUsdPerGram: string;
  readonly silverUsdPerGram: string;
  readonly platinumUsdPerGram: string;
  readonly palladiumUsdPerGram: string;
  readonly fiatUsdPerUnit: Readonly<Record<string, string>>;
  readonly providerMetalObservedAt: string | null;
  readonly providerCurrencyObservedAt: string | null;
}

export interface MarketRateSnapshotEnvelope {
  readonly snapshotId: string;
  readonly capturedAt: string;
  readonly root: MarketRateRootExact;
  readonly observations: readonly MarketRateSnapshotObservation[];
}

export interface BuildSnapshotEnvelopeInput {
  readonly rawResponseText: string;
  readonly snapshotId: string;
  readonly capturedAt: string;
}

export interface PersistRpcPayload {
  readonly p_snapshot_id: string;
  readonly p_captured_at: string;
  readonly p_root: MarketRateRootExact;
  readonly p_observations: readonly {
    readonly instrumentCode: string;
    readonly valueDecimal: string;
    readonly unit: string;
    readonly orientation: string;
    readonly providerObservedAt: string | null;
    readonly source: string;
    readonly quality: "valid";
  }[];
}

export const TRUSTED_PRODUCER_SOURCE = "metals.dev";

export const SUPPORTED_FIAT_CURRENCY_CODES: readonly string[] = [
  "EGP",
  "SAR",
  "AED",
  "KWD",
  "QAR",
  "BHD",
  "OMR",
  "JOD",
  "IQD",
  "LYD",
  "TND",
  "MAD",
  "DZD",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "CNY",
  "INR",
  "KRW",
  "KPW",
  "SGD",
  "HKD",
  "MYR",
  "AUD",
  "NZD",
  "CAD",
  "SEK",
  "NOK",
  "DKK",
  "ISK",
  "TRY",
  "RUB",
  "ZAR",
];

export const REQUIRED_INSTRUMENT_COUNT =
  2 + SUPPORTED_FIAT_CURRENCY_CODES.length;

const REQUIRED_METALS = ["gold", "silver", "platinum", "palladium"] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAIN_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const POSITIVE_PLAIN_DECIMAL = /^(?=.*[1-9])(?:0|[1-9]\d*)(?:\.\d+)?$/;
const EXPONENT_TOKEN = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/;

const positiveDecimalSchema = z
  .string()
  .regex(POSITIVE_PLAIN_DECIMAL, "expected positive plain decimal");
const decimalTimestampSchema = z.union([
  z.string().datetime({ offset: true }),
  z.null(),
]);

const observationInputSchema = z
  .object({
    instrumentCode: z
      .string()
      .regex(/^(?:metal:(?:GOLD|SILVER)|currency:[A-Z]{3})$/),
    valueDecimal: positiveDecimalSchema,
    unit: z.enum(["usd_per_pure_gram", "usd_per_currency_unit"]),
    orientation: z.literal("quote_per_base"),
    providerObservedAt: decimalTimestampSchema,
    source: z
      .string()
      .min(1)
      .refine((value) => value.trim().length > 0),
    quality: z.literal("valid"),
  })
  .strict();

const envelopeSchema = z
  .object({
    snapshotId: z.string().uuid(),
    capturedAt: z.string().datetime({ offset: true }),
    root: z
      .object({
        goldUsdPerGram: positiveDecimalSchema,
        silverUsdPerGram: positiveDecimalSchema,
        platinumUsdPerGram: positiveDecimalSchema,
        palladiumUsdPerGram: positiveDecimalSchema,
        fiatUsdPerUnit: z.record(
          z.string().regex(/^[A-Z]{3}$/),
          positiveDecimalSchema
        ),
        providerMetalObservedAt: decimalTimestampSchema,
        providerCurrencyObservedAt: decimalTimestampSchema,
      })
      .strict(),
    observations: z
      .array(
        z
          .object({
            batchId: z.string().uuid(),
            capturedAt: z.string().datetime({ offset: true }),
            instrumentCode: observationInputSchema.shape.instrumentCode,
            valueDecimal: positiveDecimalSchema,
            unit: observationInputSchema.shape.unit,
            orientation: observationInputSchema.shape.orientation,
            providerObservedAt: decimalTimestampSchema,
            source: z.string().min(1),
            quality: z.literal("valid"),
          })
          .strict()
      )
      .length(REQUIRED_INSTRUMENT_COUNT),
  })
  .strict();

export function parseLosslessJson(text: string): unknown {
  try {
    return parse(text);
  } catch {
    throw new MarketRateSnapshotContractError("invalid_provider_shape");
  }
}

export function normalizeDecimalToken(token: string): string {
  const match = EXPONENT_TOKEN.exec(token);
  if (!match) {
    return token;
  }

  const [, sign, intDigits, fracDigits = "", exponentText] = match;
  const exponent = Number.parseInt(exponentText, 10);
  const digits = `${intDigits}${fracDigits}`;
  const dotPosition = intDigits.length + exponent;

  let plain: string;
  if (dotPosition <= 0) {
    plain = `0.${"0".repeat(-dotPosition)}${digits}`;
  } else if (dotPosition >= digits.length) {
    plain = `${digits}${"0".repeat(dotPosition - digits.length)}`;
  } else {
    plain = `${digits.slice(0, dotPosition)}.${digits.slice(dotPosition)}`;
  }

  return sign === "-" ? `-${plain}` : plain;
}

export function normalizeProviderObservedAt(
  rawValue: string | null | undefined,
  capturedAt: Date
): string | null {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return null;
  }

  const observedMs = Date.parse(rawValue);
  if (!Number.isFinite(observedMs) || observedMs > capturedAt.getTime()) {
    return null;
  }

  return rawValue;
}

export function buildMarketRateSnapshotEnvelope(
  input: BuildSnapshotEnvelopeInput
): MarketRateSnapshotEnvelope {
  const capturedAtMs = Date.parse(input.capturedAt);
  if (!Number.isFinite(capturedAtMs)) {
    throw new MarketRateSnapshotContractError("invalid_provider_shape");
  }
  const capturedDate = new Date(capturedAtMs);

  const parsed = parseLosslessJson(input.rawResponseText);
  const document = requireRecord(parsed);
  if (document["status"] !== "success") {
    throw new MarketRateSnapshotContractError("invalid_provider_shape");
  }

  const metals = requireRecord(document["metals"]);
  const currencies = requireRecord(document["currencies"]);
  const timestamps =
    document["timestamps"] === undefined || document["timestamps"] === null
      ? {}
      : requireRecord(document["timestamps"]);

  const root = buildRoot(metals, currencies, timestamps, capturedDate);
  const observations = buildObservations(input, root);

  const envelope: MarketRateSnapshotEnvelope = Object.freeze({
    snapshotId: input.snapshotId,
    capturedAt: input.capturedAt,
    root,
    observations: Object.freeze(observations),
  });

  try {
    envelopeSchema.parse(envelope);
  } catch (error) {
    if (error instanceof MarketRateSnapshotContractError) {
      throw error;
    }
    throw new MarketRateSnapshotContractError("invalid_provider_shape");
  }

  return envelope;
}

export function buildPersistRpcPayload(
  envelope: MarketRateSnapshotEnvelope
): PersistRpcPayload {
  return {
    p_snapshot_id: envelope.snapshotId,
    p_captured_at: envelope.capturedAt,
    p_root: envelope.root,
    p_observations: envelope.observations.map((observation) => ({
      instrumentCode: observation.instrumentCode,
      valueDecimal: observation.valueDecimal,
      unit: observation.unit,
      orientation: observation.orientation,
      providerObservedAt: observation.providerObservedAt,
      source: observation.source,
      quality: observation.quality,
    })),
  };
}

function buildRoot(
  metals: Record<string, unknown>,
  currencies: Record<string, unknown>,
  timestamps: Record<string, unknown>,
  capturedDate: Date
): MarketRateRootExact {
  const fiatUsdPerUnit: Record<string, string> = {};

  for (const code of SUPPORTED_FIAT_CURRENCY_CODES) {
    if (code === "USD") {
      continue;
    }
    if (!(code in currencies)) {
      throw new MarketRateSnapshotContractError("snapshot_incomplete");
    }
    fiatUsdPerUnit[code] = extractPositiveRate(currencies[code], code);
  }

  const usdToken = extractDecimalToken(currencies["USD"]);
  if (usdToken !== "1") {
    throw new MarketRateSnapshotContractError("invalid_rate");
  }

  const btcToken =
    "BTC" in currencies
      ? extractPositiveRate(currencies["BTC"], "BTC")
      : undefined;
  if (btcToken !== undefined) {
    fiatUsdPerUnit["BTC"] = btcToken;
  }

  return Object.freeze({
    goldUsdPerGram: extractPositiveRate(metals["gold"], "gold"),
    silverUsdPerGram: extractPositiveRate(metals["silver"], "silver"),
    platinumUsdPerGram: extractPositiveRate(metals["platinum"], "platinum"),
    palladiumUsdPerGram: extractPositiveRate(metals["palladium"], "palladium"),
    fiatUsdPerUnit: Object.freeze(fiatUsdPerUnit),
    providerMetalObservedAt: normalizeProviderObservedAt(
      asOptionalString(timestamps["metal"]),
      capturedDate
    ),
    providerCurrencyObservedAt: normalizeProviderObservedAt(
      asOptionalString(timestamps["currency"]),
      capturedDate
    ),
  });
}

function buildObservations(
  input: BuildSnapshotEnvelopeInput,
  root: MarketRateRootExact
): MarketRateSnapshotObservation[] {
  const providerTime = root.providerMetalObservedAt;
  const currencyTime = root.providerCurrencyObservedAt;
  const observations: MarketRateSnapshotObservation[] = [];

  const metals: readonly [string, string][] = [
    ["metal:GOLD", root.goldUsdPerGram],
    ["metal:SILVER", root.silverUsdPerGram],
  ];
  for (const [instrumentCode, valueDecimal] of metals) {
    observations.push(
      Object.freeze({
        batchId: input.snapshotId,
        capturedAt: input.capturedAt,
        instrumentCode,
        valueDecimal,
        unit: "usd_per_pure_gram",
        orientation: "quote_per_base",
        providerObservedAt: providerTime,
        source: TRUSTED_PRODUCER_SOURCE,
        quality: "valid",
      })
    );
  }

  for (const code of SUPPORTED_FIAT_CURRENCY_CODES) {
    const valueDecimal = code === "USD" ? "1" : root.fiatUsdPerUnit[code];
    observations.push(
      Object.freeze({
        batchId: input.snapshotId,
        capturedAt: input.capturedAt,
        instrumentCode: `currency:${code}`,
        valueDecimal,
        unit: "usd_per_currency_unit",
        orientation: "quote_per_base",
        providerObservedAt: currencyTime,
        source: TRUSTED_PRODUCER_SOURCE,
        quality: "valid",
      })
    );
  }

  return observations;
}

function extractPositiveRate(raw: unknown, label: string): string {
  const token = extractDecimalToken(raw);
  const normalized = normalizeDecimalToken(token);
  if (!POSITIVE_PLAIN_DECIMAL.test(normalized)) {
    throw new MarketRateSnapshotContractError("invalid_rate", label);
  }
  return normalized;
}

function extractDecimalToken(raw: unknown): string {
  if (raw instanceof LosslessNumber) {
    return String(raw);
  }
  if (typeof raw === "string") {
    throw new MarketRateSnapshotContractError("invalid_rate");
  }
  throw new MarketRateSnapshotContractError("invalid_rate");
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new MarketRateSnapshotContractError("invalid_provider_shape");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
