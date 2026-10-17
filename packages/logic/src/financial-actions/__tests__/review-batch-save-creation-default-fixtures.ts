/**
 * #395 T046 creation-default regression fixtures. Synthetic input descriptors
 * only: persisted mutation shapes come from the existing canonical test inputs.
 * Nothing here derives authority from account name, group sort or currency.
 */
import {
  parseCanonicalUnsignedIntegerString,
  type FinancialActionEnvelopeV1,
} from "../action-contracts";
import type {
  ReviewBatchSavePayload,
  ReviewMutation,
  ReviewNewAccount,
} from "../review-batch-save-shapes";
import {
  REVIEW_CREATED_AT,
  REVIEW_EXPENSE_RECORD_ID,
  REVIEW_EXPENSE_ROW_ID,
  REVIEW_INCOME_RECORD_ID,
  REVIEW_INCOME_ROW_ID,
  reviewBatchSaveEnvelope,
  reviewBatchSavePayload,
  smsNewBankPayload,
} from "./review-batch-save-fixtures";

export interface CreatedAccountPlan {
  readonly slot: 0 | 1 | 2;
  readonly accountId: string;
  readonly groupId: string;
  readonly accountType: "CASH" | "BANK" | "DIGITAL_WALLET";
  readonly currency: "EGP" | "USD";
  readonly nickname: string;
}

interface SyntheticRow {
  readonly rowId: string;
  readonly recordId: string;
  readonly effectId: string;
  readonly amountMinorUnits: string;
  readonly type: "INCOME" | "EXPENSE";
}

/** Distinct frozen synthetic bank-child IDs keyed by distinct planned row slots. */
const BANK_CHILD_IDS: readonly string[] = [
  "7b000000-0000-4000-8000-000000000001",
  "7b000000-0000-4000-8000-000000000002",
  "7b000000-0000-4000-8000-000000000003",
];

const ROWS: readonly SyntheticRow[] = [
  {
    rowId: REVIEW_INCOME_ROW_ID,
    recordId: REVIEW_INCOME_RECORD_ID,
    effectId: "8e000000-0000-4000-8000-000000000001",
    amountMinorUnits: "2001",
    type: "INCOME",
  },
  {
    rowId: REVIEW_EXPENSE_ROW_ID,
    recordId: REVIEW_EXPENSE_RECORD_ID,
    effectId: "8e000000-0000-4000-8000-000000000002",
    amountMinorUnits: "3500",
    type: "EXPENSE",
  },
  {
    rowId: "8c000000-0000-4000-8000-000000000013",
    recordId: "8c000000-0000-4000-8000-000000000003",
    effectId: "8e000000-0000-4000-8000-000000000003",
    amountMinorUnits: "501",
    type: "INCOME",
  },
];

function ascii(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function rowFor(plan: CreatedAccountPlan): SyntheticRow {
  const row = ROWS[plan.slot];
  if (!row) throw new Error("Missing synthetic selected row slot");
  return row;
}

/** Frozen actual account IDs, not group IDs, choose the first active default. */
export type CreatedReviewPayload = ReviewBatchSavePayload & {
  readonly creationDefaultSnapshot: NonNullable<
    ReviewBatchSavePayload["creationDefaultSnapshot"]
  >;
};

export function makeVoiceCreationPayload(
  input: readonly CreatedAccountPlan[],
  activeAccountIds: readonly string[] = [],
  existingDefaultId: string | null = null
): CreatedReviewPayload {
  if (
    input.length === 0 ||
    new Set(input.map((p) => p.slot)).size !== input.length
  )
    throw new Error("Expected distinct nonempty synthetic row slots");
  const plans = [...input];
  const sortedAccountIds = plans.map((p) => p.accountId).sort(ascii);
  const firstAccountId = sortedAccountIds[0];
  if (!firstAccountId) throw new Error("Missing new account identity");
  const shouldChooseFirst = activeAccountIds.length === 0;
  const accountTemplate = smsNewBankPayload.domainMutation.records[0];
  const transactionTemplate = reviewBatchSavePayload.domainMutation.records[0];
  const bankChildTemplate = smsNewBankPayload.domainMutation.records[1];
  if (bankChildTemplate.entity !== "bank_details")
    throw new Error("Missing canonical BANK child template");
  const accountRecords: ReviewMutation[] = plans.map((p) => ({
    ...accountTemplate,
    after: {
      ...accountTemplate.after,
      id: p.accountId,
      name: p.nickname,
      type: p.accountType,
      currency: p.currency,
      institutionId: null,
      providerDisplayName: null,
      isDefault: shouldChooseFirst && p.accountId === firstAccountId,
      createdAt: REVIEW_CREATED_AT,
      openingBalanceMinorUnits: "0",
      targetBalanceMinorUnits: null,
    },
  }));
  const financialRecords: ReviewMutation[] = plans.map((p) => {
    const row = rowFor(p);
    return {
      ...transactionTemplate,
      after: {
        ...transactionTemplate.after,
        id: row.recordId,
        accountId: p.accountId,
        currency: p.currency,
        type: row.type,
        amountMinorUnits: row.amountMinorUnits,
      },
    };
  });
  const bankChildRecords: ReviewMutation[] = plans
    .filter((plan) => plan.accountType === "BANK")
    .map((plan): ReviewMutation => {
      const childId = BANK_CHILD_IDS[plan.slot];
      if (!childId) throw new Error("Missing frozen BANK child identity");
      return {
        ...bankChildTemplate,
        after: {
          ...bankChildTemplate.after,
          id: childId,
          accountId: plan.accountId,
          accountNumber: null,
          cardLast4: null,
        },
      };
    });
  const records = [
    ...accountRecords,
    ...bankChildRecords,
    ...financialRecords,
  ].sort((a, b) =>
    ascii(`${a.entity}:${a.after.id}`, `${b.entity}:${b.after.id}`)
  );
  const snapshot: NonNullable<
    ReviewBatchSavePayload["creationDefaultSnapshot"]
  > = {
    activeAccountIds: [...activeAccountIds],
    defaultAccount:
      existingDefaultId === null
        ? null
        : { accountId: existingDefaultId, isDefault: true },
  };
  return {
    ...reviewBatchSavePayload,
    selectedSourceRefs: plans
      .map((p) => ({
        rowId: rowFor(p).rowId,
        recordId: rowFor(p).recordId,
        sourceFingerprint: null,
      }))
      .sort((a, b) => ascii(a.rowId, b.rowId)),
    confirmedGroupRefs: plans
      .map((p) => ({
        groupId: p.groupId,
        revision: "1",
        accountId: p.accountId,
      }))
      .sort((a, b) => ascii(a.groupId, b.groupId)),
    createGuards: records.map((record) => ({
      entity: record.entity,
      id: record.after.id,
      expectedAbsent: true,
    })),
    accountEffects: plans
      .map((p) => {
        const row = rowFor(p);
        return {
          accountId: p.accountId,
          amountMinorUnits:
            row.type === "INCOME"
              ? row.amountMinorUnits
              : `-${row.amountMinorUnits}`,
          currency: p.currency,
          effectId: row.effectId,
        };
      })
      .sort((a, b) => ascii(a.accountId, b.accountId)),
    domainRecordRefs: records.map((record) => record.after.id).sort(ascii),
    domainMutation: { records },
    localSmsBookkeeping: [],
    creationDefaultSnapshot: snapshot,
  };
}

export function createdAccounts(
  payload: CreatedReviewPayload
): readonly ReviewNewAccount[] {
  return payload.domainMutation.records.filter(
    (record): record is ReviewNewAccount => record.entity === "account"
  );
}

export function withDefaultFlags(
  payload: CreatedReviewPayload,
  changes: Readonly<Record<string, boolean>>
): CreatedReviewPayload {
  return {
    ...payload,
    domainMutation: {
      records: payload.domainMutation.records.map(
        (record): ReviewMutation =>
          record.entity === "account"
            ? {
                ...record,
                after: {
                  ...record.after,
                  isDefault: changes[record.after.id] ?? record.after.isDefault,
                },
              }
            : record
      ),
    },
  };
}

export function creationEnvelope(
  payload: CreatedReviewPayload
): FinancialActionEnvelopeV1 {
  const root = payload.selectedSourceRefs
    .map((row) => row.recordId)
    .sort(ascii)[0];
  if (!root) throw new Error("Missing root selected transaction");
  return {
    ...reviewBatchSaveEnvelope,
    domainReferenceId: root,
    accountGuards: createdAccounts(payload)
      .map((account) => ({
        accountId: account.after.id,
        expectedRevision: parseCanonicalUnsignedIntegerString("0"),
      }))
      .sort((a, b) => ascii(a.accountId, b.accountId)),
    payload,
  };
}

export const CASH_EGP: CreatedAccountPlan = {
  slot: 0,
  accountId: "71000000-0000-4000-8000-000000000001",
  groupId: "11000000-0000-4000-8000-000000000001",
  accountType: "CASH",
  currency: "EGP",
  nickname: "Cash EGP",
};
export const CASH_USD: CreatedAccountPlan = {
  slot: 1,
  accountId: "21000000-0000-4000-8000-000000000002",
  groupId: "91000000-0000-4000-8000-000000000002",
  accountType: "CASH",
  currency: "USD",
  nickname: "Cash USD",
};
export const BANK: CreatedAccountPlan = {
  slot: 0,
  accountId: "11000000-0000-4000-8000-000000000003",
  groupId: "91000000-0000-4000-8000-000000000003",
  accountType: "BANK",
  currency: "EGP",
  nickname: "Reviewed Bank",
};
export const CASH: CreatedAccountPlan = {
  slot: 1,
  accountId: "31000000-0000-4000-8000-000000000004",
  groupId: "11000000-0000-4000-8000-000000000004",
  accountType: "CASH",
  currency: "USD",
  nickname: "Reviewed Cash",
};
export const WALLET: CreatedAccountPlan = {
  slot: 2,
  accountId: "51000000-0000-4000-8000-000000000005",
  groupId: "51000000-0000-4000-8000-000000000005",
  accountType: "DIGITAL_WALLET",
  currency: "EGP",
  nickname: "Reviewed Wallet",
};
export const EXISTING_ACCOUNT_ID = "09000000-0000-4000-8000-000000000009";
export const SECOND_EXISTING_ID = "09000000-0000-4000-8000-000000000019";
