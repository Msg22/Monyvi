import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

interface EditHoldingRouteModule {
  readonly default: React.ComponentType;
}

interface MetalHoldingEditFormModule {
  readonly MetalHoldingForm: React.ComponentType<MetalHoldingEditFormProps>;
}

interface MaterialCue {
  readonly field: string;
  readonly persisted: string | null;
  readonly current: string | null;
}

interface MetalHoldingEditFormProps {
  readonly mode: "edit";
  readonly status: "ACTIVE" | "SOLD" | "DISPOSED";
  readonly locale: "en" | "ar";
  readonly isRtl: boolean;
  readonly colorScheme: "light" | "dark";
  readonly width: number;
  readonly fontScale: number;
  readonly bottomInset: number;
  readonly materialCues: readonly MaterialCue[];
  readonly requiresCorrectionReason: boolean;
  readonly correctionReason: string | null;
  readonly isLoading?: boolean;
  readonly isSubmitting?: boolean;
  readonly validationErrors?: Readonly<Record<string, string>>;
  readonly onChange: (field: string, value: string | null) => void;
  readonly onSave: () => void;
  readonly onRequestExit: () => void;
}

function loadEditHoldingRoute(): React.ComponentType {
  return jest.requireActual<EditHoldingRouteModule>(
    "@/app/(private)/metals/[holdingId]/edit"
  ).default;
}

function loadMetalHoldingForm(): React.ComponentType<MetalHoldingEditFormProps> {
  return jest.requireActual<MetalHoldingEditFormModule>(
    "@/components/metals/MetalHoldingForm"
  ).MetalHoldingForm;
}

function renderEditForm(
  overrides: Partial<MetalHoldingEditFormProps> = {}
): MetalHoldingEditFormProps {
  const props: MetalHoldingEditFormProps = {
    mode: "edit",
    status: "ACTIVE",
    locale: "en",
    isRtl: false,
    colorScheme: "light",
    width: 390,
    fontScale: 1,
    bottomInset: 34,
    materialCues: [],
    requiresCorrectionReason: false,
    correctionReason: null,
    onChange: jest.fn(),
    onSave: jest.fn(),
    onRequestExit: jest.fn(),
    ...overrides,
  };

  const MetalHoldingForm = loadMetalHoldingForm();
  render(<MetalHoldingForm {...props} />);
  return props;
}

describe("Edit metal holding form", () => {
  it("keeps the approved Add-equivalent full form visible and editable in place, with Metal locked and direct Save", () => {
    renderEditForm();

    expect(screen.getByTestId("metal-holding-form")).toHaveProp("fieldOrder", [
      "metal-holding-name-field",
      "metal-holding-metal-field",
      "metal-holding-weight-purity-row",
      "metal-holding-purchase-price-field",
      "metal-holding-purchase-currency-field",
      "metal-holding-purchase-date-field",
      "metal-holding-physical-form-field",
      "metal-holding-notes-field",
      "metal-holding-live-preview",
      "metal-holding-local-first-status",
      "metal-holding-save",
    ]);
    expect(screen.getByTestId("metal-holding-metal-field")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(screen.queryByTestId("metal-holding-review-screen")).toBeNull();
  });

  it("shows persisted/current cues, a required reason, and only the live material consequences within the same screen", () => {
    renderEditForm({
      materialCues: [
        { field: "weightGramsDecimal", persisted: "10", current: "10.125" },
        { field: "purchasePriceDecimal", persisted: "47800", current: "48000" },
      ],
      requiresCorrectionReason: true,
    });

    expect(
      screen.getByTestId("metal-holding-previous-current-weight")
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId("metal-holding-previous-current-purchase-price")
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId("metal-holding-correction-reason-field")
    ).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ required: true })
    );
    expect(screen.getByTestId("metal-holding-live-preview")).toHaveProp(
      "summaryMode",
      "what_will_change"
    );
    expect(screen.queryByTestId("metal-holding-review-screen")).toBeNull();
  });

  it("returns to ordinary metadata Save when every material delta is reverted without discarding the metadata edit", () => {
    const props = renderEditForm({
      materialCues: [],
      requiresCorrectionReason: false,
      correctionReason: "Old correction reason",
    });

    expect(
      screen.queryByTestId("metal-holding-correction-reason-field")
    ).toBeNull();
    expect(screen.queryByTestId("metal-holding-what-will-change")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it("uses the compact paired layout at ordinary width and stacks it at compact width or 200% text with EN/AR RTL semantics", () => {
    renderEditForm({
      width: 320,
      fontScale: 2,
      locale: "ar",
      isRtl: true,
      colorScheme: "dark",
    });

    expect(
      screen.getByTestId("metal-holding-weight-purity-stacked")
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Weight in grams")).toBeOnTheScreen();
    expect(screen.getByLabelText("Purity")).toBeOnTheScreen();
    expect(screen.getByTestId("metal-holding-form")).toHaveProp(
      "accessibilityLanguage",
      "ar"
    );
    expect(screen.getByTestId("metal-holding-form")).toHaveProp(
      "writingDirection",
      "rtl"
    );
  });

  it("limits Sold and Disposed forms to metadata while preserving the same accessible Save action", () => {
    renderEditForm({ status: "SOLD" });

    expect(screen.getByTestId("metal-holding-name-field")).toBeOnTheScreen();
    expect(screen.getByTestId("metal-holding-notes-field")).toBeOnTheScreen();
    expect(screen.queryByTestId("metal-holding-weight-purity-row")).toBeNull();
    expect(
      screen.queryByTestId("metal-holding-purchase-price-field")
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("uses Skeleton while loading and protects safe-area, validation focus, dirty exit, and pending double-submit behavior", () => {
    const props = renderEditForm({
      isLoading: true,
      isSubmitting: true,
      validationErrors: { correctionReason: "required" },
      materialCues: [
        { field: "physicalForm", persisted: "COIN", current: "BAR" },
      ],
      requiresCorrectionReason: true,
    });

    expect(screen.getByTestId("metal-holding-form-skeleton")).toBeOnTheScreen();
    expect(screen.getByTestId("metal-holding-save-area")).toHaveProp(
      "bottomInset",
      34
    );
    expect(
      screen.getByTestId("metal-holding-correction-reason-field")
    ).toHaveProp("autoFocus", true);
    fireEvent.press(screen.getByTestId("metal-holding-exit"));
    expect(props.onRequestExit).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    expect(props.onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
});

describe("Edit metal holding route", () => {
  it("renders the same in-place form and direct Save boundary without requiring a review route", () => {
    const EditHoldingRoute = loadEditHoldingRoute();
    render(<EditHoldingRoute />);

    expect(screen.getByTestId("metal-holding-edit-screen")).toBeOnTheScreen();
    expect(screen.getByTestId("metal-holding-form")).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Save changes" })
    ).toBeOnTheScreen();
    expect(screen.queryByTestId("metal-holding-review-screen")).toBeNull();
  });
});
