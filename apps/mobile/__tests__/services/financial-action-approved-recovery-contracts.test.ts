import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SyncPushArgs } from "@nozbe/watermelondb/sync";
import { canonicalizeFinancialActionEnvelope } from "@monyvi/logic";

import {
  createFinancialActionReconciliationService,
  type FinancialActionReconciliationDependencies,
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
const ACCOUNT_ID = "018f0c7a-1234-7abc-8def-000000000211";
const ACTION_ID = "018f0c7a-1234-7abc-8def-000000000311";
const WINNER_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000312";
const TRANSACTION_ID = "018f0c7a-1234-7abc-8def-000000001301";
const RECURRING_ID = "018f0c7a-1234-7abc-8def-000000001401";
const EFFECT_ID = "018f0c7a-1234-4abc-8def-000000001501";
const WINNER_EFFECT_ID = "018f0c7a-1234-4abc-8def-000000001502";
const HASH = "a".repeat(64);
const EFFECT_HASH = "b".repeat(64);

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function accountEnvelope(input?: {
  readonly effectId?: string;
  readonly operationCode?: string;
}): Readonly<Record<string, unknown>> {
  return {
    actionId: ACTION_ID,
    domain: "transactions",
    kind: "create",
    occurredAt: "2026-09-06T11:00:00.000Z",
    ownerId: "018f0c7a-1234-7abc-8def-000000000101",
    payload: {
      accountEffects: [
        {
          accountId: ACCOUNT_ID,
          amountMinorUnits: "100",
          currency: "EGP",
          ...(input?.effectId ? { effectId: input.effectId } : {}),
        },
      ],
      domainMutation: {
        records: [
          {
            after: {
              accountId: ACCOUNT_ID,
              amount: "1",
              categoryId: null,
              currency: "EGP",
              date: 1_757_154_400_000,
              description: "Contract fixture",
              id: TRANSACTION_ID,
              notes: null,
              smsFingerprint: null,
              source: "manual",
              type: "INCOME",
            },
            entity: "transaction",
            expectedUpdatedAt: null,
            mode: "create",
          },
        ],
      },
      domainRecordRefs: [TRANSACTION_ID],
      operationCode: input?.operationCode ?? "transaction.create",
      schemaVersion: "account.balance-effects/v1",
    },
    payloadVersion: "account.balance-effects/v1",
    targetId: TRANSACTION_ID,
    targetType: "transaction",
    accountGuards: [
      {
        accountId: ACCOUNT_ID,
        expectedRevision: "7",
      },
    ],
  };
}

function recurringEnvelope(): Readonly<Record<string, unknown>> {
  return {
    actionId: ACTION_ID,
    domain: "recurring_payments",
    kind: "pay_now",
    occurredAt: "2026-09-06T11:00:00.000Z",
    ownerId: "018f0c7a-1234-7abc-8def-000000000101",
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
              accountId: ACCOUNT_ID,
              amount: "1",
              categoryId: null,
              currency: "EGP",
              date: 1_757_154_400_000,
              description: "Recurring payment",
              id: TRANSACTION_ID,
              notes: null,
              smsFingerprint: null,
              source: "recurring",
              type: "EXPENSE",
            },
            entity: "transaction",
            expectedUpdatedAt: null,
            mode: "create",
          },
          {
            after: {
              financialRevision: "5",
              id: RECURRING_ID,
              nextDueDate: 1_759_746_400_000,
              status: "active",
            },
            entity: "recurring_payment",
            expectedRevision: "4",
            mode: "update",
          },
        ],
      },
      domainRecordRefs: [RECURRING_ID, TRANSACTION_ID].sort(),
      operationCode: "recurring.pay-now",
      schemaVersion: "account.balance-effects/v1",
    },
    payloadVersion: "account.balance-effects/v1",
    targetId: RECURRING_ID,
    targetType: "recurring_payment",
    accountGuards: [
      {
        accountId: ACCOUNT_ID,
        expectedRevision: "7",
      },
    ],
  };
}

function changes(input?: {
  readonly accounts?: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly roots?: ReadonlyArray<Readonly<Record<string, unknown>>>;
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
  } as unknown as SyncPushArgs["changes"];
}

function rootRecord(payload: unknown): Readonly<Record<string, unknown>> {
  return {
    action_id: ACTION_ID,
    domain: "transactions",
    id: ACTION_ID,
    payload_hash: HASH,
    payload_json: typeof payload === "string" ? payload : JSON.stringify(payload),
    state: "local_complete",
  };
}

function coordinatorDependencies(input?: {
  readonly outcome?: Readonly<Record<string, unknown>>;
  readonly reconciliationResult?: "incomplete" | "reconciled";
}) {
  const invokeRpc = jest.fn().mockResolvedValue(
    input?.outcome ?? {
      actionId: ACTION_ID,
      status: "accepted",
    }
  );
  const markPending = jest.fn().mockResolvedValue(undefined);
  const recordOutcome = jest.fn().mockResolvedValue(undefined);
  const reconcileFinancialAction = jest
    .fn()
    .mockResolvedValue(input?.reconciliationResult ?? "reconciled");

  return {
    dependencies: {
      invokeAccountFinancialActionRpc: invokeRpc,
      markFinancialActionGroupSyncFailed: jest.fn().mockResolvedValue(undefined),
      markFinancialActionGroupSyncPending: markPending,
      reconcileFinancialAction,
      recordFinancialActionGroupServerOutcome: recordOutcome,
    },
    invokeRpc,
    markPending,
    reconcileFinancialAction,
    recordOutcome,
  };
}

describe("PR #278 approved financial-action recovery contracts", () => {
  describe("canonical payload identity and revision contracts", () => {
    it("accepts the locally generated account-effect UUID in the canonical payload", () => {
      expect(() =>
        canonicalizeFinancialActionEnvelope(
          accountEnvelope({ effectId: EFFECT_ID })
        )
      ).not.toThrow();
    });

    it("rejects an account effect that omits its stable local UUID", () => {
      expect(() =>
        canonicalizeFinancialActionEnvelope(accountEnvelope())
      ).toThrow();
    });

    it("requires the exact domain-reference set instead of accepting a prefix", () => {
      const registrySource = source(
        "packages/logic/src/financial-actions/account-balance-effects-registry.ts"
      );

      expect(registrySource).toMatch(
        /recordRefs\.length\s*!==\s*refs\.length|refs\.length\s*!==\s*recordRefs\.length/
      );
    });

    it("uses a monotonic exact recurring revision token instead of timestamp equality", () => {
      expect(() =>
        canonicalizeFinancialActionEnvelope(recurringEnvelope())
      ).not.toThrow();
    });
  });

  describe("push quarantine and recovery dispositions", () => {
    it("aborts a guarded push when an account-action root is malformed", () => {
      expect(() =>
        collectAccountFinancialActionPushBundles(
          changes({ roots: [rootRecord("{malformed-json")] })
        )
      ).toThrow("financial_action_malformed_guarded_root");
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

    it("routes reconciliation_incomplete through recovery without an illegal pending transition", async () => {
      const setup = coordinatorDependencies();
      const coordinator = createFinancialActionPushCoordinator(
        setup.dependencies
      );
      const candidate: FinancialActionPushCandidate = {
        actionId: ACTION_ID,
        payloadHash: HASH,
        payloadJson: "{}",
        state: "reconciliation_incomplete",
      };

      const result = await coordinator.coordinatePush([candidate]);

      expect(setup.markPending).not.toHaveBeenCalled();
      expect(setup.invokeRpc).not.toHaveBeenCalled();
      expect(setup.reconcileFinancialAction).toHaveBeenCalledWith(ACTION_ID);
      expect(result.decisions).toEqual([
        {
          actionId: ACTION_ID,
          disposition: "acknowledge",
          outcome: null,
        },
      ]);
    });

    it("reconciles a durable stale result before acknowledging the local bundle", async () => {
      const setup = coordinatorDependencies({
        outcome: {
          actionId: ACTION_ID,
          canonicalAccounts: [
            {
              accountId: ACCOUNT_ID,
              canonicalActionId: WINNER_ACTION_ID,
              canonicalBalanceMinorUnits: "11000",
              canonicalEffects: [
                {
                  acceptedAccountRevision: "8",
                  actionId: WINNER_ACTION_ID,
                  amountMinorUnits: "1000",
                  effectEvidenceHash: EFFECT_HASH,
                  effectId: WINNER_EFFECT_ID,
                  kind: "transaction_create",
                },
              ],
              canonicalEvidenceHash: HASH,
              canonicalRevision: "8",
              currency: "EGP",
            },
          ],
          code: "ACCOUNT_REVISION_STALE",
          staleAccountIds: [ACCOUNT_ID],
          status: "stale",
        },
      });
      const coordinator = createFinancialActionPushCoordinator(
        setup.dependencies
      );
      const candidate: FinancialActionPushCandidate = {
        actionId: ACTION_ID,
        payloadHash: HASH,
        payloadJson: "{}",
        state: "sync_pending",
      };

      const result = await coordinator.coordinatePush([candidate]);

      expect(setup.recordOutcome).toHaveBeenCalled();
      expect(setup.reconcileFinancialAction).toHaveBeenCalledWith(ACTION_ID);
      expect(result.decisions[0]?.disposition).toBe("acknowledge");
    });

    it("keeps a durable rejected result in an explicit incomplete-recovery disposition", async () => {
      const setup = coordinatorDependencies({
        outcome: {
          actionId: ACTION_ID,
          code: "INVALID_LINK",
          status: "rejected",
        },
        reconciliationResult: "incomplete",
      });
      const coordinator = createFinancialActionPushCoordinator(
        setup.dependencies
      );
      const candidate: FinancialActionPushCandidate = {
        actionId: ACTION_ID,
        payloadHash: HASH,
        payloadJson: "{}",
        state: "sync_pending",
      };

      const result = await coordinator.coordinatePush([candidate]);

      expect(setup.reconcileFinancialAction).toHaveBeenCalledWith(ACTION_ID);
      expect(result.decisions).toEqual([
        {
          actionId: ACTION_ID,
          disposition: "recover",
          outcome: expect.objectContaining({ status: "rejected" }),
        },
      ]);
    });
  });

  describe("canonical snapshot installation", () => {
    it("installs verified canonical account state without incrementing the losing revision", async () => {
      const installCanonicalSnapshotAtomically = jest
        .fn()
        .mockResolvedValue(undefined);
      const legacyCompensation = jest.fn().mockResolvedValue(undefined);
      const bundle = {
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
            canonicalActionId: WINNER_ACTION_ID,
            canonicalBalanceMinorUnits: "11000",
            canonicalEffects: [
              {
                acceptedAccountRevision: "8",
                actionId: WINNER_ACTION_ID,
                amountMinorUnits: "1000",
                effectEvidenceHash: EFFECT_HASH,
                effectId: WINNER_EFFECT_ID,
                kind: "transaction_create",
              },
            ],
            canonicalEvidenceHash: HASH,
            canonicalRevision: "8",
            currency: "EGP",
          },
        ],
        effects: [
          {
            accountId: ACCOUNT_ID,
            actionId: ACTION_ID,
            amountMinorUnits: "2500",
            currency: "EGP",
            effectId: EFFECT_ID,
            isEffective: true,
            kind: "transaction_create",
          },
        ],
        localSmsReviewDraftRestore: null,
        ownerId: "018f0c7a-1234-7abc-8def-000000000101",
        state: "rejected_compensating",
      };
      const dependencies = {
        commitCompensationAtomically: legacyCompensation,
        hashProvider: {
          sha256Hex: jest.fn().mockResolvedValue(HASH),
        },
        installCanonicalSnapshotAtomically,
        loadReconciliationBundle: jest.fn().mockResolvedValue(bundle),
      };
      const service = createFinancialActionReconciliationService(
        dependencies as unknown as FinancialActionReconciliationDependencies
      );

      const result = await service.reconcile(ACTION_ID);

      expect(result).toBe("reconciled");
      expect(legacyCompensation).not.toHaveBeenCalled();
      expect(installCanonicalSnapshotAtomically).toHaveBeenCalledWith(
        expect.objectContaining({
          actionId: ACTION_ID,
          canonicalAccounts: [
            expect.objectContaining({
              accountId: ACCOUNT_ID,
              canonicalBalanceMinorUnits: "11000",
              canonicalRevision: "8",
            }),
          ],
        })
      );
    });
  });

  describe("field-boundary precision", () => {
    const messages = {
      accountRequired: "Select an account",
      amountPrecision: "Use no more than the currency's supported decimals",
      categoryRequired: "Select a category",
    };

    it("rejects excess EGP precision with the friendly field error", () => {
      const result = validateTransactionForm(
        "EXPENSE",
        {
          accountId: ACCOUNT_ID,
          amount: "1.001",
          categoryId: "category-id",
          currency: "EGP",
        },
        messages
      );

      expect(result.valid).toBe(false);
      expect(result.errors.amount).toBe(messages.amountPrecision);
    });

    it("accepts eight BTC decimals and rejects a ninth", () => {
      const accepted = validateTransactionForm(
        "EXPENSE",
        {
          accountId: ACCOUNT_ID,
          amount: "0.00012345",
          categoryId: "category-id",
          currency: "BTC",
        },
        messages
      );
      const rejected = validateTransactionForm(
        "EXPENSE",
        {
          accountId: ACCOUNT_ID,
          amount: "0.000123456",
          categoryId: "category-id",
          currency: "BTC",
        },
        messages
      );

      expect(accepted.valid).toBe(true);
      expect(rejected.valid).toBe(false);
      expect(rejected.errors.amount).toBe(messages.amountPrecision);
    });
  });

  describe("generated, migration, pull, and production wiring contracts", () => {
    it("widens account-domain numeric storage for eight-decimal BTC values", () => {
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
            `alter\\s+table[\\s\\S]*?${table}[\\s\\S]*?alter\\s+column\\s+${column}\\s+type\\s+numeric\\(\\d+\\s*,\\s*8\\)`,
            "i"
          )
        );
      }
    });

    it("stores the recurring-payment monotonic revision token locally and on the server", () => {
      const migration = source(
        "supabase/migrations/069_account_financial_effects.sql"
      );
      const localMigrations = source("packages/db/src/migrations.ts");
      const schema = source("packages/db/src/schema.ts");
      const recurringModel = source(
        "packages/db/src/models/base/base-recurring-payment.ts"
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
      expect(recurringModel).toMatch(
        /financialRevision[\s\S]*field\(["']financial_revision["']\)/
      );
    });

    it("pulls exact account revisions and immutable account-effect evidence through dedicated strategies", () => {
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

    it("preserves the local effect ID in the server insert", () => {
      const migration = source(
        "supabase/migrations/069_account_financial_effects.sql"
      );

      expect(migration).toMatch(
        /insert\s+into\s+(?:public\.)?account_financial_effects\s*\(\s*id\s*,/i
      );
      expect(migration).toMatch(/effectId["']?\s*\)?::uuid|->>\s*'effectId'/i);
    });

    it("extends every active Metals payload registration from migration 068", () => {
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

    it("backfills Watermelon required-string defaults as canonical zero revisions", () => {
      const localMigrations = source("packages/db/src/migrations.ts");

      expect(localMigrations).toMatch(
        /financial_revision\s+is\s+null[\s\S]*financial_revision\s*=\s*''|financial_revision\s*=\s*''[\s\S]*financial_revision\s+is\s+null/i
      );
    });

    it("routes the public recurring Pay Now entry through the guarded action service", () => {
      const recurringService = source(
        "apps/mobile/services/recurring-payment-service.ts"
      );

      expect(recurringService).toContain("submitGuardedRecurringPayment");
      expect(recurringService).not.toContain(
        "prepareTransactionCreateWithBalance"
      );
    });

    it("uses the writer registry as a production sync barrier", () => {
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

    it("uses an AST-based writer guard rather than receiver-name regexes", () => {
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
