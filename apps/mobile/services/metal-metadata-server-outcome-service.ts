import { supabase, getCurrentUserId } from "./supabase";
import {
  normalizeCanonicalMetalMetadataEditOutcome,
  type CanonicalMetalMetadataEditOutcome,
} from "./metal-metadata-evidence-reconciliation";

/**
 * Post-CAS server read for a mixed correction. A material action's stored
 * payload is submitted intent; only this server-written locked-row outcome
 * proves which metadata fields actually applied.
 */
export async function readCanonicalMixedMetalMetadataOutcome(
  editId: string,
  holdingId: string,
  userId: string,
  payloadHash: string
): Promise<CanonicalMetalMetadataEditOutcome> {
  if ((await getCurrentUserId()) !== userId) {
    throw new Error("financial_action_auth_scope_changed");
  }
  const { data, error } = await supabase
    .from("metal_metadata_edit_outcomes")
    .select(
      "id,user_id,holding_id,action_id,payload_hash,status,applied_changes_json,canonical_metadata_json"
    )
    .eq("user_id", userId)
    .eq("id", editId)
    .eq("holding_id", holdingId)
    .eq("action_id", editId)
    .maybeSingle();
  if (error || !data) {
    throw new Error("metal_metadata_canonical_outcome_unavailable");
  }
  if (
    data.user_id !== userId ||
    data.payload_hash !== payloadHash ||
    data.action_id !== editId
  ) {
    throw new Error("metal_metadata_edit_payload_hash_mismatch");
  }
  if ((await getCurrentUserId()) !== userId) {
    throw new Error("financial_action_auth_scope_changed");
  }
  return normalizeCanonicalMetalMetadataEditOutcome(
    {
      editId: data.id,
      holdingId: data.holding_id,
      status: data.status,
      appliedChanges: data.applied_changes_json,
      canonicalMetadata: data.canonical_metadata_json,
    },
    editId,
    holdingId
  );
}
