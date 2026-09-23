import type { Account, CurrencyType, Transaction } from "@monyvi/db";
import type { Collection, Model } from "@nozbe/watermelondb";
import {
  fromMinorUnits,
  getCurrencyPrecision,
  toMinorUnits,
  type CanonicalJsonValue,
} from "@monyvi/logic";

import type {
  CoreAccountFinancialActionService,
  CoreFinancialActionMutationRecord,
} from "./core-account-financial-action-service";
import {
  assertRawTransactionMatches,
  buildTransactionAfter,
  getExactTransactionMinorUnits,
  prepareFinancialActionTransaction,
  type GuardedTransactionCreateData,
} from "./transaction-financial-action-service";

export const ACCOUNT_CORE_WRITER_ERROR_CODES = {
  AUTH_SCOPE_CHANGED: "account_core_writer_auth_scope_changed",
  DUPLICATE_ACCOUNT: "account_core_writer_duplicate_account",
  INVALID_BALANCE: "account_core_writer_invalid_balance",
  INVALID_PLAN: "account_core_writer_invalid_plan",
  STALE_ACCOUNT_STATE: "account_core_writer_stale_account_state",
  ZERO_DELTA: "account_core_writer_zero_delta",
} as const;

export type AccountCoreWriterErrorCode =
  (typeof ACCOUNT_CORE_WRITER_ERROR_CODES)[keyof typeof ACCOUNT_CORE_WRITER_ERROR_CODES];

export interface AccountCoreCreateInput {
  readonly account: Account;
  readonly prepareInsideWriter: () => Promise<void>;
  readonly userId: string;
}

/**
 * Row metadata the guarded edit may change.
 *
 * Currency, type, balance, and revision are deliberately absent: currency and
 * type are read-only after creation, while balance and revision are owned by
 * the account effect and the command boundary.
 */
export interface AccountMetadataProjection {
  institutionId?: string;
  isDefault: boolean;
  name: string;
  providerDisplayName?: string;
}

export interface AccountCoreEditInput {
  readonly account: Account;
  readonly adjustmentTransaction?: GuardedTransactionCreateData;
  readonly nextBalance: number;
  readonly prepareInsideWriter: () => Promise<void>;
  readonly updateMetadata: (projection: AccountMetadataProjection) => void;
  readonly userId: string;
}

export interface AccountCoreWriterDependencies {
  readonly assertExpectedCurrentUser: (userId: string) => Promise<void>;
  readonly createActionId: () => string;
  readonly createTransactionId: () => string;
  readonly executeCoreFinancialAction: CoreAccountFinancialActionService["execute"];
  readonly now: () => Date;
  readonly transactionsCollection: () => Collection<Transaction>;
}

export interface AccountCoreWriterService {
  readonly create: (input: AccountCoreCreateInput) => Promise<void>;
  readonly edit: (input: AccountCoreEditInput) => Promise<void>;
}

function fail(code: AccountCoreWriterErrorCode): never {
  throw new Error(code);
}

function signedMinorUnits(amount: number, currency: CurrencyType): string {
  if (!Number.isFinite(amount)) {
    fail(ACCOUNT_CORE_WRITER_ERROR_CODES.INVALID_BALANCE);
  }
  const places = getCurrencyPrecision(currency);
  const result = toMinorUnits(String(amount), places);
  if (Number(fromMinorUnits(result, places)) !== amount) {
    fail(ACCOUNT_CORE_WRITER_ERROR_CODES.INVALID_BALANCE);
  }
  return result;
}

function timestamp(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail(ACCOUNT_CORE_WRITER_ERROR_CODES.INVALID_PLAN);
  }
  return value.toISOString();
}

function projectionOf(account: Account): AccountMetadataProjection {
  return {
    institutionId: account.institutionId,
    isDefault: account.isDefault,
    name: account.name,
    providerDisplayName: account.providerDisplayName,
  };
}

function accountAfter(
  account: Account,
  projection: AccountMetadataProjection,
  openingBalanceMinorUnits: string | null,
  targetBalanceMinorUnits: string | null
): Readonly<Record<string, CanonicalJsonValue>> {
  return {
    createdAt: timestamp(account.createdAt),
    currency: account.currency,
    deleted: account.deleted,
    id: account.id,
    institutionId: projection.institutionId ?? null,
    isDefault: projection.isDefault,
    name: projection.name,
    openingBalanceMinorUnits,
    providerDisplayName: projection.providerDisplayName ?? null,
    targetBalanceMinorUnits,
    type: account.type,
  };
}

function assertAccountModel(model: Model, account: Account): Account {
  if (model !== account || model.table !== "accounts") {
    fail(ACCOUNT_CORE_WRITER_ERROR_CODES.INVALID_PLAN);
  }
  return model as Account;
}

/**
 * Prepares the optional balance-adjustment transaction as canonical domain
 * evidence inside the same guarded group. The prepared model commits
 * atomically with the account effect, appears in the action envelope, and
 * stays linked for replay, sync, and rejection reconciliation — unlike a
 * hook side-effect write, which the envelope cannot see.
 */
function adjustmentTransactionMutation(
  data: GuardedTransactionCreateData,
  userId: string,
  transactionsCollection: () => Collection<Transaction>,
  createTransactionId: () => string
): CoreFinancialActionMutationRecord {
  const adjustment = prepareFinancialActionTransaction(
    transactionsCollection(),
    data,
    userId,
    createTransactionId()
  );
  const after = buildTransactionAfter(
    adjustment,
    getExactTransactionMinorUnits(data)
  );
  return {
    after,
    assertPostimage: (raw): void => assertRawTransactionMatches(raw, after),
    entity: "transaction",
    expectedUpdatedAt: null,
    mode: "create",
    model: adjustment,
  };
}

export function createAccountCoreWriterService(
  dependencies: AccountCoreWriterDependencies
): AccountCoreWriterService {
  return {
    create: async (input: AccountCoreCreateInput): Promise<void> => {
      await dependencies.assertExpectedCurrentUser(input.userId);
      if (input.account._preparedState !== "create") {
        fail(ACCOUNT_CORE_WRITER_ERROR_CODES.INVALID_PLAN);
      }
      const amountMinorUnits = signedMinorUnits(
        input.account.balance,
        input.account.currency
      );
      if (amountMinorUnits === "0") {
        fail(ACCOUNT_CORE_WRITER_ERROR_CODES.ZERO_DELTA);
      }
      const mutation: CoreFinancialActionMutationRecord = {
        after: accountAfter(
          input.account,
          projectionOf(input.account),
          amountMinorUnits,
          null
        ),
        entity: "account",
        expectedUpdatedAt: null,
        mode: "create",
        model: input.account,
      };
      await dependencies.executeCoreFinancialAction({
        accountEffects: [{ account: input.account, amountMinorUnits }],
        actionId: dependencies.createActionId(),
        domain: "accounts",
        domainReferenceId: input.account.id,
        kind: "create",
        mutationRecords: [mutation],
        occurredAt: dependencies.now().toISOString(),
        operationCode: "account.create",
        prepareInsideWriter: input.prepareInsideWriter,
        userId: input.userId,
      });
      await dependencies.assertExpectedCurrentUser(input.userId);
    },

    edit: async (input: AccountCoreEditInput): Promise<void> => {
      await dependencies.assertExpectedCurrentUser(input.userId);
      const currentMinorUnits = signedMinorUnits(
        input.account.balance,
        input.account.currency
      );
      const targetMinorUnits = signedMinorUnits(
        input.nextBalance,
        input.account.currency
      );
      const delta = (
        BigInt(targetMinorUnits) - BigInt(currentMinorUnits)
      ).toString();
      if (delta === "0") {
        fail(ACCOUNT_CORE_WRITER_ERROR_CODES.ZERO_DELTA);
      }
      const projection = projectionOf(input.account);
      input.updateMetadata(projection);
      const mutation: CoreFinancialActionMutationRecord = {
        after: accountAfter(input.account, projection, null, targetMinorUnits),
        entity: "account",
        expectedUpdatedAt: timestamp(input.account.updatedAt),
        mode: "update",
        model: input.account,
        update: (model): void => {
          const record = assertAccountModel(model, input.account);
          record.name = projection.name;
          record.isDefault = projection.isDefault;
          record.institutionId = projection.institutionId;
          record.providerDisplayName = projection.providerDisplayName;
        },
      };
      const mutationRecords: CoreFinancialActionMutationRecord[] = [mutation];
      if (input.adjustmentTransaction) {
        mutationRecords.push(
          adjustmentTransactionMutation(
            input.adjustmentTransaction,
            input.userId,
            dependencies.transactionsCollection,
            dependencies.createTransactionId
          )
        );
      }
      await dependencies.executeCoreFinancialAction({
        accountEffects: [{ account: input.account, amountMinorUnits: delta }],
        actionId: dependencies.createActionId(),
        domain: "accounts",
        domainReferenceId: input.account.id,
        kind: "edit_balance",
        mutationRecords,
        occurredAt: dependencies.now().toISOString(),
        operationCode: "account.edit-balance",
        prepareInsideWriter: input.prepareInsideWriter,
        userId: input.userId,
      });
      await dependencies.assertExpectedCurrentUser(input.userId);
    },
  };
}
