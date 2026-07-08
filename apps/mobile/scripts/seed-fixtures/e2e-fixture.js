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

module.exports = {
  E2E_SEED_FIXTURE,
  E2E_USER_FULL_NAME,
};
