import {
  database,
  acquire,
  release,
  ownedQueues,
  draftItems,
  OWNER,
  FOREIGN,
  setCurrentUser,
  installSmsReviewSqliteHooks,
  type Lease,
} from "./sms-review-namespace-test-harness";
import type { SmsReviewQueue } from "@monyvi/db";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import { canonicalUuid } from "../../../../packages/logic/src/account-review/schema-primitives";
import {
  acquireOwnedSmsReviewQueueNamespace,
  assertOwnedSmsReviewQueueNamespaceCurrent,
} from "@/services/sms-review-namespace-lease-service";
import {
  getSmsReviewDraftQueueSnapshot,
  mergeSmsReviewDrafts,
  discardAllSmsReviewDrafts,
} from "@/services/sms-review-draft-repository";

installSmsReviewSqliteHooks();

async function seedQueue(owner: string = OWNER): Promise<SmsReviewQueue> {
  return database.write(() =>
    database.get<SmsReviewQueue>("sms_review_queues").create((row): void => {
      row.userId = owner;
      row.updatedAt = new Date();
    })
  );
}

function acceptedFinance(): ParsedSmsTransaction {
  return {
    source: "SMS",
    smsFingerprint: "synthetic-accepted-fingerprint",
    senderDisplayName: "QNB",
    rawSmsBody: "QNB debit 50 EGP at Shop",
    amount: 50,
    currency: "EGP",
    type: "EXPENSE",
    date: new Date("2026-10-14T12:00:00.000Z"),
    categoryId: "00000000-0000-4000-8000-000000000108",
    categoryDisplayName: "Shopping",
    confidence: 0.95,
    originLabel: "QNB",
    counterparty: "Shop",
  };
}

describe("#395 owned queue UUID lease — real SQLite concurrency and lifetime", () => {
  it("serializes two same-owner acquires to one real queue UUID, not two models", async () => {
    const [a, b] = await Promise.all([acquire(), acquire()]);
    expect(a.queueId).toBe(b.queueId);
    expect(a.sessionId).toBe(a.queueId);
    expect(b.sessionId).toBe(b.queueId);
    expect(a.leaseToken).not.toBe(b.leaseToken);
    expect(canonicalUuid.safeParse(a.sessionId).success).toBe(true);
    expect(await ownedQueues()).toHaveLength(1);
    await release(a, "cancelled");
    expect(await ownedQueues()).toHaveLength(1);
    await release(b, "no_accepted_rows");
    expect(await ownedQueues()).toHaveLength(0);
  });

  it("reuses an existing owned nonempty queue instead of renaming edited row IDs", async () => {
    const accepted = await mergeSmsReviewDrafts({
      expectedUserId: OWNER,
      transactions: [acceptedFinance()],
    });
    expect(accepted.insertedCount).toBe(1);
    const existing = (await ownedQueues())[0];
    if (!existing) throw new Error("Failed to persist existing owned queue");
    const lease = await acquire();
    expect(lease.sessionId).toBe(existing.id);
    expect(lease.queueId).toBe(existing.id);
    await release(lease, "cancelled");
    expect((await ownedQueues()).map((row) => row.id)).toEqual([existing.id]);
  });

  it("does not physically prune a published empty queue on a UI snapshot read", async () => {
    const first = await acquire();
    await release(first, "published");
    expect(await getSmsReviewDraftQueueSnapshot(OWNER)).toBeNull();
    expect((await ownedQueues()).map((row) => row.id)).toEqual([first.queueId]);
    const second = await acquire();
    expect(second.sessionId).toBe(first.sessionId);
    await release(second, "cancelled");
    expect(await ownedQueues()).toHaveLength(1);
    await release(first, "cancelled");
    expect(await ownedQueues()).toHaveLength(0);
  });

  it("publication keeps just one owner/queue pin while operation tokens retire", async () => {
    const first = await acquire();
    const second = await acquire();
    await release(first, "published");
    await release(second, "published");
    const next = await acquire();
    expect(next.sessionId).toBe(first.queueId);
    await release(next, "cancelled");
    expect(await ownedQueues()).toHaveLength(1);
    await release(first, "cancelled");
    expect(await ownedQueues()).toHaveLength(1);
    await release(second, "cancelled");
    expect(await ownedQueues()).toHaveLength(0);
  });

  it("retires published operation tokens while retaining just one queue pin", async () => {
    const completed: Lease[] = [];
    for (let index = 0; index < 24; index += 1) {
      const lease = await acquire();
      completed.push(lease);
      await release(lease, "published");
      await expect(
        assertOwnedSmsReviewQueueNamespaceCurrent({ lease })
      ).rejects.toThrow();
      expect((await ownedQueues()).map((queue) => queue.id)).toEqual([
        completed[0]?.queueId,
      ]);
    }
    const stillActive = await acquire();
    expect(stillActive.sessionId).toBe(completed[0]?.queueId);
    await assertOwnedSmsReviewQueueNamespaceCurrent({ lease: stillActive });
    await release(stillActive, "cancelled");
    expect(await ownedQueues()).toHaveLength(1);
    for (const lease of completed) {
      await release(lease, "cancelled");
    }
    expect(await ownedQueues()).toHaveLength(0);
  });

  it("existing queue merge commits under the published UUID and retires its pin", async () => {
    const lease = await acquire();
    await release(lease, "published");
    const merged = await mergeSmsReviewDrafts({
      expectedUserId: OWNER,
      transactions: [acceptedFinance()],
    });
    expect(merged.insertedCount).toBe(1);
    expect(await draftItems()).toHaveLength(1);
    expect((await draftItems())[0]?.queueId).toBe(lease.sessionId);
    await release(lease, "committed");
    expect((await ownedQueues()).map((row) => row.id)).toEqual([lease.queueId]);
  });

  it("commit of a published queue cannot erase a concurrently pinned review", async () => {
    const first = await acquire();
    const second = await acquire();
    await release(first, "published");
    await mergeSmsReviewDrafts({
      expectedUserId: OWNER,
      transactions: [acceptedFinance()],
    });
    await release(first, "committed");
    await assertOwnedSmsReviewQueueNamespaceCurrent({ lease: second });
    expect(await ownedQueues()).toHaveLength(1);
    await release(second, "cancelled");
  });

  it("aborted work creates no phantom queue and uses no caller transport UUID", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      acquireOwnedSmsReviewQueueNamespace({
        expectedUserId: OWNER,
        signal: controller.signal,
      })
    ).rejects.toThrow();
    expect(await ownedQueues()).toHaveLength(0);
  });

  it("rejects logout/current-owner change without transferring a held queue", async () => {
    const lease = await acquire();
    setCurrentUser(FOREIGN);
    await expect(
      assertOwnedSmsReviewQueueNamespaceCurrent({
        lease,
      })
    ).rejects.toThrow();
    await expect(
      acquireOwnedSmsReviewQueueNamespace({
        expectedUserId: OWNER,
      })
    ).rejects.toThrow();
    expect((await ownedQueues(OWNER))[0]?.id).toBe(lease.sessionId);
    setCurrentUser(OWNER);
    await release(lease, "cancelled");
  });

  it("rejects a foreign or duplicate owned queue without mutating it", async () => {
    const foreign = await seedQueue(FOREIGN);
    const a = await seedQueue();
    const b = await seedQueue();
    await expect(
      acquireOwnedSmsReviewQueueNamespace({
        expectedUserId: OWNER,
      })
    ).rejects.toThrow();
    expect((await ownedQueues()).map((row) => row.id)).toEqual([a.id, b.id]);
    expect((await ownedQueues(FOREIGN))[0]?.id).toBe(foreign.id);
  });

  it("replacement invalidates stale owner/queue/epoch even when owner stays same", async () => {
    const lease = await acquire();
    const current = (await ownedQueues())[0];
    if (!current) throw new Error("Missing allocated queue");
    await database.write(async (): Promise<void> => {
      await current.destroyPermanently();
    });
    const replacement = await seedQueue();
    expect(replacement.id).not.toBe(lease.queueId);
    await expect(
      assertOwnedSmsReviewQueueNamespaceCurrent({ lease })
    ).rejects.toThrow();
    await release(lease, "cancelled");
    expect((await ownedQueues()).map((row) => row.id)).toEqual([
      replacement.id,
    ]);
  });

  it("a cancelled published operation reaps only its own empty queue", async () => {
    const lease = await acquire();
    await release(lease, "published");
    await release(lease, "cancelled");
    expect(await ownedQueues()).toHaveLength(0);
    await expect(
      assertOwnedSmsReviewQueueNamespaceCurrent({ lease })
    ).rejects.toThrow();
  });

  it("a committed last-row discard invalidates the old namespace, not Undo IDs", async () => {
    const lease = await acquire();
    await release(lease, "published");
    await mergeSmsReviewDrafts({
      expectedUserId: OWNER,
      transactions: [acceptedFinance()],
    });
    const rows = await draftItems();
    expect(rows).toHaveLength(1);
    await discardAllSmsReviewDrafts(OWNER, lease.queueId, [rows[0].id]);
    await expect(
      assertOwnedSmsReviewQueueNamespaceCurrent({ lease })
    ).rejects.toThrow();
    expect(await draftItems()).toHaveLength(0);
    await release(lease, "cancelled");
  });
});
