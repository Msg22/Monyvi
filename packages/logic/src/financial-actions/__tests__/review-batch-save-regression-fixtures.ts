/**
 * #395 T046 regression-only builders, derived from frozen T042 canonical data.
 * No copied financial DTOs or production validators, no platform/DB fixture.
 */
import type { ReviewBatchSavePayload } from "../review-batch-save-shapes";
import { MAX_TRANSACTION_AMOUNT } from "../../utils/amount-helpers";
import { getCurrencyPrecision } from "../../utils/currency";
import {
  ATM_BANK_ACCOUNT_ID,
  REVIEW_ACCOUNT_ID,
  SMS_EXPENSE_RECORD_ID,
  SMS_INCOME_RECORD_ID,
  SMS_QUEUE_ID,
  smsNewBankPayload,
  atmTransferPayload,
  reviewBatchSavePayload,
} from "./review-batch-save-fixtures";

export function sharedSmsQueuePayload(): ReviewBatchSavePayload {
  return {
    ...smsNewBankPayload,
    localSmsBookkeeping: smsNewBankPayload.localSmsBookkeeping.map((entry) => ({
      ...entry,
      queueId: SMS_QUEUE_ID,
    })),
  };
}

/** Reuses the same selected SMS rows; creates no new account or child. */
export function existingAccountSmsPayload(): ReviewBatchSavePayload {
  const oneQueue = sharedSmsQueuePayload();
  return {
    ...oneQueue,
    confirmedGroupRefs: [],
    createGuards: oneQueue.createGuards.filter(
      (guard) => guard.entity === "transaction"
    ),
    accountEffects: oneQueue.accountEffects.map((effect) => ({
      ...effect,
      accountId: REVIEW_ACCOUNT_ID,
    })),
    domainRecordRefs: [SMS_INCOME_RECORD_ID, SMS_EXPENSE_RECORD_ID],
    domainMutation: {
      records: oneQueue.domainMutation.records
        .filter((record) => record.entity === "transaction")
        .map((record) => ({
          ...record,
          after: { ...record.after, accountId: REVIEW_ACCOUNT_ID },
        })),
    },
  };
}

export function voiceZeroNetAtAmount(
  amountMinorUnits: string
): ReviewBatchSavePayload {
  return {
    ...reviewBatchSavePayload,
    domainMutation: {
      records: reviewBatchSavePayload.domainMutation.records.map((record) => ({
        ...record,
        after: { ...record.after, amountMinorUnits },
      })),
    },
  };
}

/** Changes both the transfer and exact debit/credit effects together. */
export function atmAtAmount(amountMinorUnits: string): ReviewBatchSavePayload {
  const debit = (-BigInt(amountMinorUnits)).toString();
  return {
    ...atmTransferPayload,
    accountEffects: atmTransferPayload.accountEffects.map((effect) => ({
      ...effect,
      amountMinorUnits:
        effect.accountId === ATM_BANK_ACCOUNT_ID ? debit : amountMinorUnits,
    })),
    domainMutation: {
      records: atmTransferPayload.domainMutation.records.map((record) => ({
        ...record,
        after: { ...record.after, amountMinorUnits },
      })),
    },
  };
}

/** Bound is from existing financial helpers, not a duplicated number. */
export function egpFinancialAmountBounds(): {
  readonly maximumMinorUnits: string;
  readonly oneMinorUnitOver: string;
} {
  const maximum = BigInt(MAX_TRANSACTION_AMOUNT) *
    10n ** BigInt(getCurrencyPrecision("EGP"));
  return {
    maximumMinorUnits: maximum.toString(),
    oneMinorUnitOver: (maximum + 1n).toString(),
  };
}
