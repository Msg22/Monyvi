import type { SyncPushArgs } from "@nozbe/watermelondb/sync";

import {
  collectProtectedFinancialActionRowIds,
  isProtectedFinancialActionRow,
  stripProtectedAccountFields,
} from "../../../services/sync/account-protected-fields";

const ACCOUNT_ID = "30000000-0000-4000-8000-000000000003";
const TRANSACTION_ID = "40000000-0000-4000-8000-000000000004";

function changes(): SyncPushArgs["changes"] {
  return {
    financial_action_groups: {
      created: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          payload_json: JSON.stringify({
            payloadVersion: "account.balance-effects/v1",
            payload: {
              domainMutation: {
                records: [
                  { entity: "account", after: { id: ACCOUNT_ID } },
                  { entity: "transaction", after: { id: TRANSACTION_ID } },
                ],
              },
            },
          }),
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
});
