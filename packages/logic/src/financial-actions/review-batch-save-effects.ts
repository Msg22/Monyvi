/**
 * #395 T046 exact posted effects and account-creation snapshot checks. Bigint arithmetic
 * preserves canonical integer minor units (no Number summation or rounding).
 */
import type {
  ReviewBatchSavePayload,
  ReviewNewAccount,
} from "./review-batch-save-shapes";
import { MAX_TRANSACTION_AMOUNT } from "../utils/amount-helpers";
import { getCurrencyPrecision } from "../utils/currency";
import {
  affectedAccountIds,
  financialRecords,
  newAccountRecords,
  sortedDistinct,
} from "./review-batch-save-integrity";

const MAX_SIGNED_EFFECT = 9223372036854775807n;

function addDelta(
  deltas: Map<string, bigint>,
  accountId: string,
  amount: bigint
): void {
  deltas.set(accountId, (deltas.get(accountId) ?? 0n) + amount);
}

function buildExpectedEffects(
  payload: ReviewBatchSavePayload
): ReadonlyMap<string, bigint> {
  const deltas = new Map<string, bigint>();
  for (const record of financialRecords(payload)) {
    const amount = BigInt(record.after.amountMinorUnits);
    if (record.entity === "transaction") {
      addDelta(
        deltas,
        record.after.accountId,
        record.after.type === "INCOME" ? amount : -amount
      );
    } else {
      addDelta(deltas, record.after.fromAccountId, -amount);
      addDelta(deltas, record.after.toAccountId, amount);
    }
  }
  return deltas;
}

export function validateTransferEndpoints(
  payload: ReviewBatchSavePayload
): string | null {
  for (const record of financialRecords(payload)) {
    if (record.entity !== "transfer") continue;
    if (record.after.fromAccountId === record.after.toAccountId)
      return "review_transfer_same_endpoint";
    if (
      record.after.convertedAmountMinorUnits !== null ||
      record.after.exchangeRate !== null
    )
      return "review_atm_conversion_forbidden";
  }
  return null;
}

export function validateFinancialRowLimits(
  payload: ReviewBatchSavePayload
): string | null {
  for (const record of financialRecords(payload)) {
    const precision = getCurrencyPrecision(record.after.currency);
    const maximumMinorUnits =
      BigInt(MAX_TRANSACTION_AMOUNT) * 10n ** BigInt(precision);
    if (BigInt(record.after.amountMinorUnits) > maximumMinorUnits)
      return "review_financial_amount_exceeds_maximum";
  }
  return null;
}

export function validatePostedEffects(
  payload: ReviewBatchSavePayload
): string | null {
  if (!sortedDistinct(payload.accountEffects, (effect) => effect.accountId))
    return "review_effect_ids_not_sorted_unique";
  const effectIds = payload.accountEffects.map((effect) => effect.effectId);
  if (new Set(effectIds).size !== effectIds.length)
    return "review_effect_identity_duplicate";
  const expected = buildExpectedEffects(payload);
  if (expected.size !== payload.accountEffects.length)
    return "review_affected_accounts_not_guarded";
  for (const effect of payload.accountEffects) {
    const delta = expected.get(effect.accountId);
    if (delta === undefined || delta !== BigInt(effect.amountMinorUnits))
      return "review_effect_does_not_match_selected_net";
    if (delta > MAX_SIGNED_EFFECT || delta < -MAX_SIGNED_EFFECT)
      return "review_effect_overflow";
  }
  return validateEffectCurrencies(payload);
}

function validateEffectCurrencies(
  payload: ReviewBatchSavePayload
): string | null {
  const currencyByAccount = new Map(
    payload.accountEffects.map((effect) => [effect.accountId, effect.currency])
  );
  for (const record of financialRecords(payload)) {
    const currency = record.after.currency;
    const accounts =
      record.entity === "transaction"
        ? [record.after.accountId]
        : [record.after.fromAccountId, record.after.toAccountId];
    if (
      accounts.some(
        (accountId) => currencyByAccount.get(accountId) !== currency
      )
    )
      return "review_account_effect_currency_conflict";
  }
  for (const account of newAccountRecords(payload)) {
    if (currencyByAccount.get(account.after.id) !== account.after.currency)
      return "review_new_account_currency_conflict";
  }
  return null;
}

/**
 * The review action owns only newly created account flags. The captured owned
 * active/default snapshot is a closed *logical* CAS input; current ownership,
 * lock serialization and freshness still belong to the local/SQL writers.
 */
export function validateCreatedAccountBalances(
  payload: ReviewBatchSavePayload
): string | null {
  const accounts = newAccountRecords(payload);
  const smsCashDestinations = new Set<string>();
  if (payload.source === "SMS") {
    for (const record of financialRecords(payload)) {
      if (record.entity === "transfer")
        smsCashDestinations.add(record.after.toAccountId);
    }
  }
  for (const account of accounts) {
    if (
      account.after.openingBalanceMinorUnits !== "0" ||
      account.after.targetBalanceMinorUnits !== null
    )
      return "review_inferred_new_account_balance";
    if (
      payload.source === "SMS" &&
      account.after.type === "CASH" &&
      !smsCashDestinations.has(account.after.id)
    )
      return "review_sms_cash_only_for_atm";
  }

  const snapshot = payload.creationDefaultSnapshot;
  if (accounts.length === 0)
    return snapshot === undefined
      ? null
      : "review_unexpected_creation_default_snapshot";
  if (!snapshot) return "review_creation_default_snapshot_missing";
  return validateCreationDefaultSnapshot(accounts, snapshot);
}

/** Validate captured logical default state independently of current DB state. */
function validateCreationDefaultSnapshot(
  accounts: readonly ReviewNewAccount[],
  snapshot: NonNullable<ReviewBatchSavePayload["creationDefaultSnapshot"]>
): string | null {
  if (!sortedDistinct(snapshot.activeAccountIds, (id) => id))
    return "review_creation_snapshot_unsorted";

  const activeIds = new Set(snapshot.activeAccountIds);
  const currentDefaultId = snapshot.defaultAccount?.accountId;
  if (currentDefaultId !== undefined && !activeIds.has(currentDefaultId))
    return "review_creation_snapshot_default_not_active";
  if (accounts.some((account) => activeIds.has(account.after.id)))
    return "review_created_account_already_active_in_snapshot";

  // Use actual frozen CREATE UUIDs, not source/group/currency or incoming order.
  const firstCreatedId =
    snapshot.activeAccountIds.length === 0
      ? accounts.map((account) => account.after.id).sort()[0]
      : undefined;
  return accounts.every(
    (account) =>
      account.after.isDefault === (account.after.id === firstCreatedId)
  )
    ? null
    : "review_creation_first_active_default_mismatch";
}

export function validateAffectedAccountCoverage(
  payload: ReviewBatchSavePayload
): string | null {
  const affected = affectedAccountIds(payload);
  const posted = new Set(
    payload.accountEffects.map((effect) => effect.accountId)
  );
  if (affected.size !== posted.size) return "review_missing_account_effect";
  return [...affected].every((id) => posted.has(id))
    ? null
    : "review_unrelated_account_effect";
}
