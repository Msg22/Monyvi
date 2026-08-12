import {
  database,
  DismissedSmsFingerprint,
  SmsReviewDraftItem,
  Transaction,
  Transfer,
} from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";

import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";

export async function getDurablyHandledSmsReviewFingerprints(
  expectedUserId: string
): Promise<ReadonlySet<string>> {
  await assertExpectedCurrentUser(expectedUserId);
  const scope = await getCurrentUserDataScope();
  await assertExpectedCurrentUser(expectedUserId);

  const [activeDrafts, dismissed, transactions, transfers] = await Promise.all([
    scope
      .queryOwned(database.get<SmsReviewDraftItem>("sms_review_draft_items"))
      .fetch(),
    scope
      .queryOwned(
        database.get<DismissedSmsFingerprint>("dismissed_sms_fingerprints")
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<Transaction>("transactions"),
        Q.where("deleted", false)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<Transfer>("transfers"),
        Q.where("deleted", false)
      )
      .fetch(),
  ]);
  await assertExpectedCurrentUser(expectedUserId);

  return new Set([
    ...activeDrafts.map((record) => record.smsFingerprint),
    ...dismissed.map((record) => record.smsFingerprint),
    ...transactions.flatMap((record) =>
      record.smsFingerprint ? [record.smsFingerprint] : []
    ),
    ...transfers.flatMap((record) =>
      record.smsFingerprint ? [record.smsFingerprint] : []
    ),
  ]);
}

export async function getSavedSmsReviewFingerprints(
  expectedUserId: string
): Promise<ReadonlySet<string>> {
  await assertExpectedCurrentUser(expectedUserId);
  const scope = await getCurrentUserDataScope();
  const [transactions, transfers] = await Promise.all([
    scope
      .queryOwned(
        database.get<Transaction>("transactions"),
        Q.where("deleted", false)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<Transfer>("transfers"),
        Q.where("deleted", false)
      )
      .fetch(),
  ]);
  await assertExpectedCurrentUser(expectedUserId);

  return new Set(
    [...transactions, ...transfers].flatMap((record) =>
      record.smsFingerprint ? [record.smsFingerprint] : []
    )
  );
}
