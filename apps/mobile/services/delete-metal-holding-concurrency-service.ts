import { Q, type Database } from "@nozbe/watermelondb";
import type { MetalHoldingState } from "@monyvi/db";

import { queryOwned } from "./user-data-access";

export interface DeleteHoldingConcurrencyToken {
  readonly expectedFinancialRevision: string;
  readonly predecessorEventId: string | null;
}

export async function readDeleteHoldingConcurrencyToken(
  database: Database,
  userId: string,
  holdingId: string
): Promise<DeleteHoldingConcurrencyToken> {
  const states = await queryOwned(
    database.get<MetalHoldingState>("metal_holding_states"),
    userId,
    Q.where("holding_id", holdingId),
    Q.where("deleted", false),
    Q.take(1)
  ).fetch();
  const state = states[0];
  if (!state) throw new Error("metal_holding_not_found");
  return {
    expectedFinancialRevision: state.financialRevision,
    predecessorEventId: state.effectiveEventId,
  };
}
