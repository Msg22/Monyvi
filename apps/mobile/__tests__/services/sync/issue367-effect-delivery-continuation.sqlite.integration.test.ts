/** Real coordinator/reconciler proof for withholding the recovery receipt. Unexecuted. */
import {
  database,
  USER,
  ACCOUNT,
  ACTION,
  EFFECT,
  TRANSACTION,
  REMOTE_ROOT,
  COMPENSATED,
  UPPER_2,
  UPDATED,
  CHECKPOINT,
  createOptimisticGroup,
  setUpper,
  setFinancialOutcome,
  staleOutcome,
  stage,
  accountRow,
  rootRow,
  effectRow,
  syncDatabase,
  roots,
  effects,
  account,
  mockFrom,
  chainFor,
  financialRpcInputs,
} from "./issue367-effect-delivery-fixtures";
import type { Transaction } from "@monyvi/db";
import { isHistoricalRecoveryRequired } from "../../../services/sync/historical-recovery";

it("withholds the receipt through real reconciliation, then rehydrates canonical evidence on a second complete pull", async () => {
  const { action, root } = await createOptimisticGroup(true);
  setUpper(UPPER_2);
  setFinancialOutcome(staleOutcome());
  stage("accounts", accountRow(110, "2"));
  stage(
    "financial_action_groups",
    rootRow(action, REMOTE_ROOT, staleOutcome())
  );
  stage("account_financial_effects", effectRow(action, COMPENSATED));
  await syncDatabase(database);

  expect((await roots()).map((record) => record.id)).toEqual([root.id]);
  expect(root.state).toBe("reconciled");
  expect((await account()).balance).toBe(110);
  expect((await effects())[0]?.isEffective).toBe(false);
  expect(
    (await database.get<Transaction>("transactions").find(TRANSACTION)).deleted
  ).toBe(true);
  expect(financialRpcInputs).toHaveLength(1);
  expect(await isHistoricalRecoveryRequired(database, USER)).toBe(true);
  const firstCheckpoint = Number(await database.adapter.getLocal(CHECKPOINT));
  expect(Date.parse(UPDATED)).toBeLessThan(firstCheckpoint);

  let effectLowerBounds: readonly unknown[] = [];
  mockFrom.mockImplementation((table: string) => {
    const chain = chainFor(table);
    const originalGt = chain.gt;
    jest
      .spyOn(chain, "gt")
      .mockImplementation((...args: readonly unknown[]) => {
        if (table === "account_financial_effects")
          effectLowerBounds = [...effectLowerBounds, args];
        return originalGt(...args);
      });
    return chain;
  });
  try {
    setUpper("2026-10-07T16:00:00.000Z");
    stage("accounts", accountRow(110, "2"));
    stage(
      "financial_action_groups",
      rootRow(action, REMOTE_ROOT, staleOutcome())
    );
    stage("account_financial_effects", effectRow(action, COMPENSATED));
    await syncDatabase(database);
    expect(effectLowerBounds).toEqual([]);
    expect(await isHistoricalRecoveryRequired(database, USER)).toBe(false);
    expect((await roots()).map((record) => record.id)).toEqual([root.id]);
    expect(
      (await effects()).map((record) => ({
        id: record.id,
        account: record.accountId,
        action: record.actionId,
        amount: record.amountMinorUnits,
        revision: record.acceptedAccountRevision,
        effective: record.isEffective,
      }))
    ).toEqual([
      {
        id: EFFECT,
        account: ACCOUNT,
        action: ACTION,
        amount: "2500",
        revision: "2",
        effective: false,
      },
    ]);
    expect(
      (await effects()).every((record) =>
        Number.isFinite(record.compensatedAt?.getTime())
      )
    ).toBe(true);
    expect((await account()).balance).toBe(110);
    expect(financialRpcInputs).toHaveLength(1);
  } finally {
    jest.restoreAllMocks();
  }
});
