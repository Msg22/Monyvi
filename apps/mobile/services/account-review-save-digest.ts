/**
 * #395 T048 — private adapter to the pure original-intent admission authority.
 * The only persisted projection is its lowercase SHA-256 commitment.
 */
import {
  computeAccountReviewFrozenIntentDigest,
  type Sha256Provider,
} from "@monyvi/logic";
import type { ReviewBatchSavePayload } from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import type { FrozenReviewSave } from "./account-review-save-preparation";

export function computeFrozenReviewSaveDigest(
  frozen: FrozenReviewSave,
  creationDefaultSnapshot: ReviewBatchSavePayload["creationDefaultSnapshot"],
  hashProvider: Sha256Provider
): Promise<string> {
  return computeAccountReviewFrozenIntentDigest({
    session: frozen.session,
    intent: frozen.intent,
    creationDefaultSnapshot,
    hashProvider,
  });
}
