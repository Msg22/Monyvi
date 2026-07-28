import { encodeSmsReviewDraft, type ParsedSmsTransaction } from "@monyvi/logic";

import {
  deleteExpiredSmsReviewDrafts,
  deleteResolvedSmsReviewDraftsInWriter,
  discardAllSmsReviewDrafts,
  discardSmsReviewDraft,
  getHandledSmsReviewFingerprints,
  getSmsReviewDraftCount,
  getSmsReviewDraftQueueSnapshot,
  mergeSmsReviewDrafts,
  restoreSmsReviewDraft,
  updateSmsReviewDraftItem,
  updateSmsReviewDraftSelection,
} from "@/services/sms-review-draft-repository";

interface QueryCondition {
  readonly kind: "where" | "sort";
  readonly column: string;
  readonly value: unknown;
}

interface FakeQuery {
  readonly fetch: () => Promise<FakeRecord[]>;
  readonly fetchCount: () => Promise<number>;
  readonly observe: () => null;
}

class FakeRecord {
  public constructor(table: string, id: string) {
    this.table = table;
    this.id = id;
  }

  public readonly id: string;
  public readonly table: string;
  public userId = "";
  public queueId = "";
  public smsFingerprint = "";
  public payloadVersion = 1;
  public payloadJson = "";
  public selectionOverride: boolean | null = null;
  public position = 0;
  public parsedAt = new Date(0);
  public updatedAt = new Date(0);
  public deleted = false;
  public operation: "create" | "update" | "destroy" = "create";

  public prepareUpdate(updater: (record: FakeRecord) => void): FakeRecord {
    updater(this);
    this.operation = "update";
    return this;
  }

  public prepareDestroyPermanently(): FakeRecord {
    this.operation = "destroy";
    return this;
  }
}

class FakeCollection {
  public constructor(table: string) {
    this.table = table;
  }

  public readonly table: string;
  public records: FakeRecord[] = [];
  private nextId = 1;

  public find(id: string): Promise<FakeRecord> {
    const record = this.records.find((candidate) => candidate.id === id);
    return record
      ? Promise.resolve(record)
      : Promise.reject(new Error(`Missing record ${this.table}:${id}`));
  }

  public query(...conditions: readonly QueryCondition[]): FakeQuery {
    const fetchRecords = (): FakeRecord[] => {
      let result = [...this.records];
      for (const condition of conditions) {
        if (condition.kind === "where") {
          const property = toPropertyName(condition.column);
          result = result.filter((record) => {
            const actual = record[property as keyof FakeRecord];
            if (
              typeof condition.value === "object" &&
              condition.value !== null &&
              "lte" in condition.value
            ) {
              const comparable =
                actual instanceof Date ? actual.getTime() : actual;
              return (
                typeof comparable === "number" &&
                comparable <= Number(condition.value.lte)
              );
            }
            return actual === condition.value;
          });
        }
      }
      return result;
    };
    return {
      fetch: (): Promise<FakeRecord[]> => Promise.resolve(fetchRecords()),
      fetchCount: (): Promise<number> => Promise.resolve(fetchRecords().length),
      observe: (): null => null,
    };
  }

  public prepareCreate(updater: (record: FakeRecord) => void): FakeRecord {
    const record = new FakeRecord(this.table, `${this.table}-${this.nextId++}`);
    updater(record);
    return record;
  }
}

interface FakeCachedModelSnapshot {
  readonly model: FakeRecord;
  readonly values: Partial<FakeRecord>;
}

const mockCollections = new Map<string, FakeCollection>();
const mockCaptureCachedModelSnapshot = jest.fn<
  FakeCachedModelSnapshot,
  [FakeRecord]
>();
const mockRestoreCachedModelSnapshot = jest.fn<
  void,
  [FakeCachedModelSnapshot]
>();
const mockBatch = jest.fn(
  (operations: readonly FakeRecord[]): Promise<void> => {
    for (const operation of operations) {
      const collection = mockCollections.get(operation.table);
      if (!collection) throw new Error(`Missing collection ${operation.table}`);
      if (operation.operation === "destroy") {
        collection.records = collection.records.filter(
          (record) => record.id !== operation.id
        );
      } else if (
        !collection.records.some((record) => record.id === operation.id)
      ) {
        collection.records.push(operation);
      }
    }
    return Promise.resolve();
  }
);
let mockCurrentUserId = "user-1";
const mockAssertExpectedCurrentUser = jest.fn(
  (expectedUserId: string): Promise<void> => {
    if (expectedUserId !== mockCurrentUserId) {
      return Promise.reject(new Error("sms_review_draft_user_scope_changed"));
    }
    return Promise.resolve();
  }
);

function toPropertyName(column: string): string {
  return column.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase()
  );
}

jest.mock("@monyvi/db", () => ({
  database: {
    get: (table: string): FakeCollection => {
      const collection = mockCollections.get(table);
      if (!collection) throw new Error(`Missing collection ${table}`);
      return collection;
    },
    write: <T>(action: () => Promise<T>): Promise<T> => action(),
    batch: (operations: readonly FakeRecord[]): Promise<void> =>
      mockBatch(operations),
  },
  SmsReviewQueue: class SmsReviewQueue {},
  SmsReviewDraftItem: class SmsReviewDraftItem {},
  DismissedSmsFingerprint: class DismissedSmsFingerprint {},
  Transaction: class Transaction {},
  Transfer: class Transfer {},
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    asc: "asc",
    lte: (value: number): { readonly lte: number } => ({ lte: value }),
    where: (column: string, value: unknown): QueryCondition => ({
      kind: "where",
      column,
      value,
    }),
    sortBy: (column: string, value: unknown): QueryCondition => ({
      kind: "sort",
      column,
      value,
    }),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: (expectedUserId: string): Promise<void> =>
    mockAssertExpectedCurrentUser(expectedUserId),
  getCurrentUserDataScope: (): Promise<unknown> =>
    Promise.resolve({
      userId: mockCurrentUserId,
      queryOwned: (
        collection: FakeCollection,
        ...conditions: QueryCondition[]
      ) =>
        collection.query(
          { kind: "where", column: "user_id", value: mockCurrentUserId },
          ...conditions
        ),
    }),
}));

jest.mock("@/services/watermelon-atomic-batch", () => ({
  commitPreparedBatch: (operations: readonly FakeRecord[]): Promise<void> =>
    mockBatch(operations),
}));

jest.mock("@/services/watermelon-cache-snapshot", () => ({
  captureCachedModelSnapshot: (model: FakeRecord): FakeCachedModelSnapshot =>
    mockCaptureCachedModelSnapshot(model),
  restoreCachedModelSnapshot: (snapshot: FakeCachedModelSnapshot): void =>
    mockRestoreCachedModelSnapshot(snapshot),
}));

function createTransaction(
  smsFingerprint: string,
  amount = 100
): ParsedSmsTransaction {
  return {
    amount,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Merchant",
    date: new Date("2026-07-27T12:00:00.000Z"),
    categoryId: "category-1",
    categoryDisplayName: "Shopping",
    confidence: 0.95,
    originLabel: "QNB EGYPT",
    source: "SMS",
    smsFingerprint,
    senderDisplayName: "QNB EGYPT",
    rawSmsBody: "message",
  };
}

function seedRecord(table: string, values: Partial<FakeRecord>): FakeRecord {
  const record = new FakeRecord(
    table,
    `${table}-seed-${mockCollections.get(table)?.records.length ?? 0}`
  );
  Object.assign(record, values, { operation: "update" });
  mockCollections.get(table)?.records.push(record);
  return record;
}

describe("sms-review-draft-repository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCaptureCachedModelSnapshot.mockImplementation((model: FakeRecord) => ({
      model,
      values: { ...model },
    }));
    mockRestoreCachedModelSnapshot.mockImplementation(
      ({
        model,
        values,
      }: {
        model: FakeRecord;
        values: Partial<FakeRecord>;
      }) => {
        Object.assign(model, values);
      }
    );
    mockCurrentUserId = "user-1";
    mockAssertExpectedCurrentUser.mockImplementation(
      (expectedUserId: string): Promise<void> => {
        if (expectedUserId !== mockCurrentUserId) {
          return Promise.reject(
            new Error("sms_review_draft_user_scope_changed")
          );
        }
        return Promise.resolve();
      }
    );
    mockCollections.clear();
    mockCollections.set(
      "sms_review_queues",
      new FakeCollection("sms_review_queues")
    );
    mockCollections.set(
      "sms_review_draft_items",
      new FakeCollection("sms_review_draft_items")
    );
    mockCollections.set(
      "dismissed_sms_fingerprints",
      new FakeCollection("dismissed_sms_fingerprints")
    );
    mockCollections.set("transactions", new FakeCollection("transactions"));
    mockCollections.set("transfers", new FakeCollection("transfers"));
  });

  it("merges only unique unsuppressed fingerprints into one stable queue", async () => {
    seedRecord("dismissed_sms_fingerprints", {
      userId: "user-1",
      smsFingerprint: "fp-dismissed",
    });

    const result = await mergeSmsReviewDrafts({
      expectedUserId: "user-1",
      parsedAt: new Date("2026-07-27T12:00:00.000Z"),
      transactions: [
        createTransaction("fp-new", 10),
        createTransaction("fp-new", 999),
        createTransaction("fp-dismissed", 20),
      ],
    });

    const queues = mockCollections.get("sms_review_queues")?.records ?? [];
    const items = mockCollections.get("sms_review_draft_items")?.records ?? [];
    expect(result).toEqual({
      insertedCount: 1,
      existingCount: 2,
      rejectedCount: 0,
      reviewableFingerprints: ["fp-new"],
    });
    expect(queues).toHaveLength(1);
    expect(items.map((item) => item.smsFingerprint)).toEqual(["fp-new"]);
    expect(items.map((item) => item.position)).toEqual([0]);
    expect(mockBatch).toHaveBeenCalledTimes(1);
  });

  it("reasserts the pinned user immediately before committing a merge", async () => {
    mockAssertExpectedCurrentUser
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("sms_review_draft_user_scope_changed"));

    await expect(
      mergeSmsReviewDrafts({
        expectedUserId: "user-1",
        transactions: [createTransaction("fp-stale-user")],
      })
    ).rejects.toThrow("sms_review_draft_user_scope_changed");

    expect(mockBatch).not.toHaveBeenCalled();
    expect(mockCollections.get("sms_review_draft_items")?.records).toHaveLength(
      0
    );
  });

  it("preserves an existing edited payload and appends at the next position", async () => {
    const queue = seedRecord("sms_review_queues", {
      userId: "user-1",
      updatedAt: new Date("2026-07-27T10:00:00.000Z"),
    });
    seedRecord("sms_review_draft_items", {
      userId: "user-1",
      queueId: queue.id,
      smsFingerprint: "fp-existing",
      payloadJson: "edited-payload",
      position: 4,
    });

    const result = await mergeSmsReviewDrafts({
      expectedUserId: "user-1",
      transactions: [
        createTransaction("fp-existing", 999),
        createTransaction("fp-next", 50),
      ],
    });

    const items = mockCollections.get("sms_review_draft_items")?.records ?? [];
    expect(result).toEqual({
      insertedCount: 1,
      existingCount: 1,
      rejectedCount: 0,
      reviewableFingerprints: ["fp-existing", "fp-next"],
    });
    expect(
      items.find((item) => item.smsFingerprint === "fp-existing")?.payloadJson
    ).toBe("edited-payload");
    expect(
      items.find((item) => item.smsFingerprint === "fp-next")?.position
    ).toBe(5);
  });

  it("refreshes only an untouched baseline draft with its enriched result", async () => {
    const queue = seedRecord("sms_review_queues", {
      userId: "user-1",
      updatedAt: new Date("2026-07-27T10:00:00.000Z"),
    });
    const baseline = createTransaction("fp-enriched", 100);
    const encodedBaseline = encodeSmsReviewDraft(baseline);
    const draft = seedRecord("sms_review_draft_items", {
      userId: "user-1",
      queueId: queue.id,
      smsFingerprint: "fp-enriched",
      payloadVersion: encodedBaseline.version,
      payloadJson: encodedBaseline.json,
      selectionOverride: null,
    });
    const enriched = {
      ...baseline,
      categoryId: "category-food",
      categoryDisplayName: "Food",
      confidence: 0.98,
    };

    await mergeSmsReviewDrafts({
      expectedUserId: "user-1",
      transactions: [enriched],
      baselineTransactions: [baseline],
    });

    expect(draft.payloadJson).toBe(encodeSmsReviewDraft(enriched).json);
    expect(mockBatch).toHaveBeenCalledTimes(1);
  });

  it("restores untouched parser payloads when the adapter batch fails", async () => {
    const queue = seedRecord("sms_review_queues", { userId: "user-1" });
    const baseline = createTransaction("fp-refresh-failure", 100);
    const encodedBaseline = encodeSmsReviewDraft(baseline);
    const draft = seedRecord("sms_review_draft_items", {
      userId: "user-1",
      queueId: queue.id,
      smsFingerprint: "fp-refresh-failure",
      payloadVersion: encodedBaseline.version,
      payloadJson: encodedBaseline.json,
      selectionOverride: null,
    });
    mockBatch.mockRejectedValueOnce(new Error("adapter failed"));

    await expect(
      mergeSmsReviewDrafts({
        expectedUserId: "user-1",
        transactions: [{ ...baseline, categoryDisplayName: "Food" }],
        baselineTransactions: [baseline],
      })
    ).rejects.toThrow("adapter failed");

    expect(draft.payloadJson).toBe(encodedBaseline.json);
    expect(mockRestoreCachedModelSnapshot).toHaveBeenCalled();
  });

  it("does not overwrite a draft edited after its baseline was persisted", async () => {
    const queue = seedRecord("sms_review_queues", { userId: "user-1" });
    const baseline = createTransaction("fp-edited", 100);
    const edited = createTransaction("fp-edited", 125);
    const encodedEdited = encodeSmsReviewDraft(edited);
    const draft = seedRecord("sms_review_draft_items", {
      userId: "user-1",
      queueId: queue.id,
      smsFingerprint: "fp-edited",
      payloadVersion: encodedEdited.version,
      payloadJson: encodedEdited.json,
      selectionOverride: null,
    });

    await mergeSmsReviewDrafts({
      expectedUserId: "user-1",
      transactions: [createTransaction("fp-edited", 999)],
      baselineTransactions: [baseline],
    });

    expect(draft.payloadJson).toBe(encodedEdited.json);
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("keeps valid siblings when one parser result cannot be encoded", async () => {
    const invalid = {
      ...createTransaction("fp-invalid"),
      date: new Date("invalid"),
    };

    const result = await mergeSmsReviewDrafts({
      expectedUserId: "user-1",
      transactions: [createTransaction("fp-valid"), invalid],
    });

    expect(result).toEqual({
      insertedCount: 1,
      existingCount: 0,
      rejectedCount: 1,
      reviewableFingerprints: ["fp-valid"],
    });
    expect(
      mockCollections
        .get("sms_review_draft_items")
        ?.records.map((item) => item.smsFingerprint)
    ).toEqual(["fp-valid"]);
  });

  it("rechecks saved fingerprints inside the writer before creating drafts", async () => {
    seedRecord("transactions", {
      userId: "user-1",
      smsFingerprint: "fp-saved",
      deleted: false,
    });

    const result = await mergeSmsReviewDrafts({
      expectedUserId: "user-1",
      transactions: [
        createTransaction("fp-saved"),
        createTransaction("fp-new"),
      ],
    });

    expect(result).toEqual({
      insertedCount: 1,
      existingCount: 1,
      rejectedCount: 0,
      reviewableFingerprints: ["fp-new"],
    });
    expect(
      mockCollections
        .get("sms_review_draft_items")
        ?.records.map((item) => item.smsFingerprint)
    ).toEqual(["fp-new"]);
  });

  it("blocks a final save when the fingerprint was saved after preparation", async () => {
    const queue = seedRecord("sms_review_queues", { userId: "user-1" });
    const draft = seedRecord("sms_review_draft_items", {
      userId: "user-1",
      queueId: queue.id,
      smsFingerprint: "fp-raced",
    });
    seedRecord("transactions", {
      userId: "user-1",
      smsFingerprint: "fp-raced",
      deleted: false,
    });

    await expect(
      deleteResolvedSmsReviewDraftsInWriter([draft.id], "user-1")
    ).rejects.toThrow("sms_review_draft_fingerprint_already_saved");

    expect(mockCollections.get("sms_review_draft_items")?.records).toContain(
      draft
    );
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("removes a draft that was already saved before financial preparation", async () => {
    const queue = seedRecord("sms_review_queues", { userId: "user-1" });
    const draft = seedRecord("sms_review_draft_items", {
      userId: "user-1",
      queueId: queue.id,
      smsFingerprint: "fp-preexisting",
    });
    seedRecord("transactions", {
      userId: "user-1",
      smsFingerprint: "fp-preexisting",
      deleted: false,
    });

    await deleteResolvedSmsReviewDraftsInWriter(
      [draft.id],
      "user-1",
      [],
      new Set(["fp-preexisting"])
    );

    expect(
      mockCollections.get("sms_review_draft_items")?.records
    ).not.toContain(draft);
    expect(mockCollections.get("transactions")?.records).toHaveLength(1);
    expect(mockBatch).toHaveBeenCalledTimes(1);
  });

  it("revalidates the active user immediately before the final save batch", async () => {
    const queue = seedRecord("sms_review_queues", { userId: "user-1" });
    const draft = seedRecord("sms_review_draft_items", {
      userId: "user-1",
      queueId: queue.id,
      smsFingerprint: "fp-user-race",
    });
    mockAssertExpectedCurrentUser
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("sms_review_draft_user_scope_changed"));

    await expect(
      deleteResolvedSmsReviewDraftsInWriter([draft.id], "user-1")
    ).rejects.toThrow("sms_review_draft_user_scope_changed");

    expect(mockBatch).not.toHaveBeenCalled();
    expect(draft.operation).toBe("update");
  });

  it("revalidates the active user immediately before discard all commits", async () => {
    const queue = seedRecord("sms_review_queues", { userId: "user-1" });
    const draft = seedRecord("sms_review_draft_items", {
      userId: "user-1",
      queueId: queue.id,
      smsFingerprint: "fp-discard-race",
    });
    mockAssertExpectedCurrentUser
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("sms_review_draft_user_scope_changed"));

    await expect(
      discardAllSmsReviewDrafts("user-1", queue.id, [draft.id])
    ).rejects.toThrow("sms_review_draft_user_scope_changed");

    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("discards only the exact queue items included in confirmation", async () => {
    const queue = seedRecord("sms_review_queues", { userId: "user-1" });
    const confirmed = seedRecord("sms_review_draft_items", {
      userId: "user-1",
      queueId: queue.id,
      smsFingerprint: "fp-confirmed",
    });
    const appended = seedRecord("sms_review_draft_items", {
      userId: "user-1",
      queueId: queue.id,
      smsFingerprint: "fp-appended",
    });

    await expect(
      discardAllSmsReviewDrafts("user-1", queue.id, [confirmed.id])
    ).resolves.toBe(1);

    expect(mockCollections.get("sms_review_draft_items")?.records).toEqual([
      appended,
    ]);
    expect(mockCollections.get("sms_review_queues")?.records).toContain(queue);
    expect(
      mockCollections
        .get("dismissed_sms_fingerprints")
        ?.records.map((item) => item.smsFingerprint)
    ).toEqual(["fp-confirmed"]);
  });

  it("does not restore an undone draft after its fingerprint was saved", async () => {
    seedRecord("dismissed_sms_fingerprints", {
      userId: "user-1",
      smsFingerprint: "fp-saved-during-undo",
    });
    seedRecord("transactions", {
      userId: "user-1",
      smsFingerprint: "fp-saved-during-undo",
      deleted: false,
    });

    await restoreSmsReviewDraft({
      draftId: "draft-undo",
      queueId: "queue-undo",
      userId: "user-1",
      smsFingerprint: "fp-saved-during-undo",
      transaction: createTransaction("fp-saved-during-undo"),
      selectionOverride: true,
      position: 2,
      parsedAt: new Date("2026-07-27T12:00:00.000Z"),
      expiresAt: Date.now() + 5_000,
    });

    expect(mockCollections.get("sms_review_draft_items")?.records).toHaveLength(
      0
    );
    expect(
      mockCollections.get("dismissed_sms_fingerprints")?.records
    ).toHaveLength(0);
  });

  it("does not prepare an edit after the active user changes", async () => {
    const draft = seedRecord("sms_review_draft_items", {
      userId: "user-1",
      smsFingerprint: "fp-edit-race",
      payloadJson: "original-payload",
    });
    mockAssertExpectedCurrentUser
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("sms_review_draft_user_scope_changed"));

    await expect(
      updateSmsReviewDraftItem(
        draft.id,
        "user-1",
        createTransaction("fp-edit-race", 250)
      )
    ).rejects.toThrow("sms_review_draft_user_scope_changed");

    expect(draft.payloadJson).toBe("original-payload");
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("restores a cached draft edit when the adapter batch fails", async () => {
    const draft = seedRecord("sms_review_draft_items", {
      userId: "user-1",
      smsFingerprint: "fp-edit-failure",
      payloadJson: "original-payload",
    });
    mockBatch.mockRejectedValueOnce(new Error("adapter failed"));

    await expect(
      updateSmsReviewDraftItem(
        draft.id,
        "user-1",
        createTransaction("fp-edit-failure", 250)
      )
    ).rejects.toThrow("adapter failed");

    expect(draft.payloadJson).toBe("original-payload");
    expect(mockRestoreCachedModelSnapshot).toHaveBeenCalledTimes(1);
  });

  it("does not prepare a selection change after the active user changes", async () => {
    const draft = seedRecord("sms_review_draft_items", {
      userId: "user-1",
      smsFingerprint: "fp-selection-race",
      selectionOverride: null,
    });
    mockAssertExpectedCurrentUser
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("sms_review_draft_user_scope_changed"));

    await expect(
      updateSmsReviewDraftSelection(draft.id, "user-1", true)
    ).rejects.toThrow("sms_review_draft_user_scope_changed");

    expect(draft.selectionOverride).toBeNull();
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("restores a cached selection when the adapter batch fails", async () => {
    const draft = seedRecord("sms_review_draft_items", {
      userId: "user-1",
      smsFingerprint: "fp-selection-failure",
      selectionOverride: null,
    });
    mockBatch.mockRejectedValueOnce(new Error("adapter failed"));

    await expect(
      updateSmsReviewDraftSelection(draft.id, "user-1", true)
    ).rejects.toThrow("adapter failed");

    expect(draft.selectionOverride).toBeNull();
    expect(mockRestoreCachedModelSnapshot).toHaveBeenCalledTimes(1);
  });

  it("does not discard after the active user changes", async () => {
    await mergeSmsReviewDrafts({
      expectedUserId: "user-1",
      transactions: [createTransaction("fp-single-discard-race")],
    });
    const draft = mockCollections.get("sms_review_draft_items")?.records[0];
    if (!draft) throw new Error("Expected seeded draft");
    mockBatch.mockClear();
    mockAssertExpectedCurrentUser.mockClear();
    mockAssertExpectedCurrentUser
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("sms_review_draft_user_scope_changed"));

    await expect(
      discardSmsReviewDraft(draft.id, "user-1", Date.now() + 5_000)
    ).rejects.toThrow("sms_review_draft_user_scope_changed");

    expect(mockCollections.get("sms_review_draft_items")?.records).toContain(
      draft
    );
    expect(mockCollections.get("dismissed_sms_fingerprints")?.records).toEqual(
      []
    );
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("does not restore after the active user changes", async () => {
    const dismissed = seedRecord("dismissed_sms_fingerprints", {
      userId: "user-1",
      smsFingerprint: "fp-restore-race",
    });
    mockAssertExpectedCurrentUser
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("sms_review_draft_user_scope_changed"));

    await expect(
      restoreSmsReviewDraft({
        draftId: "draft-restore-race",
        queueId: "queue-restore-race",
        userId: "user-1",
        smsFingerprint: "fp-restore-race",
        transaction: createTransaction("fp-restore-race"),
        selectionOverride: null,
        position: 0,
        parsedAt: new Date("2026-07-27T12:00:00.000Z"),
        expiresAt: Date.now() + 5_000,
      })
    ).rejects.toThrow("sms_review_draft_user_scope_changed");

    expect(
      mockCollections.get("dismissed_sms_fingerprints")?.records
    ).toContain(dismissed);
    expect(mockCollections.get("sms_review_draft_items")?.records).toEqual([]);
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("deletes the final malformed draft and its queue in one batch", async () => {
    const queue = seedRecord("sms_review_queues", { userId: "user-1" });
    seedRecord("sms_review_draft_items", {
      userId: "user-1",
      queueId: queue.id,
      smsFingerprint: "fp-malformed-final",
      payloadJson: "malformed-json",
    });

    await expect(getSmsReviewDraftQueueSnapshot("user-1")).resolves.toBeNull();

    expect(mockBatch).toHaveBeenCalledTimes(1);
    expect(mockBatch.mock.calls[0]?.[0]).toHaveLength(2);
    expect(mockCollections.get("sms_review_queues")?.records).toEqual([]);
    expect(mockCollections.get("sms_review_draft_items")?.records).toEqual([]);
  });

  it("deletes the final expired draft and its queue in one batch", async () => {
    const queue = seedRecord("sms_review_queues", { userId: "user-1" });
    seedRecord("sms_review_draft_items", {
      userId: "user-1",
      queueId: queue.id,
      smsFingerprint: "fp-expired-final",
      parsedAt: new Date("2026-06-01T12:00:00.000Z"),
    });

    await expect(
      deleteExpiredSmsReviewDrafts(
        "user-1",
        new Date("2026-07-01T12:00:00.000Z")
      )
    ).resolves.toBe(1);

    expect(mockBatch).toHaveBeenCalledTimes(1);
    expect(mockBatch.mock.calls[0]?.[0]).toHaveLength(2);
    expect(mockCollections.get("sms_review_queues")?.records).toEqual([]);
    expect(mockCollections.get("sms_review_draft_items")?.records).toEqual([]);
  });

  it("cancels expiry cleanup at its final commit boundary", async () => {
    const controller = new AbortController();
    const queue = seedRecord("sms_review_queues", { userId: "user-1" });
    const draft = seedRecord("sms_review_draft_items", {
      userId: "user-1",
      queueId: queue.id,
      smsFingerprint: "fp-expiry-cancelled",
      parsedAt: new Date("2026-06-01T12:00:00.000Z"),
    });
    let assertionCount = 0;
    mockAssertExpectedCurrentUser.mockImplementation((): Promise<void> => {
      assertionCount += 1;
      if (assertionCount === 2) controller.abort();
      return Promise.resolve();
    });

    await expect(
      deleteExpiredSmsReviewDrafts(
        "user-1",
        new Date("2026-07-01T12:00:00.000Z"),
        controller.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(mockCollections.get("sms_review_draft_items")?.records).toContain(
      draft
    );
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("reads handled metadata without decoding payload JSON", async () => {
    seedRecord("sms_review_draft_items", {
      userId: "user-1",
      smsFingerprint: "fp-active",
      payloadJson: "malformed-json",
    });
    seedRecord("dismissed_sms_fingerprints", {
      userId: "user-1",
      smsFingerprint: "fp-dismissed",
    });

    await expect(getSmsReviewDraftCount()).resolves.toBe(1);
    await expect(getHandledSmsReviewFingerprints("user-1")).resolves.toEqual(
      new Set(["fp-active", "fp-dismissed"])
    );
  });

  it("rejects handled fingerprint reads when the requested user is not active", async () => {
    await expect(getHandledSmsReviewFingerprints("user-2")).rejects.toThrow(
      "sms_review_draft_user_scope_changed"
    );
  });

  it("does not delete a malformed draft that is repaired before cleanup commits", async () => {
    await mergeSmsReviewDrafts({
      expectedUserId: "user-1",
      transactions: [createTransaction("fp-repaired")],
    });
    const draft = mockCollections.get("sms_review_draft_items")?.records[0];
    if (!draft) throw new Error("Expected seeded draft");
    const validPayload = draft.payloadJson;
    draft.payloadJson = "malformed-json";
    let assertionCount = 0;
    mockAssertExpectedCurrentUser.mockImplementation(
      (expectedUserId: string): Promise<void> => {
        assertionCount += 1;
        if (assertionCount === 4) draft.payloadJson = validPayload;
        return expectedUserId === mockCurrentUserId
          ? Promise.resolve()
          : Promise.reject(new Error("sms_review_draft_user_scope_changed"));
      }
    );

    await expect(getSmsReviewDraftQueueSnapshot("user-1")).resolves.toBeNull();

    expect(mockCollections.get("sms_review_draft_items")?.records).toContain(
      draft
    );
  });

  it("fails closed before writing for a foreign user", async () => {
    await expect(
      mergeSmsReviewDrafts({
        expectedUserId: "user-2",
        transactions: [createTransaction("fp-new")],
      })
    ).rejects.toThrow("sms_review_draft_user_scope_changed");
    expect(mockBatch).not.toHaveBeenCalled();
  });
});
