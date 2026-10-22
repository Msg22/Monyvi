/**
 * #395 T069 immutable owner-scoped financial root catalog.
 *
 * The catalog is always reloaded from real local roots. Dirty sync capture is
 * not a source of historical authorization. No private bytes are serialized.
 */
import * as Crypto from "expo-crypto";
import { fromMinorUnits, getCurrencyPrecision } from "@monyvi/logic";
import { Q, type Database } from "@nozbe/watermelondb";
import {
  verifyImmutableAddRecoveryAuthority,
  type ExpectedAddRecoveryIdentity,
} from "../account-default-intent-local-recovery-evidence";
import { getCurrentUserId } from "../supabase";
import { getCurrentUserDataScope } from "../user-data-access";
import { hashAccountReviewLocalPostimage } from "../account-review-local-snapshot-postimages";
import { timestampSchema } from "../../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import type {
  Account,
  AccountFinancialEffect,
  AccountSmsSender,
  BankDetails,
  FinancialActionGroup,
} from "@monyvi/db";
import {
  FINANCIAL_ACTION_STATES,
  SERVER_OUTCOMES,
  assertFinancialActionStateEvidence,
  parseFinancialActionEnvelopeJson,
  serializeFinancialActionEnvelope,
} from "../../../../packages/logic/src/financial-actions/action-contracts";
import { validateAccountCreateDefaultPayload } from "../../../../packages/logic/src/financial-actions/account-create-default";
import { parseAccountCreateDefaultLocalRecoverySnapshotJson } from "../../../../packages/logic/src/financial-actions/account-create-default-local-recovery";
import { parseAccountReviewLocalSaveSnapshot } from "../../../../packages/logic/src/financial-actions/review-local-recovery";
import { createAccountReviewFinancialRegistry } from "../account-review-financial-command-service";
import {
  assertAccountSyncAckScopeCurrent,
  type AccountSyncAckCapability,
} from "./account-sync-ack-scope";
import {
  buildPendingAddPriorDefaultProofs,
  isPendingAddRootState,
  type AcceptedCreatorIdentity,
  type PendingAddPriorDefaultCandidate,
  type PendingAddPriorDefaultProof,
} from "./pending-add-default-pull";

import { verifyReviewAcceptedReceipt } from "./financial-action-root-pull-identity";

const FAIL = "account_sync_protection_invalid_root";
const REGISTRY = createAccountReviewFinancialRegistry();

export interface ProtectedRootBinding {
  readonly physicalRootId: string;
  readonly actionId: string;
  readonly ownerId: string;
  readonly payloadHash: string;
  readonly payloadJson: string;
  readonly state: string;
  readonly terminalAccepted: boolean;
  readonly locallyCompensated: boolean;
}

export interface AcceptedAddAccountPostimage {
  readonly accountId: string;
  readonly ownerId: string;
  readonly name: string;
  readonly type: string;
  readonly currency: string;
  readonly institutionId: string | null;
  readonly providerDisplayName: string | null;
  readonly isDefault: boolean;
  readonly balance: number;
  readonly financialRevision: string;
  readonly createdAt: number;
}

export interface AccountActionProtection {
  readonly roots: readonly ProtectedRootBinding[];
  /** Strict original immutable accepted Add account create postimage. */
  readonly acceptedAddPostimages: ReadonlyMap<
    string,
    AcceptedAddAccountPostimage
  >;
  /** Exact original accepted Add child physical metadata; not a transport DTO. */
  readonly acceptedChildPostimages: Readonly<
    Record<string, ReadonlyMap<string, Readonly<Record<string, unknown>>>>
  >;
  readonly effectIdsByAction: ReadonlyMap<string, ReadonlySet<string>>;
  /** An exact captured prior-default Add postimage proves the action's own
   * first dirty flag, not a later user-authored Edit at the same value. */
  readonly provedActionOwnedDefaultIds: ReadonlySet<string>;
  /** All immutable Add-created accounts (including formerly accepted roots). */
  readonly createdAccountIds: ReadonlySet<string>;
  readonly createdChildIds: Readonly<Record<string, ReadonlySet<string>>>;
  readonly openingEffectIds: ReadonlySet<string>;
  readonly priorDefaultIds: ReadonlySet<string>;
  /** Losing entities remain excluded even once action roots are clean. */
  readonly losingIds: Readonly<Record<string, ReadonlySet<string>>>;
  readonly acceptedAccountIds: ReadonlySet<string>;
  /** Most recent immutable accepted default postimage for a genuine later edit. */
  readonly acceptedDefaultPostimages: ReadonlyMap<string, boolean>;
  readonly unsafeDefaultIds: ReadonlySet<string>;
  /**
   * A pending (not yet accepted) Add owns exactly one optimistic prior-default
   * clear. Only a positively proven binding may be delivered unchanged to the
   * stock SDK dirty-column merge while that Add is still pending.
   */
  readonly pendingAddPriorDefaultProofs: ReadonlyMap<
    string,
    PendingAddPriorDefaultProof
  >;
}

function fail(): never {
  throw new Error(FAIL);
}
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function assertRootPublic(
  root: FinancialActionGroup
): ReturnType<typeof parseFinancialActionEnvelopeJson> {
  const envelope = parseFinancialActionEnvelopeJson(root.payloadJson, REGISTRY);
  if (
    envelope.userId !== root.userId ||
    envelope.actionId !== root.actionId ||
    envelope.domain !== root.domain ||
    envelope.kind !== root.kind ||
    envelope.domainReferenceId !== root.domainReferenceId ||
    serializeFinancialActionEnvelope(envelope, REGISTRY) !== root.payloadJson ||
    JSON.stringify(envelope.accountGuards) !== root.accountGuardsJson
  )
    fail();
  return envelope;
}

/** Exact six-field SQL091 successful Add receipt and account revision set. */
function assertAcceptedAddOutcome(
  json: unknown,
  actionId: string,
  status: "accepted" | "idempotent",
  createdId: string,
  expectedEffectCount: number
): void {
  if (typeof json !== "string") fail();
  let decoded: unknown;
  try {
    decoded = JSON.parse(json);
  } catch {
    fail();
  }
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded))
    fail();
  const value = decoded as Readonly<Record<string, unknown>>;
  if (
    Object.keys(value).sort().join(",") !==
      [
        "accountRevisions",
        "actionId",
        "effectiveEventId",
        "holdingRevision",
        "serverAcceptedAt",
        "status",
      ]
        .sort()
        .join(",") ||
    value.actionId !== actionId ||
    value.status !== status ||
    value.effectiveEventId !== null ||
    value.holdingRevision !== null ||
    !timestampSchema.safeParse(value.serverAcceptedAt).success ||
    !Array.isArray(value.accountRevisions)
  )
    fail();
  const expected =
    expectedEffectCount === 0 ? [] : [{ accountId: createdId, revision: "1" }];
  if (
    expectedEffectCount > 1 ||
    JSON.stringify(value.accountRevisions) !== JSON.stringify(expected)
  )
    fail();
}

function asIds(
  source: Readonly<Record<string, Set<string>>>
): Readonly<Record<string, ReadonlySet<string>>> {
  return Object.fromEntries(
    Object.entries(source).map(([table, ids]) => [table, new Set(ids)])
  );
}

function register(
  groups: Record<string, Set<string>>,
  table: string,
  id: string
): void {
  const ids = groups[table] ?? new Set<string>();
  ids.add(id);
  groups[table] = ids;
}

function requireOwnerRoot(root: FinancialActionGroup, ownerId: string): void {
  if (!root.id || root.userId !== ownerId || root.deleted) fail();
}

/**
 * Local terminal Add recovery is independently evidenced by the durable
 * private carrier, bound rejection receipt, physical losing tombstones, and
 * exact child/effect membership. Never infer compensation from a server root
 * state alone; do not delete the retained private snapshot.
 */
async function proveLocallyCompensatedAdd(
  database: Database,
  root: FinancialActionGroup,
  snapshot: ReturnType<
    typeof parseAccountCreateDefaultLocalRecoverySnapshotJson
  >
): Promise<boolean> {
  if (
    root.state !== "reconciled" ||
    (root.serverOutcome !== "stale" && root.serverOutcome !== "rejected") ||
    typeof root.outcomeJson !== "string"
  )
    return false;
  // The caller first authenticated SQL091's complete exact receipt through
  // verifyImmutableAddRecoveryAuthority, including original five bindings,
  // SHA-256, public account guards, canonical default graph and B absence.
  // Only the *actual* local compensated physical graph is checked here.
  const currentUserId = await getCurrentUserId();
  if (currentUserId !== snapshot.ownerId) return false;
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== snapshot.ownerId) return false;

  const accounts = await scope
    .queryOwned(
      database.get<Account>("accounts"),
      Q.where("id", snapshot.createdAccount.accountId)
    )
    .fetch();
  const created = accounts[0];
  if (
    accounts.length !== 1 ||
    !created ||
    created.userId !== snapshot.ownerId ||
    !created.deleted
  )
    return false;

  const [banks, senders, effects] = await Promise.all([
    scope
      .queryChildrenOfOwnedParent(
        database.get<BankDetails>("bank_details"),
        created,
        "account_id"
      )
      .fetch(),
    scope
      .queryChildrenOfOwnedParent(
        database.get<AccountSmsSender>("account_sms_senders"),
        created,
        "account_id"
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<AccountFinancialEffect>("account_financial_effects"),
        Q.where("action_id", root.actionId)
      )
      .fetch(),
  ]);
  const actualChildren = [...banks, ...senders];
  const expectedChildren = snapshot.createdChildren
    .map(
      (child) =>
        (child.entity === "bank_details"
          ? "bank_details"
          : "account_sms_senders") +
        ":" +
        child.id
    )
    .sort();
  if (
    actualChildren.length !== expectedChildren.length ||
    actualChildren
      .map((child) => child.table + ":" + child.id)
      .sort()
      .some((key, index) => key !== expectedChildren[index]) ||
    actualChildren.some(
      (child) => !child.deleted || child.accountId !== created.id
    )
  )
    return false;

  const originalEffect = snapshot.openingEffect;
  if (effects.length !== (originalEffect ? 1 : 0)) return false;
  if (originalEffect) {
    const event = effects[0];
    if (
      !event ||
      event.id !== originalEffect.effectId ||
      event.userId !== snapshot.ownerId ||
      event.accountId !== created.id ||
      event.amountMinorUnits !== originalEffect.postimage.amountMinorUnits ||
      event.isEffective ||
      event.compensatedAt === null ||
      event.reversesEffectId !== null
    )
      return false;
  }
  if (snapshot.priorDefault !== null) {
    const originals = await scope
      .queryOwned(
        database.get<Account>("accounts"),
        Q.where("id", snapshot.priorDefault.accountId)
      )
      .fetch();
    const original = originals[0];
    if (
      originals.length !== 1 ||
      !original ||
      original.userId !== snapshot.ownerId ||
      original.deleted
    )
      return false;
    // F3: Require positive prior restore (isDefault === true).
    // The dirty bit (_changed) alone could be the residual optimistic clear from the
    // original Add and cannot be trusted as evidence of compensation.
    if (!original.isDefault) return false;
  }
  return true;
}

export async function loadAccountActionProtection(input: {
  readonly database: Database;
  readonly expectedOwnerId: string;
  readonly capability: AccountSyncAckCapability;
  /** Trusted writer-only result of prepareOwnedFinancialActionRootPull. */
  readonly writerProjectedAcceptedRoots?: ReadonlyArray<
    Readonly<Record<string, unknown>>
  >;
}): Promise<AccountActionProtection> {
  const { database, expectedOwnerId, capability } = input;
  assertAccountSyncAckScopeCurrent(capability, database, expectedOwnerId);
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== expectedOwnerId) fail();
  const owned = await scope
    .queryOwned(database.get<FinancialActionGroup>("financial_action_groups"))
    .fetch();
  const roots: ProtectedRootBinding[] = [];
  const createdAccountIds = new Set<string>();
  const acceptedAccountIds = new Set<string>();
  const acceptedAddPostimages = new Map<string, AcceptedAddAccountPostimage>();
  const acceptedChildPostimages: Record<
    string,
    Map<string, Readonly<Record<string, unknown>>>
  > = {
    bank_details: new Map(),
    account_sms_senders: new Map(),
  };
  const effectIdsByAction = new Map<string, ReadonlySet<string>>();
  const pendingProjection = (input.writerProjectedAcceptedRoots ?? []).filter(
    (row) =>
      row.domain === "accounts" &&
      row.kind === "create_with_default" &&
      row.state === "accepted"
  );

  const openingEffectIds = new Set<string>();
  const priorDefaultIds = new Set<string>();
  const unsafeDefaultIds = new Set<string>();
  // Accepted immutable Add creates and exact old-default clears establish
  // causal facts. No timestamp/action-id ordering is used as LWW authority.
  const acceptedCreatedDefaults = new Map<string, boolean>();
  const acceptedDefaultClears = new Set<string>();
  const priorDefaultHashes = new Map<string, Set<string>>();
  // Unresolved (not accepted, not compensated) prior-default clear claims.
  // A legitimate ACCEPTED historical clear is not a competing claim.
  const unresolvedPriorDefaultClaims = new Map<string, string[]>();
  const pendingAddCandidates: PendingAddPriorDefaultCandidate[] = [];
  const provedActionOwnedDefaultIds = new Set<string>();
  const children: Record<string, Set<string>> = {};
  const losing: Record<string, Set<string>> = {};
  const seenActions = new Set<string>();
  const seenPhysicalRoots = new Set<string>();

  for (const root of owned) {
    // The Metal RPC owns validation, dependency order, rejection and ACK for
    // these independent actions. An unrelated malformed Metal payload must
    // not veto a valid sibling's push before the Metal per-group guard runs.
    // This catalog still fully authenticates every Add/Review/legacy account
    // root (including owner, hash, local private and exact-effect evidence).
    if (root.domain === "metals") continue;
    requireOwnerRoot(root, expectedOwnerId);
    if (seenActions.has(root.actionId) || seenPhysicalRoots.has(root.id))
      fail();
    seenActions.add(root.actionId);
    seenPhysicalRoots.add(root.id);
    const envelope = assertRootPublic(root);
    const incoming = pendingProjection.filter(
      (row) => row.id === root.id && row.action_id === root.actionId
    );
    if (incoming.length > 1) fail();
    const approvedCloudRoot = incoming[0];

    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      root.payloadJson
    );
    if (digest !== root.payloadHash) fail();
    const parsedState = FINANCIAL_ACTION_STATES.find(
      (state) => state === root.state
    );
    const parsedOutcome =
      root.serverOutcome === null
        ? null
        : SERVER_OUTCOMES.find((value) => value === root.serverOutcome);
    if (!parsedState || (root.serverOutcome !== null && !parsedOutcome)) fail();
    try {
      assertFinancialActionStateEvidence(parsedState, {
        serverOutcome: parsedOutcome ?? null,
        outcomeJson: root.outcomeJson,
        rejectionCode: root.rejectionCode,
      });
    } catch {
      fail();
    }
    const locallyAccepted =
      root.state === "accepted" &&
      (root.serverOutcome === "accepted" ||
        root.serverOutcome === "idempotent");
    let accepted = locallyAccepted;
    if (approvedCloudRoot) {
      if (
        !(
          envelope.domain === "accounts" &&
          envelope.kind === "create_with_default" &&
          envelope.payloadVersion === "account.create-default/v1" &&
          [
            "local_complete",
            "sync_pending",
            "sync_failed",
            "accepted",
          ].includes(root.state) &&
          approvedCloudRoot.state === "accepted" &&
          approvedCloudRoot.server_outcome === "accepted" &&
          approvedCloudRoot.rejection_code === null &&
          approvedCloudRoot.user_id === expectedOwnerId &&
          approvedCloudRoot.payload_hash === root.payloadHash &&
          approvedCloudRoot.payload_json === root.payloadJson &&
          approvedCloudRoot.account_guards_json === root.accountGuardsJson &&
          approvedCloudRoot.domain_reference_id === root.domainReferenceId
        )
      )
        fail();
      const addPayload = validateAccountCreateDefaultPayload(envelope.payload);
      assertAcceptedAddOutcome(
        approvedCloudRoot.outcome_json,
        root.actionId,
        "accepted",
        root.domainReferenceId,
        addPayload.accountEffects.length
      );
      accepted = true;
    }
    const rawAccountEffects = envelope.payload.accountEffects;
    effectIdsByAction.set(
      root.actionId,
      new Set(
        Array.isArray(rawAccountEffects)
          ? rawAccountEffects.map((effect) => {
              if (!isRecord(effect) || typeof effect.effectId !== "string")
                fail();
              return effect.effectId;
            })
          : []
      )
    );
    // Server "reconciled" is never proof that dedicated local compensation
    // applied; only the locally verified terminal root carries that authority.
    let compensated = false;

    if (
      envelope.domain === "accounts" &&
      envelope.kind === "create_with_default" &&
      envelope.payloadVersion === "account.create-default/v1"
    ) {
      const payload = validateAccountCreateDefaultPayload(envelope.payload);
      if (locallyAccepted) {
        assertAcceptedAddOutcome(
          root.outcomeJson,
          root.actionId,
          root.serverOutcome === "idempotent" ? "idempotent" : "accepted",
          root.domainReferenceId,
          payload.accountEffects.length
        );
      }
      const json = root.localRecoverySnapshotJson;
      if (json !== null) {
        const snapshot = parseAccountCreateDefaultLocalRecoverySnapshotJson({
          json,
          expectedRoot: {
            actionId: root.actionId,
            ownerId: root.userId,
            domainReferenceId: root.domainReferenceId,
            payloadHash: root.payloadHash,
            expectedDefaultSnapshot: payload.expectedDefaultSnapshot,
          },
        });
        // A pending (not yet accepted) Add still owns its optimistic
        // prior-default clear. Its immutable root and parsed private snapshot
        // are the only proof that may later admit that one row.
        if (!accepted && isPendingAddRootState(root.state)) {
          pendingAddCandidates.push({
            actionId: root.actionId,
            physicalRootId: root.id,
            payloadHash: root.payloadHash,
            rootState: root.state,
            payload,
            snapshot,
          });
        }
        if (root.state === "reconciled") {
          const expected: ExpectedAddRecoveryIdentity = {
            actionId: root.actionId,
            expectedOwnerId,
            expectedPhysicalRootId: root.id,
            expectedPayloadHash: root.payloadHash,
            expectedPayloadJson: root.payloadJson,
          };
          const authority = await verifyImmutableAddRecoveryAuthority({
            root,
            expected,
            hashProvider: {
              digestUtf8: (value: string): Promise<string> =>
                Crypto.digestStringAsync(
                  Crypto.CryptoDigestAlgorithm.SHA256,
                  value
                ),
            },
            recheck: async (): Promise<void> => {
              assertAccountSyncAckScopeCurrent(
                capability,
                database,
                expectedOwnerId
              );
              if ((await getCurrentUserId()) !== expectedOwnerId) fail();
              assertAccountSyncAckScopeCurrent(
                capability,
                database,
                expectedOwnerId
              );
            },
          });
          if (authority.privateSnapshot.actionId !== snapshot.actionId) fail();
          compensated = await proveLocallyCompensatedAdd(
            database,
            root,
            authority.privateSnapshot
          );
          if (!compensated) fail();
        }
      } else if (!accepted) {
        // Neither remote reconciliation label nor a missing private carrier
        // permits a locally corrected terminal decision or ACK.
        fail();
      }
      const account = payload.domainMutation.records.find(
        (record) => record.entity === "account" && record.mode === "create"
      );
      if (!account || account.after.id !== root.domainReferenceId) fail();
      createdAccountIds.add(account.after.id);
      if (accepted) {
        acceptedAccountIds.add(account.after.id);
        const expectedBalance = Number(
          fromMinorUnits(
            account.after.openingBalanceMinorUnits,
            getCurrencyPrecision(account.after.currency)
          )
        );
        const createdAt = Date.parse(account.after.createdAt);
        if (
          !Number.isFinite(expectedBalance) ||
          !Number.isFinite(createdAt) ||
          acceptedAddPostimages.has(account.after.id)
        )
          fail();
        acceptedAddPostimages.set(
          account.after.id,
          Object.freeze({
            accountId: account.after.id,
            ownerId: expectedOwnerId,
            name: account.after.name,
            type: account.after.type,
            currency: account.after.currency,
            institutionId: account.after.institutionId,
            providerDisplayName: account.after.providerDisplayName,
            isDefault: account.after.isDefault,
            balance: expectedBalance,
            financialRevision: payload.accountEffects.length ? "1" : "0",
            createdAt,
          })
        );
      }
      const isLosing = !accepted;
      if (isLosing) {
        register(losing, "accounts", account.after.id);
        if (!compensated) unsafeDefaultIds.add(account.after.id);
      } else {
        if (acceptedCreatedDefaults.has(account.after.id)) fail();
        acceptedCreatedDefaults.set(account.after.id, account.after.isDefault);
      }
      for (const member of payload.domainMutation.records) {
        if (member.entity === "account_default") {
          priorDefaultIds.add(member.after.id);
          if (!accepted && !compensated) {
            const claimants =
              unresolvedPriorDefaultClaims.get(member.after.id) ?? [];
            claimants.push(root.actionId);
            unresolvedPriorDefaultClaims.set(member.after.id, claimants);
          }
          if (isLosing) {
            if (!compensated) unsafeDefaultIds.add(member.after.id);
          } else {
            if (
              payload.expectedDefaultSnapshot.defaultAccount?.accountId !==
              member.after.id
            )
              fail();
            acceptedDefaultClears.add(member.after.id);
            if (json !== null) {
              const privateSnapshot =
                parseAccountCreateDefaultLocalRecoverySnapshotJson({
                  json,
                  expectedRoot: {
                    actionId: root.actionId,
                    ownerId: root.userId,
                    domainReferenceId: root.domainReferenceId,
                    payloadHash: root.payloadHash,
                    expectedDefaultSnapshot: payload.expectedDefaultSnapshot,
                  },
                });
              const prior = privateSnapshot.priorDefault;
              if (!prior || prior.accountId !== member.after.id) fail();
              const hashes =
                priorDefaultHashes.get(prior.accountId) ?? new Set<string>();
              hashes.add(prior.expectedPostimageHash);
              priorDefaultHashes.set(prior.accountId, hashes);
            }
          }
          continue;
        }
        if (
          member.entity === "bank_details" ||
          member.entity === "account_sms_sender"
        ) {
          const table =
            member.entity === "bank_details"
              ? "bank_details"
              : "account_sms_senders";
          register(children, table, member.after.id);
          if (accepted) {
            const original: Readonly<Record<string, unknown>> =
              member.entity === "bank_details"
                ? {
                    account_id: account.after.id,
                    account_number: member.after.accountNumber,
                    card_last_4:
                      member.after.cardLast4 === null ||
                      member.after.cardLast4.trim() === ""
                        ? null
                        : Number(member.after.cardLast4),
                    created_at: Date.parse(member.after.createdAt),
                    deleted: false,
                  }
                : {
                    account_id: account.after.id,
                    sender_name: member.after.senderName,
                    normalized_sender_name: member.after.normalizedSenderName,
                    created_at: Date.parse(member.after.createdAt),
                    deleted: false,
                  };
            acceptedChildPostimages[table]?.set(
              member.after.id,
              Object.freeze(original)
            );
          }
          if (isLosing) register(losing, table, member.after.id);
        }
      }
      for (const effect of payload.accountEffects) {
        openingEffectIds.add(effect.effectId);
        if (isLosing) {
          register(losing, "account_financial_effects", effect.effectId);
        }
      }
    } else if (
      envelope.domain === "transactions" &&
      envelope.kind === "review_batch_save" &&
      envelope.payloadVersion === "review.batch-save/v1"
    ) {
      if (locallyAccepted) {
        verifyReviewAcceptedReceipt(
          envelope,
          parsedState,
          parsedOutcome ?? null,
          root.outcomeJson
        );
      }
      // Preserve existing Review private-validation ownership, never widen
      // its group or SMS semantics into the Add-specific snapshot.
      if (root.localRecoverySnapshotJson !== null) {
        const payload = envelope.payload;
        if (
          typeof payload !== "object" ||
          payload === null ||
          !("sessionId" in payload) ||
          !("source" in payload) ||
          typeof payload.sessionId !== "string" ||
          (payload.source !== "SMS" && payload.source !== "VOICE")
        )
          fail();
        parseAccountReviewLocalSaveSnapshot({
          json: root.localRecoverySnapshotJson,
          expectedRoot: {
            ownerId: root.userId,
            actionId: root.actionId,
            sessionId: payload.sessionId,
            source: payload.source,
          },
        });
      }
    } else if (root.localRecoverySnapshotJson !== null) {
      fail();
    }
    roots.push(
      Object.freeze({
        physicalRootId: root.id,
        actionId: root.actionId,
        ownerId: expectedOwnerId,
        payloadHash: root.payloadHash,
        payloadJson: root.payloadJson,
        state: root.state,
        terminalAccepted: accepted,
        locallyCompensated: compensated,
      })
    );
  }
  for (const [id, hashes] of priorDefaultHashes) {
    const current = await scope
      .findOwned(database.get<Account>("accounts"), id)
      .catch(() => null);
    if (!current || current.userId !== expectedOwnerId) fail();
    const actualHash = await hashAccountReviewLocalPostimage({
      table: "accounts",
      id,
      raw: current._raw,
      hashProvider: {
        digestUtf8: (value: string): Promise<string> =>
          Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
      },
    });
    if (hashes.has(actualHash)) provedActionOwnedDefaultIds.add(id);
  }
  // A pending Add owns exactly ONE optimistic prior-default clear. That clear
  // is applied by the Add's own authoritative RPC, never by an independent
  // metadata UPDATE. Only a positively proven binding (immutable owned root +
  // parsed private snapshot + exact physical local postimage) may be delivered
  // unchanged to the stock SDK dirty-column merge while the Add is pending.
  const acceptedCreatorIdentities = new Map<string, AcceptedCreatorIdentity>();
  for (const [accountId, image] of acceptedAddPostimages) {
    acceptedCreatorIdentities.set(
      accountId,
      Object.freeze({
        ownerId: image.ownerId,
        type: image.type,
        currency: image.currency,
        createdAt: image.createdAt,
      })
    );
  }
  const pendingAddPriorDefaultProofs = await buildPendingAddPriorDefaultProofs({
    candidates: pendingAddCandidates,
    unresolvedClaims: unresolvedPriorDefaultClaims,
    losingAccountIds: losing.accounts ?? new Set<string>(),
    acceptedCreatorIdentities,
    expectedOwnerId,
    loadPriorAccount: async (accountId: string) => {
      const current = await scope
        .findOwned(database.get<Account>("accounts"), accountId)
        .catch(() => null);
      if (!current) return null;
      const physicalHash = await hashAccountReviewLocalPostimage({
        table: "accounts",
        id: accountId,
        raw: current._raw,
        hashProvider: {
          digestUtf8: (value: string): Promise<string> =>
            Crypto.digestStringAsync(
              Crypto.CryptoDigestAlgorithm.SHA256,
              value
            ),
        },
      });
      return {
        id: current.id,
        userId: current.userId,
        deleted: current.deleted,
        isDefault: current.isDefault,
        type: current.type,
        currency: current.currency,
        financialRevision: current.financialRevision,
        createdAt: current.createdAt.getTime(),
        status: current._raw._status,
        changedColumns:
          typeof current._raw._changed === "string"
            ? current._raw._changed.split(",").filter(Boolean)
            : [],
        physicalHash,
        physicalFields: Object.fromEntries(
          Object.entries(current._raw).filter(
            ([key]) => key !== "_status" && key !== "_changed"
          )
        ),
      };
    },
  });
  const acceptedDefaults = new Map<string, boolean>(acceptedCreatedDefaults);
  for (const accountId of acceptedDefaultClears) {
    // There must be an accepted creator for a clearing Add to supply a
    // historical postimage, otherwise no default-edit authority is inferred.
    if (acceptedCreatedDefaults.has(accountId)) {
      acceptedDefaults.set(accountId, false);
    }
  }
  assertAccountSyncAckScopeCurrent(capability, database, expectedOwnerId);
  return {
    roots: Object.freeze(roots),
    acceptedAddPostimages,
    acceptedChildPostimages,
    effectIdsByAction,
    provedActionOwnedDefaultIds,
    createdAccountIds,
    createdChildIds: asIds(children),
    openingEffectIds,
    priorDefaultIds,
    losingIds: asIds(losing),
    acceptedAccountIds,
    acceptedDefaultPostimages: acceptedDefaults,
    unsafeDefaultIds,
    pendingAddPriorDefaultProofs,
  };
}

/**
 * A locally-created row can ACK/replay a canonical accepted Add only if its
 * entire immutable account create postimage matches the original signed Add.
 * Dirty metadata after creation must use separate verified field transport.
 */
export function matchesAcceptedAddAccountPostimage(
  catalog: AccountActionProtection,
  raw: Readonly<Record<string, unknown>>
): boolean {
  if (typeof raw.id !== "string") return false;
  const expected = catalog.acceptedAddPostimages.get(raw.id);
  return (
    expected !== undefined &&
    raw.user_id === expected.ownerId &&
    raw.name === expected.name &&
    raw.type === expected.type &&
    raw.currency === expected.currency &&
    (raw.institution_id ?? null) === expected.institutionId &&
    (raw.provider_display_name ?? null) === expected.providerDisplayName &&
    raw.is_default === expected.isDefault &&
    raw.balance === expected.balance &&
    raw.financial_revision === expected.financialRevision &&
    raw.created_at === expected.createdAt &&
    raw.deleted === false
  );
}

/** Immutable financial/membership fields must always match the creator. */
export function matchesAcceptedAddAccountCorePostimage(
  catalog: AccountActionProtection,
  raw: Readonly<Record<string, unknown>>
): boolean {
  if (typeof raw.id !== "string") return false;
  const original = catalog.acceptedAddPostimages.get(raw.id);
  return (
    original !== undefined &&
    raw.user_id === original.ownerId &&
    raw.type === original.type &&
    raw.currency === original.currency &&
    raw.balance === original.balance &&
    raw.financial_revision === original.financialRevision &&
    raw.created_at === original.createdAt
  );
}

/** Immutable CREATE identity only. Financial and metadata row ACKs require
 * their own positive evidence; this predicate never ACKs balance/revision. */
export function matchesAcceptedAddAccountImmutableIdentity(
  catalog: AccountActionProtection,
  raw: Readonly<Record<string, unknown>>
): boolean {
  if (typeof raw.id !== "string") return false;
  const original = catalog.acceptedAddPostimages.get(raw.id);
  return (
    original !== undefined &&
    raw.user_id === original.ownerId &&
    raw.type === original.type &&
    raw.currency === original.currency &&
    raw.created_at === original.createdAt
  );
}

/** Residual editable fields from a fully proven accepted CREATE. */
export function acceptedAddAccountResidualColumns(
  catalog: AccountActionProtection,
  raw: Readonly<Record<string, unknown>>
): readonly string[] {
  if (
    !matchesAcceptedAddAccountImmutableIdentity(catalog, raw) ||
    typeof raw.id !== "string"
  )
    return [];
  const original = catalog.acceptedAddPostimages.get(raw.id);
  if (!original) return [];
  const expected: Readonly<Record<string, unknown>> = {
    name: original.name,
    institution_id: original.institutionId,
    provider_display_name: original.providerDisplayName,
    is_default: original.isDefault,
    deleted: false,
  };
  return Object.keys(expected).filter(
    (key) => (raw[key] ?? null) !== (expected[key] ?? null)
  );
}

export function protectedRootStillMatches(
  catalog: AccountActionProtection,
  input: Pick<
    ProtectedRootBinding,
    "actionId" | "ownerId" | "physicalRootId" | "payloadHash" | "payloadJson"
  >
): boolean {
  return catalog.roots.some(
    (root) =>
      root.actionId === input.actionId &&
      root.ownerId === input.ownerId &&
      root.physicalRootId === input.physicalRootId &&
      root.payloadHash === input.payloadHash &&
      root.payloadJson === input.payloadJson
  );
}
