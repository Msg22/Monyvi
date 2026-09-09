import type { CurrencyType } from "@monyvi/db";
import type { RateTrustResult } from "@monyvi/logic";
import { SUPPORTED_CURRENCIES } from "@monyvi/logic";

import type { SelectedCurrentMarketRate } from "./market-rate-snapshot-read-model-service";

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

export interface SelectedSnapshotTrustInput {
  readonly capturedAt: Date;
  readonly ratesByInstrument: ReadonlyMap<string, SelectedCurrentMarketRate>;
}

const TRUST_SEVERITY: Readonly<Record<LiveRatesTrustState, number>> = {
  fresh: 0,
  stale: 1,
  unknown: 2,
  invalid: 3,
  missing: 4,
};

const MISSING_TRUST_VALUE: LiveRatesTrustValue = Object.freeze({
  state: "missing",
  ageMs: null,
  capturedAt: null,
  providerObservedAt: null,
  quality: null,
  source: null,
  valueDecimal: null,
});

export function buildTrustFromSelectedSnapshot(
  input: SelectedSnapshotTrustInput
): LiveRatesTrustReadModel {
  const currencies = new Map<CurrencyType, LiveRatesTrustValue>();
  for (const { code } of SUPPORTED_CURRENCIES) {
    currencies.set(
      code,
      toTrustValue(
        input.ratesByInstrument.get(`currency:${code}`),
        input.capturedAt
      )
    );
  }

  return Object.freeze({
    gold: toTrustValue(
      input.ratesByInstrument.get("metal:GOLD"),
      input.capturedAt
    ),
    silver: toTrustValue(
      input.ratesByInstrument.get("metal:SILVER"),
      input.capturedAt
    ),
    currencies,
  });
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

function toTrustValue(
  rate: SelectedCurrentMarketRate | undefined,
  capturedAt: Date
): LiveRatesTrustValue {
  if (!rate) {
    return MISSING_TRUST_VALUE;
  }

  return Object.freeze({
    state: rate.freshness,
    ageMs: rate.ageMs,
    capturedAt: new Date(capturedAt.getTime()),
    providerObservedAt:
      rate.providerObservedAt === null
        ? null
        : new Date(rate.providerObservedAt.getTime()),
    quality: rate.quality,
    source: rate.source,
    valueDecimal: rate.valueDecimal,
  });
}
