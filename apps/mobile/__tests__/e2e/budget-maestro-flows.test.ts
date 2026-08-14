import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("budget Maestro journeys", () => {
  it("uses the full fixture for positive filtering and a separate empty-filter journey", () => {
    const filteringFlow = readFileSync(
      resolve(__dirname, "../../e2e/maestro/budgets/dashboard-filtering.yaml"),
      "utf8"
    );
    const emptyFlow = readFileSync(
      resolve(
        __dirname,
        "../../e2e/maestro/budgets/dashboard-filtered-empty.yaml"
      ),
      "utf8"
    );

    expect(filteringFlow).toContain('visible: "E2E Custom Overall"');
    expect(filteringFlow).not.toContain("No budgets match this filter");
    expect(emptyFlow).toContain('id: "budget-filter-option-period-custom"');
    expect(emptyFlow).toContain('visible: "No budgets match this filter"');
  });

  it("scrolls to Resume and waits for visible reclassification", () => {
    const flow = readFileSync(
      resolve(
        __dirname,
        "../../e2e/maestro/budgets/dashboard-lifecycle-actions.yaml"
      ),
      "utf8"
    );
    const firstPausedReference = flow.indexOf('"E2E Paused Shopping"');
    const firstScroll = flow.indexOf("scrollUntilVisible:");
    const confirmation = flow.indexOf('id: "modal-confirm"');
    const pausedGone = flow.indexOf(
      'id: ".*budget-action-resume-.*"',
      confirmation + 1
    );

    expect(firstScroll).toBeGreaterThanOrEqual(0);
    expect(firstScroll).toBeLessThan(firstPausedReference);
    expect(pausedGone).toBeGreaterThan(confirmation);
  });

  it("verifies the Renew form is prefilled from the expired budget", () => {
    const flow = readFileSync(
      resolve(
        __dirname,
        "../../e2e/maestro/budgets/dashboard-lifecycle-actions.yaml"
      ),
      "utf8"
    );
    const createScreen = flow.indexOf('id: "create-budget-screen"');
    const prefilledName = flow.indexOf(
      '- assertVisible: "E2E Expired Custom"',
      createScreen
    );

    expect(createScreen).toBeGreaterThanOrEqual(0);
    expect(prefilledName).toBeGreaterThan(createScreen);
  });
});
