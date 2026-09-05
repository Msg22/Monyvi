import React from "react";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react-native";

import {
  RestoreMetalHoldingSheet,
  type RestoreMetalHoldingCopy,
  type RestoreMetalHoldingSummary,
} from "../../components/metals/RestoreMetalHoldingSheet";
import { getHoldingActionDescriptors } from "../../components/metals/holding-actions/registry";
import {
  useUndoMetalHolding,
  type UseUndoMetalHoldingInput,
} from "../../hooks/useUndoMetalHolding";
import type { MetalDetailReadModel } from "../../services/metal-detail-read-model-service";
import type {
  UndoMetalHoldingCommandInput,
  UndoMetalHoldingCommandService,
} from "../../services/undo-metal-holding-command-service";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (): null => null,
}));
jest.mock("@/components/navigation/PageHeader", () => {
  const { Pressable, View } = jest.requireActual(
    "react-native"
  ) as typeof import("react-native");
  return {
    PageHeader: ({
      title,
      onBack,
      backAccessibilityLabel,
    }: {
      readonly title: string;
      readonly onBack: () => void;
      readonly backAccessibilityLabel: string;
    }): React.JSX.Element => (
      <View>
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={title}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backAccessibilityLabel}
          onPress={onBack}
        />
      </View>
    ),
  };
});

const COPY: RestoreMetalHoldingCopy = {
  title: "Restore holding",
  back: "Back",
  consequencesHeading: "What will change",
  reviewLabel: "I reviewed these changes.",
  confirmLabel: "Restore holding",
  pendingLabel: "Restoring holding",
  cancelLabel: "Cancel",
  localFirstMessage: "This change will be saved on this device first.",
};

const SOLD_SUMMARY: RestoreMetalHoldingSummary = {
  terminalKind: "sell",
  holdingName: "21K bracelet",
  metalLabel: "Gold",
  purityLabel: "21K",
  physicalFormLabel: "Jewelry",
  statusLabel: "Sold",
  body: "This restores the same holding to Active. The sale stays in History as reversed.",
  consequences: [
    { id: "active", text: "21K bracelet becomes Active" },
    { id: "sale-result", text: "Profit from this sale is removed" },
    { id: "history", text: "The sale stays in History as reversed" },
  ],
};

const DISPOSED_SUMMARY: RestoreMetalHoldingSummary = {
  terminalKind: "dispose",
  holdingName: "21K bracelet",
  metalLabel: "Gold",
  purityLabel: "21K",
  physicalFormLabel: "Jewelry",
  statusLabel: "Disposed",
  body: "This restores the same holding to Active. The record remains in History as reversed.",
  consequences: [
    { id: "active", text: "21K bracelet becomes Active" },
    {
      id: "history",
      text: "The no-longer-in-possession record stays in History as reversed",
    },
  ],
};

const HOOK_INPUT = {
  holdingId: "018f0c7a-1234-7abc-8def-000000000002",
  userId: "018f0c7a-1234-7abc-8def-000000000003",
  status: "sold",
  currentTerminalEventId: "018f0c7a-1234-7abc-8def-000000000012",
  expectedFinancialRevision: "1",
} as const;

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value): void => {
      if (!resolvePromise) throw new Error("test_deferred_missing");
      resolvePromise(value);
    },
  };
}

function terminalModel(status: "sold" | "disposed"): MetalDetailReadModel {
  const model: MetalDetailReadModel = {
    attribution: null,
    currentValueDecimal: null,
    id: HOOK_INPUT.holdingId,
    status,
    isActiveOwnership: false,
    isFinancialActionLocked: false,
    itemForm: "jewelry",
    metalType: "GOLD",
    name: "21K bracelet",
    purchaseCurrency: "EGP",
    purchaseDate: new Date("2024-03-14T00:00:00.000Z"),
    purchasePriceDecimal: "47800.00",
    purityCatalogVersion: "v1",
    purityCode: "GOLD_21K",
    purityFactorDecimal: "0.875",
    requiresCompleteMaterialCorrection: false,
    renderKey: "gold:jewelry",
    timeline: [],
    totalGainDecimal: null,
    unavailableExactFacts: [],
    weightGramsDecimal: "10.125",
  };
  return model;
}

function commandService(
  undo: UndoMetalHoldingCommandService["undo"]
): UndoMetalHoldingCommandService {
  return { undo };
}

function createHookInput(
  service: UndoMetalHoldingCommandService,
  overrides: Partial<UseUndoMetalHoldingInput> = {}
): UseUndoMetalHoldingInput {
  const ids = [
    "018f0c7a-1234-7abc-8def-000000000020",
    "018f0c7a-1234-7abc-8def-000000000021",
    "018f0c7a-1234-7abc-8def-000000000022",
  ];
  let index = 0;
  return {
    ...HOOK_INPUT,
    service,
    createId: (): string => ids[index++] ?? "unexpected-extra-id",
    getOccurredAt: (): string => "2026-09-05T12:00:00.000Z",
    ...overrides,
  };
}

function renderSheet(
  overrides: Partial<React.ComponentProps<typeof RestoreMetalHoldingSheet>> = {}
): void {
  render(
    <RestoreMetalHoldingSheet
      visible
      copy={COPY}
      summary={SOLD_SUMMARY}
      bottomInset={24}
      width={390}
      fontScale={1}
      isRtl={false}
      isPending={false}
      errorMessage={null}
      onConfirm={jest.fn()}
      onCancel={jest.fn()}
      {...overrides}
    />
  );
}

function HookSheetHarness({
  service,
}: {
  readonly service: UndoMetalHoldingCommandService;
}): React.JSX.Element {
  const undo = useUndoMetalHolding(createHookInput(service));
  return (
    <RestoreMetalHoldingSheet
      visible
      copy={COPY}
      summary={SOLD_SUMMARY}
      bottomInset={24}
      width={390}
      fontScale={1}
      isRtl={false}
      isPending={undo.isSubmitting}
      errorMessage={undo.error?.message ?? null}
      onConfirm={() => {
        void undo.submit();
      }}
      onCancel={jest.fn()}
    />
  );
}

describe("metal holding Restore consequence flow", () => {
  it.each(["sold", "disposed"] as const)(
    "keeps Undo first and primary for a %s holding while Delete stays unavailable",
    (status): void => {
      expect(getHoldingActionDescriptors(terminalModel(status))).toEqual([
        {
          id: "undo",
          labelKey:
            status === "sold" ? "actions.undo_sale" : "actions.undo_disposal",
          tone: "primary",
        },
        { id: "edit", labelKey: "actions.edit", tone: "secondary" },
      ]);
    }
  );

  it("renders approved uncredited-sale consequences without an account row", (): void => {
    renderSheet();
    expect(screen.getByRole("header", { name: COPY.title })).toBeOnTheScreen();
    expect(screen.getByText(SOLD_SUMMARY.body)).toBeOnTheScreen();
    expect(screen.getByText("21K bracelet becomes Active")).toBeOnTheScreen();
    expect(
      screen.getByText("Profit from this sale is removed")
    ).toBeOnTheScreen();
    expect(
      screen.getByText("The sale stays in History as reversed")
    ).toBeOnTheScreen();
    expect(
      screen.queryByTestId("restore-account-effect")
    ).not.toBeOnTheScreen();
  });

  it("uses the disposal consequence variant without sale result or account content", (): void => {
    renderSheet({ summary: DISPOSED_SUMMARY });
    expect(screen.getByText(DISPOSED_SUMMARY.body)).toBeOnTheScreen();
    expect(
      screen.getByText(
        "The no-longer-in-possession record stays in History as reversed"
      )
    ).toBeOnTheScreen();
    expect(screen.queryByText(/profit from this sale/i)).not.toBeOnTheScreen();
    expect(
      screen.queryByTestId("restore-account-effect")
    ).not.toBeOnTheScreen();
  });

  it("requires explicit consequence review before triggering restoration", (): void => {
    const onConfirm = jest.fn();
    renderSheet({ onConfirm });
    expect(
      screen.getByRole("button", { name: COPY.confirmLabel })
    ).toBeDisabled();
    fireEvent.press(screen.getByRole("checkbox", { name: COPY.reviewLabel }));
    expect(
      screen.getByRole("button", { name: COPY.confirmLabel })
    ).toBeEnabled();
    fireEvent.press(screen.getByRole("button", { name: COPY.confirmLabel }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("delegates safe pre-submit dismissal so the route can restore trigger focus", (): void => {
    const onCancel = jest.fn();
    renderSheet({ onCancel });
    fireEvent.press(screen.getByRole("button", { name: COPY.cancelLabel }));
    fireEvent.press(screen.getByRole("button", { name: COPY.back }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("connects confirmation to the hook with exact stable reversal IDs and links", async (): Promise<void> => {
    const undo = jest.fn<
      ReturnType<UndoMetalHoldingCommandService["undo"]>,
      [UndoMetalHoldingCommandInput]
    >(() =>
      Promise.resolve({ kind: "committed", holdingId: HOOK_INPUT.holdingId })
    );
    render(<HookSheetHarness service={commandService(undo)} />);
    fireEvent.press(screen.getByRole("checkbox", { name: COPY.reviewLabel }));
    fireEvent.press(screen.getByRole("button", { name: COPY.confirmLabel }));
    await waitFor(() => expect(undo).toHaveBeenCalledTimes(1));
    expect(undo).toHaveBeenCalledWith({
      actionId: "018f0c7a-1234-7abc-8def-000000000020",
      actionEvidenceId: "018f0c7a-1234-7abc-8def-000000000021",
      lifecycleEventId: "018f0c7a-1234-7abc-8def-000000000022",
      predecessorEventId: HOOK_INPUT.currentTerminalEventId,
      reversesEventId: HOOK_INPUT.currentTerminalEventId,
      holdingId: HOOK_INPUT.holdingId,
      userId: HOOK_INPUT.userId,
      occurredAt: "2026-09-05T12:00:00.000Z",
      expectedFinancialRevision: "1",
    });
  });

  it("coalesces double submit and exposes visible pending state", async (): Promise<void> => {
    const deferred = createDeferred<{
      kind: "committed";
      holdingId: string;
    }>();
    const undo = jest.fn(() => deferred.promise);
    const { result } = renderHook(() =>
      useUndoMetalHolding(createHookInput(commandService(undo)))
    );

    let first: Promise<boolean> | null = null;
    let second: Promise<boolean> | null = null;
    await act(async (): Promise<void> => {
      first = result.current.submit();
      second = result.current.submit();
      await Promise.resolve();
    });
    expect(result.current.isSubmitting).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
    if (!first || !second) throw new Error("test_deferred_missing");
    deferred.resolve({ kind: "committed", holdingId: HOOK_INPUT.holdingId });
    await act(async (): Promise<void> => {
      await Promise.all([first, second]);
    });
    expect(result.current.isCompleted).toBe(true);
  });

  it("preserves the same IDs and reviewed UI state across error and retry", async (): Promise<void> => {
    const undo = jest
      .fn<
        ReturnType<UndoMetalHoldingCommandService["undo"]>,
        [UndoMetalHoldingCommandInput]
      >()
      .mockRejectedValueOnce(new Error("disk_full"))
      .mockResolvedValueOnce({
        kind: "committed",
        holdingId: HOOK_INPUT.holdingId,
      });
    const input = createHookInput(commandService(undo));
    const { result } = renderHook(() => useUndoMetalHolding(input));
    await act(async (): Promise<void> => {
      await result.current.submit();
    });
    expect(result.current.error).toEqual(new Error("disk_full"));
    const firstCommand = undo.mock.calls[0]?.[0];
    await act(async (): Promise<void> => {
      await result.current.retry();
    });
    expect(undo).toHaveBeenCalledTimes(2);
    expect(undo.mock.calls[1]?.[0]).toEqual(firstCommand);

    renderSheet({ errorMessage: "Nothing changed. Try again." });
    fireEvent.press(screen.getByRole("checkbox", { name: COPY.reviewLabel }));
    screen.rerender(
      <RestoreMetalHoldingSheet
        visible
        copy={COPY}
        summary={SOLD_SUMMARY}
        bottomInset={24}
        width={390}
        fontScale={1}
        isRtl={false}
        isPending={false}
        errorMessage="Nothing changed. Try again."
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(
      screen.getByRole("checkbox", { name: COPY.reviewLabel })
    ).toBeChecked();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Nothing changed. Try again."
    );
  });

  it("locks cancel, review, hardware dismissal, and duplicate confirmation while pending", (): void => {
    const onCancel = jest.fn();
    renderSheet({ isPending: true, onCancel });
    fireEvent(screen.getByTestId("restore-holding-modal"), "requestClose");
    expect(onCancel).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: COPY.cancelLabel })
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: COPY.reviewLabel })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: COPY.pendingLabel })
    ).toBeDisabled();
    expect(screen.getByTestId("restore-holding-status")).toBeBusy();
  });

  it("contains modal focus, announces semantics, and includes the bottom safe-area inset", (): void => {
    renderSheet();
    expect(screen.getByTestId("restore-holding-dialog")).toHaveProp(
      "accessibilityViewIsModal",
      true
    );
    expect(screen.getByTestId("restore-holding-dialog")).toHaveProp(
      "accessibilityLabel",
      COPY.title
    );
    expect(screen.getByTestId("restore-holding-content")).toHaveStyle({
      paddingBottom: 48,
    });
    expect(screen.getByText(COPY.localFirstMessage)).toBeOnTheScreen();
    expect(
      screen.getByRole("checkbox", { name: COPY.reviewLabel })
    ).toHaveAccessibilityValue({ text: COPY.reviewLabel });
  });

  it("keeps theme classes and reflows at shared compact and enlarged-text thresholds", (): void => {
    renderSheet({ width: 390, fontScale: 1 });
    expect(screen.getByTestId("restore-holding-dialog")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-slate-950")
    );
    expect(screen.getByTestId("restore-holding-summary")).toHaveProp(
      "className",
      expect.stringContaining("flex-row")
    );
    screen.rerender(
      <RestoreMetalHoldingSheet
        visible
        copy={COPY}
        summary={SOLD_SUMMARY}
        bottomInset={24}
        width={320}
        fontScale={1}
        isRtl={false}
        isPending={false}
        errorMessage={null}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(screen.getByTestId("restore-holding-summary")).toHaveProp(
      "className",
      expect.stringContaining("flex-col")
    );
    screen.rerender(
      <RestoreMetalHoldingSheet
        visible
        copy={COPY}
        summary={SOLD_SUMMARY}
        bottomInset={24}
        width={390}
        fontScale={1.5}
        isRtl={false}
        isPending={false}
        errorMessage={null}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(screen.getByTestId("restore-holding-summary")).toHaveProp(
      "className",
      expect.stringContaining("flex-col")
    );
  });

  it("mirrors summary and consequence rows for RTL without changing meaning", (): void => {
    renderSheet({ summary: DISPOSED_SUMMARY, isRtl: true });
    expect(screen.getByTestId("restore-holding-summary")).toHaveProp(
      "className",
      expect.stringContaining("items-end")
    );
    expect(screen.getByTestId("restore-consequence-active")).toHaveProp(
      "className",
      expect.stringContaining("flex-row-reverse")
    );
    expect(screen.getByText(DISPOSED_SUMMARY.body)).toBeOnTheScreen();
  });

  it("rejects hook submission for Active or missing terminal state", async (): Promise<void> => {
    const undo = jest.fn();
    const { result } = renderHook(() =>
      useUndoMetalHolding(
        createHookInput(commandService(undo), {
          status: "active",
          currentTerminalEventId: null,
        })
      )
    );
    await act(async (): Promise<void> => {
      await result.current.submit();
    });
    expect(undo).not.toHaveBeenCalled();
    expect(result.current.error).toEqual(
      new Error("metal_undo_terminal_holding_required")
    );
  });
});
