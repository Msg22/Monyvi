import {
  buildBudgetRenewalFormValues,
  type BudgetRenewalSource,
} from "@/components/budget/budget-renewal-form-values";

describe("buildBudgetRenewalFormValues", () => {
  it("reuses budget fields while moving an expired custom duration forward", () => {
    const sourceStart = new Date("2026-06-01T00:00:00.000Z");
    const sourceEnd = new Date("2026-07-31T00:00:00.000Z");
    const now = new Date("2026-08-14T08:00:00.000Z");
    const source: BudgetRenewalSource = {
      name: "Ramadan Hosting",
      type: "GLOBAL",
      categoryId: undefined,
      amount: 15000,
      period: "CUSTOM",
      periodStart: sourceStart,
      periodEnd: sourceEnd,
      alertThreshold: 75,
    };

    const values = buildBudgetRenewalFormValues(source, now);

    expect(values).toEqual({
      name: "Ramadan Hosting",
      type: "GLOBAL",
      categoryId: null,
      amount: "15000",
      currency: null,
      period: "CUSTOM",
      periodStart: now,
      periodEnd: new Date("2026-10-13T08:00:00.000Z"),
      alertThreshold: 75,
    });
    expect(source.periodStart).toBe(sourceStart);
    expect(source.periodEnd).toBe(sourceEnd);
  });

  it("preserves the source currency for the replacement budget", () => {
    const values = buildBudgetRenewalFormValues({
      name: "USD travel",
      type: "GLOBAL",
      amount: 100,
      currency: "USD",
      period: "MONTHLY",
      alertThreshold: 80,
    });

    expect(values.currency).toBe("USD");
  });

  it("uses a one-day valid duration when persisted custom dates are malformed", () => {
    const now = new Date("2026-08-14T08:00:00.000Z");
    const source: BudgetRenewalSource = {
      name: "Malformed custom",
      type: "CATEGORY",
      categoryId: "food",
      amount: 5000,
      period: "CUSTOM",
      periodStart: undefined,
      periodEnd: undefined,
      alertThreshold: 80,
    };

    const values = buildBudgetRenewalFormValues(source, now);

    expect(values.periodStart).toEqual(now);
    expect(values.periodEnd).toEqual(new Date("2026-08-15T08:00:00.000Z"));
  });

  it("preserves custom calendar-day duration when elapsed hours cross a DST boundary", () => {
    const now = new Date("2026-08-14T08:00:00.000Z");
    const source: BudgetRenewalSource = {
      name: "DST custom",
      type: "GLOBAL",
      amount: 5000,
      period: "CUSTOM",
      periodStart: new Date("2026-03-01T08:00:00.000Z"),
      periodEnd: new Date("2026-03-03T07:00:00.000Z"),
      alertThreshold: 80,
    };

    const values = buildBudgetRenewalFormValues(source, now);

    expect(values.periodEnd).toEqual(new Date("2026-08-16T08:00:00.000Z"));
  });

  it("clears a renewal category that is no longer accessible", () => {
    const now = new Date("2026-08-14T08:00:00.000Z");
    const source: BudgetRenewalSource = {
      name: "Deleted category history",
      type: "CATEGORY",
      categoryId: "deleted-category",
      amount: 5000,
      period: "CUSTOM",
      periodStart: new Date("2026-06-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-01T00:00:00.000Z"),
      alertThreshold: 80,
    };

    const values = buildBudgetRenewalFormValues(
      source,
      now,
      new Set(["accessible-category"])
    );

    expect(values.categoryId).toBeNull();
  });
});
