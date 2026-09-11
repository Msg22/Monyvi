import type { Database } from "@nozbe/watermelondb";
import type { MetalLifecycleEvent } from "@monyvi/db";

import { findPriorAcquisitionActionId } from "../../services/metal-reconciliation-provenance-service";

const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
const HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000020";
const REJECTED_CORRECTION_ID = "018f0c7a-1234-7abc-8def-000000000021";
const ACCEPTED_ADD_ID = "018f0c7a-1234-7abc-8def-000000000022";

function event(input: {
  readonly actionId: string;
  readonly kind: string;
  readonly predecessorEventId: string | null;
  readonly isEffective: boolean;
  readonly materialCorrection?: boolean;
}): MetalLifecycleEvent {
  return {
    actionId: input.actionId,
    holdingId: HOLDING_ID,
    isEffective: input.isEffective,
    kind: input.kind,
    payloadJson: JSON.stringify({
      materialCorrection: input.materialCorrection ? { before: {}, after: {} } : null,
    }),
    predecessorEventId: input.predecessorEventId,
  } as unknown as MetalLifecycleEvent;
}

describe("metal reconciliation acquisition provenance", () => {
  it("skips an ineffective material-correction loser and restores only an effective predecessor with an accepted root", async () => {
    const loser = event({
      actionId: REJECTED_CORRECTION_ID,
      kind: "correct",
      predecessorEventId: ACCEPTED_ADD_ID,
      isEffective: false,
      materialCorrection: true,
    });
    const acceptedAdd = event({
      actionId: ACCEPTED_ADD_ID,
      kind: "add",
      predecessorEventId: null,
      isEffective: true,
    });
    const lifecycleFetch = jest
      .fn<Promise<MetalLifecycleEvent[]>, []>()
      .mockResolvedValueOnce([loser])
      .mockResolvedValueOnce([acceptedAdd]);
    const rootFetch = jest.fn<Promise<readonly unknown[]>, []>().mockResolvedValueOnce([
      {
        actionId: ACCEPTED_ADD_ID,
        deleted: false,
        domain: "metals",
        domainReferenceId: HOLDING_ID,
        state: "accepted",
        userId: USER_ID,
      },
    ]);
    const database = {
      get: (table: string) => ({
        query: () => ({
          fetch: () =>
            table === "metal_lifecycle_events" ? lifecycleFetch() : rootFetch(),
        }),
      }),
    } as unknown as Database;
    const rejectedCorrection = event({
      actionId: "018f0c7a-1234-7abc-8def-000000000023",
      kind: "correct",
      predecessorEventId: REJECTED_CORRECTION_ID,
      isEffective: true,
      materialCorrection: true,
    });

    await expect(
      findPriorAcquisitionActionId(
        database,
        rejectedCorrection,
        USER_ID,
        HOLDING_ID
      )
    ).resolves.toBe(ACCEPTED_ADD_ID);
    expect(rootFetch).toHaveBeenCalledTimes(1);
  });
});
