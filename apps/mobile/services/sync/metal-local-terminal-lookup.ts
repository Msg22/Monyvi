import { Q, type Database } from "@nozbe/watermelondb";
import type { FinancialActionGroup } from "@monyvi/db";

export async function collectLocalTerminalActionIds(
  database: Database,
  userId: string,
  holdingIds: ReadonlySet<string>
): Promise<ReadonlySet<string>> {
  if (holdingIds.size === 0) {
    return new Set();
  }

  const localRoots = await database
    .get<FinancialActionGroup>("financial_action_groups")
    .query(
      Q.where("domain", "metals"),
      Q.where("user_id", userId),
      Q.where("domain_reference_id", Q.oneOf([...holdingIds])),
      Q.where("server_outcome", Q.oneOf(["accepted", "idempotent", "stale", "rejected"])),
      Q.where("deleted", false)
    )
    .fetch();

  const actionIds = new Set<string>();
  for (const root of localRoots) {
    const state = root.state;
    const serverOutcome = root.serverOutcome;
    const isValidTerminal =
      (state === "accepted" && (serverOutcome === "accepted" || serverOutcome === "idempotent")) ||
      (state === "reconciled" && (serverOutcome === "stale" || serverOutcome === "rejected"));
    if (isValidTerminal && typeof root.actionId === "string") {
      actionIds.add(root.actionId);
    }
  }
  return actionIds;
}