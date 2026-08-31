import type { FinancialActionGroup } from "@monyvi/db";

import {
  captureCachedModelSnapshot,
  type CachedModelSnapshot,
} from "./watermelon-cache-snapshot";
import { watermelonRawRecordsMatch } from "./watermelon-raw-integrity";

export interface PendingFinancialActionRootExpectation {
  readonly snapshot: CachedModelSnapshot;
  readonly table: string;
  readonly id: string;
  readonly userId: string;
  readonly actionId: string;
  readonly domain: string;
  readonly kind: string;
  readonly domainReferenceId: string;
  readonly payloadJson: string;
  readonly payloadHash: string;
  readonly accountGuardsJson: string;
  readonly serverOutcome: string | null;
  readonly outcomeJson: string | null;
  readonly rejectionCode: string | null;
  readonly deleted: boolean;
}

function immutableFieldsMatch(
  record: FinancialActionGroup,
  expectation: PendingFinancialActionRootExpectation
): boolean {
  return (
    record === expectation.snapshot.model &&
    record.table === expectation.table &&
    record.id === expectation.id &&
    record.userId === expectation.userId &&
    record.actionId === expectation.actionId &&
    record.domain === expectation.domain &&
    record.kind === expectation.kind &&
    record.domainReferenceId === expectation.domainReferenceId &&
    record.payloadJson === expectation.payloadJson &&
    record.payloadHash === expectation.payloadHash &&
    record.accountGuardsJson === expectation.accountGuardsJson &&
    record.serverOutcome === expectation.serverOutcome &&
    record.outcomeJson === expectation.outcomeJson &&
    record.rejectionCode === expectation.rejectionCode &&
    record.deleted === expectation.deleted
  );
}

function rejectInvalidRoot(errorCode: string): never {
  throw new Error(errorCode);
}

export function capturePendingFinancialActionRoot(
  record: FinancialActionGroup,
  errorCode: string
): PendingFinancialActionRootExpectation {
  if (
    record.table !== "financial_action_groups" ||
    record.state !== "pending_local" ||
    record._preparedState !== null ||
    record._isEditing
  ) {
    rejectInvalidRoot(errorCode);
  }
  return Object.freeze({
    snapshot: captureCachedModelSnapshot(record),
    table: record.table,
    id: record.id,
    userId: record.userId,
    actionId: record.actionId,
    domain: record.domain,
    kind: record.kind,
    domainReferenceId: record.domainReferenceId,
    payloadJson: record.payloadJson,
    payloadHash: record.payloadHash,
    accountGuardsJson: record.accountGuardsJson,
    serverOutcome: record.serverOutcome,
    outcomeJson: record.outcomeJson,
    rejectionCode: record.rejectionCode,
    deleted: record.deleted,
  });
}

export function assertPendingFinancialActionRootUnchanged(
  record: FinancialActionGroup | null,
  expectation: PendingFinancialActionRootExpectation | null,
  errorCode: string
): void {
  if (!record && !expectation) return;
  if (
    !record ||
    !expectation ||
    !immutableFieldsMatch(record, expectation) ||
    record.state !== "pending_local" ||
    record._preparedState !== null ||
    record._isEditing ||
    !watermelonRawRecordsMatch(record._raw, expectation.snapshot.raw)
  ) {
    rejectInvalidRoot(errorCode);
  }
}

export function assertPreparedFinancialActionRootUnchanged(
  record: FinancialActionGroup,
  initialExpectation: PendingFinancialActionRootExpectation,
  preparedSnapshot: CachedModelSnapshot,
  errorCode: string
): void {
  if (
    !immutableFieldsMatch(record, initialExpectation) ||
    record.state !== "local_complete" ||
    record._preparedState !== "update" ||
    record._isEditing ||
    !watermelonRawRecordsMatch(record._raw, preparedSnapshot.raw)
  ) {
    rejectInvalidRoot(errorCode);
  }
}
