/**
 * #395 T046 exact posted effects and Cash snapshot checks. Bigint arithmetic
 * preserves canonical integer minor units (no Number summation or rounding).
 */
import type { ReviewBatchSavePayload } from "./review-batch-save-shapes";
import { MAX_TRANSACTION_AMOUNT } from "../utils/amount-helpers";
import { getCurrencyPrecision } from "../utils/currency";
import {
  affectedAccountIds, financialRecords, newAccountRecords, sortedDistinct,
} from "./review-batch-save-integrity";

const MAX_SIGNED_EFFECT = 9223372036854775807n;

function addDelta(
  deltas: Map<string, bigint>, accountId: string, amount: bigint
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
      addDelta(deltas, record.after.accountId,
        record.after.type === "INCOME" ? amount : -amount);
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
    if (record.after.convertedAmountMinorUnits !== null ||
        record.after.exchangeRate !== null)
      return "review_atm_conversion_forbidden";
  }
  return null;
}

export function validateFinancialRowLimits(
  payload: ReviewBatchSavePayload
): string | null {
  for (const record of financialRecords(payload)) {
    const precision = getCurrencyPrecision(record.after.currency);
    const maximumMinorUnits = BigInt(MAX_TRANSACTION_AMOUNT) *
      10n ** BigInt(precision);
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
    const accounts = record.entity === "transaction"
      ? [record.after.accountId]
      : [record.after.fromAccountId, record.after.toAccountId];
    if (accounts.some((accountId) => currencyByAccount.get(accountId) !== currency))
      return "review_account_effect_currency_conflict";
  }
  for (const account of newAccountRecords(payload)) {
    if (currencyByAccount.get(account.after.id) !== account.after.currency)
      return "review_new_account_currency_conflict";
  }
  return null;
}

export function validateCreatedAccountBalances(
  payload: ReviewBatchSavePayload
): string | null {
  for (const account of newAccountRecords(payload)) {
    if (account.after.openingBalanceMinorUnits !== "0" ||
        account.after.targetBalanceMinorUnits !== null)
      return "review_inferred_new_account_balance";
    if (account.after.type !== "CASH" && account.after.isDefault)
      return "review_suggested_account_default_forbidden";
  }
  const cash = newAccountRecords(payload).filter(
    (account) => account.after.type === "CASH"
  );
  if (cash.length === 0)
    return payload.cashDefaultSnapshot === undefined
      ? null : "review_unexpected_cash_snapshot";
  if (cash.length !== 1) return "review_multiple_new_cash_accounts";
  const cashAccount = cash[0];
  if (!cashAccount) return "review_cash_account_missing";
  if (
    payload.source === "SMS" &&
    !financialRecords(payload).some(
      (record) => record.entity === "transfer" &&
        record.after.toAccountId === cashAccount.after.id
    )
  ) return "review_sms_cash_only_for_atm";
  const snapshot = payload.cashDefaultSnapshot;
  if (!snapshot) return "review_cash_snapshot_missing";
  if (!sortedDistinct(snapshot.activeAccountIds, (id) => id))
    return "review_cash_snapshot_unsorted";
  const currentDefault = snapshot.defaultAccount?.accountId;
  if (currentDefault !== undefined && !snapshot.activeAccountIds.includes(currentDefault))
    return "review_cash_default_not_active";
  const currentCash = cash[0];
  if (!currentCash || snapshot.activeAccountIds.includes(currentCash.after.id))
    return "review_cash_not_absent_from_snapshot";
  return currentCash.after.isDefault === (snapshot.activeAccountIds.length === 0)
    ? null : "review_cash_default_first_active_mismatch";
}

export function validateAffectedAccountCoverage(
  payload: ReviewBatchSavePayload
): string | null {
  const affected = affectedAccountIds(payload);
  const posted = new Set(payload.accountEffects.map((effect) => effect.accountId));
  if (affected.size !== posted.size) return "review_missing_account_effect";
  return [...affected].every((id) => posted.has(id))
    ? null : "review_unrelated_account_effect";
}
