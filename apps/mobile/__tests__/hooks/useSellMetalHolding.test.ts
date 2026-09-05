import { act, renderHook, waitFor } from "@testing-library/react-native";

interface SellValues {
  readonly saleDate: string;
  readonly grossProceedsDecimal: string;
  readonly saleCurrency: string;
  readonly feeDecimal: string;
  readonly notes: string;
  readonly hasAcknowledgedRateRisk: boolean;
}

type SellField = keyof SellValues;

interface SellPreview {
  readonly validationErrors: Readonly<Record<string, string>>;
  readonly netProceedsMinorUnits: string | null;
  readonly canSubmit: boolean;
}

interface SellRequestIds {
  readonly actionId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
}

interface SellCommand {
  readonly values: SellValues;
  readonly preview: SellPreview;
  readonly ids: SellRequestIds;
}

interface UseSellMetalHoldingInput {
  readonly initialValues: SellValues;
  readonly buildPreview: (values: SellValues) => SellPreview;
  readonly createCommand: (
    values: SellValues,
    preview: SellPreview,
    ids: SellRequestIds
  ) => SellCommand;
  readonly execute: (command: SellCommand) => Promise<void>;
  readonly createId: () => string;
}

interface UseSellMetalHoldingResult {
  readonly values: SellValues;
  readonly preview: SellPreview;
  readonly validationErrors: Readonly<Record<string, string>>;
  readonly isDirty: boolean;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly updateField: (field: SellField, value: string | boolean) => void;
  readonly submit: () => Promise<boolean>;
  readonly retry: () => Promise<boolean>;
}

interface UseSellMetalHoldingModule {
  readonly useSellMetalHolding: (
    input: UseSellMetalHoldingInput
  ) => UseSellMetalHoldingResult;
}

const INITIAL_VALUES: SellValues = {
  saleDate: "2026-08-27",
  grossProceedsDecimal: "170000",
  saleCurrency: "EGP",
  feeDecimal: "500",
  notes: "",
  hasAcknowledgedRateRisk: false,
};

function preview(values: SellValues): SellPreview {
  const hasGross = Number(values.grossProceedsDecimal) > 0;
  return {
    validationErrors: hasGross
      ? {}
      : { grossProceedsDecimal: "gross_required" },
    netProceedsMinorUnits: hasGross ? "16950000" : null,
    canSubmit: hasGross,
  };
}

function loadHook(): UseSellMetalHoldingModule {
  return jest.requireActual<UseSellMetalHoldingModule>(
    "../../hooks/useSellMetalHolding"
  );
}

function setup(overrides: Partial<UseSellMetalHoldingInput> = {}): {
  readonly result: { readonly current: UseSellMetalHoldingResult };
  readonly input: UseSellMetalHoldingInput;
} {
  let id = 0;
  const input: UseSellMetalHoldingInput = {
    initialValues: INITIAL_VALUES,
    buildPreview: jest.fn(preview),
    createCommand: jest.fn((values, result, ids) => ({
      values,
      preview: result,
      ids,
    })),
    execute: jest.fn(() => Promise.resolve()),
    createId: jest.fn(() => `sale-id-${++id}`),
    ...overrides,
  };
  const hook = renderHook(() => loadHook().useSellMetalHolding(input));
  return { ...hook, input };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useSellMetalHolding", () => {
  it("rebuilds exact live preview from immutable form updates", () => {
    const { result, input } = setup();

    act(() => result.current.updateField("grossProceedsDecimal", "175000"));

    expect(result.current.values).toEqual({
      ...INITIAL_VALUES,
      grossProceedsDecimal: "175000",
    });
    expect(input.buildPreview).toHaveBeenLastCalledWith({
      ...INITIAL_VALUES,
      grossProceedsDecimal: "175000",
    });
    expect(result.current.isDirty).toBe(true);
  });

  it("blocks invalid submission and exposes deterministic field errors", async () => {
    const { result, input } = setup();
    act(() => result.current.updateField("grossProceedsDecimal", "0"));

    await expect(result.current.submit()).resolves.toBe(false);

    expect(result.current.validationErrors).toEqual({
      grossProceedsDecimal: "gross_required",
    });
    expect(input.execute).not.toHaveBeenCalled();
  });

  it("guards a pending direct submit against double taps", async () => {
    const pending = deferred<void>();
    const execute = jest.fn(() => pending.promise);
    const { result } = setup({ execute });

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.submit();
      second = result.current.submit();
    });

    await expect(second).resolves.toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.current.isSubmitting).toBe(true);

    await act(async () => {
      pending.resolve(undefined);
      await expect(first).resolves.toBe(true);
    });
    expect(result.current.isSubmitting).toBe(false);
  });

  it("preserves values and action identity after failure so retry stays idempotent", async () => {
    const execute = jest
      .fn<Promise<void>, [SellCommand]>()
      .mockRejectedValueOnce(new Error("local_write_failed"))
      .mockResolvedValueOnce(undefined);
    const { result, input } = setup({ execute });

    await act(async () => {
      await expect(result.current.submit()).resolves.toBe(false);
    });
    expect(result.current.submitError).toBe("local_write_failed");
    expect(result.current.values).toEqual(INITIAL_VALUES);

    await act(async () => {
      await expect(result.current.retry()).resolves.toBe(true);
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1][0].ids).toEqual(execute.mock.calls[0][0].ids);
    expect(input.createId).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(result.current.submitError).toBeNull());
  });
});
