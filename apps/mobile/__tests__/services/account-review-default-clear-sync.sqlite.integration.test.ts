import type {
  SyncPushArgs,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";
import {
  collectAccountFinancialActionPushBundles,
  collectProtectedFinancialActionRowIds,
  isProtectedFinancialActionRow,
  ADD_DEFAULT_IDS,
  OWNER,
  prepareAndCommit,
  physicalDirtyChanges,
} from "./account-default-intent-sync-recovery-sqlite-fixture";

/** A default clear updates an unsynced account without changing its created status. */
describe("#395 default-clear sync admission", () => {
  async function pendingDefaults(): Promise<{
    readonly first: Awaited<ReturnType<typeof prepareAndCommit>>;
    readonly second: Awaited<ReturnType<typeof prepareAndCommit>>;
    readonly changes: SyncPushArgs["changes"] & {
      accounts: SyncTableChangeSet;
      financial_action_groups: SyncTableChangeSet;
    };
  }> {
    const first = await prepareAndCommit("TEST First Cash", "0", false, "CASH");
    const second = await prepareAndCommit(
      "TEST Second Default",
      "0",
      true,
      "CASH"
    );
    const changes = await physicalDirtyChanges();
    const accounts = changes.accounts;
    const roots = changes.financial_action_groups;
    if (!accounts || !roots) throw new Error("missing actual dirty tables");
    return {
      first,
      second,
      changes: { ...changes, accounts, financial_action_groups: roots },
    };
  }
  it("admits real SQLite coalesced creates and orders the default successor after its creator", async () => {
    const { first, second, changes } = await pendingDefaults();
    expect(
      changes.accounts.created.find((row) => row.id === first.accountId)
    ).toMatchObject({ is_default: false, deleted: false, user_id: OWNER });
    expect(
      changes.accounts.updated.some((row) => row.id === first.accountId)
    ).toBe(false);
    const bundles = collectAccountFinancialActionPushBundles(changes);
    expect(bundles.map((bundle) => bundle.candidate.actionId)).toEqual([
      first.envelope.actionId,
      second.envelope.actionId,
    ]);
    const blocked = collectProtectedFinancialActionRowIds(changes);
    expect(
      isProtectedFinancialActionRow(blocked, "accounts", first.accountId)
    ).toBe(true);
    expect(
      isProtectedFinancialActionRow(blocked, "accounts", second.accountId)
    ).toBe(true);
    expect(bundles[1]?.rowIds.accounts).toEqual(
      [first.accountId, second.accountId].sort()
    );
  });
  it.each([
    "missing",
    "duplicate_created",
    "duplicate_buckets",
    "foreign",
    "deleted",
    "still_default",
  ] as const)("refuses %s default-clear membership", async (defect) => {
    const { first, second, changes } = await pendingDefaults();
    const previous = changes.accounts.created.find(
      (row) => row.id === first.accountId
    );
    if (!previous) throw new Error("missing actual prior account");
    const secondRoot = changes.financial_action_groups.created.find(
      (row) => row.action_id === second.envelope.actionId
    );
    if (!secondRoot) throw new Error("missing actual successor root");
    const replacement = {
      ...previous,
      ...(defect === "foreign"
        ? { user_id: ADD_DEFAULT_IDS.foreignOwner }
        : {}),
      ...(defect === "deleted" ? { deleted: true } : {}),
      ...(defect === "still_default" ? { is_default: true } : {}),
    };
    const next = {
      ...changes,
      financial_action_groups: {
        ...changes.financial_action_groups,
        created: [secondRoot],
      },
      accounts: {
        ...changes.accounts,
        created: changes.accounts.created
          .filter((row) => row.id !== first.accountId)
          .concat(
            defect === "missing"
              ? []
              : defect === "duplicate_created"
                ? [replacement, replacement]
                : [replacement]
          ),
        updated:
          defect === "duplicate_buckets"
            ? [...changes.accounts.updated, replacement]
            : changes.accounts.updated,
      },
    };
    expect(() => collectAccountFinancialActionPushBundles(next)).toThrow(
      "account_financial_action_malformed_root"
    );
  });
});
