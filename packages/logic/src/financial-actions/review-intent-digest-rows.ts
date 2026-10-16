/**
 * #395 unshipped review.batch-save/v1 frozen-intent: private original row projection.
 * No parser source body/transcript/evidence, mutable account or mobile imports.
 */
import type {
  AccountReviewAssignment,
  AccountReviewRow,
} from "../account-review/review-schemas";
import { getCurrencyPrecision } from "../utils/currency";
import { fromMinorUnits, toMinorUnits } from "../metals/decimal";
import type { CanonicalJsonValue } from "./action-registry";

export type ReviewGroupEndpoint = "source" | "destination";

export interface SelectedGroupReference {
  readonly groupId: string;
  readonly role: ReviewGroupEndpoint;
  readonly rowId: string;
}

function refuse(reason: string): never {
  throw new Error("account_review_intent_digest_" + reason);
}

function ascii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Same local-calendar projection as Save's formatFinancialActionLocalDate. */
function localFinancialDate(date: Date): string {
  if (!Number.isFinite(date.getTime())) refuse("invalid_transaction_date");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function canonicalMinorUnits(row: AccountReviewRow): string {
  if (row.currency.state !== "known" ||
      row.currency.code !== row.transaction.currency) {
    return refuse("currency_mismatch");
  }
  const precision = getCurrencyPrecision(row.currency.code);
  const minor = toMinorUnits(row.amountDecimal, precision);
  if (BigInt(minor) <= 0n || BigInt(minor) > 9223372036854775807n ||
      Number(fromMinorUnits(minor, precision)) !== row.transaction.amount) {
    return refuse("amount_roundtrip");
  }
  return minor;
}

function assignmentProjection(
  assignment: AccountReviewAssignment | null
): CanonicalJsonValue {
  if (assignment === null) return null;
  if (assignment.state === "existing") {
    return {
      state: "existing", accountId: assignment.accountId,
      origin: assignment.origin, currency: assignment.currency,
      identityRevision: assignment.identityRevision,
    };
  }
  if (assignment.state === "suggested") {
    return {
      state: "suggested", groupId: assignment.groupId,
      groupRevision: assignment.groupRevision,
      confirmation: assignment.confirmation,
    };
  }
  return refuse("unresolved_selected_assignment");
}

function financialRowProjection(row: AccountReviewRow): CanonicalJsonValue {
  const isAtm = row.source === "SMS" &&
    row.transaction.isAtmWithdrawal === true;
  if (isAtm && row.toAssignment === null) {
    return refuse("atm_destination_missing");
  }
  if (row.currency.state !== "known") return refuse("currency_unconfirmed");
  return {
    source: row.source,
    transactionType: row.transaction.type,
    currencyCode: row.currency.code,
    currencyOrigin: row.currency.origin,
    amountMinorUnits: canonicalMinorUnits(row),
    localDate: localFinancialDate(row.transaction.date),
    categoryId: row.transaction.categoryId,
    counterparty: row.transaction.counterparty ?? null,
    note: row.source === "VOICE" ? row.transaction.note : null,
    isAtmWithdrawal: isAtm,
  };
}

export function selectedGroupReferences(
  row: AccountReviewRow
): readonly SelectedGroupReference[] {
  const refs: SelectedGroupReference[] = [];
  if (row.assignment.state === "suggested") {
    refs.push({
      groupId: row.assignment.groupId,
      role: "source", rowId: row.rowId,
    });
  }
  if (row.toAssignment?.state === "suggested") {
    refs.push({
      groupId: row.toAssignment.groupId,
      role: "destination", rowId: row.rowId,
    });
  }
  return refs;
}

/** A complete selected row, including one later omitted by SMS dedup. */
export function projectSelectedReviewRow(row: AccountReviewRow): CanonicalJsonValue {
  if (!row.selected) return refuse("unselected_member");
  if (row.assignment.state === "unresolved" ||
      row.toAssignment?.state === "unresolved") {
    return refuse("unresolved_selected_assignment");
  }
  return {
    rowId: row.rowId,
    revision: row.revision,
    sourceRef: row.sourceRef,
    sourceFingerprint: row.sourceFingerprint,
    financial: financialRowProjection(row),
    sourceAssignment: assignmentProjection(row.assignment),
    destinationAssignment: assignmentProjection(row.toAssignment),
    hasUserAccountOverride: row.hasUserAccountOverride,
    hasUserCurrencyOverride: row.hasUserCurrencyOverride,
    reviewReasons: [...row.reviewReasons].sort(ascii),
  };
}
