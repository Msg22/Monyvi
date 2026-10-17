/** Private payload cleanup only AFTER durable canonical server acceptance. */
import { Q, type Database } from "@nozbe/watermelondb";
import * as Crypto from "expo-crypto";
import {
  hashFinancialActionEnvelope,
  parseFinancialActionEnvelopeJson,
  type Sha256Provider,
} from "@monyvi/logic";
import { parseAccountReviewLocalSaveSnapshot } from "../../../packages/logic/src/financial-actions/review-local-recovery";
import { validateReviewBatchSavePayload } from "../../../packages/logic/src/financial-actions/review-batch-save";
import { createAccountReviewFinancialRegistry } from "./account-review-financial-command-service";
import {
  assertReviewSmsBookkeepingAuthority,
  proveAcceptedTerminalSmsCleanup,
} from "./account-review-pruned-sms-proof";
const LOCAL_HASH: Sha256Provider = {
  digestUtf8: (value: string): Promise<string> =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
};
import type { FinancialActionGroup } from "@monyvi/db";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";
import {
  captureCachedModelSnapshot,
  restoreCachedModelSnapshot,
} from "./watermelon-cache-snapshot";
import { commitPreparedBatch } from "./watermelon-atomic-batch";

const INVALID = "account_review_private_terminal_evidence_invalid";
function invalid(): never {
  throw new Error(INVALID);
}

export async function clearAcceptedAccountReviewPrivateEvidence(input: {
  readonly database: Database;
  readonly actionId: string;
}): Promise<void> {
  const { database, actionId } = input;
  const scope = await getCurrentUserDataScope();
  await database.write(async (): Promise<void> => {
    await assertExpectedCurrentUser(scope.userId);
    const rows = await scope
      .queryOwned(
        database.get<FinancialActionGroup>("financial_action_groups"),
        Q.where("action_id", actionId)
      )
      .fetch();
    if (rows.length !== 1 || !rows[0]) invalid();
    const root = scope.assertOwned(rows[0]);
    if (
      root.kind !== "review_batch_save" ||
      typeof root.localRecoverySnapshotJson !== "string"
    )
      return;
    if (
      root.state !== "accepted" ||
      (root.serverOutcome !== "accepted" &&
        root.serverOutcome !== "idempotent") ||
      !root.outcomeJson
    )
      invalid();
    let outcome: unknown;
    try {
      outcome = JSON.parse(root.outcomeJson);
    } catch {
      invalid();
    }
    if (
      typeof outcome !== "object" ||
      outcome === null ||
      !("actionId" in outcome) ||
      outcome.actionId !== actionId ||
      !("status" in outcome) ||
      outcome.status !== root.serverOutcome ||
      !("accountRevisions" in outcome) ||
      !Array.isArray(outcome.accountRevisions)
    )
      invalid();
    // Acceptance is NOT permission to destroy sealed local-only evidence.
    // Reuse the same full public root, private/public membership and physical
    // original proof as all-dedup. The terminal state is never reopened.
    const registry = createAccountReviewFinancialRegistry();
    const envelope = parseFinancialActionEnvelopeJson(
      root.payloadJson,
      registry
    );
    const canonical = await hashFinancialActionEnvelope(
      envelope,
      LOCAL_HASH,
      registry
    );
    if (
      envelope.domain !== "transactions" ||
      envelope.kind !== "review_batch_save" ||
      envelope.payloadVersion !== "review.batch-save/v1" ||
      envelope.actionId !== root.actionId ||
      envelope.userId !== root.userId ||
      envelope.domainReferenceId !== root.domainReferenceId ||
      JSON.stringify(envelope.accountGuards) !== root.accountGuardsJson ||
      canonical.canonicalText !== root.payloadJson ||
      canonical.payloadHash !== root.payloadHash
    )
      invalid();
    const payload = validateReviewBatchSavePayload(envelope.payload);
    const privateSnapshot = parseAccountReviewLocalSaveSnapshot({
      json: root.localRecoverySnapshotJson,
      expectedRoot: {
        actionId: root.actionId,
        ownerId: root.userId,
        sessionId: payload.sessionId,
        source: payload.source,
      },
    });
    await assertReviewSmsBookkeepingAuthority({
      database,
      root: { root, payload, snapshot: privateSnapshot },
      ownerId: root.userId,
      hashProvider: LOCAL_HASH,
    });
    const sealed = await proveAcceptedTerminalSmsCleanup({
      database,
      ownerId: root.userId,
      payload,
      snapshot: privateSnapshot,
      hashProvider: LOCAL_HASH,
    });
    if (sealed === null) {
      // Partial Save retains physical originals for later verified cleanup.
      await assertExpectedCurrentUser(scope.userId);
      return;
    }
    const cached = [root, ...sealed].map(captureCachedModelSnapshot);
    let committed = false;
    try {
      const operation = root.prepareUpdate((row) => {
        row.localRecoverySnapshotJson = null;
      });
      await assertExpectedCurrentUser(scope.userId);
      await commitPreparedBatch(
        [
          operation,
          ...sealed.map((model) => model.prepareDestroyPermanently()),
        ],
        database
      );
      committed = true;
    } catch (error: unknown) {
      if (!committed) cached.forEach(restoreCachedModelSnapshot);
      throw error;
    }
  });
}
