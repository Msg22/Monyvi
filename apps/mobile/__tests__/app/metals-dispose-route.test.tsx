import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";

import DisposeMetalHoldingRoute from "../../app/(private)/metals/[holdingId]/dispose";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockShowToast = jest.fn();
const mockSubmit = jest.fn();
const mockRetryLoad = jest.fn();
const mockDispatch = jest.fn();
let capturedPreventRemove: {
  readonly enabled: boolean;
  readonly handler: (event: {
    readonly data: { readonly action: unknown };
  }) => void;
} | null = null;

let mockHoldingId: string | string[] | undefined = "holding-1";

const facadeBase = {
  model: {
    holdingId: "holding-1",
    name: "Wedding coin",
    userId: "user-1",
    status: "active",
    expectedFinancialRevision: "0",
    predecessorEventId: "event-1",
    purchaseDate: "2024-03-14",
  },
  category: null,
  otherTreatment: null,
  treatment: null,
  disposalDate: "2026-09-05",
  notes: "",
  terminalRates: [],
  isLoading: false,
  isRateLoading: false,
  isSubmitting: false,
  isDirty: false,
  loadError: null,
  rateEvidenceError: null,
  submitError: null,
  validationErrors: {},
  setCategory: jest.fn(),
  setOtherTreatment: jest.fn(),
  setDisposalDate: jest.fn(),
  setNotes: jest.fn(),
  submit: mockSubmit,
  retryLoad: mockRetryLoad,
};

let mockFacade: Record<string, unknown> = { ...facadeBase };

jest.mock("expo-router", () => ({
  useLocalSearchParams: (): { readonly holdingId?: string | string[] } => ({
    holdingId: mockHoldingId,
  }),
  router: {
    back: (...args: unknown[]): unknown => mockBack(...args),
    replace: (...args: unknown[]): unknown => mockReplace(...args),
    canGoBack: (): boolean => true,
  },
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly t: (key: string, options?: Record<string, string>) => string;
    readonly i18n: {
      readonly resolvedLanguage: string;
      readonly language: string;
    };
  } => ({
    t: (key: string, options?: Record<string, string>): string => {
      const copy: Record<string, string> = {
        "dispose.keepEditing": "Keep editing",
        "dispose.discardChanges": "Discard changes",
        "dispose.exitTitle": "Discard changes?",
        "dispose.exitMessage": "Your unsaved changes will be lost.",
        "dispose.success": `Recorded: ${options?.holdingName ?? ""} is no longer in your active portfolio.`,
      };
      return copy[key] ?? key;
    },
    i18n: { resolvedLanguage: "en", language: "en" },
  }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/providers/DatabaseProvider", () => ({
  useDatabase: (): Record<string, never> => ({}),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
  } => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

let mockCurrentUserId: string | null = "user-1";
let mockIsResolvingUser = false;
const capturedHookInputs: unknown[] = [];
const mockProductionCreateId = jest.fn(() => "mock-uuid");
const mockProductionDependencies: {
  readonly loadHolding: () => Promise<never>;
  readonly loadTerminalRateSnapshots: () => Promise<never>;
  readonly disposeHolding: () => Promise<never>;
} = {
  loadHolding: jest.fn(),
  loadTerminalRateSnapshots: jest.fn(),
  disposeHolding: jest.fn(),
};

jest.mock("@/components/navigation/PageHeader", () => {
  const {
    Pressable: MockHeaderPressable,
    Text: MockHeaderText,
    View: MockHeaderView,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    PageHeader: ({
      title,
      onBack,
    }: {
      readonly title: string;
      readonly onBack?: () => void;
    }): React.JSX.Element => (
      <MockHeaderView>
        <MockHeaderText>{title}</MockHeaderText>
        <MockHeaderPressable testID="dispose-header-back" onPress={onBack}>
          <MockHeaderText>Back</MockHeaderText>
        </MockHeaderPressable>
      </MockHeaderView>
    ),
  };
});

jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: (): {
    readonly userId: string | null;
    readonly isResolvingUser: boolean;
  } => ({ userId: mockCurrentUserId, isResolvingUser: mockIsResolvingUser }),
}));

jest.mock("@/hooks/useDisposeMetalHoldingProduction", () => ({
  useDisposeMetalHoldingProduction: (): {
    readonly createId: () => string;
    readonly dependencies: unknown;
  } => ({
    createId: (): string => mockProductionCreateId(),
    get dependencies(): unknown {
      return mockProductionDependencies;
    },
  }),
}));

jest.mock("@/hooks/useDisposeMetalHolding", () => ({
  useDisposeMetalHolding: (input: unknown): Record<string, unknown> => {
    capturedHookInputs.push(input);
    return mockFacade;
  },
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({
    showToast: mockShowToast,
  }),
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: (): { readonly dispatch: jest.Mock } => ({
    dispatch: mockDispatch,
  }),
  usePreventRemove: jest.fn(
    (
      enabled: boolean,
      handler: (event: { readonly data: { readonly action: unknown } }) => void
    ): void => {
      capturedPreventRemove = { enabled, handler };
    }
  ),
}));

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "mock-uuid"),
}));

jest.mock("@/components/metals/DisposeMetalHoldingScreen", () => {
  const {
    Pressable: MockPressable,
    Text: MockText,
    View: MockView,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    DisposeMetalHoldingScreen: ({
      onSubmit,
      onRetry,
      onRequestExit,
    }: {
      readonly onSubmit: () => void;
      readonly onRetry: () => void;
      readonly onRequestExit: () => void;
    }): React.JSX.Element => (
      <MockView>
        <MockPressable testID="dispose-submit" onPress={onSubmit}>
          <MockText>Record change</MockText>
        </MockPressable>
        <MockPressable testID="dispose-cancel" onPress={onRequestExit}>
          <MockText>Cancel</MockText>
        </MockPressable>
        <MockPressable testID="dispose-retry" onPress={onRetry}>
          <MockText>Try again</MockText>
        </MockPressable>
      </MockView>
    ),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockHoldingId = "holding-1";
  mockCurrentUserId = "user-1";
  mockIsResolvingUser = false;
  capturedHookInputs.length = 0;
  capturedPreventRemove = null;
  mockSubmit.mockImplementation(() => Promise.resolve(true));
  mockFacade = { ...facadeBase };
});

describe("Dispose production route", () => {
  it("shows an honest localized error for a missing holding id without loading anything", (): void => {
    mockHoldingId = undefined;
    render(<DisposeMetalHoldingRoute />);
    expect(
      screen.getByTestId("metal-holding-dispose-missing-id")
    ).toBeOnTheScreen();
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("never invokes the holding facade for missing or blank ids", (): void => {
    mockHoldingId = undefined;
    const { unmount } = render(<DisposeMetalHoldingRoute />);
    expect(
      screen.getByTestId("metal-holding-dispose-missing-id")
    ).toBeOnTheScreen();
    expect(capturedHookInputs).toHaveLength(0);
    unmount();
    mockHoldingId = "   ";
    render(<DisposeMetalHoldingRoute />);
    expect(capturedHookInputs).toHaveLength(0);
  });

  it("discards through the exit sheet back to the previous route on explicit Cancel", (): void => {
    mockFacade = { ...facadeBase, isDirty: true };
    render(<DisposeMetalHoldingRoute />);
    fireEvent.press(screen.getByTestId("dispose-cancel"));
    expect(screen.getByTestId("dispose-exit-guard")).toBeOnTheScreen();
    fireEvent.press(screen.getByText("Discard changes"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("discards a native back navigation through the exit sheet without losing the action", (): void => {
    mockFacade = { ...facadeBase, isDirty: true };
    render(<DisposeMetalHoldingRoute />);
    expect(capturedPreventRemove?.enabled).toBe(true);
    act(() => {
      capturedPreventRemove?.handler({ data: { action: "NAV_ACTION" } });
    });
    expect(screen.getByTestId("dispose-exit-guard")).toBeOnTheScreen();
    fireEvent.press(screen.getByText("Discard changes"));
    expect(mockDispatch).toHaveBeenCalledWith("NAV_ACTION");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("keeps editing on native back without dispatching anything", (): void => {
    mockFacade = { ...facadeBase, isDirty: true };
    render(<DisposeMetalHoldingRoute />);
    act(() => {
      capturedPreventRemove?.handler({ data: { action: "NAV_ACTION" } });
    });
    fireEvent.press(screen.getByText("Keep editing"));
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("blocks every exit path while the local submission is pending", (): void => {
    mockFacade = { ...facadeBase, isDirty: true, isSubmitting: true };
    render(<DisposeMetalHoldingRoute />);
    fireEvent.press(screen.getByTestId("dispose-cancel"));
    expect(screen.queryByTestId("dispose-exit-guard")).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
    act(() => {
      capturedPreventRemove?.handler({ data: { action: "NAV_ACTION" } });
    });
    expect(screen.queryByTestId("dispose-exit-guard")).toBeNull();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("navigates after the guard is disabled with no discard prompt after save", async (): Promise<void> => {
    render(<DisposeMetalHoldingRoute />);
    fireEvent.press(screen.getByTestId("dispose-submit"));
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: "/metals/[id]",
        params: { id: "holding-1" },
      })
    );
    expect(screen.queryByTestId("dispose-exit-guard")).toBeNull();
    expect(mockShowToast).toHaveBeenCalledTimes(1);
  });

  it("blocks duplicate submits while the command is in flight", (): void => {
    mockFacade = { ...facadeBase, isSubmitting: true };
    render(<DisposeMetalHoldingRoute />);
    fireEvent.press(screen.getByTestId("dispose-submit"));
    fireEvent.press(screen.getByTestId("dispose-submit"));
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("asks Keep editing or Discard changes for a dirty exit and exits at once when untouched", (): void => {
    mockFacade = { ...facadeBase, isDirty: true };
    render(<DisposeMetalHoldingRoute />);
    fireEvent.press(screen.getByTestId("dispose-cancel"));
    expect(screen.getByTestId("dispose-exit-guard")).toBeOnTheScreen();
    expect(screen.getByText("Keep editing")).toBeOnTheScreen();
    expect(screen.getByText("Discard changes")).toBeOnTheScreen();
    fireEvent.press(screen.getByText("Keep editing"));
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("exits immediately when nothing was changed", (): void => {
    mockFacade = { ...facadeBase, isDirty: false };
    render(<DisposeMetalHoldingRoute />);
    fireEvent.press(screen.getByTestId("dispose-cancel"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("dispose-exit-guard")).toBeNull();
  });

  it("reloads holding and rates after a revision conflict retry", async (): Promise<void> => {
    mockFacade = {
      ...facadeBase,
      submitError: "holding_revision_conflict",
    };
    render(<DisposeMetalHoldingRoute />);
    fireEvent.press(screen.getByTestId("dispose-retry"));
    await waitFor(() => expect(mockRetryLoad).toHaveBeenCalledTimes(1));
  });

  it("keeps stable facade dependencies across re-renders so loaders never loop", (): void => {
    const { rerender } = render(<DisposeMetalHoldingRoute />);
    rerender(<DisposeMetalHoldingRoute />);
    expect(capturedHookInputs.length).toBeGreaterThanOrEqual(2);
    const first = capturedHookInputs[0] as {
      readonly dependencies: Record<string, unknown>;
    };
    for (const input of capturedHookInputs.slice(1)) {
      expect(
        (input as { readonly dependencies: Record<string, unknown> })
          .dependencies
      ).toBe(first.dependencies);
    }
  });

  it("fails closed without any submit surface when the account changes mid-flow", (): void => {
    const { rerender } = render(<DisposeMetalHoldingRoute />);
    expect(screen.getByTestId("dispose-submit")).toBeOnTheScreen();
    mockCurrentUserId = "user-2";
    rerender(<DisposeMetalHoldingRoute />);
    expect(
      screen.getByTestId("metal-holding-dispose-auth-changed")
    ).toBeOnTheScreen();
    expect(screen.queryByTestId("dispose-submit")).toBeNull();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("gates on resolved identity with a skeleton and no facade surface", (): void => {
    mockIsResolvingUser = true;
    mockCurrentUserId = null;
    render(<DisposeMetalHoldingRoute />);
    expect(
      screen.getByTestId("metal-holding-dispose-auth-loading")
    ).toBeOnTheScreen();
    expect(capturedHookInputs).toHaveLength(0);
    expect(screen.queryByTestId("dispose-submit")).toBeNull();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("stays silent when the screen unmounts before an async submit settles", async (): Promise<void> => {
    let resolveSubmit: (value: boolean) => void = () => undefined;
    mockSubmit.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSubmit = resolve;
        })
    );
    const { unmount } = render(<DisposeMetalHoldingRoute />);
    fireEvent.press(screen.getByTestId("dispose-submit"));
    unmount();
    resolveSubmit(true);
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
  });
});
