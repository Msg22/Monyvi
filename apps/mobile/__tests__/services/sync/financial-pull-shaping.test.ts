import { AccountFinancialEffect } from "../../../../../packages/db/src/models/AccountFinancialEffect";
import { FinancialActionGroup } from "../../../../../packages/db/src/models/FinancialActionGroup";
import { schema } from "../../../../../packages/db/src/schema";
import {
  serializeFinancialActionEnvelope,
  type FinancialActionState,
} from "@monyvi/logic";
import {
  Database as WatermelonDatabase,
  type Database,
} from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { synchronize, type SyncPullResult } from "@nozbe/watermelondb/sync";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", () =>
  jest.requireActual<Record<string, unknown>>(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);

jest.unmock("@nozbe/watermelondb/sync");

import {
  type FinancialPullRow,
  FINANCIAL_PULL_SHAPING_ERROR_CODE,
  shapeAccountFinancialEffectPull,
  shapeFinancialActionRootPull,
} from "../../../services/sync/financial-pull-shaping";

const USER = "11111111-1111-4111-8111-111111111111";
const FOREIGN = "22222222-2222-4222-8222-222222222222";
const ACCOUNT = "33333333-3333-4333-8333-333333333333";
const DOMAIN_REF = "44444444-4444-4444-8444-444444444444";
const EFFECT_ID = "55555555-5555-4555-8555-555555555555";
const REVERSAL_ID = "66666666-6666-4666-8666-666666666666";
const HASH = "a".repeat(64);
const NOW = Date.parse("2026-10-08T00:00:00.000Z");

const UNRESOLVED = [
  "pending_local",
  "local_complete",
  "sync_pending",
  "sync_failed",
  "rejected_compensating",
  "reconciliation_incomplete",
] as const satisfies readonly FinancialActionState[];

let sequence = 0;

function actionId(index: number): string {
  return `70000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function rootId(index: number): string {
  return `71000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function serverRootId(index: number): string {
  return `72000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function envelope(action: string): Readonly<Record<string, unknown>> {
  return {
    accountGuards: [
      {
        accountId: ACCOUNT,
        expectedRevision: "7",
      },
    ],
    actionId: action,
    domain: "transactions",
    domainReferenceId: DOMAIN_REF,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "create",
    occurredAt: "2026-10-08T00:00:00.000Z",
    payload: {
      accountEffects: [
        {
          accountId: ACCOUNT,
          amountMinorUnits: "125",
          currency: "EGP",
          effectId: EFFECT_ID,
        },
      ],
      domainMutation: {
        records: [
          {
            after: {
              accountId: ACCOUNT,
              amountMinorUnits: "125",
              categoryId: REVERSAL_ID,
              counterparty: null,
              createdAt: "2026-10-08T00:00:00.000Z",
              currency: "EGP",
              date: "2026-10-08",
              deleted: false,
              id: DOMAIN_REF,
              isDraft: false,
              linkedAssetId: null,
              linkedDebtId: null,
              linkedRecurringId: null,
              note: null,
              smsFingerprint: null,
              source: "MANUAL",
              type: "INCOME",
            },
            entity: "transaction",
            expectedUpdatedAt: null,
            mode: "create",
          },
        ],
      },
      domainRecordRefs: [DOMAIN_REF],
      operationCode: "transaction.create",
      schemaVersion: "account.balance-effects/v1",
    },
    payloadVersion: "account.balance-effects/v1",
    userId: USER,
  };
}

function reverseJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reverseJsonKeys);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, child]) => [key, reverseJsonKeys(child)])
  );
}

function serverPayload(action: string): string {
  const canonical = serializeFinancialActionEnvelope(envelope(action));
  return JSON.stringify(reverseJsonKeys(JSON.parse(canonical)), null, 2);
}

function rootRaw(
  index: number,
  state: FinancialActionState
): Record<string, unknown> {
  const action = actionId(index);
  return {
    id: rootId(index),
    account_guards_json: JSON.stringify([
      { accountId: ACCOUNT, expectedRevision: "7" },
    ]),
    action_id: action,
    created_at: NOW,
    deleted: false,
    domain: "transactions",
    domain_reference_id: DOMAIN_REF,
    kind: "create",
    outcome_json: null,
    payload_hash: HASH,
    payload_json: serializeFinancialActionEnvelope(envelope(action)),
    rejection_code: null,
    server_outcome: null,
    state,
    updated_at: NOW,
    user_id: USER,
  };
}

function serverRoot(
  index: number,
  overrides: Record<string, unknown> = {}
): FinancialPullRow {
  const action = actionId(index);
  return {
    id: serverRootId(index),
    action_id: action,
    user_id: USER,
    domain: "transactions",
    domain_reference_id: DOMAIN_REF,
    kind: "create",
    payload_hash: HASH,
    payload_json_text: serverPayload(action),
    deleted: false,
    ...overrides,
  };
}

function effectRaw(
  action: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: EFFECT_ID,
    accepted_account_revision: "8",
    account_id: ACCOUNT,
    action_id: action,
    amount_minor_units: "125",
    compensated_at: null,
    created_at: NOW,
    currency: "EGP",
    deleted: false,
    domain: "transactions",
    is_effective: true,
    kind: "credit",
    reverses_effect_id: null,
    updated_at: NOW,
    user_id: USER,
    ...overrides,
  };
}

function serverEffect(
  action: string,
  overrides: Record<string, unknown> = {}
): FinancialPullRow {
  return {
    id: EFFECT_ID,
    accepted_account_revision_text: "8",
    account_id: ACCOUNT,
    action_id: action,
    amount_minor_units_text: "125",
    compensated_at: "2026-10-08T00:05:00.000+00:00",
    currency: "EGP",
    deleted: false,
    domain: "transactions",
    is_effective: false,
    kind: "credit",
    reverses_effect_id: null,
    user_id: USER,
    ...overrides,
  };
}

async function database(): Promise<Database> {
  sequence += 1;
  const adapter = new SQLiteAdapter({
    schema,
    dbName: `file:financial-pull-shaping-${sequence}?mode=memory&cache=shared`,
  });
  await adapter.initializingPromise;
  return new WatermelonDatabase({
    adapter,
    modelClasses: [FinancialActionGroup, AccountFinancialEffect],
  });
}

async function dirtyRoot(
  db: Database,
  index: number,
  state: FinancialActionState
): Promise<FinancialActionGroup> {
  return db.write(async () => {
    const root = db
      .get<FinancialActionGroup>("financial_action_groups")
      .prepareCreateFromDirtyRaw(rootRaw(index, state));
    await db.batch(root);
    return root;
  });
}

async function dirtyEffect(
  db: Database,
  action: string
): Promise<AccountFinancialEffect> {
  return db.write(async () => {
    const effect = db
      .get<AccountFinancialEffect>("account_financial_effects")
      .prepareCreateFromDirtyRaw(effectRaw(action));
    await db.batch(effect);
    return effect;
  });
}

function metalEnvelope(
  action: string,
  purchaseDate = "2020-08-30",
  occurredAt = "2020-08-30T10:16:00.123Z"
): Readonly<Record<string, unknown>> {
  return {
    accountGuards: [],
    actionId: action,
    domain: "metals",
    domainReferenceId: DOMAIN_REF,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "add",
    occurredAt,
    payloadVersion: "metals.add/v1",
    userId: USER,
    payload: {
      holdingId: DOMAIN_REF,
      expectedHoldingRevision: null,
      predecessorEventId: null,
      reversesEventId: null,
      metalType: "GOLD",
      metadata: { name: "Saved gold", notes: null },
      materialFacts: {
        physicalForm: "JEWELRY",
        weightGramsDecimal: "10.25",
        purityCode: "gold-9999",
        purityFactorDecimal: "0.9999",
        purityCatalogVersion: "1",
        purchasePriceDecimal: "150000",
        purchaseCurrency: "EGP",
        purchaseDate,
      },
      rateSnapshots: metalAcquisitionSnapshots(),
    },
  };
}
function metalAcquisitionSnapshots(): ReadonlyArray<Record<string, string>> {
  return [
    {
      referenceId: EFFECT_ID,
      role: "acquisition_metal",
      kind: "metal",
      instrumentCode: "metal:GOLD",
      valueDecimal: "3510.5",
      unit: "usd_per_pure_gram",
    },
    {
      referenceId: REVERSAL_ID,
      role: "acquisition_purchase_currency",
      kind: "currency",
      instrumentCode: "currency:EGP",
      valueDecimal: "0.02",
      unit: "usd_per_currency_unit",
    },
  ].map((row) => ({
    ...row,
    orientation: "quote_per_base",
    providerObservedAt: "2020-08-30T10:15:30.123Z",
    source: "provider-a",
    quality: "valid",
    capturedFreshness: "fresh",
    capturedAt: "2020-08-30T10:16:00.123Z",
  }));
}

describe("#255 financial pull shaping", () => {
  it("preserves a creation-valid Cairo-next-day collision on a UTC device without accepting changed semantics", async () => {
    const db = await database();
    jest.useFakeTimers({
      now: Date.parse("2026-10-08T21:30:00.000Z"),
      doNotFake: [
        "hrtime",
        "nextTick",
        "performance",
        "queueMicrotask",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "requestIdleCallback",
        "cancelIdleCallback",
        "setImmediate",
        "clearImmediate",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
    // Model UTC device-local getters independently of the runner's timezone.
    // Intl's explicit Africa/Cairo conversion still uses the real instant.
    const year = jest
      .spyOn(Date.prototype, "getFullYear")
      .mockImplementation(function (this: Date): number {
        return this.getUTCFullYear();
      });
    const month = jest
      .spyOn(Date.prototype, "getMonth")
      .mockImplementation(function (this: Date): number {
        return this.getUTCMonth();
      });
    const day = jest
      .spyOn(Date.prototype, "getDate")
      .mockImplementation(function (this: Date): number {
        return this.getUTCDate();
      });
    try {
      expect(new Date().getDate()).toBe(8);
      const index = 91;
      const payload = serializeFinancialActionEnvelope(
        metalEnvelope(
          actionId(index),
          "2026-10-09",
          "2026-10-08T21:30:00.000Z"
        ),
        undefined,
        { latestAllowedCalendarDate: "2026-10-09" }
      );
      const root = await db.write(async (): Promise<FinancialActionGroup> => {
        const record = db
          .get<FinancialActionGroup>("financial_action_groups")
          .prepareCreateFromDirtyRaw({
            ...rootRaw(index, "sync_failed"),
            account_guards_json: "[]",
            domain: "metals",
            kind: "add",
            payload_json: payload,
          });
        await db.batch(record);
        return record;
      });
      const before = { ...root._raw };
      const remote = serverRoot(index, {
        domain: "metals",
        kind: "add",
        payload_json_text: JSON.stringify(
          reverseJsonKeys(JSON.parse(payload)),
          null,
          2
        ),
      });

      await expect(
        shapeFinancialActionRootPull(db, USER, [remote])
      ).resolves.toEqual([]);
      expect(root._raw).toEqual(before);
      await expect(
        shapeFinancialActionRootPull(db, USER, [
          {
            ...remote,
            payload_json_text: payload.replace('"150000"', '"150001"'),
          },
        ])
      ).rejects.toThrow(FINANCIAL_PULL_SHAPING_ERROR_CODE);
      expect(root._raw).toEqual(before);
    } finally {
      day.mockRestore();
      month.mockRestore();
      year.mockRestore();
      jest.useRealTimers();
      await db.write(() => db.unsafeResetDatabase());
    }
  });

  it("preserves a valid unresolved Metals Add with canonical date validation and rejects changed semantics", async () => {
    const db = await database();
    try {
      const payload = serializeFinancialActionEnvelope(
        metalEnvelope(actionId(90)),
        undefined,
        { latestAllowedCalendarDate: "2020-09-01" }
      );
      const root = await db.write(async () => {
        const record = db
          .get<FinancialActionGroup>("financial_action_groups")
          .prepareCreateFromDirtyRaw({
            ...rootRaw(90, "sync_pending"),
            domain: "metals",
            kind: "add",
            payload_json: payload,
          });
        await db.batch(record);
        return record;
      });
      const remote = serverRoot(90, {
        domain: "metals",
        kind: "add",
        payload_json_text: JSON.stringify(
          reverseJsonKeys(JSON.parse(payload)),
          null,
          2
        ),
      });
      await expect(
        shapeFinancialActionRootPull(db, USER, [remote])
      ).resolves.toEqual([]);
      expect(root.state).toBe("sync_pending");
      expect(root.payloadJson).toBe(payload);
      await expect(
        shapeFinancialActionRootPull(db, USER, [
          {
            ...remote,
            payload_json_text: payload.replace('"150000"', '"150001"'),
          },
        ])
      ).rejects.toThrow(FINANCIAL_PULL_SHAPING_ERROR_CODE);
    } finally {
      await db.write(() => db.unsafeResetDatabase());
    }
  });

  it("preserves all six unresolved local root states regardless of dirty status and accepts semantically identical jsonb text", async () => {
    const db = await database();

    try {
      const roots = await Promise.all(
        UNRESOLVED.map((state, index) => dirtyRoot(db, index + 1, state))
      );

      const before = roots.map((root) => ({
        id: root.id,
        payloadJson: root.payloadJson,
        state: root.state,
        status: root._raw._status,
      }));

      const shaped = await shapeFinancialActionRootPull(
        db,
        USER,
        UNRESOLVED.map((_state, index) => serverRoot(index + 1))
      );

      expect(shaped).toEqual([]);
      expect(
        roots.map((root) => ({
          id: root.id,
          payloadJson: root.payloadJson,
          state: root.state,
          status: root._raw._status,
        }))
      ).toEqual(before);

      expect(serverPayload(actionId(1))).not.toBe(roots[0].payloadJson);
    } finally {
      await db.write(() => db.unsafeResetDatabase());
    }
  });

  it("suppresses a synchronized unresolved root too; shaping does not depend on Watermelon dirty state", async () => {
    const db = await database();
    const index = 20;

    try {
      const pull: SyncPullResult = {
        changes: {
          financial_action_groups: {
            created: [],
            updated: [rootRaw(index, "sync_failed")],
            deleted: [],
          },
        },
        timestamp: NOW,
      };

      await synchronize({
        database: db,
        pullChanges: () => Promise.resolve(pull),
        pushChanges: () => Promise.resolve(),
        sendCreatedAsUpdated: true,
      });

      const root = (
        await db
          .get<FinancialActionGroup>("financial_action_groups")
          .query()
          .fetch()
      )[0];

      expect(root._raw._status).toBe("synced");

      await expect(
        shapeFinancialActionRootPull(db, USER, [serverRoot(index)])
      ).resolves.toEqual([]);

      expect(root.state).toBe("sync_failed");
      expect(root.id).toBe(rootId(index));
    } finally {
      await db.write(() => db.unsafeResetDatabase());
    }
  });

  it("fails closed on a genuine unresolved root hash or semantic payload mismatch", async () => {
    const db = await database();

    try {
      await dirtyRoot(db, 30, "pending_local");

      await expect(
        shapeFinancialActionRootPull(db, USER, [
          serverRoot(30, { payload_hash: "b".repeat(64) }),
        ])
      ).rejects.toThrow(FINANCIAL_PULL_SHAPING_ERROR_CODE);

      const changed = {
        ...envelope(actionId(30)),
        occurredAt: "2026-10-08T00:00:01.000Z",
      };

      await expect(
        shapeFinancialActionRootPull(db, USER, [
          serverRoot(30, {
            payload_json_text: JSON.stringify(changed, null, 2),
          }),
        ])
      ).rejects.toThrow(FINANCIAL_PULL_SHAPING_ERROR_CODE);
    } finally {
      await db.write(() => db.unsafeResetDatabase());
    }
  });

  it("keeps unresolved root persistence ID and optimistic effect flags untouched when immutable effect identity matches", async () => {
    const db = await database();
    const action = actionId(40);

    try {
      const root = await dirtyRoot(db, 40, "local_complete");
      const effect = await dirtyEffect(db, action);

      const roots = await shapeFinancialActionRootPull(db, USER, [
        serverRoot(40),
      ]);
      const effects = await shapeAccountFinancialEffectPull(db, USER, [
        serverEffect(action),
      ]);

      expect(roots).toEqual([]);
      expect(effects).toEqual([]);

      expect(root.id).toBe(rootId(40));
      expect(root.state).toBe("local_complete");
      expect(root.payloadHash).toBe(HASH);
      expect(root.payloadJson).toBe(
        serializeFinancialActionEnvelope(envelope(action))
      );

      expect(effect.id).toBe(EFFECT_ID);
      expect(effect.actionId).toBe(action);
      expect(effect.isEffective).toBe(true);
      expect(effect.compensatedAt).toBeNull();
      expect(effect.amountMinorUnits).toBe("125");
      expect(effect.acceptedAccountRevision).toBe("8");
    } finally {
      await db.write(() => db.unsafeResetDatabase());
    }
  });

  it("fails closed for same effect persistence ID when any immutable identity field disagrees", async () => {
    const db = await database();
    const action = actionId(50);

    try {
      await dirtyRoot(db, 50, "sync_pending");
      // Both action IDs are unresolved; the same persisted effect cannot belong to both.
      await dirtyRoot(db, 51, "sync_pending");
      await dirtyEffect(db, action);

      const mismatches: ReadonlyArray<Record<string, unknown>> = [
        { action_id: actionId(51) },
        { account_id: "88888888-8888-4888-8888-888888888888" },
        { domain: "transfers" },
        { kind: "debit" },
        { currency: "USD" },
        { amount_minor_units_text: "126" },
        { accepted_account_revision_text: "9" },
        { reverses_effect_id: REVERSAL_ID },
      ];

      for (const mismatch of mismatches) {
        await expect(
          shapeAccountFinancialEffectPull(db, USER, [
            serverEffect(action, mismatch),
          ])
        ).rejects.toThrow(FINANCIAL_PULL_SHAPING_ERROR_CODE);
      }
    } finally {
      await db.write(() => db.unsafeResetDatabase());
    }
  });

  it("hydrates missing/independent rows, remaps settled roots, and rejects foreign scope", async () => {
    const db = await database();

    try {
      const missing = serverRoot(60);

      await expect(
        shapeFinancialActionRootPull(db, USER, [missing])
      ).resolves.toEqual([missing]);

      const settled = await dirtyRoot(db, 61, "accepted");
      const terminal = serverRoot(61);

      await expect(
        shapeFinancialActionRootPull(db, USER, [terminal])
      ).resolves.toEqual([
        expect.objectContaining({
          id: settled.id,
          action_id: actionId(61),
        }),
      ]);

      await expect(
        shapeAccountFinancialEffectPull(db, USER, [serverEffect(actionId(60))])
      ).resolves.toEqual([serverEffect(actionId(60))]);

      await expect(
        shapeFinancialActionRootPull(db, USER, [
          serverRoot(62, { user_id: FOREIGN }),
        ])
      ).rejects.toThrow(FINANCIAL_PULL_SHAPING_ERROR_CODE);

      await expect(
        shapeAccountFinancialEffectPull(db, USER, [
          serverEffect(actionId(62), { user_id: FOREIGN }),
        ])
      ).rejects.toThrow(FINANCIAL_PULL_SHAPING_ERROR_CODE);
    } finally {
      await db.write(() => db.unsafeResetDatabase());
    }
  });
});
