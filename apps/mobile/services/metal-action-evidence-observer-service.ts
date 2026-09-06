import { database, type MetalActionEvidence } from "@monyvi/db";
import { Q, type Query } from "@nozbe/watermelondb";

import {
  queryChildrenOfOwnedParents,
  queryOwned,
} from "@/services/user-data-access";

interface ObserveMetalHistoryActionEvidenceInput {
  readonly holdings: ReadonlyArray<{
    readonly id: string;
    readonly userId: string;
  }>;
  readonly userId: string;
}

export function observeMetalDetailActionEvidence(
  userId: string,
  holdingId: string
): Query<MetalActionEvidence> {
  return queryOwned(
    database.get<MetalActionEvidence>("metal_action_evidence"),
    userId,
    Q.where("holding_id", holdingId),
    Q.where("deleted", false)
  );
}

export function observeMetalHistoryActionEvidence(
  input: ObserveMetalHistoryActionEvidenceInput
): Query<MetalActionEvidence> | null {
  if (input.holdings.length === 0) return null;
  return queryChildrenOfOwnedParents(
    database.get<MetalActionEvidence>("metal_action_evidence"),
    input.holdings,
    input.userId,
    "holding_id",
    Q.where("deleted", false)
  );
}
