import type { ParsedSmsTransaction } from "@monyvi/logic";

import {
  getHandledSmsReviewFingerprints,
  getSmsReviewDraftCount,
  mergeSmsReviewDrafts,
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

  public query(...conditions: readonly QueryCondition[]): FakeQuery {
    const fetchRecords = (): FakeRecord[] => {
      let result = [...this.records];
      for (const condition of conditions) {
        if (condition.kind === "where") {
          const property = toPropertyName(condition.column);
          result = result.filter(
            (record) => record[property as keyof FakeRecord] === condition.value
          );
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

const mockCollections = new Map<string, FakeCollection>();
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
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    asc: "asc",
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
  assertExpectedCurrentUser: (expectedUserId: string): Promise<void> => {
    if (expectedUserId !== mockCurrentUserId) {
      return Promise.reject(new Error("sms_review_draft_user_scope_changed"));
    }
    return Promise.resolve();
  },
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
    mockCurrentUserId = "user-1";
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
    expect(result).toEqual({ insertedCount: 1, existingCount: 2 });
    expect(queues).toHaveLength(1);
    expect(items.map((item) => item.smsFingerprint)).toEqual(["fp-new"]);
    expect(items.map((item) => item.position)).toEqual([0]);
    expect(mockBatch).toHaveBeenCalledTimes(1);
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
    expect(result).toEqual({ insertedCount: 1, existingCount: 1 });
    expect(
      items.find((item) => item.smsFingerprint === "fp-existing")?.payloadJson
    ).toBe("edited-payload");
    expect(
      items.find((item) => item.smsFingerprint === "fp-next")?.position
    ).toBe(5);
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
    await expect(getHandledSmsReviewFingerprints()).resolves.toEqual(
      new Set(["fp-active", "fp-dismissed"])
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
