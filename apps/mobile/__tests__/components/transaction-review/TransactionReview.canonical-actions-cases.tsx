import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import {
  accountReviewSessionSchema,
  type AccountReviewSession,
  type ReviewableTransaction,
} from "@monyvi/logic";
import {
  TransactionReview,
  type TransactionReviewProps,
} from "@/components/transaction-review/TransactionReview";
import type {
  useAccountReview,
  UseAccountReviewResult,
} from "@/hooks/useAccountReview";
import {
  makeUnconfirmedCurrencyReview,
  makeSelectedSecondT025Review,
} from "./TransactionReview.canonical-edit-fixtures";

export function registerCanonicalReviewActionCases(input: {
  readonly sourceSession: AccountReviewSession;
  readonly fakeHook: (
    session?: AccountReviewSession | null,
    busy?: boolean
  ) => UseAccountReviewResult;
  readonly mockHook: jest.MockedFunction<typeof useAccountReview>;
  readonly mockDispatch: jest.Mock;
  readonly review: () => React.JSX.Element;
  readonly reviewableTransactions: (
    session: AccountReviewSession
  ) => readonly ReviewableTransaction[];
}): void {
  const {
    sourceSession,
    fakeHook,
    mockHook,
    mockDispatch,
    review,
    reviewableTransactions,
  } = input;
  describe("current review asynchronous actions", () => {
    it("reloads only after a durable row discard and removes its stale canonical row", async () => {
      const { original } = makeSelectedSecondT025Review();
      const remaining = accountReviewSessionSchema.parse({
        ...original,
        rows: original.rows.slice(1),
        groups: original.groups
          .map((group) => ({
            ...group,
            linkedRowIds: group.linkedRowIds.filter((id) =>
              original.rows.slice(1).some((row) => row.rowId === id)
            ),
          }))
          .filter((group) => group.linkedRowIds.length > 0),
      });
      let current = original;
      let finish: () => void = () => {
        throw new Error("discard_not_started");
      };
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const reload = jest.fn(() => {
        current = remaining;
      });
      mockHook.mockImplementation(() => ({ ...fakeHook(current), reload }));
      const discard = jest.fn(() => pending);
      const props: TransactionReviewProps = {
        accountReview: {
          input: {
            mode: "SMS",
            ownerId: original.ownerId,
            sessionId: original.sessionId,
            queueId: original.sessionId,
          },
          onSaveSelected: jest.fn(),
        },
        transactions: reviewableTransactions(original),
        onSave: jest.fn(),
        onDiscard: jest.fn(),
        isSaving: false,
        workspaceVariant: "sms",
        onDiscardItem: discard,
      };
      const view = render(<TransactionReview {...props} />);
      expect(view.getAllByTestId("canonical-edit-row")).toHaveLength(2);
      fireEvent.press(view.getByTestId("sms-review-discard-0"));
      expect(discard).toHaveBeenCalledTimes(1);
      expect(reload).not.toHaveBeenCalled();
      fireEvent.press(view.getByTestId("sms-review-discard-1"));
      expect(discard).toHaveBeenCalledTimes(1);
      await act(async () => {
        finish();
        await pending;
      });
      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(view.getAllByTestId("canonical-edit-row")).toHaveLength(1);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("renders Undo in a nonempty canonical review and reloads only after restore", async () => {
      let finish: () => void = () => {
        throw new Error("restore_not_started");
      };
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const undo = jest.fn(() => pending);
      const reload = jest.fn();
      mockHook.mockImplementation(() => ({ ...fakeHook(), reload }));
      const props: TransactionReviewProps = {
        accountReview: {
          input: {
            mode: "SMS",
            ownerId: sourceSession.ownerId,
            sessionId: sourceSession.sessionId,
            queueId: sourceSession.sessionId,
          },
          onSaveSelected: jest.fn(),
        },
        transactions: reviewableTransactions(sourceSession),
        onSave: jest.fn(),
        onDiscard: jest.fn(),
        isSaving: false,
        workspaceVariant: "sms",
        undoBanner: {
          discardedName: "TEST removed row",
          onUndo: undo,
          onClose: jest.fn(),
        },
      };
      const view = render(<TransactionReview {...props} />);
      expect(view.getByTestId("sms-review-undo-banner")).toBeTruthy();
      fireEvent.press(view.getByText("sms_review_undo"));
      expect(undo).toHaveBeenCalledTimes(1);
      expect(reload).not.toHaveBeenCalled();
      await act(async () => {
        finish();
        await pending;
      });
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("keeps an account chooser mounted when its close handler runs during a pending command", () => {
      let busy = false;
      const session = makeUnconfirmedCurrencyReview(sourceSession);
      mockHook.mockImplementation(() => fakeHook(session, busy));
      const view = render(review());
      fireEvent.press(view.getByTestId("canonical-choose-account"));
      expect(view.getByTestId("canonical-account-choice")).toBeTruthy();
      busy = true;
      view.rerender(review());
      fireEvent.press(view.getByTestId("pr-account-cancel"));
      expect(view.getByTestId("canonical-account-choice")).toBeTruthy();
      busy = false;
      view.rerender(review());
      fireEvent.press(view.getByTestId("pr-account-cancel"));
      expect(view.queryByTestId("canonical-account-choice")).toBeNull();
      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });
}
