import * as AmountHelpers from "../amount-helpers";
import { getNextRecurringOccurrenceAfter } from "../date-boundary";

// Focused regressions for the latest PR review findings.
describe("recurring review regressions", () => {
  it("rejects a valid decimal when JavaScript number conversion changes its meaning", () => {
    expect(
      AmountHelpers.parseStrictAmountInput("999999999.99999999", {
        maxAmount: AmountHelpers.MAX_TRANSACTION_AMOUNT,
        maxFractionDigits: 8,
      })
    ).toEqual({ success: false, reason: "invalid-format" });
  });

  it("formats persisted small amounts without scientific notation", () => {
    const candidate = Reflect.get(AmountHelpers, "formatStoredAmountInput");

    expect(typeof candidate).toBe("function");
    const formatStoredAmountInput = candidate as (amount: number) => string;
    expect(formatStoredAmountInput(1e-8)).toBe("0.00000001");
    expect(formatStoredAmountInput(250)).toBe("250");
    expect(formatStoredAmountInput(1234.5)).toBe("1234.5");
  });

  it("keeps CUSTOM recurring schedules compatible with the existing monthly fallback", () => {
    expect(
      getNextRecurringOccurrenceAfter({
        startDate: new Date(2026, 0, 15, 9, 0, 0),
        currentOccurrence: new Date(2026, 1, 15, 9, 0, 0),
        frequency: "CUSTOM",
      })
    ).toEqual(new Date(2026, 2, 15, 9, 0, 0));
  });
});
