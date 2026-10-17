/**
 * #395 T067 — pure Add default-intent cross-record integrity.
 *
 * This validates only immutable wire evidence. Owned active row state,
 * authenticated actor, financial revision, current default and dependency
 * chains are verified later inside the SAME local/server atomic writer.
 */
import type {
  AccountCreateDefaultMutation,
  AccountCreateDefaultPayload,
} from "./account-create-default-shapes";

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: readonly string[]): boolean {
  let previous: string | null = null;
  for (const value of values) {
    if (previous !== null && value <= previous) return false;
    previous = value;
  }
  return true;
}

function exactlySameStrings(
  actual: readonly string[],
  expected: readonly string[]
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function mutationKey(mutation: AccountCreateDefaultMutation): string {
  return mutation.entity + ":" + mutation.after.id;
}

function validateMutationCoverage(
  payload: AccountCreateDefaultPayload
): string | null {
  const records = payload.domainMutation.records;
  const mutationKeys = records.map(mutationKey);
  if (!sortedUnique(mutationKeys))
    return "account_create_default_mutations_not_sorted_unique";

  const ids = records.map((record) => record.after.id);
  if (new Set(ids).size !== ids.length)
    return "account_create_default_duplicate_domain_id";

  const expectedRefs = [...ids].sort(asciiCompare);
  if (
    !sortedUnique(payload.domainRecordRefs) ||
    !exactlySameStrings(payload.domainRecordRefs, expectedRefs)
  )
    return "account_create_default_domain_refs_mismatch";

  const createKeys = records
    .filter((record) => record.mode === "create")
    .map(mutationKey);
  const guards = payload.createGuards;
  const guardKeys = guards.map((guard) => guard.entity + ":" + guard.id);
  if (
    !sortedUnique(guardKeys) ||
    !exactlySameStrings(guardKeys, createKeys) ||
    guards.some(
      (guard) =>
        guard.entity !== "account" &&
        guard.entity !== "account_sms_sender" &&
        guard.entity !== "bank_details"
    )
  )
    return "account_create_default_create_guards_mismatch";
  return null;
}

function normalizeSenderName(senderName: string): string {
  return senderName.trim().replace(/\s+/g, " ").toLowerCase();
}

function validateAccountAndChildren(
  payload: AccountCreateDefaultPayload
): string | null {
  const records = payload.domainMutation.records;
  const accounts = records.filter((record) => record.entity === "account");
  if (accounts.length !== 1)
    return "account_create_default_one_account_required";

  const account = accounts[0];
  if (!account || account.entity !== "account")
    return "account_create_default_one_account_required";
  const accountId = account.after.id;
  const current = payload.expectedDefaultSnapshot;

  if (current.activeAccountIds.includes(accountId))
    return "account_create_default_account_already_active";

  const requiredIsDefault =
    payload.defaultIntent || current.activeAccountIds.length === 0;
  if (account.after.isDefault !== requiredIsDefault)
    return "account_create_default_flag_inconsistent_with_snapshot";

  const expectedClearId = requiredIsDefault
    ? (current.defaultAccount?.accountId ?? null)
    : null;
  const clears = records.filter(
    (record) => record.entity === "account_default"
  );
  if (clears.length !== (expectedClearId === null ? 0 : 1))
    return "account_create_default_clear_count_mismatch";
  if (clears.length === 1) {
    const clear = clears[0];
    if (
      !clear ||
      clear.entity !== "account_default" ||
      clear.after.id !== expectedClearId
    )
      return "account_create_default_wrong_prior_clear_id";
  }

  let bankDetailsCount = 0;
  const normalizedSenders = new Set<string>();
  for (const record of records) {
    switch (record.entity) {
      case "account": {
        if (record.after.openingBalanceMinorUnits.startsWith("-"))
          return "account_create_default_negative_opening";
        break;
      }
      case "bank_details": {
        bankDetailsCount += 1;
        if (
          account.after.type !== "BANK" ||
          record.after.accountId !== accountId
        )
          return "account_create_default_bank_detail_scope_invalid";
        break;
      }
      case "account_sms_sender": {
        if (
          account.after.type === "CASH" ||
          record.after.accountId !== accountId
        )
          return "account_create_default_sender_parent_invalid";
        const normalized = normalizeSenderName(record.after.senderName);
        if (
          normalized.length === 0 ||
          record.after.senderName !==
            record.after.senderName.trim().replace(/\s+/g, " ") ||
          record.after.normalizedSenderName !== normalized ||
          normalizedSenders.has(normalized)
        )
          return "account_create_default_sender_normalization_conflict";
        normalizedSenders.add(normalized);
        break;
      }
      case "account_default":
        // Previous default: compare to the captured UUID above, never
        // re-select by account name, active-row order or publication time.
        break;
    }
  }
  return bankDetailsCount > 1
    ? "account_create_default_duplicate_bank_details"
    : null;
}

function validateOpeningEffect(
  payload: AccountCreateDefaultPayload
): string | null {
  const account = payload.domainMutation.records.find(
    (record) => record.entity === "account"
  );
  if (!account || account.entity !== "account")
    return "account_create_default_one_account_required";

  const opening = account.after.openingBalanceMinorUnits;
  if (opening.startsWith("-")) return "account_create_default_negative_opening";

  if (opening === "0") {
    return payload.accountEffects.length === 0
      ? null
      : "account_create_default_zero_opening_has_effect";
  }

  if (payload.accountEffects.length !== 1)
    return "account_create_default_nonzero_effect_required";
  const [effect] = payload.accountEffects;
  if (
    !effect ||
    effect.accountId !== account.after.id ||
    effect.currency !== account.after.currency ||
    effect.amountMinorUnits !== opening ||
    payload.domainRecordRefs.includes(effect.effectId)
  )
    return "account_create_default_opening_effect_mismatch";
  return null;
}

/** Strict record-set, prior-clear, default flag, child and opening integrity. */
export function validateAccountCreateDefaultIntegrity(
  payload: AccountCreateDefaultPayload
): string | null {
  return (
    validateMutationCoverage(payload) ??
    validateAccountAndChildren(payload) ??
    validateOpeningEffect(payload)
  );
}
