/**
 * #395 C1 — TEST FIRST: live ATM's first Cash destination is local before
 * its guarded transfer action, but the server effect helper requires that
 * same owner-owned destination to be remotely present at RPC execution.
 *
 * Real createSmsAtmTransfer -> ensureCashAccount -> guarded core/foundation
 * writer -> Watermelon SQLite -> protected SDK push -> real action coordinator.
 * Only authenticated transport, PostgREST and the bounded SQL076 remote
 * destination lookup are simulated by the existing SQLite sync fixture.
 *
 * The first test REQUIRES successful remote publication and is expected RED
 * until the account prerequisite is actually handled. It must not be rewritten
 * to expect the current NOT_OWNED response as a passing assertion.
 * AUTHORED ONLY; execution and SQL-backed validation belong to Root.
 */
import { randomUUID as nodeRandomUUID } from "node:crypto";
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";

import {
  OWNER,
  FOREIGN,
  Q,
  ledger,
  mockFinancialTransport,
  mockUpserts,
  realSynchronize,
  actionCoordinator,
  syncFixtureControls,
  form,
  createAccountDefaultIntentService,
  getCurrentUserDataScope,
  assertExpectedCurrentUser,
  assertNoDuplicateAddAccountIdentity,
  hashProvider,
  randomUUID,
  type AccountDefaultPreparedCommand,
  type SyncPullResult,
} from "./account-create-default-sync-lifecycle-fixtures";
import { parseAccountCreateDefaultLocalRecoverySnapshotJson } from "../../../../../packages/logic/src/financial-actions/account-create-default-local-recovery";
import { verifyActualZeroOpeningCashCreator } from "./atm-cash-prerequisite-creator-evidence";
import { createSmsAtmTransfer } from "@/services/transfer-service";
import type {
  Account,
  AccountFinancialEffect,
  FinancialActionGroup,
  Transfer,
} from "@monyvi/db";

const BANK_ID = "3a000000-0000-4000-8000-000000000001";
const REMOTE_CASH_ID = "3a000000-0000-4000-8000-000000000002";
const FIXTURE_AT = new Date("2026-10-18T03:00:00.000Z");
const ORIGINAL_REMOTE_ACCOUNT_AT = new Date("2026-10-14T12:00:00.000Z");
const FINGERPRINT_FIRST = "a".repeat(64);
const FINGERPRINT_EXISTING = "b".repeat(64);

interface OwnedRemoteAccount {
  readonly id: string;
  readonly userId: string;
  readonly type: "BANK" | "CASH";
  readonly currency: "EGP" | "USD";
}
interface AccountEffectWire {
  readonly accountId: string;
  readonly amountMinorUnits: string;
  readonly currency: string;
}
interface TransferWire {
  readonly actionId: string;
  readonly ownerId: string;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly currency: string;
  readonly records: readonly unknown[];
  readonly effects: readonly AccountEffectWire[];
  readonly guards: readonly unknown[];
}
interface RemoteCall {
  readonly actionId: string;
  readonly destinationId: string;
  readonly destinationPresent: boolean;
  readonly accountPublishedBeforeRpc: boolean;
}
interface BoundedServer {
  readonly calls: RemoteCall[];
  readonly applied: Map<string, readonly AccountEffectWire[]>;
  readonly invoke: (input: {
    readonly payloadHash: string;
    readonly payloadJson: string;
  }) => Promise<unknown>;
}

function failFixture(reason: string): never {
  throw new Error("atm_cash_fixture_" + reason);
}
function object(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function unknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
function requiredString(
  value: Readonly<Record<string, unknown>>,
  field: string
): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== "string" || fieldValue.length === 0)
    failFixture("missing_" + field);
  return fieldValue;
}
function parseRealTransferPayload(payloadJson: string): TransferWire {
  const raw: unknown = JSON.parse(payloadJson);
  if (!object(raw) || raw.domain !== "transfers" || raw.kind !== "create")
    failFixture("wrong_real_action_tuple");
  if (raw.payloadVersion !== "account.balance-effects/v1")
    failFixture("unexpected_payload_version");
  const payload = raw.payload;
  if (!object(payload) || !object(payload.domainMutation))
    failFixture("invalid_real_action_payload");
  const mutations: unknown = payload.domainMutation.records;
  const effects: unknown = payload.accountEffects;
  if (!unknownArray(mutations) || !unknownArray(effects))
    failFixture("missing_real_financial_records");
  if (mutations.length !== 1) failFixture("not_transfer_only_mutation");
  const transfer: unknown = mutations[0];
  if (
    !object(transfer) ||
    transfer.entity !== "transfer" ||
    transfer.mode !== "create" ||
    !object(transfer.after)
  )
    failFixture("not_guarded_transfer_creation");
  const after = transfer.after;
  const typedEffects: AccountEffectWire[] = effects.map((effect: unknown) => {
    if (!object(effect)) failFixture("invalid_account_effect");
    return {
      accountId: requiredString(effect, "accountId"),
      amountMinorUnits: requiredString(effect, "amountMinorUnits"),
      currency: requiredString(effect, "currency"),
    };
  });
  const guards: unknown = raw.accountGuards;
  if (!unknownArray(guards) || guards.length !== 2)
    failFixture("missing_two_account_revision_guards");
  return {
    actionId: requiredString(raw, "actionId"),
    ownerId: requiredString(raw, "userId"),
    fromAccountId: requiredString(after, "fromAccountId"),
    toAccountId: requiredString(after, "toAccountId"),
    currency: requiredString(after, "currency"),
    records: mutations,
    effects: typedEffects,
    guards,
  };
}

/**
 * Deterministic boundary for real SQL076's SELECT ... INTO STRICT on the
 * transfer after.toAccountId. It observes actual PostgREST upserts made by the
 * production push; it does not fabricate a Cash publication or execute SQL.
 * The destination must be present for this actor at the instant RPC arrives.
 */
function boundedSqlDestinationServer(
  remoteExisting: readonly OwnedRemoteAccount[]
): BoundedServer {
  const remote = new Map<string, OwnedRemoteAccount>(
    remoteExisting.map((row): readonly [string, OwnedRemoteAccount] => [
      row.id,
      row,
    ])
  );
  const calls: RemoteCall[] = [];
  const applied = new Map<string, readonly AccountEffectWire[]>();
  let consumedUpserts = mockUpserts.length;
  const refreshPublishedAccounts = (): void => {
    for (const write of mockUpserts.slice(consumedUpserts)) {
      if (write.table !== "accounts") continue;
      for (const record of write.rows) {
        if (
          typeof record.id !== "string" ||
          record.user_id !== OWNER ||
          record.deleted === true ||
          (record.type !== "CASH" && record.type !== "BANK") ||
          (record.currency !== "EGP" && record.currency !== "USD")
        )
          continue;
        remote.set(record.id, {
          id: record.id,
          userId: record.user_id,
          type: record.type,
          currency: record.currency,
        });
      }
    }
    consumedUpserts = mockUpserts.length;
  };
  return {
    calls,
    applied,
    invoke: async (input): Promise<unknown> => {
      const creator = await verifyActualZeroOpeningCashCreator({
        database: ledger.database,
        ownerId: OWNER,
        payloadHash: input.payloadHash,
        payloadJson: input.payloadJson,
        hashProvider,
        nowIso: FIXTURE_AT.toISOString(),
      });
      refreshPublishedAccounts();
      if (creator) {
        const previous = remote.get(creator.account.id);
        if (
          previous &&
          (previous.userId !== creator.account.userId ||
            previous.type !== creator.account.type ||
            previous.currency !== creator.account.currency)
        )
          failFixture("remote_cash_creator_identity_conflict");
        if (!previous) remote.set(creator.account.id, creator.account);
        return creator.outcome;
      }
      const wire = parseRealTransferPayload(input.payloadJson);
      const destination = remote.get(wire.toAccountId);
      const source = remote.get(wire.fromAccountId);
      const destinationPresent =
        destination?.userId === wire.ownerId &&
        destination.currency === wire.currency &&
        destination.type === "CASH";
      calls.push({
        actionId: wire.actionId,
        destinationId: wire.toAccountId,
        destinationPresent,
        accountPublishedBeforeRpc: mockUpserts.some(
          (write) =>
            write.table === "accounts" &&
            write.rows.some((row) => row.id === wire.toAccountId)
        ),
      });
      if (
        wire.ownerId !== OWNER ||
        source?.userId !== wire.ownerId ||
        source.currency !== wire.currency ||
        !destinationPresent
      ) {
        return Promise.resolve({
          actionId: wire.actionId,
          status: "rejected",
          code: "NOT_OWNED",
        });
      }
      const prior = applied.get(wire.actionId);
      if (prior) {
        return Promise.resolve({
          actionId: wire.actionId,
          status: "idempotent",
          accountRevisions: [],
          effectiveEventId: null,
          holdingRevision: null,
          serverAcceptedAt: FIXTURE_AT.toISOString(),
        });
      }
      // The only server-side state is a once-only action/effect ledger. Local
      // domain/account/financial writers are never mocked or intercepted.
      applied.set(wire.actionId, wire.effects);
      return Promise.resolve({
        actionId: wire.actionId,
        status: "accepted",
        accountRevisions: [],
        effectiveEventId: null,
        holdingRevision: null,
        serverAcceptedAt: FIXTURE_AT.toISOString(),
      });
    },
  };
}
function remoteAccountRaw(
  id: string,
  type: "BANK" | "CASH",
  balance: number,
  isDefault: boolean
): Readonly<Record<string, unknown>> {
  return {
    id,
    user_id: OWNER,
    name: type === "BANK" ? "Owned EGP bank" : "Already remote EGP Cash",
    type,
    currency: "EGP",
    balance,
    financial_revision: "0",
    is_default: isDefault,
    deleted: false,
    created_at: ORIGINAL_REMOTE_ACCOUNT_AT.getTime(),
    updated_at: ORIGINAL_REMOTE_ACCOUNT_AT.getTime(),
  };
}

/** Seed real local rows through the actual protected Watermelon SDK pull. */
async function loadRemoteAccounts(existingCash: boolean): Promise<void> {
  const created = [remoteAccountRaw(BANK_ID, "BANK", 100, true)];
  if (existingCash)
    created.push(remoteAccountRaw(REMOTE_CASH_ID, "CASH", 0, false));
  await realSynchronize(ledger.database, {
    pull: (): Promise<SyncPullResult> =>
      Promise.resolve({
        changes: {
          accounts: { created, updated: [], deleted: [] },
        },
        timestamp: ++syncFixtureControls.mockNextWatermark,
      }),
  });
  const bank = await ledger.database.get<Account>("accounts").find(BANK_ID);
  expect(bank._raw._status).toBe("synced");
  expect(bank.userId).toBe(OWNER);
  expect(bank.currency).toBe("EGP");
  if (existingCash) {
    const cash = await ledger.database
      .get<Account>("accounts")
      .find(REMOTE_CASH_ID);
    expect(cash._raw._status).toBe("synced");
    expect(cash.balance).toBe(0);
    expect(cash.financialRevision).toBe("0");
  }
  // Isolate the subsequent ATM's real network writes from the seed pull.
  mockUpserts.length = 0;
  mockFinancialTransport.length = 0;
}

async function localAtm(fingerprint: string): Promise<{
  readonly cash: Account;
  readonly transfer: Transfer;
  readonly root: FinancialActionGroup;
}> {
  const response = await createSmsAtmTransfer({
    bankAccountId: BANK_ID,
    amount: 25,
    currency: "EGP",
    date: FIXTURE_AT,
    smsFingerprint: fingerprint,
    senderDisplayName: "Synthetic Bank ATM",
    expectedUserId: OWNER,
  });
  expect(response).toEqual({ success: true });
  const cashRows = await ledger.database
    .get<Account>("accounts")
    .query(Q.where("user_id", OWNER), Q.where("type", "CASH"))
    .fetch();
  expect(cashRows).toHaveLength(1);
  const cash = cashRows[0];
  if (!cash) failFixture("missing_real_local_cash");
  const transfers = await ledger.database
    .get<Transfer>("transfers")
    .query(Q.where("user_id", OWNER))
    .fetch();
  expect(transfers).toHaveLength(1);
  const transfer = transfers[0];
  if (!transfer) failFixture("missing_real_atm_transfer");
  expect(transfer.fromAccountId).toBe(BANK_ID);
  expect(transfer.toAccountId).toBe(cash.id);
  expect(transfer.smsFingerprint).toBe(fingerprint);
  const roots = await ledger.database
    .get<FinancialActionGroup>("financial_action_groups")
    .query(Q.where("user_id", OWNER), Q.where("domain", "transfers"))
    .fetch();
  expect(roots).toHaveLength(1);
  const root = roots[0];
  if (!root) failFixture("missing_real_transfer_action_root");
  const wire = parseRealTransferPayload(root.payloadJson);
  expect(wire.actionId).toBe(root.actionId);
  expect(wire.ownerId).toBe(OWNER);
  expect(wire.fromAccountId).toBe(BANK_ID);
  expect(wire.toAccountId).toBe(cash.id);
  expect(wire.currency).toBe("EGP");
  expect(wire.guards).toEqual(
    expect.arrayContaining([
      { accountId: cash.id, expectedRevision: "0" },
      { accountId: BANK_ID, expectedRevision: "0" },
    ])
  );
  expect(wire.effects).toEqual(
    expect.arrayContaining([
      { accountId: BANK_ID, amountMinorUnits: "-2500", currency: "EGP" },
      { accountId: cash.id, amountMinorUnits: "2500", currency: "EGP" },
    ])
  );
  expect(wire.records).toHaveLength(1);
  expect(cash.balance).toBe(25);
  expect(cash.financialRevision).toBe("1");
  return { cash, transfer, root };
}

async function assertExactlyOneLocalTransferEffectSet(
  actionId: string,
  cashId: string
): Promise<void> {
  const effects = await ledger.database
    .get<AccountFinancialEffect>("account_financial_effects")
    .query(Q.where("action_id", actionId), Q.where("user_id", OWNER))
    .fetch();
  expect(effects).toHaveLength(2);
  expect(
    effects
      .map((effect) => ({
        accountId: effect.accountId,
        amountMinorUnits: effect.amountMinorUnits,
        effective: effect.isEffective,
        deleted: effect.deleted,
      }))
      .sort((a, b) => a.accountId.localeCompare(b.accountId))
  ).toEqual(
    [
      {
        accountId: BANK_ID,
        amountMinorUnits: "-2500",
        effective: true,
        deleted: false,
      },
      {
        accountId: cashId,
        amountMinorUnits: "2500",
        effective: true,
        deleted: false,
      },
    ].sort((a, b) => a.accountId.localeCompare(b.accountId))
  );
}

const CREATOR_BEFORE_ACTION_ID = "00000000-0000-4000-8000-000000000010";
const CREATOR_AFTER_ACTION_ID = "ffffffff-ffff-4fff-bfff-ffffffffffff";
const TWO_ATM_FINGERPRINTS = ["e".repeat(64), "f".repeat(64)] as const;

interface PendingCashCreator {
  readonly command: AccountDefaultPreparedCommand;
  readonly root: FinancialActionGroup;
}
interface PendingTwoAtms {
  readonly creator: PendingCashCreator;
  readonly first: FinancialActionGroup;
  readonly second: FinancialActionGroup;
  readonly cash: Account;
}

async function pendingZeroCashCreator(
  forcedActionId: string
): Promise<PendingCashCreator> {
  let idOrdinal = 0;
  const service = createAccountDefaultIntentService({
    database: ledger.database,
    getCurrentUserDataScope,
    assertExpectedCurrentUser,
    assertNoDuplicateAccountIdentity: assertNoDuplicateAddAccountIdentity,
    createId: (): string => (idOrdinal++ === 0 ? forcedActionId : randomUUID()),
    now: (): Date => FIXTURE_AT,
    hashProvider,
  });
  const command = await service.prepare(
    OWNER,
    form("Pending ATM Cash", "0", false, "CASH")
  );
  expect(command.envelope.actionId).toBe(forcedActionId);
  expect(command.envelope.payloadVersion).toBe("account.create-default/v1");
  expect(command.envelope.accountGuards).toEqual([]);
  expect(command.effectId).toBeNull();
  expect(command.openingMinorUnits).toBe("0");
  await expect(service.commitPrepared(command)).resolves.toEqual({
    kind: "committed",
    accountId: command.accountId,
  });
  const rows = await ledger.database
    .get<FinancialActionGroup>("financial_action_groups")
    .query(Q.where("action_id", forcedActionId), Q.where("user_id", OWNER))
    .fetch();
  expect(rows).toHaveLength(1);
  const root = rows[0];
  if (!root || !root.localRecoverySnapshotJson)
    failFixture("missing_durable_cash_creator_evidence");
  expect(root.state).toBe("local_complete");
  const original = parseAccountCreateDefaultLocalRecoverySnapshotJson({
    json: root.localRecoverySnapshotJson,
    expectedRoot: {
      actionId: command.envelope.actionId,
      ownerId: OWNER,
      domainReferenceId: command.accountId,
      payloadHash: root.payloadHash,
      expectedDefaultSnapshot: command.snapshot,
    },
  });
  expect(original.openingEffect).toBeNull();
  expect(original.createdAccount.accountId).toBe(command.accountId);
  expect(original.createdAccount.postimage.balanceMinorUnits).toBe("0");
  expect(original.createdAccount.postimage.financialRevision).toBe("0");
  expect(original.createdAccount.postimage.currency).toBe("EGP");
  expect(original.createdAccount.postimage.isDefault).toBe(false);
  const account = await ledger.database
    .get<Account>("accounts")
    .find(command.accountId);
  expect(account.userId).toBe(OWNER);
  expect(account.type).toBe("CASH");
  expect(account.currency).toBe("EGP");
  expect(account.balance).toBe(0);
  expect(account.financialRevision).toBe("0");
  expect(account.isDefault).toBe(false);
  expect(account._raw._status).toBe("created");
  return { command, root };
}

async function twoOfflineAtms(
  forcedCreatorActionId: string
): Promise<PendingTwoAtms> {
  await loadRemoteAccounts(false);
  const creator = await pendingZeroCashCreator(forcedCreatorActionId);
  for (const [index, fingerprint] of TWO_ATM_FINGERPRINTS.entries()) {
    const result = await createSmsAtmTransfer({
      bankAccountId: BANK_ID,
      amount: index === 0 ? 25 : 10,
      currency: "EGP",
      date: FIXTURE_AT,
      smsFingerprint: fingerprint,
      expectedUserId: OWNER,
    });
    expect(result).toEqual({ success: true });
  }
  const transfers = await ledger.database
    .get<Transfer>("transfers")
    .query(Q.where("user_id", OWNER))
    .fetch();
  expect(transfers).toHaveLength(2);
  const firstTransfer = transfers.find(
    (row) => row.smsFingerprint === TWO_ATM_FINGERPRINTS[0]
  );
  const secondTransfer = transfers.find(
    (row) => row.smsFingerprint === TWO_ATM_FINGERPRINTS[1]
  );
  if (!firstTransfer || !secondTransfer)
    failFixture("two_real_sms_transfers_missing");
  expect(firstTransfer.toAccountId).toBe(creator.command.accountId);
  expect(secondTransfer.toAccountId).toBe(creator.command.accountId);
  expect(firstTransfer.fromAccountId).toBe(BANK_ID);
  expect(secondTransfer.fromAccountId).toBe(BANK_ID);
  const roots = await ledger.database
    .get<FinancialActionGroup>("financial_action_groups")
    .query(Q.where("domain", "transfers"), Q.where("user_id", OWNER))
    .fetch();
  expect(roots).toHaveLength(2);
  const first = roots.find((row) => row.domainReferenceId === firstTransfer.id);
  const second = roots.find(
    (row) => row.domainReferenceId === secondTransfer.id
  );
  if (!first || !second) failFixture("two_real_transfer_roots_missing");
  expect(first.actionId).not.toBe(second.actionId);
  const firstWire = parseRealTransferPayload(first.payloadJson);
  const secondWire = parseRealTransferPayload(second.payloadJson);
  expect(firstWire.guards).toEqual(
    expect.arrayContaining([
      { accountId: BANK_ID, expectedRevision: "0" },
      { accountId: creator.command.accountId, expectedRevision: "0" },
    ])
  );
  expect(secondWire.guards).toEqual(
    expect.arrayContaining([
      { accountId: BANK_ID, expectedRevision: "1" },
      { accountId: creator.command.accountId, expectedRevision: "1" },
    ])
  );
  const cash = await ledger.database
    .get<Account>("accounts")
    .find(creator.command.accountId);
  const bank = await ledger.database.get<Account>("accounts").find(BANK_ID);
  expect(cash.balance).toBe(35);
  expect(cash.financialRevision).toBe("2");
  expect(cash._raw._status).toBe("created");
  expect(bank.balance).toBe(65);
  expect(bank.financialRevision).toBe("2");
  expect(creator.root.actionId).toBe(forcedCreatorActionId);
  expect(creator.root.payloadJson).not.toContain("transfers.create/v1");
  const cashRows = await ledger.database
    .get<Account>("accounts")
    .query(Q.where("user_id", OWNER), Q.where("type", "CASH"))
    .fetch();
  expect(cashRows.map((row) => row.id)).toEqual([cash.id]);
  const allEffects = await ledger.database
    .get<AccountFinancialEffect>("account_financial_effects")
    .query(Q.where("user_id", OWNER))
    .fetch();
  expect(allEffects).toHaveLength(4);
  expect(
    allEffects.filter((row) => row.actionId === first.actionId)
  ).toHaveLength(2);
  expect(
    allEffects.filter((row) => row.actionId === second.actionId)
  ).toHaveLength(2);
  return { creator, first, second, cash };
}

/** Bounded RPC fixture: SQL091 zero-opening Add creates Cash remotely,
 * SQL076 transfer effect derivation sees that new remote Cash afterwards.
 * Production coordinator, SQLite, SDK push, and final ACK remain real.
 */
function creatorAndTransfersRemote(creator: PendingCashCreator): {
  readonly rpcActionIds: readonly string[];
  readonly destination: BoundedServer;
  readonly invoke: (input: {
    readonly payloadHash: string;
    readonly payloadJson: string;
  }) => Promise<unknown>;
} {
  const destination = boundedSqlDestinationServer([
    { id: BANK_ID, userId: OWNER, type: "BANK", currency: "EGP" },
  ]);
  const rpcActionIds: string[] = [];
  return {
    rpcActionIds,
    destination,
    invoke: (input): Promise<unknown> => {
      const raw: unknown = JSON.parse(input.payloadJson);
      if (!object(raw)) failFixture("unrecognized_rpc_action_envelope");
      const actionId = requiredString(raw, "actionId");
      rpcActionIds.push(actionId);
      if (actionId === creator.command.envelope.actionId) {
        if (
          input.payloadHash !== creator.root.payloadHash ||
          input.payloadJson !== creator.root.payloadJson ||
          raw.domain !== "accounts" ||
          raw.kind !== "create_with_default" ||
          raw.payloadVersion !== "account.create-default/v1" ||
          !Array.isArray(raw.accountGuards) ||
          raw.accountGuards.length !== 0
        )
          failFixture("changed_zero_opening_add_rpc");
        // Reuse the same strict real-root/hash/private-snapshot verification
        // as the first-Cash producer path. Never synthesize remote presence.
        return destination.invoke(input);
      }
      return destination.invoke(input);
    },
  };
}

describe("#395 C1 live ATM Cash remote prerequisite — real SQLite and protected SDK", () => {
  beforeAll((): void => {
    // The isolated @monyvi/db SQLite fixture bypasses production database.ts,
    // where setGenerator runs before any records are created.
    setGenerator(nodeRandomUUID);
  });

  it("publishes first local EGP Cash before its guarded ATM RPC", async () => {
    await loadRemoteAccounts(false);
    const { cash, root } = await localAtm(FINGERPRINT_FIRST);
    // Created Cash remains a dirty physical create even after guarded balance
    // mutation; its non-initial revision must not escape via generic upsert.
    expect(cash._raw._status).toBe("created");
    const server = boundedSqlDestinationServer([
      { id: BANK_ID, userId: OWNER, type: "BANK", currency: "EGP" },
    ]);
    await realSynchronize(ledger.database, {
      coordinator: actionCoordinator(ledger.database, server.invoke),
    });
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]).toMatchObject({
      actionId: root.actionId,
      destinationId: cash.id,
      destinationPresent: true,
    });
    expect(server.applied.size).toBe(1);
    expect(server.applied.get(root.actionId)).toEqual(
      expect.arrayContaining([
        { accountId: BANK_ID, amountMinorUnits: "-2500", currency: "EGP" },
        { accountId: cash.id, amountMinorUnits: "2500", currency: "EGP" },
      ])
    );
    const durableRoot = await ledger.database
      .get<FinancialActionGroup>("financial_action_groups")
      .find(root.id);
    expect(durableRoot.state).toBe("accepted");
    await assertExactlyOneLocalTransferEffectSet(root.actionId, cash.id);
  });

  it("reuses remote EGP Cash without duplicate accounts or effects", async () => {
    await loadRemoteAccounts(true);
    const { cash, root } = await localAtm(FINGERPRINT_EXISTING);
    expect(cash.id).toBe(REMOTE_CASH_ID);
    const server = boundedSqlDestinationServer([
      { id: BANK_ID, userId: OWNER, type: "BANK", currency: "EGP" },
      { id: REMOTE_CASH_ID, userId: OWNER, type: "CASH", currency: "EGP" },
    ]);
    const coordinator = actionCoordinator(ledger.database, server.invoke);
    await realSynchronize(ledger.database, { coordinator });
    expect(server.calls).toEqual([
      {
        actionId: root.actionId,
        destinationId: REMOTE_CASH_ID,
        destinationPresent: true,
        accountPublishedBeforeRpc: false,
      },
    ]);
    expect(server.applied.size).toBe(1);
    expect(
      (
        await ledger.database
          .get<FinancialActionGroup>("financial_action_groups")
          .find(root.id)
      ).state
    ).toBe("accepted");
    await assertExactlyOneLocalTransferEffectSet(root.actionId, cash.id);
    // A normal second protected SDK sync must not create a new action/effect.
    await realSynchronize(ledger.database, { coordinator });
    expect(server.applied.size).toBe(1);
    await assertExactlyOneLocalTransferEffectSet(root.actionId, cash.id);
    const ownedCash = await ledger.database
      .get<Account>("accounts")
      .query(Q.where("user_id", OWNER), Q.where("type", "CASH"))
      .fetch();
    expect(ownedCash.map((account) => account.id)).toEqual([REMOTE_CASH_ID]);
  });

  it("does not post a transfer when the bank and ATM currencies differ", async () => {
    await loadRemoteAccounts(false);
    const result = await createSmsAtmTransfer({
      bankAccountId: BANK_ID,
      amount: 25,
      currency: "USD",
      date: FIXTURE_AT,
      smsFingerprint: "d".repeat(64),
      expectedUserId: OWNER,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("TRANSFER_ACCOUNT_CURRENCY_MISMATCH");
    const [transfers, roots, effects] = await Promise.all([
      ledger.database.get<Transfer>("transfers").query().fetch(),
      ledger.database
        .get<FinancialActionGroup>("financial_action_groups")
        .query()
        .fetch(),
      ledger.database
        .get<AccountFinancialEffect>("account_financial_effects")
        .query()
        .fetch(),
    ]);
    expect(transfers).toHaveLength(0);
    expect(roots).toHaveLength(0);
    expect(effects).toHaveLength(0);
    expect(mockFinancialTransport).toHaveLength(0);
  });

  it("keeps zero-opening Add as an immutable pending Cash creator while two real ATMs advance revisions 0/1/2", async () => {
    const scenario = await twoOfflineAtms(CREATOR_BEFORE_ACTION_ID);
    expect(scenario.creator.root.state).toBe("local_complete");
    expect(scenario.first.state).toBe("local_complete");
    expect(scenario.second.state).toBe("local_complete");
    expect(mockFinancialTransport).toHaveLength(0);
    expect(mockUpserts).toHaveLength(0);
  });

  it("dispatches accepted zero-opening Add before two guarded ATM RPCs and retains protected ACK fences", async () => {
    const scenario = await twoOfflineAtms(CREATOR_BEFORE_ACTION_ID);
    const remote = creatorAndTransfersRemote(scenario.creator);
    const coordinator = actionCoordinator(ledger.database, remote.invoke);
    await realSynchronize(ledger.database, { coordinator });
    expect(remote.rpcActionIds).toEqual([
      scenario.creator.command.envelope.actionId,
      scenario.first.actionId,
      scenario.second.actionId,
    ]);
    expect(remote.destination.calls).toHaveLength(2);
    expect(
      remote.destination.calls.every((call) => call.destinationPresent)
    ).toBe(true);
    expect(
      remote.destination.calls.every((call) => !call.accountPublishedBeforeRpc)
    ).toBe(true);
    expect(remote.destination.applied.size).toBe(2);
    expect(
      (
        await ledger.database
          .get<FinancialActionGroup>("financial_action_groups")
          .find(scenario.creator.root.id)
      ).state
    ).toBe("accepted");
    for (const transferRoot of [scenario.first, scenario.second]) {
      expect(
        (
          await ledger.database
            .get<FinancialActionGroup>("financial_action_groups")
            .find(transferRoot.id)
        ).state
      ).toBe("accepted");
    }
    const cash = await ledger.database
      .get<Account>("accounts")
      .find(scenario.creator.command.accountId);
    expect(cash.balance).toBe(35);
    expect(cash.financialRevision).toBe("2");
    // Zero-opening Add acceptance is not proof that the optimistic later
    // transfer revision is safe for generic account ACK.
    expect(cash._raw._status).not.toBe("synced");
  });

  it("orders the immutable pending creator before its ATM consumers even when its action ID sorts last", async () => {
    const scenario = await twoOfflineAtms(CREATOR_AFTER_ACTION_ID);
    expect(
      [scenario.first.actionId, scenario.second.actionId].every(
        (actionId) => actionId.localeCompare(scenario.creator.root.actionId) < 0
      )
    ).toBe(true);
    const remote = creatorAndTransfersRemote(scenario.creator);
    await realSynchronize(ledger.database, {
      coordinator: actionCoordinator(ledger.database, remote.invoke),
    });
    // Baseline RED: the existing sorter sees transfer revision edges but the
    // zero-opening Add has no accountGuards, so action-ID order can win.
    // Never amend this to expect NOT_OWNED as a passing result.
    expect(remote.rpcActionIds).toEqual([
      scenario.creator.command.envelope.actionId,
      scenario.first.actionId,
      scenario.second.actionId,
    ]);
    expect(remote.destination.calls).toHaveLength(2);
    expect(
      remote.destination.calls.every((call) => call.destinationPresent)
    ).toBe(true);
    expect(remote.destination.applied.size).toBe(2);
  });

  it("rejects a foreign actor without creating Cash or financial effects", async () => {
    await loadRemoteAccounts(false);
    syncFixtureControls.mockActiveOwner = FOREIGN;
    const result = await createSmsAtmTransfer({
      bankAccountId: BANK_ID,
      amount: 25,
      currency: "EGP",
      date: FIXTURE_AT,
      smsFingerprint: "c".repeat(64),
      expectedUserId: OWNER,
    });
    expect(result).toMatchObject({ success: false });
    syncFixtureControls.mockActiveOwner = OWNER;
    const [cash, transfers, roots] = await Promise.all([
      ledger.database
        .get<Account>("accounts")
        .query(Q.where("type", "CASH"), Q.where("user_id", OWNER))
        .fetch(),
      ledger.database.get<Transfer>("transfers").query().fetch(),
      ledger.database
        .get<FinancialActionGroup>("financial_action_groups")
        .query()
        .fetch(),
    ]);
    expect(cash).toHaveLength(0);
    expect(transfers).toHaveLength(0);
    expect(roots).toHaveLength(0);
    expect(mockFinancialTransport).toHaveLength(0);
  });
});
