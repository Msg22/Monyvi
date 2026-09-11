import { Q, type Database } from "@nozbe/watermelondb";
import type { MetalLifecycleEvent } from "@monyvi/db";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMaterialCorrectionEvent(event: MetalLifecycleEvent): boolean {
  try {
    const payload = JSON.parse(event.payloadJson) as unknown;
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload)
    ) {
      throw new Error("incomplete_metal_action_group");
    }
    const materialCorrection = (payload as Readonly<Record<string, unknown>>)
      .materialCorrection;
    if (materialCorrection === null) return false;
    if (
      typeof materialCorrection !== "object" ||
      Array.isArray(materialCorrection)
    ) {
      throw new Error("incomplete_metal_action_group");
    }
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "incomplete_metal_action_group"
    ) {
      throw error;
    }
    throw new Error("incomplete_metal_action_group");
  }
}

function isRevisionZeroLegacyCorrection(event: MetalLifecycleEvent): boolean {
  if (event.kind !== "correct" || event.predecessorEventId !== null)
    return false;
  try {
    const payload = JSON.parse(event.payloadJson) as unknown;
    return (
      isRecord(payload) &&
      payload.expectedHoldingRevision === "0" &&
      payload.predecessorEventId === null &&
      isRecord(payload.materialCorrection)
    );
  } catch {
    throw new Error("incomplete_metal_action_group");
  }
}

export async function findPriorAcquisitionActionId(
  database: Database,
  event: MetalLifecycleEvent,
  userId: string,
  holdingId: string
): Promise<string | null> {
  let predecessorId = event.predecessorEventId;
  if (predecessorId === null && isRevisionZeroLegacyCorrection(event)) {
    return null;
  }
  const visited = new Set<string>();
  while (predecessorId !== null && !visited.has(predecessorId)) {
    visited.add(predecessorId);
    const predecessors = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query(Q.where("action_id", predecessorId), Q.where("user_id", userId))
      .fetch();
    const predecessor = predecessors[0] ?? null;
    if (!predecessor || predecessor.holdingId !== holdingId) break;
    if (
      predecessor.kind === "add" ||
      (predecessor.kind === "correct" && isMaterialCorrectionEvent(predecessor))
    ) {
      return predecessor.actionId;
    }
    predecessorId = predecessor.predecessorEventId;
  }
  throw new Error("incomplete_metal_action_group");
}
