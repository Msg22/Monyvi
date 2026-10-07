import type { SyncPushArgs } from "@nozbe/watermelondb/sync";

import { changedRecords } from "./metal-row-routing";

export function expectedRevisionOrder(root: Record<string, unknown>): bigint {
  try {
    const envelope = JSON.parse(String(root.payload_json)) as {
      readonly payload?: { readonly expectedHoldingRevision?: unknown };
    };
    const revision = envelope.payload?.expectedHoldingRevision;
    if (revision === null) return -1n;
    return typeof revision === "string"
      ? BigInt(revision)
      : 9223372036854775808n;
  } catch {
    return 9223372036854775808n;
  }
}

export function isCompleteMetalActionGroup(
  changes: SyncPushArgs["changes"],
  root: Record<string, unknown>
): boolean {
  try {
    const envelope = JSON.parse(String(root.payload_json)) as {
      readonly actionId: string;
      readonly domainReferenceId: string;
      readonly kind: string;
      readonly payload: {
        readonly holdingId: string;
        readonly rateSnapshots?: ReadonlyArray<{
          readonly referenceId: string;
        }>;
        readonly materialCorrection?: {
          readonly rateSnapshots?: ReadonlyArray<{
            readonly referenceId: string;
          }>;
        } | null;
      };
      readonly userId: string;
    };
    if (
      envelope.actionId !== root.action_id ||
      envelope.userId !== root.user_id ||
      envelope.domainReferenceId !== envelope.payload.holdingId ||
      root.domain_reference_id !== envelope.domainReferenceId ||
      root.kind !== envelope.kind
    ) {
      return false;
    }
    const matchesActionRow = (record: Record<string, unknown>): boolean =>
      record.action_id === envelope.actionId &&
      record.user_id === envelope.userId &&
      record.holding_id === envelope.payload.holdingId;
    const evidence = changedRecords(changes, "metal_action_evidence").filter(
      matchesActionRow
    );
    const events = changedRecords(changes, "metal_lifecycle_events").filter(
      matchesActionRow
    );
    const states = changedRecords(changes, "metal_holding_states").filter(
      (record) =>
        record.user_id === envelope.userId &&
        (record.holding_id === envelope.payload.holdingId ||
          record.id === envelope.payload.holdingId)
    );
    const snapshots =
      envelope.payload.materialCorrection?.rateSnapshots ??
      envelope.payload.rateSnapshots ??
      [];
    const expectedRateIds = new Set(
      snapshots.map((snapshot) => snapshot.referenceId)
    );
    const rates = changedRecords(changes, "metal_rate_references").filter(
      matchesActionRow
    );
    return (
      evidence.length === 1 &&
      evidence[0]?.kind === envelope.kind &&
      events.length === 1 &&
      (events[0]?.kind === envelope.kind ||
        (envelope.kind === "add" && events[0]?.kind === "created")) &&
      states.length === 1 &&
      rates.length === expectedRateIds.size &&
      rates.every(
        (record) =>
          typeof record.id === "string" && expectedRateIds.has(record.id)
      )
    );
  } catch {
    return false;
  }
}
