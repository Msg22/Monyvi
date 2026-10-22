/**
 * #395 T069 zero-opening Add protected transport admission.
 *
 * Real canonical Add payload fixture, feature registry, serializer and
 * strict production protected-root inspector/collector. Sync rows model
 * the exact dirty Watermelon raw column contract; T069 A01–A04 separately
 * exercise the real committed SQLite writer and cold restart.
 *
 * No inspector, financial action builder, registry or collector is mocked.
 */
import { createHash } from "node:crypto";
import type {
  SyncPushArgs,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";
import {
  canonicalizeFinancialActionEnvelope,
  serializeFinancialActionEnvelope,
} from "@monyvi/logic";
import { createAccountDefaultAndReviewRegistry } from "../../../../../packages/logic/src/financial-actions/account-create-default-registration";
import {
  ADD_DEFAULT_CREATED_AT,
  ADD_DEFAULT_IDS,
  firstAccountPayload,
  makeAccountCreateDefaultPayload,
} from "../../../../../packages/logic/src/financial-actions/__tests__/account-create-default-test-fixtures";
import {
  collectAccountFinancialActionPushBundles,
  collectProtectedFinancialActionRowIds,
  isProtectedFinancialActionRow,
} from "../../../services/sync/account-protected-fields";

/**
 * Only isolate production's React Native database bootstrap for Jest. The
 * strict registered Add/Review inspector, financial collector, canonical
 * serializer and all zero/nonzero/foreign-root guards remain the actual SUT.
 *
 * Watermelon's real Node SQLite dispatcher, actual schema and generated
 * model classes replace the unavailable native WMDatabaseBridge; no in-memory
 * fake financial writer, transport permission or business-codec mock.
 */
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
    typeof import("../../../../../packages/db/src/schema")
  >("../../../../../packages/db/src/schema");
  const models = jest.requireActual<
    typeof import("../account-review-save-ledger-models")
  >("../account-review-save-ledger-models");
  const adapter = new Adapter({ schema });
  return {
    ...models,
    schema,
    database: new wm.Database({
      adapter,
      modelClasses: models.LEDGER_MODEL_CLASSES,
    }),
    __adapter: adapter,
  };
});
beforeAll(async (): Promise<void> => {
  const { __adapter } = jest.requireMock<{
    readonly __adapter: import("@nozbe/watermelondb/adapters/sqlite").default;
  }>("@monyvi/db");
  await __adapter.initializingPromise;
});

type AddPayload = ReturnType<typeof makeAccountCreateDefaultPayload>;
type SyncRow = SyncTableChangeSet["created"][number];
type SyncChanges = SyncPushArgs["changes"] & {
  financial_action_groups?: SyncTableChangeSet;
  account_financial_effects?: SyncTableChangeSet;
  accounts?: SyncTableChangeSet;
  bank_details?: SyncTableChangeSet;
  account_sms_senders?: SyncTableChangeSet;
};

function table(
  created: SyncTableChangeSet["created"] = [],
  updated: SyncTableChangeSet["updated"] = []
): SyncTableChangeSet {
  return { created: [...created], updated: [...updated], deleted: [] };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface AddProtectedFixture {
  readonly changes: SyncChanges;
  readonly actionId: string;
  readonly accountId: string;
  readonly payloadJson: string;
  readonly payloadHash: string;
}

/**
 * Use one real registered, closed Add envelope. Physical change rows are
 * projected from its validated actual domain mutation/effect membership,
 * not a separately invented account/business payload.
 */
function addDirtyChanges(payload: AddPayload): AddProtectedFixture {
  const account = payload.domainMutation.records.find(
    (item) => item.entity === "account" && item.mode === "create"
  );
  if (!account) throw new Error("missing_real_add_account_mutation");
  const accountId = account.after.id;
  const actionId = ADD_DEFAULT_IDS.action;
  const owner = ADD_DEFAULT_IDS.owner;

  const registry = createAccountDefaultAndReviewRegistry();
  const envelope = canonicalizeFinancialActionEnvelope(
    {
      accountGuards: payload.accountEffects.map((effect) => ({
        accountId: effect.accountId,
        expectedRevision: "0",
      })),
      actionId,
      domain: "accounts",
      domainReferenceId: accountId,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "create_with_default",
      occurredAt: ADD_DEFAULT_CREATED_AT,
      payload,
      payloadVersion: "account.create-default/v1",
      userId: owner,
    },
    registry
  );
  const payloadJson = serializeFinancialActionEnvelope(envelope, registry);
  const payloadHash = sha256(payloadJson);
  const changes: SyncChanges = {
    financial_action_groups: table([
      {
        id: actionId,
        action_id: actionId,
        user_id: owner,
        domain: envelope.domain,
        kind: envelope.kind,
        payload_hash: payloadHash,
        payload_json: payloadJson,
        state: "local_complete",
        _status: "created",
      },
    ]),
    accounts: table(
      payload.domainMutation.records.flatMap((item) =>
        item.entity === "account" && item.mode === "create"
          ? [
              {
                id: item.after.id,
                user_id: owner,
                deleted: false,
                balance: Number(item.after.openingBalanceMinorUnits) / 100,
                financial_revision: payload.accountEffects.length ? "1" : "0",
                is_default: item.after.isDefault,
                _status: "created",
              },
            ]
          : []
      ),
      payload.domainMutation.records.flatMap((item) =>
        item.entity === "account_default"
          ? [
              {
                id: item.after.id,
                user_id: owner,
                deleted: false,
                is_default: false,
                _status: "updated",
              },
            ]
          : []
      )
    ),
    bank_details: table(
      payload.domainMutation.records.flatMap((item) =>
        item.entity === "bank_details"
          ? [
              {
                id: item.after.id,
                account_id: item.after.accountId,
                deleted: false,
                _status: "created",
              },
            ]
          : []
      )
    ),
    account_sms_senders: table(
      payload.domainMutation.records.flatMap((item) =>
        item.entity === "account_sms_sender"
          ? [
              {
                id: item.after.id,
                account_id: item.after.accountId,
                deleted: false,
                _status: "created",
              },
            ]
          : []
      )
    ),
    account_financial_effects: table(
      payload.accountEffects.map((effect) => ({
        id: effect.effectId,
        action_id: actionId,
        user_id: owner,
        account_id: effect.accountId,
        amount_minor_units: effect.amountMinorUnits,
        currency: effect.currency,
        is_effective: true,
        _status: "created",
      }))
    ),
  };
  return { changes, actionId, accountId, payloadJson, payloadHash };
}

function replaceRoot(
  changes: SyncChanges,
  replace: (row: SyncRow) => SyncRow
): SyncChanges {
  const originals = changes.financial_action_groups;
  const original = originals?.created[0];
  if (!original || !originals || originals.created.length !== 1)
    throw new Error("missing_actual_canonical_root_fixture");
  return {
    ...changes,
    financial_action_groups: table([replace(original)], originals.updated),
  };
}

function changeSerializedEnvelope(
  changes: SyncChanges,
  modify: (
    original: Readonly<Record<string, unknown>>
  ) => Readonly<Record<string, unknown>>
): SyncChanges {
  return replaceRoot(changes, (root) => {
    if (typeof root.payload_json !== "string")
      throw new Error("missing_immutable_add_payload");
    const parsed: unknown = JSON.parse(root.payload_json);
    if (!isRecord(parsed)) throw new Error("invalid_original_add_envelope");
    const payloadJson = JSON.stringify(modify(parsed));
    return {
      ...root,
      payload_json: payloadJson,
      payload_hash: sha256(payloadJson),
    };
  });
}

function withCreatedEffect(
  changes: SyncChanges,
  replace: (row: SyncRow) => SyncRow
): SyncChanges {
  const effects = changes.account_financial_effects;
  const original = effects?.created[0];
  if (!effects || !original) throw new Error("missing_real_opening_effect");
  return {
    ...changes,
    account_financial_effects: table([replace(original)], effects.updated),
  };
}

function expectProtectedMembers(fixture: AddProtectedFixture): void {
  const envelopes = collectAccountFinancialActionPushBundles(fixture.changes);
  expect(envelopes).toHaveLength(1);
  const bundle = envelopes[0];
  if (!bundle) throw new Error("zero_opening_add_bundle_not_returned");
  expect(bundle.candidate).toEqual({
    actionId: fixture.actionId,
    payloadHash: fixture.payloadHash,
    payloadJson: fixture.payloadJson,
    state: "local_complete",
  });
  expect(bundle.rowIds.financial_action_groups).toEqual([fixture.actionId]);
  expect(bundle.rowIds.account_financial_effects).toBeUndefined();
  expect(bundle.rowIds.accounts).toContain(fixture.accountId);
  const protectedIds = collectProtectedFinancialActionRowIds(fixture.changes);
  expect(
    isProtectedFinancialActionRow(protectedIds, "accounts", fixture.accountId)
  ).toBe(true);
  for (const tableName of ["accounts", "bank_details", "account_sms_senders"]) {
    for (const id of bundle.rowIds[tableName] ?? []) {
      expect(isProtectedFinancialActionRow(protectedIds, tableName, id)).toBe(
        true
      );
    }
  }
}

describe("#395 T069 — exact zero-opening Add protected transport", () => {
  it("T069-Z01 first CASH with zero opening admits one immutable root/account and no fabricated effect", () => {
    const fixture = addDirtyChanges(firstAccountPayload(false));
    expect(fixture.changes.account_financial_effects?.created).toEqual([]);
    expectProtectedMembers(fixture);
    const bundle = collectAccountFinancialActionPushBundles(fixture.changes)[0];
    expect(bundle?.rowIds.accounts).toEqual([ADD_DEFAULT_IDS.newAccount]);
    expect(bundle?.rowIds.bank_details).toBeUndefined();
    expect(bundle?.rowIds.account_sms_senders).toBeUndefined();
  });

  it("T069-Z02 BANK zero opening includes exact created sender/details and prior-default clear", () => {
    const fixture = addDirtyChanges(
      makeAccountCreateDefaultPayload({
        accountType: "BANK",
        openingMinorUnits: "0",
        withBankDetails: true,
        withSender: true,
      })
    );
    expectProtectedMembers(fixture);
    const bundle = collectAccountFinancialActionPushBundles(fixture.changes)[0];
    expect(bundle?.rowIds.accounts).toEqual(
      [ADD_DEFAULT_IDS.newAccount, ADD_DEFAULT_IDS.previous].sort()
    );
    expect(bundle?.rowIds.bank_details).toEqual([ADD_DEFAULT_IDS.bankDetails]);
    expect(bundle?.rowIds.account_sms_senders).toEqual([
      ADD_DEFAULT_IDS.sender,
    ]);
    expect(bundle?.rowIds.account_financial_effects).toBeUndefined();
  });

  it("T069-Z03 WALLET zero opening protects sender and current default while omitting non-existent bank details", () => {
    const fixture = addDirtyChanges(
      makeAccountCreateDefaultPayload({
        accountType: "DIGITAL_WALLET",
        openingMinorUnits: "0",
        withBankDetails: false,
        withSender: true,
      })
    );
    expectProtectedMembers(fixture);
    const bundle = collectAccountFinancialActionPushBundles(fixture.changes)[0];
    expect(bundle?.rowIds.bank_details).toBeUndefined();
    expect(bundle?.rowIds.account_sms_senders).toEqual([
      ADD_DEFAULT_IDS.sender,
    ]);
    expect(bundle?.rowIds.accounts).toEqual(
      [ADD_DEFAULT_IDS.newAccount, ADD_DEFAULT_IDS.previous].sort()
    );
  });

  it("T069-Z04 nonzero Add continues to require its single guard and real complete effect", () => {
    const fixture = addDirtyChanges(
      makeAccountCreateDefaultPayload({
        openingMinorUnits: "1001",
      })
    );
    const bundles = collectAccountFinancialActionPushBundles(fixture.changes);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.rowIds.account_financial_effects).toEqual([
      ADD_DEFAULT_IDS.effect,
    ]);
    expect(bundles[0]?.rowIds.accounts).toContain(ADD_DEFAULT_IDS.newAccount);
  });

  it("T069-Z05 refuses a nonzero Add root stripped of its financial account guard", () => {
    const fixture = addDirtyChanges(
      makeAccountCreateDefaultPayload({
        openingMinorUnits: "1001",
      })
    );
    const forged = changeSerializedEnvelope(fixture.changes, (raw) => ({
      ...raw,
      accountGuards: [],
    }));
    expect(() => collectAccountFinancialActionPushBundles(forged)).toThrow(
      "financial_action_invalid_envelope"
    );
  });

  it("T069-Z06 refuses a zero Add with a forged revision guard", () => {
    const fixture = addDirtyChanges(firstAccountPayload());
    const forged = changeSerializedEnvelope(fixture.changes, (raw) => ({
      ...raw,
      accountGuards: [
        {
          accountId: fixture.accountId,
          expectedRevision: "0",
        },
      ],
    }));
    expect(() => collectAccountFinancialActionPushBundles(forged)).toThrow();
  });

  it("T069-Z07 refuses missing/mismatched nonzero financial effect, never fabricates a zero row", () => {
    const fixture = addDirtyChanges(
      makeAccountCreateDefaultPayload({
        openingMinorUnits: "1001",
      })
    );
    const original = fixture.changes.account_financial_effects;
    if (!original) throw new Error("expected_nonzero_physical_effect");
    const absent: SyncChanges = {
      ...fixture.changes,
      account_financial_effects: table([], original.updated),
    };
    expect(() => collectAccountFinancialActionPushBundles(absent)).toThrow();
    const wrongAmount = withCreatedEffect(fixture.changes, (effect) => ({
      ...effect,
      amount_minor_units: "1000",
    }));
    expect(() =>
      collectAccountFinancialActionPushBundles(wrongAmount)
    ).toThrow();
  });

  it("T069-Z08 refuses extra fabricated zero financial effect on otherwise valid Add", () => {
    const fixture = addDirtyChanges(firstAccountPayload());
    const forged: SyncChanges = {
      ...fixture.changes,
      account_financial_effects: table([
        {
          id: ADD_DEFAULT_IDS.effect,
          action_id: fixture.actionId,
          user_id: ADD_DEFAULT_IDS.owner,
          account_id: fixture.accountId,
          amount_minor_units: "0",
          currency: "EGP",
          _status: "created",
        },
      ]),
    };
    expect(() => collectAccountFinancialActionPushBundles(forged)).toThrow();
  });

  it("T069-Z09 rejects wrong tuple and owner even with a valid Add-shaped root/children", () => {
    const fixture = addDirtyChanges(firstAccountPayload());
    const wrongTuple = replaceRoot(fixture.changes, (root) => ({
      ...root,
      kind: "review_batch_save",
    }));
    expect(() =>
      collectAccountFinancialActionPushBundles(wrongTuple)
    ).toThrow();
    const foreignRoot = replaceRoot(fixture.changes, (root) => ({
      ...root,
      user_id: ADD_DEFAULT_IDS.foreignOwner,
    }));
    expect(() =>
      collectAccountFinancialActionPushBundles(foreignRoot)
    ).toThrow();
  });

  it("T069-Z10 rejects missing bank/details/sender membership and wrong child parent", () => {
    const fixture = addDirtyChanges(
      makeAccountCreateDefaultPayload({
        accountType: "BANK",
        openingMinorUnits: "0",
      })
    );
    const details = fixture.changes.bank_details;
    const senders = fixture.changes.account_sms_senders;
    const detail = details?.created[0];
    if (!details || !senders || !detail)
      throw new Error("missing_canonical_child_fixture");
    for (const changes of [
      { ...fixture.changes, bank_details: table([]) },
      { ...fixture.changes, account_sms_senders: table([]) },
      {
        ...fixture.changes,
        bank_details: table([
          {
            ...detail,
            account_id: ADD_DEFAULT_IDS.previous,
          },
        ]),
      },
    ]) {
      expect(() => collectAccountFinancialActionPushBundles(changes)).toThrow();
    }
  });

  it("T069-Z11 refuses a legacy empty-guard balance root rather than borrowing the Add exception", () => {
    const fixture = addDirtyChanges(firstAccountPayload());
    const legacyJson = JSON.stringify({
      payloadVersion: "account.balance-effects/v1",
      accountGuards: [],
      payload: {
        domainMutation: {
          records: [
            {
              entity: "account",
              after: { id: fixture.accountId },
            },
          ],
        },
      },
    });
    const legacy = replaceRoot(fixture.changes, (root) => ({
      ...root,
      kind: "create",
      payload_json: legacyJson,
      payload_hash: sha256(legacyJson),
    }));
    expect(() => collectAccountFinancialActionPushBundles(legacy)).toThrow(
      "account_financial_action_malformed_root"
    );
  });

  it("T069-Z12 refuses an attempted Review tuple with zero guards and an Add payload", () => {
    const fixture = addDirtyChanges(firstAccountPayload());
    const forged = changeSerializedEnvelope(fixture.changes, (raw) => ({
      ...raw,
      domain: "transactions",
      kind: "review_batch_save",
      payloadVersion: "review.batch-save/v1",
    }));
    expect(() => collectAccountFinancialActionPushBundles(forged)).toThrow();
  });
});
