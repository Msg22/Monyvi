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

function rateDrafts(
  metalFreshness: "fresh" | "stale" | "unknown",
  currencyFreshness: "fresh" | "stale" | "unknown"
): HookRateDraft[] {
  return [
    {
      role: "terminal_metal",
      kind: "metal",
      instrumentCode: "metal:GOLD",
      valueDecimal: "3600",
      unit: "usd_per_pure_gram",
      orientation: "quote_per_base",
      providerObservedAt: "2026-09-05T09:00:00.000Z",
      source: "provider-a",
      quality: "valid",
      capturedFreshness: metalFreshness,
      capturedAt: "2026-09-05T10:00:00.000Z",
    },
    {
      role: "terminal_purchase_currency",
      kind: "currency",
      instrumentCode: "currency:EGP",
      valueDecimal: "0.02",
      unit: "usd_per_currency_unit",
      orientation: "quote_per_base",
      providerObservedAt: "2026-09-05T09:00:00.000Z",
      source: "provider-b",
      quality: "valid",
      capturedFreshness: currencyFreshness,
      capturedAt: "2026-09-05T10:00:00.000Z",
    },
  ];
}

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

  it("blocks submission until stale or unknown terminal rates are acknowledged and captures the pair with stable ids", async (): Promise<void> => {
    const dependencies = createDependencies(
      undefined,
      jest.fn(() => Promise.resolve(rateDrafts("stale", "unknown")))
    );
    const ids = [
      "action-1",
      "evidence-1",
      "event-1",
      "rate-metal",
      "rate-currency",
    ];
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
    expect(result.current.terminalRates).toHaveLength(2);
    expect(result.current.requiresRateAcknowledgment).toBe(true);
    act((): void => result.current.setCategory("donated"));
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(false);
    });
    expect(result.current.validationErrors.rateAcknowledgment).toBe(
      "dispose_rate_acknowledgment_required"
    );
    expect(dependencies.disposeHolding).not.toHaveBeenCalled();
    act((): void => result.current.setRateAcknowledged(true));
    expect(result.current.validationErrors.rateAcknowledgment).toBeUndefined();
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(true);
    });
    expect(dependencies.disposeHolding).toHaveBeenCalledWith(
      expect.objectContaining({
        rateSnapshots: [
          expect.objectContaining({
            referenceId: "rate-metal",
            role: "terminal_metal",
            capturedFreshness: "stale",
          }),
          expect.objectContaining({
            referenceId: "rate-currency",
            role: "terminal_purchase_currency",
            capturedFreshness: "unknown",
          }),
        ],
      })
    );
  });

  it("requires acknowledgment after loaded references become stale while the form remains open", async (): Promise<void> => {
    const dependencies = createDependencies(
      undefined,
      jest.fn(() => Promise.resolve(rateDrafts("fresh", "fresh")))
    );
    let currentNowMs = Date.parse("2026-09-05T10:00:00.000Z");
    const nowMs = jest.fn(() => currentNowMs);
    const { result } = renderHook(() =>
      useDisposeMetalHolding({
        holdingId: holding.holdingId,
        today: "2026-09-05",
        createId: jest.fn((): string => "stable-id"),
        nowMs,
        dependencies,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.terminalRateTrust).toEqual([
      { role: "terminal_metal", currentFreshness: "fresh" },
      { role: "terminal_purchase_currency", currentFreshness: "fresh" },
    ]);
    expect(result.current.requiresRateAcknowledgment).toBe(false);
    currentNowMs = Date.parse("2026-09-06T09:00:00.001Z");
    act((): void => result.current.setCategory("donated"));
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(false);
    });
    expect(result.current.validationErrors.rateAcknowledgment).toBe(
      "dispose_rate_acknowledgment_required"
    );
    expect(result.current.terminalRateTrust).toEqual([
      { role: "terminal_metal", currentFreshness: "stale" },
      { role: "terminal_purchase_currency", currentFreshness: "stale" },
    ]);
    expect(result.current.requiresRateAcknowledgment).toBe(true);
    expect(dependencies.disposeHolding).not.toHaveBeenCalled();
    act((): void => result.current.setRateAcknowledged(true));
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(true);
    });
    expect(dependencies.disposeHolding).toHaveBeenCalledWith(
      expect.objectContaining({
        rateSnapshots: [
          expect.objectContaining({
            capturedFreshness: "fresh",
            providerObservedAt: "2026-09-05T09:00:00.000Z",
          }),
          expect.objectContaining({
            capturedFreshness: "fresh",
            providerObservedAt: "2026-09-05T09:00:00.000Z",
          }),
        ],
      })
    );
  });

  it("submits fresh terminal rate pairs without acknowledgment", async (): Promise<void> => {
    const dependencies = createDependencies(
      undefined,
      jest.fn(() => Promise.resolve(rateDrafts("fresh", "fresh")))
    );
    const { result } = renderHook(() =>
      useDisposeMetalHolding({
        holdingId: holding.holdingId,
        today: "2026-09-05",
        createId: jest.fn((): string => "stable-id"),
        nowMs: () => Date.parse("2026-09-05T10:00:00.000Z"),
        dependencies,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.requiresRateAcknowledgment).toBe(false);
    act((): void => result.current.setCategory("donated"));
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(true);
    });
    expect(dependencies.disposeHolding).toHaveBeenCalledWith(
      expect.objectContaining({
        rateSnapshots: [
          expect.objectContaining({ role: "terminal_metal" }),
          expect.objectContaining({ role: "terminal_purchase_currency" }),
        ],
      })
    );
  });

  it("falls back to no terminal rate evidence for a partial pair", async (): Promise<void> => {
    const dependencies = createDependencies(
      undefined,
      jest.fn(() => Promise.resolve(rateDrafts("fresh", "fresh").slice(0, 1)))
    );
    const { result } = renderHook(() =>
      useDisposeMetalHolding({
        holdingId: holding.holdingId,
        today: "2026-09-05",
        createId: jest.fn((): string => "stable-id"),
        dependencies,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.terminalRates).toEqual([]);
    expect(result.current.requiresRateAcknowledgment).toBe(false);
    act((): void => result.current.setCategory("donated"));
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(true);
    });
    expect(dependencies.disposeHolding).toHaveBeenCalledWith(
      expect.objectContaining({ rateSnapshots: [] })
    );
  });

  it("reloads terminal-rate evidence for the selected disposal date", async (): Promise<void> => {
    const loadTerminalRateSnapshots = jest.fn(
      (
        holdingId: string,
        disposalDate: string
      ): Promise<readonly HookRateDraft[]> => {
        expect(holdingId).toBe(holding.holdingId);
        return Promise.resolve(
          disposalDate === "2026-09-05"
            ? rateDrafts("fresh", "fresh")
            : rateDrafts("stale", "stale")
        );
      }
    );
    const dependencies = createDependencies(
      undefined,
      loadTerminalRateSnapshots
    );
    const { result } = renderHook(() =>
      useDisposeMetalHolding({
        holdingId: holding.holdingId,
        today: "2026-09-05",
        createId: jest.fn((): string => "stable-id"),
        dependencies,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(loadTerminalRateSnapshots).toHaveBeenCalledWith(
      holding.holdingId,
      "2026-09-05"
    );
    act((): void => {
      result.current.setCategory("donated");
      result.current.setDisposalDate("2026-09-03");
    });
    await waitFor(() =>
      expect(loadTerminalRateSnapshots).toHaveBeenCalledWith(
        holding.holdingId,
        "2026-09-03"
      )
    );
    await waitFor(() =>
      expect(
        result.current.terminalRates.map((rate) => rate.capturedFreshness)
      ).toEqual(["stale", "stale"])
    );
    expect(result.current.terminalRates).toHaveLength(2);
    expect(result.current.requiresRateAcknowledgment).toBe(true);
  });

  it("retains the original command across a retryLoad reload for idempotent replay", async (): Promise<void> => {
    const disposeHolding = jest
      .fn<
        ReturnType<HookDependencies["disposeHolding"]>,
        Parameters<HookDependencies["disposeHolding"]>
      >()
      .mockRejectedValueOnce(new Error("disk_full"))
      .mockResolvedValueOnce({ kind: "committed" });
    const dependencies = createDependencies(disposeHolding);
    const { result } = renderHook(() =>
      useDisposeMetalHolding({
        holdingId: holding.holdingId,
        today: "2026-09-05",
        createId: jest.fn((): string => "stable-id"),
        dependencies,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act((): void => result.current.setCategory("donated"));
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(false);
    });
    const retained = disposeHolding.mock.calls[0][0];
    act((): void => result.current.retryLoad());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(true);
    });
    expect(disposeHolding).toHaveBeenCalledTimes(2);
    expect(disposeHolding.mock.calls[1][0]).toBe(retained);
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

  it("reports a terminal rate loader failure separately and blocks submission until it is retried", async (): Promise<void> => {
    const loadTerminalRateSnapshots = jest
      .fn<Promise<readonly HookRateDraft[]>, [string, string]>()
      .mockRejectedValueOnce(new Error("rate_store_unavailable"))
      .mockResolvedValue([]);
    const dependencies = createDependencies(
      undefined,
      loadTerminalRateSnapshots
    );
    const { result } = renderHook(() =>
      useDisposeMetalHolding({
        holdingId: holding.holdingId,
        today: "2026-09-05",
        createId: jest.fn((): string => "stable-id"),
        dependencies,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.loadError).toBeNull();
    expect(result.current.terminalRates).toEqual([]);
    expect(result.current.rateEvidenceError).toBe("rate_store_unavailable");
    act((): void => result.current.setCategory("donated"));
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(false);
    });
    expect(result.current.validationErrors.rateEvidence).toBe(
      "dispose_rate_evidence_unavailable"
    );
    expect(dependencies.disposeHolding).not.toHaveBeenCalled();

    act((): void => result.current.retryLoad());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rateEvidenceError).toBeNull();
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(true);
    });
    expect(dependencies.disposeHolding).toHaveBeenCalledTimes(1);
  });
});
