import {
  acquire,
  release,
  ownedQueues,
  draftItems,
  OWNER,
  FOREIGN,
  setCurrentUser,
  installSmsReviewSqliteHooks,
} from "./sms-review-namespace-test-harness";
import {
  accountReviewSessionSchema,
  type AccountReviewSession,
} from "../../../../packages/logic/src/account-review/review-schemas";
import { NORMALIZATION_IDS } from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import type { SmsReviewChunk } from "@/services/ai-sms-parser-review";
import {
  chunksFromOriginal,
  separateOriginalChunks,
  complete,
} from "./sms-review-complete-session-fixtures";

installSmsReviewSqliteHooks();

describe("#395 full initial SMS assembler — actual normalizer and SQLite lease", () => {
  it("matches the owned queue UUID and preserves accepted original finance", async () => {
    const lease = await acquire();
    const review = accountReviewSessionSchema.parse(
      await complete(chunksFromOriginal(), lease)
    );
    expect(review.sessionId).toBe(lease.queueId);
    expect(review.source).toBe("SMS");
    expect(review.ownerId).toBe(OWNER);
    expect(review.rows).toHaveLength(1);
    expect(review.rows[0]?.amountDecimal).toBe("50");
    expect(review.rows[0]?.transaction.categoryId).toBe(
      NORMALIZATION_IDS.shoppingCategory
    );
    const sourceRow = review.rows[0];
    if (!sourceRow || sourceRow.source !== "SMS") {
      throw new Error("Review must carry an original SMS row");
    }
    expect(sourceRow.transaction.smsFingerprint).toBe(
      NORMALIZATION_IDS.smsFingerprint
    );
    expect(review.saveIntent).toBeNull();
    expect(review.rows[0]?.selected).toBe(false);
    await release(lease, "published");
  });

  it("uses one namespace for independent chunks, even with repeated model aliases", async () => {
    const lease = await acquire();
    const chunks = separateOriginalChunks();
    const review = accountReviewSessionSchema.parse(
      await complete(chunks, lease)
    );
    expect(review.sessionId).toBe(lease.sessionId);
    expect(review.rows).toHaveLength(2);
    expect(new Set(review.rows.map((row) => row.rowId)).size).toBe(2);
    expect(new Set(review.rows.map((row) => row.sourceFingerprint)).size).toBe(
      2
    );
    expect(review.rows.every((row) => row.selected === false)).toBe(true);
    expect(review.groups.every((group) => group.status === "pending")).toBe(
      true
    );
    await release(lease, "cancelled");
  });

  it("chunk arrival reorder does not change source row identity or edited UUID", async () => {
    const lease = await acquire();
    const chunks = separateOriginalChunks();
    const first = await complete(chunks, lease);
    const second = await complete([...chunks].reverse(), lease);
    const keyed = (
      review: AccountReviewSession
    ): ReadonlyMap<string, string> => {
      const pairs = new Map<string, string>();
      for (const row of review.rows) {
        if (row.source !== "SMS") throw new Error("Expected original SMS row");
        pairs.set(row.sourceFingerprint, row.rowId);
      }
      return pairs;
    };
    expect(keyed(first)).toEqual(keyed(second));
    expect(first.sessionId).toBe(lease.sessionId);
    expect(second.sessionId).toBe(lease.sessionId);
    await release(lease, "cancelled");
  });

  it("the same accepted fingerprint is represented once, not by arrival order", async () => {
    const lease = await acquire();
    const chunk = chunksFromOriginal()[0];
    if (!chunk) throw new Error("Missing source chunk");
    const review = await complete([chunk, chunk], lease);
    expect(review.rows).toHaveLength(1);
    expect(review.rows[0]?.sourceFingerprint).toBe(
      NORMALIZATION_IDS.smsFingerprint
    );
    await release(lease, "cancelled");
  });

  it("conflicting attempts for one fingerprint fail closed without overwriting edits", async () => {
    const lease = await acquire();
    const first = chunksFromOriginal()[0];
    if (!first) throw new Error("Missing source chunk");
    const financial = first.financialRows[0];
    const mapped = first.mappedTransactions[0];
    if (!financial || !mapped) throw new Error("Missing financial source");
    const conflict: SmsReviewChunk = {
      ...first,
      requestKey: "different-provider-retry",
      financialRows: [{ ...financial, amount: financial.amount + 7 }],
      mappedTransactions: [{ ...mapped, amount: mapped.amount + 7 }],
    };
    await expect(complete([first, conflict], lease)).rejects.toThrow();
    expect(await draftItems()).toHaveLength(0);
    await release(lease, "cancelled");
  });

  it("true opted-in legacy v1 original keeps unknown currency provenance", async () => {
    const lease = await acquire();
    const chunk = chunksFromOriginal()[0];
    if (!chunk) throw new Error("Missing source chunk");
    const review = await complete(
      [
        {
          ...chunk,
          providerResponse: null,
        },
      ],
      lease
    );
    expect(review.rows).toHaveLength(1);
    expect(review.rows[0]?.currency).toMatchObject({
      state: "unconfirmed",
      reason: "legacy_unknown",
    });
    expect(review.rows[0]?.transaction.categoryId).toBe(
      NORMALIZATION_IDS.shoppingCategory
    );
    expect(review.rows[0]?.toAssignment).toBeNull();
    await release(lease, "cancelled");
  });

  it("legacy/local source IDs never adopt model transport request aliases", async () => {
    const lease = await acquire();
    const chunk = chunksFromOriginal()[0];
    if (!chunk) throw new Error("Missing source chunk");
    const review = await complete(
      [
        {
          ...chunk,
          requestKey: "provider-retry-key-not-session",
          providerResponse: null,
        },
      ],
      lease
    );
    expect(review.sessionId).toBe(lease.sessionId);
    expect(review.sessionId).not.toBe("provider-retry-key-not-session");
    const sourceRow = review.rows[0];
    if (!sourceRow || sourceRow.source !== "SMS") {
      throw new Error("Review must carry an original SMS row");
    }
    expect(sourceRow.transaction.smsFingerprint).toBe(
      NORMALIZATION_IDS.smsFingerprint
    );
    await release(lease, "cancelled");
  });

  it("the current owner is revalidated before final session publication", async () => {
    const lease = await acquire();
    setCurrentUser(FOREIGN);
    await expect(complete(chunksFromOriginal(), lease)).rejects.toThrow();
    setCurrentUser(OWNER);
    await release(lease, "cancelled");
    expect(await ownedQueues()).toHaveLength(0);
  });
});
