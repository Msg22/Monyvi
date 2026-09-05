import { createHash } from "node:crypto";

import {
  hashFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "../../../../packages/logic/src/financial-actions";
import {
  METAL_ACTION_KINDS,
  METAL_FINANCIAL_ACTION_REGISTRY,
  assertCanonicalMetalRevision,
  createMetalFinancialActionEnvelope,
  type CreateMetalFinancialActionEnvelopeInput,
} from "../../services/metal-financial-action-adapter";

const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
const HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000004";
const sha256Provider: Sha256Provider = {
  digestUtf8: (value: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(value).digest("hex")),
};

function actionInput(
  kind: (typeof METAL_ACTION_KINDS)[number]
): CreateMetalFinancialActionEnvelopeInput {
  return {
    actionId: "018f0c7a-1234-7abc-8def-000000000001",
    userId: USER_ID,
    holdingId: HOLDING_ID,
    kind,
    expectedHoldingRevision: kind === "add" ? null : "0",
    occurredAt: "2026-08-31T10:15:30.123Z",
    domainPayload: {},
  };
}

describe("Metals financial action approval gate", () => {
  it.each(METAL_ACTION_KINDS)(
    "rejects %s until its exact hash-bound payload schema is approved",
    (kind) => {
      expect(() => createMetalFinancialActionEnvelope(actionInput(kind))).toThrow(
        "metal_action_schema_not_approved"
      );
    }
  );

  it("keeps the production Metals registry empty", () => {
    expect(METAL_FINANCIAL_ACTION_REGISTRY.definitions).toEqual([]);
  });

  it("rejects invalid revision shapes before the schema approval gate", () => {
    for (const revision of ["", "00", "01", "-1", "1.0", "9223372036854775808"]) {
      expect(() =>
        createMetalFinancialActionEnvelope({
          ...actionInput("correct"),
          expectedHoldingRevision: revision,
        })
      ).toThrow("invalid_metal_revision");
    }
    expect(() =>
      createMetalFinancialActionEnvelope({
        ...actionInput("add"),
        expectedHoldingRevision: "0",
      })
    ).toThrow("invalid_metal_expected_revision");
    expect(() =>
      createMetalFinancialActionEnvelope({
        ...actionInput("correct"),
        expectedHoldingRevision: null,
      })
    ).toThrow("invalid_metal_expected_revision");
  });

  it("accepts the full canonical revision range at the representation boundary", () => {
    expect(assertCanonicalMetalRevision("0")).toBe("0");
    expect(assertCanonicalMetalRevision("9223372036854775807")).toBe(
      "9223372036854775807"
    );
  });

  it("cannot bypass the approval gate with a hand-built envelope", async () => {
    const envelope: FinancialActionEnvelopeV1 = {
      accountGuards: [],
      actionId: "018f0c7a-1234-7abc-8def-000000000001",
      domain: "metals",
      domainReferenceId: HOLDING_ID,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "add",
      occurredAt: "2026-08-31T10:15:30.123Z",
      payload: {
        expectedHoldingRevision: null,
        holdingId: HOLDING_ID,
      },
      payloadVersion: "metals.add/v1",
      userId: USER_ID,
    };

    await expect(
      hashFinancialActionEnvelope(
        envelope,
        sha256Provider,
        METAL_FINANCIAL_ACTION_REGISTRY
      )
    ).rejects.toThrow("financial_action_unknown_definition");
  });
});
