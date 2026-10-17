/**
 * T007 setup-only adapter: actual WatermelonDB models, native Node SQLite
 * dispatcher and an owned queue with the fixture's canonical session UUID.
 * This file owns no parser, normalizer, or review writer mock.
 */
import type { Database } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type { SmsReviewQueue } from "@monyvi/db";
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";
import { randomUUID } from "node:crypto";
import { REVIEW_WIRE_IDS } from "../../../../packages/logic/src/account-review/__tests__/fixtures";
import { PARSER_TEST_SMS_SESSION_ID } from "./account-review-parser-test-fixtures";
import { invalidateSmsReviewNamespace } from "@/services/sms-review-namespace-state";

interface T007Database {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
}

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);

jest.mock("@monyvi/db", () => {
  const actual = jest.requireActual<
    typeof import("./sms-review-sqlite-test-database")
  >("./sms-review-sqlite-test-database");
  return actual.createSmsReviewSqliteTestDatabase();
});

const { database, __adapter: adapter } =
  jest.requireMock<T007Database>("@monyvi/db");

async function seedOwnedQueue(): Promise<void> {
  await database.write(async (): Promise<void> => {
    await database.get<SmsReviewQueue>("sms_review_queues").create((queue) => {
      queue._raw.id = PARSER_TEST_SMS_SESSION_ID;
      queue.userId = REVIEW_WIRE_IDS.ownerId;
      queue.updatedAt = new Date("2026-10-14T12:00:00.000Z");
    });
  });
}

/** T007 test bodies remain byte-identical; only setup installs real SQLite. */
export function installT007SmsReviewSqliteHooks(): void {
  beforeAll(async (): Promise<void> => {
    setGenerator(() => randomUUID());
    await adapter.initializingPromise;
  });
  beforeEach(async (): Promise<void> => {
    invalidateSmsReviewNamespace(
      REVIEW_WIRE_IDS.ownerId,
      PARSER_TEST_SMS_SESSION_ID
    );
    await database.write(async (): Promise<void> => {
      await database.unsafeResetDatabase();
    });
    await seedOwnedQueue();
  });
  afterEach((): void => {
    invalidateSmsReviewNamespace(
      REVIEW_WIRE_IDS.ownerId,
      PARSER_TEST_SMS_SESSION_ID
    );
  });
}
