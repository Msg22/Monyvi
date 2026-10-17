import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { database, type FinancialActionGroup } from "@monyvi/db";
import {
  createFinancialActionGroup,
  getFinancialActionGroup,
} from "../../services/financial-action-foundation-repository";
import { legacyEditBalanceEnvelope } from "../../../../packages/logic/src/financial-actions/__tests__/review-batch-save-fixtures";
import { resolve } from "node:path";

import type { SyncPushArgs } from "@nozbe/watermelondb/sync";
import {
  canonicalizeFinancialActionEnvelope,
  serializeFinancialActionEnvelope,
} from "@monyvi/logic";

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

// Only replace the app/native database construction boundary. The imported
// financial factories, validators, collectors and injected protocol tests stay
// real; no financial result or recovery rule is mocked to bypass admission.
jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("@monyvi/db", () => {
  const wm = jest.requireActual<typeof import("@nozbe/watermelondb")>(
    "@nozbe/watermelondb"
  );
  const Adapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const models = jest.requireActual<
    typeof import("./account-review-save-ledger-models")
  >("./account-review-save-ledger-models");
  const adapter = new Adapter({ schema });
  return {
    ...models,
    database: new wm.Database({
      adapter,
      modelClasses: models.LEDGER_MODEL_CLASSES,
    }),
    __adapter: adapter,
  };
});
// Genuine Foundation/Watermelon root. Only native crypto and actor I/O
// are substituted; there is no financial writer or acceptance-proof mock.
jest.mock("expo-crypto", () => {
  const crypto =
    jest.requireActual<typeof import("node:crypto")>("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: (algorithm: string, bytes: string): Promise<string> => {
      if (algorithm !== "SHA-256")
        throw new Error("invalid_test_digest_algorithm");
      return Promise.resolve(
        crypto.createHash("sha256").update(bytes, "utf8").digest("hex")
      );
    },
    randomUUID: (): string => crypto.randomUUID(),
  };
});
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> =>
    Promise.resolve("20000000-0000-4000-8000-000000000002"),
}));
beforeAll(async () => {
  const { __adapter } = jest.requireMock<{
    readonly __adapter: import("@nozbe/watermelondb/adapters/sqlite").default;
  }>("@monyvi/db");
  await __adapter.initializingPromise;
});
beforeEach(async (): Promise<void> => {
  await database.write(() => database.unsafeResetDatabase());
});

const ROOT = resolve(__dirname, "../../../..");
const ACTION_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000002";
const ACCOUNT_ID = "30000000-0000-4000-8000-000000000003";
const EFFECT_ID = "40000000-0000-4000-8000-000000000004";
const TRANSACTION_ID = "70000000-0000-4000-8000-000000000007";

interface TestFinancialActionEnvelope extends Readonly<
  Record<string, unknown>
> {
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
  };
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
          effectId: EFFECT_ID,
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

/** Registered LEGACY account edit; immutable bytes, hash and actual owned root. */
function legacyIdentity(): {
  readonly envelope: ReturnType<typeof canonicalizeFinancialActionEnvelope>;
  readonly payloadHash: string;
  readonly payloadJson: string;
} {
  const original = legacyEditBalanceEnvelope.payload.domainMutation.records[0];
  if (!original) throw new Error("missing_registered_legacy_account_mutation");
  const envelope = canonicalizeFinancialActionEnvelope({
    ...legacyEditBalanceEnvelope,
    actionId: ACTION_ID,
    userId: USER_ID,
    domainReferenceId: ACCOUNT_ID,
    accountGuards: [{ accountId: ACCOUNT_ID, expectedRevision: "7" }],
    payload: {
      ...legacyEditBalanceEnvelope.payload,
      accountEffects: [
        {
          accountId: ACCOUNT_ID,
          amountMinorUnits: "2500",
          currency: "EGP",
          effectId: EFFECT_ID,
        },
      ],
      domainMutation: {
        records: [
          { ...original, after: { ...original.after, id: ACCOUNT_ID } },
        ],
      },
      domainRecordRefs: [ACCOUNT_ID],
    },
  });
  const payloadJson = serializeFinancialActionEnvelope(envelope);
  const payloadHash = createHash("sha256")
    .update(payloadJson, "utf8")
    .digest("hex");
  return { envelope, payloadJson, payloadHash };
}

async function ownedLegacyRoot(): Promise<FinancialActionGroup> {
  const identity = legacyIdentity();
  const created = await createFinancialActionGroup({
    envelope: identity.envelope,
    hashProvider: {
      digestUtf8: (bytes: string): Promise<string> =>
        Promise.resolve(
          createHash("sha256").update(bytes, "utf8").digest("hex")
        ),
    },
  });
  expect(created.kind).toBe("created");
  const owned = await getFinancialActionGroup(ACTION_ID);
  if (!owned) throw new Error("missing_genuine_owned_legacy_action");
  expect(owned).toBe(created.record);
  expect(owned.userId).toBe(USER_ID);
  expect(owned.actionId).toBe(ACTION_ID);
  expect(owned.payloadHash).toBe(identity.payloadHash);
  expect(owned.payloadJson).toBe(identity.payloadJson);
  return owned;
}

function legacyCandidate(
  owned: FinancialActionGroup,
  state: FinancialActionPushCandidate["state"]
): FinancialActionPushCandidate {
  return {
    actionId: owned.actionId,
    payloadHash: owned.payloadHash,
    payloadJson: owned.payloadJson,
    state,
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
    domain: "accounts",
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
    payloadJson: legacyIdentity().payloadJson,
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
    const owned = await ownedLegacyRoot();
    const recover = jest.fn().mockResolvedValue(undefined);
    const dependencies = {
      invokeAccountFinancialActionRpc: invokeRpc,
      markFinancialActionGroupSyncFailed: jest
        .fn()
        .mockResolvedValue(undefined),
      markFinancialActionGroupSyncPending: markPending,
      reconcileFinancialActionGroup: recover,
      getFinancialActionGroup,
      database,
      recordFinancialActionGroupServerOutcome: jest
        .fn()
        .mockResolvedValue(undefined),
    } satisfies Parameters<typeof createFinancialActionPushCoordinator>[0] & {
      readonly reconcileFinancialActionGroup: (
        actionId: string
      ) => Promise<void>;
    };
    const candidate = legacyCandidate(owned, "reconciliation_incomplete");

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
    const commitCompensationAtomically = jest.fn().mockResolvedValue(undefined);
    const installCanonicalSnapshotAtomically = jest
      .fn()
      .mockResolvedValue(undefined);
    const service = createFinancialActionReconciliationService({
      commitCompensationAtomically,
      hashProvider: {
        digestUtf8: jest
          .fn()
          .mockResolvedValueOnce("e".repeat(64))
          .mockResolvedValueOnce("d".repeat(64)),
      },
      installCanonicalSnapshotAtomically,
      loadReconciliationBundle: () => Promise.resolve(rejectedBundle()),
    });

    await expect(service.reconcileRejectedAction(ACTION_ID)).resolves.toBe(
      "reconciled"
    );
    expect(commitCompensationAtomically).not.toHaveBeenCalled();
    expect(installCanonicalSnapshotAtomically).toHaveBeenCalledWith(
      expect.objectContaining({
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
      currency: "EGP" as const,
    };
    const messages = {
      accountRequired: "Account is required",
      amountPrecision: (_precision: number): string =>
        "Amount supports at most 2 decimal places",
      destinationAccountRequired: "Destination account is required",
      sourceAccountRequired: "Source account is required",
    };

    expect(validateTransactionForm("EXPENSE", formData, messages)).toEqual({
      errors: { amount: "Amount supports at most 2 decimal places" },
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
      "financial_revision_text:financial_revision::text"
    );
    expect(pullStrategies).toContain(
      "accepted_account_revision_text:accepted_account_revision::text"
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

    expect(
      accountService.match(/financialRevision\s*=\s*["']0["']/g)
    ).toHaveLength(4);
    expect(pendingAccountService).toContain('financialRevision = "0"');
  });
});
