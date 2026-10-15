/**
 * #395 T046 selected-source, domain create and account-identity integrity.
 * Pure checks cannot assert current DB ownership/uniqueness/revisions.
 */
import type {
  ReviewBatchSavePayload,
  ReviewFinancialRecord,
  ReviewMutation,
  ReviewNewAccount,
} from "./review-batch-save-shapes";

export function sortedDistinct<T>(
  items: readonly T[],
  key: (item: T) => string
): boolean {
  let previous: string | null = null;
  for (const item of items) {
    const current = key(item);
    if (previous !== null && current <= previous) return false;
    previous = current;
  }
  return true;
}

function matchesSet(
  actual: readonly string[],
  expected: readonly string[]
): boolean {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  return (
    sortedActual.length === sortedExpected.length &&
    sortedActual.every((entry, index) => entry === sortedExpected[index])
  );
}

export function financialRecords(
  payload: ReviewBatchSavePayload
): readonly ReviewFinancialRecord[] {
  return payload.domainMutation.records.filter(
    (record): record is ReviewFinancialRecord =>
      record.entity === "transaction" || record.entity === "transfer"
  );
}

export function newAccountRecords(
  payload: ReviewBatchSavePayload
): readonly ReviewNewAccount[] {
  return payload.domainMutation.records.filter(
    (record): record is ReviewNewAccount => record.entity === "account"
  );
}

export function affectedAccountIds(
  payload: ReviewBatchSavePayload
): Set<string> {
  const affected = new Set<string>();
  for (const record of financialRecords(payload)) {
    if (record.entity === "transaction") affected.add(record.after.accountId);
    else {
      affected.add(record.after.fromAccountId);
      affected.add(record.after.toAccountId);
    }
  }
  return affected;
}

export function validateCreateCoverage(
  payload: ReviewBatchSavePayload
): string | null {
  const records = payload.domainMutation.records;
  const keys = records.map((record) => record.entity + ":" + record.after.id);
  const ids = records.map((record) => record.after.id);
  const guards = payload.createGuards.map(
    (guard) => guard.entity + ":" + guard.id
  );
  if (
    !sortedDistinct(records, (record) => record.entity + ":" + record.after.id)
  )
    return "review_mutations_not_sorted_unique";
  if (
    !sortedDistinct(
      payload.createGuards,
      (guard) => guard.entity + ":" + guard.id
    )
  )
    return "review_create_guards_not_sorted_unique";
  if (new Set(ids).size !== ids.length) return "review_create_id_reused";
  if (!sortedDistinct(payload.domainRecordRefs, (id) => id))
    return "review_domain_refs_not_sorted_unique";
  if (!matchesSet(payload.domainRecordRefs, ids) || !matchesSet(guards, keys))
    return "review_create_guards_or_refs_mismatch";
  return null;
}

function sourceFingerprint(record: ReviewFinancialRecord): string | null {
  return record.after.smsFingerprint;
}

export function validateSelectedCoverage(
  payload: ReviewBatchSavePayload
): string | null {
  const selected = payload.selectedSourceRefs;
  const financial = financialRecords(payload);
  if (financial.length === 0) return "review_no_financial_create";
  if (!sortedDistinct(selected, (ref) => ref.rowId))
    return "review_selected_refs_not_sorted_unique";
  if (new Set(selected.map((ref) => ref.recordId)).size !== selected.length)
    return "review_selected_record_reused";
  if (selected.length !== financial.length) return "review_selected_row_count";
  const byId = new Map(financial.map((record) => [record.after.id, record]));
  const fingerprints = new Set<string>();
  for (const ref of selected) {
    const record = byId.get(ref.recordId);
    if (!record || sourceFingerprint(record) !== ref.sourceFingerprint)
      return "review_selected_source_mismatch";
    if (payload.source === "VOICE" && ref.sourceFingerprint !== null)
      return "review_voice_fingerprint_not_null";
    if (payload.source === "SMS" && ref.sourceFingerprint === null)
      return "review_sms_fingerprint_required";
    if (ref.sourceFingerprint !== null) {
      if (fingerprints.has(ref.sourceFingerprint))
        return "review_duplicate_fingerprint";
      fingerprints.add(ref.sourceFingerprint);
    }
  }
  return null;
}

export function validateSourceAndChildren(
  payload: ReviewBatchSavePayload
): string | null {
  for (const record of financialRecords(payload)) {
    if (
      record.entity === "transaction" &&
      record.after.source !== payload.source
    )
      return "review_transaction_source_mismatch";
    if (record.entity === "transfer" && payload.source !== "SMS")
      return "review_transfer_requires_sms";
  }
  const newAccounts = new Map(
    newAccountRecords(payload).map((record) => [record.after.id, record.after])
  );
  const involved = affectedAccountIds(payload);
  for (const accountId of newAccounts.keys()) {
    if (!involved.has(accountId)) return "review_unused_created_account";
  }
  const cashRoleError = validateSmsCreatedCashRoles(payload, newAccounts);
  if (cashRoleError !== null) return cashRoleError;
  const bankDetailsByAccount = new Set<string>();
  const senderNames = new Set<string>();
  for (const record of payload.domainMutation.records) {
    const reason = validateChild(
      record,
      newAccounts,
      bankDetailsByAccount,
      senderNames
    );
    if (reason !== null) return reason;
  }
  return null;
}

/** Pure proof covers only newly-created Cash; existing types remain DB-owned. */
function validateSmsCreatedCashRoles(
  payload: ReviewBatchSavePayload,
  newAccounts: ReadonlyMap<string, ReviewNewAccount["after"]>
): string | null {
  if (payload.source !== "SMS") return null;
  for (const record of financialRecords(payload)) {
    if (
      record.entity === "transaction" &&
      newAccounts.get(record.after.accountId)?.type === "CASH"
    )
      return "review_sms_cash_transaction_source_forbidden";
    if (
      record.entity === "transfer" &&
      newAccounts.get(record.after.fromAccountId)?.type === "CASH"
    )
      return "review_sms_cash_atm_source_forbidden";
  }
  return null;
}

function validateChild(
  record: ReviewMutation,
  accounts: ReadonlyMap<string, ReviewNewAccount["after"]>,
  bankDetails: Set<string>,
  senderNames: Set<string>
): string | null {
  if (
    record.entity !== "bank_details" &&
    record.entity !== "account_sms_sender"
  )
    return null;
  const parent = accounts.get(record.after.accountId);
  if (!parent || parent.type === "CASH") return "review_child_parent_invalid";
  if (record.entity === "bank_details") {
    if (parent.type !== "BANK" || bankDetails.has(parent.id))
      return "review_bank_child_conflict";
    bankDetails.add(parent.id);
    return null;
  }
  const normalized = record.after.senderName
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (normalized !== record.after.normalizedSenderName)
    return "review_sender_name_not_canonical";
  const key = parent.id + ":" + normalized;
  if (senderNames.has(key)) return "review_sender_duplicate";
  senderNames.add(key);
  return null;
}

export function validateGroupAndBookkeeping(
  payload: ReviewBatchSavePayload
): string | null {
  if (!sortedDistinct(payload.confirmedGroupRefs, (ref) => ref.groupId))
    return "review_group_refs_not_sorted_unique";
  const involved = affectedAccountIds(payload);
  if (payload.confirmedGroupRefs.some((ref) => !involved.has(ref.accountId)))
    return "review_unselected_confirmed_group";
  const confirmed = new Set(
    payload.confirmedGroupRefs.map((ref) => ref.accountId)
  );
  for (const account of newAccountRecords(payload)) {
    const isSmsAtmCashDestination =
      payload.source === "SMS" &&
      account.after.type === "CASH" &&
      financialRecords(payload).some(
        (record) =>
          record.entity === "transfer" &&
          record.after.toAccountId === account.after.id
      );
    if (!isSmsAtmCashDestination && !confirmed.has(account.after.id))
      return "review_created_account_requires_confirmed_group";
  }
  const bookkeeping = payload.localSmsBookkeeping;
  if (!sortedDistinct(bookkeeping, (item) => item.draftId))
    return "review_sms_cleanup_not_sorted_unique";
  if (payload.source === "VOICE")
    return bookkeeping.length === 0 ? null : "review_voice_cleanup_forbidden";
  const domainIds = new Set(payload.domainRecordRefs);
  for (const entry of bookkeeping) {
    if (entry.queueId !== payload.sessionId)
      return "review_sms_queue_session_mismatch";
    if (
      entry.draftId === entry.queueId ||
      domainIds.has(entry.draftId) ||
      domainIds.has(entry.queueId)
    )
      return "review_local_bookkeeping_id_collision";
  }
  const deleted = bookkeeping.filter(
    (item) => item.operation === "delete_saved"
  );
  return deleted.length === payload.selectedSourceRefs.length
    ? null
    : "review_sms_saved_cleanup_mismatch";
}
