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
import type { AccountReviewOwnedContext } from "../../../packages/logic/src/account-review/normalization-types";
import type { AccountReviewCategorySnapshots } from "../../../packages/logic/src/account-review/reducer-primitives";
import { loadCurrentAccountReviewEditorCategories } from "./account-review-transaction-edit-category-service";
import { assertExpectedCurrentUser } from "./user-data-access";

export interface ExecuteVoiceAccountReviewCommandInput {
  readonly session: AccountReviewSession;
  readonly command: AccountReviewCommand;
  readonly accountSnapshots: AccountReviewOwnedContext;
  readonly nextUndoToken: string | null;
  readonly undo: ReviewUndoLease | null;
  readonly signal?: AbortSignal;
}

export async function executeVoiceAccountReviewCommand(
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
    throw new Error("account_review_voice_command_scope_changed");
  }

  // Existing non-edit Voice actions remain in-memory reducer commands.
  // An edit must reauthenticate and acquire owner-bound live category truth
  // even though its result is NEVER written to an SMS draft.
  let categorySnapshots: AccountReviewCategorySnapshots | undefined;
  if (command.kind === "edit_row_transaction") {
    if (input.signal?.aborted)
      throw new Error("account_review_voice_cancelled");
    await assertExpectedCurrentUser(session.ownerId);
    const current = await loadCurrentAccountReviewEditorCategories(
      session.ownerId,
      input.signal
    );
    if (input.signal?.aborted)
      throw new Error("account_review_voice_cancelled");
    await assertExpectedCurrentUser(session.ownerId);
    if (input.signal?.aborted)
      throw new Error("account_review_voice_cancelled");
    categorySnapshots = current.snapshot;
  }
  return reduceAccountReviewCommand({
    state: session,
    command,
    accountSnapshots: input.accountSnapshots,
    categorySnapshots,
    nextUndoToken: input.nextUndoToken,
    undo: input.undo,
  });
}
