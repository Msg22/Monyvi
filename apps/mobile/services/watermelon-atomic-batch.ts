import type { Model } from "@nozbe/watermelondb";
import type { CollectionChangeSet } from "@nozbe/watermelondb/Collection";
import type { TableName } from "@nozbe/watermelondb/Schema";
import { database } from "@monyvi/db";
import { logger } from "@/utils/logger";

type DatabaseChanges = Array<[TableName<Model>, CollectionChangeSet<Model>]>;

type DatabaseSubscriber = [Array<TableName<Model>>, () => void, unknown];

interface NotificationDatabaseAccess {
  _notify?: (changes: DatabaseChanges) => void;
  _subscribers?: DatabaseSubscriber[];
}

function capturePreparedChanges(operations: readonly Model[]): DatabaseChanges {
  const changesByTable = new Map<
    TableName<Model>,
    CollectionChangeSet<Model>
  >();

  for (const record of operations) {
    const preparedState = record._preparedState;
    let changeType: "created" | "updated" | "destroyed";
    if (preparedState === "create") {
      changeType = "created";
    } else if (preparedState === "update") {
      changeType = "updated";
    } else if (
      preparedState === "markAsDeleted" ||
      preparedState === "destroyPermanently"
    ) {
      changeType = "destroyed";
    } else {
      throw new Error("Expected a prepared WatermelonDB operation");
    }

    const tableChanges = changesByTable.get(record.table) ?? [];
    tableChanges.push({ record, type: changeType });
    changesByTable.set(record.table, tableChanges);
  }

  return [...changesByTable.entries()];
}

function runNotificationSafely(callback: () => void): void {
  try {
    callback();
  } catch (error) {
    logger.error(
      "WatermelonDB subscriber failed during committed change replay",
      error
    );
  }
}

function notifyRecordSubscribers(record: Model, isDeleted: boolean): void {
  runNotificationSafely(() => {
    if (isDeleted) {
      record._getChanges().complete();
    } else {
      record._getChanges().next(record);
    }
  });

  for (const [subscriber] of [...record._subscribers]) {
    runNotificationSafely(() => subscriber(isDeleted));
  }
}

function publishCommittedChanges(
  changes: DatabaseChanges,
  notificationDatabase: NotificationDatabaseAccess
): void {
  const affectedTables = new Set(changes.map(([table]) => table));
  for (const [tables, subscriber] of [
    ...(notificationDatabase._subscribers ?? []),
  ]) {
    if (tables.some((table) => affectedTables.has(table))) {
      runNotificationSafely(subscriber);
    }
  }

  for (const [table, changeSet] of changes) {
    const collection = database.get<Model>(table);
    for (const [subscriber] of [...collection._subscribers]) {
      runNotificationSafely(() => subscriber(changeSet));
    }
    runNotificationSafely(() => collection.changes.next(changeSet));

    for (const { record, type } of changeSet) {
      if (type === "updated" || type === "destroyed") {
        notifyRecordSubscribers(record, type === "destroyed");
      }
    }
  }
}

function reconcileCommittedChanges(
  changes: DatabaseChanges,
  notificationDatabase: NotificationDatabaseAccess
): void {
  for (const [table, changeSet] of changes) {
    runNotificationSafely(() => {
      database.get<Model>(table)._applyChangesToCache(changeSet);
    });
  }
  publishCommittedChanges(changes, notificationDatabase);
}

/**
 * Commits prepared WatermelonDB models while preserving the adapter boundary.
 * WatermelonDB publishes cache changes and observer notifications after the
 * adapter transaction commits, so those post-commit failures must not be
 * exposed as retryable persistence failures.
 */
export async function commitPreparedBatch(
  operations: readonly Model[]
): Promise<void> {
  const adapter = database.adapter;
  const notificationDatabase = database as typeof database &
    NotificationDatabaseAccess;
  // Keep original method identities so shared WatermelonDB state is restored.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalAdapterBatch = adapter.batch;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalDatabaseNotify = notificationDatabase._notify;
  const preparedChanges = originalDatabaseNotify
    ? capturePreparedChanges(operations)
    : [];
  let hasAdapterCommitted = false;

  adapter.batch = async (batchOperations): Promise<void> => {
    await originalAdapterBatch.call(adapter, batchOperations);
    hasAdapterCommitted = true;
  };
  if (originalDatabaseNotify) {
    notificationDatabase._notify = (changes): void => {
      try {
        originalDatabaseNotify.call(database, changes);
      } catch (error) {
        logger.error(
          "WatermelonDB notification failed after adapter commit",
          error
        );
        publishCommittedChanges(changes, notificationDatabase);
      }
    };
  }

  try {
    await database.batch([...operations]);
  } catch (error) {
    if (!hasAdapterCommitted) {
      throw error;
    }

    logger.error(
      "WatermelonDB cache publication failed after adapter commit",
      error
    );
    if (originalDatabaseNotify) {
      reconcileCommittedChanges(preparedChanges, notificationDatabase);
    }
  } finally {
    adapter.batch = originalAdapterBatch;
    if (originalDatabaseNotify) {
      notificationDatabase._notify = originalDatabaseNotify;
    }
  }
}
