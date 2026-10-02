import type { SyncPushArgs } from "@nozbe/watermelondb/sync";

import {
  collectAccountFinancialActionPushBundles,
  collectProtectedFinancialActionRowIds,
  isProtectedFinancialActionRow,
  stripProtectedAccountFields,
} from "../../../services/sync/account-protected-fields";

const ACCOUNT_ID = "30000000-0000-4000-8000-000000000003";
const TRANSACTION_ID = "40000000-0000-4000-8000-000000000004";
const ACTION_ID = "10000000-0000-4000-8000-000000000001";
const EFFECT_ID = "50000000-0000-4000-8000-000000000005";
const PAYLOAD_JSON = JSON.stringify({
  accountGuards: [{ accountId: ACCOUNT_ID, expectedRevision: "0" }],
  payloadVersion: "account.balance-effects/v1",
  payload: {
    domainMutation: {
      records: [
        { entity: "account", after: { id: ACCOUNT_ID } },
        { entity: "transaction", after: { id: TRANSACTION_ID } },
      ],
    },
  },
});

function changes(): SyncPushArgs["changes"] {
  return {
    financial_action_groups: {
      created: [
        {
          id: ACTION_ID,
          action_id: ACTION_ID,
          payload_hash: "a".repeat(64),
          payload_json: PAYLOAD_JSON,
          state: "local_complete",
        },
      ],
      updated: [],
      deleted: [],
    },
    accounts: {
      created: [],
      updated: [],
      deleted: [],
    },
    account_financial_effects: {
      created: [{ id: EFFECT_ID, action_id: ACTION_ID }],
      updated: [],
      deleted: [],
    },
  };
}

describe("account financial-action generic sync protection", () => {
  it("rejects every domain row linked by a pending guarded root", () => {
    expect(collectProtectedFinancialActionRowIds(changes())).toEqual({
      accounts: [ACCOUNT_ID],
      transactions: [TRANSACTION_ID],
    });
  });

  it("matches created, updated, and deleted record ids", () => {
    const rejected = collectProtectedFinancialActionRowIds(changes());
    expect(
      isProtectedFinancialActionRow(rejected, "accounts", { id: ACCOUNT_ID })
    ).toBe(true);
    expect(
      isProtectedFinancialActionRow(rejected, "transactions", TRANSACTION_ID)
    ).toBe(true);
  });

  it("never lets generic account upserts carry balance authority", () => {
    expect(
      stripProtectedAccountFields("accounts", {
        id: ACCOUNT_ID,
        name: "Renamed cash",
        balance: 100,
        financial_revision: "8",
      })
    ).toEqual({ id: ACCOUNT_ID, name: "Renamed cash" });
  });

  it("groups each account action with exactly the rows its RPC will acknowledge", () => {
    expect(collectAccountFinancialActionPushBundles(changes())).toEqual([
      {
        candidate: {
          actionId: ACTION_ID,
          payloadHash: "a".repeat(64),
          payloadJson: PAYLOAD_JSON,
          state: "local_complete",
        },
        rowIds: {
          account_financial_effects: [EFFECT_ID],
          accounts: [ACCOUNT_ID],
          financial_action_groups: [ACTION_ID],
          transactions: [TRANSACTION_ID],
        },
      },
    ]);
  });
});
