/**
 * #395 T030 — Voice review command bridge.
 * Memory only: the canonical reducer owns every financial/review decision.
 */
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewSession,
} from "../../../packages/logic/src/account-review/review-schemas";
import {
  reduceAccountReviewCommand,
  type AccountReviewCommandResult,
  type ReviewUndoLease,
} from "../../../packages/logic/src/account-review/reducer";
import type { AccountReviewOwnedContext } from
  "../../../packages/logic/src/account-review/normalization-types";

export interface ExecuteVoiceAccountReviewCommandInput {
  readonly session: AccountReviewSession;
  readonly command: AccountReviewCommand;
  readonly accountSnapshots: AccountReviewOwnedContext;
  readonly nextUndoToken: string | null;
  readonly undo: ReviewUndoLease | null;
}

export function executeVoiceAccountReviewCommand(
  input: ExecuteVoiceAccountReviewCommandInput
): Promise<AccountReviewCommandResult> {
  const session = accountReviewSessionSchema.parse(input.session);
  const command = accountReviewCommandSchema.parse(input.command);
  if (
    session.source !== "VOICE" ||
    command.ownerId !== session.ownerId ||
    command.sessionId !== session.sessionId ||
    input.accountSnapshots.ownerId !== session.ownerId
  ) {
    return Promise.reject(new Error("account_review_voice_command_scope_changed"));
  }
  return Promise.resolve(
    reduceAccountReviewCommand({
      state: session,
      command,
      accountSnapshots: input.accountSnapshots,
      nextUndoToken: input.nextUndoToken,
      undo: input.undo,
    })
  );
}
