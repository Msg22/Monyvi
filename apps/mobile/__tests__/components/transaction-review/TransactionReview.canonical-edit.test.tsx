import { registerCanonicalReviewActionCases } from "./TransactionReview.canonical-actions-cases";
/** #395 canonical edit/review owner-revision and UI regressions. */

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import {
  accountReviewSessionSchema,
  accountReviewCommandSchema,
  type ReviewableTransaction,
} from "@monyvi/logic";
import { reduceAccountReviewCommand } from "../../../../../packages/logic/src/account-review/reducer";

import type { ControlledReviewTransactionEditModalProps } from "@/components/transaction-review/edit-modal/ControlledReviewTransactionEditModal";
import type { AccountChoiceSheetProps } from "@/components/transaction-review/AccountChoiceSheet";
import type { ReviewFeedbackBoundary } from "@/hooks/useReviewNotice";
import type { AccountReviewSession } from "../../../../../packages/logic/src/account-review/review-schemas";
import { projectAccountReviewSession } from "../../../../../packages/logic/src/account-review/read-model";
import { currentReviewUndoGroupId } from "@/hooks/account-review-facade-removed-state";
import { makeOwnedContext } from "../../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  TransactionReview,
  type TransactionReviewProps,
} from "@/components/transaction-review/TransactionReview";
import {
  useAccountReview,
  type UseAccountReviewResult,
} from "@/hooks/useAccountReview";
import {
  makeT025ReviewSession,
  T025_IDS,
} from "../../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";
import {
  SECOND_GROUP_ID,
  SECOND_UNDO_ID,
  twoGroupSession,
  removeActualGroup,
  makeUnconfirmedCurrencyReview,
  initializeCanonicalReviewTranslations,
  makeExistingT025AtmChoiceReview,
  makeSelectedSecondT025Review,
} from "./TransactionReview.canonical-edit-fixtures";

const mockDispatch = jest.fn();
const mockModal = jest.fn<void, [ControlledReviewTransactionEditModalProps]>();
const mockChoiceProps = jest.fn<void, [AccountChoiceSheetProps]>();
const mockCandidates = jest.fn<
  ReturnType<UseAccountReviewResult["getAccountCandidates"]>,
  Parameters<UseAccountReviewResult["getAccountCandidates"]>
>();
const mockUndoRemoval = jest.fn();
const mockDiscardRemovedSuggestion = jest.fn<Promise<void>, [string]>();

jest.mock("@/hooks/useAccountReview", () => ({
  useAccountReview: jest.fn(),
}));
jest.mock("@/hooks/useTransactionReviewState", () => ({
  useTransactionReviewState: () => {
    throw new Error("canonical_must_not_use_legacy_review_state");
  },
}));
jest.mock("@/hooks/useAccountDisplayNames", () => ({
  useAccountDisplayNames: () => new Map(),
}));
jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));
jest.mock("@/context/CategoriesContext", () => ({
  useCategoryLookup: (): ReadonlyMap<string, never> => new Map<string, never>(),
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: string } => ({ language: "en" }),
}));
jest.mock("@/utils/transaction-review-provider", () => ({
  resolveTransactionReviewProvider: () => null,
}));
jest.mock("@/components/transaction-review/get-expanded-content", () => ({
  getExpandedContent: () => null,
}));
jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: () => null,
}));
jest.mock("@/components/transaction-review/AccountReviewPanel", () => ({
  // Actual panel tabs are tested separately; this host forwards current
  // canonical parent values and callbacks without simulating selection.
  AccountReviewPanel: jest.requireActual<
    typeof import("./TransactionReview.canonical-edit-fixtures")
  >("./TransactionReview.canonical-edit-fixtures")
    .renderCanonicalAccountReviewPanel,
}));
jest.mock("@/components/transaction-review/AccountChoiceSheet", () => {
  // Retain the REAL linked-row Context/Provider used by the canonical
  // container. Only the painted sheet is mocked so command semantics stay real.
  const actual = jest.requireActual<
    typeof import("@/components/transaction-review/AccountChoiceSheet")
  >("@/components/transaction-review/AccountChoiceSheet");
  return {
    ...actual,
    AccountChoiceSheet: (props: AccountChoiceSheetProps) => {
      mockChoiceProps(props);
      if (!props.visible) return null;
      const ReactActual = jest.requireActual<typeof import("react")>("react");
      const RN =
        jest.requireActual<typeof import("react-native")>("react-native");
      return ReactActual.createElement(
        RN.View,
        { testID: "canonical-account-choice" },
        ...props.candidateOptions.map((candidate) =>
          ReactActual.createElement(
            RN.TouchableOpacity,
            {
              key: candidate.id,
              testID: "pr-choose-option-" + candidate.id,
              disabled: !candidate.isEligible,
              onPress: () => props.onSelectCandidate(candidate.id),
            },
            ReactActual.createElement(RN.Text, null, candidate.displayName)
          )
        ),
        ReactActual.createElement(
          RN.TouchableOpacity,
          {
            testID: "canonical-use-account",
            disabled: !props.canUseSelection,
            onPress: props.onUseSelected,
          },
          ReactActual.createElement(RN.Text, null, "Use account and currency")
        ),
        ReactActual.createElement(
          RN.TouchableOpacity,
          { testID: "pr-account-cancel", onPress: props.onClose },
          ReactActual.createElement(RN.Text, null, "Cancel")
        )
      );
    },
  };
});
jest.mock("@/components/transaction-review/EditSuggestedAccountSheet", () => ({
  EditSuggestedAccountSheet: () => null,
}));
jest.mock("@/components/transaction-review/ReviewActionBar", () => ({
  ReviewActionBar: (props: {
    onDiscard: () => void;
    hideDiscard?: boolean;
    selectedCount: number;
  }) => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactActual.createElement(
      RN.View,
      { testID: "pr-action-bar" },
      ReactActual.createElement(
        RN.Text,
        { testID: "pr-global-save-selected-count" },
        String(props.selectedCount)
      ),
      props.hideDiscard
        ? null
        : ReactActual.createElement(
            RN.TouchableOpacity,
            { testID: "canonical-discard-all", onPress: props.onDiscard },
            ReactActual.createElement(RN.Text, null, "Discard all")
          )
    );
  },
}));
jest.mock("@/components/transaction-review/ReviewFiltersSheet", () => ({
  ReviewFiltersSheet: () => null,
}));
jest.mock("@/components/transaction-review/PartialSmsResultsNotice", () => ({
  PartialSmsResultsNotice: (props: { onRetry: () => void }) => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactActual.createElement(
      RN.View,
      {
        testID: "canonical-partial-results",
      },
      ReactActual.createElement(
        RN.TouchableOpacity,
        {
          testID: "pr-sms-retry",
          onPress: props.onRetry,
        },
        ReactActual.createElement(RN.Text, null, "Retry")
      )
    );
  },
}));
jest.mock("@/components/sms-sync/SafeguardQaDiagnosticsPanel", () => ({
  SafeguardQaDiagnosticsPanel: () => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactActual.createElement(RN.View, {
      testID: "canonical-qa-diagnostics",
    });
  },
}));
jest.mock("@/components/transaction-review/SmsReviewUndoBanner", () =>
  jest.requireActual<
    typeof import("@/components/transaction-review/SmsReviewUndoBanner")
  >("@/components/transaction-review/SmsReviewUndoBanner")
);
jest.mock(
  "@/components/transaction-review/edit-modal/TransactionEditModal",
  () => ({
    TransactionEditModal: (
      props: ControlledReviewTransactionEditModalProps
    ): React.JSX.Element => {
      const ReactActual = jest.requireActual<typeof import("react")>("react");
      const RN =
        jest.requireActual<typeof import("react-native")>("react-native");
      mockModal(props);
      const editAction = (
        testID: string,
        label: string,
        onPress: () => void
      ): React.JSX.Element =>
        ReactActual.createElement(
          RN.TouchableOpacity,
          { testID, onPress },
          ReactActual.createElement(RN.Text, null, label)
        );
      return ReactActual.createElement(
        RN.View,
        { testID: "canonical-transaction-edit-modal" },
        editAction(
          "canonical-submit-edit",
          "Save",
          () => void props.onSubmit({ amountDecimal: "60.25" })
        ),
        editAction("canonical-cancel-edit", "Cancel", props.onClose)
      );
    },
  })
);
jest.mock("@/components/transaction-review/TransactionItem", () => ({
  ReviewTransactionItemSkeleton: () => null,
  TransactionItem: jest.requireActual<
    typeof import("./TransactionReview.canonical-edit-fixtures")
  >("./TransactionReview.canonical-edit-fixtures")
    .renderCanonicalReviewTransactionItem,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string): string => key,
    i18n: { language: "en", resolvedLanguage: "en" },
  }),
}));

const sourceSession = makeT025ReviewSession();
const rowId = sourceSession.rows[0]?.rowId;
if (!rowId) throw new Error("Missing real fixture row");
function fakeHook(
  session: AccountReviewSession | null = sourceSession,
  busy = false
): UseAccountReviewResult {
  return {
    session,
    readModel: session
      ? projectAccountReviewSession({
          session,
          accountSnapshots: makeOwnedContext(),
        })
      : null,
    choiceAccounts: [],
    isBusy: busy,
    undoToken: null,
    undoGroupId: null,
    discardedGroupIds: [],
    error: null,
    dispatch: mockDispatch,
    reload: jest.fn(),
    undoRemoval: mockUndoRemoval,
    discardRemovedSuggestion: mockDiscardRemovedSuggestion,
    getAccountCandidates: mockCandidates,
  };
}
const mockHook = useAccountReview as jest.MockedFunction<
  typeof useAccountReview
>;

const safePartialSummary: NonNullable<
  TransactionReviewProps["partialResults"]
>["safeguardSummary"] = {
  admittedAiCount: 0,
  deferredAiCount: 1,
  oversizedCount: 0,
  unresolvedCount: 1,
  completionStatus: "partial",
};

function reviewableTransactions(
  session: AccountReviewSession
): readonly ReviewableTransaction[] {
  return session.rows.map((row) => row.transaction);
}

function review(
  overrides?: { ownerId?: string; sessionId?: string },
  withPartialResults = false,
  retryState?: {
    readonly isRetrying: boolean;
    readonly onRetry: () => void;
  },
  feedback?: ReviewFeedbackBoundary
): React.JSX.Element {
  const input = {
    mode: "SMS" as const,
    ownerId: overrides?.ownerId ?? sourceSession.ownerId,
    sessionId: overrides?.sessionId ?? sourceSession.sessionId,
    queueId: overrides?.sessionId ?? sourceSession.sessionId,
  };
  return (
    <TransactionReview
      accountReview={{ input, onSaveSelected: jest.fn() }}
      reviewFeedback={feedback}
      transactions={reviewableTransactions(sourceSession)}
      onSave={jest.fn()}
      onDiscard={jest.fn()}
      isSaving={false}
      workspaceVariant="sms"
      partialResults={
        withPartialResults
          ? {
              safeguardSummary: safePartialSummary,
              retryableCount: 1,
              canRetry: true,
              isRetrying: retryState?.isRetrying ?? false,
              hasRetryError: false,
              onRetry: retryState?.onRetry ?? jest.fn(),
            }
          : undefined
      }
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHook.mockImplementation(() => fakeHook());
  mockCandidates.mockReturnValue([]);
  mockUndoRemoval.mockReset();
  mockDiscardRemovedSuggestion.mockReset();
  mockDiscardRemovedSuggestion.mockResolvedValue(undefined);
  mockDispatch.mockImplementation(() =>
    Promise.resolve({
      reasonCodes: [],
      effect: "persist_sms",
      state: sourceSession,
      affectedRowIds: [rowId],
      affectedGroupIds: [],
      undoToken: null,
    })
  );
});

beforeAll(initializeCanonicalReviewTranslations);

describe("#395 T054 canonical transaction edit route", () => {
  it("row body enters existing controlled modal and dispatches only current row-CAS command", async () => {
    const screen = render(review());
    fireEvent.press(screen.getAllByTestId("canonical-edit-row")[0]);
    expect(screen.getByTestId("canonical-transaction-edit-modal")).toBeTruthy();
    const modalProps = mockModal.mock.lastCall?.[0];
    if (!modalProps) throw new Error("missing_canonical_modal_props");
    expect(modalProps.controlledReview).toBe(true);
    expect(modalProps.ownerId).toBe(sourceSession.ownerId);
    expect(modalProps.row.rowId).toBe(rowId);
    fireEvent.press(screen.getByTestId("canonical-submit-edit"));
    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith({
        kind: "edit_row_transaction",
        ownerId: sourceSession.ownerId,
        sessionId: sourceSession.sessionId,
        expectedReviewRevision: sourceSession.revision,
        expectedOperationGeneration: sourceSession.operationGeneration,
        rowId,
        expectedRowRevision: sourceSession.rows[0]?.revision,
        patch: { amountDecimal: "60.25" },
      })
    );
  });
  it("Cancel removes editor without dispatch or creating a financial entity", () => {
    const screen = render(review());
    fireEvent.press(screen.getAllByTestId("canonical-edit-row")[0]);
    fireEvent.press(screen.getByTestId("canonical-cancel-edit"));
    expect(screen.queryByTestId("canonical-transaction-edit-modal")).toBeNull();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
  it("revokes stale modal on owner/session replacement before any attempted Save", async () => {
    const screen = render(review());
    fireEvent.press(screen.getAllByTestId("canonical-edit-row")[0]);
    expect(screen.getByTestId("canonical-transaction-edit-modal")).toBeTruthy();
    // No foreign record is exposed during rerender, even before an effect.
    mockHook.mockImplementation(() => fakeHook(null));
    screen.rerender(review({ ownerId: T025_IDS.foreignOwner }));
    await waitFor(() =>
      expect(
        screen.queryByTestId("canonical-transaction-edit-modal")
      ).toBeNull()
    );
    expect(mockDispatch).not.toHaveBeenCalled();
  });
  it("refuses a late close from a superseded modal without hiding the newer revision", async () => {
    const rendered = render(review());
    fireEvent.press(rendered.getAllByTestId("canonical-edit-row")[0]);
    const priorClose = mockModal.mock.lastCall?.[0]?.onClose;
    if (typeof priorClose !== "function")
      throw new Error("old_controlled_editor_close_missing");
    const refreshed: AccountReviewSession = {
      ...sourceSession,
      revision: "1",
      operationGeneration: "1",
      rows: sourceSession.rows.map((row) => ({ ...row, revision: "1" })),
    };
    mockHook.mockImplementation(() => fakeHook(refreshed));
    rendered.rerender(review());
    await waitFor(() =>
      expect(
        rendered.queryByTestId("canonical-transaction-edit-modal")
      ).toBeNull()
    );
    fireEvent.press(rendered.getAllByTestId("canonical-edit-row")[0]);
    expect(
      rendered.getByTestId("canonical-transaction-edit-modal")
    ).toBeTruthy();

    priorClose();
    expect(
      rendered.getByTestId("canonical-transaction-edit-modal")
    ).toBeTruthy();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
  it("renders supplied partial-SMS retry notice and QA diagnostics above the canonical panel", () => {
    const screen = render(review(undefined, true));
    expect(screen.getByTestId("canonical-partial-results")).toBeTruthy();
    expect(screen.getByTestId("canonical-qa-diagnostics")).toBeTruthy();
    expect(screen.getByTestId("canonical-review-panel")).toBeTruthy();
  });
  it("does not invent a partial-results notice when the source supplied none", () => {
    const screen = render(review());
    expect(screen.queryByTestId("canonical-partial-results")).toBeNull();
    expect(screen.getByTestId("canonical-qa-diagnostics")).toBeTruthy();
  });
});

describe("#395 PR396 review comment regressions — canonical actual-container bindings", () => {
  it("one selected owned account sends the atomic account-and-currency row command", async () => {
    const conflicting = makeUnconfirmedCurrencyReview(sourceSession);
    const row = conflicting.rows[0];
    const bank = makeOwnedContext().accounts.find(
      (account) => account.type === "BANK"
    );
    if (!row || !bank) throw new Error("Missing owned bank review");
    mockHook.mockImplementation(() => ({
      ...fakeHook(conflicting),
      choiceAccounts: makeOwnedContext().accounts,
    }));
    const screen = render(review());
    fireEvent.press(screen.getByTestId("canonical-choose-account"));
    expect(screen.queryByTestId("pr-currency-sheet")).toBeNull();
    expect(screen.queryByTestId("pr-full-currency-picker")).toBeNull();
    fireEvent.press(screen.getByTestId("pr-choose-option-" + bank.id));
    fireEvent.press(screen.getByTestId("canonical-use-account"));
    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "confirm_row_account_and_currency",
          rowId: row.rowId,
          role: "source",
          accountId: bank.id,
          acknowledgedCurrency: bank.currency,
        })
      )
    );
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it("account chooser cancel does not confirm an unknown currency or select a row", () => {
    const conflicting = makeUnconfirmedCurrencyReview(sourceSession);
    mockHook.mockImplementation(() => ({
      ...fakeHook(conflicting),
      choiceAccounts: makeOwnedContext().accounts,
    }));
    const screen = render(review());
    fireEvent.press(screen.getByTestId("canonical-choose-account"));
    fireEvent.press(screen.getByTestId("pr-account-cancel"));
    expect(screen.queryByTestId("canonical-account-choice")).toBeNull();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("rejected owned account CAS keeps the chooser open and reports actual reason", async () => {
    const session = makeUnconfirmedCurrencyReview(sourceSession);
    const bank = makeOwnedContext().accounts.find((a) => a.type === "BANK");
    if (!bank) throw new Error("Missing owned bank");
    const feedback: ReviewFeedbackBoundary = {
      pageNotice: null,
      modalNotice: null,
      dismiss: jest.fn(),
      showNotice: jest.fn(),
      reportFailure: jest.fn(),
    };
    mockHook.mockImplementation(() => ({
      ...fakeHook(session),
      choiceAccounts: makeOwnedContext().accounts,
    }));
    mockDispatch.mockImplementationOnce(() =>
      Promise.resolve({
        state: session,
        reasonCodes: ["review_revision_stale"],
        effect: "none",
        affectedRowIds: [],
        affectedGroupIds: [],
        undoToken: null,
      })
    );
    const screen = render(review(undefined, false, undefined, feedback));
    fireEvent.press(screen.getByTestId("canonical-choose-account"));
    fireEvent.press(screen.getByTestId("pr-choose-option-" + bank.id));
    fireEvent.press(screen.getByTestId("canonical-use-account"));
    await waitFor(() =>
      expect(feedback.reportFailure).toHaveBeenCalledWith({
        stage: "command",
        surface: "modal",
        reasonCodes: ["review_revision_stale"],
      })
    );
    expect(screen.getByTestId("canonical-account-choice")).toBeTruthy();
  });

  it("Needs review shows missing-account rows without changing global selected Save scope", () => {
    const two = twoGroupSession();
    const bank = makeOwnedContext().accounts.find((a) => a.type === "BANK");
    if (!bank) throw new Error("Missing owned bank");
    const needsReview = accountReviewSessionSchema.parse({
      ...two,
      filter: "needs_review",
      groups: [],
      rows: two.rows.map((row, index) =>
        index === 0
          ? {
              ...row,
              assignment: {
                state: "unresolved",
                accountId: null,
                reasonCode: "account_needed",
                candidateAccountIds: [],
              },
              reviewReasons: ["account_needed"],
            }
          : {
              ...row,
              assignment: {
                state: "existing",
                accountId: bank.id,
                origin: "user",
                currency: bank.currency,
                identityRevision: "0",
              },
              reviewReasons: [],
              selected: true,
            }
      ),
    });
    mockHook.mockImplementation(() => fakeHook(needsReview));
    const view = render(review());
    expect(view.getByTestId("pr-account-needed-count")).toHaveTextContent("1");
    expect(view.getAllByTestId("canonical-edit-row")).toHaveLength(1);
    expect(view.getByTestId("canonical-choose-account")).toBeTruthy();
    expect(view.getByTestId("pr-global-save-selected-count")).toHaveTextContent(
      "1"
    );
    expect(view.getByTestId("canonical-discard-all")).toBeTruthy();

    const all = accountReviewSessionSchema.parse({
      ...needsReview,
      filter: "all",
    });
    mockHook.mockImplementation(() => fakeHook(all));
    view.rerender(review());
    expect(view.getAllByTestId("canonical-edit-row")).toHaveLength(2);
    expect(view.getByTestId("pr-global-save-selected-count")).toHaveTextContent(
      "1"
    );
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("linked disclosure preserves main-list rows, account identity and global selection", () => {
    const linked = twoGroupSession();
    mockHook.mockImplementation(() => fakeHook(linked));
    const screen = render(review());
    expect(screen.getAllByTestId("canonical-edit-row")).toHaveLength(2);
    fireEvent.press(
      screen.getByTestId("account-review-compact-summary-toggle")
    );
    const button = screen.getByTestId(
      "account-review-group-linked-" + SECOND_GROUP_ID
    );
    fireEvent.press(button);
    expect(
      screen.getByTestId("account-review-group-linked-row-" + T025_IDS.rowTwo)
    ).toBeTruthy();
    expect(
      screen.queryByTestId("account-review-group-linked-row-" + T025_IDS.rowOne)
    ).toBeNull();
    expect(screen.getAllByTestId("canonical-edit-row")).toHaveLength(2);
    expect(screen.getByTestId("pr-source-account-1")).toHaveTextContent(
      "QNB Two"
    );
    expect(screen.getByTestId("canonical-discard-all")).toBeTruthy();
    expect(
      screen.queryByTestId("account-review-linked-transactions-only")
    ).toBeNull();
    expect(
      screen.getByTestId("pr-global-save-selected-count")
    ).toHaveTextContent(
      String(linked.rows.filter((row) => row.selected).length)
    );
    fireEvent.press(button);
    expect(
      screen.queryByTestId(
        "account-review-group-linked-list-" + SECOND_GROUP_ID
      )
    ).toBeNull();
    expect(screen.getAllByTestId("canonical-edit-row")).toHaveLength(2);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("real removals A then B expose Undo only on B; B restoration never restores A", async () => {
    const before = twoGroupSession();
    const first = removeActualGroup(
      before,
      T025_IDS.group,
      T025_IDS.undoToken,
      null
    );
    expect(first.reasonCodes).toEqual([]);
    const firstLease = {
      token: T025_IDS.undoToken,
      previousState: before,
      afterRemovalGeneration: first.state.operationGeneration,
    };
    const second = removeActualGroup(
      first.state,
      SECOND_GROUP_ID,
      SECOND_UNDO_ID,
      firstLease
    );
    expect(second.reasonCodes).toEqual([]);
    expect(second.state.groups.map((g) => g.status)).toEqual([
      "removed",
      "removed",
    ]);
    const latestLease = {
      token: SECOND_UNDO_ID,
      previousState: first.state,
      afterRemovalGeneration: second.state.operationGeneration,
    };
    // Exercise the shared pure lease identity, rather than copying its logic.
    const latestRemovedGroupId = currentReviewUndoGroupId(
      second.state,
      latestLease
    );
    expect(latestRemovedGroupId).toBe(SECOND_GROUP_ID);
    const undoB = reduceAccountReviewCommand({
      state: second.state,
      command: accountReviewCommandSchema.parse({
        kind: "undo_removal",
        ownerId: second.state.ownerId,
        sessionId: second.state.sessionId,
        expectedReviewRevision: second.state.revision,
        expectedOperationGeneration: second.state.operationGeneration,
        undoToken: SECOND_UNDO_ID,
      }),
      accountSnapshots: makeOwnedContext(),
      nextUndoToken: null,
      undo: latestLease,
    });
    expect(undoB.reasonCodes).toEqual([]);
    expect(
      undoB.state.groups.find((g) => g.groupId === T025_IDS.group)?.status
    ).toBe("removed");
    expect(
      undoB.state.groups.find((g) => g.groupId === SECOND_GROUP_ID)?.status
    ).not.toBe("removed");
    mockUndoRemoval.mockResolvedValue(undoB);
    mockHook.mockImplementation(() => ({
      ...fakeHook(second.state),
      undoToken: latestLease.token,
      undoGroupId: latestRemovedGroupId,
    }));
    const screen = render(review());
    expect(screen.queryByTestId("pr-undo-" + T025_IDS.group)).toBeNull();
    fireEvent.press(screen.getByTestId("pr-discard-" + SECOND_GROUP_ID));
    await waitFor(() =>
      expect(mockDiscardRemovedSuggestion).toHaveBeenCalledWith(SECOND_GROUP_ID)
    );
    expect(mockDispatch).not.toHaveBeenCalled();
    // Presentation callback alone is NOT evidence that the real Undo lease
    // was revoked. Keep the existing independent Undo scope assertion.
    fireEvent.press(screen.getByTestId("pr-undo-" + SECOND_GROUP_ID));
    await waitFor(() => expect(mockUndoRemoval).toHaveBeenCalledTimes(1));
    expect(undoB.affectedGroupIds).toContain(SECOND_GROUP_ID);
    expect(undoB.affectedGroupIds).not.toContain(T025_IDS.group);
  });

  it("resolved SMS ATM Cash destination remains visible and editable after the first choice", () => {
    const {
      session: resolved,
      owned,
      bank,
      cash,
    } = makeExistingT025AtmChoiceReview();
    const row = resolved.rows[0];
    if (!row) throw new Error("Missing owned ATM row");
    mockHook.mockImplementation(() => ({
      ...fakeHook(resolved),
      choiceAccounts: owned,
    }));
    const screen = render(review());
    expect(
      screen.getByTestId("account-review-atm-destination-status")
    ).toHaveTextContent(/Cash/);
    // Exercise the real, localized destination button (not the source action).
    fireEvent.press(
      screen.getByTestId("account-review-atm-destination-action")
    );
    const choice = mockChoiceProps.mock.lastCall?.[0];
    expect(choice?.selectedCandidateId).toBe(cash.id);
    expect(choice?.candidateOptions.map((item) => item.id)).toContain(cash.id);
    fireEvent.press(screen.getByTestId("canonical-use-account"));
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "confirm_row_account_and_currency",
        rowId: row.rowId,
        role: "destination",
        accountId: cash.id,
        acknowledgedCurrency: "EGP",
      })
    );
    fireEvent.press(screen.getByTestId("canonical-choose-account"));
    const sourceChoice = mockChoiceProps.mock.lastCall?.[0];
    expect(sourceChoice?.selectedCandidateId).toBe(bank.id);
    expect(sourceChoice?.candidateOptions.map((item) => item.id)).toContain(
      bank.id
    );
  });

  it("currency/account blockers stay in Needs review with no duplicate card actions", () => {
    const blocked = makeUnconfirmedCurrencyReview(sourceSession);
    mockHook.mockImplementation(() =>
      fakeHook(
        accountReviewSessionSchema.parse({ ...blocked, filter: "needs_review" })
      )
    );
    const rendered = render(review());
    expect(rendered.getByTestId("pr-account-needed-count")).toHaveTextContent(
      "1"
    );
    expect(rendered.queryAllByTestId("pr-localized-row-issue")).toHaveLength(0);
    expect(rendered.getAllByTestId("canonical-edit-row")).toHaveLength(1);
    expect(rendered.getByTestId("canonical-choose-account")).toBeTruthy();
    expect(
      rendered.getByTestId("pr-global-save-selected-count")
    ).toHaveTextContent("0");
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(blocked.rows[0]?.currency.state).toBe("unconfirmed");
  });

  it.each(["exact", "default", "user"] as const)(
    "an existing %s assignment is neutral, not an amber pending group",
    (origin) => {
      const row = sourceSession.rows[0];
      const bank = makeOwnedContext().accounts.find((a) => a.type === "BANK");
      if (!row || !bank) throw new Error("missing_owned_existing_account");
      const ready = accountReviewSessionSchema.parse({
        ...sourceSession,
        groups: [],
        rows: [
          {
            ...row,
            selected: true,
            assignment: {
              state: "existing",
              accountId: bank.id,
              origin,
              currency: bank.currency,
              identityRevision: "0",
            },
            reviewReasons: [],
          },
        ],
      });
      mockHook.mockImplementation(() => ({
        ...fakeHook(ready),
        choiceAccounts: makeOwnedContext().accounts,
      }));
      const screen = render(review());
      const tone = screen.getByTestId("pr-account-tone-0");
      expect(tone).toHaveTextContent("neutral");
      expect(tone).not.toHaveTextContent("pending");
      expect(tone).not.toHaveTextContent("removed");
      expect(screen.getByTestId("pr-source-account-0")).toHaveTextContent(
        bank.name
      );
      if (origin === "default") {
        expect(screen.getByTestId("pr-account-status-0")).toHaveTextContent(
          "Default account"
        );
      }
    }
  );

  it("SMS retry reloads only after the same queue's durable retry completion transition", async () => {
    const reload = jest.fn();
    mockHook.mockImplementation(() => ({ ...fakeHook(), reload }));
    const retry = jest.fn(() => Promise.resolve());
    const idle = { isRetrying: false, onRetry: retry };
    const active = { isRetrying: true, onRetry: retry };
    const rendered = render(review(undefined, true, idle));
    fireEvent.press(rendered.getByTestId("pr-sms-retry"));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();

    // The producer exposes isRetrying=true while awaiting its real queue
    // merge. The canonical container must not reload incomplete work.
    rendered.rerender(review(undefined, true, active));
    expect(reload).not.toHaveBeenCalled();

    // The existing producer sets false after its durable merge settles.
    rendered.rerender(review(undefined, true, idle));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    rendered.rerender(review(undefined, true, idle));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledTimes(1);

    expect(
      mockHook.mock.calls.every(
        ([input]) =>
          input.mode === "SMS" &&
          input.ownerId === sourceSession.ownerId &&
          input.sessionId === sourceSession.sessionId &&
          input.queueId === sourceSession.sessionId
      )
    ).toBe(true);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("#395 SMS filtered canonical discard wiring", () => {
  it("maps the visible filtered row to its original SMS index and restores explicit footer discard", async () => {
    const { original: two, filtered: selected } =
      makeSelectedSecondT025Review();
    mockHook.mockImplementation(() => fakeHook(selected));
    const onDiscardItem = jest.fn();
    const onDiscard = jest.fn();
    const screen = render(
      <TransactionReview
        accountReview={{
          input: {
            mode: "SMS",
            ownerId: selected.ownerId,
            sessionId: selected.sessionId,
            queueId: selected.sessionId,
          },
          onSaveSelected: jest.fn(),
        }}
        transactions={reviewableTransactions(two)}
        onSave={jest.fn()}
        onDiscard={onDiscard}
        onDiscardItem={onDiscardItem}
        isSaving={false}
        workspaceVariant="sms"
      />
    );
    expect(screen.getByTestId("sms-review-discard-0")).toBeTruthy();
    expect(screen.queryByTestId("sms-review-discard-1")).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId("sms-review-discard-0"));
      await Promise.resolve();
    });
    expect(onDiscardItem).toHaveBeenCalledTimes(1);
    expect(onDiscardItem).toHaveBeenCalledWith(1, true);
    fireEvent.press(screen.getByTestId("canonical-discard-all"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});

registerCanonicalReviewActionCases({
  sourceSession,
  fakeHook,
  mockHook,
  mockDispatch,
  review,
  reviewableTransactions,
});
