import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useDisposeMetalHolding } from "@/hooks/useDisposeMetalHolding";
import type { DisposeMetalHoldingCommandInput } from "@/services/dispose-metal-holding-command-service";

interface HookHolding {
  readonly holdingId: string;
  readonly name: string;
  readonly userId: string;
  readonly status: "active" | "sold" | "disposed";
  readonly expectedFinancialRevision: string;
  readonly predecessorEventId: string;
  readonly purchaseDate: string;
}

interface HookRateDraft {
  readonly role: "terminal_metal" | "terminal_purchase_currency";
  readonly kind: "metal" | "currency";
  readonly instrumentCode: string;
  readonly valueDecimal: string;
  readonly unit:
    | "usd_per_pure_gram"
    | "usd_per_currency_unit"
    | "currency_units_per_usd";
  readonly orientation: "quote_per_base" | "base_per_quote";
  readonly providerObservedAt: string | null;
  readonly source: string | null;
  readonly quality: "valid";
  readonly capturedFreshness: "fresh" | "stale" | "unknown";
  readonly capturedAt: string;
}

interface HookDependencies {
  readonly loadHolding: (holdingId: string) => Promise<HookHolding>;
  readonly loadTerminalRateSnapshots: (
    holdingId: string,
    disposalDate: string
  ) => Promise<readonly HookRateDraft[]>;
  readonly disposeHolding: (
    input: DisposeMetalHoldingCommandInput
  ) => Promise<unknown>;
}

const holding: HookHolding = {
  holdingId: "holding-1",
  name: "Wedding coin",
  userId: "user-1",
  status: "active",
  expectedFinancialRevision: "0",
  predecessorEventId: "event-1",
  purchaseDate: "2024-03-14",
};

describe("useDisposeMetalHolding lifecycle", () => {
  function createDependencies(
    disposeHolding: HookDependencies["disposeHolding"] = jest.fn(() =>
      Promise.resolve({ kind: "committed" })
    ),
    loadTerminalRateSnapshots: HookDependencies["loadTerminalRateSnapshots"] = jest.fn(
      () => Promise.resolve([])
    )
  ): HookDependencies {
    return {
      loadHolding: jest.fn(() => Promise.resolve(holding)),
      loadTerminalRateSnapshots,
      disposeHolding,
    };
  }

  it("validates required category and conditional Other treatment while notes remain optional", async (): Promise<void> => {
    const dependencies = createDependencies();
    const { result } = renderHook(() =>
      useDisposeMetalHolding({
        holdingId: holding.holdingId,
        today: "2026-09-05",
        createId: jest.fn(() => "stable-id"),
        dependencies,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(false);
    });
    expect(result.current.validationErrors.category).toBe(
      "dispose_category_required"
    );
    act((): void => result.current.setCategory("other"));
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(false);
    });
    expect(result.current.validationErrors.treatment).toBe(
      "dispose_other_treatment_required"
    );
    act((): void => result.current.setOtherTreatment("write_off"));
    expect(result.current.treatment).toBe("write_off");
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(true);
    });
    expect(dependencies.disposeHolding).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: null,
        category: "other",
        otherTreatment: "write_off",
      })
    );
  });

  it("blocks double submit, preserves facts on error, and retries the complete original command", async (): Promise<void> => {
    let rejectFirst: ((reason: Error) => void) | null = null;
    const firstAttempt = new Promise((_resolve, reject): void => {
      rejectFirst = reject;
    });
    const disposeHolding = jest
      .fn<
        ReturnType<HookDependencies["disposeHolding"]>,
        Parameters<HookDependencies["disposeHolding"]>
      >()
      .mockReturnValueOnce(firstAttempt)
      .mockResolvedValueOnce({ kind: "committed" });
    const dependencies = createDependencies(disposeHolding);
    const ids = ["action-1", "evidence-1", "event-1"];
    const createId = jest.fn(() => ids.shift() ?? "unexpected-id");
    const { result } = renderHook(() =>
      useDisposeMetalHolding({
        holdingId: holding.holdingId,
        today: "2026-09-05",
        createId,
        dependencies,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act((): void => {
      result.current.setCategory("donated");
      result.current.setNotes("Family gift");
    });
    let first!: Promise<boolean>;
    let duplicate!: Promise<boolean>;
    act((): void => {
      first = result.current.submit();
      duplicate = result.current.submit();
    });
    expect(disposeHolding).toHaveBeenCalledTimes(1);
    await act(async (): Promise<void> => {
      rejectFirst?.(new Error("disk_full"));
      await expect(first).resolves.toBe(false);
      await expect(duplicate).resolves.toBe(false);
    });
    expect(result.current).toMatchObject({
      category: "donated",
      notes: "Family gift",
      submitError: "disk_full",
      isSubmitting: false,
    });
    const firstRequest = disposeHolding.mock.calls[0][0];
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(true);
    });
    expect(disposeHolding).toHaveBeenCalledTimes(2);
    expect(disposeHolding.mock.calls[1][0]).toBe(firstRequest);
    expect(createId).toHaveBeenCalledTimes(3);
  });

  it("contains ID generation failures and releases the pending lock", async (): Promise<void> => {
    const dependencies = createDependencies();
    const createId = jest.fn(() => {
      throw new Error("secure_random_unavailable");
    });
    const { result } = renderHook(() =>
      useDisposeMetalHolding({
        holdingId: holding.holdingId,
        today: "2026-09-05",
        createId,
        dependencies,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act((): void => result.current.setCategory("donated"));

    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(false);
    });
    expect(result.current).toMatchObject({
      isSubmitting: false,
      submitError: "secure_random_unavailable",
    });
    expect(dependencies.disposeHolding).not.toHaveBeenCalled();
  });

  it("reports invalid dates and reloads after a recoverable load failure", async (): Promise<void> => {
    const loadHolding = jest
      .fn<Promise<HookHolding>, [string]>()
      .mockRejectedValueOnce(new Error("load_failed"))
      .mockResolvedValueOnce(holding);
    const dependencies: HookDependencies = {
      loadHolding,
      loadTerminalRateSnapshots: jest.fn(() => Promise.resolve([])),
      disposeHolding: jest.fn(() => Promise.resolve({ kind: "committed" })),
    };
    const { result } = renderHook(() =>
      useDisposeMetalHolding({
        holdingId: holding.holdingId,
        today: "2026-09-05",
        createId: jest.fn(() => "stable-id"),
        dependencies,
      })
    );
    await waitFor(() => expect(result.current.loadError).toBe("load_failed"));
    act((): void => result.current.retryLoad());
    await waitFor(() => expect(result.current.model).toEqual(holding));
    act((): void => {
      result.current.setCategory("donated");
      result.current.setDisposalDate("2026-09-06");
    });
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(false);
    });
    expect(result.current.validationErrors.disposalDate).toBe(
      "dispose_date_invalid"
    );
    expect(dependencies.disposeHolding).not.toHaveBeenCalled();
  });

  it("rejects a disposal date before the holding acquisition date", async (): Promise<void> => {
    const dependencies = createDependencies();
    const { result } = renderHook(() =>
      useDisposeMetalHolding({
        holdingId: holding.holdingId,
        today: "2026-09-05",
        createId: jest.fn(() => "stable-id"),
        dependencies,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act((): void => {
      result.current.setCategory("donated");
      result.current.setDisposalDate("2024-03-13");
    });
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(false);
    });
    expect(result.current.validationErrors.disposalDate).toBe(
      "dispose_date_before_acquisition"
    );
    expect(dependencies.disposeHolding).not.toHaveBeenCalled();
  });

  it("rebuilds the retained command when the requested holding changes", async (): Promise<void> => {
    const secondHolding: HookHolding = {
      ...holding,
      holdingId: "holding-2",
      predecessorEventId: "event-2",
      expectedFinancialRevision: "3",
    };
    let rejectFirst: ((reason: Error) => void) | null = null;
    const firstAttempt = new Promise((_resolve, reject): void => {
      rejectFirst = reject;
    });
    const disposeHolding = jest
      .fn<
        ReturnType<HookDependencies["disposeHolding"]>,
        Parameters<HookDependencies["disposeHolding"]>
      >()
      .mockReturnValueOnce(firstAttempt)
      .mockResolvedValueOnce({ kind: "committed" });
    const dependencies: HookDependencies = {
      loadHolding: jest.fn(
        (holdingId: string): Promise<HookHolding> =>
          Promise.resolve(holdingId === "holding-1" ? holding : secondHolding)
      ),
      loadTerminalRateSnapshots: jest.fn(() => Promise.resolve([])),
      disposeHolding,
    };
    const { result, rerender } = renderHook(
      ({ holdingId }: { readonly holdingId: string }) =>
        useDisposeMetalHolding({
          holdingId,
          today: "2026-09-05",
          createId: jest.fn((): string => "stable-id"),
          dependencies,
        }),
      { initialProps: { holdingId: "holding-1" } }
    );
    await waitFor(() =>
      expect(result.current.model?.holdingId).toBe("holding-1")
    );
    act((): void => result.current.setCategory("donated"));
    await act(async (): Promise<void> => {
      const first = result.current.submit();
      rejectFirst?.(new Error("disk_full"));
      await expect(first).resolves.toBe(false);
    });
    expect(result.current.submitError).toBe("disk_full");
    rerender({ holdingId: "holding-2" });
    await waitFor(() =>
      expect(result.current.model?.holdingId).toBe("holding-2")
    );
    expect(result.current.category).toBeNull();
    act((): void => result.current.setCategory("lost_or_stolen"));
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(true);
    });
    expect(disposeHolding).toHaveBeenCalledTimes(2);
    expect(disposeHolding.mock.calls[1][0]).toMatchObject({
      holdingId: "holding-2",
      predecessorEventId: "event-2",
      expectedFinancialRevision: "3",
      category: "lost_or_stolen",
    });
  });

  it("does not reload when the dependency container identity changes but its members are stable", async (): Promise<void> => {
    const loadHolding = jest.fn(
      (): Promise<HookHolding> => Promise.resolve(holding)
    );
    const loadTerminalRateSnapshots = jest.fn(
      (): Promise<readonly HookRateDraft[]> => Promise.resolve([])
    );
    const disposeHolding = jest.fn(() =>
      Promise.resolve({ kind: "committed" })
    );
    const stable: HookDependencies = {
      loadHolding,
      loadTerminalRateSnapshots,
      disposeHolding,
    };
    const { rerender } = renderHook(
      ({ dependencies }: { readonly dependencies: HookDependencies }) =>
        useDisposeMetalHolding({
          holdingId: holding.holdingId,
          today: "2026-09-05",
          createId: jest.fn((): string => "stable-id"),
          dependencies,
        }),
      { initialProps: { dependencies: stable } }
    );
    await waitFor(() => expect(loadHolding).toHaveBeenCalledTimes(1));
    rerender({ dependencies: { ...stable } });
    await act(async (): Promise<void> => {
      await Promise.resolve();
    });
    expect(loadHolding).toHaveBeenCalledTimes(1);
    expect(loadTerminalRateSnapshots).toHaveBeenCalledTimes(1);
  });

  it("blocks submission when notes exceed the UTF-8 byte limit before dispatch", async (): Promise<void> => {
    const dependencies = createDependencies();
    const { result } = renderHook(() =>
      useDisposeMetalHolding({
        holdingId: holding.holdingId,
        today: "2026-09-05",
        createId: jest.fn((): string => "stable-id"),
        dependencies,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act((): void => {
      result.current.setCategory("donated");
      result.current.setNotes("x".repeat(4097));
    });
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(false);
    });
    expect(result.current.validationErrors.notes).toBe(
      "dispose_notes_too_long"
    );
    expect(dependencies.disposeHolding).not.toHaveBeenCalled();
  });
});
