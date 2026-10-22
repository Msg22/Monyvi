/** #395 L4 historical original refusal cases, registered under the real SQLite suite. */
import type { Model } from "@nozbe/watermelondb";
import type { SmsReviewDraftItem } from "@monyvi/db";
import {
  database,
  cloneRecoverySqlite,
  readPrivateOwnedRoot,
  saveReview,
  hashProvider,
} from "./account-review-local-recovery-test-harness";
import { physicalSaveLedgerSnapshot } from "./account-review-save-sqlite-test-helpers";
import {
  ACTION,
  OWNER,
  FOREIGN_OWNER,
  SESSION,
  FINGERPRINT_A,
  testUuid,
  type SaveFixture,
} from "./account-review-save-test-fixtures";
import {
  cache,
  cachedOriginalTombstone,
  drafts,
  mutateOriginalPhysical,
  physicalSmsSnapshot,
  queues,
  root,
} from "./account-review-all-dedup-physical-test-helpers";
import { hashAccountReviewLocalPostimage } from "../../services/account-review-local-snapshot-postimages";

interface OriginalRefusalSuite {
  readonly setup: () => Promise<{ readonly cleanup: SaveFixture }>;
  readonly createGenuinePendingAdd: () => Promise<{
    readonly actionId: string;
  }>;
}

/** Keep each original it/it.each body and SQLite assertion inside its parent suite. */
export function registerAllDedupOriginalRefusalCases({
  setup,
  createGenuinePendingAdd,
}: OriginalRefusalSuite): void {
  it.each([
    ["Add", null],
    ["Add", ""],
    ["Review", null],
    ["Review", ""],
  ] as const)(
    "L4-MISSING-%s evidence %s: unresolved real owned root refuses before any SQL/cache mutation",
    async (kind, missing) => {
      const prepared = await setup();
      const action =
        kind === "Add" ? (await createGenuinePendingAdd()).actionId : ACTION;
      const target = await root(database, action);
      expect(target.state).toBe("local_complete");
      await database.write(() =>
        database.batch(
          target.prepareUpdate((row) => {
            row.localRecoverySnapshotJson = missing;
          })
        )
      );
      const original = await cachedOriginalTombstone(database);
      const current = (await drafts(database))[0];
      const queue = (await queues(database))[0];
      if (!current || !queue) throw new Error("missing_live_owned_sms_fixture");
      const cached: Model[] = [target, original, current, queue];
      const beforeCached = cache(cached);
      const beforePhysical = await physicalSmsSnapshot(
        await cloneRecoverySqlite()
      );
      const beforeLedger = await physicalSaveLedgerSnapshot(
        await cloneRecoverySqlite()
      );
      await expect(saveReview(prepared.cleanup)).rejects.toThrow(
        kind === "Add"
          ? "account_review_private_lifecycle_invalid_add_private_evidence"
          : missing === null
            ? "account_review_private_lifecycle_missing_review_private_evidence"
            : "account_review_private_lifecycle_missing_or_wrong_review_private_root"
      );
      expect(cache(cached)).toEqual(beforeCached);
      expect(await physicalSmsSnapshot(await cloneRecoverySqlite())).toEqual(
        beforePhysical
      );
      expect(
        await physicalSaveLedgerSnapshot(await cloneRecoverySqlite())
      ).toEqual(beforeLedger);
      expect((await queues(database)).map((item) => item.id)).toEqual([
        SESSION,
      ]);
    }
  );

  it.each([
    ["altered original payload", "payload_json", '{"synthetic":"later"}'],
    ["foreign original owner", "user_id", FOREIGN_OWNER],
    ["rebound original queue", "queue_id", testUuid(9091)],
    ["edited original timestamp", "updated_at", 1770000000000],
  ] as const)(
    "L4-PHYSICAL-%s: changed historical deleted original refuses with exact full physical/cache rollback",
    async (_name, field, value) => {
      const prepared = await setup();
      await mutateOriginalPhysical(database, field, value);
      const historical = await cachedOriginalTombstone(database);
      const action = await root(database, ACTION);
      const priorCache = cache([historical, action]);
      const priorPhysical = await physicalSmsSnapshot(
        await cloneRecoverySqlite()
      );
      const priorLedger = await physicalSaveLedgerSnapshot(
        await cloneRecoverySqlite()
      );
      await expect(saveReview(prepared.cleanup)).rejects.toThrow(
        "account_review_private_lifecycle_"
      );
      expect(cache([historical, action])).toEqual(priorCache);
      expect(await physicalSmsSnapshot(await cloneRecoverySqlite())).toEqual(
        priorPhysical
      );
      expect(
        await physicalSaveLedgerSnapshot(await cloneRecoverySqlite())
      ).toEqual(priorLedger);
      expect(await drafts(database)).toHaveLength(1);
    }
  );

  it("L4-UNKNOWN: physical same-owner unlisted deleted sibling can never enter generic GC", async () => {
    const prepared = await setup();
    const survivor = (await drafts(database))[0];
    if (!survivor) throw new Error("missing_synthetic_survivor");
    const rogue = database
      .get<SmsReviewDraftItem>("sms_review_draft_items")
      .prepareCreate((row) => {
        row._raw.id = testUuid(9040);
        row.userId = OWNER;
        row.queueId = SESSION;
        row.smsFingerprint = "9".repeat(64);
        row.payloadVersion = survivor.payloadVersion;
        row.payloadJson = survivor.payloadJson;
        row.selectionOverride = false;
        row.position = 9040;
        row.parsedAt = survivor.parsedAt;
      });
    await database.write(async () => {
      await database.batch(rogue);
      await database.batch(rogue.prepareMarkAsDeleted());
    });
    const cached = [rogue, await cachedOriginalTombstone(database)];
    const priorCache = cache(cached);
    const priorPhysical = await physicalSmsSnapshot(
      await cloneRecoverySqlite()
    );
    const priorLedger = await physicalSaveLedgerSnapshot(
      await cloneRecoverySqlite()
    );
    expect(
      priorPhysical.drafts.some(
        (r) => r.id === rogue.id && r._status === "deleted"
      )
    ).toBe(true);
    await expect(saveReview(prepared.cleanup)).rejects.toThrow(
      "account_review_private_lifecycle_"
    );
    expect(cache(cached)).toEqual(priorCache);
    expect(await physicalSmsSnapshot(await cloneRecoverySqlite())).toEqual(
      priorPhysical
    );
    expect(
      await physicalSaveLedgerSnapshot(await cloneRecoverySqlite())
    ).toEqual(priorLedger);
  });

  it("L4-SEALED-U: adding a hashed private-only same-owner deleted sibling is still unauthorized", async () => {
    const prepared = await setup();
    const rogueId = testUuid(9041);
    const original = await cachedOriginalTombstone(database);
    const rogue = database
      .get<SmsReviewDraftItem>("sms_review_draft_items")
      .prepareCreate((row) => {
        row._raw.id = rogueId;
        row.userId = OWNER;
        row.queueId = SESSION;
        row.smsFingerprint = "8".repeat(64);
        row.payloadVersion = original.payloadVersion;
        row.payloadJson = original.payloadJson;
        row.selectionOverride = original.selectionOverride;
        row.position = 9041;
        row.parsedAt = original.parsedAt;
      });
    await database.write(async () => {
      await database.batch(rogue);
      await database.batch(rogue.prepareMarkAsDeleted());
    });
    const action = await root(database, ACTION);
    const evidence = readPrivateOwnedRoot(action);
    const exemplar = evidence.smsDrafts.find(
      (entry) =>
        entry.retentionState === "available" &&
        entry.smsFingerprint === FINGERPRINT_A
    );
    if (!exemplar || exemplar.retentionState !== "available")
      throw new Error("missing_true_original_private_evidence");
    const hash = await hashAccountReviewLocalPostimage({
      table: "sms_review_draft_items",
      id: rogue.id,
      raw: rogue._raw,
      hashProvider,
    });
    await database.write(() =>
      database.batch(
        action.prepareUpdate((r) => {
          r.localRecoverySnapshotJson = JSON.stringify({
            ...evidence,
            smsDrafts: [
              ...evidence.smsDrafts,
              {
                ...exemplar,
                id: rogue.id,
                smsFingerprint: rogue.smsFingerprint,
                expectedPostimageHash: hash,
              },
            ],
          });
        })
      )
    );
    const beforePhysical = await physicalSmsSnapshot(
      await cloneRecoverySqlite()
    );
    const beforeLedger = await physicalSaveLedgerSnapshot(
      await cloneRecoverySqlite()
    );
    const beforeCache = cache([action, rogue, original]);
    await expect(saveReview(prepared.cleanup)).rejects.toThrow(
      "account_review_private_lifecycle_"
    );
    expect(await physicalSmsSnapshot(await cloneRecoverySqlite())).toEqual(
      beforePhysical
    );
    expect(
      await physicalSaveLedgerSnapshot(await cloneRecoverySqlite())
    ).toEqual(beforeLedger);
    expect(cache([action, rogue, original])).toEqual(beforeCache);
  });
}
