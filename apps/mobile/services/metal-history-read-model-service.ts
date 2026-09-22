import {
  database,
  type Asset,
  type AssetMetal,
  type FinancialActionGroup,
  type MetalActionEvidence,
  type MetalHoldingState,
  type MetalLifecycleEvent,
} from "@monyvi/db";
import { isSupportedMetal, type SupportedMetal } from "@monyvi/logic";
import { Q, type Query } from "@nozbe/watermelondb";
import {
  getCurrentUserDataScope,
  queryChildrenOfOwnedParents,
  queryOwned,
  type CurrentUserDataScope,
  USER_DATA_ACCESS_ERROR_CODES,
} from "@/services/user-data-access";
import {
  buildMetalDetailReadModel,
  shapeMetalDetailLifecycleEvents,
  type MetalDetailAssetInput,
  type MetalDetailHoldingStateInput,
  type MetalDetailLifecycleEventInput,
  type MetalDetailMetalInput,
  type MetalDetailRenderKey,
} from "@/services/metal-detail-read-model-service";
import { hasBoundEffectiveActionEvidence } from "@/services/metal-portfolio-read-model-service";
import {
  shapeMetalTerminalFacts,
  type MetalTerminalFacts,
} from "@/services/metal-terminal-read-model-service";

export const METAL_HISTORY_PAGE_SIZE = 50;

export type MetalHistoryFilter = "all" | "sold" | "disposed";

export interface MetalHistoryCounts {
  readonly all: number;
  readonly disposed: number;
  readonly sold: number;
}

export interface MetalHistoryHoldingInput {
  readonly asset: MetalDetailAssetInput;
  readonly holdingState: MetalDetailHoldingStateInput;
  readonly lifecycleEvents: readonly MetalDetailLifecycleEventInput[];
  readonly metal: MetalDetailMetalInput;
  readonly terminalFacts?: MetalTerminalFacts | null;
}

export interface BuildMetalHistoryReadModelInput {
  readonly filter: MetalHistoryFilter;
  readonly holdings: readonly MetalHistoryHoldingInput[];
  readonly pageSize?: number;
  readonly userId: string;
}

export interface MetalHistoryItem {
  readonly holdingId: string;
  readonly itemForm: "bar" | "coin" | "jewelry" | null;
  readonly metalType: SupportedMetal;
  readonly name: string;
  readonly occurredAt: Date;
  readonly purityCatalogVersion: string | null;
  readonly purityCode: string | null;
  readonly purityFactorDecimal: string | null;
  readonly renderKey: MetalDetailRenderKey | null;
  readonly status: Exclude<MetalHistoryFilter, "all">;
  readonly terminalFacts: MetalTerminalFacts | null;
}

export interface MetalHistoryReadModel {
  readonly counts: MetalHistoryCounts;
  readonly filter: MetalHistoryFilter;
  readonly hasMore: boolean;
  readonly items: readonly MetalHistoryItem[];
}

export interface ObserveMetalHistoryEventsInput {
  readonly holdings: ReadonlyArray<{
    readonly id: string;
    readonly userId: string;
  }>;
  readonly pageSize?: number;
  readonly userId: string;
}

export interface ReadMetalHistoryReadModelOptions {
  readonly filter: MetalHistoryFilter;
  readonly pageSize?: number;
  readonly userId: string;
}

export function observeMetalHistoryHoldingStates(
  userId: string,
  filter: MetalHistoryFilter
): Query<MetalHoldingState> {
  const statusCondition =
    filter === "all"
      ? Q.where("status", Q.oneOf(["sold", "disposed"]))
      : Q.where("status", filter);
  return queryOwned(
    database.get<MetalHoldingState>("metal_holding_states"),
    userId,
    Q.where("deleted", false),
    Q.where("is_visible", true),
    statusCondition,
    Q.sortBy("updated_at", Q.desc)
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
    Q.sortBy("occurred_at", Q.desc)
  );
}

export async function readMetalHistoryReadModel(
  options: ReadMetalHistoryReadModelOptions
): Promise<MetalHistoryReadModel> {
  const scope = await getCurrentUserDataScope();
  assertRequestedUser(scope.userId, options.userId);
  const pageSize = toBoundedPageSize(
    options.pageSize ?? METAL_HISTORY_PAGE_SIZE
  );
  const terminalStates = await readReportableTerminalStates(scope);
  if (terminalStates.length === 0) return emptyHistory(options.filter);

  const lifecycleValidatedStates =
    await orderTerminalStatesByEffectiveEventTime(scope, terminalStates);
  if (lifecycleValidatedStates.length === 0) {
    return emptyHistory(options.filter);
  }

  // Validate the whole archive once for truthful per-filter counts, but keep the
  // number of query rounds constant: read assets and their dependencies for the
  // entire ordered set in one pass, then shape counts and the bounded page in
  // memory. Batching per page here previously issued another asset lookup plus
  // four dependency queries for every page of candidates.
  const assets = await readHistoryAssets(scope, lifecycleValidatedStates);
  if (assets.length === 0) {
    return emptyHistory(options.filter);
  }
  const dependencies = await readHistoryDependencies(
    scope,
    assets,
    lifecycleValidatedStates
  );
  const validated = buildMetalHistoryReadModel({
    filter: "all",
    holdings: shapeReadHistoryHoldings(
      assets,
      lifecycleValidatedStates,
      dependencies
    ),
    userId: scope.userId,
  });
  const filteredItems = validated.items.filter(
    (item) => options.filter === "all" || item.status === options.filter
  );
  return Object.freeze({
    counts: Object.freeze({ ...validated.counts }),
    filter: options.filter,
    hasMore: filteredItems.length > pageSize,
    items: Object.freeze(filteredItems.slice(0, pageSize)),
  });
}

async function readReportableTerminalStates(
  scope: CurrentUserDataScope
): Promise<readonly MetalHoldingState[]> {
  const states = await scope
    .queryOwned(
      database.get<MetalHoldingState>("metal_holding_states"),
      Q.where("deleted", false),
      Q.where("is_visible", true),
      Q.where("status", Q.oneOf(["sold", "disposed"]))
    )
    .fetch();
  return states.filter(
    (state) =>
      state.userId === scope.userId &&
      state.isVisible &&
      isTerminalStatus(state.status) &&
      isReportableReconciliationState(state.reconciliationState) &&
      state.effectiveEventId !== null
  );
}

async function orderTerminalStatesByEffectiveEventTime(
  scope: CurrentUserDataScope,
  states: readonly MetalHoldingState[]
): Promise<readonly MetalHoldingState[]> {
  if (states.length === 0) return [];

  const eventIds = Array.from(
    new Set(
      states
        .map((state) => state.effectiveEventId)
        .filter((id): id is string => id !== null)
    )
  ).sort();
  const holdingIds = Array.from(
    new Set(states.map((state) => state.holdingId))
  ).sort();
  const [events, evidence] = await Promise.all([
    scope
      .queryOwned(
        database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
        Q.where("id", Q.oneOf(eventIds)),
        Q.where("deleted", false),
        Q.where("is_effective", true)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalActionEvidence>("metal_action_evidence"),
        Q.where("holding_id", Q.oneOf(holdingIds)),
        Q.where("deleted", false)
      )
      .fetch(),
  ]);
  const eventsById = new Map(events.map((event) => [event.id, event] as const));

  return states
    .filter((state) => {
      const event = state.effectiveEventId
        ? eventsById.get(state.effectiveEventId)
        : undefined;
      return (
        event !== undefined &&
        Number.isFinite(event.occurredAt.getTime()) &&
        hasBoundEffectiveActionEvidence(state, event, evidence)
      );
    })
    .sort((left, right) => {
      const leftEvent = eventsById.get(left.effectiveEventId as string);
      const rightEvent = eventsById.get(right.effectiveEventId as string);
      const timeDifference =
        (rightEvent?.occurredAt.getTime() ?? 0) -
        (leftEvent?.occurredAt.getTime() ?? 0);
      return timeDifference !== 0
        ? timeDifference
        : left.holdingId.localeCompare(right.holdingId);
    });
}

async function readHistoryAssets(
  scope: CurrentUserDataScope,
  terminalStates: readonly MetalHoldingState[]
): Promise<readonly Asset[]> {
  const holdingIds = terminalStates.map((state) => state.holdingId);
  return scope
    .queryOwned(
      database.get<Asset>("assets"),
      Q.where("id", Q.oneOf(holdingIds)),
      Q.where("type", "METAL"),
      Q.where("deleted", false)
    )
    .fetch();
}

interface HistoryDependencies {
  readonly evidence: readonly MetalActionEvidence[];
  readonly events: readonly MetalLifecycleEvent[];
  readonly groups: readonly FinancialActionGroup[];
  readonly metals: readonly AssetMetal[];
}

async function readHistoryDependencies(
  scope: CurrentUserDataScope,
  assets: readonly Asset[],
  terminalStates: readonly MetalHoldingState[]
): Promise<HistoryDependencies> {
  const holdingIds = terminalStates.map((state) => state.holdingId);
  const [metals, events, evidence, groups] = await Promise.all([
    scope
      .queryChildrenOfOwnedParents(
        database.get<AssetMetal>("asset_metals"),
        assets,
        "asset_id",
        Q.where("deleted", false)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
        Q.where("holding_id", Q.oneOf(holdingIds)),
        Q.where("deleted", false),
        Q.where("is_history_visible", true),
        Q.sortBy("occurred_at", Q.desc)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalActionEvidence>("metal_action_evidence"),
        Q.where("holding_id", Q.oneOf(holdingIds)),
        Q.where("deleted", false)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<FinancialActionGroup>("financial_action_groups"),
        Q.where("domain", "metals"),
        Q.where("domain_reference_id", Q.oneOf(holdingIds)),
        Q.where("deleted", false)
      )
      .fetch(),
  ]);
  return { evidence, events, groups, metals };
}

function shapeReadHistoryHoldings(
  assets: readonly Asset[],
  terminalStates: readonly MetalHoldingState[],
  dependencies: HistoryDependencies
): readonly MetalHistoryHoldingInput[] {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const metalsByHoldingId = new Map(
    dependencies.metals.map((metal) => [metal.assetId, metal])
  );
  return terminalStates.flatMap((state) => {
    const asset = assetsById.get(state.holdingId);
    const metal = metalsByHoldingId.get(state.holdingId);
    if (
      asset === undefined ||
      metal === undefined ||
      !isSupportedMetal(metal.metalType)
    ) {
      return [];
    }
    const holdingEvents = dependencies.events.filter(
      (event) => event.holdingId === state.holdingId
    );
    const holdingEvidence = dependencies.evidence.filter(
      (candidate) => candidate.holdingId === state.holdingId
    );
    const terminalFacts = shapeHistoryTerminalFacts(
      asset,
      metal,
      metal.metalType,
      state,
      holdingEvents,
      dependencies.groups
    );
    return [
      {
        asset: toDetailAssetInput(asset),
        holdingState: toDetailHoldingStateInput(state),
        lifecycleEvents: shapeMetalDetailLifecycleEvents(
          holdingEvents,
          holdingEvidence
        ),
        metal: toDetailMetalInput(metal, metal.metalType),
        terminalFacts,
      },
    ];
  });
}

function shapeHistoryTerminalFacts(
  asset: Asset,
  metal: AssetMetal,
  metalType: SupportedMetal,
  state: MetalHoldingState,
  events: readonly MetalLifecycleEvent[],
  groups: readonly FinancialActionGroup[]
): MetalTerminalFacts | null {
  return shapeMetalTerminalFacts({
    asset,
    event: events.find((event) => event.id === state.effectiveEventId) ?? null,
    group:
      groups.find((group) => group.actionId === state.effectiveActionId) ??
      null,
    holdingState: state,
    metal: { ...metal, metalType },
    rateReferences: [],
    userId: state.userId,
  });
}

function emptyHistory(
  filter: MetalHistoryFilter,
  counts: MetalHistoryCounts = { all: 0, sold: 0, disposed: 0 }
): MetalHistoryReadModel {
  return Object.freeze({
    counts: Object.freeze({ ...counts }),
    filter,
    hasMore: false,
    items: Object.freeze([]),
  });
}

export function buildMetalHistoryReadModel(
  input: BuildMetalHistoryReadModelInput
): MetalHistoryReadModel {
  const allItems = input.holdings
    .filter(
      (holding) =>
        holding.asset.userId === input.userId &&
        holding.holdingState.userId === input.userId &&
        holding.holdingState.holdingId === holding.asset.id &&
        isReportableReconciliationState(
          holding.holdingState.reconciliationState
        )
    )
    .map((holding) => toHistoryItem(holding, input.userId))
    .filter((item): item is MetalHistoryItem => item !== null)
    .sort(compareHistoryItems);
  const counts = countItems(allItems);
  const filteredItems = allItems.filter(
    (item) => input.filter === "all" || item.status === input.filter
  );
  const pageSize =
    input.pageSize === undefined ? null : toBoundedPageSize(input.pageSize);
  const items =
    pageSize === null ? filteredItems : filteredItems.slice(0, pageSize);
  return Object.freeze({
    counts: Object.freeze({ ...counts }),
    filter: input.filter,
    hasMore: pageSize !== null && filteredItems.length > pageSize,
    items: Object.freeze(items),
  });
}

function toHistoryItem(
  holding: MetalHistoryHoldingInput,
  userId: string
): MetalHistoryItem | null {
  const model = buildMetalDetailReadModel({
    asset: holding.asset,
    holdingState: holding.holdingState,
    lifecycleEvents: holding.lifecycleEvents,
    metal: holding.metal,
    rateReferences: [],
    terminalFacts: holding.terminalFacts,
    userId,
  });
  if (
    model === null ||
    model.status === "active" ||
    model.terminalFacts === null
  )
    return null;
  const terminal = model.timeline[0];
  if (terminal === undefined) return null;
  return Object.freeze({
    holdingId: holding.asset.id,
    itemForm: model.itemForm,
    metalType: model.metalType,
    name: model.name,
    occurredAt: new Date(terminal.occurredAt.getTime()),
    purityCatalogVersion: model.purityCatalogVersion,
    purityCode: model.purityCode,
    purityFactorDecimal: model.purityFactorDecimal,
    renderKey: model.renderKey,
    status: model.status,
    terminalFacts: model.terminalFacts,
  });
}

function toDetailAssetInput(asset: Asset): MetalDetailAssetInput {
  return {
    acquisitionActionId: asset.acquisitionActionId,
    id: asset.id,
    name: asset.name,
    purchaseCurrency: asset.purchaseCurrency,
    purchaseDate: copyValidDate(asset.purchaseDate),
    purchasePriceDecimal: asset.purchasePriceDecimal,
    userId: asset.userId,
  };
}

function toDetailMetalInput(
  metal: AssetMetal,
  metalType: SupportedMetal
): MetalDetailMetalInput {
  return {
    itemForm: metal.itemForm ?? null,
    metalType,
    purityCatalogVersion: metal.purityCatalogVersion,
    purityCode: metal.purityCode,
    purityFactorDecimal: metal.purityFactorDecimal,
    weightGramsDecimal: metal.weightGramsDecimal,
  };
}

function toDetailHoldingStateInput(
  state: MetalHoldingState
): MetalDetailHoldingStateInput {
  return {
    effectiveActionId: state.effectiveActionId,
    effectiveEventId: state.effectiveEventId,
    holdingId: state.holdingId,
    isVisible: state.isVisible,
    reconciliationState: state.reconciliationState,
    status: state.status,
    userId: state.userId,
  };
}

function isTerminalStatus(value: string): value is "sold" | "disposed" {
  return value === "sold" || value === "disposed";
}

function isReportableReconciliationState(value: string): boolean {
  return (
    value === "local_complete" ||
    value === "sync_pending" ||
    value === "sync_failed" ||
    value === "accepted" ||
    value === "reconciled"
  );
}

function countItems(items: readonly MetalHistoryItem[]): MetalHistoryCounts {
  const sold = items.filter((item) => item.status === "sold").length;
  const disposed = items.filter((item) => item.status === "disposed").length;
  return { all: sold + disposed, disposed, sold };
}

function copyValidDate(value: Date | null): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? new Date(value.getTime())
    : null;
}

function assertRequestedUser(
  actualUserId: string,
  requestedUserId: string
): void {
  if (actualUserId !== requestedUserId) {
    throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
  }
}

function compareHistoryItems(
  left: MetalHistoryItem,
  right: MetalHistoryItem
): number {
  const timeDifference = right.occurredAt.getTime() - left.occurredAt.getTime();
  return timeDifference !== 0
    ? timeDifference
    : left.holdingId.localeCompare(right.holdingId);
}

function toBoundedPageSize(pageSize: number): number {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1)
    return METAL_HISTORY_PAGE_SIZE;
  return pageSize;
}
