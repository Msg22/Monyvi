import fs from "fs";
import path from "path";

import {
  assertCanonicalActionGroup,
  canonicalMetalJson,
  type CanonicalMetalActionGroup,
  type CanonicalMetalHolding,
} from "../../services/metal-canonical-action-group-service";
import { formatMetalLocalCalendarDate } from "../../services/metal-financial-action-repository";
import {
  classifyMetalServerOutcome,
  type MetalRpcOutcome,
} from "../../services/metal-reconciliation-service";

const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
const HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000020";
const PREDECESSOR_ID = "018f0c7a-1234-7abc-8def-000000000019";
const DELETE_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000021";
const ROOT_ID = "018f0c7a-1234-7abc-8def-000000000022";
const TIMESTAMP = "2026-08-31T10:15:30.123Z";
const HASH = "a".repeat(64);

function canonicalHolding(
  purchasePriceDecimal: string,
  weightGramsDecimal: string
): CanonicalMetalHolding {
  return {
    holdingId: HOLDING_ID,
    asset: {
      acquisitionActionId: DELETE_ACTION_ID,
      currency: "EGP",
      name: "Legacy gold",
      notes: null,
      purchaseCurrency: "EGP",
      purchaseDate: "2026-08-01",
      purchasePrice: 100,
      purchasePriceDecimal,
    },
    metal: {
      metalType: "GOLD",
      physicalForm: "BAR",
      purityCatalogVersion: "1",
      purityCode: "gold-9999",
      purityFactorDecimal: "0.9999",
      purityFraction: 0.9999,
      weightGrams: 10,
      weightGramsDecimal,
    },
    state: {
      effectiveActionId: DELETE_ACTION_ID,
      effectiveEventId: DELETE_ACTION_ID,
      financialRevision: "1",
      isVisible: false,
      nameWrittenAt: null,
      nameWriterId: null,
      notesWrittenAt: null,
      notesWriterId: null,
      status: "active",
    },
  };
}

function deleteCanonicalGroup(): CanonicalMetalActionGroup {
  const payload = {
    expectedHoldingRevision: "0",
    holdingId: HOLDING_ID,
    predecessorEventId: PREDECESSOR_ID,
    reversesEventId: null,
  };
  const payloadJson = canonicalMetalJson(payload);
  const envelope = {
    accountGuards: [],
    actionId: DELETE_ACTION_ID,
    domain: "metals",
    domainReferenceId: HOLDING_ID,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "delete",
    occurredAt: TIMESTAMP,
    payload,
    payloadVersion: "metals.delete/v1",
    userId: USER_ID,
  };
  return {
    root: {
      id: ROOT_ID,
      accountGuardsJson: "[]",
      actionId: DELETE_ACTION_ID,
      createdAt: TIMESTAMP,
      deleted: false,
      domain: "metals",
      domainReferenceId: HOLDING_ID,
      kind: "delete",
      outcomeJson: canonicalMetalJson({
        actionId: DELETE_ACTION_ID,
        status: "accepted",
      }),
      payloadHash: HASH,
      payloadJson: canonicalMetalJson(envelope),
      rejectionCode: null,
      serverOutcome: "accepted",
      state: "accepted",
      updatedAt: TIMESTAMP,
      userId: USER_ID,
    },
    evidence: {
      id: DELETE_ACTION_ID,
      actionId: DELETE_ACTION_ID,
      canonicalHoldingRevision: "1",
      createdAt: TIMESTAMP,
      deleted: false,
      domainPayloadJson: payloadJson,
      expectedHoldingRevision: "0",
      holdingId: HOLDING_ID,
      kind: "delete",
      updatedAt: TIMESTAMP,
      userId: USER_ID,
    },
    event: {
      id: DELETE_ACTION_ID,
      actionId: DELETE_ACTION_ID,
      createdAt: TIMESTAMP,
      deleted: false,
      holdingId: HOLDING_ID,
      isEffective: true,
      isHistoryVisible: false,
      kind: "delete",
      occurredAt: TIMESTAMP,
      payloadJson,
      predecessorEventId: PREDECESSOR_ID,
      reversesEventId: null,
      updatedAt: TIMESTAMP,
      userId: USER_ID,
    },
    rates: [],
  };
}

describe("PR #293 review follow-up regressions", () => {
  it("accepts scaled exact decimal text produced by migration-068 backfills", () => {
    const outcome: MetalRpcOutcome = {
      actionId: "018f0c7a-1234-7abc-8def-000000000023",
      canonicalAccounts: [],
      canonicalHoldingActionId: DELETE_ACTION_ID,
      canonicalHoldingEvidenceHash: HASH,
      canonicalHoldingRevision: "1",
      canonicalHolding: canonicalHolding("100.00", "10.0000"),
      code: "HOLDING_REVISION_STALE",
      payloadHashMatches: true,
      staleAccountIds: [],
      status: "stale",
      userId: USER_ID,
    };

    expect(classifyMetalServerOutcome(outcome, USER_ID)).toBe("stale_ready");
  });

  it("preserves a pre-upgrade UTC-midnight calendar date when local components are on the prior day", () => {
    const legacyUtcMidnight = new Date("2026-08-01T00:00:00.000Z");
    jest.spyOn(legacyUtcMidnight, "getFullYear").mockReturnValue(2026);
    jest.spyOn(legacyUtcMidnight, "getMonth").mockReturnValue(6);
    jest.spyOn(legacyUtcMidnight, "getDate").mockReturnValue(31);

    expect(formatMetalLocalCalendarDate(legacyUtcMidnight)).toBe("2026-08-01");

    const localMidnight = new Date("2026-08-01T04:00:00.000Z");
    jest.spyOn(localMidnight, "getFullYear").mockReturnValue(2026);
    jest.spyOn(localMidnight, "getMonth").mockReturnValue(7);
    jest.spyOn(localMidnight, "getDate").mockReturnValue(1);
    expect(formatMetalLocalCalendarDate(localMidnight)).toBe("2026-08-01");
  });

  it("accepts the approved hidden effective Delete event in a canonical winner group", async () => {
    const group = deleteCanonicalGroup();
    await expect(
      assertCanonicalActionGroup(
        {
          canonicalActionGroup: group,
          canonicalHoldingActionId: DELETE_ACTION_ID,
          canonicalHoldingEvidenceHash: HASH,
          canonicalHoldingRevision: "1",
          canonicalHolding: canonicalHolding("100", "10"),
        },
        USER_ID,
        { digestUtf8: () => Promise.resolve(HASH) }
      )
    ).resolves.toEqual(group);
  });

  it("checks an existing accepted replay before migration-071 sale-date revalidation", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../../../../supabase/migrations/071_metals_canonical_group_reconciliation.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf8");
    const lockIndex = sql.indexOf("pg_advisory_xact_lock");
    const replayIndex = sql.indexOf("SELECT * INTO v_existing", lockIndex);
    const acceptedReplayIndex = sql.indexOf(
      "v_existing.state = 'accepted'",
      replayIndex
    );
    const saleDateIndex = sql.indexOf("IF v_envelope ->> 'kind' = 'sell'", lockIndex);

    expect(replayIndex).toBeGreaterThan(lockIndex);
    expect(acceptedReplayIndex).toBeGreaterThan(replayIndex);
    expect(saleDateIndex).toBeGreaterThan(acceptedReplayIndex);
  });
});
