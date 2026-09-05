import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";
import { AccessibilityInfo } from "react-native";
import * as ReactNative from "react-native";

interface DeleteMetalHoldingSheetCopy {
  readonly title: string;
  readonly consequence: string;
  readonly currentValue: string;
  readonly performance: string;
  readonly confirm: string;
  readonly pending: string;
  readonly cancel: string;
  readonly retry: string;
  readonly offline: string;
  readonly accessibilityLabel: string;
}

interface DeleteMetalHoldingSheetProps {
  readonly visible: boolean;
  readonly holding: {
    readonly name: string;
    readonly description: string;
    readonly weightLabel: string;
    readonly currentValueLabel: string;
    readonly performanceLabel: string;
  };
  readonly copy: DeleteMetalHoldingSheetCopy;
  readonly width: number;
  readonly fontScale: number;
  readonly bottomInset: number;
  readonly isRtl: boolean;
  readonly isOffline: boolean;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
}

interface DeleteMetalHoldingSheetModule {
  readonly DeleteMetalHoldingSheet: React.ComponentType<DeleteMetalHoldingSheetProps>;
}

interface DeleteRequestIds {
  readonly actionId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
}

interface DeleteCommand {
  readonly ids: DeleteRequestIds;
}

interface UseDeleteMetalHoldingInput {
  readonly createCommand: (ids: DeleteRequestIds) => DeleteCommand;
  readonly execute: (command: DeleteCommand) => Promise<void>;
  readonly createId: () => string;
}

interface UseDeleteMetalHoldingResult {
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly submit: () => Promise<boolean>;
  readonly retry: () => Promise<boolean>;
}

interface UseDeleteMetalHoldingModule {
  readonly useDeleteMetalHolding: (
    input: UseDeleteMetalHoldingInput
  ) => UseDeleteMetalHoldingResult;
}

interface DeleteActionModule {
  readonly createDeleteHoldingActionDescriptor: (holdingId: string) => {
    readonly id: "delete";
    readonly labelKey: "actions.delete";
    readonly tone: "danger";
    readonly href: {
      readonly pathname: "/(private)/metals/[holdingId]/delete";
      readonly params: { readonly holdingId: string };
    };
  };
}

const copy: DeleteMetalHoldingSheetCopy = {
  title: "Delete holding?",
  consequence:
    "Only delete a holding added by mistake. It will be removed from your portfolio and History. Sell and No Longer are separate actions.",
  currentValue: "Current value",
  performance: "Since purchase",
  confirm: "Delete holding",
  pending: "Deleting holding…",
  cancel: "Cancel",
  retry: "Try again",
  offline: "Saved locally first",
  accessibilityLabel: "Delete holding Wedding coin",
};

function loadSheet(): DeleteMetalHoldingSheetModule {
  return jest.requireActual<DeleteMetalHoldingSheetModule>(
    "../../components/metals/DeleteMetalHoldingSheet"
  );
}

function loadHook(): UseDeleteMetalHoldingModule {
  return jest.requireActual<UseDeleteMetalHoldingModule>(
    "../../hooks/useDeleteMetalHolding"
  );
}

function loadAction(): DeleteActionModule {
  return jest.requireActual<DeleteActionModule>(
    "../../components/metals/holding-actions/delete-action"
  );
}

function renderSheet(
  overrides: Partial<DeleteMetalHoldingSheetProps> = {}
): DeleteMetalHoldingSheetProps {
  const props: DeleteMetalHoldingSheetProps = {
    visible: true,
    holding: {
      name: "Wedding coin",
      description: "Gold · 24K · 999 · Coin",
      weightLabel: "31.125 g",
      currentValueLabel: "EGP 162,317.87",
      performanceLabel: "+ EGP 11,039.67 since purchase",
    },
    copy,
    width: 390,
    fontScale: 1,
    bottomInset: 24,
    isRtl: false,
    isOffline: true,
    isSubmitting: false,
    submitError: null,
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
    onRetry: jest.fn(),
    ...overrides,
  };
  const DeleteMetalHoldingSheet = loadSheet().DeleteMetalHoldingSheet;
  render(<DeleteMetalHoldingSheet {...props} />);
  return props;
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

function renderDeleteHook(
  overrides: Partial<UseDeleteMetalHoldingInput> = {}
): {
  readonly result: { readonly current: UseDeleteMetalHoldingResult };
  readonly input: UseDeleteMetalHoldingInput;
} {
  let id = 0;
  const input: UseDeleteMetalHoldingInput = {
    createCommand: jest.fn((ids) => ({ ids })),
    execute: jest.fn(() => Promise.resolve()),
    createId: jest.fn(() => `delete-id-${++id}`),
    ...overrides,
  };
  const hook = renderHook(() => loadHook().useDeleteMetalHolding(input));
  return { ...hook, input };
}

describe("DeleteMetalHoldingSheet approved focused confirmation", () => {
  afterEach((): void => {
    jest.restoreAllMocks();
  });

  it("renders the approved destructive copy with exact identity, purity, weight, and value facts", () => {
    renderSheet();

    expect(screen.getByTestId("metal-holding-delete-sheet")).toHaveProp(
      "accessibilityViewIsModal",
      true
    );
    expect(screen.getByRole("header", { name: copy.title })).toBeTruthy();
    expect(screen.getByText(copy.consequence)).toHaveProp(
      "testID",
      "metal-holding-delete-consequence"
    );
    expect(screen.getByText("Wedding coin")).toBeTruthy();
    expect(screen.getByText("Gold · 24K · 999 · Coin")).toBeTruthy();
    expect(screen.getByText("31.125 g")).toBeTruthy();
    expect(screen.getByText("EGP 162,317.87")).toHaveProp(
      "testID",
      "metal-holding-delete-current-value"
    );
    expect(screen.getByText("+ EGP 11,039.67 since purchase")).toBeTruthy();
    expect(screen.getByText(copy.offline)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: copy.accessibilityLabel })
    ).toBeTruthy();
    expect(screen.queryByText("Undo deletion")).toBeNull();
  });

  it("requests initial focus for the confirmation heading and isolates the background", async () => {
    const focus = jest
      .spyOn(AccessibilityInfo, "setAccessibilityFocus")
      .mockImplementation((): void => undefined);
    jest.spyOn(ReactNative, "findNodeHandle").mockReturnValue(41);

    renderSheet();

    await waitFor(() => expect(focus).toHaveBeenCalledWith(41));
    expect(screen.getByTestId("metal-holding-delete-backdrop")).toHaveProp(
      "accessible",
      false
    );
  });

  it("uses one confirmation and allows safe pre-submit cancellation", () => {
    const props = renderSheet();

    fireEvent.press(
      screen.getByRole("button", { name: copy.accessibilityLabel })
    );
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole("button", { name: copy.cancel }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId("metal-holding-delete-backdrop"));
    expect(props.onCancel).toHaveBeenCalledTimes(2);
  });

  it("locks confirm, cancel, backdrop, and duplicate input while the local action is pending", () => {
    const props = renderSheet({ isSubmitting: true });

    expect(screen.getByRole("button", { name: copy.pending })).toHaveProp(
      "accessibilityState",
      { disabled: true, busy: true }
    );
    expect(screen.getByRole("button", { name: copy.cancel })).toBeDisabled();
    fireEvent.press(screen.getByRole("button", { name: copy.pending }));
    fireEvent.press(screen.getByRole("button", { name: copy.cancel }));
    fireEvent.press(screen.getByTestId("metal-holding-delete-backdrop"));
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it("preserves exact facts on failure, exposes retry, and moves focus to recovery", async () => {
    const focus = jest
      .spyOn(AccessibilityInfo, "setAccessibilityFocus")
      .mockImplementation((): void => undefined);
    jest
      .spyOn(ReactNative, "findNodeHandle")
      .mockReturnValueOnce(41)
      .mockReturnValue(42);
    const props = renderSheet({
      submitError: "The holding was not deleted. Try again.",
    });

    expect(screen.getByText("Wedding coin")).toBeTruthy();
    expect(screen.getByText("EGP 162,317.87")).toBeTruthy();
    expect(
      screen.getByText("The holding was not deleted. Try again.")
    ).toHaveProp("accessibilityRole", "alert");
    fireEvent.press(screen.getByRole("button", { name: copy.retry }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(focus).toHaveBeenLastCalledWith(42));
  });

  it.each([
    [390, 1, false, "flex-row gap-3"],
    [320, 1, false, "gap-3"],
    [768, 2, true, "gap-3"],
  ] as const)(
    "uses the shared responsive rule at %ipx/%sx RTL=%s",
    (width, fontScale, isRtl, expectedLayout) => {
      renderSheet({ width, fontScale, isRtl });
      expect(screen.getByTestId("metal-holding-delete-facts")).toHaveProp(
        "className",
        expectedLayout
      );
      expect(screen.getByTestId("metal-holding-delete-content")).toHaveStyle({
        direction: isRtl ? "rtl" : "ltr",
      });
    }
  );

  it("uses theme variants, 44px actions, and adds the device bottom inset", () => {
    renderSheet({ bottomInset: 34 });
    expect(screen.getByTestId("metal-holding-delete-panel")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-slate-900")
    );
    expect(screen.getByTestId("metal-holding-delete-actions")).toHaveStyle({
      paddingBottom: 54,
    });
    expect(screen.getByTestId("metal-holding-delete-confirm")).toHaveProp(
      "className",
      expect.stringContaining("min-h-11")
    );
  });
});

describe("useDeleteMetalHolding", () => {
  it("guards direct confirmation against double taps", async () => {
    const pending = deferred<void>();
    const execute = jest.fn(() => pending.promise);
    const { result } = renderDeleteHook({ execute });

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

  it("preserves action identity and error state for an idempotent retry", async () => {
    const execute = jest
      .fn<Promise<void>, [DeleteCommand]>()
      .mockRejectedValueOnce(new Error("local_write_failed"))
      .mockResolvedValueOnce(undefined);
    const { result, input } = renderDeleteHook({ execute });

    await act(async () => {
      await expect(result.current.submit()).resolves.toBe(false);
    });
    expect(result.current.submitError).toBe("local_write_failed");
    await act(async () => {
      await expect(result.current.retry()).resolves.toBe(true);
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1][0].ids).toEqual(execute.mock.calls[0][0].ids);
    expect(input.createId).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(result.current.submitError).toBeNull());
  });
});

describe("Delete holding isolated action descriptor", () => {
  it("targets only the holding-scoped Delete route with destructive tone", () => {
    const descriptor =
      loadAction().createDeleteHoldingActionDescriptor("holding-gold-coin");
    expect(descriptor).toEqual({
      id: "delete",
      labelKey: "actions.delete",
      tone: "danger",
      href: {
        pathname: "/(private)/metals/[holdingId]/delete",
        params: { holdingId: "holding-gold-coin" },
      },
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
  });

  it("rejects a missing holding identity at the route boundary", () => {
    expect(() => loadAction().createDeleteHoldingActionDescriptor(" ")).toThrow(
      "metal_holding_id_required"
    );
  });
});
