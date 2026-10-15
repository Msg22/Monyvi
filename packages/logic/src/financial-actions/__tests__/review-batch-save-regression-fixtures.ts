/**
 * #395 T046 regression-only builders, derived from frozen T042 canonical data.
 * No copied financial DTOs or production validators, no platform/DB fixture.
 */
import type {
  ReviewBatchSavePayload,
  ReviewFinancialRecord,
  ReviewMutation,
  ReviewNewAccount,
} from "../review-batch-save-shapes";
import { MAX_TRANSACTION_AMOUNT } from "../../utils/amount-helpers";
import { getCurrencyPrecision } from "../../utils/currency";
import {
  ATM_BANK_ACCOUNT_ID,
  ATM_CASH_ACCOUNT_ID,
  ATM_QUEUE_ID,
  ATM_TRANSFER_RECORD_ID,
  REVIEW_ACCOUNT_ID,
  REVIEW_TRANSACTION_DATE,
  SMS_INCOME_RECORD_ID,
  SMS_QUEUE_ID,
  smsNewBankPayload,
  atmTransferPayload,
  reviewBatchSavePayload,
} from "./review-batch-save-fixtures";

/**
 * Copy only top-level fixture arrays into mutable Zod-inferred data arrays.
 * This is not a validator: RED payloads must reach the REAL SUT unmodified.
 */
function mutableSmsSource(): ReviewBatchSavePayload {
  const source = smsNewBankPayload;
  return {
    ...source,
    selectedSourceRefs: [...source.selectedSourceRefs],
    confirmedGroupRefs: [...source.confirmedGroupRefs],
    createGuards: [...source.createGuards],
    accountEffects: [...source.accountEffects],
    domainRecordRefs: [...source.domainRecordRefs],
    domainMutation: { records: [...source.domainMutation.records] },
    localSmsBookkeeping: [...source.localSmsBookkeeping],
  };
}

function mutableVoiceSource(): ReviewBatchSavePayload {
  const source = reviewBatchSavePayload;
  return {
    ...source,
    selectedSourceRefs: [...source.selectedSourceRefs],
    confirmedGroupRefs: [...source.confirmedGroupRefs],
    createGuards: [...source.createGuards],
    accountEffects: [...source.accountEffects],
    domainRecordRefs: [...source.domainRecordRefs],
    domainMutation: { records: [...source.domainMutation.records] },
    localSmsBookkeeping: [...source.localSmsBookkeeping],
  };
}

function mutableAtmSource(): ReviewBatchSavePayload {
  const source = atmTransferPayload;
  return {
    ...source,
    selectedSourceRefs: [...source.selectedSourceRefs],
    confirmedGroupRefs: [...source.confirmedGroupRefs],
    createGuards: [...source.createGuards],
    accountEffects: [...source.accountEffects],
    domainRecordRefs: [...source.domainRecordRefs],
    domainMutation: { records: [...source.domainMutation.records] },
    localSmsBookkeeping: [...source.localSmsBookkeeping],
  };
}

export function sharedSmsQueuePayload(): ReviewBatchSavePayload {
  const source = mutableSmsSource();
  return {
    ...source,
    sessionId: SMS_QUEUE_ID,
    localSmsBookkeeping: source.localSmsBookkeeping.map((entry) => ({
      ...entry,
      queueId: SMS_QUEUE_ID,
    })),
  };
}

/**
 * One selected SMS row is sufficient for existing-account SMS controls.
 * Unlike the independent mixed-queue A case, this is a single legitimate draft.
 */
export function singleSelectedNewBankPayload(): ReviewBatchSavePayload {
  return {
    ...smsNewBankPayload,
    sessionId: SMS_QUEUE_ID,
    selectedSourceRefs: [smsNewBankPayload.selectedSourceRefs[0]],
    confirmedGroupRefs: [...smsNewBankPayload.confirmedGroupRefs],
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

/**
 * E baseline: a selected, confirmed new BANK for VOICE, with exactly the
 * original financial IDs, two account-safe records, and their bank-details
 * child. No SMS queue/bookkeeping or source fingerprints are permitted.
 */
export function voiceNewBankPayload(): ReviewBatchSavePayload {
  const source = mutableSmsSource();
  return {
    ...source,
    source: "VOICE",
    selectedSourceRefs: source.selectedSourceRefs.map((ref) => ({
      ...ref, sourceFingerprint: null,
    })),
    domainMutation: {
      records: source.domainMutation.records.map(
        (record): ReviewMutation =>
          record.entity === "transaction"
            ? {
                ...record,
                after: { ...record.after, source: "VOICE", smsFingerprint: null },
              }
            : record
      ),
    },
    localSmsBookkeeping: [],
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
    createGuards: base.createGuards.filter(
      (guard) => guard.entity === "transaction"
    ),
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

/** A new-suite-only ATM control: prior 45 legacy fixtures stay untouched. */
export function queuedAtmPayload(): ReviewBatchSavePayload {
  return { ...mutableAtmSource(), sessionId: ATM_QUEUE_ID };
}

export function voiceZeroNetAtAmount(
  amountMinorUnits: string
): ReviewBatchSavePayload {
  const source = mutableVoiceSource();
  return {
    ...source,
    domainMutation: {
      records: source.domainMutation.records.map((record) => ({
        ...record,
        after: { ...record.after, amountMinorUnits },
      })),
    },
  };
}

/** Changes both the transfer and exact debit/credit effects together. */
export function atmAtAmount(amountMinorUnits: string): ReviewBatchSavePayload {
  const debit = (-BigInt(amountMinorUnits)).toString();
  const original = queuedAtmPayload();
  return {
    ...original,
    accountEffects: original.accountEffects.map((effect) => ({
      ...effect,
      amountMinorUnits:
        effect.accountId === ATM_BANK_ACCOUNT_ID ? debit : amountMinorUnits,
    })),
    domainMutation: {
      records: original.domainMutation.records.map((record) => ({
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
  const source = mutableVoiceSource();
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
  const source = queuedAtmPayload();
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
  const first = atmTransferPayload.localSmsBookkeeping[0];
  if (!first) throw new Error("Missing synthetic ATM draft");
  return {
    ...first,
    draftId: SECOND_SMS_DRAFT_ID,
    queueId: first.queueId,
  };
}

function additionalSmsTransaction(): ReviewFinancialRecord {
  const original = smsNewBankPayload.domainMutation.records[2];
  return {
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
}

export function cashUsedForOrdinarySmsPayload(): ReviewBatchSavePayload {
  const source = validAtmCashDestinationPayload();
  const cashGuard = source.createGuards.find((g) => g.entity === "account");
  const transferGuard = source.createGuards.find((g) => g.entity === "transfer");
  const cashRecord = source.domainMutation.records.find((r) => r.entity === "account");
  const transferRecord = source.domainMutation.records.find((r) => r.entity === "transfer");
  if (!cashGuard || !transferGuard || !cashRecord || !transferRecord)
    throw new Error("Incomplete canonical ATM Cash fixture");
  const transaction = additionalSmsTransaction();
  return {
    ...source,
    selectedSourceRefs: [
      ...source.selectedSourceRefs,
      { rowId: SECOND_ROW_ID, recordId: SECOND_TRANSACTION_ID,
        sourceFingerprint: SECOND_SMS_FINGERPRINT },
    ],
    createGuards: [
      cashGuard,
      { entity: "transaction", id: SECOND_TRANSACTION_ID, expectedAbsent: true },
      transferGuard,
    ],
    accountEffects: source.accountEffects.map((effect) => ({
      ...effect,
      amountMinorUnits: effect.accountId === ATM_CASH_ACCOUNT_ID ? "2605" : "-2505",
    })),
    domainRecordRefs: [
      ATM_CASH_ACCOUNT_ID, ATM_TRANSFER_RECORD_ID, SECOND_TRANSACTION_ID,
    ],
    domainMutation: {
      records: [cashRecord, transaction, transferRecord],
    },
    localSmsBookkeeping: [
      ...source.localSmsBookkeeping,
      additionalSmsBookkeeping(),
    ],
  };
}

function additionalCashSourceTransfer(): ReviewFinancialRecord {
  const original = atmTransferPayload.domainMutation.records[0];
  return {
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
}

export function cashUsedAsAtmSourcePayload(): ReviewBatchSavePayload {
  const source = validAtmCashDestinationPayload();
  const cashGuard = source.createGuards.find((g) => g.entity === "account");
  const transferGuard = source.createGuards.find((g) => g.entity === "transfer");
  if (!cashGuard || !transferGuard)
    throw new Error("Missing ATM Cash guards");
  const secondTransfer = additionalCashSourceTransfer();
  return {
    ...source,
    selectedSourceRefs: [
      ...source.selectedSourceRefs,
      { rowId: SECOND_ROW_ID, recordId: SECOND_TRANSFER_ID,
        sourceFingerprint: SECOND_SMS_FINGERPRINT },
    ],
    createGuards: [
      cashGuard, transferGuard,
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
