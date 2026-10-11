import { Decimal } from "decimal.js";
import { LosslessNumber, parse } from "lossless-json";
import {
  HistoricalMetalRateContractError,
  type HistoricalDailyRateRecordPayload,
} from "./historical-metal-rate-contract.ts";
import {
  REQUIRED_INSTRUMENT_COUNT,
  SUPPORTED_FIAT_CURRENCY_CODES,
  normalizeDecimalToken,
} from "./market-rate-snapshot-contract.ts";

interface SnapshotCandidate {
  readonly id: string;
  readonly createdAt: number;
  readonly metalAt: string;
  readonly currencyAt: string;
  readonly gold: string;
  readonly silver: string;
  readonly currencies: Readonly<Record<string, string>>;
  readonly source: string;
}
export interface BuildHistoricalSnapshotRateRecordInput {
  readonly rawRootResponseText: string;
  readonly rawObservationResponseText: string;
  readonly requestedDate: string;
  readonly fetchedAt: string;
  readonly responseDigest: string;
}
const RateDecimal = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_EVEN,
});
const TROY_OUNCE_GRAMS = "31.1034768";

export function buildHistoricalSnapshotRateRecord(
  input: BuildHistoricalSnapshotRateRecordInput
): HistoricalDailyRateRecordPayload {
  if (
    !isDate(input.requestedDate) ||
    !Number.isFinite(Date.parse(input.fetchedAt)) ||
    !/^[0-9a-f]{64}$/i.test(input.responseDigest)
  )
    invalid();
  const roots = rows(input.rawRootResponseText);
  const observations = rows(input.rawObservationResponseText);
  const candidates = roots
    .flatMap((root): readonly SnapshotCandidate[] => {
      try {
        const candidate = qualifyRoot(root, observations, input.requestedDate);
        return candidate === null ? [] : [candidate];
      } catch (error: unknown) {
        if (error instanceof HistoricalMetalRateContractError) return [];
        throw error;
      }
    })
    .sort(compareCandidates);
  const selected = candidates[0];
  if (!selected) throw new HistoricalMetalRateContractError("date_unavailable");
  return Object.freeze({
    contractVersion: 1,
    providerKey: selected.source,
    rateDate: input.requestedDate,
    resolution: "snapshot",
    snapshotId: selected.id,
    metalProviderObservedAt: selected.metalAt,
    currencyProviderObservedAt: selected.currencyAt,
    goldUsdPerPureGramDecimal: selected.gold,
    silverUsdPerPureGramDecimal: selected.silver,
    goldUsdPerTroyOunceDecimal: toTroyOunce(selected.gold),
    silverUsdPerTroyOunceDecimal: toTroyOunce(selected.silver),
    currenciesUsdPerUnit: Object.freeze(selected.currencies),
    providerResponseTimestamp: null,
    fetchedAt: input.fetchedAt,
    responseDigest: input.responseDigest.toLowerCase(),
    source: selected.source,
    quality: "valid",
  });
}

function qualifyRoot(
  root: Readonly<Record<string, unknown>>,
  allAtoms: readonly Readonly<Record<string, unknown>>[],
  date: string
): SnapshotCandidate | null {
  const id = text(root.id);
  const metalAt = timestamp(root.timestamp_metal, date);
  const currencyAt = timestamp(root.timestamp_currency, date);
  if (!id || !metalAt || !currencyAt) return null;
  const createdAt =
    typeof root.created_at === "string" ? Date.parse(root.created_at) : NaN;
  if (!Number.isFinite(createdAt)) return null;
  const atoms = allAtoms.filter((row) => row.batch_id === id);
  const values =
    atoms.length === 0
      ? legacyValues(root)
      : canonicalValues(atoms, metalAt, currencyAt, date);
  return { id, metalAt, currencyAt, createdAt, ...values };
}

function legacyValues(
  root: Readonly<Record<string, unknown>>
): Pick<SnapshotCandidate, "gold" | "silver" | "currencies" | "source"> {
  const currencies: Record<string, string> = { USD: "1" };
  for (const code of SUPPORTED_FIAT_CURRENCY_CODES) {
    if (code === "USD") continue;
    const column = code.toLowerCase() + "_usd";
    if (root[column] !== undefined && root[column] !== null)
      currencies[code] = rate(root[column]);
  }
  return {
    gold: rate(root.gold_usd_per_gram),
    silver: rate(root.silver_usd_per_gram),
    currencies,
    source: "remote_market_rates",
  };
}

function canonicalValues(
  atoms: readonly Readonly<Record<string, unknown>>[],
  metalAt: string,
  currencyAt: string,
  date: string
): Pick<SnapshotCandidate, "gold" | "silver" | "currencies" | "source"> {
  if (atoms.length !== REQUIRED_INSTRUMENT_COUNT) invalid();
  const instruments = new Map<string, string>();
  const currencies: Record<string, string> = {};
  let source: string | null = null;
  for (const atom of atoms) {
    const code = text(atom.instrument_code);
    const atomSource = text(atom.source);
    const isMetal = code === "metal:GOLD" || code === "metal:SILVER";
    const currency = code?.startsWith("currency:") ? code.slice(9) : null;
    if (
      !code ||
      (!isMetal &&
        (currency === null ||
          (!SUPPORTED_FIAT_CURRENCY_CODES.includes(currency) &&
            currency !== "BTC"))) ||
      instruments.has(code) ||
      !atomSource ||
      (source !== null && source !== atomSource) ||
      atom.quality !== "valid" ||
      atom.orientation !== "quote_per_base" ||
      atom.unit !== (isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit") ||
      timestamp(atom.provider_observed_at, date) !==
        (isMetal ? metalAt : currencyAt)
    )
      invalid();
    const value = rate(atom.value_decimal);
    source = atomSource;
    instruments.set(code, value);
    if (currency !== null && SUPPORTED_FIAT_CURRENCY_CODES.includes(currency))
      currencies[currency] = value;
  }
  const gold = instruments.get("metal:GOLD"),
    silver = instruments.get("metal:SILVER");
  if (
    !gold ||
    !silver ||
    !source ||
    !instruments.has("currency:BTC") ||
    SUPPORTED_FIAT_CURRENCY_CODES.some(
      (code) => !instruments.has(`currency:${code}`)
    ) ||
    !currencies.USD ||
    !new RateDecimal(currencies.USD).equals(1)
  )
    invalid();
  currencies.USD = "1";
  return { gold, silver, currencies, source };
}

function compareCandidates(a: SnapshotCandidate, b: SnapshotCandidate): number {
  const aMetal = Date.parse(a.metalAt),
    aCurrency = Date.parse(a.currencyAt);
  const bMetal = Date.parse(b.metalAt),
    bCurrency = Date.parse(b.currencyAt);
  return (
    Math.min(bMetal, bCurrency) - Math.min(aMetal, aCurrency) ||
    Math.max(bMetal, bCurrency) - Math.max(aMetal, aCurrency) ||
    b.createdAt - a.createdAt ||
    b.id.localeCompare(a.id)
  );
}

function rows(raw: string): readonly Readonly<Record<string, unknown>>[] {
  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch {
    return invalid();
  }
  if (!Array.isArray(parsed)) invalid();
  return parsed.map((row: unknown): Readonly<Record<string, unknown>> => {
    if (typeof row !== "object" || row === null || Array.isArray(row))
      return invalid();
    return row as Record<string, unknown>;
  });
}

function rate(value: unknown): string {
  if (!(value instanceof LosslessNumber) && typeof value !== "string")
    invalid();
  let normalized: string;
  try {
    normalized = normalizeDecimalToken(String(value));
  } catch {
    return invalid();
  }
  if (!/^(?=.*[1-9])(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) invalid();
  return normalized;
}

function toTroyOunce(gram: string): string {
  return new RateDecimal(gram)
    .times(TROY_OUNCE_GRAMS)
    .toSignificantDigits(50)
    .toFixed();
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function timestamp(value: unknown, date: string): string | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    )
  )
    return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const part = (kind: Intl.DateTimeFormatPartTypes): string | undefined =>
    parts.find((item) => item.type === kind)?.value;
  return part("year") + "-" + part("month") + "-" + part("day") === date
    ? new Date(ms).toISOString()
    : null;
}

function isDate(value: string): boolean {
  const date = new Date(value + "T00:00:00Z");
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function invalid(): never {
  throw new HistoricalMetalRateContractError("invalid_rate");
}
