import { z } from "zod";

import { supabase } from "../supabase";
import { createSyncTableError } from "./errors";
import { PULL_PAGE_SIZE, pullAllKeysetPages } from "./pull-pagination";
import type { SnapshotTableName } from "./types";

const journalPageSchema = z.object({
  rows: z.array(
    z.object({
      entry_id: z.string().uuid(),
      user_id: z.string().uuid(),
      table_name: z.enum([
        "daily_snapshot_assets",
        "daily_snapshot_balance",
        "daily_snapshot_net_worth",
      ]),
      record_id: z.string().uuid(),
      published_at: z.string(),
    })
  ),
  count: z.number().int().nonnegative(),
  upperWatermark: z.string().datetime({ offset: true }),
});

export async function pullSnapshotDeletions(
  lastSyncDate: string | null,
  upperWatermark: string
): Promise<Record<SnapshotTableName, readonly string[]>> {
  const rows = await pullAllKeysetPages(
    async (cursor) => {
      const { data, error } = await supabase.rpc(
        "pull_snapshot_deletions_page_v1",
        {
          ...(lastSyncDate === null ? {} : { p_last_pulled_at: lastSyncDate }),
          p_upper_watermark: upperWatermark,
          ...(cursor === null
            ? {}
            : {
                p_after_published_at: cursor.timestamp,
                p_after_entry_id: cursor.id,
              }),
          p_limit: PULL_PAGE_SIZE,
        }
      );
      if (error)
        throw createSyncTableError("pull", "sync_snapshot_deletions", error);
      const page = journalPageSchema.parse(data);
      if (Date.parse(page.upperWatermark) !== Date.parse(upperWatermark)) {
        throw new Error("sync_pull_invalid_watermark");
      }
      return page;
    },
    (row) => ({ timestamp: row.published_at, id: row.entry_id })
  );
  return {
    daily_snapshot_assets: rows
      .filter((row) => row.table_name === "daily_snapshot_assets")
      .map((row) => row.record_id),
    daily_snapshot_balance: rows
      .filter((row) => row.table_name === "daily_snapshot_balance")
      .map((row) => row.record_id),
    daily_snapshot_net_worth: rows
      .filter((row) => row.table_name === "daily_snapshot_net_worth")
      .map((row) => row.record_id),
  };
}
