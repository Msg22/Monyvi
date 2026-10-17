/**
 * #395 T054 RNTL tests-first — canonical row body transaction edit and
 * owner/revision scoped cancellation. No legacy edit state or financial writer.
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";

import type { ReviewableTransaction } from "@monyvi/logic";
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

const mockDispatch = jest.fn();
const mockModal = jest.fn<void, [ControlledReviewTransactionEditModalProps]>();
const mockToast = jest.fn();

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
  AccountReviewPanel: () => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactActual.createElement(RN.View, {
      testID: "canonical-review-panel",
    });
  },
}));
jest.mock("@/components/transaction-review/AccountChoiceSheet", () => ({
  AccountChoiceSheet: () => null,
}));
jest.mock("@/components/transaction-review/CurrencyConfirmationSheet", () => ({
  CurrencyConfirmationSheet: () => null,
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
  PartialSmsResultsNotice: () => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactActual.createElement(RN.View, {
      testID: "canonical-partial-results",
    });
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
  CurrencyPicker: () => null,
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
  }: {
    index: number;
    onPress: (index: number) => void;
    accountReview: {
      onChooseAccount: (rowId: string) => void;
      onChooseCurrency: (rowId: string, context: string) => void;
      rowId: string;
    };
  }) => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactActual.createElement(
      RN.View,
      null,
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
    undoRemoval: jest.fn(),
    getAccountCandidates: () => [],
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
  withPartialResults = false
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
              isRetrying: false,
              hasRetryError: false,
              onRetry: jest.fn(),
            }
          : undefined
      }
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHook.mockImplementation(() => fakeHook());
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
