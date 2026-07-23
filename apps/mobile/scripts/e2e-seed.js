const { createClient } = require("@supabase/supabase-js");

const {
  E2E_MARKET_RATE_ID,
  RESET_TABLE_DELETE_ORDER,
  createLocalSupabaseJwt,
  getSeedConfig,
  resetFixtureData: resetFixtureDataWithFixture,
  seedFixtureData: seedFixtureDataWithFixture,
} = require("./seed-fixtures/seed-engine");
const { E2E_SEED_FIXTURE } = require("./seed-fixtures/e2e-fixture");

const E2E_TABLE_DELETE_ORDER = RESET_TABLE_DELETE_ORDER;

function getE2eSeedConfig(env = process.env, options = {}) {
  return getSeedConfig(env, options);
}

async function seedE2eData(client, config) {
  return seedFixtureData(client, config, E2E_SEED_FIXTURE);
}

async function resetE2eData(client, config) {
  return resetFixtureData(client, config, E2E_SEED_FIXTURE);
}

async function seedFixtureData(client, config, fixture = E2E_SEED_FIXTURE) {
  return seedFixtureDataWithFixture(client, config, fixture);
}

async function resetFixtureData(client, config, fixture = E2E_SEED_FIXTURE) {
  return resetFixtureDataWithFixture(client, config, fixture);
}

async function main() {
  const config = getE2eSeedConfig();
  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const action = process.argv[2] ?? "seed";
  if (action !== "seed" && action !== "reset") {
    throw new Error(`Unknown e2e seed action: ${action}`);
  }

  if (action === "reset") {
    const result = await resetE2eData(client, config);
    console.log(
      `Reset E2E data for ${config.email} (${result.userId}) on ${config.mode} Supabase`
    );
    return;
  }

  const result = await seedE2eData(client, config);
  console.log(
    `Seeded E2E data for ${config.email} (${result.userId}) on ${config.mode} Supabase`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  E2E_TABLE_DELETE_ORDER,
  E2E_MARKET_RATE_ID,
  createLocalSupabaseJwt,
  getE2eSeedConfig,
  resetE2eData,
  resetFixtureData,
  seedE2eData,
  seedFixtureData,
};
