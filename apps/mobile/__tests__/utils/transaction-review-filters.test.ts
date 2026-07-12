import { toggleTransactionTypeFilter } from "@/utils/transaction-review-filters";

describe("toggleTransactionTypeFilter", () => {
  it("keeps All mutually exclusive with specific transaction types", () => {
    const incomeOnly = toggleTransactionTypeFilter(["All"], "Income");
    expect(incomeOnly).toEqual(["Income"]);

    const incomeAndExpense = toggleTransactionTypeFilter(incomeOnly, "Expense");
    expect(incomeAndExpense).toEqual(["Income", "Expense"]);

    const expenseOnly = toggleTransactionTypeFilter(incomeAndExpense, "Income");
    expect(expenseOnly).toEqual(["Expense"]);

    expect(toggleTransactionTypeFilter(expenseOnly, "Expense")).toEqual([
      "All",
    ]);
  });
});
