// Immutable synthetic fixtures for review.batch-save/v1 payload/envelope tests.
// Shapes follow the frozen T004 wire contract; no production DTOs copied.

import {
  parseCanonicalUnsignedIntegerString,
  type FinancialActionEnvelopeV1,
} from "../action-contracts";
import type { RegisteredActionPayload } from "../action-registry";

export const REVIEW_ACTION_ID = "11111111-1111-4111-8111-111111111111";
export const REVIEW_USER_ID = "22222222-2222-4222-8222-222222222222";
export const REVIEW_SESSION_ID = "33333333-3333-4333-8333-333333333333";
export const REVIEW_ACCOUNT_ID = "44444444-4444-4444-8444-444444444004";
export const REVIEW_INCOME_RECORD_ID = "8a000000-0000-4000-8000-000000000001";
export const REVIEW_EXPENSE_RECORD_ID = "8b000000-0000-4000-8000-000000000002";
export const REVIEW_INCOME_ROW_ID = "8a000000-0000-4000-8000-000000000011";
export const REVIEW_EXPENSE_ROW_ID = "8b000000-0000-4000-8000-000000000012";
export const REVIEW_EFFECT_ID = "8e000000-0000-4000-8000-000000000005";
export const REVIEW_CATEGORY_ID = "a0000000-0000-4000-8000-000000000001";
export const REVIEW_OCCURRED_AT = "2026-10-15T12:00:00.000Z";
export const REVIEW_CREATED_AT = "2026-10-14T00:00:00.000Z";
export const REVIEW_TRANSACTION_DATE = "2026-10-14";
export const REVIEW_FROZEN_INTENT_DIGEST = "ab".repeat(32);

export const reviewBatchSavePayload = {
  schemaVersion: "review.batch-save/v1",
  operationCode: "review.batch-save",
  frozenIntentDigest: REVIEW_FROZEN_INTENT_DIGEST,
  source: "VOICE",
  sessionId: REVIEW_SESSION_ID,
  selectedSourceRefs: [
    {
      rowId: REVIEW_INCOME_ROW_ID,
      recordId: REVIEW_INCOME_RECORD_ID,
      sourceFingerprint: null,
    },
    {
      rowId: REVIEW_EXPENSE_ROW_ID,
      recordId: REVIEW_EXPENSE_RECORD_ID,
      sourceFingerprint: null,
    },
  ],
  confirmedGroupRefs: [],
  createGuards: [
    {
      entity: "transaction",
      id: REVIEW_INCOME_RECORD_ID,
      expectedAbsent: true,
    },
    {
      entity: "transaction",
      id: REVIEW_EXPENSE_RECORD_ID,
      expectedAbsent: true,
    },
  ],
  accountEffects: [
    {
      accountId: REVIEW_ACCOUNT_ID,
      amountMinorUnits: "0",
      currency: "EGP",
      effectId: REVIEW_EFFECT_ID,
    },
  ],
  domainRecordRefs: [REVIEW_INCOME_RECORD_ID, REVIEW_EXPENSE_RECORD_ID],
  domainMutation: {
    records: [
      {
        entity: "transaction",
        mode: "create",
        expectedUpdatedAt: null,
        after: {
          id: REVIEW_INCOME_RECORD_ID,
          accountId: REVIEW_ACCOUNT_ID,
          amountMinorUnits: "2001",
          currency: "EGP",
          type: "INCOME",
          categoryId: REVIEW_CATEGORY_ID,
          counterparty: null,
          note: null,
          date: REVIEW_TRANSACTION_DATE,
          source: "VOICE",
          smsFingerprint: null,
          isDraft: false,
          linkedAssetId: null,
          linkedDebtId: null,
          linkedRecurringId: null,
          createdAt: REVIEW_CREATED_AT,
          deleted: false,
        },
      },
      {
        entity: "transaction",
        mode: "create",
        expectedUpdatedAt: null,
        after: {
          id: REVIEW_EXPENSE_RECORD_ID,
          accountId: REVIEW_ACCOUNT_ID,
          amountMinorUnits: "2001",
          currency: "EGP",
          type: "EXPENSE",
          categoryId: REVIEW_CATEGORY_ID,
          counterparty: null,
          note: null,
          date: REVIEW_TRANSACTION_DATE,
          source: "VOICE",
          smsFingerprint: null,
          isDraft: false,
          linkedAssetId: null,
          linkedDebtId: null,
          linkedRecurringId: null,
          createdAt: REVIEW_CREATED_AT,
          deleted: false,
        },
      },
    ],
  },
  localSmsBookkeeping: [],
} as const satisfies RegisteredActionPayload;

export const reviewBatchSaveEnvelope = {
  accountGuards: [
    {
      accountId: REVIEW_ACCOUNT_ID,
      expectedRevision: parseCanonicalUnsignedIntegerString("7"),
    },
  ],
  actionId: REVIEW_ACTION_ID,
  domain: "transactions",
  domainReferenceId: REVIEW_INCOME_RECORD_ID,
  envelopeVersion: "monyvi.financial-action/v1",
  kind: "review_batch_save",
  occurredAt: REVIEW_OCCURRED_AT,
  payload: reviewBatchSavePayload,
  payloadVersion: "review.batch-save/v1",
  userId: REVIEW_USER_ID,
} as const satisfies FinancialActionEnvelopeV1;

export const REVIEW_SNAPSHOT_HASH =
  "abababababababababababababababababababababababababababababababab";
export const SMS_INCOME_FINGERPRINT = "0f4d8c2a91b3e5f7a9c1d3e5f7a9b1c3";
export const SMS_EXPENSE_FINGERPRINT = "2b7e9a4c1d3f5e8a0b2c4d6e8f0a2c5e";
export const ATM_FINGERPRINT = "1e5c9d3b8a2f4e6c0b8d1a3c5e7f9b2d";
export const SMS_GROUP_ID = "54000000-0000-4000-8000-000000000001";
export const SMS_DRAFT_ID = "53000000-0000-4000-8000-000000000001";
export const SMS_QUEUE_ID = "53000000-0000-4000-8000-000000000002";
export const SMS_DRAFT_ID_2 = "53000000-0000-4000-8000-000000000003";
export const SMS_QUEUE_ID_2 = "53000000-0000-4000-8000-000000000004";
export const NEW_BANK_ACCOUNT_ID = "55555555-5555-4555-8555-555555555555";
export const BANK_DETAILS_ID = "56000000-0000-4000-8000-000000000001";
export const SMS_INCOME_RECORD_ID = "57000000-0000-4000-8000-000000000001";
export const SMS_EXPENSE_RECORD_ID = "58000000-0000-4000-8000-000000000001";
export const SMS_INCOME_ROW_ID = "57000000-0000-4000-8000-000000000011";
export const SMS_EXPENSE_ROW_ID = "58000000-0000-4000-8000-000000000011";
export const SMS_NET_EFFECT_ID = "59000000-0000-4000-8000-000000000001";
export const SMS_CATEGORY_INCOME_ID = "a1000000-0000-4000-8000-000000000001";
export const SMS_CATEGORY_EXPENSE_ID = "a2000000-0000-4000-8000-000000000001";
export const ATM_DRAFT_ID = "64000000-0000-4000-8000-000000000001";
export const ATM_QUEUE_ID = "64000000-0000-4000-8000-000000000002";
export const ATM_BANK_ACCOUNT_ID = "65000000-0000-4000-8000-000000000001";
export const ATM_CASH_ACCOUNT_ID = "66000000-0000-4000-8000-000000000001";
export const ATM_TRANSFER_RECORD_ID = "67000000-0000-4000-8000-000000000001";
export const ATM_ROW_ID = "67000000-0000-4000-8000-000000000011";
export const ATM_SOURCE_EFFECT_ID = "68000000-0000-4000-8000-000000000001";
export const ATM_DEST_EFFECT_ID = "69000000-0000-4000-8000-000000000001";

export const smsNewBankPayload = {
  schemaVersion: "review.batch-save/v1",
  operationCode: "review.batch-save",
  frozenIntentDigest: REVIEW_FROZEN_INTENT_DIGEST,
  source: "SMS",
  sessionId: SMS_QUEUE_ID,
  selectedSourceRefs: [
    {
      rowId: SMS_INCOME_ROW_ID,
      recordId: SMS_INCOME_RECORD_ID,
      sourceFingerprint: SMS_INCOME_FINGERPRINT,
    },
    {
      rowId: SMS_EXPENSE_ROW_ID,
      recordId: SMS_EXPENSE_RECORD_ID,
      sourceFingerprint: SMS_EXPENSE_FINGERPRINT,
    },
  ],
  confirmedGroupRefs: [
    { groupId: SMS_GROUP_ID, revision: "3", accountId: NEW_BANK_ACCOUNT_ID },
  ],
  createGuards: [
    { entity: "account", id: NEW_BANK_ACCOUNT_ID, expectedAbsent: true },
    { entity: "bank_details", id: BANK_DETAILS_ID, expectedAbsent: true },
    { entity: "transaction", id: SMS_INCOME_RECORD_ID, expectedAbsent: true },
    { entity: "transaction", id: SMS_EXPENSE_RECORD_ID, expectedAbsent: true },
  ],
  accountEffects: [
    {
      accountId: NEW_BANK_ACCOUNT_ID,
      amountMinorUnits: "1500",
      currency: "EGP",
      effectId: SMS_NET_EFFECT_ID,
    },
  ],
  domainRecordRefs: [
    NEW_BANK_ACCOUNT_ID,
    BANK_DETAILS_ID,
    SMS_INCOME_RECORD_ID,
    SMS_EXPENSE_RECORD_ID,
  ],
  domainMutation: {
    records: [
      {
        entity: "account",
        mode: "create",
        expectedUpdatedAt: null,
        after: {
          id: NEW_BANK_ACCOUNT_ID,
          name: "Suggested Bank",
          type: "BANK",
          currency: "EGP",
          institutionId: "inst-bank-0001",
          providerDisplayName: "Bank",
          isDefault: false,
          createdAt: REVIEW_CREATED_AT,
          deleted: false,
          openingBalanceMinorUnits: "0",
          targetBalanceMinorUnits: null,
        },
      },
      {
        entity: "bank_details",
        mode: "create",
        expectedUpdatedAt: null,
        after: {
          id: BANK_DETAILS_ID,
          accountId: NEW_BANK_ACCOUNT_ID,
          accountNumber: null,
          cardLast4: "0007",
          createdAt: REVIEW_CREATED_AT,
          deleted: false,
        },
      },
      {
        entity: "transaction",
        mode: "create",
        expectedUpdatedAt: null,
        after: {
          id: SMS_INCOME_RECORD_ID,
          accountId: NEW_BANK_ACCOUNT_ID,
          amountMinorUnits: "2001",
          currency: "EGP",
          type: "INCOME",
          categoryId: SMS_CATEGORY_INCOME_ID,
          counterparty: null,
          note: null,
          date: REVIEW_TRANSACTION_DATE,
          source: "SMS",
          smsFingerprint: SMS_INCOME_FINGERPRINT,
          isDraft: false,
          linkedAssetId: null,
          linkedDebtId: null,
          linkedRecurringId: null,
          createdAt: REVIEW_CREATED_AT,
          deleted: false,
        },
      },
      {
        entity: "transaction",
        mode: "create",
        expectedUpdatedAt: null,
        after: {
          id: SMS_EXPENSE_RECORD_ID,
          accountId: NEW_BANK_ACCOUNT_ID,
          amountMinorUnits: "501",
          currency: "EGP",
          type: "EXPENSE",
          categoryId: SMS_CATEGORY_EXPENSE_ID,
          counterparty: null,
          note: null,
          date: REVIEW_TRANSACTION_DATE,
          source: "SMS",
          smsFingerprint: SMS_EXPENSE_FINGERPRINT,
          isDraft: false,
          linkedAssetId: null,
          linkedDebtId: null,
          linkedRecurringId: null,
          createdAt: REVIEW_CREATED_AT,
          deleted: false,
        },
      },
    ],
  },
  localSmsBookkeeping: [
    {
      draftId: SMS_DRAFT_ID,
      queueId: SMS_QUEUE_ID,
      snapshotHash: REVIEW_SNAPSHOT_HASH,
      expectedReviewRevision: "0",
      operation: "delete_saved",
    },
    {
      draftId: SMS_DRAFT_ID_2,
      queueId: SMS_QUEUE_ID,
      snapshotHash: REVIEW_SNAPSHOT_HASH,
      expectedReviewRevision: "0",
      operation: "delete_saved",
    },
  ],
  // A current owned active account exists; the confirmed new BANK stays nondefault.
  creationDefaultSnapshot: {
    activeAccountIds: [REVIEW_ACCOUNT_ID],
    defaultAccount: null,
  },
} as const satisfies RegisteredActionPayload;

export const smsNewBankEnvelope = {
  accountGuards: [
    {
      accountId: NEW_BANK_ACCOUNT_ID,
      expectedRevision: parseCanonicalUnsignedIntegerString("0"),
    },
  ],
  actionId: REVIEW_ACTION_ID,
  domain: "transactions",
  domainReferenceId: SMS_INCOME_RECORD_ID,
  envelopeVersion: "monyvi.financial-action/v1",
  kind: "review_batch_save",
  occurredAt: REVIEW_OCCURRED_AT,
  payload: smsNewBankPayload,
  payloadVersion: "review.batch-save/v1",
  userId: REVIEW_USER_ID,
} as const satisfies FinancialActionEnvelopeV1;

export const atmTransferPayload = {
  schemaVersion: "review.batch-save/v1",
  operationCode: "review.batch-save",
  frozenIntentDigest: REVIEW_FROZEN_INTENT_DIGEST,
  source: "SMS",
  sessionId: ATM_QUEUE_ID,
  selectedSourceRefs: [
    {
      rowId: ATM_ROW_ID,
      recordId: ATM_TRANSFER_RECORD_ID,
      sourceFingerprint: ATM_FINGERPRINT,
    },
  ],
  confirmedGroupRefs: [],
  createGuards: [
    { entity: "transfer", id: ATM_TRANSFER_RECORD_ID, expectedAbsent: true },
  ],
  accountEffects: [
    {
      accountId: ATM_BANK_ACCOUNT_ID,
      amountMinorUnits: "-2505",
      currency: "EGP",
      effectId: ATM_SOURCE_EFFECT_ID,
    },
    {
      accountId: ATM_CASH_ACCOUNT_ID,
      amountMinorUnits: "2505",
      currency: "EGP",
      effectId: ATM_DEST_EFFECT_ID,
    },
  ],
  domainRecordRefs: [ATM_TRANSFER_RECORD_ID],
  domainMutation: {
    records: [
      {
        entity: "transfer",
        mode: "create",
        expectedUpdatedAt: null,
        after: {
          id: ATM_TRANSFER_RECORD_ID,
          fromAccountId: ATM_BANK_ACCOUNT_ID,
          toAccountId: ATM_CASH_ACCOUNT_ID,
          amountMinorUnits: "2505",
          convertedAmountMinorUnits: null,
          exchangeRate: null,
          currency: "EGP",
          date: REVIEW_TRANSACTION_DATE,
          notes: null,
          smsFingerprint: ATM_FINGERPRINT,
          createdAt: REVIEW_CREATED_AT,
          deleted: false,
        },
      },
    ],
  },
  localSmsBookkeeping: [
    {
      draftId: ATM_DRAFT_ID,
      queueId: ATM_QUEUE_ID,
      snapshotHash: REVIEW_SNAPSHOT_HASH,
      expectedReviewRevision: "0",
      operation: "delete_saved",
    },
  ],
} as const satisfies RegisteredActionPayload;

export const atmTransferEnvelope = {
  accountGuards: [
    {
      accountId: ATM_BANK_ACCOUNT_ID,
      expectedRevision: parseCanonicalUnsignedIntegerString("7"),
    },
    {
      accountId: ATM_CASH_ACCOUNT_ID,
      expectedRevision: parseCanonicalUnsignedIntegerString("7"),
    },
  ],
  actionId: REVIEW_ACTION_ID,
  domain: "transactions",
  domainReferenceId: ATM_TRANSFER_RECORD_ID,
  envelopeVersion: "monyvi.financial-action/v1",
  kind: "review_batch_save",
  occurredAt: REVIEW_OCCURRED_AT,
  payload: atmTransferPayload,
  payloadVersion: "review.batch-save/v1",
  userId: REVIEW_USER_ID,
} as const satisfies FinancialActionEnvelopeV1;

export const legacyEditBalanceEnvelope = {
  accountGuards: [
    {
      accountId: REVIEW_ACCOUNT_ID,
      expectedRevision: parseCanonicalUnsignedIntegerString("7"),
    },
  ],
  actionId: REVIEW_ACTION_ID,
  domain: "accounts",
  domainReferenceId: REVIEW_ACCOUNT_ID,
  envelopeVersion: "monyvi.financial-action/v1",
  kind: "edit_balance",
  occurredAt: REVIEW_OCCURRED_AT,
  payload: {
    accountEffects: [
      {
        accountId: REVIEW_ACCOUNT_ID,
        amountMinorUnits: "2500",
        currency: "EGP",
        effectId: REVIEW_EFFECT_ID,
      },
    ],
    domainMutation: {
      records: [
        {
          after: {
            createdAt: "2026-08-01T12:00:00.000Z",
            currency: "EGP",
            deleted: false,
            id: REVIEW_ACCOUNT_ID,
            institutionId: null,
            isDefault: true,
            name: "Cash",
            openingBalanceMinorUnits: null,
            providerDisplayName: null,
            targetBalanceMinorUnits: "12500",
            type: "CASH",
          },
          entity: "account",
          expectedUpdatedAt: "2026-08-31T12:00:00.000Z",
          mode: "update",
        },
      ],
    },
    domainRecordRefs: [REVIEW_ACCOUNT_ID],
    operationCode: "account.edit-balance",
    schemaVersion: "account.balance-effects/v1",
  },
  payloadVersion: "account.balance-effects/v1",
  userId: REVIEW_USER_ID,
} as const satisfies FinancialActionEnvelopeV1;
