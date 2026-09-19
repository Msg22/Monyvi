import type { CreateMetalFinancialActionEnvelopeInput } from "../../services/metal-financial-action-adapter";

function assertCalendarBoundaryIsRequired(
  input: Omit<CreateMetalFinancialActionEnvelopeInput, "validationInput">
): void {
  // @ts-expect-error Metal commands must explicitly provide their trusted calendar boundary.
  const missingInput: CreateMetalFinancialActionEnvelopeInput = input;
  const missingDate: CreateMetalFinancialActionEnvelopeInput = {
    ...input,
    // @ts-expect-error An empty validation object must not satisfy the command contract.
    validationInput: {},
  };
  void missingInput;
  void missingDate;
}

describe("metal action calendar input contract", () => {
  it("accepts a caller-supplied calendar boundary", () => {
    const input: CreateMetalFinancialActionEnvelopeInput = {
      actionId: "action",
      userId: "user",
      holdingId: "holding",
      kind: "add",
      expectedHoldingRevision: null,
      occurredAt: "2026-09-01T00:00:00.000Z",
      domainPayload: {},
      validationInput: { latestAllowedCalendarDate: "2026-09-01" },
    };
    expect(input.validationInput?.latestAllowedCalendarDate).toBe("2026-09-01");
    expect(assertCalendarBoundaryIsRequired).toBeDefined();
  });
});
