import {
  database,
  type Asset,
  type AssetMetal,
  type MetalActionEvidence,
  type MetalHoldingState,
  type MetalLifecycleEvent,
} from "@monyvi/db";
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

export const METAL_HISTORY_PAGE_SIZE = 50;
const MAX_METAL_HISTORY_PAGE_SIZE = 100;

export type MetalHistoryFilter = "all" | "sold" | "disposed";

export interface MetalHistoryHoldingInput {
  readonly asset: MetalDetailAssetInput;
  readonly holdingState: MetalDetailHoldingStateInput;
  readonly lifecycleEvents: readonly MetalDetailLifecycleEventInput[];
  readonly metal: MetalDetailMetalInput;
}

export interface BuildMetalHistoryReadModelInput {
  readonly filter: MetalHistoryFilter;
  readonly holdings: readonly MetalHistoryHoldingInput[];
  readonly userId: string;
}

export interface MetalHistoryItem {
  readonly holdingId: string;
  readonly itemForm: "bar" | "coin" | "jewelry" | null;
  readonly metalType: "GOLD" | "SILVER";
  readonly name: string;
  readonly occurredAt: Date;
  readonly purityCatalogVersion: string | null;
  readonly purityCode: string | null;
  readonly purityFactorDecimal: string | null;
  readonly renderKey: MetalDetailRenderKey | null;
  readonly status: Exclude<MetalHistoryFilter, "all">;
}

export interface MetalHistoryReadModel {
  readonly filter: MetalHistoryFilter;
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
  filter: MetalHistoryFilter,
  pageSize: number = METAL_HISTORY_PAGE_SIZE
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
    Q.sortBy("updated_at", Q.desc),
    Q.take(toBoundedPageSize(pageSize) + 1)
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

export async function readMetalHistoryReadModel(
  options: ReadMetalHistoryReadModelOptions
): Promise<MetalHistoryReadModel> {
  const scope = await getCurrentUserDataScope();
  assertRequestedUser(scope.userId, options.userId);
  const pageSize = toBoundedPageSize(
    options.pageSize ?? METAL_HISTORY_PAGE_SIZE
  );
  const terminalStates = await readTerminalStates(scope, options, pageSize);
  if (terminalStates.length === 0) return emptyHistory(options.filter);
  const assets = await readHistoryAssets(scope, terminalStates, pageSize);
  if (assets.length === 0) return emptyHistory(options.filter);
  const dependencies = await readHistoryDependencies(
    scope,
    assets,
    terminalStates,
    pageSize
  );
  return buildMetalHistoryReadModel({
    filter: options.filter,
    holdings: shapeReadHistoryHoldings(assets, terminalStates, dependencies),
    userId: scope.userId,
  });
}

async function readTerminalStates(
  scope: CurrentUserDataScope,
  options: ReadMetalHistoryReadModelOptions,
  pageSize: number
): Promise<readonly MetalHoldingState[]> {
  const statusCondition =
    options.filter === "all"
      ? Q.where("status", Q.oneOf(["sold", "disposed"]))
      : Q.where("status", options.filter);
  const states = await scope
    .queryOwned(
      database.get<MetalHoldingState>("metal_holding_states"),
      Q.where("deleted", false),
      Q.where("is_visible", true),
      statusCondition,
      Q.sortBy("updated_at", Q.desc),
      Q.take(pageSize + 1)
    )
    .fetch();
  return states.filter(
    (state) =>
      state.userId === scope.userId &&
      state.isVisible &&
      (state.status === "sold" || state.status === "disposed") &&
      (options.filter === "all" || state.status === options.filter)
  );
}

async function readHistoryAssets(
  scope: CurrentUserDataScope,
  terminalStates: readonly MetalHoldingState[],
  pageSize: number
): Promise<readonly Asset[]> {
  const holdingIds = terminalStates.map((state) => state.holdingId);
  return scope
    .queryOwned(
      database.get<Asset>("assets"),
      Q.where("id", Q.oneOf(holdingIds)),
      Q.where("type", "METAL"),
      Q.where("deleted", false),
      Q.take(pageSize + 1)
    )
    .fetch();
}

interface HistoryDependencies {
  readonly evidence: readonly MetalActionEvidence[];
  readonly events: readonly MetalLifecycleEvent[];
  readonly metals: readonly AssetMetal[];
}

async function readHistoryDependencies(
  scope: CurrentUserDataScope,
  assets: readonly Asset[],
  terminalStates: readonly MetalHoldingState[],
  pageSize: number
): Promise<HistoryDependencies> {
  const holdingIds = terminalStates.map((state) => state.holdingId);
  const [metals, events, evidence] = await Promise.all([
    scope
      .queryChildrenOfOwnedParents(
        database.get<AssetMetal>("asset_metals"),
        assets,
        "asset_id",
        Q.where("deleted", false),
        Q.take(pageSize + 1)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
        Q.where("holding_id", Q.oneOf(holdingIds)),
        Q.where("deleted", false),
        Q.where("is_history_visible", true),
        Q.sortBy("occurred_at", Q.desc),
        Q.take(pageSize + 1)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalActionEvidence>("metal_action_evidence"),
        Q.where("holding_id", Q.oneOf(holdingIds)),
        Q.where("deleted", false),
        Q.take(pageSize + 1)
      )
      .fetch(),
  ]);
  return { evidence, events, metals };
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
      !isSupportedMetalType(metal.metalType)
    ) {
      return [];
    }
    const holdingEvents = dependencies.events.filter(
      (event) => event.holdingId === state.holdingId
    );
    const holdingEvidence = dependencies.evidence.filter(
      (candidate) => candidate.holdingId === state.holdingId
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
      },
    ];
  });
}

function emptyHistory(filter: MetalHistoryFilter): MetalHistoryReadModel {
  return Object.freeze({
    filter,
    items: Object.freeze([]),
  });
}

export function buildMetalHistoryReadModel(
  input: BuildMetalHistoryReadModelInput
): MetalHistoryReadModel {
  const items = input.holdings
    .filter(
      (holding) =>
        holding.asset.userId === input.userId &&
        holding.holdingState.userId === input.userId &&
        holding.holdingState.holdingId === holding.asset.id
    )
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
    asset: holding.asset,
    holdingState: holding.holdingState,
    lifecycleEvents: holding.lifecycleEvents,
    metal: holding.metal,
    rateReferences: [],
    userId,
  });
  if (model === null || model.status === "active") return null;
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
  });
}

function toDetailAssetInput(asset: Asset): MetalDetailAssetInput {
  return {
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
  metalType: "GOLD" | "SILVER"
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
    holdingId: state.holdingId,
    isVisible: state.isVisible,
    reconciliationState: state.reconciliationState,
    status: state.status,
    userId: state.userId,
  };
}

function isSupportedMetalType(value: string): value is "GOLD" | "SILVER" {
  return value === "GOLD" || value === "SILVER";
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
  return Math.min(pageSize, MAX_METAL_HISTORY_PAGE_SIZE);
}
