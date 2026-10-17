/** #395 T054: one retry-stable frozen Save capture; no financial writer duplication. */
import * as Crypto from "expo-crypto";
import {
  accountReviewSaveIntentSchema,
  accountReviewSessionSchema,
  type AccountReviewGroup,
  type AccountReviewRow,
  type AccountReviewSaveIntent,
  type AccountReviewSession,
  type Sha256Provider,
} from "@monyvi/logic";
import {
  freezeSelectedAccountReview,
  plannedAccountReviewGroupAliases,
  type ReviewSaveInput,
} from "./account-review-save-preparation";
import type { AccountReviewSaveResult } from "./account-review-save-service";
import { getCurrentUserId } from "./supabase";

type Plan = AccountReviewSaveIntent["plannedEntityIds"][number];
const hashProvider: Sha256Provider = {
  digestUtf8: (s: string): Promise<string> =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s),
};

export interface AccountReviewRuntimeSaveCapture {
  readonly identity: string;
  readonly ownerId: string;
  readonly sessionId: string;
  readonly source: AccountReviewSession["source"];
  readonly immediate: ReviewSaveInput | null;
  readonly prepared: Promise<ReviewSaveInput>;
}

function requiredGroups(
  session: AccountReviewSession,
  selected: readonly AccountReviewRow[]
): readonly AccountReviewGroup[] {
  const ids = new Set<string>();
  for (const row of selected) {
    if (row.assignment.state === "suggested") ids.add(row.assignment.groupId);
    if (row.toAssignment?.state === "suggested")
      ids.add(row.toAssignment.groupId);
  }
  return [...ids].map((id) => {
    const group = session.groups.find((item) => item.groupId === id);
    if (!group || group.status !== "confirmed" || group.type === null)
      throw new Error("account_review_runtime_group_not_confirmed");
    return group;
  });
}

/** Synchronously freeze source graph, revisions, identities, and timestamp. */
export function captureAccountReviewRuntimeSave(
  source: AccountReviewSession,
  previous: AccountReviewRuntimeSaveCapture | null
): AccountReviewRuntimeSaveCapture {
  const session = accountReviewSessionSchema.parse(source);
  const identity = JSON.stringify(session);
  if (
    previous?.identity === identity &&
    previous.ownerId === session.ownerId &&
    previous.sessionId === session.sessionId &&
    previous.source === session.source
  )
    return previous;
  if (session.saveIntent !== null) {
    const immediate = { session, intent: session.saveIntent };
    freezeSelectedAccountReview(immediate);
    return {
      identity,
      ownerId: session.ownerId,
      sessionId: session.sessionId,
      source: session.source,
      immediate,
      prepared: Promise.resolve(immediate),
    };
  }
  const selected = session.rows.filter((row) => row.selected);
  if (selected.length === 0)
    throw new Error("account_review_runtime_empty_selection");
  const groups = requiredGroups(session, selected);
  // Allocate all physical IDs before the first asynchronous child digest.
  const capacity =
    selected.length +
    groups.reduce((n, group) => n + 2 + group.senderNames.length, 0);
  const physicalIds = Array.from({ length: capacity }, () =>
    Crypto.randomUUID()
  );
  const actionId = Crypto.randomUUID();
  const occurredAt = new Date().toISOString();
  const prepared = (async (): Promise<ReviewSaveInput> => {
    let nextIndex = 0;
    const add = (entity: Plan["entity"], localRef: string): Plan => {
      const id = physicalIds[nextIndex++];
      if (!id) throw new Error("account_review_runtime_plan_overflow");
      return { entity, localRef, id };
    };
    const plannedEntityIds: Plan[] = selected.map((row) =>
      add(
        row.source === "SMS" && row.transaction.isAtmWithdrawal === true
          ? "transfer"
          : "transaction",
        row.rowId
      )
    );
    for (const group of groups) {
      const aliases = await plannedAccountReviewGroupAliases({
        ownerId: session.ownerId,
        sessionId: session.sessionId,
        group,
        hashProvider,
      });
      for (const alias of aliases)
        plannedEntityIds.push(add(alias.entity, alias.localRef));
    }
    const intent = accountReviewSaveIntentSchema.parse({
      actionId,
      ownerId: session.ownerId,
      source: session.source,
      sessionId: session.sessionId,
      expectedReviewRevision: session.revision,
      expectedOperationGeneration: session.operationGeneration,
      selectedRows: selected.map((row) => ({
        rowId: row.rowId,
        revision: row.revision,
      })),
      confirmedGroups: groups.map((group) => ({
        groupId: group.groupId,
        revision: group.revision,
        evidenceKey: group.evidenceKey,
      })),
      plannedEntityIds,
      occurredAt,
    });
    const input: ReviewSaveInput = {
      session: accountReviewSessionSchema.parse({
        ...session,
        saveIntent: intent,
      }),
      intent,
    };
    freezeSelectedAccountReview(input);
    return input;
  })();
  return {
    identity,
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    source: session.source,
    immediate: null,
    prepared,
  };
}

export function attachOwnedRuntimeIntent(
  current: AccountReviewSession,
  input: ReviewSaveInput
): AccountReviewSession {
  const owned = accountReviewSessionSchema.parse(current);
  // Durable SMS V2 intentionally reconstructs saveIntent:null. No new
  // persisted field is introduced: only exact, current owner/session preimages
  // may receive this locally frozen pending intent inside the Save boundary.
  if (
    JSON.stringify({ ...owned, saveIntent: null }) !==
    JSON.stringify({ ...input.session, saveIntent: null })
  )
    throw new Error("account_review_runtime_session_cas_changed");
  return accountReviewSessionSchema.parse({
    ...owned,
    saveIntent: input.intent,
  });
}

export async function assertRuntimeOwner(ownerId: string): Promise<string> {
  const current = await getCurrentUserId();
  if (current !== ownerId)
    throw new Error("account_review_runtime_actor_changed");
  return current;
}

/** Entrypoint for the existing immutable financial action service only. */
export function saveCapturedAccountReview(
  capture: AccountReviewRuntimeSaveCapture,
  loadCurrent: (
    ownerId: string,
    sessionId: string
  ) => Promise<AccountReviewSession>
): Promise<AccountReviewSaveResult> {
  const save = async (
    input: ReviewSaveInput
  ): Promise<AccountReviewSaveResult> => {
    await assertRuntimeOwner(capture.ownerId);
    // Keep service/database loading at Save invocation, not module evaluation.
    // Loading is outside the SQLite writer and never resamples frozen IDs.
    const [{ database }, { createAccountReviewSaveService }] =
      await Promise.all([
        import("@monyvi/db"),
        import("./account-review-save-service"),
      ]);
    await assertRuntimeOwner(capture.ownerId);
    return createAccountReviewSaveService({
      database,
      hashProvider,
      getCurrentOwnerId: () => assertRuntimeOwner(capture.ownerId),
      loadCurrentSession: async (ownerId, sessionId) => {
        await assertRuntimeOwner(capture.ownerId);
        if (ownerId !== capture.ownerId || sessionId !== capture.sessionId)
          throw new Error("account_review_runtime_session_scope_changed");
        const current = await loadCurrent(ownerId, sessionId);
        await assertRuntimeOwner(capture.ownerId);
        return attachOwnedRuntimeIntent(current, input);
      },
    }).saveSelectedAccountReview(input);
  };
  // Both paths reuse the already frozen input. Deferred module loading adds
  // no intent allocation, and current owner/session CAS still gates the writer.
  return capture.immediate
    ? save(capture.immediate)
    : capture.prepared.then(save);
}
