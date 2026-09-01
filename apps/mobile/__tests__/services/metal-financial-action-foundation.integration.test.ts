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
} from "../../services/metal-financial-action-adapter";
import { APPROVED_FINANCIAL_ACTION_REGISTRY } from "../../services/financial-action-approved-registry";
import {
  createApprovedMetalsEnvelope,
  createMetalAdapterInput,
  METALS_VALIDATION_INPUT,
} from "./financial-action-metals-fixtures";

const sha256Provider: Sha256Provider = {
  digestUtf8: (value: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(value).digest("hex")),
};

describe("Metals financial action approval gate", () => {
  it.each(METAL_ACTION_KINDS)(
    "creates canonical %s envelope through approved registry",
    (kind) => {
      expect(
        createMetalFinancialActionEnvelope(createMetalAdapterInput(kind))
      ).toEqual(createApprovedMetalsEnvelope(kind));
    }
  );

  it("uses exact six-definition production Metals registry", () => {
    expect(METAL_FINANCIAL_ACTION_REGISTRY).toBe(
      APPROVED_FINANCIAL_ACTION_REGISTRY
    );
    expect(
      METAL_FINANCIAL_ACTION_REGISTRY.definitions.map((definition) => [
        definition.domain,
        definition.kind,
        definition.payloadVersion,
      ])
    ).toEqual([
      ["metals", "add", "metals.add/v1"],
      ["metals", "correct", "metals.correct/v1"],
      ["metals", "sell", "metals.sell/v2"],
      ["metals", "dispose", "metals.dispose/v1"],
      ["metals", "delete", "metals.delete/v1"],
      ["metals", "undo", "metals.undo/v1"],
    ]);
  });

  it("rejects invalid revision shapes before the schema approval gate", () => {
    for (const revision of [
      "",
      "00",
      "01",
      "-1",
      "1.0",
      "9223372036854775808",
    ]) {
      expect(() =>
        createMetalFinancialActionEnvelope({
          ...createMetalAdapterInput("correct"),
          expectedHoldingRevision: revision,
        })
      ).toThrow("invalid_metal_revision");
    }
    expect(() =>
      createMetalFinancialActionEnvelope({
        ...createMetalAdapterInput("add"),
        expectedHoldingRevision: "0",
      })
    ).toThrow("invalid_metal_expected_revision");
    expect(() =>
      createMetalFinancialActionEnvelope({
        ...createMetalAdapterInput("correct"),
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

  it("rejects unknown and legacy Metals versions", async () => {
    const envelope = createApprovedMetalsEnvelope("sell");

    await expect(
      hashFinancialActionEnvelope(
        { ...envelope, payloadVersion: "metals.sell/v1" },
        sha256Provider,
        METAL_FINANCIAL_ACTION_REGISTRY,
        METALS_VALIDATION_INPUT
      )
    ).rejects.toThrow("financial_action_unknown_definition");
    await expect(
      hashFinancialActionEnvelope(
        { ...envelope, kind: "unknown" },
        sha256Provider,
        METAL_FINANCIAL_ACTION_REGISTRY,
        METALS_VALIDATION_INPUT
      )
    ).rejects.toThrow("financial_action_unknown_definition");
  });
});
