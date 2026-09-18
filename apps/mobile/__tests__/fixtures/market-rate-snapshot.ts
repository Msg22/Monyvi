import {
  CURRENCY_RATE_FIELD_BY_CURRENCY,
  SUPPORTED_CURRENCIES,
} from "@monyvi/logic";

export interface FixtureRootRow {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly goldUsdPerGram: number;
  readonly silverUsdPerGram: number;
  readonly platinumUsdPerGram: number;
  readonly palladiumUsdPerGram: number;
  readonly btcUsd: number;
  readonly timestampMetal: string | null;
  readonly timestampCurrency: string | null;
}

export interface FixtureObservationRow {
  readonly id: string;
  readonly batchId: string;
  readonly createdAt: Date;
  readonly instrumentCode: string;
  readonly valueDecimal: string | null;
  readonly unit: string;
  readonly orientation: string;
  readonly providerObservedAt: Date | null;
  readonly source: string | null;
  readonly quality: string;
}

export const TRUSTED_PRODUCER_SOURCE = "metals.dev";

export const REQUIRED_INSTRUMENT_CODES: readonly string[] = [
  "metal:GOLD",
  "metal:SILVER",
  ...SUPPORTED_CURRENCIES.map(({ code }) => `currency:${code}`),
];

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

export const SNAPSHOT_A_ID = "a0a0a0a0-0000-4000-8000-000000000001";
export const SNAPSHOT_B_ID = "b0b0b0b0-0000-4000-8000-000000000002";
export const SNAPSHOT_C_ID = "c0c0c0c0-0000-4000-8000-000000000003";
export const SNAPSHOT_Z_ID = "z0z0z0z0-0000-4000-8000-000000000009";

const SNAPSHOT_A_CREATED_AT = new Date("2026-09-08T10:00:00.000Z");
const SNAPSHOT_B_CREATED_AT = new Date("2026-09-09T10:00:00.000Z");
const SNAPSHOT_Z_CREATED_AT = new Date("2026-09-07T10:00:00.000Z");

const SNAPSHOT_A_METAL_TIME = "2026-09-08T09:55:00.000Z";
const SNAPSHOT_A_CURRENCY_TIME = "2026-09-08T09:50:00.000Z";
const SNAPSHOT_B_METAL_TIME = "2026-09-09T09:55:00.000Z";
const SNAPSHOT_B_CURRENCY_TIME = "2026-09-09T09:50:00.000Z";

interface BuildRowsOptions {
  readonly snapshotId: string;
  readonly namespace: string;
  readonly createdAt: Date;
  readonly metalTime: string | null;
  readonly currencyTime: string | null;
  readonly goldUsdPerGram: string;
  readonly silverUsdPerGram: string;
  readonly fiatUsdPerUnit: Readonly<Record<string, string>>;
  readonly divergentGoldUsdPerGram?: number;
  readonly observationOverrides?: Readonly<
    Record<
      string,
      Partial<
        Pick<
          FixtureObservationRow,
          "valueDecimal" | "source" | "quality" | "unit" | "orientation"
        >
      >
    >
  >;
}

function rowId(namespace: string, index: number): string {
  const serial = String(index + 1).padStart(12, "0");
  return `${namespace}-${namespace.slice(0, 4)}-4000-8000-${serial}`;
}

function wideRootFields(options: BuildRowsOptions): FixtureRootRow {
  const currencyFields: Record<string, number> = {};
  for (const [code, field] of Object.entries(CURRENCY_RATE_FIELD_BY_CURRENCY)) {
    const value =
      code === "USD" ? "1" : (options.fiatUsdPerUnit[code] ?? "0.5");
    currencyFields[field] = Number(value);
  }

  return {
    id: options.snapshotId,
    createdAt: options.createdAt,
    updatedAt: options.createdAt,
    goldUsdPerGram:
      options.divergentGoldUsdPerGram ?? Number(options.goldUsdPerGram),
    silverUsdPerGram: Number(options.silverUsdPerGram),
    platinumUsdPerGram: 1508.9,
    palladiumUsdPerGram: 1020.5,
    btcUsd: 95000.5,
    timestampMetal: options.metalTime,
    timestampCurrency: options.currencyTime,
    ...currencyFields,
  };
}

function buildObservations(options: BuildRowsOptions): FixtureObservationRow[] {
  return REQUIRED_INSTRUMENT_CODES.map(
    (instrumentCode, index): FixtureObservationRow => {
      const isMetal = instrumentCode.startsWith("metal:");
      const baseValue = isMetal
        ? instrumentCode === "metal:GOLD"
          ? options.goldUsdPerGram
          : options.silverUsdPerGram
        : options.fiatUsdPerUnit[instrumentCode.slice("currency:".length)];
      const override = options.observationOverrides?.[instrumentCode] ?? {};

      const providerTime = isMetal ? options.metalTime : options.currencyTime;

      return Object.freeze({
        id: rowId(options.namespace, index),
        batchId: options.snapshotId,
        createdAt: new Date(options.createdAt),
        instrumentCode,
        valueDecimal: override.valueDecimal ?? baseValue,
        unit:
          override.unit ??
          (isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit"),
        orientation: override.orientation ?? "quote_per_base",
        providerObservedAt:
          providerTime === null ? null : new Date(providerTime),
        source: override.source ?? TRUSTED_PRODUCER_SOURCE,
        quality: override.quality ?? "valid",
      });
    }
  );
}

function buildRows(options: BuildRowsOptions): {
  root: FixtureRootRow;
  observations: readonly FixtureObservationRow[];
} {
  const root = Object.freeze(wideRootFields(options));
  const observations = Object.freeze(buildObservations(options));
  return { root, observations };
}

export function createRootA(
  overrides: Partial<BuildRowsOptions> = {}
): FixtureRootRow {
  return buildRows(buildOptions(SNAPSHOT_A_ID, "a0a0a0a0", overrides)).root;
}

export function createObservationsA(
  overrides: Partial<BuildRowsOptions> = {}
): readonly FixtureObservationRow[] {
  return buildRows(buildOptions(SNAPSHOT_A_ID, "a0a0a0a0", overrides))
    .observations;
}

export function createRootB(
  overrides: Partial<BuildRowsOptions> = {}
): FixtureRootRow {
  return buildRows(buildOptions(SNAPSHOT_B_ID, "b0b0b0b0", overrides)).root;
}

export function createObservationsB(
  overrides: Partial<BuildRowsOptions> = {}
): readonly FixtureObservationRow[] {
  return buildRows(buildOptions(SNAPSHOT_B_ID, "b0b0b0b0", overrides))
    .observations;
}

function buildOptions(
  snapshotId: string,
  namespace: string,
  overrides: Partial<BuildRowsOptions>
): BuildRowsOptions {
  const defaults: BuildRowsOptions = {
    snapshotId,
    namespace,
    createdAt:
      snapshotId === SNAPSHOT_A_ID
        ? SNAPSHOT_A_CREATED_AT
        : SNAPSHOT_B_CREATED_AT,
    metalTime:
      snapshotId === SNAPSHOT_A_ID
        ? SNAPSHOT_A_METAL_TIME
        : SNAPSHOT_B_METAL_TIME,
    currencyTime:
      snapshotId === SNAPSHOT_A_ID
        ? SNAPSHOT_A_CURRENCY_TIME
        : SNAPSHOT_B_CURRENCY_TIME,
    goldUsdPerGram:
      snapshotId === SNAPSHOT_A_ID ? "3738.74000000" : "3740.12000000",
    silverUsdPerGram:
      snapshotId === SNAPSHOT_A_ID ? "43.73874000" : "43.90001000",
    fiatUsdPerUnit:
      snapshotId === SNAPSHOT_A_ID ? FIAT_USD_PER_UNIT_A : FIAT_USD_PER_UNIT_B,
  };
  return { ...defaults, ...overrides, snapshotId, namespace };
}

export function completeFixtureA(): {
  readonly roots: readonly FixtureRootRow[];
  readonly observations: readonly FixtureObservationRow[];
} {
  return {
    roots: [createRootA()],
    observations: createObservationsA(),
  };
}

export function newerIncompleteFixtureB(): {
  readonly roots: readonly FixtureRootRow[];
  readonly observations: readonly FixtureObservationRow[];
} {
  return {
    roots: [createRootA(), createRootB()],
    observations: [
      ...createObservationsA(),
      ...createObservationsB().filter(
        ({ instrumentCode }) => instrumentCode !== "currency:EGP"
      ),
    ],
  };
}

export function completeFixtureBOnTopOfA(): {
  readonly roots: readonly FixtureRootRow[];
  readonly observations: readonly FixtureObservationRow[];
} {
  return {
    roots: [createRootA(), createRootB()],
    observations: [...createObservationsA(), ...createObservationsB()],
  };
}

const FOREIGN_BATCH_ID = "deaddead-dead-4ead-bead-deaddeaddead";

export function crossBatchRepairFixture(): {
  readonly roots: readonly FixtureRootRow[];
  readonly observations: readonly FixtureObservationRow[];
} {
  const foreignEgpSource = createObservationsB().find(
    ({ instrumentCode }) => instrumentCode === "currency:EGP"
  );
  if (!foreignEgpSource) {
    throw new Error("fixture setup: missing currency:EGP observation");
  }
  const foreignEgpObservation = Object.freeze({
    ...foreignEgpSource,
    id: rowId("deadbeef", 900),
    batchId: FOREIGN_BATCH_ID,
  });
  return {
    roots: [createRootA(), createRootB()],
    observations: [
      ...createObservationsA(),
      ...createObservationsB().filter(
        ({ instrumentCode }) => instrumentCode !== "currency:EGP"
      ),
      foreignEgpObservation,
    ],
  };
}

export function duplicateInstrumentFixtureB(): {
  readonly roots: readonly FixtureRootRow[];
  readonly observations: readonly FixtureObservationRow[];
} {
  const duplicated = createObservationsB();
  return {
    roots: [createRootA(), createRootB()],
    observations: [
      ...createObservationsA(),
      ...duplicated,
      Object.freeze({
        ...duplicated[0],
        id: rowId("b0b0b0b0", 777),
        valueDecimal: "9999.99000000",
      }),
    ],
  };
}

export function sourceInvalidFixtureB(): {
  readonly roots: readonly FixtureRootRow[];
  readonly observations: readonly FixtureObservationRow[];
} {
  return {
    roots: [createRootA(), createRootB()],
    observations: [
      ...createObservationsA(),
      ...createObservationsB({
        observationOverrides: { "metal:SILVER": { source: "   " } },
      }),
    ],
  };
}

export function delayedOlderCompleteZ(): {
  readonly roots: readonly FixtureRootRow[];
  readonly observations: readonly FixtureObservationRow[];
} {
  const zRoot = Object.freeze(
    wideRootFields(
      buildOptions(SNAPSHOT_Z_ID, "z0z0z0z0", {
        createdAt: SNAPSHOT_Z_CREATED_AT,
        metalTime: "2026-09-07T09:55:00.000Z",
        currencyTime: "2026-09-07T09:50:00.000Z",
        goldUsdPerGram: "3700.10000000",
        silverUsdPerGram: "43.10000000",
      })
    )
  );
  const zObservations = buildObservations(
    buildOptions(SNAPSHOT_Z_ID, "z0z0z0z0", {
      createdAt: SNAPSHOT_Z_CREATED_AT,
      metalTime: "2026-09-07T09:55:00.000Z",
      currencyTime: "2026-09-07T09:50:00.000Z",
      goldUsdPerGram: "3700.10000000",
      silverUsdPerGram: "43.10000000",
    })
  ).map((observation, index) =>
    Object.freeze({
      ...observation,
      id: rowId("z0z0z0z0", index),
      createdAt: new Date("2026-09-09T13:00:00.000Z"),
    })
  );

  return {
    roots: [createRootB(), zRoot],
    observations: [...createObservationsB(), ...zObservations],
  };
}

export function nullProviderTimeFixtureA(): {
  readonly roots: readonly FixtureRootRow[];
  readonly observations: readonly FixtureObservationRow[];
} {
  return {
    roots: [createRootA({ metalTime: null, currencyTime: null })],
    observations: createObservationsA({
      metalTime: null,
      currencyTime: null,
    }),
  };
}

export function futureProviderTimeFixtureA(): {
  readonly roots: readonly FixtureRootRow[];
  readonly observations: readonly FixtureObservationRow[];
} {
  const futureTime = "2099-01-01T00:00:00.000Z";
  return {
    roots: [createRootA()],
    observations: createObservationsA({
      metalTime: futureTime,
      currencyTime: futureTime,
    }),
  };
}

export function divergentWideRootFixtureA(): {
  readonly roots: readonly FixtureRootRow[];
  readonly observations: readonly FixtureObservationRow[];
} {
  return {
    roots: [createRootA({ divergentGoldUsdPerGram: 0.01 })],
    observations: createObservationsA(),
  };
}

export function removeObservationByInstrument(
  observations: readonly FixtureObservationRow[],
  instrumentCode: string
): readonly FixtureObservationRow[] {
  return Object.freeze(
    observations.filter(
      (observation) => observation.instrumentCode !== instrumentCode
    )
  );
}
