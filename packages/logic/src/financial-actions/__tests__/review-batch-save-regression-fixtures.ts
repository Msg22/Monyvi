/**
 * #395 T046 regression-only builders, derived from frozen T042 canonical data.
 * No copied financial DTOs or production validators, no platform/DB fixture.
 */
import type {
  ReviewBatchSavePayload,
  ReviewFinancialRecord,
  ReviewNewAccount,
} from "../review-batch-save-shapes";
import { MAX_TRANSACTION_AMOUNT } from "../../utils/amount-helpers";
import { getCurrencyPrecision } from "../../utils/currency";
import {
  ATM_BANK_ACCOUNT_ID,
  ATM_CASH_ACCOUNT_ID,
  ATM_TRANSFER_RECORD_ID,
  REVIEW_ACCOUNT_ID,
  REVIEW_TRANSACTION_DATE,
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
/**
 * One selected SMS row is sufficient to exercise new-account group linkage,
 * without coupling tests to the independent multi-draft queue defect.
 */
export function singleSelectedNewBankPayload(): ReviewBatchSavePayload {
  return {
    ...smsNewBankPayload,
    selectedSourceRefs: [smsNewBankPayload.selectedSourceRefs[0]],
    createGuards: smsNewBankPayload.createGuards.slice(0, 3),
    accountEffects: smsNewBankPayload.accountEffects.map((effect) => ({
      ...effect,
      amountMinorUnits: "2001",
    })),
    domainRecordRefs: smsNewBankPayload.domainRecordRefs.slice(0, 3),
    domainMutation: {
      records: smsNewBankPayload.domainMutation.records.slice(0, 3),
    },
    localSmsBookkeeping: [smsNewBankPayload.localSmsBookkeeping[0]],
  };
}

/** Existing-only SMS needs no new account or mandatory suggested group. */
export function existingAccountSmsPayload(): ReviewBatchSavePayload {
  const base = singleSelectedNewBankPayload();
  const financial = base.domainMutation.records[2];
  if (financial?.entity !== "transaction") {
    throw new Error("Expected synthetic selected SMS transaction");
  }
  return {
    ...base,
    confirmedGroupRefs: [],
    createGuards: [base.createGuards[2]],
    accountEffects: base.accountEffects.map((effect) => ({
      ...effect, accountId: REVIEW_ACCOUNT_ID,
    })),
    domainRecordRefs: [SMS_INCOME_RECORD_ID],
    domainMutation: {
      records: [{
        ...financial,
        after: { ...financial.after, accountId: REVIEW_ACCOUNT_ID },
      }],
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


const NEW_CASH_ACCOUNT_ID = "55555555-5555-4555-8555-555555555550";
const CASH_GROUP_ID = "54000000-0000-4000-8000-000000000002";
const SECOND_ROW_ID = "68000000-0000-4000-8000-000000000011";
const SECOND_TRANSACTION_ID = "68000000-0000-4000-8000-000000000021";
const SECOND_TRANSFER_ID = "68000000-0000-4000-8000-000000000031";
const SECOND_SMS_DRAFT_ID = "74000000-0000-4000-8000-000000000021";
const SECOND_SMS_FINGERPRINT = "a1c3e5f7092b4d6e8a0c2e4f6b8d0a25";

function newCashAccount(id: string, isDefault: boolean): ReviewNewAccount {
  const original = smsNewBankPayload.domainMutation.records[0];
  return {
    ...original,
    after: {
      ...original.after,
      id,
      name: "Cash",
      type: "CASH",
      institutionId: null,
      providerDisplayName: null,
      isDefault,
    },
  };
}

export function validVoiceCashPayload(): ReviewBatchSavePayload {
  const source = reviewBatchSavePayload;
  return {
    ...source,
    confirmedGroupRefs: [{
      groupId: CASH_GROUP_ID, revision: "1", accountId: NEW_CASH_ACCOUNT_ID,
    }],
    createGuards: [
      { entity: "account", id: NEW_CASH_ACCOUNT_ID, expectedAbsent: true },
      ...source.createGuards,
    ],
    accountEffects: source.accountEffects.map((effect) => ({
      ...effect, accountId: NEW_CASH_ACCOUNT_ID,
    })),
    domainRecordRefs: [NEW_CASH_ACCOUNT_ID, ...source.domainRecordRefs],
    domainMutation: {
      records: [
        newCashAccount(NEW_CASH_ACCOUNT_ID, true),
        ...source.domainMutation.records.map((record) => ({
          ...record,
          after: { ...record.after, accountId: NEW_CASH_ACCOUNT_ID },
        })),
      ],
    },
    cashDefaultSnapshot: { activeAccountIds: [], defaultAccount: null },
  };
}

export function validAtmCashDestinationPayload(): ReviewBatchSavePayload {
  const source = atmTransferPayload;
  return {
    ...source,
    createGuards: [
      { entity: "account", id: ATM_CASH_ACCOUNT_ID, expectedAbsent: true },
      ...source.createGuards,
    ],
    domainRecordRefs: [ATM_CASH_ACCOUNT_ID, ...source.domainRecordRefs],
    domainMutation: {
      records: [newCashAccount(ATM_CASH_ACCOUNT_ID, false), ...source.domainMutation.records],
    },
    cashDefaultSnapshot: {
      activeAccountIds: [ATM_BANK_ACCOUNT_ID],
      defaultAccount: null,
    },
  };
}

function additionalSmsBookkeeping(): ReviewBatchSavePayload["localSmsBookkeeping"][number] {
  return {
    ...atmTransferPayload.localSmsBookkeeping[0],
    draftId: SECOND_SMS_DRAFT_ID,
    queueId: atmTransferPayload.localSmsBookkeeping[0].queueId,
  };
}

export function cashUsedForOrdinarySmsPayload(): ReviewBatchSavePayload {
  const source = validAtmCashDestinationPayload();
  const original = smsNewBankPayload.domainMutation.records[2];
  const transaction: ReviewFinancialRecord = {
    ...original,
    after: {
      ...original.after,
      id: SECOND_TRANSACTION_ID,
      accountId: ATM_CASH_ACCOUNT_ID,
      amountMinorUnits: "100",
      date: REVIEW_TRANSACTION_DATE,
      smsFingerprint: SECOND_SMS_FINGERPRINT,
    },
  };
  return {
    ...source,
    selectedSourceRefs: [
      ...source.selectedSourceRefs,
      { rowId: SECOND_ROW_ID, recordId: SECOND_TRANSACTION_ID,
        sourceFingerprint: SECOND_SMS_FINGERPRINT },
    ],
    createGuards: [
      source.createGuards[0],
      { entity: "transaction", id: SECOND_TRANSACTION_ID, expectedAbsent: true },
      source.createGuards[1],
    ],
    accountEffects: source.accountEffects.map((effect) => ({
      ...effect,
      amountMinorUnits: effect.accountId === ATM_CASH_ACCOUNT_ID ? "2605" : "-2505",
    })),
    domainRecordRefs: [
      ATM_CASH_ACCOUNT_ID, ATM_TRANSFER_RECORD_ID, SECOND_TRANSACTION_ID,
    ],
    domainMutation: {
      records: [source.domainMutation.records[0], transaction, source.domainMutation.records[1]],
    },
    localSmsBookkeeping: [
      ...source.localSmsBookkeeping,
      additionalSmsBookkeeping(),
    ],
  };
}

export function cashUsedAsAtmSourcePayload(): ReviewBatchSavePayload {
  const source = validAtmCashDestinationPayload();
  const original = atmTransferPayload.domainMutation.records[0];
  const secondTransfer: ReviewFinancialRecord = {
    ...original,
    after: {
      ...original.after,
      id: SECOND_TRANSFER_ID,
      fromAccountId: ATM_CASH_ACCOUNT_ID,
      toAccountId: ATM_BANK_ACCOUNT_ID,
      amountMinorUnits: "100",
      smsFingerprint: SECOND_SMS_FINGERPRINT,
    },
  };
  return {
    ...source,
    selectedSourceRefs: [
      ...source.selectedSourceRefs,
      { rowId: SECOND_ROW_ID, recordId: SECOND_TRANSFER_ID,
        sourceFingerprint: SECOND_SMS_FINGERPRINT },
    ],
    createGuards: [
      source.createGuards[0], source.createGuards[1],
      { entity: "transfer", id: SECOND_TRANSFER_ID, expectedAbsent: true },
    ],
    accountEffects: source.accountEffects.map((effect) => ({
      ...effect,
      amountMinorUnits: effect.accountId === ATM_CASH_ACCOUNT_ID ? "2405" : "-2405",
    })),
    domainRecordRefs: [
      ATM_CASH_ACCOUNT_ID, ATM_TRANSFER_RECORD_ID, SECOND_TRANSFER_ID,
    ],
    domainMutation: {
      records: [...source.domainMutation.records, secondTransfer],
    },
    localSmsBookkeeping: [
      ...source.localSmsBookkeeping,
      additionalSmsBookkeeping(),
    ],
  };
}
