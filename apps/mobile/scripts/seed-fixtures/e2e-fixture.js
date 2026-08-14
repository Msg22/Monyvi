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
  currentTimestamp,
  fixedNow,
  userId,
}) {
  return {
    id,
    user_id: userId,
    system_name: null,
    display_name: name,
    type: "EXPENSE",
    icon: "wallet-outline",
    icon_library: "Ionicons",
    color: null,
    is_system: false,
    level: 1,
    parent_id: null,
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
