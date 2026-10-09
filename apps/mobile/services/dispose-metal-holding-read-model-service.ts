import { Q } from "@nozbe/watermelondb";
import {
  database,
  type Asset,
  type AssetMetal,
  type MarketRate,
  type MarketRateObservation,
  type MetalHoldingState,
  type MetalLifecycleEvent,
} from "@monyvi/db";
import {
  isSupportedMetalsIsoCurrencyCode,
  validateAndNormalizeRateReference,
  type CurrencyInstrumentCode,
  type MetalInstrumentCode,
} from "@monyvi/logic";

import type { DisposeRateSnapshotDraft } from "@/services/dispose-metal-holding-command-service";
import {
  getCurrentUserDataScope,
  queryChildrenOfOwnedParent,
  queryOwned,
} from "@/services/user-data-access";
import { MAX_SNAPSHOT_CANDIDATES } from "@/services/market-rate-snapshot-read-model-service";

export interface DisposableMetalHoldingReadModel {
  readonly holdingId: string;
  readonly name: string;
  readonly userId: string;
  readonly status: "active" | "sold" | "disposed";
  readonly expectedFinancialRevision: string;
  readonly predecessorEventId: string | null;
  readonly purchaseDate: string;
}

export interface LoadDisposeTerminalRateSnapshotsOptions {
  readonly nowMs?: number;
}

interface HoldingContext {
  readonly holdingId: string;
  readonly name: string;
  readonly userId: string;
  readonly metalType: "GOLD" | "SILVER";
  readonly purchaseCurrency: string;
  readonly purchaseDate: string;
  readonly expectedFinancialRevision: string;
  readonly predecessorEventId: string | null;
}

const EFFECTIVE_HOLDING_RECONCILIATION_STATES: ReadonlySet<string> = new Set([
  "local_complete",
  "sync_pending",
  "sync_failed",
  "accepted",
  "reconciled",
]);

// Mirrors the canonical snapshot contract in
// market-rate-snapshot-read-model-service.ts: batches whose every consumed
// observation is manual QA fixture output lose to real provider evidence and
// serve only as a fallback. This file cannot import that private prefix, so
// the literal is repeated here deliberately instead of inventing a new rule.
const MANUAL_QA_FIXTURE_SOURCE_PREFIX = "manual_qa_fixture:";

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function toCairoCalendarDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function toIsoString(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

async function loadHoldingContext(holdingId: string): Promise<HoldingContext> {
  const trimmed = holdingId.trim();
  if (!trimmed) throw new Error("metal_holding_not_found");
  const scope = await getCurrentUserDataScope();
  const userId = scope.userId;
  const [assets, states] = await Promise.all([
    queryOwned(
      database.get<Asset>("assets"),
      userId,
      Q.where("id", trimmed),
      Q.where("deleted", false),
      Q.take(1)
    ).fetch(),
    queryOwned(
      database.get<MetalHoldingState>("metal_holding_states"),
      userId,
      Q.where("holding_id", trimmed),
      Q.where("deleted", false),
      Q.take(1)
    ).fetch(),
  ]);
  const asset = assets[0] ? scope.assertOwned(assets[0]) : null;
  const state = states[0] ? scope.assertOwned(states[0]) : null;
  if (!asset || !state) throw new Error("metal_holding_not_found");
  if (asset.type !== "METAL") throw new Error("metal_holding_not_found");
  const metals = await queryChildrenOfOwnedParent(
    database.get<AssetMetal>("asset_metals"),
    asset,
    userId,
    "asset_id",
    Q.where("deleted", false),
    Q.take(1)
  ).fetch();
  const metal = metals[0] ?? null;
  if (!metal) throw new Error("metal_holding_not_found");
  const metalType = metal.metalType;
  if (metalType !== "GOLD" && metalType !== "SILVER") {
    throw new Error("metal_holding_not_found");
  }
  if (state.status !== "active") throw new Error("metal_holding_not_active");
  const purchaseCurrency = asset.purchaseCurrency;
  if (!purchaseCurrency) throw new Error("metal_holding_not_found");
  if (
    !state.isVisible ||
    !EFFECTIVE_HOLDING_RECONCILIATION_STATES.has(state.reconciliationState)
  ) {
    throw new Error("metal_dispose_effective_active_holding_required");
  }
  const effectiveActionId = state.effectiveActionId ?? null;
  const effectiveEventId = state.effectiveEventId ?? null;
  const isMigratedRevisionZero =
    state.financialRevision === "0" &&
    effectiveActionId === null &&
    effectiveEventId === null;
  if (isMigratedRevisionZero) {
    return {
      holdingId: asset.id,
      name: asset.name,
      userId: scope.userId,
      metalType,
      purchaseCurrency,
      purchaseDate: asset.purchaseDate?.toISOString().slice(0, 10) ?? "",
      expectedFinancialRevision: state.financialRevision,
      predecessorEventId: null,
    };
  }
  if (effectiveEventId === null) {
    throw new Error("metal_dispose_effective_active_holding_required");
  }
  const predecessors = await queryOwned(
    database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
    userId,
    Q.where("id", effectiveEventId),
    Q.where("holding_id", asset.id),
    Q.where("deleted", false),
    Q.take(1)
  ).fetch();
  const predecessor = predecessors[0]
    ? scope.assertOwned(predecessors[0])
    : null;
  if (
    !predecessor ||
    !predecessor.isEffective ||
    !predecessor.isHistoryVisible
  ) {
    throw new Error("metal_dispose_effective_active_holding_required");
  }
  if (
    effectiveEventId !== predecessor.id ||
    effectiveActionId !== predecessor.actionId
  ) {
    throw new Error("holding_revision_conflict");
  }
  return {
    holdingId: asset.id,
    name: asset.name,
    userId: scope.userId,
    metalType,
    purchaseCurrency,
    purchaseDate: asset.purchaseDate?.toISOString().slice(0, 10) ?? "",
    expectedFinancialRevision: state.financialRevision,
    predecessorEventId: effectiveEventId,
  };
}

export async function loadDisposableMetalHolding(
  holdingId: string
): Promise<DisposableMetalHoldingReadModel> {
  const context = await loadHoldingContext(holdingId);
  return {
    holdingId: context.holdingId,
    name: context.name,
    userId: context.userId,
    status: "active",
    expectedFinancialRevision: context.expectedFinancialRevision,
    predecessorEventId: context.predecessorEventId,
    purchaseDate: context.purchaseDate,
  };
}

interface RateBatch {
  readonly id: string;
  readonly capturedAt: Date;
  readonly observations: readonly MarketRateObservation[];
}

export async function loadDisposeTerminalRateSnapshots(
  holdingId: string,
  disposalDate: string,
  options: LoadDisposeTerminalRateSnapshotsOptions = {}
): Promise<readonly DisposeRateSnapshotDraft[]> {
  const context = await loadHoldingContext(holdingId);
  if (!isCalendarDate(disposalDate)) return Object.freeze([]);
  const nowMs = options.nowMs ?? Date.now();
  const todayCairo = toCairoCalendarDate(new Date(nowMs));
  if (disposalDate > todayCairo) return Object.freeze([]);
  const isHistorical = disposalDate < todayCairo;
  let batches: readonly RateBatch[];
  try {
    const roots = await database
      .get<MarketRate>("market_rates")
      .query(
        Q.sortBy("created_at", Q.desc),
        Q.sortBy("id", Q.desc),
        Q.take(MAX_SNAPSHOT_CANDIDATES)
      )
      .fetch();
    const batchIds = roots.map((root) => root.id);
    const observations =
      batchIds.length === 0
        ? []
        : await database
            .get<MarketRateObservation>("market_rate_observations")
            .query(Q.where("batch_id", Q.oneOf(batchIds)))
            .fetch();
    batches = roots.map((root) => ({
      id: root.id,
      capturedAt: root.createdAt,
      observations: observations.filter((item) => item.batchId === root.id),
    }));
  } catch {
    throw new Error("rate_store_unavailable");
  }
  const metalInstrument: MetalInstrumentCode = `metal:${context.metalType}`;
  let fixtureFallback: readonly DisposeRateSnapshotDraft[] | null = null;
  for (const batch of batches) {
    const selected = selectEligiblePair(batch, {
      metalInstrument,
      purchaseCurrency: context.purchaseCurrency,
      disposalDate,
      isHistorical,
    });
    if (selected === null) continue;
    if (!selected.isFixture) return selected.drafts;
    fixtureFallback ??= selected.drafts;
  }
  return fixtureFallback ?? Object.freeze([]);
}

interface EligibleTerminalPair {
  readonly drafts: readonly DisposeRateSnapshotDraft[];
  readonly isFixture: boolean;
}

function isFixtureSource(source: string | null): boolean {
  return source !== null && source.startsWith(MANUAL_QA_FIXTURE_SOURCE_PREFIX);
}

function batchHasCoherentCapture(batch: RateBatch): boolean {
  const capturedAtMs = batch.capturedAt?.getTime() ?? NaN;
  if (!Number.isFinite(capturedAtMs)) return false;
  const seen = new Set<string>();
  for (const item of batch.observations) {
    if (seen.has(item.instrumentCode)) return false;
    seen.add(item.instrumentCode);
    const createdAtMs = item.createdAt?.getTime() ?? NaN;
    if (!Number.isFinite(createdAtMs) || createdAtMs !== capturedAtMs) {
      return false;
    }
  }
  return true;
}

function selectEligiblePair(
  batch: RateBatch,
  input: {
    readonly metalInstrument: MetalInstrumentCode;
    readonly purchaseCurrency: string;
    readonly disposalDate: string;
    readonly isHistorical: boolean;
  }
): EligibleTerminalPair | null {
  // Mirrors the canonical candidate rule: every observation in the batch must
  // share the batch capture time, and no instrument may appear twice, so an
  // ambiguous or mixed batch can never supply terminal evidence.
  if (!batchHasCoherentCapture(batch)) return null;
  const capturedAtMs = batch.capturedAt.getTime();
  const metalObservation = batch.observations.find(
    (item) => item.instrumentCode === input.metalInstrument
  );
  if (!metalObservation) return null;
  const metalResult = validateAndNormalizeRateReference(
    {
      role: "terminal_metal",
      kind: "metal",
      instrumentCode: metalObservation.instrumentCode,
      valueDecimal: metalObservation.valueDecimal,
      unit: metalObservation.unit,
      orientation: metalObservation.orientation,
      providerObservedAt:
        metalObservation.providerObservedAt?.getTime() ?? null,
      source: metalObservation.source ?? null,
      quality: metalObservation.quality,
      capturedAt: capturedAtMs,
    },
    { role: "terminal_metal", instrumentCode: input.metalInstrument }
  );
  if (!metalResult.available) return null;
  if (
    input.isHistorical &&
    !isEligibleHistoricalObservation(
      metalResult.value.providerObservedAt,
      input.disposalDate
    )
  ) {
    return null;
  }
  const metalDraft: DisposeRateSnapshotDraft = {
    role: "terminal_metal",
    kind: "metal",
    instrumentCode: metalResult.value.instrumentCode,
    valueDecimal: metalResult.value.valueDecimal,
    unit: "usd_per_pure_gram",
    orientation: "quote_per_base",
    providerObservedAt: toIsoString(metalResult.value.providerObservedAt),
    source: metalResult.value.source,
    quality: "valid",
    capturedFreshness: metalResult.value.capturedFreshness,
    capturedAt: new Date(metalResult.value.capturedAt).toISOString(),
  };
  if (input.purchaseCurrency === "USD") {
    return {
      drafts: Object.freeze([
        metalDraft,
        {
          role: "terminal_purchase_currency",
          kind: "currency",
          instrumentCode: "currency:USD",
          valueDecimal: "1",
          unit: "usd_per_currency_unit",
          orientation: "quote_per_base",
          providerObservedAt: null,
          source: null,
          quality: "valid",
          capturedFreshness: "unknown",
          capturedAt: new Date(metalResult.value.capturedAt).toISOString(),
        },
      ]),
      isFixture: isFixtureSource(metalResult.value.source),
    };
  }
  if (!isSupportedMetalsIsoCurrencyCode(input.purchaseCurrency)) return null;
  const currencyInstrument: CurrencyInstrumentCode = `currency:${input.purchaseCurrency}`;
  const currencyObservation = batch.observations.find(
    (item) => item.instrumentCode === currencyInstrument
  );
  if (!currencyObservation) return null;
  const currencyResult = validateAndNormalizeRateReference(
    {
      role: "terminal_purchase_currency",
      kind: "currency",
      instrumentCode: currencyObservation.instrumentCode,
      valueDecimal: currencyObservation.valueDecimal,
      unit: currencyObservation.unit,
      orientation: currencyObservation.orientation,
      providerObservedAt:
        currencyObservation.providerObservedAt?.getTime() ?? null,
      source: currencyObservation.source ?? null,
      quality: currencyObservation.quality,
      capturedAt: capturedAtMs,
    },
    {
      role: "terminal_purchase_currency",
      instrumentCode: currencyInstrument,
    }
  );
  if (!currencyResult.available) return null;
  if (
    input.isHistorical &&
    !isEligibleHistoricalObservation(
      currencyResult.value.providerObservedAt,
      input.disposalDate
    )
  ) {
    return null;
  }
  return {
    drafts: Object.freeze([
      metalDraft,
      {
        role: "terminal_purchase_currency",
        kind: "currency",
        instrumentCode: currencyResult.value.instrumentCode,
        valueDecimal: currencyResult.value.valueDecimal,
        unit: currencyResult.value.unit,
        orientation: currencyResult.value.orientation,
        providerObservedAt: toIsoString(
          currencyResult.value.providerObservedAt
        ),
        source: currencyResult.value.source,
        quality: "valid",
        capturedFreshness: currencyResult.value.capturedFreshness,
        capturedAt: new Date(currencyResult.value.capturedAt).toISOString(),
      },
    ]),
    isFixture:
      isFixtureSource(metalResult.value.source) &&
      isFixtureSource(currencyResult.value.source),
  };
}

function isEligibleHistoricalObservation(
  providerObservedAtMs: number | null,
  disposalDate: string
): boolean {
  if (providerObservedAtMs === null) return false;
  return toCairoCalendarDate(new Date(providerObservedAtMs)) <= disposalDate;
}
