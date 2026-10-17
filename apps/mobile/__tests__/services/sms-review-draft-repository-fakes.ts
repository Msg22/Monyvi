/** SMS repository unit harness. Physical SQLite reads are deliberately
 * limited to the six exact queries used by the real L4 prune proof.
 * Column metadata comes from the actual versioned Watermelon schema.
 */
import type { ParsedSmsTransaction } from "@monyvi/logic";
import { schema } from "../../../../packages/db/src/schema";

export interface QueryCondition {
  readonly kind: "where" | "sort";
  readonly column: string;
  readonly value: unknown;
}
export interface UnsafeSqlCondition {
  readonly kind: "unsafe_sql";
  readonly sql: string;
  readonly args: readonly unknown[];
}
type Condition = QueryCondition | UnsafeSqlCondition;

export interface FakeQuery {
  readonly fetch: () => Promise<FakeRecord[]>;
  readonly fetchCount: () => Promise<number>;
  readonly observe: () => null;
  readonly unsafeFetchRaw: () => Promise<
    Array<Readonly<Record<string, unknown>>>
  >;
}

function propertyName(column: string): string {
  return column.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase()
  );
}

/** Hydrated and raw model views are sourced from the SAME stored fields.
 * The raw image is schema-exact; no full-row foreign data is invented.
 */
export class FakeRecord {
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
  public createdAt = new Date(0);
  public updatedAt = new Date(0);
  public deleted = false;
  public operation: "create" | "update" | "destroy" = "create";

  public get _preparedState(): null {
    return null;
  }

  public get _raw(): Readonly<Record<string, unknown>> {
    const tableSchema = schema.tables[this.table];
    const raw: Record<string, unknown> = {
      id: this.id,
      _status:
        this.operation === "destroy"
          ? "deleted"
          : this.operation === "create"
            ? "created"
            : "updated",
      _changed: "",
    };
    if (!tableSchema) return raw;
    for (const column of tableSchema.columnArray) {
      const source: unknown = Reflect.get(this, propertyName(column.name));
      const value = source instanceof Date ? source.getTime() : source;
      if (value === undefined) {
        if (!column.isOptional) {
          throw new Error(
            "Missing required fake column " + this.table + "." + column.name
          );
        }
        raw[column.name] = null;
      } else {
        raw[column.name] =
          column.type === "boolean" && value !== null ? (value ? 1 : 0) : value;
      }
    }
    return raw;
  }

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

/** Do not broaden this to a mock SQL interpreter: unexpected SQL is a test
 * failure, not permission to return [] and skip an authority check.
 */
function sqlRows(
  table: string,
  records: readonly FakeRecord[],
  sql: UnsafeSqlCondition
): ReadonlyArray<Readonly<Record<string, unknown>>> {
  const a = sql.args;
  const match = (expectedTable: string, count: number): void => {
    if (
      table !== expectedTable ||
      a.length !== count ||
      a.some((value) => typeof value !== "string")
    ) {
      throw new Error("Invalid scoped physical SQL arguments: " + sql.sql);
    }
  };
  const id = (record: FakeRecord): Readonly<Record<string, unknown>> => ({
    id: record.id,
  });
  let found: readonly FakeRecord[];
  let projection: (record: FakeRecord) => Readonly<Record<string, unknown>> =
    id;
  switch (sql.sql) {
    case 'select "id", "user_id" from "sms_review_queues" where "id" = ?':
      match("sms_review_queues", 1);
      found = records.filter((record) => record.id === a[0]);
      projection = (record) => ({ id: record.id, user_id: record.userId });
      break;
    case 'select * from "sms_review_queues" where "id" = ? and "user_id" = ?':
      match("sms_review_queues", 2);
      found = records.filter(
        (record) => record.id === a[0] && record.userId === a[1]
      );
      projection = (record) => record._raw;
      break;
    case 'select * from "sms_review_draft_items" where "queue_id" = ? and "user_id" = ?':
      match("sms_review_draft_items", 2);
      found = records.filter(
        (record) => record.queueId === a[0] && record.userId === a[1]
      );
      projection = (record) => record._raw;
      break;
    case 'select "id" from "sms_review_queues" where "id" = ? and "user_id" is not ? limit 1':
      match("sms_review_queues", 2);
      found = records
        .filter((record) => record.id === a[0] && record.userId !== a[1])
        .slice(0, 1);
      break;
    case 'select "id" from "sms_review_draft_items" where "queue_id" = ? and "user_id" is not ? limit 1':
      match("sms_review_draft_items", 2);
      found = records
        .filter((record) => record.queueId === a[0] && record.userId !== a[1])
        .slice(0, 1);
      break;
    case 'select "id" from "sms_review_draft_items" where "id" = ? and ("queue_id" is not ? or "user_id" is not ?) limit 1':
      match("sms_review_draft_items", 3);
      found = records
        .filter(
          (record) =>
            record.id === a[0] &&
            (record.queueId !== a[1] || record.userId !== a[2])
        )
        .slice(0, 1);
      break;
    default:
      throw new Error("Unsupported physical SMS SQL: " + sql.sql);
  }
  return found.map(projection);
}

export class FakeCollection {
  public constructor(public readonly table: string) {}
  public records: FakeRecord[] = [];
  private nextId = 1;

  public find(id: string): Promise<FakeRecord> {
    const row = this.records.find((candidate) => candidate.id === id);
    return row
      ? Promise.resolve(row)
      : Promise.reject(new Error("Missing record " + this.table + ":" + id));
  }

  public query(...conditions: readonly Condition[]): FakeQuery {
    const unsafe = conditions.filter(
      (condition): condition is UnsafeSqlCondition =>
        condition.kind === "unsafe_sql"
    );
    const physicalSql = unsafe[0];
    if (physicalSql && (conditions.length !== 1 || unsafe.length !== 1)) {
      throw new Error("Physical SQL must be its sole scoped query clause");
    }
    const read = (): FakeRecord[] => {
      if (physicalSql) {
        // Validate its exact table, args, and statement before any read.
        const matching = sqlRows(this.table, this.records, physicalSql);
        const ids = new Set(matching.map((record) => record.id));
        return this.records.filter((record) => ids.has(record.id));
      }
      let result = [...this.records];
      for (const condition of conditions) {
        if (condition.kind !== "where") continue;
        result = result.filter((record) => {
          const actual: unknown = Reflect.get(
            record,
            propertyName(condition.column)
          );
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
      return result;
    };
    return {
      fetch: (): Promise<FakeRecord[]> => Promise.resolve(read()),
      fetchCount: (): Promise<number> => Promise.resolve(read().length),
      observe: (): null => null,
      unsafeFetchRaw: (): Promise<Array<Readonly<Record<string, unknown>>>> =>
        Promise.resolve(
          physicalSql
            ? [...sqlRows(this.table, this.records, physicalSql)]
            : read().map((record) => record._raw)
        ),
    };
  }

  public prepareCreate(updater: (record: FakeRecord) => void): FakeRecord {
    const record = new FakeRecord(this.table, this.table + "-" + this.nextId++);
    updater(record);
    return record;
  }
}

export const mockCollections = new Map<string, FakeCollection>();
export const mockBatch = jest.fn(
  (operations: readonly FakeRecord[]): Promise<void> => {
    for (const operation of operations) {
      const collection = mockCollections.get(operation.table);
      if (!collection) throw new Error("Missing collection " + operation.table);
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
export const fakeDatabase = {
  get: (table: string): FakeCollection => {
    const collection = mockCollections.get(table);
    if (!collection) throw new Error("Missing collection " + table);
    return collection;
  },
  write: <T>(action: () => Promise<T>): Promise<T> => action(),
  batch: (operations: readonly FakeRecord[]): Promise<void> =>
    mockBatch(operations),
  adapter: { schema },
};

/** Fresh unit database: real owner/financial-root lifecycle has no historical
 * actions until the individual test explicitly inserts them.
 */
export function resetFakeCollections(): void {
  mockCollections.clear();
  for (const table of [
    "sms_review_queues",
    "sms_review_draft_items",
    "dismissed_sms_fingerprints",
    "transactions",
    "transfers",
    "financial_action_groups",
  ]) {
    mockCollections.set(table, new FakeCollection(table));
  }
}

export function seedRecord(
  table: string,
  values: Partial<FakeRecord>
): FakeRecord {
  const collection = mockCollections.get(table);
  if (!collection) throw new Error("Missing collection " + table);
  const record = new FakeRecord(
    table,
    table + "-seed-" + collection.records.length
  );
  Object.assign(record, values, { operation: "update" });
  collection.records.push(record);
  return record;
}

export function createTransaction(
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
