import {
  database,
  type MetalHoldingState,
  type MetalLifecycleEvent,
} from "@monyvi/db";
import { Q, type Query } from "@nozbe/watermelondb";
import { queryChildrenOfOwnedParents, queryOwned } from "@/services/user-data-access";
import {
  buildMetalDetailReadModel,
  type MetalDetailLifecycleEventInput,
} from "@/services/metal-detail-read-model-service";

export const METAL_HISTORY_PAGE_SIZE = 50;
const MAX_METAL_HISTORY_PAGE_SIZE = 100;

export type MetalHistoryFilter = "all" | "sold" | "disposed";

export interface MetalHistoryHoldingInput {
  readonly id: string;
  readonly lifecycleEvents: readonly MetalDetailLifecycleEventInput[];
  readonly userId: string;
}

export interface BuildMetalHistoryReadModelInput {
  readonly filter: MetalHistoryFilter;
  readonly holdings: readonly MetalHistoryHoldingInput[];
  readonly userId: string;
}

export interface MetalHistoryItem {
  readonly holdingId: string;
  readonly occurredAt: Date;
  readonly status: Exclude<MetalHistoryFilter, "all">;
}

export interface MetalHistoryReadModel {
  readonly filter: MetalHistoryFilter;
  readonly items: readonly MetalHistoryItem[];
}

export interface ObserveMetalHistoryEventsInput {
  readonly holdings: readonly { readonly id: string; readonly userId: string }[];
  readonly pageSize?: number;
  readonly userId: string;
}

export function observeMetalHistoryHoldingStates(
  userId: string,
  filter: MetalHistoryFilter
): Query<MetalHoldingState> {
  const statusCondition = filter === "all"
    ? Q.where("status", Q.oneOf(["sold", "disposed"]))
    : Q.where("status", filter);
  return queryOwned(
    database.get<MetalHoldingState>("metal_holding_states"),
    userId,
    Q.where("deleted", false),
    Q.where("is_visible", true),
    statusCondition
  );
}

export function observeMetalHistoryEvents(
  input: ObserveMetalHistoryEventsInput
): Query<MetalLifecycleEvent> | null {
  if (input.holdings.length === 0) return null;
  return queryChildrenOfOwnedParents(
    database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
    input.holdings,
    input.userId,
    "holding_id",
    Q.where("deleted", false),
    Q.where("is_history_visible", true),
    Q.sortBy("occurred_at", Q.desc),
    Q.take(toBoundedPageSize(input.pageSize ?? METAL_HISTORY_PAGE_SIZE) + 1)
  );
}

export function buildMetalHistoryReadModel(
  input: BuildMetalHistoryReadModelInput
): MetalHistoryReadModel {
  const items = input.holdings
    .filter((holding) => holding.userId === input.userId)
    .map((holding) => toHistoryItem(holding, input.userId))
    .filter((item): item is MetalHistoryItem => item !== null)
    .filter((item) => input.filter === "all" || item.status === input.filter)
    .sort(compareHistoryItems);
  return Object.freeze({ filter: input.filter, items: Object.freeze(items) });
}

function toHistoryItem(
  holding: MetalHistoryHoldingInput,
  userId: string
): MetalHistoryItem | null {
  const model = buildMetalDetailReadModel({
    asset: {
      id: holding.id,
      name: "",
      purchaseCurrency: null,
      purchasePriceDecimal: null,
      userId,
    },
    holdingState: {
      holdingId: holding.id,
      isVisible: true,
      reconciliationState: "accepted",
      status: "active",
      userId,
    },
    lifecycleEvents: holding.lifecycleEvents,
    metal: {
      itemForm: null,
      metalType: "GOLD",
      purityCatalogVersion: null,
      purityCode: null,
      purityFactorDecimal: null,
      weightGramsDecimal: null,
    },
    rateReferences: [],
    userId,
  });
  if (model === null || model.status === "active") return null;
  const terminal = model.timeline[0];
  if (terminal === undefined) return null;
  return Object.freeze({
    holdingId: holding.id,
    occurredAt: new Date(terminal.occurredAt.getTime()),
    status: model.status,
  });
}

function compareHistoryItems(left: MetalHistoryItem, right: MetalHistoryItem): number {
  const timeDifference = right.occurredAt.getTime() - left.occurredAt.getTime();
  return timeDifference !== 0 ? timeDifference : left.holdingId.localeCompare(right.holdingId);
}

function toBoundedPageSize(pageSize: number): number {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) return METAL_HISTORY_PAGE_SIZE;
  return Math.min(pageSize, MAX_METAL_HISTORY_PAGE_SIZE);
}
