import * as DateBoundary from "../date-boundary";
import {
  calculateCalendarDaysUntil,
  getRecurringPaymentReactivationDueDate,
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

describe("getRecurringPaymentReactivationDueDate", () => {
  it("advances a final paid occurrence and preserves an already outstanding one", () => {
    expect(
      getRecurringPaymentReactivationDueDate({
        nextDueDate: new Date(2026, 6, 1),
        frequency: "MONTHLY",
        endDate: new Date(2026, 6, 1),
      })
    ).toEqual(new Date(2026, 7, 1));
    expect(
      getRecurringPaymentReactivationDueDate({
        nextDueDate: new Date(2026, 7, 1),
        frequency: "MONTHLY",
        endDate: new Date(2026, 6, 1),
      })
    ).toEqual(new Date(2026, 7, 1));
  });
});

type IsRecurringStartDateAllowed = (options: {
  readonly startDate: Date;
  readonly referenceDate?: Date;
  readonly originalStartDate?: Date | null;
}) => boolean;

type GetRecurringStartDateMaximum = (referenceDate?: Date) => Date;

function getRecurringStartDateContract(): {
  readonly isAllowed: IsRecurringStartDateAllowed;
  readonly getMaximum: GetRecurringStartDateMaximum;
} {
  const isAllowedCandidate = Reflect.get(
    DateBoundary,
    "isRecurringStartDateAllowed"
  );
  const getMaximumCandidate = Reflect.get(
    DateBoundary,
    "getRecurringStartDateMaximum"
  );

  expect(typeof isAllowedCandidate).toBe("function");
  expect(typeof getMaximumCandidate).toBe("function");

  return {
    isAllowed: isAllowedCandidate as IsRecurringStartDateAllowed,
    getMaximum: getMaximumCandidate as GetRecurringStartDateMaximum,
  };
}

describe("recurring start-date boundary", () => {
  it("uses an inclusive local-calendar range from today through one year ahead", () => {
    const { isAllowed, getMaximum } = getRecurringStartDateContract();
    const referenceDate = new Date(2026, 8, 4, 15, 30, 0);

    expect(getMaximum(referenceDate)).toEqual(
      new Date(2027, 8, 4, 15, 30, 0)
    );
    expect(
      isAllowed({
        startDate: new Date(2026, 8, 4, 0, 0, 0),
        referenceDate,
      })
    ).toBe(true);
    expect(
      isAllowed({
        startDate: new Date(2027, 8, 4, 23, 59, 59),
        referenceDate,
      })
    ).toBe(true);
    expect(
      isAllowed({
        startDate: new Date(2026, 8, 3, 23, 59, 59),
        referenceDate,
      })
    ).toBe(false);
    expect(
      isAllowed({
        startDate: new Date(2027, 8, 5, 0, 0, 0),
        referenceDate,
      })
    ).toBe(false);
  });

  it("clamps a leap-day reference to the last valid day one year later", () => {
    const { isAllowed, getMaximum } = getRecurringStartDateContract();
    const referenceDate = new Date(2028, 1, 29, 10, 15, 0);

    expect(getMaximum(referenceDate)).toEqual(
      new Date(2029, 1, 28, 10, 15, 0)
    );
    expect(
      isAllowed({
        startDate: new Date(2029, 1, 28, 23, 59, 59),
        referenceDate,
      })
    ).toBe(true);
    expect(
      isAllowed({
        startDate: new Date(2029, 2, 1, 0, 0, 0),
        referenceDate,
      })
    ).toBe(false);
  });

  it("allows an unchanged legacy local date but not a different invalid edit date", () => {
    const { isAllowed } = getRecurringStartDateContract();
    const referenceDate = new Date(2026, 8, 4, 12, 0, 0);
    const originalPastDate = new Date(2025, 3, 10, 9, 0, 0);
    const originalFutureDate = new Date(2028, 3, 10, 9, 0, 0);

    expect(
      isAllowed({
        startDate: new Date(2025, 3, 10, 21, 0, 0),
        originalStartDate: originalPastDate,
        referenceDate,
      })
    ).toBe(true);
    expect(
      isAllowed({
        startDate: new Date(2025, 3, 11, 9, 0, 0),
        originalStartDate: originalPastDate,
        referenceDate,
      })
    ).toBe(false);
    expect(
      isAllowed({
        startDate: new Date(2028, 3, 10, 21, 0, 0),
        originalStartDate: originalFutureDate,
        referenceDate,
      })
    ).toBe(true);
    expect(
      isAllowed({
        startDate: new Date(2028, 3, 11, 9, 0, 0),
        originalStartDate: originalFutureDate,
        referenceDate,
      })
    ).toBe(false);
  });

  it("rejects invalid JavaScript dates", () => {
    const { isAllowed } = getRecurringStartDateContract();

    expect(
      isAllowed({
        startDate: new Date(Number.NaN),
        referenceDate: new Date(2026, 8, 4),
      })
    ).toBe(false);
    expect(
      isAllowed({
        startDate: new Date(2026, 8, 4),
        referenceDate: new Date(Number.NaN),
      })
    ).toBe(false);
  });
});
