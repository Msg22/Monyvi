import type { FinancialActionGroup } from "@monyvi/db";
import {
  parseFinancialActionEnvelopeJson,
  type CanonicalJsonValue,
} from "@monyvi/logic";

import type { MetalActionKind } from "./metal-financial-action-adapter";

export interface StoredMetalActionReplay {
  readonly occurredAt: string;
  readonly rateSnapshots: readonly CanonicalJsonValue[];
}

export function readStoredMetalActionReplay(
  existing: FinancialActionGroup,
  kind: MetalActionKind,
  holdingId: string,
  cairoTodayDate: string
): StoredMetalActionReplay {
  if (existing.kind !== kind || existing.domainReferenceId !== holdingId) {
    throw new Error("action_id_payload_mismatch");
  }
  const envelope = parseFinancialActionEnvelopeJson(
    existing.payloadJson,
    undefined,
    {
      latestAllowedCalendarDate: cairoTodayDate,
    }
  );
  if (
    envelope.actionId !== existing.actionId ||
    envelope.kind !== kind ||
    envelope.domainReferenceId !== holdingId
  ) {
    throw new Error("action_id_payload_mismatch");
  }
  const correction = envelope.payload.materialCorrection;
  const correctionSnapshots =
    correction !== null &&
    typeof correction === "object" &&
    !Array.isArray(correction) &&
    "rateSnapshots" in correction
      ? correction.rateSnapshots
      : [];
  const snapshots =
    kind === "add" ? envelope.payload.rateSnapshots : correctionSnapshots;
  if (!Array.isArray(snapshots)) {
    throw new Error("financial_action_invalid_payload");
  }
  return { occurredAt: envelope.occurredAt, rateSnapshots: snapshots };
}
