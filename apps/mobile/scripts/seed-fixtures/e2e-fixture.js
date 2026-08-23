const E2E_USER_FULL_NAME = "Monyvi E2E";

const E2E_SEED_FIXTURE = {
  seedScope: "e2e",
  userFullName: E2E_USER_FULL_NAME,
  authLabel: "E2E",
  includeLocalMarketRate: true,
  accountNames: {
    cash: "E2E Cash",
    bank: "E2E NBE Bank",
    qnbBank: "E2E QNB Bank",
    wallet: "E2E Wallet",
  },
  transactionCounterparties: {
    expense: "E2E Grocery",
    income: "E2E Payroll",
  },
  transactionNotes: {
    expense: "Seeded expense",
    income: "Seeded income",
  },
  transferNotes: {
    atm: "Seeded cash withdrawal",
  },
};

function createBudgetFixture(profile, buildExtraRows) {
  return {
    ...E2E_SEED_FIXTURE,
    seedScope: `e2e-${profile}`,
    buildExtraRows,
  };
}

function buildDashboardFullRows({
  categoryIds,
  currentTimestamp,
  dateFromToday,
  deterministicUuid,
  fixedNow,
  seedIds,
  seedScope,
  userId,
}) {
  const overBudgetCategoryId = deterministicUuid(
    seedScope,
    userId,
    "category:over-budget"
  );
  const zeroSpendCategoryId = deterministicUuid(
    seedScope,
    userId,
    "category:zero-spend"
  );
  const deletedCategoryId = deterministicUuid(
    seedScope,
    userId,
    "category:deleted-history"
  );
  const detailParentCategoryId = deterministicUuid(
    seedScope,
    userId,
    "category:detail-food"
  );
  const detailGroceriesCategoryId = deterministicUuid(
    seedScope,
    userId,
    "category:detail-groceries"
  );
  const detailDiningCategoryId = deterministicUuid(
    seedScope,
    userId,
    "category:detail-dining"
  );
  const detailFreshFoodCategoryId = deterministicUuid(
    seedScope,
    userId,
    "category:detail-fresh-food"
  );
  const detailPauseInterval = createCompletedPauseInterval(
    dateFromToday(-20),
    dateFromToday(-18)
  );

  return {
    categories: [
      createBudgetCategory({
        id: overBudgetCategoryId,
        name: "E2E Over Budget",
        currentTimestamp,
        fixedNow,
        userId,
      }),
      createBudgetCategory({
        id: zeroSpendCategoryId,
        name: "E2E Zero Spend",
        currentTimestamp,
        fixedNow,
        userId,
      }),
      createBudgetCategory({
        id: deletedCategoryId,
        name: "Deleted Category",
        deleted: true,
        currentTimestamp,
        fixedNow,
        userId,
      }),
      createBudgetCategory({
        id: detailParentCategoryId,
        name: "E2E Detail Food",
        currentTimestamp,
        fixedNow,
        userId,
      }),
      createBudgetCategory({
        id: detailGroceriesCategoryId,
        name: "E2E Detail Groceries",
        level: 2,
        parentId: detailParentCategoryId,
        currentTimestamp,
        fixedNow,
        userId,
      }),
      createBudgetCategory({
        id: detailDiningCategoryId,
        name: "E2E Detail Dining",
        level: 2,
        parentId: detailParentCategoryId,
        currentTimestamp,
        fixedNow,
        userId,
      }),
      createBudgetCategory({
        id: detailFreshFoodCategoryId,
        name: "E2E Detail Fresh Food",
        level: 3,
        parentId: detailGroceriesCategoryId,
        currentTimestamp,
        fixedNow,
        userId,
      }),
    ],
    budgets: [
      createGlobalBudget({
        id: deterministicUuid(seedScope, userId, "budget:weekly"),
        name: "E2E Weekly Overall",
        period: "WEEKLY",
        periodStart: dateFromToday(-2),
        periodEnd: dateFromToday(5),
        currentTimestamp,
        fixedNow,
        userId,
      }),
      createGlobalBudget({
        id: deterministicUuid(seedScope, userId, "budget:monthly"),
        name: "E2E Monthly Overall",
        period: "MONTHLY",
        periodStart: dateFromToday(-7),
        periodEnd: dateFromToday(23),
        currentTimestamp,
        fixedNow,
        userId,
      }),
      createGlobalBudget({
        id: deterministicUuid(seedScope, userId, "budget:custom"),
        name: "E2E Custom Overall",
        period: "CUSTOM",
        periodStart: dateFromToday(-14),
        periodEnd: dateFromToday(14),
        currentTimestamp,
        fixedNow,
        userId,
      }),
      createCategoryBudget({
        id: deterministicUuid(seedScope, userId, "budget:paused-shopping"),
        name: "E2E Paused Shopping",
        categoryId: categoryIds.shopping,
        periodStart: dateFromToday(-7),
        periodEnd: dateFromToday(23),
        currentTimestamp,
        fixedNow,
        userId,
      }),
      createCategoryBudget({
        id: deterministicUuid(seedScope, userId, "budget:expired-custom"),
        name: "E2E Expired Custom",
        categoryId: categoryIds.other,
        period: "CUSTOM",
        periodStart: dateFromToday(-30),
        periodEnd: dateFromToday(-1),
        currentTimestamp,
        fixedNow,
        userId,
      }),
      createCategoryBudget({
        id: deterministicUuid(seedScope, userId, "budget:healthy-shopping"),
        name: "E2E Healthy Shopping",
        categoryId: categoryIds.shopping,
        period: "WEEKLY",
        periodStart: dateFromToday(-2),
        periodEnd: dateFromToday(5),
        status: "ACTIVE",
        currentTimestamp,
        fixedNow,
        userId,
      }),
      createCategoryBudget({
        id: deterministicUuid(seedScope, userId, "budget:near-limit-other"),
        name: "E2E Near Limit Other",
        categoryId: categoryIds.other,
        period: "MONTHLY",
        periodStart: dateFromToday(-7),
        periodEnd: dateFromToday(23),
        status: "ACTIVE",
        currentTimestamp,
        fixedNow,
        userId,
      }),
      createCategoryBudget({
        id: deterministicUuid(seedScope, userId, "budget:over-budget"),
        name: "E2E Over Budget Category",
        categoryId: overBudgetCategoryId,
        amount: 1000,
        period: "MONTHLY",
        periodStart: dateFromToday(-7),
        periodEnd: dateFromToday(23),
        status: "ACTIVE",
        currentTimestamp,
        fixedNow,
        userId,
      }),
      createCategoryBudget({
        id: deterministicUuid(seedScope, userId, "budget:zero-spend"),
        name: "E2E Zero Spend Category",
        categoryId: zeroSpendCategoryId,
        amount: 5000,
        period: "CUSTOM",
        periodStart: dateFromToday(-14),
        periodEnd: dateFromToday(14),
        status: "ACTIVE",
        currentTimestamp,
        fixedNow,
        userId,
      }),
      createCategoryBudget({
        id: deterministicUuid(seedScope, userId, "budget:deleted-history"),
        name: "E2E Historical Deleted Category Budget With A Very Long Name",
        categoryId: deletedCategoryId,
        amount: 9876543,
        period: "WEEKLY",
        periodStart: dateFromToday(-2),
        periodEnd: dateFromToday(5),
        status: "ACTIVE",
        currentTimestamp,
        fixedNow,
        userId,
      }),
      {
        ...createCategoryBudget({
          id: deterministicUuid(seedScope, userId, "budget:detail-long-custom"),
          name: "E2E Detail Long Custom",
          categoryId: detailParentCategoryId,
          amount: 12000,
          period: "CUSTOM",
          periodStart: dateFromToday(-35),
          periodEnd: dateFromToday(14),
          status: "ACTIVE",
          currentTimestamp,
          fixedNow,
          userId,
        }),
        pause_intervals: JSON.stringify([detailPauseInterval]),
      },
    ],
    transactions: [
      {
        id: deterministicUuid(
          seedScope,
          userId,
          "transaction:near-limit-other"
        ),
        user_id: userId,
        account_id: seedIds.accounts.cash,
        amount: 8500,
        currency: "EGP",
        type: "EXPENSE",
        category_id: categoryIds.other,
        counterparty: "E2E Budget Warning",
        note: "Seeded budget attention state",
        date: dateFromToday(0),
        source: "MANUAL",
        is_draft: false,
        deleted: false,
        created_at: fixedNow,
        updated_at: currentTimestamp,
      },
      {
        id: deterministicUuid(seedScope, userId, "transaction:over-budget"),
        user_id: userId,
        account_id: seedIds.accounts.cash,
        amount: 2000,
        currency: "EGP",
        type: "EXPENSE",
        category_id: overBudgetCategoryId,
        counterparty: "E2E Budget Overrun",
        note: "Seeded over-budget state",
        date: dateFromToday(0),
        source: "MANUAL",
        is_draft: false,
        deleted: false,
        created_at: fixedNow,
        updated_at: currentTimestamp,
      },
      ...createBudgetDetailTransactions({
        accountId: seedIds.accounts.cash,
        categoryIds: {
          dining: detailDiningCategoryId,
          freshFood: detailFreshFoodCategoryId,
          groceries: detailGroceriesCategoryId,
        },
        currentTimestamp,
        dateFromToday,
        deterministicUuid,
        fixedNow,
        seedScope,
        userId,
      }),
    ],
  };
}

function createCategoryBudget({
  id,
  name,
  categoryId,
  amount = 10000,
  period = "MONTHLY",
  periodStart,
  periodEnd,
  status = "PAUSED",
  currentTimestamp,
  fixedNow,
  userId,
}) {
  return {
    ...createGlobalBudget({
      id,
      name,
      period,
      periodStart,
      periodEnd,
      currentTimestamp,
      fixedNow,
      userId,
    }),
    amount,
    category_id: categoryId,
    status,
    type: "CATEGORY",
    paused_at: status === "PAUSED" ? currentTimestamp : null,
  };
}

function createBudgetCategory({
  id,
  name,
  deleted = false,
  level = 1,
  parentId = null,
  currentTimestamp,
  fixedNow,
  userId,
}) {
  return {
    id,
    user_id: userId,
    system_name: `budget_${id.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase()}`,
    display_name: name,
    type: "EXPENSE",
    icon: "wallet-outline",
    icon_library: "Ionicons",
    color: null,
    is_system: false,
    level,
    parent_id: parentId,
    sort_order: 900,
    is_hidden: deleted,
    is_internal: false,
    nature: "WANT",
    usage_count: 0,
    deleted,
    created_at: fixedNow,
    updated_at: currentTimestamp,
  };
}

function createCompletedPauseInterval(startDate, endDate) {
  return {
    from: Date.parse(`${startDate}T00:00:00.000Z`),
    to: Date.parse(`${endDate}T23:59:59.999Z`),
  };
}

function createBudgetDetailTransactions({
  accountId,
  categoryIds,
  currentTimestamp,
  dateFromToday,
  deterministicUuid,
  fixedNow,
  seedScope,
  userId,
}) {
  const fixtures = [
    ["editable", "E2E Detail Editable", 0, 450, categoryIds.groceries],
    ["week-one", "E2E Detail Week One", -2, 320, categoryIds.dining],
    ["week-two", "E2E Detail Week Two", -8, 275, categoryIds.freshFood],
    [
      "week-two-extra",
      "E2E Detail Week Two Extra",
      -10,
      125,
      categoryIds.groceries,
    ],
    ["week-three", "E2E Detail Week Three", -15, 610, categoryIds.dining],
    [
      "paused-inside",
      "E2E Detail Paused Inside",
      -19,
      999,
      categoryIds.freshFood,
    ],
    [
      "paused-outside",
      "E2E Detail Paused Outside",
      -22,
      420,
      categoryIds.groceries,
    ],
    ["week-five", "E2E Detail Week Five", -29, 200, categoryIds.dining],
    ["week-six", "E2E Detail Week Six", -34, 180, categoryIds.freshFood],
  ];

  return fixtures.map(([key, counterparty, dayOffset, amount, categoryId]) => ({
    id: deterministicUuid(seedScope, userId, `transaction:detail:${key}`),
    user_id: userId,
    account_id: accountId,
    amount,
    currency: "EGP",
    type: "EXPENSE",
    category_id: categoryId,
    counterparty,
    note: "Seeded Budget Detail hierarchy fixture",
    date: dateFromToday(dayOffset),
    source: "MANUAL",
    is_draft: false,
    deleted: false,
    created_at: fixedNow,
    updated_at: currentTimestamp,
  }));
}

function buildBudgetDetailDeleteRows({
  categoryIds,
  currentTimestamp,
  dateFromToday,
  deterministicUuid,
  fixedNow,
  seedIds,
  seedScope,
  userId,
}) {
  return {
    categories: [],
    budgets: [
      createCategoryBudget({
        id: deterministicUuid(seedScope, userId, "budget:disposable-detail"),
        name: "E2E Disposable Detail Budget",
        categoryId: categoryIds.shopping,
        amount: 5000,
        period: "MONTHLY",
        periodStart: dateFromToday(-7),
        periodEnd: dateFromToday(23),
        status: "ACTIVE",
        currentTimestamp,
        fixedNow,
        userId,
      }),
    ],
    transactions: [
      {
        id: deterministicUuid(
          seedScope,
          userId,
          "transaction:retained-after-budget-delete"
        ),
        user_id: userId,
        account_id: seedIds.accounts.cash,
        amount: 350,
        currency: "EGP",
        type: "EXPENSE",
        category_id: categoryIds.shopping,
        counterparty: "E2E Retained After Budget Delete",
        note: "Transaction must survive disposable budget deletion",
        date: dateFromToday(0),
        source: "MANUAL",
        is_draft: false,
        deleted: false,
        created_at: fixedNow,
        updated_at: currentTimestamp,
      },
    ],
  };
}

function buildDashboardFilteredEmptyRows(args) {
  const fullRows = buildDashboardFullRows(args);
  return {
    ...fullRows,
    budgets: fullRows.budgets.filter((budget) => budget.period !== "CUSTOM"),
  };
}

function createGlobalBudget({
  id,
  name,
  period,
  periodStart,
  periodEnd,
  currentTimestamp,
  fixedNow,
  userId,
}) {
  return {
    id,
    user_id: userId,
    name,
    amount: 50000,
    currency: "EGP",
    category_id: null,
    period,
    period_start: periodStart,
    period_end: periodEnd,
    status: "ACTIVE",
    type: "GLOBAL",
    alert_threshold: 80,
    alert_fired_level: null,
    paused_at: null,
    pause_intervals: "[]",
    deleted: false,
    created_at: fixedNow,
    updated_at: currentTimestamp,
  };
}

const E2E_BUDGET_FIXTURES = {
  "dashboard-full": createBudgetFixture(
    "dashboard-full",
    buildDashboardFullRows
  ),
  "dashboard-filter-empty": createBudgetFixture(
    "dashboard-filter-empty",
    buildDashboardFilteredEmptyRows
  ),
  "budget-detail-delete": createBudgetFixture(
    "budget-detail-delete",
    buildBudgetDetailDeleteRows
  ),
};

function getE2eFixture(profile) {
  if (!profile) return E2E_SEED_FIXTURE;

  const fixture = E2E_BUDGET_FIXTURES[profile];
  if (!fixture) {
    throw new Error(`Unknown E2E budget profile: ${profile}`);
  }

  return fixture;
}

module.exports = {
  E2E_BUDGET_FIXTURES,
  E2E_SEED_FIXTURE,
  E2E_USER_FULL_NAME,
  getE2eFixture,
};
