import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("budget Maestro journeys", () => {
  function readBudgetFlow(name: string): string {
    return readFileSync(
      resolve(__dirname, `../../e2e/maestro/budgets/${name}.yaml`),
      "utf8"
    );
  }

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
    expect(filteringFlow).toContain('id: "budget-scope-all"');
    expect(filteringFlow).toContain('id: "budget-filter-option-period-all"');
    expect(filteringFlow).not.toContain('- tapOn: "Reset filters"');
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

  it("covers the active detail read model and opens a recent transaction for editing", () => {
    const flow = readBudgetFlow("budget-detail-active");
    const normalizedFlow = flow.replace(/\s+/g, " ");
    const detailTarget = flow.indexOf('id: ".*budget-detail-target-.*"');
    const detailScreen = flow.indexOf('id: "budget-detail-screen"');
    const identity = flow.indexOf('id: "budget-detail-identity"');
    const overview = flow.indexOf('id: "budget-detail-overview"');
    const editAction = flow.indexOf('id: "budget-detail-edit"');
    const editBudgetScreen = flow.indexOf(
      'id: "create-budget-screen"',
      editAction
    );
    const returnedDetail = flow.indexOf(
      'id: "budget-detail-screen"',
      editBudgetScreen
    );
    const trend = flow.indexOf('id: "budget-spending-trend-chart"');
    const breakdown = flow.indexOf('id: "subcategory-breakdown"');
    const recent = flow.indexOf('id: "budget-recent-transactions"');
    const transactionRow = flow.indexOf('id: ".*recent-transaction-.*"');
    const editScreen = flow.indexOf('id: "edit-transaction-screen"');
    const editAmount = flow.indexOf('id: "calculator-key-7"', editScreen);
    const saveTransaction = flow.indexOf('id: "header-save"', editAmount);
    const refreshedDetail = flow.indexOf(
      'id: "budget-detail-screen"',
      saveTransaction
    );
    const refreshedAmount = flow.indexOf(
      'visible: "777 EGP"',
      refreshedDetail
    );

    expect(detailTarget).toBeGreaterThanOrEqual(0);
    expect(detailScreen).toBeGreaterThan(detailTarget);
    expect(identity).toBeGreaterThan(detailScreen);
    expect(overview).toBeGreaterThan(identity);
    expect(editAction).toBeGreaterThan(overview);
    expect(editBudgetScreen).toBeGreaterThan(editAction);
    expect(returnedDetail).toBeGreaterThan(editBudgetScreen);
    expect(trend).toBeGreaterThan(returnedDetail);
    expect(breakdown).toBeGreaterThan(trend);
    expect(recent).toBeGreaterThan(breakdown);
    expect(transactionRow).toBeGreaterThan(recent);
    expect(editScreen).toBeGreaterThan(transactionRow);
    expect(editAmount).toBeGreaterThan(editScreen);
    expect(saveTransaction).toBeGreaterThan(editAmount);
    expect(refreshedDetail).toBeGreaterThan(saveTransaction);
    expect(refreshedAmount).toBeGreaterThan(refreshedDetail);
    expect(normalizedFlow).toContain(
      'assertVisible: "Transactions during completed pause periods are excluded from these totals."'
    );
    expect(flow).not.toContain("View all");
  });

  it("covers pause, resume, expired, and empty Budget Detail states", () => {
    const flow = readBudgetFlow("budget-detail-lifecycle");
    const pauseAction = flow.indexOf('id: "budget-detail-lifecycle-action"');
    const pauseConfirmation = flow.indexOf('- assertVisible: "Pause budget?"');
    const pauseCancel = flow.indexOf('id: "modal-cancel"', pauseConfirmation);
    const secondPauseConfirmation = flow.indexOf(
      '- assertVisible: "Pause budget?"',
      pauseCancel
    );
    const pauseConfirm = flow.indexOf(
      'id: "modal-confirm"',
      secondPauseConfirmation
    );
    const observedResume = flow.indexOf('visible: "Resume"', pauseConfirm);
    const resumeConfirmation = flow.indexOf(
      '- assertVisible: "Resume budget?"',
      observedResume
    );
    const resumeCancel = flow.indexOf('id: "modal-cancel"', resumeConfirmation);
    const secondResumeConfirmation = flow.indexOf(
      '- assertVisible: "Resume budget?"',
      resumeCancel
    );
    const resumeConfirm = flow.indexOf(
      'id: "modal-confirm"',
      secondResumeConfirmation
    );
    const observedPause = flow.indexOf('visible: "Pause"', resumeConfirm);

    expect(pauseAction).toBeGreaterThanOrEqual(0);
    expect(pauseConfirmation).toBeGreaterThan(pauseAction);
    expect(pauseCancel).toBeGreaterThan(pauseConfirmation);
    expect(secondPauseConfirmation).toBeGreaterThan(pauseCancel);
    expect(pauseConfirm).toBeGreaterThan(secondPauseConfirmation);
    expect(observedResume).toBeGreaterThan(pauseConfirm);
    expect(resumeConfirmation).toBeGreaterThan(observedResume);
    expect(resumeCancel).toBeGreaterThan(resumeConfirmation);
    expect(secondResumeConfirmation).toBeGreaterThan(resumeCancel);
    expect(resumeConfirm).toBeGreaterThan(secondResumeConfirmation);
    expect(observedPause).toBeGreaterThan(resumeConfirm);
    expect(flow).toContain('- assertVisible: "Expired"');
    expect(flow).toContain('id: "subcategory-breakdown-empty"');
    expect(flow).toContain('id: "recent-transactions-empty"');
  });

  it("deletes only the disposable budget and proves its transaction remains", () => {
    const flow = readBudgetFlow("budget-detail-delete");
    const deleteAction = flow.indexOf('id: "budget-detail-delete"');
    const confirmation = flow.indexOf('- assertVisible: "Delete budget?"');
    const cancelAction = flow.indexOf('id: "modal-cancel"', confirmation);
    const detailAfterCancel = flow.indexOf(
      'id: "budget-detail-screen"',
      cancelAction
    );
    const secondDeleteAction = flow.indexOf(
      'id: "budget-detail-delete"',
      detailAfterCancel
    );
    const secondConfirmation = flow.indexOf(
      '- assertVisible: "Delete budget?"',
      secondDeleteAction
    );
    const confirmAction = flow.indexOf(
      'id: "modal-confirm"',
      secondConfirmation
    );
    const dashboardAfterDelete = flow.indexOf(
      'id: "budgets-screen"',
      confirmAction
    );
    const budgetGone = flow.indexOf(
      '- assertNotVisible: "E2E Disposable Detail Budget"',
      dashboardAfterDelete
    );
    const transactionRemains = flow.indexOf(
      '- assertVisible: "E2E Retained After Budget Delete"',
      budgetGone
    );

    expect(deleteAction).toBeGreaterThanOrEqual(0);
    expect(confirmation).toBeGreaterThan(deleteAction);
    expect(cancelAction).toBeGreaterThan(confirmation);
    expect(detailAfterCancel).toBeGreaterThan(cancelAction);
    expect(secondDeleteAction).toBeGreaterThan(detailAfterCancel);
    expect(secondConfirmation).toBeGreaterThan(secondDeleteAction);
    expect(confirmAction).toBeGreaterThan(secondConfirmation);
    expect(dashboardAfterDelete).toBeGreaterThan(confirmAction);
    expect(budgetGone).toBeGreaterThan(dashboardAfterDelete);
    expect(transactionRemains).toBeGreaterThan(budgetGone);
  });
});
