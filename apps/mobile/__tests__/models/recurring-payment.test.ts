import { calculateCalendarDaysUntil } from "@monyvi/logic";

describe("RecurringPayment date helpers", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-10T23:30:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps a locally due-today payment out of overdue state", () => {
    jest.setSystemTime(new Date(2026, 4, 11, 12, 0, 0));

    expect(calculateCalendarDaysUntil(new Date(2026, 4, 11, 0, 0, 0))).toBe(0);
  });

  it("fails fast for invalid due dates", () => {
    expect(() => calculateCalendarDaysUntil(new Date("invalid"))).toThrow(
      "Invalid recurring payment due date"
    );
  });
});
