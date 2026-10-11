import React from "react";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
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
import type { UndoMetalHoldingCommandService } from "../../services/undo-metal-holding-command-service";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (): null => null,
}));
jest.mock("@/components/ui/Skeleton", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Skeleton: (): React.JSX.Element => <View testID="skeleton-block" />,
  };
});
jest.mock("@/components/navigation/PageHeader", () => {
  const { Pressable, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
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
  retryLabel: "Retry",
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
    { id: "disposal-treatment", text: "The effect of this change is removed" },
    {
      id: "history",
      text: "The no longer owned record stays in History as reversed",
    },
  ],
};

function createMetalDetailReadModel(
  status: MetalDetailReadModel["status"],
  isFinancialActionLocked = false
): MetalDetailReadModel {
  return {
    attribution: null,
    currentValueDecimal: null,
    currentValueRateStatus: null,
    id: "holding-1",
    isActiveOwnership: false,
    isFinancialActionLocked,
    itemForm: null,
    metalType: "GOLD",
    name: "21K bracelet",
    notes: null,
    purchaseCurrency: null,
    purchaseDate: null,
    purchasePriceDecimal: null,
    purityCatalogVersion: null,
    purityCode: null,
    purityFactorDecimal: null,
    reconciliationState: "accepted",
    requiresCompleteMaterialCorrection: false,
    renderKey: null,
    status,
    terminalFacts: null,
    timeline: [],
    totalGainDecimal: null,
    unavailableExactFacts: [],
    weightGramsDecimal: null,
  };
}

describe("Metals Restore UI & Facade", () => {
  describe("holding action descriptors priority", () => {
    it("offers Undo as primary recovery action for sold/disposed holdings", () => {
      const soldModel = createMetalDetailReadModel("sold");
      const descriptors = getHoldingActionDescriptors(soldModel);
      expect(descriptors[0]).toEqual({
        id: "undo",
        labelKey: "actions.undo_sale",
        tone: "primary",
      });

      const disposedModel = createMetalDetailReadModel("disposed");
      const disposedDescriptors = getHoldingActionDescriptors(disposedModel);
      expect(disposedDescriptors[0]).toEqual({
        id: "undo",
        labelKey: "actions.undo_disposal",
        tone: "primary",
      });
    });

    it("locks Undo when financial actions are locked due to incomplete reconciliation", () => {
      const lockedModel = createMetalDetailReadModel("sold", true);
      const descriptors = getHoldingActionDescriptors(lockedModel);
      expect(descriptors.some((d) => d.id === "undo")).toBe(false);
    });
  });

  describe("useUndoMetalHolding hook", () => {
    it("submits command and tracks completion safely", async () => {
      const undoMock = jest
        .fn()
        .mockResolvedValue({ kind: "committed", holdingId: "h-1" });
      const service: UndoMetalHoldingCommandService = { undo: undoMock };
      const input: UseUndoMetalHoldingInput = {
        holdingId: "h-1",
        userId: "u-1",
        status: "disposed",
        currentTerminalEventId: "ev-term",
        expectedFinancialRevision: "1",
        service,
        createId: () => "id-1",
        getOccurredAt: () => "2026-08-30T10:00:00.000Z",
      };

      const { result } = renderHook(() => useUndoMetalHolding(input));
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isCompleted).toBe(false);

      let success = false;
      await act(async () => {
        success = await result.current.submit();
      });

      expect(success).toBe(true);
      expect(result.current.isCompleted).toBe(true);
      expect(undoMock).toHaveBeenCalledTimes(1);
    });

    it("handles error during submission and provides retry", async () => {
      const undoMock = jest
        .fn()
        .mockRejectedValueOnce(new Error("network_failed"))
        .mockResolvedValueOnce({ kind: "committed", holdingId: "h-1" });
      const service: UndoMetalHoldingCommandService = { undo: undoMock };
      const input: UseUndoMetalHoldingInput = {
        holdingId: "h-1",
        userId: "u-1",
        status: "sold",
        currentTerminalEventId: "ev-term",
        expectedFinancialRevision: "1",
        service,
        createId: () => "id-1",
        getOccurredAt: () => "2026-08-30T10:00:00.000Z",
      };

      const { result } = renderHook(() => useUndoMetalHolding(input));
      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.isCompleted).toBe(false);
      expect(result.current.error?.message).toBe("network_failed");

      await act(async () => {
        await result.current.retry();
      });

      expect(result.current.isCompleted).toBe(true);
      expect(undoMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("RestoreMetalHoldingSheet component", () => {
    it.each([
      [390, 1, false],
      [320, 1, true],
      [390, 2, true],
    ] as const)(
      "uses approved row at width %s and text scale %s, with bottom inset",
      (width, fontScale, isCompact): void => {
        render(
          <RestoreMetalHoldingSheet
            visible
            copy={COPY}
            summary={SOLD_SUMMARY}
            bottomInset={34}
            width={width}
            fontScale={fontScale}
            isRtl={false}
            isPending={false}
            errorMessage={null}
            onConfirm={jest.fn()}
            onCancel={jest.fn()}
          />
        );
        expect(screen.getByTestId("restore-holding-content")).toHaveStyle({
          paddingBottom: 58,
        });
        expect(screen.getByTestId("restore-holding-summary")).toHaveProp(
          "className",
          expect.stringContaining(isCompact ? "flex-col" : "flex-row")
        );
        expect(screen.getByTestId("restore-consequence-card")).toHaveProp(
          "className",
          expect.stringContaining("rounded-2xl")
        );
      }
    );

    it("keeps acknowledgment on retryable failure and exposes Retry", (): void => {
      const onRetry = jest.fn();
      const props = {
        visible: true,
        copy: COPY,
        summary: SOLD_SUMMARY,
        bottomInset: 0,
        width: 390,
        fontScale: 1,
        isRtl: false,
        isPending: false,
        errorMessage: null,
        onConfirm: jest.fn(),
        onCancel: jest.fn(),
        onRetry,
      };
      const { rerender } = render(<RestoreMetalHoldingSheet {...props} />);
      fireEvent.press(screen.getByTestId("restore-holding-reviewed"));
      rerender(
        <RestoreMetalHoldingSheet
          {...props}
          errorMessage="We could not restore this holding. Try again."
        />
      );
      expect(screen.getByTestId("restore-holding-reviewed")).toBeChecked();
      fireEvent.press(screen.getByTestId("restore-holding-retry"));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("requires acknowledgment again when current terminal identity changes", (): void => {
      const props = {
        visible: true,
        copy: COPY,
        summary: SOLD_SUMMARY,
        bottomInset: 0,
        width: 390,
        fontScale: 1,
        isRtl: false,
        isPending: false,
        errorMessage: null,
        onConfirm: jest.fn(),
        onCancel: jest.fn(),
      };
      const { rerender } = render(
        <RestoreMetalHoldingSheet
          {...props}
          attemptIdentity="holding-1:sale-1:1"
        />
      );
      fireEvent.press(screen.getByTestId("restore-holding-reviewed"));
      rerender(
        <RestoreMetalHoldingSheet
          {...props}
          attemptIdentity="holding-1:sale-2:3"
        />
      );
      expect(screen.getByTestId("restore-holding-reviewed")).not.toBeChecked();
      expect(screen.getByTestId("restore-holding-confirm")).toBeDisabled();
    });

    it("blocks dismissal, acknowledgment changes and duplicate confirmation while pending", (): void => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();
      render(
        <RestoreMetalHoldingSheet
          visible
          copy={COPY}
          summary={SOLD_SUMMARY}
          bottomInset={0}
          width={390}
          fontScale={1}
          isRtl={false}
          isPending
          errorMessage={null}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );
      fireEvent.press(screen.getByTestId("restore-holding-reviewed"));
      fireEvent.press(screen.getByTestId("restore-holding-confirm"));
      fireEvent.press(screen.getByTestId("restore-holding-cancel"));
      fireEvent(screen.getByTestId("restore-holding-modal"), "requestClose");
      expect(onCancel).not.toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
      expect(screen.getByTestId("restore-holding-status")).toBeBusy();
    });

    it("renders sold consequence variant and prevents submit before review toggle", () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      render(
        <RestoreMetalHoldingSheet
          visible={true}
          copy={COPY}
          summary={SOLD_SUMMARY}
          bottomInset={34}
          width={390}
          fontScale={1}
          isRtl={false}
          isPending={false}
          errorMessage={null}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByText("21K bracelet becomes Active")).toBeTruthy();
      expect(screen.getByText("Profit from this sale is removed")).toBeTruthy();

      fireEvent.press(screen.getByTestId("restore-holding-confirm"));
      expect(onConfirm).not.toHaveBeenCalled();

      fireEvent.press(screen.getByTestId("restore-holding-reviewed"));
      fireEvent.press(screen.getByTestId("restore-holding-confirm"));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("renders disposed consequence variant", () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      render(
        <RestoreMetalHoldingSheet
          visible={true}
          copy={COPY}
          summary={DISPOSED_SUMMARY}
          bottomInset={34}
          width={390}
          fontScale={1}
          isRtl={false}
          isPending={false}
          errorMessage={null}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByText("21K bracelet becomes Active")).toBeTruthy();
      expect(
        screen.getByText(
          "The no longer owned record stays in History as reversed"
        )
      ).toBeTruthy();
    });
  });
});
