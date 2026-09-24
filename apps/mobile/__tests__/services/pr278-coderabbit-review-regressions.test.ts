import type { SyncPushArgs } from "@nozbe/watermelondb/sync";

import {
  assertRawTransactionMatches,
  formatFinancialActionLocalDate,
  type TransactionAfter,
} from "../../services/transaction-financial-action-service";
import {
  assertRawTransferMatches,
  type TransferAfter,
} from "../../services/transfer-financial-action-evidence";
import { collectProtectedFinancialActionRowIds } from "../../services/sync/account-protected-fields";
import { createFinancialActionPushCoordinator } from "../../services/financial-action-sync-service";

const ACTION_ID = "10000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "30000000-0000-4000-8000-000000000003";
const TRANSACTION_ID = "40000000-0000-4000-8000-000000000004";
const TRANSFER_ID = "50000000-0000-4000-8000-000000000005";
const CATEGORY_ID = "60000000-0000-4000-8000-000000000006";

function localAfternoon(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 14, 30, 45);
}

function transactionExpected(date: Date): TransactionAfter {
  return {
    accountId: ACCOUNT_ID,
    amountMinorUnits: "20000",
    categoryId: CATEGORY_ID,
    counterparty: null,
    createdAt: "2026-09-01T12:00:00.000Z",
    currency: "EGP",
    date: formatFinancialActionLocalDate(date),
    deleted: false,
    id: TRANSACTION_ID,
    isDraft: false,
    linkedAssetId: null,
    linkedDebtId: null,
    linkedRecurringId: null,
    note: null,
    smsFingerprint: null,
    source: "MANUAL",
    type: "EXPENSE",
  };
}

function transactionRaw(date: Date): Record<string, unknown> {
  return {
    account_id: ACCOUNT_ID,
    amount: 200,
    category_id: CATEGORY_ID,
    counterparty: null,
    created_at: Date.parse("2026-09-01T12:00:00.000Z"),
    currency: "EGP",
    date: date.getTime(),
    deleted: false,
    is_draft: false,
    linked_asset_id: null,
    linked_debt_id: null,
    linked_recurring_id: null,
    note: null,
    sms_fingerprint: null,
    source: "MANUAL",
    type: "EXPENSE",
  };
}

function transferExpected(date: Date): TransferAfter {
  return {
    amountMinorUnits: "20000",
    convertedAmountMinorUnits: null,
    createdAt: "2026-09-01T12:00:00.000Z",
    currency: "EGP",
    date: formatFinancialActionLocalDate(date),
    deleted: false,
    exchangeRate: null,
    fromAccountId: ACCOUNT_ID,
    id: TRANSFER_ID,
    notes: null,
    smsFingerprint: null,
    toAccountId: "70000000-0000-4000-8000-000000000007",
  };
}

function transferRaw(date: Date): Record<string, unknown> {
  return {
    amount: 200,
    converted_amount: null,
    created_at: Date.parse("2026-09-01T12:00:00.000Z"),
    currency: "EGP",
    date: date.getTime(),
    deleted: false,
    exchange_rate: null,
    from_account_id: ACCOUNT_ID,
    notes: null,
    sms_fingerprint: null,
    to_account_id: "70000000-0000-4000-8000-000000000007",
  };
}

describe("PR278 CodeRabbit review regressions", () => {
  it("accepts a non-midnight transaction timestamp on the same local day", () => {
    const date = localAfternoon(2026, 8, 1);
    expect(() =>
      assertRawTransactionMatches(
        transactionRaw(date) as never,
        transactionExpected(date)
      )
    ).not.toThrow();
  });

  it("rejects a transaction timestamp on a different local day", () => {
    const stored = localAfternoon(2026, 8, 2);
    const expected = transactionExpected(localAfternoon(2026, 8, 1));
    expect(() =>
      assertRawTransactionMatches(transactionRaw(stored) as never, expected)
    ).toThrow();
  });

  it("accepts a non-midnight transfer timestamp on the same local day", () => {
    const date = localAfternoon(2026, 8, 1);
    expect(() =>
      assertRawTransferMatches(
        transferRaw(date) as never,
        transferExpected(date),
        "EGP",
        "transfer_invalid_plan"
      )
    ).not.toThrow();
  });

  it("rejects a transfer timestamp on a different local day", () => {
    const stored = localAfternoon(2026, 8, 2);
    const expected = transferExpected(localAfternoon(2026, 8, 1));
    expect(() =>
      assertRawTransferMatches(
        transferRaw(stored) as never,
        expected,
        "EGP",
        "transfer_invalid_plan"
      )
    ).toThrow();
  });

  it("leaves effect-free revision-zero account creates on the generic sync path", () => {
    const changes = {
      accounts: {
        created: [
          {
            id: ACCOUNT_ID,
            _status: "created",
            _changed: "name",
            balance: 0,
            financial_revision: "0",
          },
        ],
        updated: [],
        deleted: [],
      },
    } as unknown as SyncPushArgs["changes"];
    expect(collectProtectedFinancialActionRowIds(changes)).toBeUndefined();
  });

  it("still protects created accounts carrying a non-zero balance", () => {
    const changes = {
      accounts: {
        created: [
          {
            id: ACCOUNT_ID,
            _status: "created",
            _changed: "name",
            balance: 100,
            financial_revision: "1",
          },
        ],
        updated: [],
        deleted: [],
      },
    } as unknown as SyncPushArgs["changes"];
    expect(collectProtectedFinancialActionRowIds(changes)).toEqual({
      accounts: [ACCOUNT_ID],
    });
  });

  it("recovers instead of aborting when reconciliation throws", async () => {
    const coordinator = createFinancialActionPushCoordinator({
      invokeAccountFinancialActionRpc: jest.fn(),
      markFinancialActionGroupSyncFailed: jest.fn(),
      markFinancialActionGroupSyncPending: jest.fn(),
      recordFinancialActionGroupServerOutcome: jest.fn(),
      reconcileFinancialActionGroup: jest.fn(() =>
        Promise.reject(new Error("reconciliation_incomplete"))
      ),
    });
    const result = await coordinator.coordinatePush([
      {
        actionId: ACTION_ID,
        payloadHash: "a".repeat(64),
        payloadJson: '{"pending":true}',
        state: "reconciliation_incomplete",
      },
    ]);
    expect(result.decisions).toEqual([
      { actionId: ACTION_ID, disposition: "recover", outcome: null },
    ]);
  });

  it("recovers a stale outcome when post-decision reconciliation throws", async () => {
    const coordinator = createFinancialActionPushCoordinator({
      invokeAccountFinancialActionRpc: jest.fn(() =>
        Promise.resolve({
          actionId: ACTION_ID,
          code: "ACCOUNT_REVISION_STALE",
          status: "stale",
        })
      ),
      markFinancialActionGroupSyncFailed: jest.fn(),
      markFinancialActionGroupSyncPending: jest.fn(),
      recordFinancialActionGroupServerOutcome: jest.fn(),
      reconcileFinancialActionGroup: jest.fn(() =>
        Promise.reject(new Error("reconciliation_incomplete"))
      ),
    });
    const result = await coordinator.coordinatePush([
      {
        actionId: ACTION_ID,
        payloadHash: "a".repeat(64),
        payloadJson: '{"pending":true}',
        state: "sync_pending",
      },
    ]);
    expect(result.decisions[0]?.disposition).toBe("recover");
  });
});
