import type { CurrencyType, MarketRateObservation } from "@monyvi/db";
import {
  SUPPORTED_CURRENCIES,
  classifyRateTrust,
  isSupportedMetalsIsoCurrencyCode,
  validateAndNormalizeRateReference,
  type CurrencyInstrumentCode,
  type RateReferenceExpectation,
  type RateTrustResult,
} from "@monyvi/logic";
import { Q, type Database } from "@nozbe/watermelondb";

const V1_METAL_INSTRUMENT_CODES = ["metal:GOLD", "metal:SILVER"] as const;
const V1_CURRENCY_CODES = SUPPORTED_CURRENCIES.map(({ code }) => code).filter(
  isSupportedMetalsIsoCurrencyCode
);
const V1_CURRENCY_INSTRUMENT_CODES = V1_CURRENCY_CODES.map(
  (code) => `currency:${code}`
);
const V1_RATE_INSTRUMENT_CODES = [
  ...V1_METAL_INSTRUMENT_CODES,
  ...V1_CURRENCY_INSTRUMENT_CODES,
];

export interface LiveRatesTrustObservation {
  readonly id: string;
  readonly instrumentCode: string;
  readonly orientation: string;
  readonly source: string | null;
  readonly unit: string;
  readonly valueDecimal: string | null;
  readonly quality: string;
  readonly providerObservedAt: Date | null;
  readonly createdAt: Date;
}

export interface LiveRatesTrustReadModel {
  readonly gold: LiveRatesTrustValue;
  readonly silver: LiveRatesTrustValue;
  readonly currencies: ReadonlyMap<CurrencyType, LiveRatesTrustValue>;
}

export type LiveRatesTrustState = RateTrustResult["state"] | "invalid";

export interface LiveRatesTrustValue {
  readonly state: LiveRatesTrustState;
  readonly ageMs: number | null;
  readonly capturedAt?: Date | null;
  readonly providerObservedAt: Date | null;
  readonly quality?: string | null;
  readonly source?: string | null;
  readonly valueDecimal?: string | null;
}

const TRUST_SEVERITY: Readonly<Record<LiveRatesTrustState, number>> = {
  fresh: 0,
  stale: 1,
  unknown: 2,
  invalid: 3,
  missing: 4,
};

export interface LiveRatesTrustObserver {
  readonly next: (value: LiveRatesTrustReadModel) => void;
  readonly error?: (error: unknown) => void;
}

export interface LiveRatesTrustSubscription {
  readonly unsubscribe: () => void;
}

export interface LiveRatesTrustObservationStream {
  refresh(): void;
  subscribe(observer: LiveRatesTrustObserver): LiveRatesTrustSubscription;
}

export function buildLiveRatesTrustReadModel(
  observations: readonly LiveRatesTrustObservation[],
  nowMs: number
): LiveRatesTrustReadModel {
  const latestByInstrument = getLatestByInstrument(observations);

  return {
    gold: classifyObservationTrust(
      latestByInstrument.get("metal:GOLD") ?? null,
      nowMs
    ),
    silver: classifyObservationTrust(
      latestByInstrument.get("metal:SILVER") ?? null,
      nowMs
    ),
    currencies: buildCurrencyTrust(latestByInstrument, nowMs),
  };
}

export function summarizeLiveRatesTrust(
  results: Iterable<LiveRatesTrustValue>
): LiveRatesTrustState {
  let hasResult = false;
  let summary: LiveRatesTrustState = "fresh";

  for (const result of results) {
    hasResult = true;
    if (TRUST_SEVERITY[result.state] > TRUST_SEVERITY[summary]) {
      summary = result.state;
    }
  }

  return hasResult ? summary : "missing";
}

export function observeLiveRatesTrust(
  database: Database,
  getNowMs: () => number = Date.now
): LiveRatesTrustObservationStream {
  const collection = database.get<MarketRateObservation>(
    "market_rate_observations"
  );
  const refreshers = new Set<() => void>();

  return {
    refresh(): void {
      for (const refresh of refreshers) refresh();
    },
    subscribe(observer: LiveRatesTrustObserver): LiveRatesTrustSubscription {
      const latestByInstrument = new Map<string, MarketRateObservation>();
      const initializedInstruments = new Set<string>();
      const emit = (): void => {
        if (initializedInstruments.size !== V1_RATE_INSTRUMENT_CODES.length) {
          return;
        }
        observer.next(
          buildLiveRatesTrustReadModel(
            Array.from(latestByInstrument.values()),
            getNowMs()
          )
        );
      };
      refreshers.add(emit);
      const subscriptions = V1_RATE_INSTRUMENT_CODES.map((instrumentCode) => {
        const query = collection.query(
          Q.where("instrument_code", instrumentCode),
          Q.sortBy("created_at", Q.desc),
          Q.sortBy("id", Q.desc),
          Q.take(1)
        );
        return query.observe().subscribe({
          next: (observations): void => {
            const latest = observations[0];
            if (latest === undefined) {
              latestByInstrument.delete(instrumentCode);
            } else {
              latestByInstrument.set(instrumentCode, latest);
            }
            initializedInstruments.add(instrumentCode);
            emit();
          },
          error: (error: unknown): void => observer.error?.(error),
        });
      });
      return {
        unsubscribe: (): void => {
          refreshers.delete(emit);
          for (const subscription of subscriptions) subscription.unsubscribe();
        },
      };
    },
  };
}

function getLatestByInstrument(
  observations: readonly LiveRatesTrustObservation[]
): ReadonlyMap<string, LiveRatesTrustObservation> {
  const latest = new Map<string, LiveRatesTrustObservation>();

  for (const observation of observations) {
    const current = latest.get(observation.instrumentCode);
    if (!current || isNewerObservation(observation, current)) {
      latest.set(observation.instrumentCode, observation);
    }
  }

  return latest;
}

function isNewerObservation(
  candidate: LiveRatesTrustObservation,
  current: LiveRatesTrustObservation
): boolean {
  const candidateCapturedAt = candidate.createdAt.getTime();
  const currentCapturedAt = current.createdAt.getTime();

  if (candidateCapturedAt === currentCapturedAt) {
    return candidate.id.localeCompare(current.id) > 0;
  }
  if (!Number.isFinite(candidateCapturedAt)) return true;
  if (!Number.isFinite(currentCapturedAt)) return false;
  return candidateCapturedAt > currentCapturedAt;
}

function buildCurrencyTrust(
  latestByInstrument: ReadonlyMap<string, LiveRatesTrustObservation>,
  nowMs: number
): ReadonlyMap<CurrencyType, LiveRatesTrustValue> {
  const currencies = new Map<CurrencyType, LiveRatesTrustValue>();

  for (const currencyCode of V1_CURRENCY_CODES) {
    currencies.set(
      currencyCode,
      classifyObservationTrust(
        latestByInstrument.get(`currency:${currencyCode}`) ?? null,
        nowMs
      )
    );
  }

  return currencies;
}

function classifyObservationTrust(
  observation: LiveRatesTrustObservation | null,
  nowMs: number
): LiveRatesTrustValue {
  if (!observation) {
    return {
      state: "missing",
      ageMs: null,
      capturedAt: null,
      providerObservedAt: null,
      quality: null,
      source: null,
      valueDecimal: null,
    };
  }

  const normalizedValueDecimal = normalizeObservationValue(observation);
  if (normalizedValueDecimal === null) {
    return {
      state: "invalid",
      ageMs: null,
      capturedAt: copyValidDate(observation.createdAt),
      providerObservedAt: observation.providerObservedAt,
      quality: observation.quality,
      source: observation.source,
      valueDecimal: null,
    };
  }

  const result = classifyRateTrust(
    {
      valueDecimal: normalizedValueDecimal,
      quality: "valid",
      providerObservedAt: observation.providerObservedAt?.getTime() ?? null,
      capturedAt: observation.createdAt.getTime(),
    },
    nowMs
  );

  return {
    ...result,
    capturedAt: copyValidDate(observation.createdAt),
    providerObservedAt: observation.providerObservedAt,
    quality: observation.quality,
    source: observation.source,
    valueDecimal: normalizedValueDecimal,
  };
}

function copyValidDate(value: Date): Date | null {
  return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
}

function normalizeObservationValue(
  observation: LiveRatesTrustObservation
): string | null {
  const expectation = getRateExpectation(observation.instrumentCode);
  if (expectation === null) return null;

  const kind = observation.instrumentCode.startsWith("metal:")
    ? "metal"
    : "currency";
  const normalized = validateAndNormalizeRateReference(
    {
      capturedAt: observation.createdAt.getTime(),
      instrumentCode: observation.instrumentCode,
      kind,
      orientation: observation.orientation,
      providerObservedAt: observation.providerObservedAt?.getTime() ?? null,
      quality: observation.quality,
      role: expectation.role,
      source: observation.source,
      unit: observation.unit,
      valueDecimal: observation.valueDecimal,
    },
    expectation
  );

  return normalized.available
    ? normalized.value.normalizedUsdPerBaseDecimal
    : null;
}

function getRateExpectation(
  instrumentCode: string
): RateReferenceExpectation | null {
  if (instrumentCode === "metal:GOLD" || instrumentCode === "metal:SILVER") {
    return {
      instrumentCode,
      role: "current_metal",
    };
  }
  if (
    instrumentCode.startsWith("currency:") &&
    isSupportedMetalsIsoCurrencyCode(instrumentCode.slice("currency:".length))
  ) {
    return {
      instrumentCode: instrumentCode as CurrencyInstrumentCode,
      role: "display_preferred_currency",
    };
  }
  return null;
}
