import { SUPPORTED_FIAT_CURRENCY_CODES } from "../_shared/market-rate-snapshot-contract.ts";

export const DATE = "2026-10-10";
export const FETCHED_AT = "2026-10-11T15:00:00.000Z";
export const DIGEST =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
export const BATCH = "018f0c7a-1234-7abc-8def-000000000001";

export function root(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    id: BATCH,
    timestamp_metal: "2026-10-10T12:00:00.000Z",
    timestamp_currency: "2026-10-10T12:00:00.000Z",
    created_at: FETCHED_AT,
    gold_usd_per_gram: "100.123456789012345678901",
    silver_usd_per_gram: "1.25",
    egp_usd: "0.020000000000000001",
    eur_usd: "1.1",
    ...overrides,
  };
}

export function atom(
  instrument: string,
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    id: instrument,
    batch_id: BATCH,
    instrument_code: instrument,
    value_decimal:
      instrument === "metal:GOLD"
        ? "101.123456789012345678901"
        : instrument === "currency:EGP"
          ? "0.020000000000000001"
          : "1",
    unit: instrument.startsWith("metal:")
      ? "usd_per_pure_gram"
      : "usd_per_currency_unit",
    orientation: "quote_per_base",
    provider_observed_at: "2026-10-10T12:00:00.000Z",
    source: "stored-provider",
    quality: "valid",
    created_at: FETCHED_AT,
    ...overrides,
  };
}

export function atoms(): readonly Record<string, unknown>[] {
  return [
    "metal:GOLD",
    "metal:SILVER",
    ...SUPPORTED_FIAT_CURRENCY_CODES.map((code) => `currency:${code}`),
    "currency:BTC",
  ].map((code) => atom(code));
}

export function raw(rows: readonly Record<string, unknown>[]): string {
  return JSON.stringify(rows).replace(
    /"(value_decimal|gold_usd_per_gram|silver_usd_per_gram|egp_usd|eur_usd)":"([0-9.]+)"/g,
    '"$1":$2'
  );
}
