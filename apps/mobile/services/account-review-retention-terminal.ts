/** Private payload cleanup only AFTER durable canonical server acceptance. */
import { Q, type Database } from "@nozbe/watermelondb";
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
function invalid(): never { throw new Error(INVALID); }

export async function clearAcceptedAccountReviewPrivateEvidence(input: {
  readonly database: Database;
  readonly actionId: string;
}): Promise<void> {
  const { database, actionId } = input;
  const scope = await getCurrentUserDataScope();
  await database.write(async (): Promise<void> => {
    await assertExpectedCurrentUser(scope.userId);
    const rows = await scope.queryOwned(
      database.get<FinancialActionGroup>("financial_action_groups"),
      Q.where("action_id", actionId)
    ).fetch();
    if (rows.length !== 1 || !rows[0]) invalid();
    const root = scope.assertOwned(rows[0]);
    if (root.kind !== "review_batch_save" ||
        typeof root.localRecoverySnapshotJson !== "string") return;
    if (root.state !== "accepted" ||
        (root.serverOutcome !== "accepted" &&
         root.serverOutcome !== "idempotent") ||
        !root.outcomeJson) invalid();
    let outcome: unknown;
    try { outcome = JSON.parse(root.outcomeJson); } catch { invalid(); }
    if (typeof outcome !== "object" || outcome === null ||
        !("actionId" in outcome) || outcome.actionId !== actionId ||
        !("status" in outcome) || outcome.status !== root.serverOutcome ||
        !("accountRevisions" in outcome) ||
        !Array.isArray(outcome.accountRevisions))
      invalid();
    const snapshot = captureCachedModelSnapshot(root);
    let committed = false;
    try {
      const operation = root.prepareUpdate((row) => {
        row.localRecoverySnapshotJson = null;
      });
      await assertExpectedCurrentUser(scope.userId);
      await commitPreparedBatch([operation], database);
      committed = true;
    } catch (error: unknown) {
      if (!committed) restoreCachedModelSnapshot(snapshot);
      throw error;
    }
  });
}
