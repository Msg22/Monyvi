import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SyncPushArgs } from "@nozbe/watermelondb/sync";
import { canonicalizeFinancialActionEnvelope } from "@monyvi/logic";

import {
  createFinancialActionReconciliationService,
  type FinancialActionReconciliationBundle,
} from "@/services/financial-action-reconciliation-service";
import {
  createFinancialActionPushCoordinator,
  type FinancialActionPushCandidate,
} from "@/services/financial-action-sync-service";
import { collectAccountFinancialActionPushBundles } from "@/services/sync/account-protected-fields";
import { validateTransactionForm } from "@/validation/transaction-validation";

const ROOT = resolve(__dirname, "../../../..");
const ACTION_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000002";
const ACCOUNT_ID = "30000000-0000-4000-8000-000000000003";
const EFFECT_ID = "40000000-0000-4000-8000-000000000004";
const TRANSACTION_ID = "70000000-0000-4000-8000-000000000007";

interface TestFinancialActionEnvelope extends Readonly<Record<string, unknown>> {
  readonly payload: Readonly<Record<string, unknown>> & {
    readonly domainRecordRefs: readonly string[];
  };
}

function source(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function pushChanges(
  roots: ReadonlyArray<Readonly<Record<string, unknown>>>
): SyncPushArgs["changes"] {
  return {
    account_financial_effects: { created: [], deleted: [], updated: [] },
    financial_action_groups: {
      created: [...roots],
      deleted: [],
      updated: [],
    },
  } as unknown as SyncPushArgs["changes"];
}

function validEnvelope(): TestFinancialActionEnvelope {
  return {
    accountGuards: [{ accountId: ACCOUNT_ID, expectedRevision: "0" }],
    actionId: ACTION_ID,
    domain: "transactions",
    domainReferenceId: TRANSACTION_ID,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "create",
    occurredAt: "2026-09-10T12:00:00.000Z",
    payload: {
      accountEffects: [
        {
          accountId: ACCOUNT_ID,
          amountMinorUnits: "-100",
          currency: "EGP",
        },
      ],
      domainMutation: {
        records: [
          {
            after: {
              accountId: ACCOUNT_ID,
              amountMinorUnits: "100",
              categoryId: "80000000-0000-4000-8000-000000000008",
              counterparty: null,
              createdAt: "2026-09-10T12:00:00.000Z",
              currency: "EGP",
              date: "2026-09-10",
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
            },
            entity: "transaction",
            expectedUpdatedAt: null,
            mode: "create",
          },
        ],
      },
      domainRecordRefs: [TRANSACTION_ID],
      operationCode: "transaction.create",
      schemaVersion: "account.balance-effects/v1",
    },
    payloadVersion: "account.balance-effects/v1",
    userId: USER_ID,
  };
}

function rejectedBundle(): FinancialActionReconciliationBundle & {
  readonly canonicalAccounts: ReadonlyArray<{
    readonly accountId: string;
    readonly balanceMinorUnits: string;
    readonly canonicalActionId: string;
    readonly canonicalEvidenceHash: string;
    readonly canonicalRevision: string;
    readonly currency: string;
    readonly effectChain: ReadonlyArray<{
      readonly acceptedRevision: string;
      readonly actionId: string;
      readonly amountMinorUnits: string;
      readonly effectEvidenceHash: string;
      readonly effectId: string;
      readonly kind: string;
    }>;
  }>;
} {
  return {
    accounts: [
      {
        accountId: ACCOUNT_ID,
        balance: 125,
        currency: "EGP",
        financialRevision: "8",
      },
    ],
    actionId: ACTION_ID,
    canonicalAccounts: [
      {
        accountId: ACCOUNT_ID,
        balanceMinorUnits: "11000",
        canonicalActionId: "90000000-0000-4000-8000-000000000009",
        canonicalEvidenceHash: "d".repeat(64),
        canonicalRevision: "8",
        currency: "EGP",
        effectChain: [
          {
            acceptedRevision: "8",
            actionId: "90000000-0000-4000-8000-000000000009",
            amountMinorUnits: "1000",
            effectEvidenceHash: "e".repeat(64),
            effectId: "91000000-0000-4000-8000-000000000009",
            kind: "transaction.create",
          },
        ],
      },
    ],
    domain: "transactions",
    effects: [
      {
        acceptedAccountRevision: "8",
        accountId: ACCOUNT_ID,
        actionId: ACTION_ID,
        amountMinorUnits: "2500",
        currency: "EGP",
        effectId: EFFECT_ID,
        isEffective: true,
        reversesEffectId: null,
      },
    ],
    localSmsReviewDraftSnapshot: null,
    payloadJson: "{}",
    state: "rejected_compensating",
    userId: USER_ID,
  };
}

describe("issue #242 recovery-wave client contracts", () => {
  it("fails closed when a guarded financial-action root is malformed", () => {
    const malformedRoot = {
      action_id: ACTION_ID,
      id: `root-${ACTION_ID}`,
      payload_hash: "a".repeat(64),
      payload_json: '{"accountGuards":[',
      state: "local_complete",
    };

    expect(() =>
      collectAccountFinancialActionPushBundles(pushChanges([malformedRoot]))
    ).toThrow("account_financial_action_malformed_root");
  });

  it("routes reconciliation-incomplete candidates to recovery without illegal resubmission", async () => {
    const invokeRpc = jest.fn().mockResolvedValue({
      actionId: ACTION_ID,
      status: "accepted",
    });
    const markPending = jest.fn().mockResolvedValue(undefined);
    const recover = jest.fn().mockResolvedValue(undefined);
    const dependencies = {
      invokeAccountFinancialActionRpc: invokeRpc,
      markFinancialActionGroupSyncFailed: jest.fn().mockResolvedValue(undefined),
      markFinancialActionGroupSyncPending: markPending,
      reconcileFinancialActionGroup: recover,
      recordFinancialActionGroupServerOutcome: jest
        .fn()
        .mockResolvedValue(undefined),
    } satisfies Parameters<typeof createFinancialActionPushCoordinator>[0] & {
      readonly reconcileFinancialActionGroup: (
        actionId: string
      ) => Promise<void>;
    };
    const candidate: FinancialActionPushCandidate = {
      actionId: ACTION_ID,
      payloadHash: "a".repeat(64),
      payloadJson: "{}",
      state: "reconciliation_incomplete",
    };

    const result = await createFinancialActionPushCoordinator(
      dependencies
    ).coordinatePush([candidate]);

    expect(markPending).not.toHaveBeenCalled();
    expect(invokeRpc).not.toHaveBeenCalled();
    expect(recover).toHaveBeenCalledWith(ACTION_ID);
    expect(result.decisions).toEqual([
      {
        actionId: ACTION_ID,
        disposition: "recover",
        outcome: null,
      },
    ]);
  });

  it("installs the verified canonical account snapshot without advancing the losing revision", async () => {
    const commit = jest.fn().mockResolvedValue(undefined);
    const service = createFinancialActionReconciliationService({
      commitCompensationAtomically: commit,
      hashProvider: { digestUtf8: () => Promise.resolve("f".repeat(64)) },
      loadReconciliationBundle: () => Promise.resolve(rejectedBundle()),
    });

    await expect(service.reconcileRejectedAction(ACTION_ID)).resolves.toBe(
      "reconciled"
    );
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        accountMutations: [
          expect.objectContaining({
            accountId: ACCOUNT_ID,
            expectedRevision: "8",
            nextBalance: 110,
            nextRevision: "8",
          }),
        ],
      })
    );
  });

  it("rejects an extra domain reference that has no mutation record", () => {
    const envelope = validEnvelope();

    expect(() =>
      canonicalizeFinancialActionEnvelope({
        ...envelope,
        payload: {
          ...envelope.payload,
          domainRecordRefs: [
            TRANSACTION_ID,
            "70000000-0000-4000-8000-000000000008",
          ],
        },
      })
    ).toThrow();
  });

  it("rejects excess currency precision at the field boundary", () => {
    const formData = {
      accountId: ACCOUNT_ID,
      amount: "1.001",
      categoryId: "80000000-0000-4000-8000-000000000008",
      currency: "EGP",
    };
    const messages = {
      accountRequired: "Account is required",
      amountPrecision: "Amount supports at most 2 decimal places",
      destinationAccountRequired: "Destination account is required",
      sourceAccountRequired: "Source account is required",
    };

    expect(validateTransactionForm("EXPENSE", formData, messages)).toEqual({
      errors: { amount: messages.amountPrecision },
      isValid: false,
    });
  });

  it("wires the real recurring Pay Now entry point to the guarded command", () => {
    const recurringService = source(
      "apps/mobile/services/recurring-payment-service.ts"
    );

    expect(recurringService).toContain("submitGuardedRecurringPayment");
    expect(recurringService).toMatch(
      /export\s+async\s+function\s+submitRecurringPayment[\s\S]*submitGuardedRecurringPayment/
    );
  });

  it("pulls exact account revisions and immutable effects through dedicated sync", () => {
    const pullStrategies = source(
      "apps/mobile/services/sync/pull-strategies.ts"
    );

    expect(pullStrategies).toContain('"account_financial_effects"');
    expect(pullStrategies).toContain(
      "financial_revision:financial_revision::text"
    );
    expect(pullStrategies).toContain(
      "accepted_account_revision:accepted_account_revision::text"
    );
  });

  it("uses the blocked writer registry as a production sync gate", () => {
    const protectedFields = source(
      "apps/mobile/services/sync/account-protected-fields.ts"
    );

    expect(protectedFields).toContain("ACCOUNT_BALANCE_WRITER_REGISTRY");
    expect(protectedFields).toContain("account_balance_writer_blocked");
  });

  it("initializes every currently writable account constructor at revision zero", () => {
    const accountService = source("apps/mobile/services/account-service.ts");
    const pendingAccountService = source(
      "apps/mobile/services/pending-account-service.ts"
    );

    expect(accountService.match(/financialRevision\s*=\s*["']0["']/g)).toHaveLength(
      4
    );
    expect(pendingAccountService).toContain('financialRevision = "0"');
  });
});
