import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { Asset } from "../../../../packages/db/src/models/Asset";
import { schema } from "../../../../packages/db/src/schema";
import type { DisposeRateSnapshotDraft } from "../../services/dispose-metal-holding-command-service";
import type { SellMetalHoldingCommandService } from "../../services/sell-metal-holding-command-service";
import {
  createSellMetalHoldingFormExecutor,
  formatSellMetalHoldingPreview,
  previewSellMetalHolding,
  type SellableMetalHolding,
  type SellMetalHoldingFormCommand,
} from "../../services/sell-metal-holding-facade-service";
import { createSellMetalHoldingProductionService } from "../../services/sell-metal-holding-production-service";
import { loadDisposeTerminalRateSnapshots } from "../../services/dispose-metal-holding-read-model-service";
import { assertExpectedCurrentUser } from "../../services/user-data-access";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("../../services/dispose-metal-holding-read-model-service", () => ({
  loadDisposeTerminalRateSnapshots: jest.fn(),
}));
jest.mock("../../services/metal-financial-action-repository", () => ({
  formatMetalLocalCalendarDate: jest.fn(),
}));
jest.mock("../../services/sell-metal-holding-production-service", () => ({
  createSellMetalHoldingProductionService: jest.fn(),
}));
jest.mock("../../services/user-data-access", () => ({
  assertExpectedCurrentUser: jest.fn(),
  getCurrentUserDataScope: jest.fn(),
}));

const holding: SellableMetalHolding = {
  holdingId: "holding",
  userId: "owner",
  name: "Coin",
  metalType: "GOLD",
  purchaseCurrency: "EGP",
  purchaseCostDecimal: "100",
  purchaseDate: "2026-01-01",
  expectedFinancialRevision: "0",
  predecessorEventId: null,
  weightLabel: "10",
};

it("derives sale P/L solely from recorded purchase-currency facts", (): void => {
  const preview = previewSellMetalHolding(
    holding,
    {
      saleDate: "2026-10-11",
      grossProceedsDecimal: "120",
      feeDecimal: "5",
      notes: "",
      saleCurrency: "EGP",
      hasAcknowledgedRateRisk: false,
    },
    "2026-10-11"
  );
  expect(preview).toMatchObject({
    canSubmit: true,
    realizedProfitLossDecimal: "15",
    requiresRateAcknowledgment: false,
  });
});

it("uses shared money presentation with Arabic number before the currency label", (): void => {
  const preview = previewSellMetalHolding(
    holding,
    {
      saleDate: "2026-10-11",
      grossProceedsDecimal: "120",
      feeDecimal: "5",
      notes: "",
      saleCurrency: "EGP",
      hasAcknowledgedRateRisk: false,
    },
    "2026-10-11"
  );
  expect(
    formatSellMetalHoldingPreview(preview, "EGP", "en").netProceedsLabel
  ).toBe("EGP 115.00");
  expect(
    formatSellMetalHoldingPreview(preview, "EGP", "ar").netProceedsLabel
  ).toMatch(/^١١٥٫٠٠ /);
});

describe("Sell form executor retry evidence", () => {
  const request: SellMetalHoldingFormCommand = {
    holding,
    latestAllowedCalendarDate: "2026-10-11",
    values: {
      saleDate: "2026-10-11",
      grossProceedsDecimal: "120",
      feeDecimal: "5",
      notes: "",
      saleCurrency: "EGP",
      hasAcknowledgedRateRisk: false,
    },
    preview: {
      canSubmit: true,
      netProceedsMinorUnits: "11500",
      validationErrors: {},
    },
    ids: {
      actionId: "action",
      actionEvidenceId: "evidence",
      lifecycleEventId: "event",
    },
  };
  // A genuine WatermelonDB instance crosses the facade boundary. The only
  // mocked dependency is the production command service called by the facade.
  const database = new Database({
    adapter: new SQLiteAdapter({ schema }),
    modelClasses: [Asset],
  });
  const rates = jest.mocked(loadDisposeTerminalRateSnapshots);
  const makeProduction = jest.mocked(createSellMetalHoldingProductionService);
  const assertUser = jest.mocked(assertExpectedCurrentUser);
  beforeEach((): void => {
    jest.clearAllMocks();
    rates.mockReset().mockResolvedValue([]);
    assertUser.mockReset().mockResolvedValue(undefined);
  });
  it("freezes time, payload, and references after an ambiguous write failure", async (): Promise<void> => {
    const sell = jest
      .fn<
        ReturnType<SellMetalHoldingCommandService["sell"]>,
        Parameters<SellMetalHoldingCommandService["sell"]>
      >()
      .mockRejectedValueOnce(new Error("ambiguous_failure"))
      .mockResolvedValueOnce({ kind: "replay", holdingId: holding.holdingId });
    makeProduction.mockReturnValue({ sell });
    const executor = createSellMetalHoldingFormExecutor(database, jest.fn());
    await expect(executor.execute(request)).rejects.toThrow(
      "ambiguous_failure"
    );
    await executor.execute(request);
    expect(sell.mock.calls[1][0]).toBe(sell.mock.calls[0][0]);
    expect(rates).toHaveBeenCalledTimes(1);
    expect(sell.mock.calls[0][0]).toMatchObject({
      saleCurrency: "EGP",
      purchaseCurrency: "EGP",
      rateSnapshots: [],
      grossProceedsMinorUnits: "12000",
      feeMinorUnits: "500",
      netProceedsMinorUnits: "11500",
    });
  });
  it("stores actual inverse EGP evidence for both currency roles, never a fabricated USD identity", async (): Promise<void> => {
    const observed = {
      capturedAt: "2026-10-11T12:00:00.000Z",
      capturedFreshness: "fresh" as const,
      providerObservedAt: "2026-10-11T11:59:00.000Z",
      source: "provider",
      quality: "valid" as const,
    };
    const snapshots: readonly DisposeRateSnapshotDraft[] = [
      {
        ...observed,
        role: "terminal_metal",
        kind: "metal",
        instrumentCode: "metal:GOLD",
        valueDecimal: "100",
        unit: "usd_per_pure_gram",
        orientation: "quote_per_base",
      },
      {
        ...observed,
        role: "terminal_purchase_currency",
        kind: "currency",
        instrumentCode: "currency:EGP",
        valueDecimal: "50",
        unit: "currency_units_per_usd",
        orientation: "base_per_quote",
      },
    ];
    rates.mockResolvedValue(snapshots);
    const sell = jest
      .fn<
        ReturnType<SellMetalHoldingCommandService["sell"]>,
        Parameters<SellMetalHoldingCommandService["sell"]>
      >()
      .mockResolvedValue({ kind: "committed", holdingId: holding.holdingId });
    makeProduction.mockReturnValue({ sell });
    let reference = 0;
    await createSellMetalHoldingFormExecutor(
      database,
      (): string => `reference-${++reference}`
    ).execute(request);
    const captured = sell.mock.calls[0][0];
    expect(captured.rateSnapshots).toEqual([
      expect.objectContaining({
        role: "terminal_metal",
        referenceId: "reference-1",
        valueDecimal: "100",
      }),
      expect.objectContaining({
        role: "terminal_purchase_currency",
        referenceId: "reference-2",
        instrumentCode: "currency:EGP",
        valueDecimal: "50",
        unit: "currency_units_per_usd",
        orientation: "base_per_quote",
      }),
      expect.objectContaining({
        role: "terminal_proceeds_currency",
        referenceId: "reference-3",
        instrumentCode: "currency:EGP",
        valueDecimal: "50",
        unit: "currency_units_per_usd",
        orientation: "base_per_quote",
      }),
    ]);
    expect(captured.saleCurrency).toBe("EGP");
  });
  it("allows missing terminal snapshots but blocks rate-store read failure", async (): Promise<void> => {
    const sell = jest
      .fn<
        ReturnType<SellMetalHoldingCommandService["sell"]>,
        Parameters<SellMetalHoldingCommandService["sell"]>
      >()
      .mockResolvedValue({ kind: "committed", holdingId: holding.holdingId });
    makeProduction.mockReturnValue({ sell });
    rates
      .mockRejectedValueOnce(new Error("rate_store_unavailable"))
      .mockResolvedValueOnce([]);
    const executor = createSellMetalHoldingFormExecutor(database, jest.fn());
    await expect(executor.execute(request)).rejects.toThrow(
      "rate_store_unavailable"
    );
    expect(sell).not.toHaveBeenCalled();
    await executor.execute(request);
    expect(sell).toHaveBeenCalledTimes(1);
  });
  it("blocks forged currency before rate lookup or persistence", async (): Promise<void> => {
    const sell = jest.fn<
      ReturnType<SellMetalHoldingCommandService["sell"]>,
      Parameters<SellMetalHoldingCommandService["sell"]>
    >();
    makeProduction.mockReturnValue({ sell });
    const executor = createSellMetalHoldingFormExecutor(database, jest.fn());
    await expect(
      executor.execute({
        ...request,
        values: { ...request.values, saleCurrency: "USD" },
      })
    ).rejects.toThrow("metal_sale_currency_mismatch");
    expect(rates).not.toHaveBeenCalled();
    expect(sell).not.toHaveBeenCalled();
  });
  it("checks the owner again after asynchronous evidence preparation", async (): Promise<void> => {
    const sell = jest.fn<
      ReturnType<SellMetalHoldingCommandService["sell"]>,
      Parameters<SellMetalHoldingCommandService["sell"]>
    >();
    makeProduction.mockReturnValue({ sell });
    assertUser
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("financial_action_auth_scope_changed"));
    await expect(
      createSellMetalHoldingFormExecutor(database, jest.fn()).execute(request)
    ).rejects.toThrow("financial_action_auth_scope_changed");
    expect(sell).not.toHaveBeenCalled();
  });
});
