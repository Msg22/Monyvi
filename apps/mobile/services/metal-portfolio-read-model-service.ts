import {
  database,
  type Asset,
  type AssetMetal,
  type MetalHoldingState,
  type MetalLifecycleEvent,
} from "@monyvi/db";
import {
  parseCanonicalDecimal,
  roundDecimal,
  serializeDecimal,
} from "@monyvi/logic";
import { Q, type Query } from "@nozbe/watermelondb";

import {
  queryChildrenOfOwnedParents,
  queryOwned,
} from "@/services/user-data-access";

const RECENT_HISTORY_LIMIT = 3;

export type MetalPortfolioFilter = "ALL" | "GOLD" | "SILVER";

export interface PortfolioRateStatus {
  readonly ageMs: number | null;
  readonly state: "fresh" | "stale" | "unknown" | "missing";
}

export interface MetalPortfolioHoldingInput {
  readonly currentPerformanceDecimal: string | null;
  readonly currentValueDecimal: string | null;
  readonly id: string;
  readonly isEffective: boolean;
  readonly isVisible: boolean;
  readonly metalType: "GOLD" | "SILVER";
  readonly name: string;
  readonly occurredAt: Date;
  readonly soldResultDecimal: string | null;
  readonly status: "active" | "sold" | "disposed";
  readonly userId: string;
}

export interface BuildMetalPortfolioReadModelInput {
  readonly filter: MetalPortfolioFilter;
  readonly holdings: readonly MetalPortfolioHoldingInput[];
  readonly rateStatus: PortfolioRateStatus;
  readonly userId: string;
}

export interface MetalPortfolioAllocation {
  readonly gold: string | null;
  readonly silver: string | null;
}

export type MetalPortfolioListState =
  | "POPULATED"
  | "PORTFOLIO_EMPTY"
  | "FILTER_EMPTY";

export interface MetalPortfolioReadModel {
  readonly activeHoldings: readonly MetalPortfolioHoldingInput[];
  readonly activeTotalDecimal: string | null;
  readonly allocation: MetalPortfolioAllocation;
  readonly currentPerformanceDecimal: string | null;
  readonly filter: MetalPortfolioFilter;
  readonly hasTerminalHistory: boolean;
  readonly holdings: readonly MetalPortfolioHoldingInput[];
  readonly listState: MetalPortfolioListState;
  readonly rateStatus: PortfolioRateStatus;
  readonly recentHistory: readonly MetalPortfolioHoldingInput[];
  readonly soldResultDecimal: string | null;
}

export interface ObservePortfolioAssetMetalsInput {
  readonly assets: readonly Asset[];
  readonly userId: string;
}

export function observePortfolioAssets(userId: string): Query<Asset> {
  return queryOwned(
    database.get<Asset>("assets"),
    userId,
    Q.where("type", "METAL"),
    Q.where("deleted", false)
  );
}

export function observePortfolioAssetMetals(
  input: ObservePortfolioAssetMetalsInput
): Query<AssetMetal> | null {
  if (input.assets.length === 0) {
    return null;
  }

  return queryChildrenOfOwnedParents(
    database.get<AssetMetal>("asset_metals"),
    input.assets,
    input.userId,
    "asset_id",
    Q.where("deleted", false)
  );
}

export function observePortfolioHoldingStates(
  userId: string
): Query<MetalHoldingState> {
  return queryOwned(
    database.get<MetalHoldingState>("metal_holding_states"),
    userId,
    Q.where("deleted", false)
  );
}

export function observePortfolioRecentHistory(
  userId: string
): Query<MetalLifecycleEvent> {
  return queryOwned(
    database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
    userId,
    Q.where("deleted", false),
    Q.where("is_effective", true),
    Q.where("is_history_visible", true),
    Q.sortBy("occurred_at", Q.desc),
    Q.take(RECENT_HISTORY_LIMIT)
  );
}

export function buildMetalPortfolioReadModel(
  input: BuildMetalPortfolioReadModelInput
): MetalPortfolioReadModel {
  const ownedHoldings = input.holdings.filter(
    (holding) => holding.userId === input.userId
  );
  const activeHoldings = ownedHoldings
    .filter(isEffectiveVisibleActiveHolding)
    .map(copyHolding)
    .sort(sortByOccurredAtDescending);
  const terminalHoldings = ownedHoldings
    .filter(isEffectiveVisibleTerminalHolding)
    .map(copyHolding)
    .sort(sortByOccurredAtDescending);
  const goldHoldings = activeHoldings.filter(
    (holding) => holding.metalType === "GOLD"
  );
  const silverHoldings = activeHoldings.filter(
    (holding) => holding.metalType === "SILVER"
  );
  const activeTotalDecimal = sumAvailableDecimals(
    activeHoldings.map((holding) => holding.currentValueDecimal),
    "0"
  );
  const goldTotalDecimal = sumAvailableDecimals(
    goldHoldings.map((holding) => holding.currentValueDecimal),
    "0"
  );
  const silverTotalDecimal = sumAvailableDecimals(
    silverHoldings.map((holding) => holding.currentValueDecimal),
    "0"
  );
  const selectedHoldings = selectHoldings(activeHoldings, input.filter);
  const soldHoldings = terminalHoldings.filter(
    (holding) => holding.status === "sold"
  );

  return {
    activeHoldings,
    activeTotalDecimal,
    allocation: {
      gold: calculateDisplayedShare(goldTotalDecimal, activeTotalDecimal),
      silver: calculateDisplayedShare(silverTotalDecimal, activeTotalDecimal),
    },
    currentPerformanceDecimal: sumAvailableDecimals(
      activeHoldings.map((holding) => holding.currentPerformanceDecimal),
      "0"
    ),
    filter: input.filter,
    hasTerminalHistory: terminalHoldings.length > 0,
    holdings: selectedHoldings,
    listState: determineListState(activeHoldings, selectedHoldings),
    rateStatus: { ...input.rateStatus },
    recentHistory: terminalHoldings.slice(0, RECENT_HISTORY_LIMIT),
    soldResultDecimal:
      soldHoldings.length === 0
        ? null
        : sumAvailableDecimals(
            soldHoldings.map((holding) => holding.soldResultDecimal),
            null
          ),
  };
}

export function selectPortfolioHoldings(
  model: MetalPortfolioReadModel,
  filter: MetalPortfolioFilter
): readonly MetalPortfolioHoldingInput[] {
  return selectHoldings(model.activeHoldings, filter);
}

function isEffectiveVisibleActiveHolding(
  holding: MetalPortfolioHoldingInput
): boolean {
  return (
    holding.isEffective && holding.isVisible && holding.status === "active"
  );
}

function isEffectiveVisibleTerminalHolding(
  holding: MetalPortfolioHoldingInput
): boolean {
  return (
    holding.isEffective &&
    holding.isVisible &&
    (holding.status === "sold" || holding.status === "disposed")
  );
}

function copyHolding(
  holding: MetalPortfolioHoldingInput
): MetalPortfolioHoldingInput {
  return {
    ...holding,
    occurredAt: new Date(holding.occurredAt.getTime()),
  };
}

function sortByOccurredAtDescending(
  left: MetalPortfolioHoldingInput,
  right: MetalPortfolioHoldingInput
): number {
  return right.occurredAt.getTime() - left.occurredAt.getTime();
}

function selectHoldings(
  holdings: readonly MetalPortfolioHoldingInput[],
  filter: MetalPortfolioFilter
): readonly MetalPortfolioHoldingInput[] {
  if (filter === "ALL") {
    return holdings;
  }

  return holdings.filter((holding) => holding.metalType === filter);
}

function determineListState(
  activeHoldings: readonly MetalPortfolioHoldingInput[],
  selectedHoldings: readonly MetalPortfolioHoldingInput[]
): MetalPortfolioListState {
  if (activeHoldings.length === 0) {
    return "PORTFOLIO_EMPTY";
  }

  return selectedHoldings.length === 0 ? "FILTER_EMPTY" : "POPULATED";
}

function sumAvailableDecimals(
  values: readonly (string | null)[],
  emptyValue: string | null
): string | null {
  if (values.length === 0) {
    return emptyValue;
  }

  let total = parseCanonicalDecimal("0");
  for (const value of values) {
    if (value === null) {
      return null;
    }

    try {
      total = total.plus(parseCanonicalDecimal(value));
    } catch {
      return null;
    }
  }

  return serializeDecimal(total);
}

function calculateDisplayedShare(
  amountDecimal: string | null,
  totalDecimal: string | null
): string | null {
  if (amountDecimal === null || totalDecimal === null) {
    return null;
  }

  const total = parseCanonicalDecimal(totalDecimal);
  if (total.isZero()) {
    return "0";
  }

  const share = parseCanonicalDecimal(amountDecimal)
    .times("100")
    .dividedBy(total);
  return serializeDecimal(parseCanonicalDecimal(roundDecimal(share, 1)));
}
