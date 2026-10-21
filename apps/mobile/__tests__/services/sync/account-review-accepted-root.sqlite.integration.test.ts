/** Accepted Review root must finish its own SDK ACK after original members are clean. */
import { synchronize, type SyncPushArgs } from "@nozbe/watermelondb/sync";
import {
  ledger,
  validateReviewBatchSavePayload,
  clearAndSeed,
  setMockActiveAddOwner,
  REVIEW_CREATED_OWNER,
  makeSaveFixture,
  saveReview,
  foundation,
  createFinancialActionPushCoordinator,
  parseFinancialActionEnvelopeJson,
  createAccountReviewFinancialRegistry,
  physicalSaveLedgerSnapshot,
  coldRestart,
} from "../account-default-intent-sync-recovery-sqlite-fixture";
import { synchronizeWithProtectedAccountActions } from "@/services/sync";
import { collectAcceptedReviewRootOnlyAck } from "@/services/sync/accepted-review-root-ack";
import { loadAccountActionProtection } from "@/services/sync/account-action-protection";
import { runWithAccountSyncAckExclusion } from "@/services/sync/account-sync-ack-scope";
import { pushChanges } from "@/services/sync/push-service";
import type { FinancialActionGroup } from "@monyvi/db";

jest.unmock("@nozbe/watermelondb/sync");

describe("accepted Review root SDK completion", () => {
  it("finishes root-only ACK after restart without reposting or reapplying financial records", async () => {
    setMockActiveAddOwner(REVIEW_CREATED_OWNER);
    await clearAndSeed(ledger.database);
    // ACK synthetic category setup before the financial action exists.
    await synchronize({
      database: ledger.database,
      pullChanges: () => Promise.resolve({ changes: {}, timestamp: 1 }),
      pushChanges: () => Promise.resolve(undefined),
    });
    const fixture = makeSaveFixture("voice-shared");
    await expect(saveReview(fixture, ledger.database)).resolves.toMatchObject({
      kind: "committed",
    });
    const transport = jest.fn(
      ({ payloadJson }: { payloadJson: string }): Promise<unknown> => {
        const envelope = parseFinancialActionEnvelopeJson(
          payloadJson,
          createAccountReviewFinancialRegistry()
        );
        return Promise.resolve({
          actionId: envelope.actionId,
          status: "accepted",
          accountRevisions: envelope.accountGuards.map((guard) => ({
            accountId: guard.accountId,
            revision: (BigInt(guard.expectedRevision) + 1n).toString(),
          })),
          effectiveEventId: null,
          holdingRevision: null,
          serverAcceptedAt: "2026-10-21T12:00:00.000Z",
        });
      }
    );
    const run = async (
      database: typeof ledger.database,
      timestamp: number
    ): Promise<void> => {
      const coordinator = createFinancialActionPushCoordinator({
        ...foundation(database),
        database,
        invokeAccountFinancialActionRpc: transport,
      });
      await synchronizeWithProtectedAccountActions({
        database,
        expectedOwnerId: REVIEW_CREATED_OWNER,
        pullChanges: () => Promise.resolve({ changes: {}, timestamp }),
        pushChanges: (args: SyncPushArgs, capability) =>
          pushChanges(
            database,
            args,
            REVIEW_CREATED_OWNER,
            coordinator,
            capability
          ),
      });
    };
    await run(ledger.database, 2);
    const roots = await ledger.database
      .get<FinancialActionGroup>("financial_action_groups")
      .query()
      .fetch();
    expect(roots).toHaveLength(1);
    const acceptedRoot = roots[0];
    if (!acceptedRoot) throw new Error("missing_accepted_review_root");
    expect(roots[0]?.state).toBe("accepted");
    // Acceptance changes the captured root; SDK correctly leaves it dirty.
    expect(roots[0]?._raw._status).not.toBe("synced");
    for (const table of [
      "accounts",
      "transactions",
      "account_financial_effects",
    ]) {
      const rows = await ledger.database.get(table).query().fetch();
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row._raw._status === "synced")).toBe(true);
    }
    const financialBefore = (
      await physicalSaveLedgerSnapshot(ledger.database)
    ).filter((entry) => entry.table !== "financial_action_groups");
    const capturedRoot = { ...acceptedRoot._raw };
    const db = await coldRestart();
    await runWithAccountSyncAckExclusion(
      db,
      REVIEW_CREATED_OWNER,
      async (capability) => {
        const catalog = await loadAccountActionProtection({
          database: db,
          expectedOwnerId: REVIEW_CREATED_OWNER,
          capability,
        });
        const empty = {};
        expect(
          collectAcceptedReviewRootOnlyAck(capturedRoot, empty, catalog)?.rowIds
        ).toEqual({ financial_action_groups: [capturedRoot.id] });
        expect(
          collectAcceptedReviewRootOnlyAck(capturedRoot, empty, undefined)
        ).toBeNull();
        for (const override of [
          { user_id: "different-owner" },
          { payload_hash: "0".repeat(64) },
          { state: "local_complete" },
          { account_guards_json: "[]" },
          { domain_reference_id: "different-record" },
        ]) {
          expect(
            collectAcceptedReviewRootOnlyAck(
              { ...capturedRoot, ...override },
              empty,
              catalog
            )
          ).toBeNull();
        }
        const envelope = parseFinancialActionEnvelopeJson(
          acceptedRoot.payloadJson,
          createAccountReviewFinancialRegistry()
        );
        const payload = validateReviewBatchSavePayload(envelope.payload);
        const createdAccount = payload.domainMutation.records.find(
          (mutation) => mutation.entity === "account"
        );
        if (!createdAccount) throw new Error("missing_created_account");
        expect(
          collectAcceptedReviewRootOnlyAck(
            capturedRoot,
            {
              accounts: {
                created: [],
                updated: [{ id: createdAccount.after.id }],
                deleted: [],
              },
            },
            catalog
          )
        ).toBeNull();
        const effect = payload.accountEffects[0];
        if (!effect) throw new Error("missing_original_effect");
        expect(
          collectAcceptedReviewRootOnlyAck(
            capturedRoot,
            {
              account_financial_effects: {
                created: [{ id: effect.effectId }],
                updated: [],
                deleted: [],
              },
            },
            catalog
          )
        ).toBeNull();
      }
    );
    await run(db, 3);
    expect(transport).toHaveBeenCalledTimes(1);
    const completed = await db
      .get<FinancialActionGroup>("financial_action_groups")
      .find(acceptedRoot.id);
    expect(completed.state).toBe("accepted");
    expect(completed._raw._status).toBe("synced");
    const financialAfter = (await physicalSaveLedgerSnapshot(db)).filter(
      (entry) => entry.table !== "financial_action_groups"
    );
    expect(financialAfter).toEqual(financialBefore);
    expect({
      ...completed._raw,
      _status: capturedRoot._status,
      _changed: capturedRoot._changed,
    }).toEqual(capturedRoot);
    await run(db, 4);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("refuses an accepted state with an invalid durable receipt without changing financial rows", async () => {
    setMockActiveAddOwner(REVIEW_CREATED_OWNER);
    const fixture = makeSaveFixture("voice-cash");
    await expect(saveReview(fixture, ledger.database)).resolves.toMatchObject({
      kind: "committed",
    });
    const repository = foundation(ledger.database);
    await repository.markFinancialActionGroupSyncPending(
      fixture.intent.actionId
    );
    await repository.recordFinancialActionGroupServerOutcome(
      fixture.intent.actionId,
      "accepted",
      "{}",
      null
    );
    const before = await physicalSaveLedgerSnapshot(ledger.database);
    await expect(
      runWithAccountSyncAckExclusion(
        ledger.database,
        REVIEW_CREATED_OWNER,
        (capability) =>
          loadAccountActionProtection({
            database: ledger.database,
            expectedOwnerId: REVIEW_CREATED_OWNER,
            capability,
          })
      )
    ).rejects.toThrow("invalid_review_acceptance_receipt");
    expect(await physicalSaveLedgerSnapshot(ledger.database)).toEqual(before);
  });
});
