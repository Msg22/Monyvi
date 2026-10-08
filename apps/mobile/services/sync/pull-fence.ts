import { z } from "zod";

import { supabase } from "../supabase";
import { createSyncTableError } from "./errors";

const watermarkSchema = z.string().datetime({ offset: true });

/** Seal the ordinary writer fence without changing the market delivery cut. */
export async function sealSyncPull(upperWatermark: string): Promise<void> {
  const { data, error } = await supabase.rpc("seal_sync_pull_v1", {
    p_upper_watermark: upperWatermark,
  });
  if (error) throw createSyncTableError("pull", "sync_pull_barrier", error);
  const sealed = watermarkSchema.parse(data);
  if (Date.parse(sealed) !== Date.parse(upperWatermark)) {
    throw new Error("sync_pull_invalid_watermark");
  }
}
