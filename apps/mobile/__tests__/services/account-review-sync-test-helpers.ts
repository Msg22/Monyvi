import type { SyncPushArgs, SyncTableChangeSet } from "@nozbe/watermelondb/sync";
import {
  REVIEW_ACTION_ID,
  REVIEW_USER_ID,
  REVIEW_ACCOUNT_ID,
  REVIEW_INCOME_RECORD_ID,
  REVIEW_EXPENSE_RECORD_ID,
  REVIEW_EFFECT_ID,
  REVIEW_CATEGORY_ID,
  REVIEW_CREATED_AT,
  REVIEW_TRANSACTION_DATE,
  SMS_INCOME_FINGERPRINT,
  SMS_EXPENSE_FINGERPRINT,
  ATM_FINGERPRINT,
  SMS_DRAFT_ID,
  SMS_QUEUE_ID,
  NEW_BANK_ACCOUNT_ID,
  BANK_DETAILS_ID,
  ACCOUNT_SMS_SENDER_ID,
  SMS_INCOME_RECORD_ID,
  SMS_EXPENSE_RECORD_ID,
  SMS_NET_EFFECT_ID,
  SMS_CATEGORY_INCOME_ID,
  SMS_CATEGORY_EXPENSE_ID,
  ATM_BANK_ACCOUNT_ID,
  ATM_CASH_ACCOUNT_ID,
  ATM_TRANSFER_RECORD_ID,
  ATM_SOURCE_EFFECT_ID,
  ATM_DEST_EFFECT_ID,
  reviewBatchSaveEnvelope,
  smsNewBankEnvelope,
  atmTransferEnvelope,
  legacyEditBalanceEnvelope,
} from "./account-review-sync-canonical-test-fixtures";

export * from "./account-review-sync-canonical-test-fixtures";

export function reviewBatchSaveRootRecord(): Record<string, unknown> {
  return {
    action_id: REVIEW_ACTION_ID,
    domain: "transactions",
    id: REVIEW_ACTION_ID,
    payload_hash: "a".repeat(64),
    payload_json: JSON.stringify(reviewBatchSaveEnvelope),
    state: "local_complete",
    user_id: REVIEW_USER_ID,
  };
}

export function reviewBatchSaveChanges(): SyncPushArgs["changes"] {
  return {
    account_financial_effects: reviewAccountFinancialEffectsChanges(),
    accounts: reviewAccountsChanges(),
    financial_action_groups: {
      created: [reviewBatchSaveRootRecord()],
      deleted: [],
      updated: [],
    },
    transactions: reviewTransactionsChanges(),
    transfers: { created: [], deleted: [], updated: [] },
  };
}

export function smsNewBankRootRecord(): Record<string, unknown> {
  return {
    action_id: REVIEW_ACTION_ID,
    domain: "transactions",
    id: REVIEW_ACTION_ID,
    payload_hash: "b".repeat(64),
    payload_json: JSON.stringify(smsNewBankEnvelope),
    state: "local_complete",
    user_id: REVIEW_USER_ID,
  };
}

export function smsNewBankChanges(): SyncPushArgs["changes"] {
  return {
    account_financial_effects: smsAccountFinancialEffectsChanges(),
    accounts: smsAccountsChanges(),
    bank_details: smsBankDetailsChanges(),
    account_sms_senders: smsAccountSmsSendersChanges(),
    financial_action_groups: {
      created: [smsNewBankRootRecord()],
      deleted: [],
      updated: [],
    },
    transactions: smsTransactionsChanges(),
    transfers: { created: [], deleted: [], updated: [] },
  };
}

export function atmTransferRootRecord(): Record<string, unknown> {
  return {
    action_id: REVIEW_ACTION_ID,
    domain: "transactions",
    id: REVIEW_ACTION_ID,
    payload_hash: "c".repeat(64),
    payload_json: JSON.stringify(atmTransferEnvelope),
    state: "local_complete",
    user_id: REVIEW_USER_ID,
  };
}

export function atmTransferChanges(): SyncPushArgs["changes"] {
  return {
    account_financial_effects: atmAccountFinancialEffectsChanges(),
    accounts: atmAccountsChanges(),
    financial_action_groups: {
      created: [atmTransferRootRecord()],
      deleted: [],
      updated: [],
    },
    transactions: { created: [], deleted: [], updated: [] },
    transfers: atmTransfersChanges(),
  };
}

export function legacyRootRecord(): Record<string, unknown> {
  return {
    action_id: REVIEW_ACTION_ID,
    domain: "accounts",
    id: REVIEW_ACTION_ID,
    payload_hash: "d".repeat(64),
    payload_json: JSON.stringify(legacyEditBalanceEnvelope),
    state: "local_complete",
    user_id: REVIEW_USER_ID,
  };
}

export function legacyChanges(): SyncPushArgs["changes"] {
  return {
    account_financial_effects: {
      created: [
        {
          accepted_account_revision: "8",
          account_id: REVIEW_ACCOUNT_ID,
          action_id: REVIEW_ACTION_ID,
          amount_minor_units: "2500",
          currency: "EGP",
          effect_id: REVIEW_EFFECT_ID,
          id: REVIEW_EFFECT_ID,
          is_effective: true,
          reverses_effect_id: null,
        },
      ],
      deleted: [],
      updated: [],
    },
    accounts: {
      created: [],
      deleted: [],
      updated: [
        {
          _changed: "balance,financial_revision",
          _status: "updated",
          balance: 125,
          financial_revision: "8",
          id: REVIEW_ACCOUNT_ID,
        },
      ],
    },
    financial_action_groups: {
      created: [legacyRootRecord()],
      deleted: [],
      updated: [],
    },
    transactions: { created: [], deleted: [], updated: [] },
    transfers: { created: [], deleted: [], updated: [] },
  };
}

export function smsBookkeepingSnapshot(): Record<string, unknown> {
  return {
    createdAt: "2026-09-06T11:00:00.000Z",
    id: SMS_DRAFT_ID,
    parsedAt: "2026-09-06T11:00:00.000Z",
    payloadJson: '{"version":2,"transaction":{},"review":{}}',
    payloadVersion: "5",
    position: "0",
    queueId: SMS_QUEUE_ID,
    selectionOverride: null,
    smsFingerprint: SMS_INCOME_FINGERPRINT,
    updatedAt: "2026-09-06T11:00:00.000Z",
    userId: REVIEW_USER_ID,
  };
}

export function canonicalAbsentAccountIdsOutcome(): Record<string, unknown> {
  return {
    actionId: REVIEW_ACTION_ID,
    canonicalAbsentAccountIds: [NEW_BANK_ACCOUNT_ID],
    code: "ABSENT_CREATE_COLLISION",
    status: "rejected",
  };
}

export function predecessorGatingScenario(): {
  readonly predecessorActionId: string;
  readonly successorActionId: string;
  readonly defaultDependencyActionIds: string[];
} {
  return {
    predecessorActionId: "11111111-1111-4111-8111-111111111112",
    successorActionId: "11111111-1111-4111-8111-111111111113",
    defaultDependencyActionIds: ["11111111-1111-4111-8111-111111111112"],
  };
}

function reviewAccountFinancialEffectsChanges(): SyncTableChangeSet {
  return {
    created: [
      {
        accepted_account_revision: "8",
        account_id: REVIEW_ACCOUNT_ID,
        action_id: REVIEW_ACTION_ID,
        amount_minor_units: "0",
        currency: "EGP",
        effect_id: REVIEW_EFFECT_ID,
        id: REVIEW_EFFECT_ID,
        is_effective: true,
        reverses_effect_id: null,
      },
    ],
    deleted: [],
    updated: [],
  };
}

function reviewAccountsChanges(): SyncTableChangeSet {
  return {
    created: [],
    deleted: [],
    updated: [
      {
        _changed: "balance,financial_revision",
        _status: "updated",
        balance: 125,
        financial_revision: "8",
        id: REVIEW_ACCOUNT_ID,
      },
    ],
  };
}

function reviewIncomeTransaction(): SyncTableChangeSet["created"][number] {
  return {
    _status: "created",
    account_id: REVIEW_ACCOUNT_ID,
    amount: 20.01,
    category_id: REVIEW_CATEGORY_ID,
    counterparty: null,
    created_at: REVIEW_CREATED_AT,
    currency: "EGP",
    date: REVIEW_TRANSACTION_DATE,
    deleted: false,
    id: REVIEW_INCOME_RECORD_ID,
    is_draft: false,
    linked_asset_id: null,
    linked_debt_id: null,
    linked_recurring_id: null,
    note: null,
    sms_fingerprint: null,
    source: "VOICE",
    type: "INCOME",
  };
}

function reviewExpenseTransaction(): SyncTableChangeSet["created"][number] {
  return {
    _status: "created",
    account_id: REVIEW_ACCOUNT_ID,
    amount: 20.01,
    category_id: REVIEW_CATEGORY_ID,
    counterparty: null,
    created_at: REVIEW_CREATED_AT,
    currency: "EGP",
    date: REVIEW_TRANSACTION_DATE,
    deleted: false,
    id: REVIEW_EXPENSE_RECORD_ID,
    is_draft: false,
    linked_asset_id: null,
    linked_debt_id: null,
    linked_recurring_id: null,
    note: null,
    sms_fingerprint: null,
    source: "VOICE",
    type: "EXPENSE",
  };
}

function reviewTransactionsChanges(): SyncTableChangeSet {
  return {
      created: [
        reviewIncomeTransaction(),
        reviewExpenseTransaction(),
      ],
      deleted: [],
      updated: [],
  };
}

function smsAccountFinancialEffectsChanges(): SyncTableChangeSet {
  return {
    created: [
      {
        accepted_account_revision: "1",
        account_id: NEW_BANK_ACCOUNT_ID,
        action_id: REVIEW_ACTION_ID,
        amount_minor_units: "1500",
        currency: "EGP",
        effect_id: SMS_NET_EFFECT_ID,
        id: SMS_NET_EFFECT_ID,
        is_effective: true,
        reverses_effect_id: null,
      },
    ],
    deleted: [],
    updated: [],
  };
}

function smsAccountsChanges(): SyncTableChangeSet {
  return {
    created: [
      {
        _status: "created",
        balance: 15,
        financial_revision: "1",
        id: NEW_BANK_ACCOUNT_ID,
      },
    ],
    deleted: [],
    updated: [],
  };
}

function smsBankDetailsChanges(): SyncTableChangeSet {
  return {
    created: [
      {
        account_id: NEW_BANK_ACCOUNT_ID,
        account_number: null,
        card_last_4: 7,
        created_at: REVIEW_CREATED_AT,
        deleted: false,
        id: BANK_DETAILS_ID,
      },
    ],
    deleted: [],
    updated: [],
  };
}

function smsAccountSmsSendersChanges(): SyncTableChangeSet {
  return {
    created: [
      {
        account_id: NEW_BANK_ACCOUNT_ID,
        created_at: REVIEW_CREATED_AT,
        deleted: false,
        id: ACCOUNT_SMS_SENDER_ID,
        normalized_sender_name: "banksms",
        sender_name: "BankSMS",
      },
    ],
    deleted: [],
    updated: [],
  };
}

function smsIncomeTransaction(): SyncTableChangeSet["created"][number] {
  return {
    _status: "created",
    account_id: NEW_BANK_ACCOUNT_ID,
    amount: 20.01,
    category_id: SMS_CATEGORY_INCOME_ID,
    counterparty: null,
    created_at: REVIEW_CREATED_AT,
    currency: "EGP",
    date: REVIEW_TRANSACTION_DATE,
    deleted: false,
    id: SMS_INCOME_RECORD_ID,
    is_draft: false,
    linked_asset_id: null,
    linked_debt_id: null,
    linked_recurring_id: null,
    note: null,
    sms_fingerprint: SMS_INCOME_FINGERPRINT,
    source: "SMS",
    type: "INCOME",
  };
}

function smsExpenseTransaction(): SyncTableChangeSet["created"][number] {
  return {
    _status: "created",
    account_id: NEW_BANK_ACCOUNT_ID,
    amount: 5.01,
    category_id: SMS_CATEGORY_EXPENSE_ID,
    counterparty: null,
    created_at: REVIEW_CREATED_AT,
    currency: "EGP",
    date: REVIEW_TRANSACTION_DATE,
    deleted: false,
    id: SMS_EXPENSE_RECORD_ID,
    is_draft: false,
    linked_asset_id: null,
    linked_debt_id: null,
    linked_recurring_id: null,
    note: null,
    sms_fingerprint: SMS_EXPENSE_FINGERPRINT,
    source: "SMS",
    type: "EXPENSE",
  };
}

function smsTransactionsChanges(): SyncTableChangeSet {
  return {
      created: [
        smsIncomeTransaction(),
        smsExpenseTransaction(),
      ],
      deleted: [],
      updated: [],
  };
}

function atmAccountFinancialEffectsChanges(): SyncTableChangeSet {
  return {
    created: [
      {
        accepted_account_revision: "8",
        account_id: ATM_BANK_ACCOUNT_ID,
        action_id: REVIEW_ACTION_ID,
        amount_minor_units: "-2505",
        currency: "EGP",
        effect_id: ATM_SOURCE_EFFECT_ID,
        id: ATM_SOURCE_EFFECT_ID,
        is_effective: true,
        reverses_effect_id: null,
      },
      {
        accepted_account_revision: "8",
        account_id: ATM_CASH_ACCOUNT_ID,
        action_id: REVIEW_ACTION_ID,
        amount_minor_units: "2505",
        currency: "EGP",
        effect_id: ATM_DEST_EFFECT_ID,
        id: ATM_DEST_EFFECT_ID,
        is_effective: true,
        reverses_effect_id: null,
      },
    ],
    deleted: [],
    updated: [],
  };
}

function atmAccountsChanges(): SyncTableChangeSet {
  return {
    created: [],
    deleted: [],
    updated: [
      {
        _changed: "balance,financial_revision",
        _status: "updated",
        balance: 74.95,
        financial_revision: "8",
        id: ATM_BANK_ACCOUNT_ID,
      },
      {
        _changed: "balance,financial_revision",
        _status: "updated",
        balance: 25.05,
        financial_revision: "8",
        id: ATM_CASH_ACCOUNT_ID,
      },
    ],
  };
}

function atmTransfersChanges(): SyncTableChangeSet {
  return {
    created: [
      {
        _status: "created",
        amount: 25.05,
        converted_amount: null,
        created_at: REVIEW_CREATED_AT,
        currency: "EGP",
        date: REVIEW_TRANSACTION_DATE,
        deleted: false,
        exchange_rate: null,
        from_account_id: ATM_BANK_ACCOUNT_ID,
        id: ATM_TRANSFER_RECORD_ID,
        notes: null,
        sms_fingerprint: ATM_FINGERPRINT,
        to_account_id: ATM_CASH_ACCOUNT_ID,
      },
    ],
    deleted: [],
    updated: [],
  };
}
