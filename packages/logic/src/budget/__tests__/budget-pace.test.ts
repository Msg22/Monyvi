import type { WeeklyBucket } from "../budget-period-utils";
import {
  calculateElapsedBudgetAllowance,
  calculateWeeklyBudgetPace,
  classifyBudgetPace,
} from "../budget-pace";

describe("calculateElapsedBudgetAllowance", () => {
  const periodStart = new Date(2026, 7, 1, 0, 0, 0, 0);
  const periodEnd = new Date(2026, 7, 31, 23, 59, 59, 999);

  it("allocates the limit by inclusive local days using injected now", () => {
    expect(
      calculateElapsedBudgetAllowance({
        limit: 3100,
        periodStart,
        periodEnd,
        now: new Date(2026, 7, 1, 12, 0, 0),
      })
    ).toBe(100);
    expect(
      calculateElapsedBudgetAllowance({
        limit: 3100,
        periodStart,
        periodEnd,
        now: new Date(2026, 7, 15, 12, 0, 0),
      })
    ).toBe(1500);
  });

  it("clamps allowance before and after the inclusive period", () => {
    expect(
      calculateElapsedBudgetAllowance({
        limit: 3100,
        periodStart,
        periodEnd,
        now: new Date(2026, 6, 31, 23, 59, 59),
      })
    ).toBe(0);
    expect(
      calculateElapsedBudgetAllowance({
        limit: 3100,
        periodStart,
        periodEnd,
        now: new Date(2026, 8, 1),
      })
    ).toBe(3100);
  });

  it("returns zero for a non-positive limit or invalid period", () => {
    expect(
      calculateElapsedBudgetAllowance({
        limit: 0,
        periodStart,
        periodEnd,
        now: new Date(2026, 7, 15),
      })
    ).toBe(0);
    expect(
      calculateElapsedBudgetAllowance({
        limit: -100,
        periodStart,
        periodEnd,
        now: new Date(2026, 7, 15),
      })
    ).toBe(0);
    expect(
      calculateElapsedBudgetAllowance({
        limit: 100,
        periodStart: periodEnd,
        periodEnd: periodStart,
        now: new Date(2026, 7, 15),
      })
    ).toBe(0);
  });
});

describe("classifyBudgetPace", () => {
  const baseInput = {
    limit: 1000,
    periodStart: new Date(2026, 7, 1),
    periodEnd: new Date(2026, 7, 10, 23, 59, 59, 999),
    now: new Date(2026, 7, 5, 12, 0, 0),
    currencyFractionDigits: 2,
  } as const;

  it("treats values equal at displayed currency precision as on pace", () => {
    expect(classifyBudgetPace({ ...baseInput, spent: 500.004 })).toBe("ON");
  });

  it("classifies rounded displayed values below and above allowance", () => {
    expect(classifyBudgetPace({ ...baseInput, spent: 499.994 })).toBe("BELOW");
    expect(classifyBudgetPace({ ...baseInput, spent: 500.006 })).toBe("ABOVE");
  });

  it("uses Intl display rounding for half values", () => {
    expect(
      classifyBudgetPace({
        limit: 10.95,
        periodStart: new Date(2026, 7, 1),
        periodEnd: new Date(2026, 7, 2, 23, 59, 59, 999),
        now: new Date(2026, 7, 1, 12, 0, 0),
        spent: 5.475,
        currencyFractionDigits: 2,
      })
    ).toBe("ON");
  });

  it("stays finite for zero-limit inputs", () => {
    expect(classifyBudgetPace({ ...baseInput, limit: 0, spent: 0 })).toBe("ON");
    expect(classifyBudgetPace({ ...baseInput, limit: 0, spent: 1 })).toBe(
      "ABOVE"
    );
  });
});

describe("calculateWeeklyBudgetPace", () => {
  it("prorates partial first and final buckets by inclusive period days", () => {
    const buckets: readonly WeeklyBucket[] = [
      {
        label: "Week 1",
        weekStart: new Date(2026, 7, 1),
        weekEnd: new Date(2026, 7, 7, 23, 59, 59, 999),
      },
      {
        label: "Week 2",
        weekStart: new Date(2026, 7, 8),
        weekEnd: new Date(2026, 7, 14, 23, 59, 59, 999),
      },
    ];
    const periodStart = new Date(2026, 7, 3);
    const periodEnd = new Date(2026, 7, 13, 23, 59, 59, 999);

    const result = calculateWeeklyBudgetPace({
      limit: 1100,
      periodStart,
      periodEnd,
      buckets,
    });

    expect(result).toEqual([
      {
        start: new Date(2026, 7, 3),
        end: new Date(2026, 7, 7, 23, 59, 59, 999),
        allowance: 500,
      },
      {
        start: new Date(2026, 7, 8),
        end: new Date(2026, 7, 13, 23, 59, 59, 999),
        allowance: 600,
      },
    ]);
    expect(periodStart).toEqual(new Date(2026, 7, 3));
    expect(periodEnd).toEqual(new Date(2026, 7, 13, 23, 59, 59, 999));
  });

  it("returns zero finite allowances for an invalid limit or period", () => {
    const buckets: readonly WeeklyBucket[] = [
      {
        label: "Week 1",
        weekStart: new Date(2026, 7, 1),
        weekEnd: new Date(2026, 7, 7, 23, 59, 59, 999),
      },
    ];

    const zeroLimit = calculateWeeklyBudgetPace({
      limit: 0,
      periodStart: new Date(2026, 7, 1),
      periodEnd: new Date(2026, 7, 7, 23, 59, 59, 999),
      buckets,
    });
    const invalidPeriod = calculateWeeklyBudgetPace({
      limit: 700,
      periodStart: new Date(2026, 7, 8),
      periodEnd: new Date(2026, 7, 7),
      buckets,
    });

    expect(zeroLimit[0]?.allowance).toBe(0);
    expect(Number.isFinite(zeroLimit[0]?.allowance)).toBe(true);
    expect(invalidPeriod[0]?.allowance).toBe(0);
    expect(Number.isFinite(invalidPeriod[0]?.allowance)).toBe(true);
  });
});
