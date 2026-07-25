const { createHash, createHmac } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const {
  version: AI_PROCESSING_CONSENT_VERSION,
} = require("../../config/ai-processing-consent.json");

const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_ANDROID_SUPABASE_URL = "http://10.0.2.2:54321";
const DEFAULT_LOCAL_E2E_EMAIL = "e2e@monyvi.test";
const repoRoot = resolve(__dirname, "..", "..", "..", "..");

const FIXED_NOW = "2026-04-08T12:00:00.000Z";
const E2E_MARKET_RATE_ID = "00000000-0000-0000-0006-000000000001";
const BASE_SEED_FIXTURE = {
  seedScope: "seed",
  userFullName: "Monyvi Seed",
  authLabel: "seed",
  includeLocalMarketRate: false,
  restoreAccountBalancesAfterLedgerSeed: false,
  accountNames: {
    cash: "Seed Cash",
    bank: "Seed Bank",
    qnbBank: "Seed QNB Bank",
    wallet: "Seed Wallet",
  },
  transactionCounterparties: {
    expense: "Seed Expense",
    income: "Seed Income",
  },
  transactionNotes: {
    expense: "Seeded expense",
    income: "Seeded income",
  },
  transferNotes: {
    atm: "Seeded cash withdrawal",
  },
};

const CATEGORY_IDS = {
  shopping: "00000000-0000-0000-0001-000000000004",
  income: "00000000-0000-0000-0001-000000000011",
  other: "00000000-0000-0000-0001-000000000013",
};

const RESET_TABLE_DELETE_ORDER = [
  "transactions",
  "transfers",
  "recurring_payments",
  "budgets",
  "debts",
  "assets",
  "daily_snapshot_assets",
  "daily_snapshot_balance",
  "daily_snapshot_net_worth",
  "account_sms_senders",
  "bank_details",
  "accounts",
  "user_category_settings",
  "categories",
  "profiles",
];
const SEED_TABLE_DELETE_ORDER = RESET_TABLE_DELETE_ORDER.filter(
  (table) => table !== "profiles"
);
const AUTH_USER_PAGE_SIZE = 1000;

function deterministicUuid(seedScope, namespace, label) {
  const hex = createHash("sha256")
    .update(`monyvi:${seedScope}:${namespace}:${label}`)
    .digest("hex")
    .slice(0, 32);
  const chars = hex.split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const uuidHex = chars.join("");
  return [
    uuidHex.slice(0, 8),
    uuidHex.slice(8, 12),
    uuidHex.slice(12, 16),
    uuidHex.slice(16, 20),
    uuidHex.slice(20, 32),
  ].join("-");
}

function buildSeedIds(userId, seedScope = BASE_SEED_FIXTURE.seedScope) {
  return {
    profile: deterministicUuid(seedScope, userId, "profile"),
    accounts: {
      cash: deterministicUuid(seedScope, userId, "account:cash"),
      bank: deterministicUuid(seedScope, userId, "account:bank"),
      binance: deterministicUuid(seedScope, userId, "account:binance"),
      cibCard: deterministicUuid(seedScope, userId, "account:cib-card"),
      qnbBank: deterministicUuid(seedScope, userId, "account:qnb-bank"),
      travelWallet: deterministicUuid(
        seedScope,
        userId,
        "account:travel-wallet"
      ),
      usdCash: deterministicUuid(seedScope, userId, "account:usd-cash"),
      wallet: deterministicUuid(seedScope, userId, "account:wallet"),
    },
    assets: {
      apartmentDownPayment: deterministicUuid(
        seedScope,
        userId,
        "asset:apartment-down-payment"
      ),
      btcHolding: deterministicUuid(seedScope, userId, "asset:btc-holding"),
      goldChain: deterministicUuid(seedScope, userId, "asset:gold-chain"),
      platinumBar: deterministicUuid(seedScope, userId, "asset:platinum-bar"),
      silverCoins: deterministicUuid(seedScope, userId, "asset:silver-coins"),
    },
    assetMetals: {
      goldChain: deterministicUuid(seedScope, userId, "asset-metal:gold-chain"),
      platinumBar: deterministicUuid(
        seedScope,
        userId,
        "asset-metal:platinum-bar"
      ),
      silverCoins: deterministicUuid(
        seedScope,
        userId,
        "asset-metal:silver-coins"
      ),
    },
    bankDetails: {
      cib: deterministicUuid(seedScope, userId, "bank-detail:cib"),
      nbe: deterministicUuid(seedScope, userId, "bank-detail:nbe"),
      qnb: deterministicUuid(seedScope, userId, "bank-detail:qnb"),
    },
    budgets: {
      globalMonthly: deterministicUuid(
        seedScope,
        userId,
        "budget:global-monthly"
      ),
      groceriesMonthly: deterministicUuid(
        seedScope,
        userId,
        "budget:groceries-monthly"
      ),
      ramadanHosting: deterministicUuid(
        seedScope,
        userId,
        "budget:ramadan-hosting"
      ),
      transportWeekly: deterministicUuid(
        seedScope,
        userId,
        "budget:transport-weekly"
      ),
    },
    debts: {
      activeLent: deterministicUuid(seedScope, userId, "debt:active-lent"),
      partialBorrowed: deterministicUuid(
        seedScope,
        userId,
        "debt:partial-borrowed"
      ),
      settledLent: deterministicUuid(seedScope, userId, "debt:settled-lent"),
    },
    recurringPayments: {
      debtRepayment: deterministicUuid(
        seedScope,
        userId,
        "recurring:debt-repayment"
      ),
      gym: deterministicUuid(seedScope, userId, "recurring:gym"),
      rent: deterministicUuid(seedScope, userId, "recurring:rent"),
      salary: deterministicUuid(seedScope, userId, "recurring:salary"),
    },
    accountSmsSenders: {
      nbe: deterministicUuid(seedScope, userId, "account-sms-sender:nbe"),
      qnb: deterministicUuid(seedScope, userId, "account-sms-sender:qnb"),
      wallet: deterministicUuid(seedScope, userId, "account-sms-sender:wallet"),
    },
    transactions: {
      expense: deterministicUuid(seedScope, userId, "transaction:expense"),
      income: deterministicUuid(seedScope, userId, "transaction:income"),
      assetPurchase: deterministicUuid(
        seedScope,
        userId,
        "transaction:asset-purchase"
      ),
      debtPayment: deterministicUuid(
        seedScope,
        userId,
        "transaction:debt-payment"
      ),
      refund: deterministicUuid(seedScope, userId, "transaction:refund"),
      recurringRent: deterministicUuid(
        seedScope,
        userId,
        "transaction:recurring-rent"
      ),
      smsUtility: deterministicUuid(
        seedScope,
        userId,
        "transaction:sms-utility"
      ),
      voiceCoffee: deterministicUuid(
        seedScope,
        userId,
        "transaction:voice-coffee"
      ),
    },
    transfers: {
      atm: deterministicUuid(seedScope, userId, "transfer:atm"),
      bankToWallet: deterministicUuid(
        seedScope,
        userId,
        "transfer:bank-to-wallet"
      ),
      btcRebalance: deterministicUuid(
        seedScope,
        userId,
        "transfer:btc-rebalance"
      ),
      qnbToCib: deterministicUuid(seedScope, userId, "transfer:qnb-to-cib"),
      usdToEgp: deterministicUuid(seedScope, userId, "transfer:usd-to-egp"),
    },
  };
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createLocalSupabaseJwt(jwtSecret, role) {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: "supabase",
    ref: "localhost",
    role,
    iat: 1644431792,
    exp: 4102444800,
  };
  const signingInput = `${base64Url(header)}.${base64Url(payload)}`;
  const signature = createHmac("sha256", jwtSecret)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}

function createLocalE2ePassword(seed) {
  const hash = createHash("sha256")
    .update("monyvi:local-e2e-password:")
    .update(seed)
    .digest("base64url")
    .slice(0, 24);
  return `MonyviE2E-${hash}-1aA!`;
}

function requiredRemoteEnv(env, name) {
  const value = env[name];
  if (value) return value;
  throw new Error(`${name} is required when E2E_SUPABASE_MODE=remote`);
}

function resolveNpxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function parseSupabaseEnv(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((supabaseEnv, line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) return supabaseEnv;

      const key = line.slice(0, separatorIndex);
      const value = line.slice(separatorIndex + 1).replace(/^"|"$/g, "");
      return { ...supabaseEnv, [key]: value };
    }, {});
}

function readLocalSupabaseStatusEnv() {
  const result = spawnSync(
    resolveNpxCommand(),
    ["supabase", "status", "-o", "env"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 60_000,
    }
  );

  if (result.status !== 0) {
    throw new Error(
      [
        "Local Supabase is not ready.",
        "Start it from the repo root with: npm run supabase:start:local",
        result.error?.message,
        result.stderr || result.stdout,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return result.stdout;
}

function resolveLocalSupabaseKeys(env, readStatusEnv) {
  const explicitAnonKey =
    env.E2E_LOCAL_SUPABASE_ANON_KEY || env.E2E_LOCAL_ANON_KEY;
  const explicitServiceRoleKey =
    env.E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY || env.E2E_LOCAL_SERVICE_ROLE_KEY;

  if (explicitAnonKey && explicitServiceRoleKey) {
    return { anonKey: explicitAnonKey, serviceRoleKey: explicitServiceRoleKey };
  }

  if (env.E2E_LOCAL_JWT_SECRET) {
    return {
      anonKey:
        explicitAnonKey ??
        createLocalSupabaseJwt(env.E2E_LOCAL_JWT_SECRET, "anon"),
      serviceRoleKey:
        explicitServiceRoleKey ??
        createLocalSupabaseJwt(env.E2E_LOCAL_JWT_SECRET, "service_role"),
    };
  }

  const statusEnv = parseSupabaseEnv(readStatusEnv());
  const anonKey =
    explicitAnonKey || statusEnv.ANON_KEY || statusEnv.SUPABASE_ANON_KEY;
  const serviceRoleKey =
    explicitServiceRoleKey ||
    statusEnv.SERVICE_ROLE_KEY ||
    statusEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!anonKey || !serviceRoleKey) {
    throw new Error(
      "Could not find local Supabase keys. Start local Supabase from the repo root with: npm run supabase:start:local"
    );
  }

  return { anonKey, serviceRoleKey };
}

function getLocalSeedSupabaseUrl(env) {
  return env.E2E_LOCAL_SUPABASE_URL || LOCAL_SUPABASE_URL;
}

function getLocalSeedAppSupabaseUrl(env) {
  return env.E2E_LOCAL_APP_SUPABASE_URL || LOCAL_ANDROID_SUPABASE_URL;
}

function getSeedConfig(env = process.env, options = {}) {
  const mode = env.E2E_SUPABASE_MODE === "remote" ? "remote" : "local";
  const isLocal = mode === "local";
  const hasExplicitPassword = Boolean(env.MAESTRO_E2E_PASSWORD);
  const preserveExistingPassword =
    env.E2E_PRESERVE_EXISTING_PASSWORD === "1" && !hasExplicitPassword;
  const readStatusEnv =
    options.readLocalSupabaseStatusEnv ?? readLocalSupabaseStatusEnv;
  const localKeys = isLocal
    ? resolveLocalSupabaseKeys(env, readStatusEnv)
    : null;

  return {
    mode,
    supabaseUrl: isLocal
      ? getLocalSeedSupabaseUrl(env)
      : (env.E2E_SUPABASE_URL ??
        env.SUPABASE_URL ??
        requiredRemoteEnv(env, "EXPO_PUBLIC_SUPABASE_URL")),
    appSupabaseUrl: isLocal
      ? getLocalSeedAppSupabaseUrl(env)
      : (env.EXPO_PUBLIC_SUPABASE_URL ?? env.E2E_SUPABASE_URL),
    serviceRoleKey: isLocal
      ? localKeys.serviceRoleKey
      : (env.SUPABASE_SERVICE_ROLE_KEY ??
        requiredRemoteEnv(env, "SUPABASE_SERVICE_ROLE_KEY")),
    anonKey: isLocal
      ? localKeys.anonKey
      : (env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        requiredRemoteEnv(env, "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY")),
    email:
      env.MAESTRO_E2E_EMAIL ??
      (isLocal
        ? DEFAULT_LOCAL_E2E_EMAIL
        : requiredRemoteEnv(env, "MAESTRO_E2E_EMAIL")),
    password:
      env.MAESTRO_E2E_PASSWORD ??
      (preserveExistingPassword
        ? null
        : isLocal
          ? createLocalE2ePassword(localKeys.serviceRoleKey)
          : requiredRemoteEnv(env, "MAESTRO_E2E_PASSWORD")),
    preserveExistingPassword,
  };
}

async function assertNoError(result, label) {
  if (result && result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  return result;
}

function resolveSeedFixture(fixture = {}) {
  return {
    ...BASE_SEED_FIXTURE,
    ...fixture,
    accountNames: {
      ...BASE_SEED_FIXTURE.accountNames,
      ...(fixture.accountNames ?? {}),
    },
    transactionCounterparties: {
      ...BASE_SEED_FIXTURE.transactionCounterparties,
      ...(fixture.transactionCounterparties ?? {}),
    },
    transactionNotes: {
      ...BASE_SEED_FIXTURE.transactionNotes,
      ...(fixture.transactionNotes ?? {}),
    },
    transferNotes: {
      ...BASE_SEED_FIXTURE.transferNotes,
      ...(fixture.transferNotes ?? {}),
    },
  };
}

function dateFromToday(daysOffset) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

async function ensureSeedUser(client, config, fixture = BASE_SEED_FIXTURE) {
  const existingUser = await findE2eUser(client, config.email);
  if (existingUser) {
    const updates = {
      email_confirm: true,
      user_metadata: { full_name: fixture.userFullName },
    };

    await assertNoError(
      await client.auth.admin.updateUserById(
        existingUser.id,
        config.preserveExistingPassword
          ? updates
          : { ...updates, password: config.password }
      ),
      `sync ${fixture.authLabel} user credentials`
    );
    return existingUser.id;
  }

  if (!config.password) {
    throw new Error(
      `Cannot create ${config.email} without a password. Provide a password for this seed workflow before creating the user; password-preservation mode only works for an existing user.`
    );
  }

  const createResult = await assertNoError(
    await client.auth.admin.createUser({
      email: config.email,
      password: config.password,
      email_confirm: true,
      user_metadata: { full_name: fixture.userFullName },
    }),
    `create ${fixture.authLabel} user`
  );

  return createResult.data.user.id;
}

async function findE2eUser(client, email) {
  let page = 1;

  while (true) {
    const usersResult = await assertNoError(
      await client.auth.admin.listUsers({
        page,
        perPage: AUTH_USER_PAGE_SIZE,
      }),
      "list seed users"
    );
    const users = usersResult.data.users;
    const existingUser = users.find((user) => user.email === email);
    if (existingUser) {
      return existingUser;
    }

    if (users.length < AUTH_USER_PAGE_SIZE) {
      return null;
    }

    page += 1;
  }
}

async function deleteScopedRows(client, table, userId, seedIds) {
  if (table === "bank_details") {
    const deleteBuilder = client.from(table).delete();
    if (typeof deleteBuilder.in !== "function") {
      const fallbackDeleteResults = await Promise.all(
        Object.values(seedIds.accounts).map((accountId) =>
          client.from(table).delete().eq("account_id", accountId)
        )
      );

      await Promise.all(
        fallbackDeleteResults.map((result) =>
          assertNoError(result, `delete ${table}`)
        )
      );
      return;
    }

    return assertNoError(
      await deleteBuilder.in("account_id", Object.values(seedIds.accounts)),
      `delete ${table}`
    );
  }

  if (table === "account_sms_senders") {
    const deleteBuilder = client.from(table).delete();
    if (typeof deleteBuilder.in !== "function") {
      const fallbackDeleteResults = await Promise.all(
        Object.values(seedIds.accounts).map((accountId) =>
          client.from(table).delete().eq("account_id", accountId)
        )
      );

      await Promise.all(
        fallbackDeleteResults.map((result) =>
          assertNoError(result, `delete ${table}`)
        )
      );
      return;
    }

    return assertNoError(
      await deleteBuilder.in("account_id", Object.values(seedIds.accounts)),
      `delete ${table}`
    );
  }

  return assertNoError(
    await client.from(table).delete().eq("user_id", userId),
    `delete ${table}`
  );
}

async function upsertRows(client, table, rows, options) {
  const result = await client.from(table).upsert(rows, options);
  await assertNoError(result, `upsert ${table}`);
}

async function upsertRowsIfAny(client, table, rows, options) {
  if (rows.length === 0) {
    return;
  }

  await upsertRows(client, table, rows, options);
}

async function resolveSeedProfileId(client, userId, fallbackProfileId) {
  const result = await assertNoError(
    await client
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle(),
    "read existing profile identity"
  );
  return result.data?.id ?? fallbackProfileId;
}

async function restoreSeededAccountBalances(client, accountRows) {
  await Promise.all(
    accountRows.map(async (account) =>
      assertNoError(
        await client
          .from("accounts")
          .update({ balance: account.balance, updated_at: account.updated_at })
          .eq("id", account.id)
          .eq("user_id", account.user_id),
        `restore account balance ${account.id}`
      )
    )
  );
}

function buildSeedRows(userId, seedIds, fixture = BASE_SEED_FIXTURE) {
  const currentTimestamp = new Date().toISOString();
  const currentDate = currentTimestamp.slice(0, 10);
  const extraRows = fixture.buildExtraRows
    ? fixture.buildExtraRows({
        categoryIds: CATEGORY_IDS,
        currentTimestamp,
        dateFromToday,
        deterministicUuid,
        fixedNow: FIXED_NOW,
        seedIds,
        seedScope: fixture.seedScope,
        userId,
      })
    : {};
  const expandedAccounts = extraRows.accounts ?? [];
  const expandedBankDetails = extraRows.bankDetails ?? [];
  const assets = extraRows.assets ?? [];
  const assetMetals = extraRows.assetMetals ?? [];
  const debts = extraRows.debts ?? [];
  const budgets = extraRows.budgets ?? [];
  const recurringPayments = extraRows.recurringPayments ?? [];
  const expandedTransactions = extraRows.transactions ?? [];
  const expandedTransfers = extraRows.transfers ?? [];

  return {
    marketRate: {
      id: E2E_MARKET_RATE_ID,
      aed_usd: 0.2723,
      aud_usd: 0.66,
      bhd_usd: 2.65,
      btc_usd: 65000,
      cad_usd: 0.74,
      chf_usd: 1.1,
      cny_usd: 0.14,
      dkk_usd: 0.146,
      dzd_usd: 0.0074,
      egp_usd: 0.02,
      eur_usd: 1.09,
      gbp_usd: 1.27,
      gold_usd_per_gram: 75,
      hkd_usd: 0.128,
      inr_usd: 0.012,
      iqd_usd: 0.00076,
      isk_usd: 0.0072,
      jod_usd: 1.41,
      jpy_usd: 0.0065,
      kpw_usd: 0.0011,
      krw_usd: 0.00073,
      kwd_usd: 3.25,
      lyd_usd: 0.21,
      mad_usd: 0.1,
      myr_usd: 0.21,
      nok_usd: 0.094,
      nzd_usd: 0.61,
      omr_usd: 2.6,
      palladium_usd_per_gram: 32,
      platinum_usd_per_gram: 31,
      qar_usd: 0.2747,
      rub_usd: 0.011,
      sar_usd: 0.2667,
      sek_usd: 0.096,
      sgd_usd: 0.74,
      silver_usd_per_gram: 0.95,
      timestamp_currency: currentTimestamp,
      timestamp_metal: currentTimestamp,
      tnd_usd: 0.32,
      try_usd: 0.031,
      updated_at: currentTimestamp,
      zar_usd: 0.054,
      created_at: currentTimestamp,
    },
    profile: {
      id: seedIds.profile,
      user_id: userId,
      display_name: fixture.userFullName,
      preferred_currency: "EGP",
      preferred_language: "en",
      theme: "SYSTEM",
      sms_detection_enabled: false,
      ai_processing_consent: {
        version: AI_PROCESSING_CONSENT_VERSION,
        consentedAt: FIXED_NOW,
        revokedAt: null,
      },
      onboarding_completed: true,
      setup_guide_completed: true,
      onboarding_flags: {},
      notification_settings: {
        sms_transaction_confirmation: true,
        recurring_reminders: true,
        budget_alerts: true,
        low_balance_warnings: false,
      },
      deleted: false,
      created_at: FIXED_NOW,
      updated_at: FIXED_NOW,
    },
    accounts: [
      {
        id: seedIds.accounts.cash,
        user_id: userId,
        name: fixture.accountNames.cash,
        type: "CASH",
        balance: 2500,
        currency: "EGP",
        is_default: true,
        deleted: false,
        created_at: FIXED_NOW,
        updated_at: FIXED_NOW,
      },
      {
        id: seedIds.accounts.bank,
        user_id: userId,
        name: fixture.accountNames.bank,
        type: "BANK",
        balance: 12430.55,
        currency: "EGP",
        institution_id: "nbe",
        provider_display_name: "NBE",
        is_default: false,
        deleted: false,
        created_at: FIXED_NOW,
        updated_at: FIXED_NOW,
      },
      {
        id: seedIds.accounts.qnbBank,
        user_id: userId,
        name: fixture.accountNames.qnbBank,
        type: "BANK",
        balance: 3200,
        currency: "EGP",
        institution_id: "qnb-egypt",
        provider_display_name: "QNB",
        is_default: false,
        deleted: false,
        created_at: FIXED_NOW,
        updated_at: FIXED_NOW,
      },
      {
        id: seedIds.accounts.wallet,
        user_id: userId,
        name: fixture.accountNames.wallet,
        type: "DIGITAL_WALLET",
        balance: 950,
        currency: "EGP",
        institution_id: "vodafone-cash",
        provider_display_name: "Vodafone Cash",
        is_default: false,
        deleted: false,
        created_at: FIXED_NOW,
        updated_at: FIXED_NOW,
      },
      ...expandedAccounts,
    ],
    bankDetails: [
      {
        id: seedIds.bankDetails.nbe,
        account_id: seedIds.accounts.bank,
        card_last_4: 4321,
        account_number: "00004321",
        deleted: false,
        created_at: FIXED_NOW,
        updated_at: FIXED_NOW,
      },
      {
        id: seedIds.bankDetails.qnb,
        account_id: seedIds.accounts.qnbBank,
        card_last_4: 5566,
        account_number: "00005566",
        deleted: false,
        created_at: FIXED_NOW,
        updated_at: FIXED_NOW,
      },
      ...expandedBankDetails,
    ],
    accountSmsSenders: [
      {
        id: seedIds.accountSmsSenders.nbe,
        account_id: seedIds.accounts.bank,
        sender_name: "NBE",
        normalized_sender_name: "nbe",
        deleted: false,
        created_at: FIXED_NOW,
        updated_at: FIXED_NOW,
      },
      {
        id: seedIds.accountSmsSenders.qnb,
        account_id: seedIds.accounts.qnbBank,
        sender_name: "QNB",
        normalized_sender_name: "qnb",
        deleted: false,
        created_at: FIXED_NOW,
        updated_at: FIXED_NOW,
      },
      {
        id: seedIds.accountSmsSenders.wallet,
        account_id: seedIds.accounts.wallet,
        sender_name: "VodafoneCash",
        normalized_sender_name: "vodafonecash",
        deleted: false,
        created_at: FIXED_NOW,
        updated_at: FIXED_NOW,
      },
    ],
    assets,
    assetMetals,
    budgets,
    debts,
    recurringPayments,
    transactions: [
      {
        id: seedIds.transactions.expense,
        user_id: userId,
        account_id: seedIds.accounts.cash,
        amount: 125,
        currency: "EGP",
        type: "EXPENSE",
        category_id: CATEGORY_IDS.shopping,
        counterparty: fixture.transactionCounterparties.expense,
        note: fixture.transactionNotes.expense,
        date: currentDate,
        source: "MANUAL",
        is_draft: false,
        deleted: false,
        created_at: FIXED_NOW,
        updated_at: FIXED_NOW,
      },
      {
        id: seedIds.transactions.income,
        user_id: userId,
        account_id: seedIds.accounts.bank,
        amount: 3000,
        currency: "EGP",
        type: "INCOME",
        category_id: CATEGORY_IDS.income,
        counterparty: fixture.transactionCounterparties.income,
        note: fixture.transactionNotes.income,
        date: currentDate,
        source: "MANUAL",
        is_draft: false,
        deleted: false,
        created_at: FIXED_NOW,
        updated_at: FIXED_NOW,
      },
      ...expandedTransactions,
    ],
    transfers: [
      {
        id: seedIds.transfers.atm,
        user_id: userId,
        from_account_id: seedIds.accounts.bank,
        to_account_id: seedIds.accounts.cash,
        amount: 500,
        currency: "EGP",
        exchange_rate: null,
        converted_amount: null,
        notes: fixture.transferNotes.atm,
        date: currentDate,
        deleted: false,
        created_at: FIXED_NOW,
        updated_at: FIXED_NOW,
      },
      ...expandedTransfers,
    ],
  };
}

async function seedFixtureData(client, config, fixtureOverrides = {}) {
  const fixture = resolveSeedFixture(fixtureOverrides);
  const userId =
    config.userId ?? (await ensureSeedUser(client, config, fixture));
  const generatedSeedIds = buildSeedIds(userId, fixture.seedScope);
  const seedIds = {
    ...generatedSeedIds,
    profile: await resolveSeedProfileId(
      client,
      userId,
      generatedSeedIds.profile
    ),
  };
  const rows = buildSeedRows(userId, seedIds, fixture);

  for (const table of SEED_TABLE_DELETE_ORDER) {
    await deleteScopedRows(client, table, userId, seedIds);
  }

  await upsertRows(client, "profiles", rows.profile, {
    onConflict: "user_id",
  });
  await upsertRows(client, "accounts", rows.accounts, { onConflict: "id" });
  await upsertRows(client, "bank_details", rows.bankDetails, {
    onConflict: "id",
  });
  await upsertRows(client, "account_sms_senders", rows.accountSmsSenders, {
    onConflict: "id",
  });
  await upsertRowsIfAny(client, "assets", rows.assets, { onConflict: "id" });
  await upsertRowsIfAny(client, "asset_metals", rows.assetMetals, {
    onConflict: "id",
  });
  await upsertRowsIfAny(client, "debts", rows.debts, { onConflict: "id" });
  await upsertRowsIfAny(client, "budgets", rows.budgets, {
    onConflict: "id",
  });
  await upsertRowsIfAny(client, "recurring_payments", rows.recurringPayments, {
    onConflict: "id",
  });
  await upsertRows(client, "transactions", rows.transactions, {
    onConflict: "id",
  });
  await upsertRows(client, "transfers", rows.transfers, { onConflict: "id" });
  if (fixture.restoreAccountBalancesAfterLedgerSeed) {
    await restoreSeededAccountBalances(client, rows.accounts);
  }
  if (config.mode === "local" && fixture.includeLocalMarketRate) {
    await upsertRows(client, "market_rates", rows.marketRate, {
      onConflict: "id",
    });
  }

  return { userId };
}

async function resetFixtureData(client, config, fixtureOverrides = {}) {
  const fixture = resolveSeedFixture(fixtureOverrides);
  const userId =
    config.userId ?? (await ensureSeedUser(client, config, fixture));
  const seedIds = buildSeedIds(userId, fixture.seedScope);

  for (const table of RESET_TABLE_DELETE_ORDER) {
    await deleteScopedRows(client, table, userId, seedIds);
  }

  return { userId };
}

module.exports = {
  RESET_TABLE_DELETE_ORDER,
  SEED_TABLE_DELETE_ORDER,
  E2E_MARKET_RATE_ID,
  createLocalSupabaseJwt,
  getSeedConfig,
  resetFixtureData,
  seedFixtureData,
};
