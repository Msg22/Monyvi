import {
  acquire,
  release,
  track,
  database,
  ownedQueues,
  draftItems,
  OWNER,
  FOREIGN,
  emitSignOut,
  setCurrentUser,
  installSmsReviewSqliteHooks,
  type Lease,
} from "./sms-review-namespace-test-harness";
import * as Crypto from "expo-crypto";
import { Q } from "@nozbe/watermelondb";
import type { DismissedSmsFingerprint } from "@monyvi/db";
import {
  acquireOwnedSmsReviewQueueNamespace,
  assertOwnedSmsReviewQueueNamespaceCurrent,
} from "@/services/sms-review-namespace-lease-service";
import {
  getSmsReviewDraftQueueSnapshot,
  discardAllSmsReviewDrafts,
  deleteExpiredSmsReviewDrafts,
  mergeSmsReviewDrafts,
} from "@/services/sms-review-draft-repository";
import {
  chunksFromOriginal,
  separateOriginalChunks,
  complete,
  admittedContext,
  smsCandidate,
} from "./sms-review-complete-session-fixtures";
import { completeInitialSmsReviewResult } from "@/services/sms-review-namespace-session-service";
import {
  accountReviewSessionSchema,
} from "../../../../packages/logic/src/account-review/review-schemas";

import {
  publishIndependentSms, publishIndependentPair, unrelatedLegacySms,
  retainSelectedDraft, expectRetainedDraftUnchanged,
  cancelWhileAdmissionIsBlocked, seedHandledDismissal, seedHandledSaved,
  currentOwnedFinance, publishJointSms, publishOwnedDuplicateFingerprint,
} from "./sms-review-namespace-lifecycle-fixtures";

installSmsReviewSqliteHooks();

describe("#395 initial namespace — published lifetime and hash boundaries", () => {
  it("cancels after publication without pruning another active lease", async () => {
    const controller = new AbortController();
    const first = track(
      await acquireOwnedSmsReviewQueueNamespace({
        expectedUserId: OWNER,
        signal: controller.signal,
      })
    );
    await release(first, "published");
    const second = await acquire();
    controller.abort();
    await database.write(async (): Promise<void> => {});
    expect((await ownedQueues()).map((queue) => queue.id)).toEqual([
      second.queueId,
    ]);
    await assertOwnedSmsReviewQueueNamespaceCurrent({ lease: second });
    await release(first, "cancelled");
    await release(second, "cancelled");
    expect(await ownedQueues()).toHaveLength(0);
  });

  it("logout invalidates a published pin and leaves physical cleanup owner scoped", async () => {
    const lease = await acquire();
    await release(lease, "published");
    emitSignOut();
    await expect(
      assertOwnedSmsReviewQueueNamespaceCurrent({ lease })
    ).rejects.toThrow();
    expect(await ownedQueues(OWNER)).toHaveLength(1);
    setCurrentUser(OWNER);
    expect(await getSmsReviewDraftQueueSnapshot(OWNER)).toBeNull();
    expect(await ownedQueues()).toHaveLength(0);
    await release(lease, "cancelled");
  });

  it("an explicit empty reset revokes the old publication without touching replacement", async () => {
    const old = await acquire();
    await release(old, "published");
    expect(await discardAllSmsReviewDrafts(OWNER, old.queueId, [])).toBe(0);
    const replacement = await acquire();
    expect(replacement.queueId).not.toBe(old.queueId);
    await release(old, "cancelled");
    expect((await ownedQueues()).map((queue) => queue.id)).toEqual([
      replacement.queueId,
    ]);
    await expect(
      assertOwnedSmsReviewQueueNamespaceCurrent({ lease: old })
    ).rejects.toThrow();
    await release(replacement, "cancelled");
  });

  it("the existing retention cleanup revokes an expired empty published queue", async () => {
    const lease = await acquire();
    await release(lease, "published");
    const queue = (await ownedQueues())[0];
    if (!queue) throw new Error("Missing leased queue");
    await database.write(() =>
      queue.update((record): void => {
        record.updatedAt = new Date("2026-09-01T00:00:00.000Z");
      })
    );
    expect(
      await deleteExpiredSmsReviewDrafts(
        OWNER,
        new Date("2026-09-15T00:00:00.000Z")
      )
    ).toBe(0);
    expect(await ownedQueues()).toHaveLength(0);
    await expect(
      assertOwnedSmsReviewQueueNamespaceCurrent({ lease })
    ).rejects.toThrow();
    await release(lease, "cancelled");
  });

  it("bounds uncommitted return receipts without creating another queue or public debug API", async () => {
    const published: Lease[] = [];
    for (let index = 0; index < 128; index += 1) {
      const lease = await acquire();
      published.push(lease);
      await release(lease, "published");
    }
    await expect(acquire()).rejects.toThrow("sms_review_namespace_busy");
    expect(await ownedQueues()).toHaveLength(1);
    for (const lease of published) await release(lease, "cancelled");
    expect(await ownedQueues()).toHaveLength(0);
    const next = await acquire();
    await assertOwnedSmsReviewQueueNamespaceCurrent({ lease: next });
    await release(next, "cancelled");
  }, 20_000);

  it("fails closed when the current owner changes during an asynchronous hash", async () => {
    const lease = await acquire();
    const digest = Crypto.digestStringAsync;
    jest
      .spyOn(Crypto, "digestStringAsync")
      .mockImplementationOnce(async (algorithm, value) => {
        setCurrentUser(FOREIGN);
        return digest(algorithm, value);
      });
    await expect(complete(chunksFromOriginal(), lease)).rejects.toThrow();
    setCurrentUser(OWNER);
    await release(lease, "cancelled");
    expect(await ownedQueues()).toHaveLength(0);
  });

  it("authoritative final validation rejects a queue deleted mid-hash", async () => {
    const lease = await acquire();
    const queue = (await ownedQueues())[0];
    if (!queue) throw new Error("Missing leased queue");
    const digest = Crypto.digestStringAsync;
    jest
      .spyOn(Crypto, "digestStringAsync")
      .mockImplementationOnce(async (algorithm, value) => {
        await database.write(() => queue.destroyPermanently());
        return digest(algorithm, value);
      });
    await expect(complete(chunksFromOriginal(), lease)).rejects.toThrow();
    expect(await ownedQueues()).toHaveLength(0);
    await release(lease, "cancelled");
  });

  it("hashes multiple real rows and groups without one SQLite writer per digest", async () => {
    const lease = await acquire();
    const writer = jest.spyOn(database, "write");
    const hash = jest.spyOn(Crypto, "digestStringAsync");
    const session = await complete(separateOriginalChunks(), lease);
    expect(session.rows).toHaveLength(2);
    expect(hash.mock.calls.length).toBeGreaterThan(2);
    expect(writer.mock.calls.length).toBeLessThanOrEqual(3);
    await release(lease, "cancelled");
  });
});

describe("#395 returned-owner cleanup repair", () => {
  it("does not let an invalidated receipt reap a newly active pin on the same owned queue", async () => {
    const old = await acquire();
    await release(old, "published");
    setCurrentUser(FOREIGN);
    await expect(
      assertOwnedSmsReviewQueueNamespaceCurrent({ lease: old })
    ).rejects.toThrow();
    await release(old, "cancelled");
    expect((await ownedQueues(OWNER)).map((queue) => queue.id)).toEqual([
      old.queueId,
    ]);
    setCurrentUser(OWNER);
    const live = await acquire();
    expect(live.queueId).toBe(old.queueId);
    await release(old, "cancelled");
    await assertOwnedSmsReviewQueueNamespaceCurrent({ lease: live });
    expect((await ownedQueues()).map((queue) => queue.id)).toEqual([
      live.queueId,
    ]);
    await release(live, "cancelled");
    expect(await ownedQueues()).toHaveLength(0);
  });
});

describe("#395 independent publications — real SQLite merge admission", () => {
  it("merging publication A does not commit publication B or disable B cancellation", async () => {
    const [a, b] = await publishIndependentPair();
    const merged = await mergeSmsReviewDrafts({
      expectedUserId: OWNER,
      transactions: a.result.transactions,
    });
    expect(merged.insertedCount).toBe(1);
    const before = await retainSelectedDraft(
      a.session.sessionId,
      a.transaction.smsFingerprint
    );
    // A is already committed: aborting A cannot undo its stored draft.
    a.controller.abort();
    // B has not requested a merge yet, so its cancellation precedes admission.
    b.controller.abort();
    await expect(
      mergeSmsReviewDrafts({
        expectedUserId: OWNER,
        transactions: b.result.transactions,
      })
    ).rejects.toThrow("sms_review_namespace_stale_merge");
    await expectRetainedDraftUnchanged(before, b.transaction.smsFingerprint);
  });

  it("committing A leaves uncancelled publication B mergeable and later abort cannot undo either commit", async () => {
    const [a, b] = await publishIndependentPair();
    const committedA = await mergeSmsReviewDrafts({
      expectedUserId: OWNER,
      transactions: a.result.transactions,
    });
    expect(committedA.insertedCount).toBe(1);
    const beforeA = await retainSelectedDraft(
      a.session.sessionId,
      a.transaction.smsFingerprint
    );
    a.controller.abort();
    const committedB = await mergeSmsReviewDrafts({
      expectedUserId: OWNER,
      transactions: b.result.transactions,
    });
    expect(committedB.insertedCount).toBe(1);
    const after = await getSmsReviewDraftQueueSnapshot(OWNER);
    if (!after) throw new Error("Missing independently committed SMS drafts");
    expect(after.queueId).toBe(a.session.sessionId);
    expect(after.userId).toBe(OWNER);
    expect(after.items).toHaveLength(2);
    expect(
      after.items.find(
        (item) =>
          item.transaction.smsFingerprint === a.transaction.smsFingerprint
      )
    ).toEqual(beforeA.items[0]);
    expect(
      after.items.map((item) => item.transaction.smsFingerprint).sort()
    ).toEqual(
      [a.transaction.smsFingerprint, b.transaction.smsFingerprint].sort()
    );
    // Both writes completed before this abort: existing commit-wins semantics.
    b.controller.abort();
    expect(await getSmsReviewDraftQueueSnapshot(OWNER)).toEqual(after);
    expect((await ownedQueues()).map((queue) => queue.id)).toEqual([
      a.session.sessionId,
    ]);
  });

  it("an unrelated legacy insert does not retire a pending published result", async () => {
    const b = await publishIndependentSms(1);
    const legacy = unrelatedLegacySms();
    expect(legacy.smsFingerprint).not.toBe(b.transaction.smsFingerprint);
    const merged = await mergeSmsReviewDrafts({
      expectedUserId: OWNER,
      transactions: [legacy],
    });
    expect(merged.insertedCount).toBe(1);
    const before = await retainSelectedDraft(
      b.session.sessionId,
      legacy.smsFingerprint
    );
    b.controller.abort();
    await expect(
      mergeSmsReviewDrafts({
        expectedUserId: OWNER,
        transactions: b.result.transactions,
      })
    ).rejects.toThrow("sms_review_namespace_stale_merge");
    await expectRetainedDraftUnchanged(before, b.transaction.smsFingerprint);
  });

  it("an unrelated legacy dedup merge does not retire a pending published result", async () => {
    const legacy = unrelatedLegacySms();
    const seeded = await mergeSmsReviewDrafts({
      expectedUserId: OWNER,
      transactions: [legacy],
    });
    expect(seeded.insertedCount).toBe(1);
    const b = await publishIndependentSms(1);
    expect(legacy.smsFingerprint).not.toBe(b.transaction.smsFingerprint);
    const before = await retainSelectedDraft(
      b.session.sessionId,
      legacy.smsFingerprint
    );
    const duplicate = await mergeSmsReviewDrafts({
      expectedUserId: OWNER,
      transactions: [legacy],
    });
    expect(duplicate.insertedCount).toBe(0);
    expect(duplicate.existingCount).toBe(1);
    b.controller.abort();
    await expect(
      mergeSmsReviewDrafts({
        expectedUserId: OWNER,
        transactions: b.result.transactions,
      })
    ).rejects.toThrow("sms_review_namespace_stale_merge");
    await expectRetainedDraftUnchanged(before, b.transaction.smsFingerprint);
  });

  it("cancellation while a real writer blocks admission rejects only the uncommitted publication", async () => {
    const [a, b] = await publishIndependentPair();
    const committed = await mergeSmsReviewDrafts({
      expectedUserId: OWNER,
      transactions: a.result.transactions,
    });
    expect(committed.insertedCount).toBe(1);
    const before = await retainSelectedDraft(
      a.session.sessionId,
      a.transaction.smsFingerprint
    );
    await cancelWhileAdmissionIsBlocked(b);
    await expectRetainedDraftUnchanged(before, b.transaction.smsFingerprint);
  });
});

describe("#395 terminal publication settlement — real owned SQLite", () => {
  it("settles a dismissed-after-publication fingerprint with no empty queue, draft or financial effect", async () => {
    const p = await publishIndependentSms(0);
    const beforeFinance = await currentOwnedFinance();
    await seedHandledDismissal(p.transaction.smsFingerprint);
    await seedHandledDismissal(p.transaction.smsFingerprint, FOREIGN);
    const merged = await mergeSmsReviewDrafts({
      transactions: p.result.transactions, expectedUserId: OWNER,
    });
    expect(merged.insertedCount).toBe(0);
    expect(merged.reviewableFingerprints).toEqual([]);
    expect(await draftItems()).toHaveLength(0);
    expect(await currentOwnedFinance()).toEqual(beforeFinance);
    expect(await getSmsReviewDraftQueueSnapshot(OWNER)).toBeNull();
    expect(await ownedQueues()).toHaveLength(0);
    expect(await database.get<DismissedSmsFingerprint>("dismissed_sms_fingerprints")
      .query(Q.where("user_id", FOREIGN)).fetchCount()).toBe(1);
    const fresh = await acquire();
    expect(fresh.queueId).not.toBe(p.session.sessionId);
    await release(fresh, "cancelled");
    p.controller.abort();
  });

  it("settles a saved-after-publication fingerprint without duplicating a financial record", async () => {
    const p = await publishIndependentSms(1);
    await seedHandledSaved(p);
    const savedBeforeMerge = await currentOwnedFinance();
    expect(savedBeforeMerge.savedFingerprints)
      .toEqual([p.transaction.smsFingerprint]);
    const merged = await mergeSmsReviewDrafts({
      transactions: p.result.transactions, expectedUserId: OWNER,
    });
    expect(merged.insertedCount).toBe(0);
    expect(merged.reviewableFingerprints).toEqual([]);
    expect(await draftItems()).toHaveLength(0);
    expect(await currentOwnedFinance()).toEqual(savedBeforeMerge);
    expect(await getSmsReviewDraftQueueSnapshot(OWNER)).toBeNull();
    expect(await ownedQueues()).toHaveLength(0);
    p.controller.abort();
  });

  it("terminal result A never retires independently published B or disables aborting B", async () => {
    const [a, b] = await publishIndependentPair();
    await seedHandledDismissal(a.transaction.smsFingerprint);
    const beforeFinance = await currentOwnedFinance();
    const terminalA = await mergeSmsReviewDrafts({
      transactions: a.result.transactions, expectedUserId: OWNER,
    });
    expect(terminalA.insertedCount).toBe(0);
    expect(terminalA.reviewableFingerprints).toEqual([]);
    expect(await getSmsReviewDraftQueueSnapshot(OWNER)).toBeNull();
    expect((await ownedQueues()).map((queue) => queue.id))
      .toEqual([b.session.sessionId]);
    b.controller.abort();
    await expect(mergeSmsReviewDrafts({
      transactions: b.result.transactions, expectedUserId: OWNER,
    })).rejects.toThrow("sms_review_namespace_stale_merge");
    a.controller.abort();
    expect(await draftItems()).toHaveLength(0);
    expect(await currentOwnedFinance()).toEqual(beforeFinance);
    expect(await getSmsReviewDraftQueueSnapshot(OWNER)).toBeNull();
    expect(await ownedQueues()).toHaveLength(0);
  });

  it("settling one handled member leaves the other candidate of that same receipt cancellable", async () => {
    const joint = await publishJointSms();
    await seedHandledDismissal(joint.first.smsFingerprint);
    const beforeFinance = await currentOwnedFinance();
    const result = await mergeSmsReviewDrafts({
      transactions: [joint.first], expectedUserId: OWNER,
    });
    expect(result.insertedCount).toBe(0);
    expect(result.reviewableFingerprints).toEqual([]);
    expect((await ownedQueues()).map((queue) => queue.id))
      .toEqual([joint.session.sessionId]);
    joint.controller.abort();
    await expect(mergeSmsReviewDrafts({
      transactions: [joint.second], expectedUserId: OWNER,
    })).rejects.toThrow("sms_review_namespace_stale_merge");
    expect(await draftItems()).toHaveLength(0);
    expect(await currentOwnedFinance()).toEqual(beforeFinance);
    expect(await getSmsReviewDraftQueueSnapshot(OWNER)).toBeNull();
    expect(await ownedQueues()).toHaveLength(0);
  });

  it("mixed handled and new members settle fully; abort then terminal replay is a no-write dedup", async () => {
    const joint = await publishJointSms();
    await seedHandledDismissal(joint.first.smsFingerprint);
    const beforeFinance = await currentOwnedFinance();
    const merged = await mergeSmsReviewDrafts({
      transactions: joint.result.transactions, expectedUserId: OWNER,
    });
    expect(merged.insertedCount).toBe(1);
    expect(merged.reviewableFingerprints).toEqual([joint.second.smsFingerprint]);
    const saved = await getSmsReviewDraftQueueSnapshot(OWNER);
    if (!saved) throw new Error("Missing real newly inserted draft");
    expect(saved.items.map((row) => row.transaction.smsFingerprint))
      .toEqual([joint.second.smsFingerprint]);
    expect(saved.queueId).toBe(joint.session.sessionId);
    expect(await currentOwnedFinance()).toEqual(beforeFinance);
    joint.controller.abort();
    const replay = await mergeSmsReviewDrafts({
      transactions: [joint.first], expectedUserId: OWNER,
    });
    expect(replay.insertedCount).toBe(0);
    expect(replay.existingCount).toBe(1);
    expect(replay.reviewableFingerprints).toEqual([]);
    expect(await draftItems()).toHaveLength(1);
    expect(await currentOwnedFinance()).toEqual(beforeFinance);
    expect(await getSmsReviewDraftQueueSnapshot(OWNER)).toEqual(saved);
    expect((await ownedQueues()).map((queue) => queue.id))
      .toEqual([joint.session.sessionId]);
  });

  it("128 successfully terminally handled publications leave capacity for a new real lease", async () => {
    const first = await publishIndependentSms(0);
    const controllers: AbortController[] = [first.controller];
    const originalQueueId = first.session.sessionId;
    await seedHandledDismissal(first.transaction.smsFingerprint);
    const beforeFinance = await currentOwnedFinance();
    try {
      for (let n = 0; n < 128; n += 1) {
        const p = n === 0 ? first : await publishIndependentSms(0);
        if (n > 0) controllers.push(p.controller);
        expect(p.session.sessionId).toBe(originalQueueId);
        const outcome = await mergeSmsReviewDrafts({
          transactions: p.result.transactions, expectedUserId: OWNER,
        });
        expect(outcome.insertedCount).toBe(0);
        expect(outcome.reviewableFingerprints).toEqual([]);
      }
      const next = await acquire();
      expect(next.queueId).toBe(originalQueueId);
      await assertOwnedSmsReviewQueueNamespaceCurrent({ lease: next });
      expect(await draftItems()).toHaveLength(0);
      expect(await currentOwnedFinance()).toEqual(beforeFinance);
      await release(next, "cancelled");
      expect(await getSmsReviewDraftQueueSnapshot(OWNER)).toBeNull();
      expect(await ownedQueues()).toHaveLength(0);
    } finally {
      for (const controller of controllers) controller.abort();
    }
  }, 90_000);

  it("two distinct bound objects with one new fingerprint settle after exactly one owned draft insert", async () => {
    const controller = new AbortController();
    const publication = await publishOwnedDuplicateFingerprint(
      "synthetic-terminal-duplicate-single", controller
    );
    const finance = await currentOwnedFinance();
    const merged = await mergeSmsReviewDrafts({
      expectedUserId: OWNER,
      transactions: [publication.first, publication.second],
    });
    expect(merged.insertedCount).toBe(1);
    expect(merged.existingCount).toBe(1);
    expect((await draftItems()).map((row) => row.smsFingerprint))
      .toEqual([publication.first.smsFingerprint]);
    controller.abort();
    const replay = await mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: [publication.second],
    });
    expect(replay.insertedCount).toBe(0);
    expect(replay.existingCount).toBe(1);
    expect(await currentOwnedFinance()).toEqual(finance);
    await release(publication.lease, "cancelled");
  });

  it("128 completed duplicate-fingerprint publications cannot retain their pins or exhaust the owned lease", async () => {
    const controllers: AbortController[] = [];
    const leases: Lease[] = [];
    const beforeFinance = await currentOwnedFinance();
    try {
      for (let index = 0; index < 128; index += 1) {
        const controller = new AbortController();
        const publication = await publishOwnedDuplicateFingerprint(
          "synthetic-terminal-duplicate-" + index, controller
        );
        controllers.push(controller);
        leases.push(publication.lease);
        const outcome = await mergeSmsReviewDrafts({
          expectedUserId: OWNER,
          transactions: [publication.first, publication.second],
        });
        expect(outcome.insertedCount).toBe(1);
        expect(outcome.existingCount).toBe(1);
      }
      expect(await draftItems()).toHaveLength(128);
      const next = await acquire();
      await assertOwnedSmsReviewQueueNamespaceCurrent({ lease: next });
      expect(await currentOwnedFinance()).toEqual(beforeFinance);
      await release(next, "cancelled");
    } finally {
      for (const controller of controllers) controller.abort();
      for (const lease of leases) await release(lease, "cancelled");
    }
  }, 90_000);

  it("unsubmitted same-fingerprint sibling stays cancellable despite admitting the first object", async () => {
    const controller = new AbortController();
    const publication = await publishOwnedDuplicateFingerprint(
      "synthetic-terminal-partial-same-fingerprint", controller
    );
    const outcome = await mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: [publication.first],
    });
    expect(outcome.insertedCount).toBe(1);
    const saved = await getSmsReviewDraftQueueSnapshot(OWNER);
    expect(saved?.items).toHaveLength(1);
    controller.abort();
    await expect(mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: [publication.second],
    })).rejects.toThrow("sms_review_namespace_stale_merge");
    expect(await getSmsReviewDraftQueueSnapshot(OWNER)).toEqual(saved);
    await release(publication.lease, "cancelled");
  });

  it("settling same fingerprint in one publication cannot disable an independent published receipt abort", async () => {
    const controller = new AbortController();
    const a = await publishOwnedDuplicateFingerprint(
      "synthetic-terminal-other-receipt", controller
    );
    const bController = new AbortController();
    const b = await publishOwnedDuplicateFingerprint(
      a.first.smsFingerprint, bController
    );
    const merged = await mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: [a.first, a.second],
    });
    expect(merged.insertedCount).toBe(1);
    controller.abort();
    bController.abort();
    await expect(mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: [b.first],
    })).rejects.toThrow("sms_review_namespace_stale_merge");
    await release(a.lease, "cancelled");
    await release(b.lease, "cancelled");
    expect((await draftItems()).map((row) => row.smsFingerprint))
      .toEqual([a.first.smsFingerprint]);
  });

  it("real completed result can bind its settled transaction object into a new authenticated publication", async () => {
    const first = await publishIndependentSms(0);
    const inserted = await mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: first.result.transactions,
    });
    expect(inserted.insertedCount).toBe(1);
    const saved = await getSmsReviewDraftQueueSnapshot(OWNER);
    const source = first.result.reviewChunks?.[0]?.submittedMessages[0];
    if (!source || !saved) throw new Error("Missing genuine first publication");
    const secondController = new AbortController();
    // Reuse the actual returned finance and source, without inventing a
    // prior-session receipt token or claiming a still-live prior publication.
    const { reviewSession: settledSession, ...returnedSource } = first.result;
    if (!settledSession) throw new Error("Missing real settled session");
    const replayed = await completeInitialSmsReviewResult({
      success: returnedSource,
      context: admittedContext(),
      candidates: [smsCandidate(source.id, source.smsFingerprint, source.body)],
      signal: secondController.signal,
    });
    // Generic completion returns T; runtime enrichment is proven by its
    // canonical session discriminator before reading the hydrated field.
    if (!("reviewSession" in replayed)) {
      throw new Error("Missing re-published canonical review session");
    }
    const replayedSession = accountReviewSessionSchema.parse(replayed.reviewSession);
    expect(replayedSession.sessionId).toBe(saved.queueId);
    expect(replayed.transactions[0]).toBe(first.transaction);
    const outcome = await mergeSmsReviewDrafts({
      expectedUserId: OWNER, transactions: replayed.transactions,
    });
    expect(outcome.insertedCount).toBe(0);
    expect(outcome.existingCount).toBe(1);
    secondController.abort();
    first.controller.abort();
    expect(await getSmsReviewDraftQueueSnapshot(OWNER)).toEqual(saved);
  });

});
