/**
 * #395 T030 — React lifecycle facade for the canonical owned review services.
 * Business commands, SMS persistence and account snapshots stay in services.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AccountReviewRow,
  AccountReviewCommand,
} from "../../../packages/logic/src/account-review/review-schemas";
import type { AccountReviewCommandResult } from "../../../packages/logic/src/account-review/reducer";
import {
  AccountReviewFacadeController,
  EMPTY_ACCOUNT_REVIEW_FACADE,
  type AccountReviewFacadeView,
  type AccountReviewChoiceAccount,
  type UseAccountReviewInput,
} from "./account-review-facade-state";

export type { UseAccountReviewInput } from "./account-review-facade-state";

export interface UseAccountReviewResult extends AccountReviewFacadeView {
  readonly getAccountCandidates: (
    rowId: AccountReviewRow["rowId"],
    role: "source" | "destination"
  ) => readonly AccountReviewChoiceAccount[];
  readonly dispatch: (
    command: AccountReviewCommand
  ) => Promise<AccountReviewCommandResult>;
  readonly reload: () => void;
  readonly undoRemoval: () => Promise<AccountReviewCommandResult>;
  /** Current-review visual discard; revokes the matching real Undo lease. */
  readonly discardRemovedSuggestion: (groupId: string) => Promise<void>;
}

/** Stable discriminated props: caller may construct a new object each render. */
function useStableReviewInput(
  input: UseAccountReviewInput
): UseAccountReviewInput {
  const mode = input.mode;
  const ownerId = input.ownerId;
  const sessionId = input.sessionId;
  const signal = input.signal;
  const queueId = mode === "SMS" ? input.queueId : null;
  const voiceSession = mode === "VOICE" ? input.voiceSession : null;
  return useMemo((): UseAccountReviewInput => {
    if (mode === "SMS") {
      if (queueId === null) throw new Error("account_review_queue_missing");
      return { mode, ownerId, sessionId, queueId, signal };
    }
    return { mode, ownerId, sessionId, voiceSession, signal };
  }, [mode, ownerId, sessionId, signal, queueId, voiceSession]);
}

export function useAccountReview(
  input: UseAccountReviewInput
): UseAccountReviewResult {
  const [view, setView] = useState<AccountReviewFacadeView>(
    EMPTY_ACCOUNT_REVIEW_FACADE
  );
  const facade = useMemo(() => new AccountReviewFacadeController(setView), []);
  const proposedInput = useStableReviewInput(input);
  const stableInput = facade.stableVoiceInput(proposedInput);
  // On a dependency change, configure() cancels the prior owner/scope while
  // retaining only SAME-review intent. A preceding cleanup would erase it.
  const latestInputRef = useRef(stableInput);
  latestInputRef.current = stableInput;
  const generation = facade.currentGeneration();
  const scopedView = facade.scopedView(stableInput, view);

  useEffect(() => {
    facade.mount();
    return () => facade.dispose();
  }, [facade]);

  useEffect(() => {
    facade.configure(stableInput);
    return () => {
      // A new input is handled by configure() with the old scope still
      // available for exact-match intent transfer. Unmount still cancels.
      if (latestInputRef.current === stableInput) facade.cancel();
    };
  }, [facade, stableInput]);

  const dispatch = useCallback(
    (command: AccountReviewCommand) =>
      facade.dispatch(command, stableInput, generation),
    [facade, stableInput, generation]
  );
  const reload = useCallback(
    () => facade.reload(stableInput, generation),
    [facade, stableInput, generation]
  );
  // Each rendered action can consume only its own transient Undo lease.
  const expectedUndoToken = scopedView.undoToken;
  const undoRemoval = useCallback(
    () => facade.undoRemoval(stableInput, generation, expectedUndoToken),
    [facade, stableInput, generation, expectedUndoToken]
  );
  const expectedReviewRevision = scopedView.session?.revision ?? null;
  const expectedOperationGeneration =
    scopedView.session?.operationGeneration ?? null;
  const discardRemovedSuggestion = useCallback(
    (groupId: string) =>
      facade.discardRemovedSuggestion(
        groupId,
        stableInput,
        generation,
        expectedReviewRevision,
        expectedOperationGeneration,
        expectedUndoToken
      ),
    [
      facade,
      stableInput,
      generation,
      expectedReviewRevision,
      expectedOperationGeneration,
      expectedUndoToken,
    ]
  );
  const getAccountCandidates = useCallback(
    (rowId: AccountReviewRow["rowId"], role: "source" | "destination") =>
      facade.getChoiceCandidates(rowId, role, stableInput, generation),
    [facade, stableInput, generation]
  );
  return {
    ...scopedView,
    dispatch,
    reload,
    undoRemoval,
    discardRemovedSuggestion,
    getAccountCandidates,
  };
}
