import type { CurrencyType, MarketRateObservation } from "@monyvi/db";
import {
  SUPPORTED_CURRENCIES,
  classifyRateTrust,
  isSupportedMetalsIsoCurrencyCode,
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
  readonly instrumentCode: string;
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
  readonly providerObservedAt: Date | null;
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
  const query = database
    .get<MarketRateObservation>("market_rate_observations")
    .query(
      Q.where("instrument_code", Q.oneOf(V1_RATE_INSTRUMENT_CODES)),
      Q.sortBy("created_at", Q.desc)
    );

  return {
    subscribe(observer: LiveRatesTrustObserver): LiveRatesTrustSubscription {
      const subscription = query.observe().subscribe({
        next: (observations): void => {
          observer.next(buildLiveRatesTrustReadModel(observations, getNowMs()));
        },
        error: (error: unknown): void => observer.error?.(error),
      });
      return { unsubscribe: (): void => subscription.unsubscribe() };
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

  if (!Number.isFinite(candidateCapturedAt)) {
    return true;
  }
  if (!Number.isFinite(currentCapturedAt)) {
    return false;
  }
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
    return { state: "missing", ageMs: null, providerObservedAt: null };
  }

  if (
    observation.quality !== "valid" ||
    hasInvalidRateValue(observation.valueDecimal)
  ) {
    return {
      state: "invalid",
      ageMs: null,
      providerObservedAt: observation.providerObservedAt,
    };
  }

  const result = classifyRateTrust(
    {
      valueDecimal: observation.valueDecimal,
      quality: observation.quality === "valid" ? "valid" : "invalid",
      providerObservedAt: observation.providerObservedAt?.getTime() ?? null,
      capturedAt: observation.createdAt.getTime(),
    },
    nowMs
  );

  return {
    ...result,
    providerObservedAt: observation.providerObservedAt,
  };
}

function hasInvalidRateValue(valueDecimal: string | null): boolean {
  if (valueDecimal === null) {
    return false;
  }

  const value = Number(valueDecimal);
  return !Number.isFinite(value) || value <= 0;
}
