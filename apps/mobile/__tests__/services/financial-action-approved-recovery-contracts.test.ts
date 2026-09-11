import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SyncPushArgs } from "@nozbe/watermelondb/sync";
import { canonicalizeFinancialActionEnvelope } from "@monyvi/logic";

import {
  createFinancialActionReconciliationService,
  type FinancialActionReconciliationBundle,
} from "../../services/financial-action-reconciliation-service";
import {
  createFinancialActionPushCoordinator,
  type FinancialActionPushCandidate,
} from "../../services/financial-action-sync-service";
import {
  collectAccountFinancialActionPushBundles,
  collectProtectedFinancialActionRowIds,
  readRejectedIdsForTable,
} from "../../services/sync/account-protected-fields";
import { validateTransactionForm } from "../../validation/transaction-validation";

const ROOT = resolve(__dirname, "../../../..");
const USER_ID = "018f0c7a-1234-7abc-8def-000000000101";
const ACCOUNT_ID = "018f0c7a-1234-7abc-8def-000000000211";
const ACTION_ID = "018f0c7a-1234-7abc-8def-000000000311";
const WINNER_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000312";
const TRANSACTION_ID = "018f0c7a-1234-7abc-8def-000000001301";
const RECURRING_ID = "018f0c7a-1234-7abc-8def-000000001401";
const EFFECT_ID = "018f0c7a-1234-4abc-8def-000000001501";
const WINNER_EFFECT_ID = "018f0c7a-1234-4abc-8def-000000001502";
const HASH = "a".repeat(64);
const EFFECT_HASH = "b".repeat(64);

interface CanonicalEffectEvidence {
  readonly acceptedRevision: string;
  readonly actionId: string;
  readonly amountMinorUnits: string;
  readonly effectEvidenceHash: string;
  readonly effectId: string;
  readonly kind: string;
}

interface CanonicalAccountEvidence {
  readonly accountId: string;
  readonly balanceMinorUnits: string;
  readonly canonicalActionId: string;
  readonly canonicalEvidenceHash: string;
  readonly canonicalRevision: string;
  readonly currency: string;
  readonly effectChain: readonly CanonicalEffectEvidence[];
}

type CanonicalReconciliationBundle = FinancialActionReconciliationBundle & {
  readonly canonicalAccounts: readonly CanonicalAccountEvidence[];
};

interface CoordinatorHarness {
  readonly dependencies: Parameters<
    typeof createFinancialActionPushCoordinator
  >[0] & {
    readonly reconcileFinancialActionGroup: (
      actionId: string
    ) => Promise<"incomplete" | "reconciled">;
  };
  readonly invokeRpc: jest.Mock;
  readonly markPending: jest.Mock;
  readonly reconcile: jest.Mock;
  readonly recordOutcome: jest.Mock;
}

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function transactionAfter(sourceName: "MANUAL" | "RECURRING"): Readonly<
  Record<string, unknown>
> {
  return {
    accountId: ACCOUNT_ID,
    amountMinorUnits: "100",
    categoryId: "018f0c7a-1234-7abc-8def-000000001601",
    counterparty: null,
    createdAt: "2026-09-06T11:00:00.000Z",
    currency: "EGP",
    date: "2026-09-06",
    deleted: false,
    id: TRANSACTION_ID,
    isDraft: false,
    linkedAssetId: null,
    linkedDebtId: null,
    linkedRecurringId: sourceName === "RECURRING" ? RECURRING_ID : null,
    note: null,
    smsFingerprint: null,
    source: sourceName,
    type: sourceName === "RECURRING" ? "EXPENSE" : "INCOME",
  };
}

function accountEnvelope(includeEffectId: boolean): Readonly<
  Record<string, unknown>
> {
  return {
    accountGuards: [{ accountId: ACCOUNT_ID, expectedRevision: "7" }],
    actionId: ACTION_ID,
    domain: "transactions",
    domainReferenceId: TRANSACTION_ID,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "create",
    occurredAt: "2026-09-06T11:00:00.000Z",
    payload: {
      accountEffects: [
        {
          accountId: ACCOUNT_ID,
          amountMinorUnits: "100",
          currency: "EGP",
          ...(includeEffectId ? { effectId: EFFECT_ID } : {}),
        },
      ],
      domainMutation: {
        records: [
          {
            after: transactionAfter("MANUAL"),
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

function recurringEnvelope(): Readonly<Record<string, unknown>> {
  return {
    accountGuards: [{ accountId: ACCOUNT_ID, expectedRevision: "7" }],
    actionId: ACTION_ID,
    domain: "recurring_payments",
    domainReferenceId: RECURRING_ID,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "pay_now",
    occurredAt: "2026-09-06T11:00:00.000Z",
    payload: {
      accountEffects: [
        {
          accountId: ACCOUNT_ID,
          amountMinorUnits: "-100",
          currency: "EGP",
          effectId: EFFECT_ID,
        },
      ],
      domainMutation: {
        records: [
          {
            after: {
              financialRevision: "5",
              id: RECURRING_ID,
              nextDueDate: "2026-10-06",
              status: "ACTIVE",
            },
            entity: "recurring_payment",
            expectedRevision: "4",
            mode: "update",
          },
          {
            after: transactionAfter("RECURRING"),
            entity: "transaction",
            expectedUpdatedAt: null,
            mode: "create",
          },
        ],
      },
      domainRecordRefs: [RECURRING_ID, TRANSACTION_ID].sort(),
      operationCode: "recurring.pay-now",
      schemaVersion: "account.balance-effects/v1",
    },
    payloadVersion: "account.balance-effects/v1",
    userId: USER_ID,
  };
}

function changes(input?: {
  readonly accounts?: Array<Record<string, unknown>>;
  readonly roots?: Array<Record<string, unknown>>;
}): SyncPushArgs["changes"] {
  return {
    account_financial_effects: { created: [], deleted: [], updated: [] },
    accounts: {
      created: [],
      deleted: [],
      updated: input?.accounts ?? [],
    },
    financial_action_groups: {
      created: input?.roots ?? [],
      deleted: [],
      updated: [],
    },
  };
}

function rootRecord(payload: unknown): Record<string, unknown> {
  return {
    action_id: ACTION_ID,
    domain: "transactions",
    id: ACTION_ID,
    payload_hash: HASH,
    payload_json:
      typeof payload === "string" ? payload : JSON.stringify(payload),
    state: "local_complete",
    user_id: USER_ID,
  };
}

function coordinatorHarness(input?: {
  readonly outcome?: Readonly<Record<string, unknown>>;
  readonly reconciliationResult?: "incomplete" | "reconciled";
}): CoordinatorHarness {
  const invokeRpc = jest.fn().mockResolvedValue(
    input?.outcome ?? {
      actionId: ACTION_ID,
      status: "accepted",
    }
  );
  const markPending = jest.fn().mockResolvedValue(undefined);
  const recordOutcome = jest.fn().mockResolvedValue(undefined);
  const reconcile = jest
    .fn()
    .mockResolvedValue(input?.reconciliationResult ?? "reconciled");

  return {
    dependencies: {
      invokeAccountFinancialActionRpc: invokeRpc,
      markFinancialActionGroupSyncFailed: jest.fn().mockResolvedValue(undefined),
      markFinancialActionGroupSyncPending: markPending,
      reconcileFinancialActionGroup: reconcile,
      recordFinancialActionGroupServerOutcome: recordOutcome,
    },
    invokeRpc,
    markPending,
    reconcile,
    recordOutcome,
  };
}

function canonicalReconciliationBundle(): CanonicalReconciliationBundle {
  return {
    accounts: [
      {
        accountId: ACCOUNT_ID,
        balance: 125,
        currency: "EGP",
        financialRevision: "9",
      },
    ],
    actionId: ACTION_ID,
    canonicalAccounts: [
      {
        accountId: ACCOUNT_ID,
        balanceMinorUnits: "11000",
        canonicalActionId: WINNER_ACTION_ID,
        canonicalEvidenceHash: HASH,
        canonicalRevision: "8",
        currency: "EGP",
        effectChain: [
          {
            acceptedRevision: "8",
            actionId: WINNER_ACTION_ID,
            amountMinorUnits: "1000",
            effectEvidenceHash: EFFECT_HASH,
            effectId: WINNER_EFFECT_ID,
            kind: "transaction.create",
          },
        ],
      },
    ],
    domain: "transactions",
    effects: [
      {
        acceptedAccountRevision: "9",
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

describe("PR #278 approved financial-action recovery contracts", () => {
  describe("canonical identity and recurring revision", () => {
    it("accepts a locally generated effect UUID in the canonical payload", () => {
      expect(() =>
        canonicalizeFinancialActionEnvelope(accountEnvelope(true))
      ).not.toThrow();
    });

    it("rejects an account effect that omits its stable UUID", () => {
      expect(() =>
        canonicalizeFinancialActionEnvelope(accountEnvelope(false))
      ).toThrow();
    });

    it("accepts a monotonic recurring revision token without timestamp CAS", () => {
      expect(() =>
        canonicalizeFinancialActionEnvelope(recurringEnvelope())
      ).not.toThrow();
    });
  });

  describe("push quarantine and recovery dispositions", () => {
    it("aborts when an account-action root is malformed", () => {
      expect(() =>
        collectAccountFinancialActionPushBundles(
          changes({ roots: [rootRecord("{malformed-json")] })
        )
      ).toThrow("account_financial_action_malformed_root");
    });

    it("keeps an unguarded account balance mutation dirty", () => {
      const protectedIds = collectProtectedFinancialActionRowIds(
        changes({
          accounts: [
            {
              _changed: "balance,financial_revision",
              _status: "updated",
              balance: 125,
              financial_revision: "8",
              id: ACCOUNT_ID,
            },
          ],
        })
      );

      expect(readRejectedIdsForTable(protectedIds, "accounts")).toEqual([
        ACCOUNT_ID,
      ]);
    });

    it("routes reconciliation_incomplete to recovery without resubmission", async () => {
      const harness = coordinatorHarness();
      const candidate: FinancialActionPushCandidate = {
        actionId: ACTION_ID,
        payloadHash: HASH,
        payloadJson: "{}",
        state: "reconciliation_incomplete",
      };

      const result = await createFinancialActionPushCoordinator(
        harness.dependencies
      ).coordinatePush([candidate]);

      expect(harness.markPending).not.toHaveBeenCalled();
      expect(harness.invokeRpc).not.toHaveBeenCalled();
      expect(harness.reconcile).toHaveBeenCalledWith(ACTION_ID);
      expect(result.decisions).toEqual([
        {
          actionId: ACTION_ID,
          disposition: "acknowledge",
          outcome: null,
        },
      ]);
    });

    it("reconciles a stale result before acknowledging its local bundle", async () => {
      const harness = coordinatorHarness({
        outcome: {
          actionId: ACTION_ID,
          canonicalAccounts: canonicalReconciliationBundle().canonicalAccounts,
          code: "ACCOUNT_REVISION_STALE",
          staleAccountIds: [ACCOUNT_ID],
          status: "stale",
        },
      });
      const candidate: FinancialActionPushCandidate = {
        actionId: ACTION_ID,
        payloadHash: HASH,
        payloadJson: "{}",
        state: "sync_pending",
      };

      const result = await createFinancialActionPushCoordinator(
        harness.dependencies
      ).coordinatePush([candidate]);

      expect(harness.recordOutcome).toHaveBeenCalled();
      expect(harness.reconcile).toHaveBeenCalledWith(ACTION_ID);
      expect(result.decisions[0]?.disposition).toBe("acknowledge");
    });

    it("keeps a rejected result in explicit incomplete recovery", async () => {
      const harness = coordinatorHarness({
        outcome: {
          actionId: ACTION_ID,
          code: "INVALID_LINK",
          status: "rejected",
        },
        reconciliationResult: "incomplete",
      });
      const candidate: FinancialActionPushCandidate = {
        actionId: ACTION_ID,
        payloadHash: HASH,
        payloadJson: "{}",
        state: "sync_pending",
      };

      const result = await createFinancialActionPushCoordinator(
        harness.dependencies
      ).coordinatePush([candidate]);

      expect(harness.reconcile).toHaveBeenCalledWith(ACTION_ID);
      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0]?.actionId).toBe(ACTION_ID);
      expect(result.decisions[0]?.disposition).toBe("recover");
      expect(result.decisions[0]?.outcome?.status).toBe("rejected");
    });
  });

  it("installs the verified canonical account snapshot without advancing the loser", async () => {
    const installCanonicalSnapshotAtomically = jest
      .fn()
      .mockResolvedValue(undefined);
    const legacyCompensation = jest.fn().mockResolvedValue(undefined);
    const bundle = canonicalReconciliationBundle();
    const dependencies = {
      commitCompensationAtomically: legacyCompensation,
      hashProvider: { digestUtf8: () => Promise.resolve(HASH) },
      installCanonicalSnapshotAtomically,
      loadReconciliationBundle: () => Promise.resolve(bundle),
    };
    const service = createFinancialActionReconciliationService(dependencies);

    await expect(service.reconcileRejectedAction(ACTION_ID)).resolves.toBe(
      "reconciled"
    );
    expect(legacyCompensation).not.toHaveBeenCalled();
    expect(installCanonicalSnapshotAtomically).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: ACTION_ID,
        canonicalAccounts: [
          expect.objectContaining({
            accountId: ACCOUNT_ID,
            balanceMinorUnits: "11000",
            canonicalRevision: "8",
          }),
        ],
      })
    );
  });

  describe("field-boundary precision", () => {
    const messages = {
      accountRequired: "Select an account",
      amountPrecision: "Use no more than the currency's supported decimals",
    };

    it("rejects excess EGP precision with a friendly field error", () => {
      const formData = {
        accountId: ACCOUNT_ID,
        amount: "1.001",
        categoryId: "category-id",
        currency: "EGP",
      };
      const result = validateTransactionForm("EXPENSE", formData, messages);

      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBe(messages.amountPrecision);
    });

    it("accepts eight BTC decimals and rejects a ninth", () => {
      const acceptedData = {
        accountId: ACCOUNT_ID,
        amount: "0.00012345",
        categoryId: "category-id",
        currency: "BTC",
      };
      const rejectedData = {
        ...acceptedData,
        amount: "0.000123456",
      };
      const accepted = validateTransactionForm(
        "EXPENSE",
        acceptedData,
        messages
      );
      const rejected = validateTransactionForm(
        "EXPENSE",
        rejectedData,
        messages
      );

      expect(accepted.isValid).toBe(true);
      expect(rejected.isValid).toBe(false);
      expect(rejected.errors.amount).toBe(messages.amountPrecision);
    });
  });

  describe("generated, SQL, pull, and production wiring", () => {
    it("widens account-domain numeric storage for BTC precision", () => {
      const migration = source(
        "supabase/migrations/069_account_financial_effects.sql"
      );

      for (const [table, column] of [
        ["accounts", "balance"],
        ["transactions", "amount"],
        ["transfers", "amount"],
        ["transfers", "converted_amount"],
        ["recurring_payments", "amount"],
      ] as const) {
        expect(migration).toMatch(
          new RegExp(
            `alter\\s+table[\\s\\S]*?${table}[\\s\\S]*?alter\\s+column\\s+${column}\\s+type\\s+numeric\\(20\\s*,\\s*8\\)`,
            "i"
          )
        );
      }
    });

    it("stores the recurring monotonic revision locally and remotely", () => {
      const migration = source(
        "supabase/migrations/069_account_financial_effects.sql"
      );
      const localMigrations = source("packages/db/src/migrations.ts");
      const schema = source("packages/db/src/schema.ts");
      const service = source(
        "apps/mobile/services/recurring-payment-financial-action-service.ts"
      );

      expect(migration).toMatch(
        /recurring_payments[\s\S]*financial_revision[\s\S]*bigint[\s\S]*default\s+0/i
      );
      expect(localMigrations).toMatch(
        /recurring_payments[\s\S]*financial_revision/i
      );
      expect(schema).toMatch(
        /name:\s*["']recurring_payments["'][\s\S]*name:\s*["']financial_revision["'][\s\S]*type:\s*["']string["']/
      );
      expect(service).toContain("expectedFinancialRevision");
      expect(service).not.toContain("expectedUpdatedAt: input.payment.updatedAt");
    });

    it("pulls exact account revisions and immutable effect evidence", () => {
      const pull = source("apps/mobile/services/sync/pull-strategies.ts");

      expect(pull).toContain('"account_financial_effects"');
      expect(pull).toMatch(
        /accounts[\s\S]*financial_revision_text\s*:\s*financial_revision::text/i
      );
      expect(pull).toMatch(
        /account_financial_effects[\s\S]*amount_minor_units_text\s*:\s*amount_minor_units::text/i
      );
      expect(pull).toMatch(
        /account_financial_effects[\s\S]*accepted_account_revision_text\s*:\s*accepted_account_revision::text/i
      );
      expect(pull).toMatch(
        /recurring_payments[\s\S]*financial_revision_text\s*:\s*financial_revision::text/i
      );
    });

    it("preserves local effect identity in server inserts", () => {
      const migration = source(
        "supabase/migrations/069_account_financial_effects.sql"
      );

      expect(migration).toMatch(
        /insert\s+into\s+(?:public\.)?account_financial_effects\s*\(\s*id\s*,/i
      );
      expect(migration).toMatch(/->>\s*'effectId'/i);
    });

    it("retains every active Metals payload definition", () => {
      const migration = source(
        "supabase/migrations/069_account_financial_effects.sql"
      );

      for (const version of [
        "metals.add/v1",
        "metals.correct/v1",
        "metals.delete/v1",
        "metals.dispose/v1",
        "metals.sell/v2",
        "metals.undo/v1",
      ]) {
        expect(migration).toContain(version);
      }
    });

    it("routes public recurring Pay Now through the guarded service", () => {
      const recurringService = source(
        "apps/mobile/services/recurring-payment-service.ts"
      );

      expect(recurringService).toContain("submitGuardedRecurringPayment");
      expect(recurringService).not.toContain(
        "prepareTransactionCreateWithBalance"
      );
    });

    it("uses the blocked writer registry as a production barrier", () => {
      const push = source("apps/mobile/services/sync/push-service.ts");
      const protectedFields = source(
        "apps/mobile/services/sync/account-protected-fields.ts"
      );

      expect(`${push}\n${protectedFields}`).toContain(
        "requireGuardedAccountBalanceWriter"
      );
      expect(`${push}\n${protectedFields}`).toMatch(
        /financial_action_blocked_writer|blocked_account_balance_writer/
      );
    });

    it("uses AST writer discovery instead of receiver-name regexes", () => {
      const writerGuard = source(
        "apps/mobile/__tests__/architecture/account-balance-writer-guard.test.ts"
      );

      expect(writerGuard).toMatch(/from\s+["']typescript["']/);
      expect(writerGuard).toMatch(/isBinaryExpression|BinaryExpression/);
      expect(writerGuard).not.toMatch(
        /\(\?:acc\|account\|record\|a\)\\\.balance/
      );
    });
  });
});
