import { act, renderHook } from "@testing-library/react-native";

import type {
  EditMetalHoldingReadModel,
  EditMetalHoldingSubmission,
} from "../../services/edit-metal-holding-facade-service";

const mockLoadEditableMetalHolding = jest.fn<
  Promise<EditMetalHoldingReadModel>,
  [string]
>();
const mockSaveEditedMetalHolding = jest.fn<
  Promise<void>,
  [EditMetalHoldingSubmission]
>();
const mockRetryMetalHoldingReconciliation = jest.fn<Promise<void>, [unknown]>();

jest.mock("../../services/edit-metal-holding-facade-service", () => ({
  loadEditableMetalHolding: (id: string): Promise<EditMetalHoldingReadModel> =>
    mockLoadEditableMetalHolding(id),
  saveEditedMetalHolding: (
    submission: EditMetalHoldingSubmission
  ): Promise<void> => mockSaveEditedMetalHolding(submission),
  retryMetalHoldingReconciliation: (database: unknown): Promise<void> =>
    mockRetryMetalHoldingReconciliation(database),
}));

const mockDatabase = { __stubDatabase: true };

jest.mock("../../providers/DatabaseProvider", () => ({
  useDatabase: (): typeof mockDatabase => mockDatabase,
}));

import {
  useEditMetalHolding,
  type UseEditMetalHoldingInput,
} from "../../hooks/useEditMetalHolding";

function incompleteModel(): EditMetalHoldingReadModel {
  return {
    holdingId: "018f0c7a-1234-7abc-8def-000000000010",
    financialRevision: "0",
    predecessorEventId: "018f0c7a-1234-7abc-8def-000000000011",
    status: "active",
    reconciliationState: "reconciliation_incomplete",
    hasCompleteMaterialFacts: true,
    facts: {
      name: "Active Gold Sovereign",
      notes: "Initial note",
      metal: "GOLD",
      weightGramsDecimal: "8",
      purityCode: "gold-999",
      purityCatalogVersion: "1",
      purityFactorDecimal: "0.999",
      purchasePriceDecimal: "32000",
      purchaseCurrency: "EGP",
      purchaseDate: "2026-08-01",
      physicalForm: "COIN",
    },
    persistedMaterialFacts: {
      weightGramsDecimal: "8",
      purityCode: "gold-999",
      purityCatalogVersion: "1",
      purityFactorDecimal: "0.999",
      purchasePriceDecimal: "32000",
      purchaseCurrency: "EGP",
      purchaseDate: "2026-08-01",
      physicalForm: "COIN",
    },
  };
}

function testInput(): UseEditMetalHoldingInput {
  let id = 0;
  return {
    holdingId: "018f0c7a-1234-7abc-8def-000000000010",
    locale: "en",
    today: "2026-09-01",
    safeRange: {
      maximumWeightGramsDecimal: "999999999.999",
      maximumPurchasePriceDecimal: "999999999999999.99",
    },
    getPreviewRates: () => ({
      metalUsdPerPureGramDecimal: "100",
      currencyUsdPerUnitDecimal: "0.02",
      egpUsdPerUnitDecimal: "0.02",
      currencyMinorUnits: 2,
      rateFreshness: "fresh",
    }),
    createId: () => `018f0c7a-1234-7abc-8def-${String(++id).padStart(12, "0")}`,
  };
}

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useEditMetalHolding reconciliation retry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveEditedMetalHolding.mockResolvedValue(undefined);
    mockRetryMetalHoldingReconciliation.mockReset();
    mockRetryMetalHoldingReconciliation.mockResolvedValue(undefined);
  });

  it("invokes reconciliation sync before reloading local state on reconciliation retry", async () => {
    const callOrder: string[] = [];
    mockLoadEditableMetalHolding.mockImplementation(() => {
      callOrder.push("load");
      return Promise.resolve(incompleteModel());
    });
    mockRetryMetalHoldingReconciliation.mockImplementation(() => {
      callOrder.push("sync");
      return Promise.resolve();
    });
    const { result } = renderHook(() => useEditMetalHolding(testInput()));
    await flushPromises();

    expect(mockLoadEditableMetalHolding).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.retryReconciliation();
    });
    await flushPromises();

    expect(mockRetryMetalHoldingReconciliation).toHaveBeenCalledTimes(1);
    expect(mockRetryMetalHoldingReconciliation).toHaveBeenCalledWith(
      mockDatabase
    );
    expect(mockLoadEditableMetalHolding).toHaveBeenCalledTimes(2);
    expect(callOrder).toEqual(["load", "sync", "load"]);
    expect(result.current.model?.reconciliationState).toBe(
      "reconciliation_incomplete"
    );
    expect(result.current.reconciliationRetryError).toBeNull();
    expect(result.current.isRetryingReconciliation).toBe(false);
  });

  it("surfaces sync failure explicitly and still reloads local state", async () => {
    mockLoadEditableMetalHolding.mockResolvedValue(incompleteModel());
    mockRetryMetalHoldingReconciliation.mockRejectedValueOnce(
      new Error("sync_offline")
    );
    const { result } = renderHook(() => useEditMetalHolding(testInput()));
    await flushPromises();

    await act(async () => {
      await result.current.retryReconciliation();
    });
    await flushPromises();

    expect(mockRetryMetalHoldingReconciliation).toHaveBeenCalledTimes(1);
    expect(mockLoadEditableMetalHolding).toHaveBeenCalledTimes(2);
    expect(result.current.reconciliationRetryError?.message).toBe(
      "sync_offline"
    );
    expect(result.current.isRetryingReconciliation).toBe(false);
    expect(result.current.model?.facts.name).toBe("Active Gold Sovereign");
  });

  it("exposes retry loading state and guards concurrent retries", async () => {
    mockLoadEditableMetalHolding.mockResolvedValue(incompleteModel());
    let resolveRetry: (() => void) | null = null;
    mockRetryMetalHoldingReconciliation.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        })
    );
    const { result } = renderHook(() => useEditMetalHolding(testInput()));
    await flushPromises();

    let firstRetry: Promise<void> | null = null;
    act(() => {
      firstRetry = result.current.retryReconciliation();
      void result.current.retryReconciliation();
    });
    expect(result.current.isRetryingReconciliation).toBe(true);

    await act(async () => {
      resolveRetry?.();
      await firstRetry;
    });
    await flushPromises();

    expect(mockRetryMetalHoldingReconciliation).toHaveBeenCalledTimes(1);
    expect(result.current.isRetryingReconciliation).toBe(false);
  });

  it("re-reads local state on a plain retry without any network sync", async () => {
    mockLoadEditableMetalHolding.mockResolvedValue(incompleteModel());
    const { result } = renderHook(() => useEditMetalHolding(testInput()));
    await flushPromises();

    expect(mockLoadEditableMetalHolding).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retry();
    });
    await flushPromises();

    expect(mockRetryMetalHoldingReconciliation).not.toHaveBeenCalled();
    expect(result.current.isRetryingReconciliation).toBe(false);
    expect(result.current.reconciliationRetryError).toBeNull();
    expect(mockLoadEditableMetalHolding).toHaveBeenCalledTimes(2);
  });

  it("settles an in-flight reconciliation sync after unmount without re-entering local reads", async () => {
    mockLoadEditableMetalHolding.mockResolvedValue(incompleteModel());
    let resolveRetry: (() => void) | null = null;
    mockRetryMetalHoldingReconciliation.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        })
    );
    const { result, unmount } = renderHook(() =>
      useEditMetalHolding(testInput())
    );
    await flushPromises();

    let pendingRetry: Promise<void> | null = null;
    act(() => {
      pendingRetry = result.current.retryReconciliation();
    });
    expect(result.current.isRetryingReconciliation).toBe(true);
    expect(mockRetryMetalHoldingReconciliation).toHaveBeenCalledTimes(1);
    expect(mockRetryMetalHoldingReconciliation).toHaveBeenCalledWith(
      mockDatabase
    );

    unmount();

    await act(async () => {
      resolveRetry?.();
      await pendingRetry;
    });

    // Observable contract across unmount: the deferred reconciliation request
    // settles exactly once and no re-entrant local read runs. React 18+
    // silently drops state updates on unmounted trees, so the state-update
    // suppression itself has no reliable observable signal; this asserts what
    // can be observed honestly.
    expect(mockRetryMetalHoldingReconciliation).toHaveBeenCalledTimes(1);
    expect(mockLoadEditableMetalHolding).toHaveBeenCalledTimes(1);
  });
});
