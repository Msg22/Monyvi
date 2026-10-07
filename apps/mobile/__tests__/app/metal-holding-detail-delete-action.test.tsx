import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import type { HoldingActionId } from "@/components/metals/holding-actions/registry";
import type { MetalDetailReadModel } from "@/services/metal-detail-read-model-service";

import MetalHoldingDetailRoute from "../../app/(private)/metals/[id]";

const mockPush = jest.fn();

let mockModel: Pick<
  MetalDetailReadModel,
  "isActiveOwnership" | "isFinancialActionLocked" | "status"
> | null = null;

let capturedActions:
  | ReadonlyArray<{ readonly id: string }>
  | undefined;
let capturedOnAction: ((action: HoldingActionId) => void) | undefined;

jest.mock("expo-router", () => ({
  useLocalSearchParams: (): { readonly id: string } => ({ id: "holding-1" }),
  router: { push: (...args: unknown[]): unknown => mockPush(...args) },
}));

jest.mock("@/hooks/useMetalHoldingDetail", () => ({
  useMetalHoldingDetail: (): {
    readonly error: null;
    readonly isLoading: false;
    readonly isOffline: false;
    readonly model: typeof mockModel;
    readonly retry: jest.Mock;
  } => ({
    error: null,
    isLoading: false,
    isOffline: false,
    model: mockModel,
    retry: jest.fn(),
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (): null => null,
}));

jest.mock("@/components/metals/MetalHoldingDetailScreen", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Pressable: MockPressable, View: MockView } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MetalHoldingDetailScreen: (props: {
      readonly actions: ReadonlyArray<{ readonly id: string }>;
      readonly onAction?: (action: HoldingActionId) => void;
    }): React.JSX.Element => {
      capturedActions = props.actions;
      capturedOnAction = props.onAction;
      return React.createElement(
        MockView,
        null,
        props.actions.map((action) =>
          React.createElement(MockPressable, {
            key: action.id,
            testID: `detail-action-${action.id}`,
            onPress: (): void => props.onAction?.(action.id as HoldingActionId),
          })
        )
      );
    },
  };
});

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

function activeModel(): Pick<
  MetalDetailReadModel,
  "isActiveOwnership" | "isFinancialActionLocked" | "status"
> {
  return {
    isActiveOwnership: true,
    isFinancialActionLocked: false,
    status: "active",
  };
}

describe("metal holding detail delete action composition", () => {
  beforeEach((): void => {
    mockPush.mockClear();
    mockModel = null;
    capturedActions = undefined;
    capturedOnAction = undefined;
  });

  it("exposes only the implemented Delete action for an eligible active holding", () => {
    mockModel = activeModel();

    render(<MetalHoldingDetailRoute />);

    expect(capturedActions).toEqual([
      {
        id: "delete",
        labelKey: "actions.delete",
        tone: "danger",
        href: {
          pathname: "/(private)/metals/[holdingId]/delete",
          params: { holdingId: "holding-1" },
        },
      },
    ]);
    expect(screen.getByTestId("detail-action-delete")).toBeTruthy();
    expect(screen.queryByTestId("detail-action-sell")).toBeNull();
    expect(screen.queryByTestId("detail-action-edit")).toBeNull();
    expect(screen.queryByTestId("detail-action-dispose")).toBeNull();
    expect(screen.queryByTestId("detail-action-undo")).toBeNull();
  });

  it("navigates to the holding-scoped Delete route without touching unimplemented actions", () => {
    mockModel = activeModel();

    render(<MetalHoldingDetailRoute />);
    fireEvent.press(screen.getByTestId("detail-action-delete"));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(private)/metals/[holdingId]/delete",
      params: { holdingId: "holding-1" },
    });
  });

  it("hides actions while reconciliation locks financial actions", () => {
    mockModel = { ...activeModel(), isFinancialActionLocked: true };

    render(<MetalHoldingDetailRoute />);

    expect(capturedActions).toEqual([]);
    expect(capturedOnAction).toBeUndefined();
  });

  it("hides the Delete action for a terminal holding", () => {
    mockModel = {
      isActiveOwnership: false,
      isFinancialActionLocked: false,
      status: "sold",
    };

    render(<MetalHoldingDetailRoute />);

    expect(capturedActions).toEqual([]);
    expect(screen.queryByTestId("detail-action-delete")).toBeNull();
  });

  it("hides actions while the holding model is unavailable", () => {
    mockModel = null;

    render(<MetalHoldingDetailRoute />);

    expect(capturedActions).toEqual([]);
    expect(capturedOnAction).toBeUndefined();
  });
});
