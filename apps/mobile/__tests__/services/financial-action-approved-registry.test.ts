import { APPROVED_FINANCIAL_ACTION_REGISTRY } from "../../services/financial-action-approved-registry";

describe("approved financial actions for the Add/Edit slice", () => {
  it("registers Add and Correct at their approved payload versions", (): void => {
    expect(
      APPROVED_FINANCIAL_ACTION_REGISTRY.resolve(
        "metals",
        "add",
        "metals.add/v1"
      ).kind
    ).toBe("add");
    expect(
      APPROVED_FINANCIAL_ACTION_REGISTRY.resolve(
        "metals",
        "correct",
        "metals.correct/v1"
      ).kind
    ).toBe("correct");
    expect(
      APPROVED_FINANCIAL_ACTION_REGISTRY.resolve(
        "metals",
        "sell",
        "metals.sell/v2"
      ).kind
    ).toBe("sell");
    expect(() =>
      APPROVED_FINANCIAL_ACTION_REGISTRY.resolve(
        "metals",
        "correct",
        "metals.correct/v999"
      )
    ).toThrow("financial_action_unknown_definition");
  });
});
