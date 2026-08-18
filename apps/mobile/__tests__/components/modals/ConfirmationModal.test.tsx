import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (): null => null,
}));

jest.mock("@/hooks/useModalBottomInset", () => ({
  useModalBottomInset: (): number => 24,
}));

import { ConfirmationModal } from "@/components/modals/ConfirmationModal";

describe("ConfirmationModal", () => {
  it("keeps async-owned confirmation open until its container dismisses it", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const screen = render(
      <ConfirmationModal
        visible
        title="Resume?"
        message="Resume tracking"
        dismissOnConfirm={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.press(screen.getByTestId("modal-confirm"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("disables both actions while a command is submitting", () => {
    const screen = render(
      <ConfirmationModal
        visible
        title="Resume?"
        message="Resume tracking"
        isConfirming
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(screen.getByTestId("modal-confirm")).toHaveProp(
      "accessibilityState",
      { disabled: true }
    );
    expect(screen.getByTestId("modal-cancel")).toHaveProp(
      "accessibilityState",
      { disabled: true }
    );
    expect(screen.getByTestId("confirmation-modal-card")).toHaveProp(
      "aria-busy",
      true
    );
  });

  it("exposes modal semantics and blocks backdrop dismissal while confirming", () => {
    const onCancel = jest.fn();
    const screen = render(
      <ConfirmationModal
        visible
        title="Delete budget?"
        message="Transactions stay available"
        isConfirming
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />
    );

    expect(screen.getByTestId("confirmation-modal-card")).toHaveProp(
      "accessibilityViewIsModal",
      true
    );
    expect(screen.getByTestId("confirmation-modal-card")).not.toHaveProp(
      "accessible",
      true
    );
    expect(screen.getByText("Delete budget?")).toHaveProp(
      "accessibilityRole",
      "header"
    );
    expect(screen.getByTestId("confirmation-modal-status")).toHaveProp(
      "accessibilityState",
      { busy: true }
    );

    fireEvent.press(screen.getByTestId("confirmation-modal-backdrop"));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("labels both modal actions as buttons", () => {
    const screen = render(
      <ConfirmationModal
        visible
        title="Pause budget?"
        message="Pause tracking"
        confirmLabel="Pause"
        cancelLabel="Cancel"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(screen.getByTestId("modal-confirm")).toHaveProp(
      "accessibilityRole",
      "button"
    );
    expect(screen.getByTestId("modal-cancel")).toHaveProp(
      "accessibilityRole",
      "button"
    );
  });
});
