import type { Model } from "@nozbe/watermelondb";

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
