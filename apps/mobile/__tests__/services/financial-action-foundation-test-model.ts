import type { Model } from "@nozbe/watermelondb";

import type {
  FinancialActionLinkedOperationCachedOwnershipInput,
  FinancialActionLinkedOperationPreparedOwnershipInput,
} from "../../services/financial-action-foundation-repository";

export interface MockFinancialActionRecord {
  table?: string;
  _isEditing: boolean;
  _preparedState: Model["_preparedState"];
  _raw: { id: string; state?: string; user_id?: string };
  id: string;
  actionId: string;
  userId: string;
  domain: string;
  kind: string;
  domainReferenceId: string;
  payloadJson: string;
  payloadHash: string;
  accountGuardsJson: string;
  state: string;
  serverOutcome: string | null;
  outcomeJson: string | null;
  rejectionCode: string | null;
  deleted: boolean;
  updatedAt: Date;
  prepareUpdate: (
    updater: (record: MockFinancialActionRecord) => void
  ) => MockFinancialActionRecord;
}

export function assertDirectCachedLinkedOperationOwnership(
  input: FinancialActionLinkedOperationCachedOwnershipInput
): Promise<void> {
  input.cachedPreimages.forEach((snapshot) => {
    if ((snapshot.raw as { user_id?: string }).user_id !== input.userId) {
      throw new Error("ownership_failed");
    }
  });
  return Promise.resolve();
}

export function assertDirectPreparedLinkedOperationOwnership(
  input: FinancialActionLinkedOperationPreparedOwnershipInput
): Promise<void> {
  input.preparedPostimages.forEach((snapshot) => {
    if ((snapshot.raw as { user_id?: string }).user_id !== input.userId) {
      throw new Error("ownership_failed");
    }
  });
  return Promise.resolve();
}
