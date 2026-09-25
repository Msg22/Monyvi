import { APPROVED_FINANCIAL_ACTION_REGISTRY } from "../../services/financial-action-approved-registry";

describe("approved financial actions for the Add/Edit slice", () => {
  it("registers Add and Correct without opening later Metals actions", (): void => {
    expect(
      APPROVED_FINANCIAL_ACTION_REGISTRY.definitions.map(
        (definition) => `${definition.domain}.${definition.kind}`
      )
    ).toEqual(["metals.add", "metals.correct"]);
    expect(() =>
      APPROVED_FINANCIAL_ACTION_REGISTRY.resolve(
        "metals",
        "sell",
        "metals.sell/v2"
      )
    ).toThrow("financial_action_unknown_definition");
  });
});
