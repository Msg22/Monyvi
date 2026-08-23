/**
 * Unit Tests: Budget Period Utilities
 *
 * Tests for getCurrentPeriodBounds, getDaysLeft, getDaysElapsed,
 * isWithinPeriod, isPeriodExpired, getWeeklyBuckets.
 */

import {
  getCurrentPeriodBounds,
  getDaysLeft,
  getDaysElapsed,
  isWithinPeriod,
  isPeriodExpired,
  getWeeklyBuckets,
  getElapsedCalendarDays,
  getInclusiveCalendarDayCount,
} from "../budget-period-utils";

// =============================================================================
// getCurrentPeriodBounds
// =============================================================================

describe("getCurrentPeriodBounds", () => {
  describe("WEEKLY", () => {
    it("returns Sunday–Saturday bounds for a Wednesday", () => {
      // 2026-03-18 is a Wednesday
      const ref = new Date(2026, 2, 18, 12, 0, 0); // March 18, 2026
      const bounds = getCurrentPeriodBounds("WEEKLY", null, null, ref);

      // Sunday March 15
      expect(bounds.start.getDay()).toBe(0); // Sunday
      expect(bounds.start.getDate()).toBe(15);
      expect(bounds.start.getHours()).toBe(0);

      // Saturday March 21
      expect(bounds.end.getDay()).toBe(6); // Saturday
      expect(bounds.end.getDate()).toBe(21);
      expect(bounds.end.getHours()).toBe(23);
      expect(bounds.end.getMinutes()).toBe(59);
    });

    it("handles Sunday reference (start of week)", () => {
      const ref = new Date(2026, 2, 15, 12, 0, 0); // Sunday March 15
      const bounds = getCurrentPeriodBounds("WEEKLY", null, null, ref);
      expect(bounds.start.getDate()).toBe(15);
      expect(bounds.end.getDate()).toBe(21);
    });

    it("handles Saturday reference (end of week)", () => {
      const ref = new Date(2026, 2, 21, 12, 0, 0); // Saturday March 21
      const bounds = getCurrentPeriodBounds("WEEKLY", null, null, ref);
      expect(bounds.start.getDate()).toBe(15);
      expect(bounds.end.getDate()).toBe(21);
    });
  });

  describe("MONTHLY", () => {
    it("returns first to last day of month", () => {
      const ref = new Date(2026, 2, 15); // March 15, 2026
      const bounds = getCurrentPeriodBounds("MONTHLY", null, null, ref);

      expect(bounds.start.getDate()).toBe(1);
      expect(bounds.start.getMonth()).toBe(2); // March

      expect(bounds.end.getDate()).toBe(31); // March has 31 days
      expect(bounds.end.getHours()).toBe(23);
    });

    it("handles February (28 days, non-leap)", () => {
      const ref = new Date(2027, 1, 10); // Feb 10, 2027
      const bounds = getCurrentPeriodBounds("MONTHLY", null, null, ref);
      expect(bounds.end.getDate()).toBe(28);
    });

    it("handles February (29 days, leap year)", () => {
      const ref = new Date(2028, 1, 10); // Feb 10, 2028 (leap year)
      const bounds = getCurrentPeriodBounds("MONTHLY", null, null, ref);
      expect(bounds.end.getDate()).toBe(29);
    });
  });

  describe("CUSTOM", () => {
    it("uses explicit start and end dates", () => {
      const start = new Date(2026, 2, 1);
      const end = new Date(2026, 5, 30);
      const bounds = getCurrentPeriodBounds("CUSTOM", start, end);

      expect(bounds.start.getDate()).toBe(1);
      expect(bounds.start.getMonth()).toBe(2);
      expect(bounds.start.getHours()).toBe(0);

      expect(bounds.end.getDate()).toBe(30);
      expect(bounds.end.getMonth()).toBe(5);
      expect(bounds.end.getHours()).toBe(23);
    });

    it("throws if periodStart is missing", () => {
      expect(() => getCurrentPeriodBounds("CUSTOM", null, new Date())).toThrow(
        "Custom period requires both periodStart and periodEnd"
      );
    });

    it("throws if periodEnd is missing", () => {
      expect(() => getCurrentPeriodBounds("CUSTOM", new Date(), null)).toThrow(
        "Custom period requires both periodStart and periodEnd"
      );
    });
  });
});

// =============================================================================
// getDaysLeft
// =============================================================================

describe("getDaysLeft", () => {
  it("returns positive days when period has not ended", () => {
    const now = new Date(2026, 2, 15, 12, 0, 0);
    const end = new Date(2026, 2, 20, 23, 59, 59, 999);
    expect(getDaysLeft(end, now)).toBeGreaterThan(0);
  });

  it("returns 0 when period has ended", () => {
    const now = new Date(2026, 2, 21, 12, 0, 0);
    const end = new Date(2026, 2, 20, 23, 59, 59, 999);
    expect(getDaysLeft(end, now)).toBe(0);
  });

  it("returns 0 when exactly at period end", () => {
    const end = new Date(2026, 2, 20, 23, 59, 59, 999);
    const now = new Date(end.getTime() + 1);
    expect(getDaysLeft(end, now)).toBe(0);
  });
});

// =============================================================================
// getDaysElapsed
// =============================================================================

describe("getDaysElapsed", () => {
  it("returns at least 1", () => {
    const start = new Date(2026, 2, 15, 0, 0, 0);
    const now = new Date(2026, 2, 15, 0, 0, 1);
    expect(getDaysElapsed(start, now)).toBeGreaterThanOrEqual(1);
  });

  it("returns 1 when reference is before start", () => {
    const start = new Date(2026, 2, 15);
    const now = new Date(2026, 2, 14);
    expect(getDaysElapsed(start, now)).toBe(1);
  });

  it("counts days correctly over multiple days", () => {
    const start = new Date(2026, 2, 1, 0, 0, 0);
    const now = new Date(2026, 2, 11, 0, 0, 0);
    expect(getDaysElapsed(start, now)).toBe(10);
  });
});

// =============================================================================
// Inclusive calendar-day calculations
// =============================================================================

describe("getInclusiveCalendarDayCount", () => {
  it("counts both period boundary days", () => {
    expect(
      getInclusiveCalendarDayCount(
        new Date(2026, 7, 3, 18, 30),
        new Date(2026, 7, 13, 7, 15)
      )
    ).toBe(11);
  });

  it("counts local calendar days across a daylight-saving transition", () => {
    expect(
      getInclusiveCalendarDayCount(
        new Date(2026, 2, 27, 23, 30),
        new Date(2026, 2, 29, 1, 30)
      )
    ).toBe(3);
  });

  it("returns zero for reversed or invalid boundaries", () => {
    expect(
      getInclusiveCalendarDayCount(
        new Date(2026, 7, 14),
        new Date(2026, 7, 13)
      )
    ).toBe(0);
    expect(
      getInclusiveCalendarDayCount(new Date(Number.NaN), new Date(2026, 7, 13))
    ).toBe(0);
  });
});

describe("getElapsedCalendarDays", () => {
  const start = new Date(2026, 7, 3, 0, 0, 0, 0);
  const end = new Date(2026, 7, 13, 23, 59, 59, 999);

  it("uses the injected reference time and includes the current local day", () => {
    expect(
      getElapsedCalendarDays(start, end, new Date(2026, 7, 3, 0, 0, 1))
    ).toBe(1);
    expect(
      getElapsedCalendarDays(start, end, new Date(2026, 7, 7, 12, 0, 0))
    ).toBe(5);
  });

  it("clamps before the period to zero and after it to the total day count", () => {
    expect(
      getElapsedCalendarDays(start, end, new Date(2026, 7, 2, 23, 59, 59))
    ).toBe(0);
    expect(
      getElapsedCalendarDays(start, end, new Date(2026, 7, 14, 0, 0, 0))
    ).toBe(11);
  });

  it("returns zero for an invalid period without mutating its dates", () => {
    const reversedStart = new Date(2026, 7, 14, 8, 0, 0);
    const reversedEnd = new Date(2026, 7, 13, 8, 0, 0);
    const startTime = reversedStart.getTime();
    const endTime = reversedEnd.getTime();

    expect(
      getElapsedCalendarDays(
        reversedStart,
        reversedEnd,
        new Date(2026, 7, 13)
      )
    ).toBe(0);
    expect(reversedStart.getTime()).toBe(startTime);
    expect(reversedEnd.getTime()).toBe(endTime);
  });
});

// =============================================================================
// isWithinPeriod
// =============================================================================

describe("isWithinPeriod", () => {
  const bounds = {
    start: new Date(2026, 2, 1, 0, 0, 0, 0),
    end: new Date(2026, 2, 31, 23, 59, 59, 999),
  };

  it("returns true for date inside bounds", () => {
    expect(isWithinPeriod(new Date(2026, 2, 15), bounds)).toBe(true);
  });

  it("returns true for date at start boundary", () => {
    expect(isWithinPeriod(bounds.start, bounds)).toBe(true);
  });

  it("returns true for date at end boundary", () => {
    expect(isWithinPeriod(bounds.end, bounds)).toBe(true);
  });

  it("returns false for date before bounds", () => {
    expect(isWithinPeriod(new Date(2026, 1, 28), bounds)).toBe(false);
  });

  it("returns false for date after bounds", () => {
    expect(isWithinPeriod(new Date(2026, 3, 1), bounds)).toBe(false);
  });
});

// =============================================================================
// isPeriodExpired
// =============================================================================

describe("isPeriodExpired", () => {
  it("returns true when period end has passed", () => {
    const end = new Date(2026, 2, 15);
    const now = new Date(2026, 2, 16, 1, 0, 0);
    expect(isPeriodExpired(end, now)).toBe(true);
  });

  it("returns false when still within last day", () => {
    const end = new Date(2026, 2, 15);
    const now = new Date(2026, 2, 15, 12, 0, 0);
    expect(isPeriodExpired(end, now)).toBe(false);
  });

  it("returns false when period end is in the future", () => {
    const end = new Date(2026, 2, 20);
    const now = new Date(2026, 2, 15);
    expect(isPeriodExpired(end, now)).toBe(false);
  });

  it("returns false for null periodEnd", () => {
    expect(isPeriodExpired(null)).toBe(false);
  });

  it("returns false for undefined periodEnd", () => {
    expect(isPeriodExpired(undefined)).toBe(false);
  });
});

// =============================================================================
// getWeeklyBuckets
// =============================================================================

describe("getWeeklyBuckets", () => {
  it("creates correct number of buckets for a 31-day month", () => {
    const bounds = {
      start: new Date(2026, 2, 1, 0, 0, 0, 0),
      end: new Date(2026, 2, 31, 23, 59, 59, 999),
    };
    const buckets = getWeeklyBuckets(bounds);

    // 31 days = 5 weeks (4 full + 1 partial)
    expect(buckets.length).toBe(5);
  });

  it("labels buckets sequentially", () => {
    const bounds = {
      start: new Date(2026, 2, 1, 0, 0, 0, 0),
      end: new Date(2026, 2, 14, 23, 59, 59, 999),
    };
    const buckets = getWeeklyBuckets(bounds);

    expect(buckets[0].label).toBe("Week 1");
    expect(buckets[1].label).toBe("Week 2");
  });

  it("clamps last bucket end to period end", () => {
    const bounds = {
      start: new Date(2026, 2, 1, 0, 0, 0, 0),
      end: new Date(2026, 2, 10, 23, 59, 59, 999),
    };
    const buckets = getWeeklyBuckets(bounds);
    const lastBucket = buckets[buckets.length - 1];

    expect(lastBucket.weekEnd.getTime()).toBeLessThanOrEqual(
      bounds.end.getTime()
    );
  });

  it("creates a single bucket for a 7-day period", () => {
    const bounds = {
      start: new Date(2026, 2, 1, 0, 0, 0, 0),
      end: new Date(2026, 2, 7, 23, 59, 59, 999),
    };
    const buckets = getWeeklyBuckets(bounds);
    expect(buckets.length).toBe(1);
    expect(buckets[0].label).toBe("Week 1");
  });
});
