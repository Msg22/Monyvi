import {
  calculateCalendarDaysUntil,
  isInCurrentLocalMonth,
  isOnOrBeforeDay,
} from "../date-boundary";

describe("isOnOrBeforeDay", () => {
  it("treats matching local calendar days as eligible despite different times", () => {
    expect(
      isOnOrBeforeDay(
        new Date(2026, 6, 1, 18, 0, 0),
        new Date(2026, 6, 1, 0, 0, 0)
      )
    ).toBe(true);
  });

  it("rejects a following local calendar day", () => {
    expect(
      isOnOrBeforeDay(
        new Date(2026, 6, 2, 0, 0, 0),
        new Date(2026, 6, 1, 23, 59, 59)
      )
    ).toBe(false);
  });
});

describe("calendar-day classification", () => {
  it("keeps a local due-today date out of overdue state", () => {
    expect(
      calculateCalendarDaysUntil(
        new Date(2026, 4, 11, 0, 0, 0),
        new Date(2026, 4, 11, 12, 0, 0)
      )
    ).toBe(0);
  });

  it("includes a first-of-month local due date in that month", () => {
    expect(
      isInCurrentLocalMonth(
        new Date(2026, 8, 1, 0, 0, 0),
        new Date(2026, 8, 15, 12, 0, 0)
      )
    ).toBe(true);
  });
});
