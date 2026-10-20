/** #395 controlled transaction editor shell; no Save or draft mutation here. */
import React from "react";
import type { AccountReviewCommand, AccountReviewRow } from "@monyvi/logic";
import type { ReviewFeedbackBoundary } from "@/hooks/useReviewNotice";
import { TransactionEditModal } from "./edit-modal/TransactionEditModal";

export interface CanonicalTransactionEditTarget {
  readonly ownerId: string;
  readonly sessionId: string;
  readonly rowId: string;
  readonly reviewRevision: string;
  readonly operationGeneration: string;
  readonly rowRevision: string;
}
export type CanonicalTransactionEditPatch = Extract<
  AccountReviewCommand,
  { kind: "edit_row_transaction" }
>["patch"];

export interface CanonicalTransactionEditOverlayProps {
  readonly target: CanonicalTransactionEditTarget | null;
  readonly row: AccountReviewRow | null;
  readonly signal?: AbortSignal;
  readonly isBusy: boolean;
  readonly reviewFeedback: ReviewFeedbackBoundary;
  readonly onSubmit: (patch: CanonicalTransactionEditPatch) => Promise<boolean>;
  readonly onClose: (target: CanonicalTransactionEditTarget) => void;
}

export function CanonicalTransactionEditOverlay(
  props: CanonicalTransactionEditOverlayProps
): React.JSX.Element | null {
  const { target, row } = props;
  if (!target || !row) return null;
  return (
    <TransactionEditModal
      key={[
        target.ownerId,
        target.sessionId,
        target.rowId,
        target.rowRevision,
      ].join(":")}
      controlledReview
      visible
      row={row}
      ownerId={target.ownerId}
      signal={props.signal}
      isBusy={props.isBusy}
      reviewFeedback={props.reviewFeedback}
      onSubmit={props.onSubmit}
      onClose={() => props.onClose(target)}
    />
  );
}

/** Ignore a late close from a stale editor; preserve the replacement target. */
export function clearMatchingTransactionEdit(
  current: CanonicalTransactionEditTarget | null,
  closed: CanonicalTransactionEditTarget
): CanonicalTransactionEditTarget | null {
  return current &&
    current.ownerId === closed.ownerId &&
    current.sessionId === closed.sessionId &&
    current.rowId === closed.rowId &&
    current.reviewRevision === closed.reviewRevision &&
    current.operationGeneration === closed.operationGeneration &&
    current.rowRevision === closed.rowRevision
    ? null
    : current;
}
