/**
 * #395 T030 — React lifecycle facade for the canonical owned review services.
 * Business commands, SMS persistence and account snapshots stay in services.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccountReviewCommand } from
  "../../../packages/logic/src/account-review/review-schemas";
import type { AccountReviewCommandResult } from
  "../../../packages/logic/src/account-review/reducer";
import {
  AccountReviewFacadeController,
  EMPTY_ACCOUNT_REVIEW_FACADE,
  type AccountReviewFacadeView,
  type UseAccountReviewInput,
} from "./account-review-facade-state";

export type { UseAccountReviewInput } from "./account-review-facade-state";

export interface UseAccountReviewResult extends AccountReviewFacadeView {
  readonly dispatch: (
    command: AccountReviewCommand
  ) => Promise<AccountReviewCommandResult>;
  readonly reload: () => void;
  readonly undoRemoval: () => Promise<AccountReviewCommandResult>;
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
  const facade = useMemo(
    () => new AccountReviewFacadeController(setView),
    []
  );
  const proposedInput = useStableReviewInput(input);
  const stableInput = facade.stableVoiceInput(proposedInput);
  const generation = facade.currentGeneration();

  useEffect(() => {
    facade.mount();
    return () => facade.dispose();
  }, [facade]);

  useEffect(() => {
    facade.configure(stableInput);
    return () => facade.cancel();
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
  const undoRemoval = useCallback(
    () => facade.undoRemoval(stableInput, generation),
    [facade, stableInput, generation]
  );
  return {
    ...facade.scopedView(stableInput, view),
    dispatch, reload, undoRemoval,
  };
}
