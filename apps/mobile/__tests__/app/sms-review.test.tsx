import { act, render, screen } from "@testing-library/react-native";
import type { AccountReviewSession, ParsedSmsTransaction } from "@monyvi/logic";
import type { AccountReviewRuntimeSaveCapture } from "@/services/account-review-runtime-save";
import {
  T025_IDS,
  makeT025ConfirmedSession,
  makeT025ReviewSession,
} from "../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";
import React from "react";

import type { SmsScanSafeguardSummary } from "@/services/sms-parser-orchestrator";

interface MockTransactionReviewProps {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly subtitle: string;
  readonly selectionOverrides?: ReadonlyMap<number, boolean | null>;
  readonly accountReview?: {
    readonly input: {
      readonly mode: "SMS";
      readonly ownerId: string;
      readonly queueId: string;
      readonly sessionId: string;
    };
    readonly onSessionChange: (session: AccountReviewSession | null) => void;
    readonly onSaveSelected: (session: AccountReviewSession) => Promise<void>;
  };
  readonly partialResults?: {
    readonly safeguardSummary: SmsScanSafeguardSummary;
    readonly retryableCount: number;
    readonly canRetry: boolean;
    readonly hasRetryError: boolean;
    readonly onRetry: () => void;
  };
  readonly onBack: () => void;
  readonly onReviewLater: () => void;
  readonly onDiscard: () => void;
  readonly onDiscardItem: (
    index: number,
    wasSelected: boolean
  ) => Promise<void>;
  readonly onSelectionChange: (
    index: number,
    selected: boolean
  ) => Promise<void>;
  readonly onSelectionChanges: (
    changes: ReadonlyArray<{
      readonly index: number;
      readonly selected: boolean;
    }>
  ) => Promise<void>;
  readonly undoBanner?: {
    readonly onUndo: () => Promise<void>;
  };
  readonly isSaving: boolean;
  readonly onSave: (
    selected: readonly ParsedSmsTransaction[],
    accountMap: ReadonlyMap<number, string>,
    toAccountMap: ReadonlyMap<number, string>
  ) => Promise<void>;
}

interface MockConfirmationModalProps {
  readonly visible: boolean;
  readonly message: string;
  readonly onConfirm: () => void;
}

interface MockConsentSheetProps {
  readonly visible: boolean;
  readonly onContinue: () => Promise<void>;
  readonly onPrivacyDetails: () => void;
}

const mockClearTransactions = jest.fn();
const mockRetry = jest.fn<Promise<void>, []>();
const mockRouterBack = jest.fn();
const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockMarkSyncComplete = jest.fn<Promise<void>, []>();
const mockShowToast = jest.fn();
const mockSaveSelectedDrafts = jest.fn();
const mockDiscardAll = jest.fn();
const mockDiscardOne = jest.fn();
const mockSetSelection = jest.fn();
const mockSetSelections = jest.fn();
const mockQueueRefetch = jest.fn<Promise<void>, []>();

// Route-only mocks: never fabricate an approved financial writer or current
// owner. The real canonical Save and reconciliation are covered by SQLite tests.
type RouteCapture = AccountReviewRuntimeSaveCapture;
const mockCaptureCanonicalSave = jest.fn<
  RouteCapture,
  [AccountReviewSession, RouteCapture | null]
>();
const mockSaveCapturedReview = jest.fn<
  Promise<{ readonly kind: "committed" }>,
  [
    RouteCapture,
    (ownerId: string, sessionId: string) => Promise<AccountReviewSession>,
  ]
>();
const mockBootstrapCanonical = jest.fn();
const mockAssertRuntimeOwner = jest.fn<Promise<string>, [string]>();
// Jest-hoisted factories close over mock-prefixed IDs, not imported fixture bindings.
const mockQueueOwnerId = T025_IDS.owner;
const mockQueueId = T025_IDS.queue;
let mockActiveUserId: string | null = T025_IDS.owner;
let mockIsResolvingUser = false;

function confirmedSmsSession(): AccountReviewSession {
  return makeT025ConfirmedSession(makeT025ReviewSession(), [T025_IDS.rowOne]);
}

function requireCanonicalRouteReview(): NonNullable<
  MockTransactionReviewProps["accountReview"]
> {
  const props = mockTransactionReview.mock.calls.at(-1)?.[0];
  if (!props?.accountReview)
    throw new Error("missing_owned_canonical_review_route");
  return props.accountReview;
}

function prepareReadyCanonicalQueue(): void {
  const first = mockQueueItems[0];
  if (!first) throw new Error("missing_owned_queue_draft");
  mockQueueItems = [{ ...first, hardValidationReasons: [] }];
}

function prepareCanonicalSaveMock(): void {
  mockCaptureCanonicalSave.mockImplementation((session, previous) => {
    const identity = JSON.stringify(session);
    if (previous?.identity === identity) return previous;
    // This route-only fixture cannot authorize a real financial plan. Its
    // correctly typed prepared promise fails if future route code awaits it.
    const blockedPrepared: Promise<never> = Promise.reject(
      new Error("route_only_financial_plan_unavailable")
    );
    void blockedPrepared.catch(() => undefined);
    return {
      ownerId: session.ownerId,
      sessionId: session.sessionId,
      source: session.source,
      identity,
      immediate: null,
      prepared: blockedPrepared,
    };
  });
}

const mockTransactionReview = jest.fn<
  void,
  [props: MockTransactionReviewProps]
>();
const mockConfirmationModal = jest.fn<
  void,
  [props: MockConfirmationModalProps]
>();
const mockConsentSheet = jest.fn<void, [props: MockConsentSheetProps]>();
const mockUndoBanner = jest.fn<
  void,
  [props: { readonly onUndo: () => Promise<void> }]
>();
const mockGrantConsent = jest.fn<Promise<void>, []>();
const mockDismissConsentRequired = jest.fn();

let mockUndoState = {
  undoItem: null as object | null,
  discardedName: null as string | null,
  discard: mockDiscardOne,
  undo: jest.fn<Promise<boolean>, []>(),
  close: jest.fn(),
};

let mockRetryState = {
  unresolvedCount: 2,
  retryableCount: 2,
  isRetrying: false,
  hasRetryError: false,
  isConsentRequired: false,
  dismissConsentRequired: mockDismissConsentRequired,
  retry: mockRetry,
};

const mockSafeguardSummary: SmsScanSafeguardSummary = {
  admittedAiCount: 1,
  deferredAiCount: 1,
  oversizedCount: 0,
  unresolvedCount: 1,
  availability: {
    reason: "scan_limit",
    availableAt: "2026-07-21T16:30:00.000Z",
  },
  completionStatus: "partial",
};

const mockTransaction: ParsedSmsTransaction = {
  amount: 10,
  currency: "EGP",
  type: "EXPENSE",
  counterparty: "QA Merchant",
  date: new Date("2026-07-16T12:00:00Z"),
  categoryId: "category-other",
  categoryDisplayName: "Other",
  confidence: 0.5,
  originLabel: "QNB EGYPT",
  source: "SMS",
  smsFingerprint: T025_IDS.fingerprintOne,
  senderDisplayName: "QNB EGYPT",
  rawSmsBody: "raw",
};

let mockQueueItems = [
  {
    draftId: "draft-1",
    queueId: T025_IDS.queue,
    transaction: mockTransaction,
    selectionOverride: true,
    position: 0,
    parsedAt: new Date("2026-07-16T12:00:00Z"),
    updatedAt: new Date("2026-07-16T12:00:00Z"),
    hardValidationReasons: [
      "account_required",
    ] as ReadonlyArray<"account_required">,
  },
];
let mockQueueLoading = false;
let mockQueueError: Error | null = null;

jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: mockRouterBack,
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
}));

jest.mock("@/context/SmsScanContext", () => ({
  useSmsScanContext: () => ({
    unresolvedCandidates: mockRetryState.unresolvedCount > 0 ? [{}] : [],
    safeguardSummary: mockSafeguardSummary,
    parserDiagnostics: null,
    clearTransactions: mockClearTransactions,
  }),
}));

jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    userId: mockActiveUserId,
    isResolvingUser: mockIsResolvingUser,
  }),
}));

// If the route accidentally calls an opted-in V2 runtime outside the cases
// explicitly exercising canonical Save, fail loudly rather than masking it.
jest.mock("@/services/account-review-runtime-save", () => ({
  captureAccountReviewRuntimeSave: (
    session: AccountReviewSession,
    previous: RouteCapture | null
  ): RouteCapture => mockCaptureCanonicalSave(session, previous),
  saveCapturedAccountReview: (
    capture: RouteCapture,
    loadCurrent: (
      ownerId: string,
      sessionId: string
    ) => Promise<AccountReviewSession>
  ): Promise<{ readonly kind: "committed" }> =>
    mockSaveCapturedReview(capture, loadCurrent),
  assertRuntimeOwner: (ownerId: string): Promise<string> =>
    mockAssertRuntimeOwner(ownerId),
}));

jest.mock("@/services/account-review-legacy-bootstrap-service", () => ({
  loadOrBootstrapOwnedSmsReviewSession: (...args: unknown[]): never => {
    mockBootstrapCanonical(...args);
    throw new Error("unexpected_real_canonical_bootstrap_in_route_unit_test");
  },
}));

jest.mock("@/hooks/useSmsReviewDraftQueue", () => ({
  useSmsReviewDraftQueue: () => ({
    userId: mockQueueOwnerId,
    queueId: mockQueueItems.length > 0 ? mockQueueId : null,
    items: mockQueueItems,
    itemCount: mockQueueItems.length,
    isLoading: mockQueueLoading,
    error: mockQueueError,
    refetch: mockQueueRefetch,
  }),
}));

jest.mock("@/hooks/useSmsReviewUndo", () => ({
  useSmsReviewUndo: () => mockUndoState,
}));

jest.mock("@/hooks/useSmsReviewRetry", () => ({
  useSmsReviewRetry: () => mockRetryState,
}));

jest.mock("@/hooks/useAiProcessingConsent", () => ({
  useAiProcessingConsent: () => ({ grantConsent: mockGrantConsent }),
}));

jest.mock("@/components/ai-consent/AiProcessingConsentSheet", () => ({
  AiProcessingConsentSheet: (props: MockConsentSheetProps): null => {
    mockConsentSheet(props);
    return null;
  },
}));

jest.mock("@/components/transaction-review/TransactionReview", () => ({
  TransactionReview: (props: MockTransactionReviewProps): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    mockTransactionReview(props);
    return <ReactNative.View testID="transaction-review" />;
  },
}));

jest.mock("@/components/transaction-review/SmsReviewUndoBanner", () => ({
  SmsReviewUndoBanner: (props: {
    readonly onUndo: () => Promise<void>;
  }): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    mockUndoBanner(props);
    return <ReactNative.View testID="sms-review-undo-banner" />;
  },
}));

jest.mock("@/components/modals/ConfirmationModal", () => ({
  ConfirmationModal: (props: MockConfirmationModalProps): null => {
    mockConfirmationModal(props);
    return null;
  },
}));

jest.mock("@/components/sms-sync/SafeguardQaDiagnosticsPanel", () => ({
  SafeguardQaDiagnosticsPanel: (): null => null,
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock("@/hooks/useSmsSync", () => ({
  useSmsSync: () => ({ markSyncComplete: mockMarkSyncComplete }),
}));

jest.mock("@/services/sms-review-draft-command-service", () => ({
  discardEverySmsReviewDraft: (...args: readonly unknown[]): unknown =>
    mockDiscardAll(...args),
  editSmsReviewDraft: jest.fn(),
  setSmsReviewDraftSelection: (...args: readonly unknown[]): unknown =>
    mockSetSelection(...args),
  setSmsReviewDraftSelections: (...args: readonly unknown[]): unknown =>
    mockSetSelections(...args),
}));

jest.mock("@/services/sms-review-draft-save-service", () => {
  class MockValidationError extends Error {}
  return {
    saveSelectedSmsReviewDrafts: (...args: readonly unknown[]): unknown =>
      mockSaveSelectedDrafts(...args),
    SmsReviewDraftSaveValidationError: MockValidationError,
  };
});

jest.mock("@/services/sms-live-detection-handler", () => ({
  setReviewingActive: jest.fn(),
  flushQueuedTransactions: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/services/sms-safeguard-qa-diagnostics-service", () => ({
  createSmsSafeguardQaDiagnostics: (): null => null,
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: (): null => null }));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { readonly children: React.ReactNode }) =>
    children,
}));

jest.mock("expo-status-bar", () => ({ StatusBar: (): null => null }));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { readonly count?: number }): string =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

import SmsReviewScreen from "@/app/(private)/sms-review";

describe("SMS review route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveUserId = T025_IDS.owner;
    mockIsResolvingUser = false;
    mockCaptureCanonicalSave.mockImplementation(() => {
      throw new Error("unexpected_canonical_capture_in_route_unit_test");
    });
    mockSaveCapturedReview.mockImplementation(() => {
      throw new Error("unexpected_canonical_financial_save_in_route_unit_test");
    });
    mockAssertRuntimeOwner.mockImplementation((ownerId) =>
      mockActiveUserId === ownerId
        ? Promise.resolve(ownerId)
        : Promise.reject(new Error("account_review_runtime_actor_changed"))
    );
    mockQueueLoading = false;
    mockQueueError = null;
    mockQueueItems = [
      {
        draftId: "draft-1",
        queueId: T025_IDS.queue,
        transaction: mockTransaction,
        selectionOverride: true,
        position: 0,
        parsedAt: new Date("2026-07-16T12:00:00Z"),
        updatedAt: new Date("2026-07-16T12:00:00Z"),
        hardValidationReasons: [
          "account_required",
        ] as ReadonlyArray<"account_required">,
      },
    ];
    mockRetryState = {
      unresolvedCount: 2,
      retryableCount: 2,
      isRetrying: false,
      hasRetryError: false,
      isConsentRequired: false,
      dismissConsentRequired: mockDismissConsentRequired,
      retry: mockRetry,
    };
    mockRetry.mockResolvedValue(undefined);
    mockGrantConsent.mockResolvedValue(undefined);
    mockDiscardAll.mockResolvedValue(undefined);
    mockDiscardOne.mockResolvedValue(undefined);
    mockSetSelection.mockResolvedValue(undefined);
    mockSetSelections.mockResolvedValue(undefined);
    mockQueueRefetch.mockResolvedValue(undefined);
    mockMarkSyncComplete.mockResolvedValue(undefined);
    mockSaveSelectedDrafts.mockResolvedValue({ savedCount: 1 });
    mockUndoState = {
      undoItem: null,
      discardedName: null,
      discard: mockDiscardOne,
      undo: jest.fn<Promise<boolean>, []>(),
      close: jest.fn(),
    };
  });

  it("renders an owned canonical SMS review without legacy selection overrides", () => {
    render(<SmsReviewScreen />);
    const props = mockTransactionReview.mock.calls[0]?.[0];
    expect(props?.transactions[0]?.reviewStatus).toBe("needs_review");
    expect(props?.transactions[0]?.reviewReasons).toContain("account_needed");
    expect(props?.partialResults?.canRetry).toBe(true);
    expect(props?.selectionOverrides).toBeUndefined();
    expect(props?.undoBanner).toBeUndefined();
    expect(props?.accountReview?.input).toEqual({
      mode: "SMS",
      ownerId: T025_IDS.owner,
      queueId: T025_IDS.queue,
      sessionId: T025_IDS.queue,
    });
  });

  it("hard-refuses legacy Save even when a canonical queue has selected rows", async () => {
    render(<SmsReviewScreen />);
    const props = mockTransactionReview.mock.calls[0]?.[0];
    if (!props) throw new Error("TransactionReview was not rendered");

    await expect(
      props.onSave([mockTransaction], new Map([[0, "account-1"]]), new Map())
    ).rejects.toThrow("account_review_v2_legacy_save_forbidden");
    expect(mockSaveSelectedDrafts).not.toHaveBeenCalled();
    expect(mockCaptureCanonicalSave).not.toHaveBeenCalled();
    expect(mockSaveCapturedReview).not.toHaveBeenCalled();
    expect(mockBootstrapCanonical).not.toHaveBeenCalled();
  });

  it("publishes canonical V2 session/change callbacks without invoking legacy bulk selection", () => {
    render(<SmsReviewScreen />);
    const binding = requireCanonicalRouteReview();
    expect(binding.input.mode).toBe("SMS");
    expect(typeof binding.onSessionChange).toBe("function");
    expect(typeof binding.onSaveSelected).toBe("function");
    act(() => binding.onSessionChange(confirmedSmsSession()));
    expect(mockSetSelection).not.toHaveBeenCalled();
    expect(mockSetSelections).not.toHaveBeenCalled();
    expect(mockSaveSelectedDrafts).not.toHaveBeenCalled();
    expect(mockBootstrapCanonical).not.toHaveBeenCalled();
  });

  it("clears volatile scan state when the review route unmounts", () => {
    const { unmount } = render(<SmsReviewScreen />);
    unmount();
    expect(mockClearTransactions).toHaveBeenCalledTimes(1);
    expect(mockDiscardAll).not.toHaveBeenCalled();
    expect(mockSaveSelectedDrafts).not.toHaveBeenCalled();
  });

  it("keeps durable drafts but clears transient scan data when reviewing later", () => {
    render(<SmsReviewScreen />);
    const props = mockTransactionReview.mock.calls[0]?.[0];
    act(() => props?.onReviewLater());
    expect(mockClearTransactions).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith("/(private)/(tabs)");
    expect(mockDiscardAll).not.toHaveBeenCalled();
  });

  it("opens generalized privacy details without clearing durable work", () => {
    mockRetryState = { ...mockRetryState, isConsentRequired: true };
    render(<SmsReviewScreen />);
    const consentProps = mockConsentSheet.mock.calls.at(-1)?.[0];
    act(() => consentProps?.onPrivacyDetails());
    expect(mockRouterPush).toHaveBeenCalledWith("/privacy-details");
    expect(mockClearTransactions).not.toHaveBeenCalled();
  });

  it("maps canonical Discard to Review Later rather than legacy discard-all", () => {
    render(<SmsReviewScreen />);
    const props = mockTransactionReview.mock.calls[0]?.[0];
    if (!props) throw new Error("TransactionReview was not rendered");

    act(() => props.onDiscard());
    expect(mockClearTransactions).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith("/(private)/(tabs)");
    expect(mockDiscardAll).not.toHaveBeenCalled();
    expect(mockConfirmationModal.mock.calls.at(-1)?.[0]?.visible).toBe(false);
  });

  it("keeps multiple durable draft identities in canonical route wiring without using legacy per-row discard", () => {
    mockQueueItems = [
      mockQueueItems[0],
      {
        ...mockQueueItems[0],
        draftId: "draft-2",
        transaction: {
          ...mockTransaction,
          smsFingerprint: T025_IDS.fingerprintTwo,
        },
        position: 1,
      },
    ];
    render(<SmsReviewScreen />);
    const props = mockTransactionReview.mock.calls.at(-1)?.[0];
    expect(props?.transactions.map((row) => row.smsFingerprint)).toEqual([
      T025_IDS.fingerprintOne,
      T025_IDS.fingerprintTwo,
    ]);
    expect(props?.accountReview?.input.sessionId).toBe(T025_IDS.queue);
    expect(props?.selectionOverrides).toBeUndefined();
    expect(props?.undoBanner).toBeUndefined();
    expect(mockDiscardOne).not.toHaveBeenCalled();
    expect(mockSetSelection).not.toHaveBeenCalled();
  });

  it("hides legacy Undo for a canonical queue and keeps final-draft Undo recoverable in the empty branch", () => {
    mockUndoState = {
      ...mockUndoState,
      undoItem: { draftId: "discarded-final" },
      discardedName: "QA Merchant",
    };
    const view = render(<SmsReviewScreen />);
    expect(
      mockTransactionReview.mock.calls.at(-1)?.[0]?.undoBanner
    ).toBeUndefined();
    expect(screen.queryByTestId("sms-review-undo-banner")).toBeNull();

    mockQueueItems = [];
    view.rerender(<SmsReviewScreen />);
    expect(screen.getByTestId("sms-review-undo-banner")).toBeTruthy();
    expect(typeof mockUndoBanner.mock.calls.at(-1)?.[0]?.onUndo).toBe(
      "function"
    );
  });

  it("updates the live canonical subtitle without creating a legacy discard confirmation", () => {
    const view = render(<SmsReviewScreen />);
    expect(mockTransactionReview.mock.calls.at(-1)?.[0]?.subtitle).toBe(
      "review_sms_source_summary:1"
    );

    mockQueueItems = [
      ...mockQueueItems,
      {
        ...mockQueueItems[0],
        draftId: "draft-2",
        transaction: {
          ...mockTransaction,
          smsFingerprint: T025_IDS.fingerprintTwo,
        },
        position: 1,
      },
    ];
    view.rerender(<SmsReviewScreen />);

    const updated = mockTransactionReview.mock.calls.at(-1)?.[0];
    expect(updated?.subtitle).toBe("review_sms_source_summary:2");
    expect(updated?.accountReview?.input.queueId).toBe(T025_IDS.queue);
    expect(mockConfirmationModal.mock.calls.at(-1)?.[0]?.visible).toBe(false);
  });

  it("captures one canonical Save, shows busy state until its outcome, then navigates without the legacy writer", async () => {
    prepareReadyCanonicalQueue();
    prepareCanonicalSaveMock();
    let resolveSave:
      | ((value: { readonly kind: "committed" }) => void)
      | undefined;
    mockSaveCapturedReview.mockImplementation(
      () =>
        new Promise<{ readonly kind: "committed" }>((resolve) => {
          resolveSave = resolve;
        })
    );
    render(<SmsReviewScreen />);
    const binding = requireCanonicalRouteReview();
    const selectedSession = confirmedSmsSession();
    act(() => binding.onSessionChange(selectedSession));
    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = binding.onSaveSelected(selectedSession);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCaptureCanonicalSave).toHaveBeenCalledTimes(1);
    expect(mockCaptureCanonicalSave).toHaveBeenCalledWith(
      selectedSession,
      null
    );
    expect(mockAssertRuntimeOwner).toHaveBeenCalledWith(T025_IDS.owner);
    expect(mockSaveCapturedReview).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: T025_IDS.owner,
        sessionId: T025_IDS.queue,
        source: "SMS",
      }),
      expect.any(Function)
    );
    expect(mockTransactionReview.mock.calls.at(-1)?.[0]?.isSaving).toBe(true);
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockSaveSelectedDrafts).not.toHaveBeenCalled();
    expect(mockBootstrapCanonical).not.toHaveBeenCalled();

    const resolver = resolveSave;
    if (!resolver) throw new Error("canonical_save_promise_not_started");
    await act(async () => {
      resolver({ kind: "committed" });
      await pending;
    });
    expect(mockClearTransactions).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith(
      "/(private)/(tabs)/transactions"
    );
    expect(screen.queryByTestId("transaction-review")).toBeNull();
    expect(mockSaveSelectedDrafts).not.toHaveBeenCalled();
  });

  it("rejects a foreign canonical session before capture, bootstrap or financial Save", async () => {
    prepareCanonicalSaveMock();
    render(<SmsReviewScreen />);
    const binding = requireCanonicalRouteReview();
    const foreign = {
      ...confirmedSmsSession(),
      ownerId: T025_IDS.foreignOwner,
    };
    await act(async () => {
      await binding.onSaveSelected(foreign);
    });

    expect(mockCaptureCanonicalSave).not.toHaveBeenCalled();
    expect(mockAssertRuntimeOwner).not.toHaveBeenCalled();
    expect(mockSaveCapturedReview).not.toHaveBeenCalled();
    expect(mockBootstrapCanonical).not.toHaveBeenCalled();
    expect(mockSaveSelectedDrafts).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      type: "error",
      title: "save_error",
      message: "sms_review_save_failed_message",
    });
  });

  it("revokes an already rendered canonical Save callback after an actor change", async () => {
    prepareReadyCanonicalQueue();
    prepareCanonicalSaveMock();
    render(<SmsReviewScreen />);
    const binding = requireCanonicalRouteReview();
    const selectedSession = confirmedSmsSession();
    act(() => binding.onSessionChange(selectedSession));
    mockActiveUserId = T025_IDS.foreignOwner;

    await act(async () => {
      await binding.onSaveSelected(selectedSession);
    });
    expect(mockCaptureCanonicalSave).toHaveBeenCalledTimes(1);
    expect(mockAssertRuntimeOwner).toHaveBeenCalledWith(T025_IDS.owner);
    expect(mockSaveCapturedReview).not.toHaveBeenCalled();
    expect(mockBootstrapCanonical).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      type: "error",
      title: "save_error",
      message: "sms_review_save_failed_message",
    });
  });

  it("refuses a canonical session with an unowned SMS fingerprint before runtime capture", async () => {
    prepareCanonicalSaveMock();
    render(<SmsReviewScreen />);
    const binding = requireCanonicalRouteReview();
    const selected = confirmedSmsSession();
    const row = selected.rows[0];
    if (!row || row.source !== "SMS")
      throw new Error("missing_canonical_sms_row");
    const otherSource = {
      ...selected,
      rows: [
        {
          ...row,
          sourceFingerprint: T025_IDS.fingerprintTwo,
          transaction: {
            ...row.transaction,
            smsFingerprint: T025_IDS.fingerprintTwo,
          },
        },
      ],
    };

    await act(async () => {
      await binding.onSaveSelected(otherSource);
    });
    expect(mockCaptureCanonicalSave).not.toHaveBeenCalled();
    expect(mockSaveCapturedReview).not.toHaveBeenCalled();
    expect(mockBootstrapCanonical).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      type: "error",
      title: "save_error",
      message: "sms_review_save_failed_message",
    });
  });

  it("does not expose technical financial Save errors in canonical feedback", async () => {
    prepareReadyCanonicalQueue();
    prepareCanonicalSaveMock();
    mockSaveCapturedReview.mockRejectedValue(new Error("sqlite disk is full"));
    render(<SmsReviewScreen />);
    const binding = requireCanonicalRouteReview();
    const selectedSession = confirmedSmsSession();
    act(() => binding.onSessionChange(selectedSession));

    await act(async () => {
      await binding.onSaveSelected(selectedSession);
    });
    expect(mockCaptureCanonicalSave).toHaveBeenCalledTimes(1);
    expect(mockSaveCapturedReview).toHaveBeenCalledTimes(1);
    expect(mockQueueRefetch).not.toHaveBeenCalled();
    expect(mockSaveSelectedDrafts).not.toHaveBeenCalled();
    expect(mockBootstrapCanonical).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      type: "error",
      title: "save_error",
      message: "sms_review_save_failed_message",
    });
  });

  it("shows partial-result guidance when no draft was accepted", () => {
    mockQueueItems = [];
    mockRetryState = { ...mockRetryState, retryableCount: 0 };

    render(<SmsReviewScreen />);

    expect(screen.getByTestId("partial-sms-results-notice")).toBeTruthy();
    expect(screen.getByText("no_transactions_to_review")).toBeTruthy();
  });

  it("keeps Undo visible after discarding the final suggestion", () => {
    mockQueueItems = [];
    mockUndoState = {
      ...mockUndoState,
      undoItem: { draftId: "discarded-final" },
      discardedName: "Final merchant",
    };

    render(<SmsReviewScreen />);

    expect(screen.getByTestId("sms-review-undo-banner")).toBeTruthy();
  });

  it("keeps Undo recoverable and shows friendly feedback when restore fails", async () => {
    const undo = jest
      .fn<Promise<boolean>, []>()
      .mockRejectedValue(new Error("adapter failed"));
    mockUndoState = {
      undoItem: {},
      discardedName: "QA Merchant",
      discard: mockDiscardOne,
      undo,
      close: jest.fn(),
    };
    // Once the durable queue is empty, the route's actual Undo banner still
    // owns its volatile restore callback; canonical V2 rows have no Undo lease.
    mockQueueItems = [];
    render(<SmsReviewScreen />);
    const banner = mockUndoBanner.mock.calls.at(-1)?.[0];
    if (!banner) throw new Error("missing_real_empty_queue_undo_banner");

    await act(async () => {
      await banner.onUndo();
    });

    expect(undo).toHaveBeenCalledTimes(1);
    expect(mockSaveSelectedDrafts).not.toHaveBeenCalled();
    expect(mockBootstrapCanonical).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      type: "error",
      title: "sms_review_undo_failed",
      message: "sms_review_undo_failed_message",
    });
    expect(mockUndoState.undoItem).not.toBeNull();
  });

  it("does not render canonical review for a different authenticated actor", () => {
    mockActiveUserId = T025_IDS.foreignOwner;
    render(<SmsReviewScreen />);
    expect(screen.queryByTestId("transaction-review")).toBeNull();
    expect(screen.getAllByTestId("sms-review-loading-row")).toHaveLength(3);
    expect(mockCaptureCanonicalSave).not.toHaveBeenCalled();
    expect(mockBootstrapCanonical).not.toHaveBeenCalled();
    expect(mockSaveSelectedDrafts).not.toHaveBeenCalled();
  });

  it("shows the skeleton while the current-user queue is loading", () => {
    mockQueueLoading = true;

    render(<SmsReviewScreen />);

    expect(screen.queryByTestId("transaction-review")).toBeNull();
    expect(screen.getAllByTestId("sms-review-loading-row")).toHaveLength(3);
  });

  it("re-consents before retrying unresolved messages", async () => {
    mockRetryState = { ...mockRetryState, isConsentRequired: true };
    render(<SmsReviewScreen />);
    const consentProps = mockConsentSheet.mock.calls.at(-1)?.[0];
    if (!consentProps) throw new Error("Consent sheet was not rendered");

    await act(async () => {
      await consentProps.onContinue();
    });

    expect(mockGrantConsent).toHaveBeenCalledTimes(1);
    expect(mockDismissConsentRequired).toHaveBeenCalledTimes(1);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });
});
