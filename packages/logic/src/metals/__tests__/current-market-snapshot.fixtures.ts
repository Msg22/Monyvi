import { SUPPORTED_CURRENCIES } from "../../utils/currency-data";

export interface FixtureObservation {
  readonly id: string;
  readonly batchId: string;
  readonly capturedAt: string;
  readonly instrumentCode: string;
  readonly valueDecimal: string;
  readonly unit: string;
  readonly orientation: string;
  readonly providerObservedAt: string | null;
  readonly source: string | null;
  readonly quality: string;
}

export interface FixtureRoot {
  readonly goldUsdPerGram: string;
  readonly silverUsdPerGram: string;
  readonly platinumUsdPerGram: string;
  readonly palladiumUsdPerGram: string;
  readonly fiatUsdPerUnit: Readonly<Record<string, string>>;
  readonly providerMetalObservedAt: string | null;
  readonly providerCurrencyObservedAt: string | null;
}

export interface FixtureSnapshot {
  readonly snapshotId: string;
  readonly capturedAt: string;
  readonly root: FixtureRoot;
  readonly observations: readonly FixtureObservation[];
}

export const TRUSTED_PRODUCER_SOURCE = "metals.dev";

export const REQUIRED_INSTRUMENT_CODES: readonly string[] = [
  "metal:GOLD",
  "metal:SILVER",
  ...SUPPORTED_CURRENCIES.map(({ code }) => `currency:${code}`),
];

const SNAPSHOT_A_ID = "a0a0a0a0-0000-4000-8000-000000000001";
const SNAPSHOT_B_ID = "b0b0b0b0-0000-4000-8000-000000000002";
const SNAPSHOT_C_ID = "c0c0c0c0-0000-4000-8000-000000000003";

const SNAPSHOT_A_CAPTURED_AT = "2026-09-08T10:00:00.000Z";
const SNAPSHOT_B_CAPTURED_AT = "2026-09-09T10:00:00.000Z";

const SNAPSHOT_A_METAL_TIME = "2026-09-08T09:55:00.000Z";
const SNAPSHOT_A_CURRENCY_TIME = "2026-09-08T09:50:00.000Z";
const SNAPSHOT_B_METAL_TIME = "2026-09-09T09:55:00.000Z";
const SNAPSHOT_B_CURRENCY_TIME = "2026-09-09T09:50:00.000Z";

const FIAT_USD_PER_UNIT_A: Readonly<Record<string, string>> = {
  EGP: "0.0210523309",
  SAR: "0.2666480021",
  AED: "0.2722854563",
  KWD: "0.3255287081",
  QAR: "0.2747252747",
  BHD: "0.2650066252",
  OMR: "0.10000000000000001",
  JOD: "0.1408450704",
  IQD: "0.0007633588",
  LYD: "0.0002234475",
  TND: "0.3215434083",
  MAD: "0.0999014878",
  DZD: "0.0073624976",
  USD: "1",
  EUR: "1.1712000000",
  GBP: "1.2724000000",
  JPY: "0.0066780000",
  CHF: "1.1229000000",
  CNY: "0.1384200000",
  INR: "0.0113500000",
  KRW: "0.0007185000",
  KPW: "0.0011110000",
  SGD: "0.7431000000",
  HKD: "0.1282100000",
  MYR: "0.2234500000",
  AUD: "0.6572000000",
  NZD: "0.5983000000",
  CAD: "0.7296000000",
  SEK: "0.1052400000",
  NOK: "0.0941700000",
  DKK: "0.1571300000",
  ISK: "0.0075430000",
  TRY: "0.0258900000",
  RUB: "0.0110600000",
  ZAR: "0.0551800000",
};

const FIAT_USD_PER_UNIT_B: Readonly<Record<string, string>> = {
  ...FIAT_USD_PER_UNIT_A,
  EGP: "0.0210523310",
  DZD: "0.0073624977000000001",
  USD: "1",
};

function observationId(namespace: string, index: number): string {
  const serial = String(index + 1).padStart(12, "0");
  return `${namespace}-${namespace.slice(0, 4)}-4000-8000-${serial}`;
}

function buildSnapshot(
  snapshotId: string,
  namespace: string,
  capturedAt: string,
  metalTime: string | null,
  currencyTime: string | null,
  goldUsdPerGram: string,
  silverUsdPerGram: string,
  fiatUsdPerUnit: Readonly<Record<string, string>>
): FixtureSnapshot {
  const root: FixtureRoot = {
    goldUsdPerGram,
    silverUsdPerGram,
    platinumUsdPerGram: "1508.90000000",
    palladiumUsdPerGram: "1020.50000000",
    fiatUsdPerUnit,
    providerMetalObservedAt: metalTime,
    providerCurrencyObservedAt: currencyTime,
  };

  const observations: FixtureObservation[] = REQUIRED_INSTRUMENT_CODES.map(
    (instrumentCode, index): FixtureObservation => {
      const isMetal = instrumentCode.startsWith("metal:");
      const valueDecimal = isMetal
        ? instrumentCode === "metal:GOLD"
          ? goldUsdPerGram
          : silverUsdPerGram
        : fiatUsdPerUnit[instrumentCode.slice("currency:".length)];

      return Object.freeze({
        id: observationId(namespace, index),
        batchId: snapshotId,
        capturedAt,
        instrumentCode,
        valueDecimal,
        unit: isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit",
        orientation: "quote_per_base",
        providerObservedAt: isMetal ? metalTime : currencyTime,
        source: TRUSTED_PRODUCER_SOURCE,
        quality: "valid",
      });
    }
  );

  return Object.freeze({
    snapshotId,
    capturedAt,
    root: Object.freeze(root),
    observations: Object.freeze(observations),
  });
}

export function completeSnapshotA(): FixtureSnapshot {
  return buildSnapshot(
    SNAPSHOT_A_ID,
    "a0a0a0a0",
    SNAPSHOT_A_CAPTURED_AT,
    SNAPSHOT_A_METAL_TIME,
    SNAPSHOT_A_CURRENCY_TIME,
    "3738.74000000",
    "43.73874000",
    FIAT_USD_PER_UNIT_A
  );
}

export function completeSnapshotB(): FixtureSnapshot {
  return buildSnapshot(
    SNAPSHOT_B_ID,
    "b0b0b0b0",
    SNAPSHOT_B_CAPTURED_AT,
    SNAPSHOT_B_METAL_TIME,
    SNAPSHOT_B_CURRENCY_TIME,
    "3740.12000000",
    "43.90001000",
    FIAT_USD_PER_UNIT_B
  );
}

export function partialSnapshotC(): FixtureSnapshot {
  const base = buildSnapshot(
    SNAPSHOT_C_ID,
    "c0c0c0c0",
    "2026-09-09T12:00:00.000Z",
    SNAPSHOT_B_METAL_TIME,
    SNAPSHOT_B_CURRENCY_TIME,
    "3741.25000000",
    "43.91250000",
    FIAT_USD_PER_UNIT_B
  );
  return Object.freeze({
    ...base,
    observations: Object.freeze(
      base.observations.filter(
        ({ instrumentCode }) => instrumentCode !== "currency:EGP"
      )
    ),
  });
}

export function conflictingSnapshotA(): FixtureSnapshot {
  const base = completeSnapshotA();
  return Object.freeze({
    ...base,
    observations: Object.freeze(
      base.observations.map((observation) =>
        observation.instrumentCode === "metal:GOLD"
          ? Object.freeze({
              ...observation,
              valueDecimal: "3739.99000000",
            })
          : observation
      )
    ),
  });
}

export function snapshotWithoutObservation(
  snapshot: FixtureSnapshot,
  instrumentCode: string
): FixtureSnapshot {
  return Object.freeze({
    ...snapshot,
    observations: Object.freeze(
      snapshot.observations.filter(
        (observation) => observation.instrumentCode !== instrumentCode
      )
    ),
  });
}

export function snapshotWithObservationSource(
  snapshot: FixtureSnapshot,
  instrumentCode: string,
  source: string | null
): FixtureSnapshot {
  return Object.freeze({
    ...snapshot,
    observations: Object.freeze(
      snapshot.observations.map((observation) =>
        observation.instrumentCode === instrumentCode
          ? Object.freeze({ ...observation, source })
          : observation
      )
    ),
  });
}
