/** #395 canonical edit/review owner-revision and UI regressions. */

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import {
  accountReviewSessionSchema,
  accountReviewCommandSchema,
  type ReviewableTransaction,
} from "@monyvi/logic";
import { reduceAccountReviewCommand } from "../../../../../packages/logic/src/account-review/reducer";

import type { ControlledReviewTransactionEditModalProps } from "@/components/transaction-review/edit-modal/ControlledReviewTransactionEditModal";
import type { AccountReviewSession } from "../../../../../packages/logic/src/account-review/review-schemas";
import { projectAccountReviewSession } from "../../../../../packages/logic/src/account-review/read-model";
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
  toFacadeChoiceCandidate,
} from "./TransactionReview.canonical-edit-fixtures";

const mockDispatch = jest.fn();
const mockModal = jest.fn<void, [ControlledReviewTransactionEditModalProps]>();
const mockToast = jest.fn();
const mockCandidates = jest.fn<
  ReturnType<UseAccountReviewResult["getAccountCandidates"]>,
  Parameters<UseAccountReviewResult["getAccountCandidates"]>
>();
const mockUndoRemoval = jest.fn();

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
jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mockToast }),
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
  // Only the presentation boundary is replaced. All group eligibility,
  // undo leases, issue labels and callbacks are shaped by the real container.
  AccountReviewPanel: (props: {
    groups: ReadonlyArray<{
      groupId: string;
      isRemoved: boolean;
      canUndo: boolean;
      canRemove: boolean;
    }>;
    summary: {
      readonly issueLabels: readonly string[];
      readonly distinctNeedsReviewCount: number;
    };
    onUndo: (groupId: string) => void;
    onRemove: (groupId: string) => void;
  }) => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactActual.createElement(
      RN.View,
      { testID: "canonical-review-panel" },
      ...props.summary.issueLabels.map((label) =>
        ReactActual.createElement(
          RN.Text,
          {
            key: label,
            testID: "pr-localized-row-issue",
          },
          label
        )
      ),
      ...props.groups.flatMap((group) => [
        group.canRemove
          ? ReactActual.createElement(
              RN.TouchableOpacity,
              {
                key: "remove-" + group.groupId,
                testID: "pr-remove-" + group.groupId,
                onPress: () => props.onRemove(group.groupId),
              },
              ReactActual.createElement(RN.Text, null, "Remove")
            )
          : null,
        group.canUndo
          ? ReactActual.createElement(
              RN.TouchableOpacity,
              {
                key: "undo-" + group.groupId,
                testID: "pr-undo-" + group.groupId,
                onPress: () => props.onUndo(group.groupId),
              },
              ReactActual.createElement(RN.Text, null, "Undo")
            )
          : null,
      ])
    );
  },
}));
jest.mock("@/components/transaction-review/AccountChoiceSheet", () => ({
  AccountChoiceSheet: () => null,
}));
jest.mock("@/components/transaction-review/CurrencyConfirmationSheet", () => ({
  CurrencyConfirmationSheet: (props: {
    visible: boolean;
    candidateOptions: ReadonlyArray<{ code: string }>;
    selectedCandidateCode: string | null;
    canUseSelection: boolean;
    onChooseAnother: () => void;
    onSelectCandidate: (code: string) => void;
    onUseSelected: () => void;
  }) => {
    if (!props.visible) return null;
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    const canSubmit =
      props.canUseSelection &&
      props.candidateOptions.some(
        (c) => c.code === props.selectedCandidateCode
      );
    return ReactActual.createElement(
      RN.View,
      { testID: "pr-currency-sheet" },
      ReactActual.createElement(
        RN.Text,
        { testID: "pr-currency-options" },
        props.candidateOptions.map((c) => c.code).join(",")
      ),
      ...props.candidateOptions.map((option) =>
        ReactActual.createElement(
          RN.TouchableOpacity,
          {
            key: option.code,
            testID: "pr-currency-option-" + option.code,
            onPress: () => props.onSelectCandidate(option.code),
          },
          ReactActual.createElement(RN.Text, null, option.code)
        )
      ),
      ReactActual.createElement(
        RN.TouchableOpacity,
        {
          testID: "pr-currency-another",
          onPress: props.onChooseAnother,
        },
        ReactActual.createElement(RN.Text, null, "Choose another")
      ),
      ReactActual.createElement(
        RN.TouchableOpacity,
        {
          testID: "pr-currency-use",
          disabled: !canSubmit,
          onPress: props.onUseSelected,
        },
        ReactActual.createElement(RN.Text, null, "Use")
      )
    );
  },
}));
jest.mock("@/components/transaction-review/EditSuggestedAccountSheet", () => ({
  EditSuggestedAccountSheet: () => null,
}));
jest.mock("@/components/transaction-review/ReviewActionBar", () => ({
  ReviewActionBar: () => null,
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
jest.mock("@/components/transaction-review/SmsReviewUndoBanner", () => ({
  SmsReviewUndoBanner: () => null,
}));
jest.mock("@/components/currency/CurrencyPicker", () => ({
  CurrencyPicker: (props: {
    visible: boolean;
    onSelect: (code: "EUR") => void;
    onClose: () => void;
  }) => {
    if (!props.visible) return null;
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactActual.createElement(
      RN.View,
      { testID: "pr-full-currency-picker" },
      ReactActual.createElement(
        RN.TouchableOpacity,
        {
          testID: "pr-pick-EUR",
          onPress: () => props.onSelect("EUR"),
        },
        ReactActual.createElement(RN.Text, null, "EUR")
      ),
      ReactActual.createElement(
        RN.TouchableOpacity,
        {
          testID: "pr-close-picker",
          onPress: props.onClose,
        },
        ReactActual.createElement(RN.Text, null, "Close")
      )
    );
  },
}));
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
      const { onSubmit, onClose } = props;
      return ReactActual.createElement(
        RN.View,
        { testID: "canonical-transaction-edit-modal" },
        ReactActual.createElement(
          RN.TouchableOpacity,
          {
            testID: "canonical-submit-edit",
            onPress: () =>
              void onSubmit({
                amountDecimal: "60.25",
              }),
          },
          ReactActual.createElement(RN.Text, null, "Save")
        ),
        ReactActual.createElement(
          RN.TouchableOpacity,
          { testID: "canonical-cancel-edit", onPress: onClose },
          ReactActual.createElement(RN.Text, null, "Cancel")
        )
      );
    },
  })
);
jest.mock("@/components/transaction-review/TransactionItem", () => ({
  ReviewTransactionItemSkeleton: () => null,
  TransactionItem: ({
    onPress,
    index,
    accountReview,
    accountName,
  }: {
    index: number;
    onPress: (index: number) => void;
    accountName: string | null;
    accountReview: {
      onChooseAccount: (rowId: string) => void;
      onChooseCurrency: (rowId: string, context: string) => void;
      rowId: string;
      accountStatusTone?: string;
      accountStatusLabel?: string | null;
    };
  }) => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactActual.createElement(
      RN.View,
      null,
      ReactActual.createElement(
        RN.Text,
        {
          testID: "pr-account-tone-" + index,
        },
        accountReview.accountStatusTone ?? "neutral"
      ),
      ReactActual.createElement(
        RN.Text,
        {
          testID: "pr-source-account-" + index,
        },
        accountName ?? ""
      ),
      ReactActual.createElement(
        RN.Text,
        { testID: "pr-account-status-" + index },
        accountReview.accountStatusLabel ?? ""
      ),
      ReactActual.createElement(
        RN.TouchableOpacity,
        { testID: "canonical-edit-row", onPress: () => onPress(index) },
        ReactActual.createElement(RN.Text, null, "Row")
      ),
      ReactActual.createElement(
        RN.TouchableOpacity,
        {
          testID: "canonical-choose-account",
          onPress: () => accountReview.onChooseAccount(accountReview.rowId),
        },
        ReactActual.createElement(RN.Text, null, "Account")
      ),
      ReactActual.createElement(
        RN.TouchableOpacity,
        {
          testID: "canonical-choose-currency",
          onPress: () =>
            accountReview.onChooseCurrency(accountReview.rowId, "context"),
        },
        ReactActual.createElement(RN.Text, null, "Currency")
      )
    );
  },
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
    error: null,
    dispatch: mockDispatch,
    reload: jest.fn(),
    undoRemoval: mockUndoRemoval,
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
  }
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
  it("a tap in the existing picker directly commits only the pinned row with one foreground sheet", async () => {
    const conflicting = makeUnconfirmedCurrencyReview(sourceSession);
    const row = conflicting.rows[0];
    if (!row) throw new Error("missing_currency_row");
    mockHook.mockImplementation(() => fakeHook(conflicting));
    const screen = render(review());
    fireEvent.press(screen.getByTestId("canonical-choose-account"));
    // A guarded account chooser without a confirmed currency is never opened.
    expect(mockCandidates).not.toHaveBeenCalled();
    expect(screen.getByTestId("pr-currency-use")).toBeDisabled();
    expect(screen.getByTestId("pr-currency-options")).toHaveTextContent(
      "EGP,USD"
    );
    expect(screen.getByTestId("pr-currency-use")).toBeDisabled();
    expect(screen.queryByTestId("pr-full-currency-picker")).toBeNull();
    fireEvent.press(screen.getByTestId("pr-currency-another"));
    expect(screen.queryByTestId("pr-currency-sheet")).toBeNull();
    expect(screen.getByTestId("pr-full-currency-picker")).toBeTruthy();
    fireEvent.press(screen.getByTestId("pr-pick-EUR"));
    expect(screen.queryByTestId("pr-full-currency-picker")).toBeNull();
    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith({
        kind: "confirm_row_currency",
        ownerId: conflicting.ownerId,
        sessionId: conflicting.sessionId,
        expectedReviewRevision: conflicting.revision,
        expectedOperationGeneration: conflicting.operationGeneration,
        rowId: row.rowId,
        expectedRowRevision: row.revision,
        currency: "EUR",
      })
    );
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockCandidates).not.toHaveBeenCalled();
  });
  it("picker cancel leaves the original row and currency untouched", () => {
    const conflicting = makeUnconfirmedCurrencyReview(sourceSession);
    mockHook.mockImplementation(() => fakeHook(conflicting));
    const screen = render(review());
    fireEvent.press(screen.getByTestId("canonical-choose-currency"));
    fireEvent.press(screen.getByTestId("pr-currency-another"));
    fireEvent.press(screen.getByTestId("pr-close-picker"));
    expect(screen.queryByTestId("pr-currency-sheet")).toBeNull();
    expect(screen.queryByTestId("pr-full-currency-picker")).toBeNull();
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
    // Match the facade's actual transient lease identity: only the group
    // newly removed between this lease's previous/current canonical states.
    const latestRemovedIds = latestLease.previousState.groups
      .filter(
        (prior) =>
          prior.status !== "removed" &&
          !latestLease.previousState.removedEvidenceKeys.includes(
            prior.evidenceKey
          ) &&
          second.state.removedEvidenceKeys.includes(prior.evidenceKey) &&
          second.state.groups.some(
            (current) =>
              current.groupId === prior.groupId &&
              current.status === "removed" &&
              current.evidenceKey === prior.evidenceKey
          )
      )
      .map((group) => group.groupId);
    expect(latestRemovedIds).toEqual([SECOND_GROUP_ID]);
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
      undoGroupId: latestRemovedIds[0] ?? null,
    }));
    const screen = render(review());
    expect(screen.queryByTestId("pr-undo-" + T025_IDS.group)).toBeNull();
    fireEvent.press(screen.getByTestId("pr-undo-" + SECOND_GROUP_ID));
    await waitFor(() => expect(mockUndoRemoval).toHaveBeenCalledTimes(1));
    expect(undoB.affectedGroupIds).toContain(SECOND_GROUP_ID);
    expect(undoB.affectedGroupIds).not.toContain(T025_IDS.group);
  });

  it("resolved SMS ATM Cash destination remains visible and editable after the first choice", () => {
    const row = sourceSession.rows[0];
    const owned = makeOwnedContext().accounts;
    const bank = owned.find((a) => a.type === "BANK");
    const cash = owned.find((a) => a.type === "CASH");
    if (!row || !bank || !cash)
      throw new Error("missing_real_owned_atm_endpoints");
    const resolved = accountReviewSessionSchema.parse({
      ...sourceSession,
      groups: [],
      rows: [
        {
          ...row,
          assignment: {
            state: "existing",
            accountId: bank.id,
            origin: "user",
            currency: "EGP",
            identityRevision: "0",
          },
          toAssignment: {
            state: "existing",
            accountId: cash.id,
            origin: "user",
            currency: "EGP",
            identityRevision: "0",
          },
          transaction: {
            ...row.transaction,
            isAtmWithdrawal: true,
            toAccountId: cash.id,
          },
          reviewReasons: [],
        },
      ],
    });
    mockCandidates.mockImplementation((_id, role) =>
      role === "destination"
        ? [toFacadeChoiceCandidate(cash)]
        : [toFacadeChoiceCandidate(bank)]
    );
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
    expect(mockCandidates).toHaveBeenCalledWith(row.rowId, "destination");
  });

  it("compact details preserve localized row blockers even with zero suggestions", () => {
    const row = sourceSession.rows[0];
    if (!row) throw new Error("missing_row_for_compact_blockers");
    const blocked = accountReviewSessionSchema.parse({
      ...sourceSession,
      groups: [],
      rows: [
        {
          ...row,
          selected: false,
          assignment: {
            state: "unresolved",
            accountId: null,
            reasonCode: "account_unavailable",
            candidateAccountIds: [],
          },
          reviewReasons: [
            "account_unavailable",
            "currency_confirmation_needed",
          ],
          currency: {
            state: "unconfirmed",
            reason: "conflicting",
            candidateCodes: ["EGP", "USD"],
            statedCode: "EGP",
            evidenceSpans: [],
          },
        },
      ],
    });
    mockHook.mockImplementation(() => fakeHook(blocked));
    const screen = render(review());
    const labels = screen
      .getAllByTestId("pr-localized-row-issue")
      .map((node) => String(node.props.children));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some((label) => /account|currency/i.test(label))).toBe(true);
    expect(
      labels.every(
        (label) =>
          !label.includes("account_unavailable") &&
          !label.includes("currency_confirmation_needed")
      )
    ).toBe(true);
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
