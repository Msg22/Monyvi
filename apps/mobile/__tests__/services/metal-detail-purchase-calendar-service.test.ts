import {
  resolveMetalDetailPurchaseCalendar,
  type MetalDetailCalendarResolutionInput,
} from "../../services/metal-detail-purchase-calendar-service";

const OWNER = "owner-1";
const HOLDING = "holding-1";

type Event = MetalDetailCalendarResolutionInput["events"][number];
type Evidence = MetalDetailCalendarResolutionInput["evidence"][number];
type Group = MetalDetailCalendarResolutionInput["groups"][number];
type Facts = Readonly<Record<string, string | null>>;

function facts(purchaseDate: string): Facts {
  return {
    weightGramsDecimal: "10",
    purityCode: "gold-999",
    purityCatalogVersion: "1",
    purityFactorDecimal: "0.999",
    purchasePriceDecimal: "150000",
    purchaseCurrency: "EGP",
    purchaseDate,
    physicalForm: "BAR",
  };
}

function action(
  actionId: string,
  kind: string,
  predecessorEventId: string | null,
  payloadFields: Readonly<Record<string, unknown>>,
  reversesEventId: string | null = null
): {
  readonly event: Event;
  readonly evidence: Evidence;
  readonly group: Group;
} {
  const payloadJson = JSON.stringify({
    holdingId: HOLDING,
    predecessorEventId,
    reversesEventId,
    ...payloadFields,
  });
  return {
    event: {
      id: actionId,
      actionId,
      kind,
      holdingId: HOLDING,
      userId: OWNER,
      deleted: false,
      isEffective: true,
      predecessorEventId,
      reversesEventId,
      payloadJson,
    },
    evidence: {
      actionId,
      kind,
      holdingId: HOLDING,
      userId: OWNER,
      deleted: false,
      domainPayloadJson: payloadJson,
    },
    group: {
      actionId,
      kind,
      domain: "metals",
      domainReferenceId: HOLDING,
      userId: OWNER,
      deleted: false,
      state: "accepted",
      serverOutcome: "accepted",
      payloadJson: JSON.stringify({
        envelopeVersion: "monyvi.financial-action/v1",
        actionId,
        kind,
        domain: "metals",
        domainReferenceId: HOLDING,
        userId: OWNER,
        payload: JSON.parse(payloadJson) as unknown,
      }),
    },
  };
}

function add(date: string): ReturnType<typeof action> {
  return action("add", "add", null, {
    expectedHoldingRevision: null,
    metalType: "GOLD",
    materialFacts: facts(date),
  });
}

function correction(
  previousDate: string,
  nextDate: string,
  predecessorEventId = "add"
): ReturnType<typeof action> {
  return action("correct-date", "correct", predecessorEventId, {
    expectedHoldingRevision: "0",
    metadataChange: null,
    materialCorrection: {
      before: facts(previousDate),
      after: facts(nextDate),
      reason: "Fix purchase date",
      rateSnapshots: [],
    },
  });
}

function input(
  storedEpoch: string,
  actions: ReadonlyArray<ReturnType<typeof action>>,
  options: {
    readonly acquisitionActionId?: string | null;
    readonly date?: string;
  } = {}
): MetalDetailCalendarResolutionInput {
  const latest = actions[actions.length - 1];
  return {
    asset: {
      id: HOLDING,
      userId: OWNER,
      purchaseDate: new Date(storedEpoch),
      purchaseCurrency: "EGP",
      purchasePriceDecimal: "150000",
      acquisitionActionId:
        options.acquisitionActionId === undefined
          ? "add"
          : options.acquisitionActionId,
    },
    metal: {
      metalType: "GOLD",
      itemForm: "BAR",
      weightGramsDecimal: "10",
      purityCode: "gold-999",
      purityCatalogVersion: "1",
      purityFactorDecimal: "0.999",
    },
    state: {
      userId: OWNER,
      holdingId: HOLDING,
      effectiveActionId: latest?.event.actionId ?? null,
      effectiveEventId: latest?.event.id ?? null,
      status: "active",
      isVisible: true,
      reconciliationState: "local_complete",
    },
    events: actions.map((entry) => entry.event),
    evidence: actions.map((entry) => entry.evidence),
    groups: actions.map((entry) => entry.group),
  };
}

describe("#355 canonical metal purchase calendar (timezone-stable)", () => {
  it.each([
    ["Cairo winter", "2026-01-10", "2026-01-09T22:00:00.000Z"],
    ["Cairo summer", "2026-07-10", "2026-07-09T21:00:00.000Z"],
    ["New York winter", "2026-01-10", "2026-01-10T05:00:00.000Z"],
    ["New York summer", "2026-07-10", "2026-07-10T04:00:00.000Z"],
  ])(
    "uses durable civil date, not the timezone of %s epoch",
    (_name, date, epoch) => {
      expect(
        resolveMetalDetailPurchaseCalendar(input(epoch, [add(date)]))
      ).toEqual({
        purchaseDate: date,
        acquisitionActionId: "add",
      });
    }
  );

  it("uses a material correction after-date even with zero replacement references", () => {
    const actions = [add("2026-10-09"), correction("2026-10-09", "2026-10-10")];
    expect(
      resolveMetalDetailPurchaseCalendar(
        input("2026-10-09T21:00:00.000Z", actions, {
          acquisitionActionId: null,
        })
      )
    ).toEqual({
      purchaseDate: "2026-10-10",
      acquisitionActionId: null,
    });
    // A stale projected acquisition action must not lend its old pair to the new date.
    expect(
      resolveMetalDetailPurchaseCalendar(
        input("2026-10-09T21:00:00.000Z", actions)
      )?.acquisitionActionId
    ).toBeNull();
  });

  it("follows metadata-only correction, terminal action and Restore back to the last material date", () => {
    const actions = [
      add("2026-10-09"),
      correction("2026-10-09", "2026-10-10"),
      action("correct-meta", "correct", "correct-date", {
        expectedHoldingRevision: "1",
        metadataChange: { before: { name: "old" }, after: { name: "new" } },
        materialCorrection: null,
      }),
      action("sold", "sell", "correct-meta", {
        expectedHoldingRevision: "2",
      }),
      action(
        "restored",
        "undo",
        "sold",
        {
          expectedHoldingRevision: "3",
        },
        "sold"
      ),
    ];
    expect(
      resolveMetalDetailPurchaseCalendar(
        input("2026-10-10T00:00:00.000Z", actions, {
          acquisitionActionId: null,
        })
      )?.purchaseDate
    ).toBe("2026-10-10");
  });

  it("fails closed for missing, foreign, malformed, rejected, duplicate or conflicting proof", () => {
    const valid = input("2026-10-09T21:00:00.000Z", [add("2026-10-10")]);
    const cases: MetalDetailCalendarResolutionInput[] = [
      { ...valid, evidence: [] },
      { ...valid, evidence: [{ ...valid.evidence[0], userId: "other" }] },
      {
        ...valid,
        evidence: [{ ...valid.evidence[0], domainPayloadJson: "{" }],
      },
      { ...valid, events: [{ ...valid.events[0], isEffective: false }] },
      { ...valid, events: [...valid.events, valid.events[0]] },
      { ...valid, evidence: [...valid.evidence, valid.evidence[0]] },
      { ...valid, groups: [...valid.groups, valid.groups[0]] },
      {
        ...valid,
        groups: [{ ...valid.groups[0], state: "rejected_compensating" }],
      },
      {
        ...valid,
        groups: [
          {
            ...valid.groups[0],
            payloadJson: JSON.stringify({ materialFacts: facts("2026-10-09") }),
          },
        ],
      },
      {
        ...valid,
        events: [{ ...valid.events[0], predecessorEventId: "different" }],
      },
      { ...valid, state: { ...valid.state, effectiveActionId: "not-current" } },
      { ...valid, asset: { ...valid.asset, purchaseCurrency: "USD" } },
      {
        ...valid,
        asset: {
          ...valid.asset,
          purchaseDate: new Date("2025-01-01T00:00:00.000Z"),
        },
      },
    ];
    cases.forEach((candidate) => {
      expect(resolveMetalDetailPurchaseCalendar(candidate)).toBeNull();
    });
  });

  it("rejects broken correction before facts and an invalid Restore lineage", () => {
    const actions = [add("2026-10-09"), correction("2026-10-08", "2026-10-10")];
    expect(
      resolveMetalDetailPurchaseCalendar(
        input("2026-10-09T21:00:00.000Z", actions)
      )
    ).toBeNull();
    const sold = action("sold", "sell", "add", {
      expectedHoldingRevision: "0",
    });
    const badUndo = action(
      "restore",
      "undo",
      "sold",
      { expectedHoldingRevision: "1" },
      "other"
    );
    expect(
      resolveMetalDetailPurchaseCalendar(
        input("2026-10-10T00:00:00.000Z", [add("2026-10-10"), sold, badUndo])
      )
    ).toBeNull();
  });

  it("only falls back to an exact UTC-midnight legacy date-only projection", () => {
    const legacy = input("2024-03-14T00:00:00.000Z", [], {
      acquisitionActionId: null,
    });
    expect(resolveMetalDetailPurchaseCalendar(legacy)).toEqual({
      purchaseDate: "2024-03-14",
      acquisitionActionId: null,
    });
    expect(
      resolveMetalDetailPurchaseCalendar({
        ...legacy,
        asset: {
          ...legacy.asset,
          purchaseDate: new Date("2024-03-13T22:00:00.000Z"),
        },
      })
    ).toBeNull();
    expect(
      resolveMetalDetailPurchaseCalendar({
        ...legacy,
        events: [add("2024-03-14").event],
      })
    ).toBeNull();
  });
});
