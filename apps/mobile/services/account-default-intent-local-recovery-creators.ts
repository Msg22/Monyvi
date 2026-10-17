/**
 * Private Add recovery creator provenance: COMPLETE frozen graph membership,
 * immutable SHA256/guard roots, exact accepted/idempotent receipts and
 * revision/effect coverage. Still called inside the dedicated writer.
 */
import type { Database } from "@nozbe/watermelondb";
import type { FinancialActionGroup } from "@monyvi/db";
import {
  assertFinancialActionStateEvidence,
  hashFinancialActionEnvelope,
  parseFinancialActionEnvelopeJson,
  parseFinancialActionEvidenceJson,
  type Sha256Provider,
} from "@monyvi/logic";
import type { AccountCreateDefaultLocalSaveSnapshot } from "../../../packages/logic/src/financial-actions/account-create-default-local-recovery";
import {
  validateAccountCreateDefaultPayload,
  type AccountCreateDefaultPayload,
} from "../../../packages/logic/src/financial-actions/account-create-default";
import { validateReviewBatchSavePayload } from "../../../packages/logic/src/financial-actions/review-batch-save";
import {
  uuidSchema,
  revisionSchema,
  timestampSchema,
} from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import { createAccountReviewFinancialRegistry } from "./account-review-financial-command-service";
import { matchesCapturedAccountGuards } from "./account-default-intent-snapshot";
import type { CurrentUserDataScope } from "./user-data-access";

const INCOMPLETE = "financial_action_reconciliation_incomplete";
function refuse(): never {
  throw new Error(INCOMPLETE);
}
function isRecord(v: unknown): v is Readonly<Record<string, unknown>> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function exactKeys(
  v: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): boolean {
  const found = Object.keys(v).sort();
  return (
    found.length === keys.length &&
    found.every((key, index) => key === [...keys].sort()[index])
  );
}

interface AccountRevisionEvidence {
  readonly accountId: string;
  readonly revision: string;
}
function nextAcceptedRevision(value: string): string {
  if (!revisionSchema.safeParse(value).success) refuse();
  const next = BigInt(value) + 1n;
  if (next > 9223372036854775807n) refuse();
  return next.toString();
}
function expectedAcceptedCreatorRevisions(
  envelope: ReturnType<typeof parseFinancialActionEnvelopeJson>
): readonly AccountRevisionEvidence[] {
  const expected = new Map<string, string>();
  const isAdd =
    envelope.domain === "accounts" &&
    envelope.kind === "create_with_default" &&
    envelope.payloadVersion === "account.create-default/v1";
  const isReview =
    envelope.domain === "transactions" &&
    envelope.kind === "review_batch_save" &&
    envelope.payloadVersion === "review.batch-save/v1";
  const isLegacy = envelope.payloadVersion === "account.balance-effects/v1";

  if (isAdd) {
    let payload: AccountCreateDefaultPayload;
    try {
      payload = validateAccountCreateDefaultPayload(envelope.payload);
    } catch {
      refuse();
    }
    const created = payload.domainMutation.records.filter(
      (record) => record.entity === "account" && record.mode === "create"
    );
    if (created.length !== 1 || created[0]?.entity !== "account") refuse();
    // SQL091 lines 928–974: zero-opening Add inserts revision 0 and
    // emits accountRevisions []; nonzero Add inserts revision 1 and
    // emits exactly its created account/revision member. The registered
    // immutable accountEffects prove which branch is admissible. Never
    // infer a financial revision from the mere existence of an account.
    if (payload.accountEffects.length > 0) {
      if (
        payload.accountEffects.length !== 1 ||
        payload.accountEffects[0]?.accountId !== created[0].after.id
      )
        refuse();
      expected.set(created[0].after.id, "1");
    }
  } else if (isReview) {
    // SQL090 always emits revision "1" for each genuinely created account,
    // even when that account's financial effect is zero or absent.
    let payload: ReturnType<typeof validateReviewBatchSavePayload>;
    try {
      payload = validateReviewBatchSavePayload(envelope.payload);
    } catch {
      refuse();
    }
    const created = payload.domainMutation.records.filter(
      (record) => record.entity === "account" && record.mode === "create"
    );
    for (const record of created) {
      if (record.entity !== "account") refuse();
      if (expected.has(record.after.id)) refuse();
      expected.set(record.after.id, "1");
    }
    const effected = new Set<string>();
    for (const effect of payload.accountEffects) {
      if (effected.has(effect.accountId)) refuse();
      effected.add(effect.accountId);
      if (expected.has(effect.accountId)) continue;
      const guard = envelope.accountGuards.find(
        (entry) => entry.accountId === effect.accountId
      );
      if (!guard) refuse();
      expected.set(
        effect.accountId,
        nextAcceptedRevision(guard.expectedRevision)
      );
    }
  } else if (isLegacy) {
    // The ACTUAL registered legacy envelope requires nonzero exact guards/
    // effects. A claimed guarded edit without a relevant physical account
    // CREATE never qualifies as a predecessor creator; the complete frozen
    // graph root scan above enforces that immutable CREATE membership.
    const payload: unknown = envelope.payload;
    if (
      !isRecord(payload) ||
      !Array.isArray(payload.accountEffects) ||
      payload.accountEffects.length !== envelope.accountGuards.length ||
      envelope.accountGuards.length === 0
    )
      refuse();
    const effects: readonly unknown[] = payload.accountEffects;
    for (const [index, effect] of effects.entries()) {
      const guard = envelope.accountGuards[index];
      if (
        !isRecord(effect) ||
        !guard ||
        effect.accountId !== guard.accountId ||
        expected.has(guard.accountId)
      )
        refuse();
      expected.set(
        guard.accountId,
        nextAcceptedRevision(guard.expectedRevision)
      );
    }
  } else {
    // An unsupported creator receipt must remain unresolved; never turn an
    // accepted label into authorized destructive compensation.
    refuse();
  }
  return [...expected]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([accountId, revision]) => ({ accountId, revision }));
}

/** Closed SQL090/091 six-field accepted/idempotent receipt for ALL creators. */
function assertAcceptedCreatorReceipt(
  accepted: Readonly<Record<string, unknown>>,
  root: FinancialActionGroup,
  envelope: ReturnType<typeof parseFinancialActionEnvelopeJson>
): void {
  if (
    !exactKeys(accepted, [
      "actionId",
      "status",
      "accountRevisions",
      "effectiveEventId",
      "holdingRevision",
      "serverAcceptedAt",
    ]) ||
    accepted.actionId !== root.actionId ||
    accepted.status !== root.serverOutcome ||
    accepted.effectiveEventId !== null ||
    accepted.holdingRevision !== null ||
    !timestampSchema.safeParse(accepted.serverAcceptedAt).success ||
    !Array.isArray(accepted.accountRevisions)
  )
    refuse();
  const expected = expectedAcceptedCreatorRevisions(envelope);
  const actual: readonly unknown[] = accepted.accountRevisions;
  if (actual.length !== expected.length) refuse();
  for (const [index, member] of actual.entries()) {
    if (
      !isRecord(member) ||
      !exactKeys(member, ["accountId", "revision"]) ||
      !uuidSchema.safeParse(member.accountId).success ||
      !revisionSchema.safeParse(member.revision).success ||
      member.accountId !== expected[index]?.accountId ||
      member.revision !== expected[index]?.revision
    )
      refuse();
  }
}

/**
 * Reconstruct the COMPLETE original owner-graph's registered account
 * creators from durable local roots, not from the (potentially omitted or
 * substituted) private dependency list. A candidate matters ONLY if its
 * immutable registered payload actually CREATES an account in B's ORIGINAL
 * expected active/default set; guarded edits and unrelated created accounts
 * can never stand in for that creator.
 *
 * NEW Add capture records the COMPLETE originally relevant creator
 * (actionId, payloadHash) set, whether each was already accepted or still
 * unresolved when B was prepared. The separate unresolved-only command IDs
 * gate push ordering; they are not the recovery creator journal.
 * Recovery compares the durable complete set and requires independently
 * authenticated accepted creator receipts. An older unresolved-only private
 * journal missing an accepted-before-B creator still fails closed: do not
 * backfill or reconstruct acceptance-at-prepare from later labels or clocks.
 */
async function deriveFrozenCreatorRootProofs(input: {
  readonly database: Database;
  readonly scope: CurrentUserDataScope;
  readonly root: FinancialActionGroup;
  readonly privateSnapshot: AccountCreateDefaultLocalSaveSnapshot;
  readonly hashProvider: Sha256Provider;
  readonly recheck: () => Promise<void>;
}): Promise<ReadonlyMap<string, FinancialActionGroup>> {
  const {
    database: db,
    scope,
    root,
    privateSnapshot,
    hashProvider,
    recheck,
  } = input;
  const frozenAccounts = new Set(
    privateSnapshot.expectedDefaultSnapshot.activeAccountIds
  );
  const frozenDefault = privateSnapshot.expectedDefaultSnapshot.defaultAccount;
  if (frozenDefault) frozenAccounts.add(frozenDefault.accountId);
  // Deliberately avoid Q.where("deleted", false): an original creator
  // marked soft-deleted is a refusal, never evidence of no dependency.
  const roots = await scope
    .queryOwned(db.get<FinancialActionGroup>("financial_action_groups"))
    .fetch();
  await recheck();
  const found = new Map<string, FinancialActionGroup>();
  const seenCreatedAccounts = new Set<string>();
  const registry = createAccountReviewFinancialRegistry();
  for (const candidate of roots) {
    if (candidate.id === root.id) continue;
    let envelope: ReturnType<typeof parseFinancialActionEnvelopeJson>;
    try {
      envelope = parseFinancialActionEnvelopeJson(
        candidate.payloadJson,
        registry
      );
    } catch {
      refuse();
    }
    const payload: unknown = envelope.payload;
    const mutation: unknown = isRecord(payload) ? payload.domainMutation : null;
    const records: readonly unknown[] =
      isRecord(mutation) && Array.isArray(mutation.records)
        ? mutation.records
        : [];
    const matchingCreates = records.flatMap((record): readonly string[] => {
      if (
        !isRecord(record) ||
        record.entity !== "account" ||
        record.mode !== "create"
      )
        return [];
      const after: unknown = record.after;
      if (!isRecord(after) || typeof after.id !== "string") refuse();
      return frozenAccounts.has(after.id) ? [after.id] : [];
    });
    if (matchingCreates.length === 0) continue;

    if (
      candidate.deleted ||
      candidate.userId !== scope.userId ||
      candidate.id === root.id ||
      envelope.actionId !== candidate.actionId ||
      envelope.userId !== scope.userId ||
      envelope.domain !== candidate.domain ||
      envelope.kind !== candidate.kind ||
      envelope.domainReferenceId !== candidate.domainReferenceId ||
      !matchesCapturedAccountGuards(
        candidate.accountGuardsJson,
        envelope.accountGuards
      ) ||
      found.has(candidate.actionId)
    )
      refuse();
    const digest = await hashFinancialActionEnvelope(
      envelope,
      hashProvider,
      registry
    );
    await recheck();
    if (
      digest.canonicalText !== candidate.payloadJson ||
      digest.payloadHash !== candidate.payloadHash
    )
      refuse();
    for (const accountId of matchingCreates) {
      if (seenCreatedAccounts.has(accountId)) refuse();
      seenCreatedAccounts.add(accountId);
    }
    found.set(candidate.actionId, candidate);
  }

  const durable = [...found.values()]
    .sort((left, right) =>
      left.actionId < right.actionId
        ? -1
        : left.actionId > right.actionId
          ? 1
          : 0
    )
    .map((candidate) => ({
      actionId: candidate.actionId,
      payloadHash: candidate.payloadHash,
    }));
  const frozen = privateSnapshot.dependencyRoots;
  if (
    durable.length !== frozen.length ||
    durable.some(
      (creator, index) =>
        creator.actionId !== frozen[index]?.actionId ||
        creator.payloadHash !== frozen[index]?.payloadHash
    )
  )
    refuse();
  await recheck();
  return found;
}

export async function verifyFrozenCreatorRootProofs(input: {
  readonly database: Database;
  readonly scope: CurrentUserDataScope;
  readonly root: FinancialActionGroup;
  readonly privateSnapshot: AccountCreateDefaultLocalSaveSnapshot;
  readonly hashProvider: Sha256Provider;
  readonly recheck: () => Promise<void>;
}): Promise<void> {
  const {
    database: db,
    scope,
    root,
    privateSnapshot: snapshot,
    hashProvider,
    recheck,
  } = input;
  const genuineCreators = await deriveFrozenCreatorRootProofs({
    database: db,
    scope,
    root,
    privateSnapshot: snapshot,
    hashProvider,
    recheck,
  });
  for (const dependency of snapshot.dependencyRoots) {
    const ancestor = genuineCreators.get(dependency.actionId);
    if (
      !ancestor ||
      ancestor.userId !== scope.userId ||
      ancestor.deleted ||
      ancestor.payloadHash !== dependency.payloadHash ||
      ancestor.state !== "accepted" ||
      (ancestor.serverOutcome !== "accepted" &&
        ancestor.serverOutcome !== "idempotent") ||
      ancestor.rejectionCode !== null ||
      typeof ancestor.outcomeJson !== "string"
    )
      refuse();

    // Merely setting serverOutcome=accepted on an owned row is NOT proof
    // that the corresponding immutable action was canonically accepted.
    try {
      assertFinancialActionStateEvidence("accepted", {
        serverOutcome: ancestor.serverOutcome,
        outcomeJson: ancestor.outcomeJson,
        rejectionCode: ancestor.rejectionCode,
      });
    } catch {
      refuse();
    }
    let accepted: unknown;
    try {
      accepted = parseFinancialActionEvidenceJson(ancestor.outcomeJson);
    } catch {
      refuse();
    }
    if (!isRecord(accepted)) refuse();

    const registry = createAccountReviewFinancialRegistry();
    let envelope: ReturnType<typeof parseFinancialActionEnvelopeJson>;
    try {
      envelope = parseFinancialActionEnvelopeJson(
        ancestor.payloadJson,
        registry
      );
    } catch {
      refuse();
    }
    const digest = await hashFinancialActionEnvelope(
      envelope,
      hashProvider,
      registry
    );
    await recheck();
    if (
      digest.canonicalText !== ancestor.payloadJson ||
      digest.payloadHash !== ancestor.payloadHash ||
      envelope.userId !== scope.userId ||
      envelope.actionId !== ancestor.actionId ||
      envelope.domain !== ancestor.domain ||
      envelope.kind !== ancestor.kind ||
      envelope.domainReferenceId !== ancestor.domainReferenceId ||
      !matchesCapturedAccountGuards(
        ancestor.accountGuardsJson,
        envelope.accountGuards
      )
    )
      refuse();

    // All supported accepted creator classes share the actual SQL090/091
    // closed six-member receipt. Bind every exact bounded account revision
    // to immutable account creates and financial guard/effect membership.
    assertAcceptedCreatorReceipt(accepted, ancestor, envelope);
    await recheck();
  }
}
