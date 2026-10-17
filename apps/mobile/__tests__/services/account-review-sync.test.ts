/**
 * #395 T044 tests-first sync/reconciliation boundaries for the STRICT,
 * unshipped review.batch-save/v1 tuple. No production writer, RPC success,
 * native bridge, provider or hosted SQL is mocked into a passing receipt.
 *
 * T050 review collector/child completeness and T051 review local restoration
 * are expected RED at this pinned source. Legacy contracts stay intact.
 */
import type { SyncTableChangeSet } from "@nozbe/watermelondb/sync";
import type { AppSyncDatabaseChangeSet } from "../../services/sync/types";
import { parseFinancialActionEnvelopeJson } from "@monyvi/logic";
import {
  createFinancialActionPushCoordinator,
  FINANCIAL_ACTION_SYNC_ERROR_CODES,
} from "../../services/financial-action-sync-service";
import {
  createFinancialActionReconciliationService,
  FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES,
  type FinancialActionReconciliationBundle,
} from "../../services/financial-action-reconciliation-service";
import {
  collectAccountFinancialActionPushBundles,
  collectProtectedFinancialActionRowIds,
  isProtectedFinancialActionRow,
  readRejectedIdsForTable,
  stripProtectedAccountFields,
} from "../../services/sync/account-protected-fields";
import {
  FOREIGN_OWNER_ID,
  REVIEW_HASH_PROVIDER,
  REVIEW_ROOT_ID,
  REVIEW_SENDER_ID,
  bankWithSender,
  canonicalReviewChanges,
  isReviewSyncTableName,
  legacySyncChanges,
  reviewSyncRegistry,
  withRoot,
  withoutCreatedTable,
  type ReviewSyncFixture,
} from "./account-review-sync-test-fixtures";
import {
  ATM_BANK_ACCOUNT_ID,
  ATM_CASH_ACCOUNT_ID,
  ATM_SOURCE_EFFECT_ID,
  ATM_DEST_EFFECT_ID,
  ATM_TRANSFER_RECORD_ID,
  BANK_DETAILS_ID,
  NEW_BANK_ACCOUNT_ID,
  REVIEW_ACCOUNT_ID,
  REVIEW_ACTION_ID,
  REVIEW_EFFECT_ID,
  REVIEW_EXPENSE_RECORD_ID,
  REVIEW_INCOME_RECORD_ID,
  REVIEW_USER_ID,
  SMS_INCOME_RECORD_ID,
  SMS_EXPENSE_RECORD_ID,
  SMS_NET_EFFECT_ID,
} from "../../../../packages/logic/src/financial-actions/__tests__/review-batch-save-fixtures";

/**
 * Test-only native DB boundary: the newly imported financial sync service
 * references the production @monyvi/db singleton. Use the current SQLite
 * adapter, actual schema and generated domain Model constructors, never an
 * undefined WMDatabaseBridge or a mocked reconciliation/business method.
 * Sync assertions themselves remain the original pure/canonical fixtures.
 */
/**
 * TEST-ONLY Node SHA-256 bridge for expo-crypto's Jest stub. The real Save
 * hashProvider, reducers, reconciliation, SQLite and immutable root hashing
 * remain intact; only the unavailable native crypto primitive is replaced.
 * Deterministic canonical v4 IDs also avoid non-UUID native Jest randomUUIDs.
 */
let mockCryptoUuidCounter = 0;
jest.mock("expo-crypto", () => {
  const { createHash } =
    jest.requireActual<typeof import("node:crypto")>("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: (algorithm: string, input: string): Promise<string> => {
      if (algorithm !== "SHA-256")
        return Promise.reject(new Error("unsupported_test_crypto_algorithm"));
      return Promise.resolve(
        createHash("sha256").update(input, "utf8").digest("hex")
      );
    },
    randomUUID: (): string => {
      mockCryptoUuidCounter += 1;
      return (
        "e1000000-0000-4000-8000-" +
        String(mockCryptoUuidCounter).padStart(12, "0")
      );
    },
  };
});

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("@monyvi/db", (): Readonly<Record<string, unknown>> => {
  const wm = jest.requireActual<typeof import("@nozbe/watermelondb")>(
    "@nozbe/watermelondb"
  );
  const Adapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const modelRegistry = jest.requireActual<
    typeof import("./account-review-save-ledger-models")
  >("./account-review-save-ledger-models");
  const adapter = new Adapter({ schema });
  return {
    database: new wm.Database({
      adapter,
      modelClasses: modelRegistry.LEDGER_MODEL_CLASSES,
    }),
    schema,
    Q: wm.Q,
    ...Object.fromEntries(
      modelRegistry.LEDGER_MODEL_CLASSES.map((model) => [model.name, model])
    ),
  };
});

/** Watermelon's DirtyRaw ID is loose: only real string IDs enter assertions. */
function requiredChangeId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Invalid canonical review sync change ID");
  }
  return value;
}

function ids(
  changes: AppSyncDatabaseChangeSet,
  table: string
): readonly string[] {
  if (!isReviewSyncTableName(table)) return [];
  return (
    changes[table]?.created.map((record) => requiredChangeId(record.id)) ?? []
  );
}

function protectedIds(
  changes: AppSyncDatabaseChangeSet,
  table: string
): readonly string[] {
  return readRejectedIdsForTable(
    collectProtectedFinancialActionRowIds(changes),
    table
  );
}

function expectOnlyRootAndDomainBundle(
  candidate: ReviewSyncFixture,
  expected: Readonly<Record<string, readonly string[]>>
): void {
  const bundles = collectAccountFinancialActionPushBundles(candidate.changes);
  expect(bundles).toHaveLength(1);
  const root = bundles[0];
  if (!root) throw new Error("Expected one complete review-action bundle");
  expect(root.candidate).toEqual({
    actionId: REVIEW_ACTION_ID,
    payloadHash: candidate.payloadHash,
    payloadJson: candidate.payloadJson,
    state: "local_complete",
  });
  expect(root.rowIds).toEqual(expected);
}

function changeRecord(
  changes: AppSyncDatabaseChangeSet,
  table: string,
  update: (
    record: SyncTableChangeSet["created"][number]
  ) => SyncTableChangeSet["created"][number]
): AppSyncDatabaseChangeSet {
  if (!isReviewSyncTableName(table)) {
    throw new Error("Unknown canonical review sync table: " + table);
  }
  const existing = changes[table];
  const row = existing?.created[0];
  if (!existing || !row) throw new Error("Missing canonical " + table + " row");
  return {
    ...changes,
    [table]: {
      created: existing.created.map((candidate, index) =>
        index === 0 ? update(row) : candidate
      ),
      updated: existing.updated.map((candidate) => candidate),
      deleted: existing.deleted.map(requiredChangeId),
    },
  };
}

function reviewRejectedBundle(
  fixture: ReviewSyncFixture
): FinancialActionReconciliationBundle {
  const first = fixture.payload.accountEffects[0];
  if (!first) throw new Error("Expected canonical affected account effect");
  return {
    actionId: REVIEW_ACTION_ID,
    userId: REVIEW_USER_ID,
    state: "rejected_compensating",
    domain: "transactions",
    payloadJson: fixture.payloadJson,
    accounts: [
      {
        accountId: first.accountId,
        currency: first.currency,
        balance: 15,
        financialRevision: "1",
      },
    ],
    effects: [
      {
        accountId: first.accountId,
        actionId: REVIEW_ACTION_ID,
        acceptedAccountRevision: "1",
        amountMinorUnits: first.amountMinorUnits,
        currency: first.currency,
        effectId: first.effectId,
        isEffective: true,
        reversesEffectId: null,
      },
    ],
    localSmsReviewDraftSnapshot: null,
  };
}

describe("T044/T050 canonical protected push for selected review actions", () => {
  it("T044-01 recognizes the review-only Bank root and exact account, BankDetails, sender, transaction and effect IDs", async () => {
    const fixture = await canonicalReviewChanges();
    expect(fixture.payload).toEqual(bankWithSender());
    expect(fixture.payload.creationDefaultSnapshot).toEqual({
      activeAccountIds: [REVIEW_ACCOUNT_ID],
      defaultAccount: null,
    });
    expect(fixture.payload.accountEffects).toEqual([
      {
        accountId: NEW_BANK_ACCOUNT_ID,
        amountMinorUnits: "1500",
        currency: "EGP",
        effectId: SMS_NET_EFFECT_ID,
      },
    ]);
    expect(
      fixture.payload.domainMutation.records
        .filter((record) => record.entity === "account")
        .map((record) => record.after.isDefault)
    ).toEqual([false]);
    expect(
      parseFinancialActionEnvelopeJson(fixture.payloadJson, reviewSyncRegistry)
        .payload
    ).toEqual(fixture.payload);
    expectOnlyRootAndDomainBundle(fixture, {
      account_financial_effects: [SMS_NET_EFFECT_ID],
      accounts: [NEW_BANK_ACCOUNT_ID],
      account_sms_senders: [REVIEW_SENDER_ID],
      bank_details: [BANK_DETAILS_ID],
      financial_action_groups: [REVIEW_ROOT_ID],
      transactions: [SMS_EXPENSE_RECORD_ID, SMS_INCOME_RECORD_ID].sort(),
    });
    expect(ids(fixture.changes, "bank_details")).toEqual([BANK_DETAILS_ID]);
    expect(ids(fixture.changes, "account_sms_senders")).toEqual([
      REVIEW_SENDER_ID,
    ]);
  });

  it("T044-02 protects all review-owned account, child and financial creates from generic LWW", async () => {
    const fixture = await canonicalReviewChanges();
    const expected = {
      accounts: [NEW_BANK_ACCOUNT_ID],
      bank_details: [BANK_DETAILS_ID],
      account_sms_senders: [REVIEW_SENDER_ID],
      transactions: [SMS_EXPENSE_RECORD_ID, SMS_INCOME_RECORD_ID].sort(),
    };
    for (const [table, expectedIds] of Object.entries(expected)) {
      expect([...protectedIds(fixture.changes, table)].sort()).toEqual(
        [...expectedIds].sort()
      );
      for (const id of expectedIds) {
        expect(
          isProtectedFinancialActionRow(
            collectProtectedFinancialActionRowIds(fixture.changes),
            table,
            id
          )
        ).toBe(true);
      }
    }
    // Roots and immutable effects remain dedicated, not generic table upserts.
    expect(ids(fixture.changes, "financial_action_groups")).toEqual([
      REVIEW_ROOT_ID,
    ]);
    expect(ids(fixture.changes, "account_financial_effects")).toEqual([
      SMS_NET_EFFECT_ID,
    ]);
  });

  it("T044-03 preserves an ATM transfer and BOTH owned endpoint effects without generic LWW", async () => {
    const fixture = await canonicalReviewChanges("atm");
    expectOnlyRootAndDomainBundle(fixture, {
      account_financial_effects: [
        ATM_SOURCE_EFFECT_ID,
        ATM_DEST_EFFECT_ID,
      ].sort(),
      accounts: [ATM_BANK_ACCOUNT_ID, ATM_CASH_ACCOUNT_ID].sort(),
      financial_action_groups: [REVIEW_ROOT_ID],
      transfers: [ATM_TRANSFER_RECORD_ID],
    });
    expect([...protectedIds(fixture.changes, "accounts")].sort()).toEqual(
      [ATM_BANK_ACCOUNT_ID, ATM_CASH_ACCOUNT_ID].sort()
    );
    expect(protectedIds(fixture.changes, "transfers")).toContain(
      ATM_TRANSFER_RECORD_ID
    );
    expect(
      stripProtectedAccountFields("accounts", {
        id: ATM_BANK_ACCOUNT_ID,
        balance: 74.95,
        financial_revision: "8",
        name: "Bank after review",
      })
    ).toEqual({ id: ATM_BANK_ACCOUNT_ID, name: "Bank after review" });
  });

  it("T044-04 keeps Voice zero-net effects guarded but has no SMS bookkeeping or created account", async () => {
    const fixture = await canonicalReviewChanges("voice");
    expect(fixture.payload.source).toBe("VOICE");
    expect(fixture.payload.localSmsBookkeeping).toEqual([]);
    expect(fixture.payload.creationDefaultSnapshot).toBeUndefined();
    expect(fixture.payload.accountEffects).toEqual([
      {
        accountId: REVIEW_ACCOUNT_ID,
        amountMinorUnits: "0",
        currency: "EGP",
        effectId: REVIEW_EFFECT_ID,
      },
    ]);
    expectOnlyRootAndDomainBundle(fixture, {
      account_financial_effects: [REVIEW_EFFECT_ID],
      accounts: [REVIEW_ACCOUNT_ID],
      financial_action_groups: [REVIEW_ROOT_ID],
      transactions: [REVIEW_INCOME_RECORD_ID, REVIEW_EXPENSE_RECORD_ID].sort(),
    });
    expect(fixture.payloadJson).not.toMatch(
      /originalTranscript|rawSmsBody|undoToken/
    );
  });

  it.each([
    "bank_details",
    "account_sms_senders",
    "transactions",
    "accounts",
    "account_financial_effects",
  ])(
    "T044-05 rejects a partial review group with missing required %s rows before RPC/acknowledgement",
    async (table): Promise<void> => {
      const fixture = await canonicalReviewChanges();
      const incomplete = withoutCreatedTable(fixture.changes, table);
      expect(ids(fixture.changes, table).length).toBeGreaterThan(0);
      expect(ids(incomplete, table)).toHaveLength(0);
      expect(() =>
        collectAccountFinancialActionPushBundles(incomplete)
      ).toThrow();
    }
  );

  it("T044-05b refuses effect/child creates when the owning review action root is missing", async () => {
    const fixture = await canonicalReviewChanges();
    const orphan: AppSyncDatabaseChangeSet = {
      ...fixture.changes,
      financial_action_groups: { created: [], updated: [], deleted: [] },
    };
    expect(ids(orphan, "account_financial_effects")).toEqual([
      SMS_NET_EFFECT_ID,
    ]);
    expect(ids(orphan, "bank_details")).toEqual([BANK_DETAILS_ID]);
    expect(ids(orphan, "account_sms_senders")).toEqual([REVIEW_SENDER_ID]);
    expect(() => collectAccountFinancialActionPushBundles(orphan)).toThrow();
  });

  it("T044-06 refuses reparented BankDetails and sender rows even with unchanged signed financial root", async () => {
    const fixture = await canonicalReviewChanges();
    for (const table of ["bank_details", "account_sms_senders"]) {
      const reparented = changeRecord(fixture.changes, table, (original) => ({
        ...original,
        account_id: REVIEW_ACCOUNT_ID,
      }));
      expect(() =>
        collectAccountFinancialActionPushBundles(reparented)
      ).toThrow();
    }
  });

  it("T044-07 refuses an incomplete review root with the original physical Bank creates still dirty", async () => {
    const fixture = await canonicalReviewChanges();
    const envelope = parseFinancialActionEnvelopeJson(
      fixture.payloadJson,
      reviewSyncRegistry
    );
    const missingGroupJson = JSON.stringify({
      ...envelope,
      payload: { ...fixture.payload, confirmedGroupRefs: [] },
    });
    const missingGroup = withRoot(fixture.changes, (root) => ({
      ...root,
      payload_json: missingGroupJson,
    }));
    expect(() =>
      parseFinancialActionEnvelopeJson(missingGroupJson, reviewSyncRegistry)
    ).toThrow();
    expect(() =>
      collectAccountFinancialActionPushBundles(missingGroup)
    ).toThrow();
  });

  it("T044-08 rejects foreign root ownership rather than protecting or uploading foreign financial rows", async () => {
    const fixture = await canonicalReviewChanges();
    const foreign = withRoot(fixture.changes, (root) => ({
      ...root,
      user_id: FOREIGN_OWNER_ID,
    }));
    expect(() => collectAccountFinancialActionPushBundles(foreign)).toThrow();
  });

  it("T044-09 refuses a changed valid-length action hash before RPC rather than treating it as a transport retry", async () => {
    const fixture = await canonicalReviewChanges();
    const mismatchedHash = "f".repeat(64);
    expect(fixture.payloadHash).not.toBe(mismatchedHash);
    const correctlyBoundHash = await REVIEW_HASH_PROVIDER.digestUtf8(
      fixture.payloadJson
    );
    expect(correctlyBoundHash).toBe(fixture.payloadHash);
    expect(mismatchedHash).not.toBe(correctlyBoundHash);
    const invoked: string[] = [];
    const coordinator = createFinancialActionPushCoordinator({
      markFinancialActionGroupSyncPending: (id) => {
        invoked.push("pending:" + id);
        return Promise.resolve();
      },
      markFinancialActionGroupSyncFailed: (id) => {
        invoked.push("failed:" + id);
        return Promise.resolve();
      },
      recordFinancialActionGroupServerOutcome: () => {
        invoked.push("outcome");
        return Promise.resolve();
      },
      invokeAccountFinancialActionRpc: () => {
        invoked.push("RPC");
        return Promise.reject(new Error("unsigned_payload_sent"));
      },
    });
    await expect(
      coordinator.coordinatePush([
        {
          actionId: REVIEW_ACTION_ID,
          payloadHash: mismatchedHash,
          payloadJson: fixture.payloadJson,
          state: "local_complete",
        },
      ])
    ).rejects.toThrow();
    expect(invoked).toEqual([]);
  });

  it.each(["source", "revision"])(
    "T044-10 rejects review payload %s tampering before any dedicated action is sent",
    async (field): Promise<void> => {
      const fixture = await canonicalReviewChanges();
      const envelope = parseFinancialActionEnvelopeJson(
        fixture.payloadJson,
        reviewSyncRegistry
      );
      const invalidJson = JSON.stringify(
        field === "source"
          ? { ...envelope, payload: { ...fixture.payload, source: "VOICE" } }
          : {
              ...envelope,
              accountGuards: [
                {
                  ...envelope.accountGuards[0],
                  expectedRevision: "9",
                },
              ],
            }
      );
      const invalid = withRoot(fixture.changes, (root) => ({
        ...root,
        payload_json: invalidJson,
      }));
      expect(() =>
        parseFinancialActionEnvelopeJson(invalidJson, reviewSyncRegistry)
      ).toThrow();
      expect(() => collectAccountFinancialActionPushBundles(invalid)).toThrow();
    }
  );

  it("T044-11 retains the deployed edit-balance collector and protected guard/effect behavior unchanged", async () => {
    const changes = await legacySyncChanges();
    const bundles = collectAccountFinancialActionPushBundles(changes);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.rowIds).toEqual({
      account_financial_effects: [REVIEW_EFFECT_ID],
      accounts: [REVIEW_ACCOUNT_ID],
      financial_action_groups: [REVIEW_ROOT_ID],
    });
    expect(protectedIds(changes, "accounts")).toEqual([REVIEW_ACCOUNT_ID]);
  });
});

describe("T044 dedicated review transport/recovery fail-closed", () => {
  it("T044-12 a real canonical review candidate remains sync_failed after a transport exception", async () => {
    const fixture = await canonicalReviewChanges();
    const transitions: string[] = [];
    const coordinator = createFinancialActionPushCoordinator({
      markFinancialActionGroupSyncPending: (actionId) => {
        transitions.push(actionId + ":sync_pending");
        return Promise.resolve();
      },
      markFinancialActionGroupSyncFailed: (actionId, code) => {
        transitions.push(actionId + ":" + code);
        return Promise.resolve();
      },
      recordFinancialActionGroupServerOutcome: () => {
        return Promise.reject(
          new Error("No accepted/stale server receipt was returned")
        );
      },
      invokeAccountFinancialActionRpc: (request) => {
        expect(request).toEqual({
          payloadHash: fixture.payloadHash,
          payloadJson: fixture.payloadJson,
        });
        return Promise.reject(new Error("transport_offline"));
      },
    });
    await expect(
      coordinator.coordinatePush([
        {
          actionId: REVIEW_ACTION_ID,
          payloadHash: fixture.payloadHash,
          payloadJson: fixture.payloadJson,
          state: "local_complete",
        },
      ])
    ).rejects.toThrow("transport_offline");
    expect(transitions).toEqual([
      REVIEW_ACTION_ID + ":sync_pending",
      REVIEW_ACTION_ID +
        ":" +
        FINANCIAL_ACTION_SYNC_ERROR_CODES.TRANSPORT_FAILED,
    ]);
  });

  it("T044-13 an already rejected review action routes only to recovery, never resubmits the financial effect", async () => {
    const fixture = await canonicalReviewChanges();
    const coordinator = createFinancialActionPushCoordinator({
      markFinancialActionGroupSyncPending: () => {
        return Promise.reject(
          new Error("No requeue during rejected compensation")
        );
      },
      markFinancialActionGroupSyncFailed: () => {
        return Promise.reject(new Error("No transport is attempted"));
      },
      recordFinancialActionGroupServerOutcome: () => {
        return Promise.reject(new Error("No new canonical receipt"));
      },
      invokeAccountFinancialActionRpc: () => {
        return Promise.reject(
          new Error("Review root must reconcile, not repost")
        );
      },
      reconcileFinancialActionGroup: (): Promise<"incomplete"> =>
        Promise.resolve("incomplete"),
    });
    const result = await coordinator.coordinatePush([
      {
        actionId: REVIEW_ACTION_ID,
        payloadHash: fixture.payloadHash,
        payloadJson: fixture.payloadJson,
        state: "rejected_compensating",
      },
    ]);
    expect(result.decisions).toEqual([
      {
        actionId: REVIEW_ACTION_ID,
        disposition: "recover",
        outcome: null,
      },
    ]);
  });

  it("T044-14 an already reconciled review root is acknowledged without a second network push", async () => {
    const fixture = await canonicalReviewChanges();
    const coordinator = createFinancialActionPushCoordinator({
      markFinancialActionGroupSyncPending: () => {
        return Promise.reject(
          new Error("reconciled root cannot become sync_pending")
        );
      },
      markFinancialActionGroupSyncFailed: () => {
        return Promise.reject(
          new Error("reconciled root cannot fail transport")
        );
      },
      recordFinancialActionGroupServerOutcome: () => {
        return Promise.reject(new Error("reconciled root has no new outcome"));
      },
      invokeAccountFinancialActionRpc: () => {
        return Promise.reject(
          new Error("reconciled root must not be submitted")
        );
      },
    });
    const result = await coordinator.coordinatePush([
      {
        actionId: REVIEW_ACTION_ID,
        payloadHash: fixture.payloadHash,
        payloadJson: fixture.payloadJson,
        state: "reconciled",
      },
    ]);
    expect(result.decisions).toEqual([
      {
        actionId: REVIEW_ACTION_ID,
        disposition: "acknowledge",
        outcome: null,
      },
    ]);
  });

  it("T044-15 rejects legacy generic inverse compensation for a new review Bank+child+SMS action without verified local restoration", async () => {
    const fixture = await canonicalReviewChanges();
    const bundle = reviewRejectedBundle(fixture);
    expect(bundle.effects.map((effect) => effect.effectId)).toEqual([
      SMS_NET_EFFECT_ID,
    ]);
    expect(
      fixture.payload.domainMutation.records.some(
        (record) => record.entity === "account_sms_sender"
      )
    ).toBe(true);
    expect(fixture.payload.creationDefaultSnapshot).toBeDefined();
    expect(fixture.payload.localSmsBookkeeping).toHaveLength(2);
    const staged: string[] = [];
    const service = createFinancialActionReconciliationService({
      hashProvider: REVIEW_HASH_PROVIDER,
      loadReconciliationBundle: () => Promise.resolve(bundle),
      commitCompensationAtomically: (input) => {
        staged.push(input.actionId);
        return Promise.resolve();
      },
    });
    await expect(
      service.reconcileRejectedAction(REVIEW_ACTION_ID)
    ).rejects.toThrow(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INCOMPLETE);
    expect(staged).toEqual([]);
  });

  it("T044-16 refuses a foreign-user recovery bundle rather than mutating original owner's balances", async () => {
    const fixture = await canonicalReviewChanges();
    const original = reviewRejectedBundle(fixture);
    const bundle: FinancialActionReconciliationBundle = {
      ...original,
      userId: FOREIGN_OWNER_ID,
    };
    const staged: string[] = [];
    const service = createFinancialActionReconciliationService({
      hashProvider: REVIEW_HASH_PROVIDER,
      loadReconciliationBundle: () => Promise.resolve(bundle),
      commitCompensationAtomically: (input) => {
        staged.push(input.userId);
        return Promise.resolve();
      },
    });
    await expect(
      service.reconcileRejectedAction(REVIEW_ACTION_ID)
    ).rejects.toThrow(
      FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE
    );
    expect(staged).toEqual([]);
  });

  it("T044-16b generic reconciler refuses even terminal Review roots; only dedicated owned-private recovery may replay", async () => {
    const fixture = await canonicalReviewChanges();
    const rejected = reviewRejectedBundle(fixture);
    const previouslyReconciled: FinancialActionReconciliationBundle = {
      ...rejected,
      state: "reconciled",
      effects: rejected.effects.map((effect) => ({
        ...effect,
        isEffective: false,
      })),
    };
    const staged: string[] = [];
    const service = createFinancialActionReconciliationService({
      hashProvider: REVIEW_HASH_PROVIDER,
      loadReconciliationBundle: () => Promise.resolve(previouslyReconciled),
      commitCompensationAtomically: (input) => {
        staged.push(input.actionId);
        return Promise.resolve();
      },
    });
    // This deliberately has the old generic replay shape; terminality alone
    // cannot authorize an unverified new Review tuple in the legacy factory.
    // Production's owned/private dispatcher proves replay independently (D02).
    expect(previouslyReconciled.state).toBe("reconciled");
    expect(
      previouslyReconciled.effects.every(
        (effect) => effect.isEffective === false
      )
    ).toBe(true);
    await expect(
      service.reconcileRejectedAction(REVIEW_ACTION_ID)
    ).rejects.toThrow(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INCOMPLETE);
    expect(staged).toEqual([]);
  });

  it("T044-17 rejects generic zero-net inverse fallback for a Voice review root without changing its existing recovery boundary", async () => {
    const fixture = await canonicalReviewChanges("voice");
    const first = fixture.payload.accountEffects[0];
    if (!first) throw new Error("Missing zero-net Voice effect");
    const bundle: FinancialActionReconciliationBundle = {
      actionId: REVIEW_ACTION_ID,
      userId: REVIEW_USER_ID,
      state: "rejected_compensating",
      domain: "transactions",
      payloadJson: fixture.payloadJson,
      accounts: [
        {
          accountId: REVIEW_ACCOUNT_ID,
          currency: "EGP",
          balance: 100,
          financialRevision: "8",
        },
      ],
      effects: [
        {
          accountId: first.accountId,
          actionId: REVIEW_ACTION_ID,
          acceptedAccountRevision: "8",
          amountMinorUnits: "0",
          currency: "EGP",
          effectId: REVIEW_EFFECT_ID,
          isEffective: true,
          reversesEffectId: null,
        },
      ],
      localSmsReviewDraftSnapshot: null,
    };
    const staged: string[] = [];
    const service = createFinancialActionReconciliationService({
      hashProvider: REVIEW_HASH_PROVIDER,
      loadReconciliationBundle: () => Promise.resolve(bundle),
      commitCompensationAtomically: (input) => {
        staged.push(input.actionId);
        return Promise.resolve();
      },
    });
    await expect(
      service.reconcileRejectedAction(REVIEW_ACTION_ID)
    ).rejects.toThrow(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INCOMPLETE);
    expect(staged).toEqual([]);
    expect(fixture.payload.localSmsBookkeeping).toHaveLength(0);
  });
});
