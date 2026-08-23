/**
 * Unit Tests: Budget Spending Utilities
 *
 * Tests for calculateSpentPercentage, calculateRemaining,
 * calculateDailyAverage, getProgressStatus, computeSpendingMetrics.
 */

import {
  calculateSpentPercentage,
  calculateRemaining,
  calculateDailyAverage,
  getProgressStatus,
  computeSpendingMetrics,
  hasMatchingBudgetCurrency,
} from "../budget-spending";

// =============================================================================
// calculateSpentPercentage
// =============================================================================

describe("calculateSpentPercentage", () => {
  it("calculates correct percentage", () => {
    expect(calculateSpentPercentage(50, 100)).toBe(50);
  });

  it("returns 0 when limit is 0", () => {
    expect(calculateSpentPercentage(50, 0)).toBe(0);
  });

  it("returns 0 when limit is negative", () => {
    expect(calculateSpentPercentage(50, -100)).toBe(0);
  });

  it("handles over-budget (> 100%)", () => {
    expect(calculateSpentPercentage(150, 100)).toBe(150);
  });

  it("returns 0 when spent is 0", () => {
    expect(calculateSpentPercentage(0, 100)).toBe(0);
  });

  it("handles fractional values", () => {
    expect(calculateSpentPercentage(33, 100)).toBe(33);
  });
});

describe("hasMatchingBudgetCurrency", () => {
  it("includes only transactions with the exact budget currency", () => {
    expect(hasMatchingBudgetCurrency("EGP", "EGP")).toBe(true);
    expect(hasMatchingBudgetCurrency("USD", "EGP")).toBe(false);
  });
});

// =============================================================================
// calculateRemaining
// =============================================================================

describe("calculateRemaining", () => {
  it("calculates remaining budget", () => {
    expect(calculateRemaining(30, 100)).toBe(70);
  });

  it("clamps to 0 when over-budget", () => {
    expect(calculateRemaining(150, 100)).toBe(0);
  });

  it("returns full amount when nothing spent", () => {
    expect(calculateRemaining(0, 100)).toBe(100);
  });

  it("returns 0 when exactly at limit", () => {
    expect(calculateRemaining(100, 100)).toBe(0);
  });
});

// =============================================================================
// calculateDailyAverage
// =============================================================================

describe("calculateDailyAverage", () => {
  it("calculates average over days", () => {
    expect(calculateDailyAverage(300, 10)).toBe(30);
  });

  it("uses minimum 1 day to avoid division by zero", () => {
    expect(calculateDailyAverage(100, 0)).toBe(100);
  });

  it("uses minimum 1 day for negative values", () => {
    expect(calculateDailyAverage(100, -5)).toBe(100);
  });

  it("handles fractional result", () => {
    expect(calculateDailyAverage(100, 3)).toBeCloseTo(33.333, 2);
  });
});

// =============================================================================
// getProgressStatus
// =============================================================================

describe("getProgressStatus", () => {
  it("returns 'safe' below warning threshold", () => {
    expect(getProgressStatus(50)).toBe("safe");
    expect(getProgressStatus(79.99)).toBe("safe");
  });

  it("returns 'warning' at default threshold (80%)", () => {
    expect(getProgressStatus(80)).toBe("warning");
    expect(getProgressStatus(99.99)).toBe("warning");
  });

  it("returns 'danger' at 100% or above", () => {
    expect(getProgressStatus(100)).toBe("danger");
    expect(getProgressStatus(150)).toBe("danger");
  });

  it("respects custom warning threshold", () => {
    expect(getProgressStatus(50, 40)).toBe("warning");
    expect(getProgressStatus(39, 40)).toBe("safe");
  });

  it("returns 'safe' at 0%", () => {
    expect(getProgressStatus(0)).toBe("safe");
  });
});

// =============================================================================
// computeSpendingMetrics
// =============================================================================

describe("computeSpendingMetrics", () => {
  it("computes all metrics correctly", () => {
    const metrics = computeSpendingMetrics(800, 1000, 10);
    expect(metrics.spent).toBe(800);
    expect(metrics.limit).toBe(1000);
    expect(metrics.remaining).toBe(200);
    expect(metrics.percentage).toBe(80);
    expect(metrics.dailyAverage).toBe(80);
    expect(metrics.status).toBe("warning");
  });

  it("handles over-budget scenario", () => {
    const metrics = computeSpendingMetrics(1200, 1000, 30);
    expect(metrics.remaining).toBe(0);
    expect(metrics.percentage).toBe(120);
    expect(metrics.status).toBe("danger");
  });

  it("handles zero spending", () => {
    const metrics = computeSpendingMetrics(0, 1000, 10);
    expect(metrics.remaining).toBe(1000);
    expect(metrics.percentage).toBe(0);
    expect(metrics.status).toBe("safe");
  });

  it("uses custom warning threshold", () => {
    const metrics = computeSpendingMetrics(500, 1000, 10, 40);
    expect(metrics.status).toBe("warning"); // 50% >= 40% threshold
  });

  it("handles zero limit gracefully", () => {
    const metrics = computeSpendingMetrics(100, 0, 10);
    expect(metrics.percentage).toBe(0);
    expect(metrics.status).toBe("safe");
  });
});
