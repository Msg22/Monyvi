/**
 * #395 T027 canonical pure reducer boundary. No data access, creation, clock,
 * provider request, group ID regeneration, UI command dispatch or Save.
 */
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewReason,
  type AccountReviewSession,
} from "./review-schemas";
import { assertOwnedResolutionContext } from "./resolution-candidates";
import { reduceGroupCommand } from "./reducer-groups";
import { reduceChoiceCommand } from "./reducer-choices";
import {
  reduceSelectRow,
  reduceDeselectRow,
  reduceSelectBatch,
} from "./reducer-selection";
import { reduceUndoRemoval } from "./reducer-undo";
import {
  acceptReviewTransition,
  isRevisionOverflow,
  rejectReviewCommand,
  type AccountReviewCommandResult,
  type ReduceAccountReviewCommandInput,
  type ReviewTransition,
} from "./reducer-primitives";

export { mergeAccountReviewLateRows } from "./reducer-merge";
export type {
  AccountReviewCommandResult,
  ReduceAccountReviewCommandInput,
  ReviewUndoLease,
} from "./reducer-primitives";
export type { MergeAccountReviewLateRowsInput } from "./reducer-merge";

interface RoutedTransition {
  readonly transition: ReviewTransition | null;
  readonly reason: AccountReviewReason | null;
}

function routeCommand(
  state: AccountReviewSession,
  input: ReduceAccountReviewCommandInput,
  command: AccountReviewCommand
): RoutedTransition {
  switch (command.kind) {
    case "confirm_group":
    case "edit_group":
    case "remove_group":
      return reduceGroupCommand(
        state,
        command,
        input.nextUndoToken,
        input.accountSnapshots
      );
    case "undo_removal":
      return reduceUndoRemoval(state, command, input.undo);
    case "select_row":
      return reduceSelectRow(state, command, input.accountSnapshots);
    case "set_row_selected":
      return reduceDeselectRow(state, command);
    case "select_ready":
    case "clear_selection":
      return reduceSelectBatch(state, command, input.accountSnapshots);
    case "choose_row_account":
    case "replace_group_account":
    case "confirm_row_currency":
      return reduceChoiceCommand(state, command, input.accountSnapshots);
  }
}

function validateCommandScope(
  state: AccountReviewSession,
  command: AccountReviewCommand
): AccountReviewReason | null {
  if (command.ownerId !== state.ownerId) return "review_owner_changed";
  if (command.sessionId !== state.sessionId) return "review_source_changed";
  if (
    command.expectedReviewRevision !== state.revision ||
    command.expectedOperationGeneration !== state.operationGeneration
  ) {
    return "review_revision_stale";
  }
  return null;
}

/** No successful command can bypass final canonical reciprocal-group validation. */
export function reduceAccountReviewCommand(
  input: ReduceAccountReviewCommandInput
): AccountReviewCommandResult {
  // Reject invalid local state rather than returning a noncanonical payload.
  accountReviewSessionSchema.parse(input.state);
  const parsed = accountReviewCommandSchema.safeParse(input.command);
  if (!parsed.success) {
    return rejectReviewCommand(input.state, "account_group_snapshot_conflict");
  }
  const command = parsed.data;
  const stale = validateCommandScope(input.state, command);
  if (stale) return rejectReviewCommand(input.state, stale);
  if (input.state.saveIntent !== null) {
    return rejectReviewCommand(input.state, "review_revision_stale");
  }
  try {
    assertOwnedResolutionContext(input.state, input.accountSnapshots);
  } catch {
    return rejectReviewCommand(
      input.state,
      input.accountSnapshots.ownerId !== input.state.ownerId
        ? "review_owner_changed"
        : "account_unavailable"
    );
  }
  try {
    const outcome = routeCommand(input.state, input, command);
    return outcome.transition
      ? acceptReviewTransition(input.state, outcome.transition)
      : rejectReviewCommand(
          input.state,
          outcome.reason ?? "account_group_snapshot_conflict"
        );
  } catch (error) {
    if (isRevisionOverflow(error)) {
      return rejectReviewCommand(input.state, "review_revision_stale");
    }
    throw error;
  }
}
