import { renderHook, waitFor } from "@testing-library/react-native";
import { Decimal } from "decimal.js";

import type {
  SelectedMarketRateSnapshot,
} from "@/services/market-rate-snapshot-read-model-service";
import {
  completeFixtureA,
  createRootA,
  divergentWideRootFixtureA,
  SNAPSHOT_A_ID,
} from "../fixtures/market-rate-snapshot";
import { formatRate } from "@monyvi/logic";

const NOW_MS = Date.parse("2026-09-09T11:00:00.000Z");

interface SnapshotObserver {
  readonly next: (value: SelectedMarketRateSnapshot | null) => void;
  readonly error?: (cause: unknown) => void;
}

const mockSnapshotObservers: SnapshotObserver[] = [];
let mockPendingSnapshot: SelectedMarketRateSnapshot | null = null;
const mockStreamRefresh = jest.fn<void, []>();

jest.mock("@/services/market-rate-snapshot-read-model-service", () => {
  const actual = jest.requireActual(
    "@/services/market-rate-snapshot-read-model-service"
  );
  return {
    ...actual,
    observeSelectedMarketRateSnapshot: () => ({
      refresh: mockStreamRefresh,
      subscribe: (observer: SnapshotObserver) => {
        mockSnapshotObservers.push(observer);
        observer.next(mockPendingSnapshot);
        return { unsubscribe: jest.fn() };
      },
    }),
  };
});

jest.mock("@/providers/DatabaseProvider", () => ({
  useDatabase: () => ({
    get: () => ({
      query: () => ({
        observe: () => ({
          subscribe: ({
            next,
          }: {
            next: (rows: readonly unknown[]) => void;
          }) => {
            next([]);
            return { unsubscribe: jest.fn() };
          },
        }),
        fetch: async () => [],
      }),
    }),
  }),
}));

jest.mock("@/providers/MarketRatesRealtimeProvider", () => ({
  useMarketRatesRealtime: () => ({ isConnected: true }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: () => ({ preferredCurrency: "EGP" }),
}));

jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    userId: "user-1",
    isResolvingUser: false,
    profile: null,
  }),
  runUserScopedEffect: (input: {
    onAuthenticated: (userId: string) => () => void;
  }) => input.onAuthenticated("user-1"),
}));

jest.mock("@/services/live-rates-refresh-service", () => ({
  refreshLiveMarketRates: jest.fn(() => Promise.resolve()),
}));

jest.mock("@/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { resolvedLanguage: "en" } }),
}));

const netWorthInputs: Record<string, unknown>[] = [];
jest.mock("@/services/net-worth-read-model-service", () => ({
  observeNetWorthAccounts: () => mockCreateQuery([]),
  observeNetWorthAssets: () => mockCreateQuery([]),
  observeNetWorthAssetMetals: () => mockCreateQuery([]),
  observeNetWorthSnapshots: () => mockCreateQuery([]),
  buildNetWorthReadModel: (input: Record<string, unknown>) => {
    netWorthInputs.push(input);
    return null;
  },
  buildMonthlyPercentageChange: () => null,
  buildWealthBreakdownReadModel: () => null,
}));

function mockCreateQuery(rows: readonly unknown[]) {
  return {
    observe: () => ({
      subscribe: ({
        next,
      }: {
        next: (result: readonly unknown[]) => void;
      }) => {
        next(rows);
        return { unsubscribe: jest.fn() };
      },
    }),
    observeWithColumns: () => ({
      subscribe: ({
        next,
      }: {
        next: (result: readonly unknown[]) => void;
      }) => {
        next(rows);
        return { unsubscribe: jest.fn() };
      },
    }),
  };
}

const portfolioShapeInputs: Record<string, unknown>[] = [];
jest.mock("@/services/metal-portfolio-read-model-service", () => ({
  observePortfolioAssets: () => mockCreateQuery([]),
  observePortfolioAssetMetals: () => mockCreateQuery([]),
  observePortfolioHoldingStates: () => mockCreateQuery([]),
  observePortfolioMetalSellGroups: () => mockCreateQuery([]),
  observePortfolioRecentHistory: () => mockCreateQuery([]),
  observePortfolioSaleRateReferences: () => mockCreateQuery([]),
  selectPortfolioHoldings: (model: unknown) => model,
  buildMetalPortfolioReadModel: (input: unknown) => input,
  shapeMetalPortfolioHoldings: (input: Record<string, unknown>) => {
    portfolioShapeInputs.push(input);
    return null;
  },
}));

const detailReadInputs: Record<string, unknown>[] = [];
jest.mock("@/services/metal-action-evidence-observer-service", () => ({
  observeMetalDetailActionEvidence: () => mockCreateQuery([]),
}));
jest.mock("@/services/metal-detail-read-model-service", () => ({
  observeMetalDetailHolding: () => mockCreateQuery([]),
  observeMetalDetailEvents: () => mockCreateQuery([]),
  observeMetalDetailHoldingState: () => mockCreateQuery([]),
  observeMetalDetailRateReferences: () => mockCreateQuery([]),
  readMetalDetailReadModel: async (input: Record<string, unknown>) => {
    detailReadInputs.push(input);
    return null;
  },
}));

jest.mock("@/services/sync", () => ({
  syncDatabase: jest.fn(() => Promise.resolve()),
}));

jest.mock("@react-navigation/native", () => ({
  useIsFocused: () => true,
}));

import { useMarketRates } from "@/hooks/useMarketRates";
import { useLiveRatesScreen } from "@/hooks/useLiveRatesScreen";
import { useMetalHoldingDetail } from "@/hooks/useMetalHoldingDetail";
import { useMetalPortfolio } from "@/hooks/useMetalPortfolio";
import { useNetWorth } from "@/hooks/useNetWorth";
import { selectMarketRateSnapshot } from "@/services/market-rate-snapshot-read-model-service";

function emitSnapshot(snapshot: SelectedMarketRateSnapshot | null): void {
  mockPendingSnapshot = snapshot;
  for (const observer of mockSnapshotObservers) {
    observer.next(snapshot);
  }
}

function snapshotA(): SelectedMarketRateSnapshot {
  const fixture = completeFixtureA();
  const selected = selectMarketRateSnapshot(
    fixture.roots as never,
    fixture.observations as never,
    NOW_MS
  );
  if (!selected) {
    throw new Error("fixture setup: snapshot A must be selectable");
  }
  return selected;
}

describe("issue #302 cross-consumer snapshot identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.setSystemTime(new Date(NOW_MS));
    mockSnapshotObservers.splice(0);
    mockPendingSnapshot = null;
    netWorthInputs.splice(0);
    portfolioShapeInputs.splice(0);
    detailReadInputs.splice(0);
  });

  it("exposes one selected snapshot with exact observation decimals everywhere", async () => {
    const snapshot = snapshotA();
    emitSnapshot(snapshot);

    const { result } = renderHook(() => useMarketRates());
    await waitFor(() =>
      expect(result.current.selectedSnapshot?.snapshotId).toBe(SNAPSHOT_A_ID)
    );
    expect(
      result.current.selectedSnapshot?.ratesByInstrument.get("metal:GOLD")
        ?.valueDecimal
    ).toBe("3738.74000000");

    renderHook(() => useNetWorth());
    await waitFor(() => expect(netWorthInputs.length).toBeGreaterThan(0));
    const netWorthInput = netWorthInputs.at(-1);
    expect(netWorthInput).toMatchObject({
      currentSnapshot: { snapshotId: SNAPSHOT_A_ID },
    });
    expect(netWorthInput).not.toHaveProperty("latestRates");

    renderHook(() => useMetalPortfolio());
    await waitFor(() =>
      expect(portfolioShapeInputs.length).toBeGreaterThan(0)
    );
    const portfolioInput = portfolioShapeInputs.at(-1);
    expect(portfolioInput).toMatchObject({
      snapshotId: SNAPSHOT_A_ID,
      currentRates: {
        gold: { valueDecimal: "3738.74000000", state: "stale" },
      },
    });

    renderHook(() => useMetalHoldingDetail("holding-1"));
    await waitFor(() => expect(detailReadInputs.length).toBeGreaterThan(0));
    const detailInput = detailReadInputs.at(-1);
    expect(detailInput).toMatchObject({
      snapshotId: SNAPSHOT_A_ID,
      currentRates: {
        gold: { valueDecimal: "3738.74000000" },
      },
    });
  });

  it("shows current rates and trust from the same snapshot and never mixes", async () => {
    const snapshot = snapshotA();
    emitSnapshot(snapshot);

    const { result } = renderHook(() => useLiveRatesScreen());
    await waitFor(() => expect(result.current.hasData).toBe(true));

    const usdRow = result.current.currencies.find(
      (currency) => currency.code === "USD"
    );
    const expectedUsd = formatRate(
      Number(new Decimal("3738.74000000").div("0.0210523309"))
    );
    expect(usdRow?.trust.source).toBe("metals.dev");
    expect(usdRow).toBeDefined();
    expect(result.current.metals.price24k).toBe(expectedUsd);

    const divergent = selectMarketRateSnapshot(
      divergentWideRootFixtureA().roots as never,
      divergentWideRootFixtureA().observations as never,
      NOW_MS
    );
    if (!divergent) {
      throw new Error("fixture setup: divergent snapshot must select");
    }
    emitSnapshot(divergent);

    await waitFor(() => expect(result.current.hasData).toBe(true));
    expect(result.current.metals.price24k).toBe(expectedUsd);
  });

  it("derives freshness from provider observation time only", async () => {
    const fixture = completeFixtureA();
    const staleProvider = new Date(NOW_MS - 25 * 3_600_000);
    const roots = [
      {
        ...createRootA(),
        createdAt: new Date(NOW_MS),
        providerObservedAt: staleProvider.toISOString(),
      },
    ];
    const observations = fixture.observations.map((row) => ({
      ...row,
      providerObservedAt: staleProvider,
    }));
    const selected = selectMarketRateSnapshot(
      roots as never,
      observations as never,
      NOW_MS
    );
    emitSnapshot(selected);

    const { result } = renderHook(() => useMarketRates());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isStale).toBe(true);
    expect(result.current.lastUpdated?.getTime()).toBe(
      staleProvider.getTime()
    );
  });
});
