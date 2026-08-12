import { database, type Transaction, type Transfer } from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
  USER_DATA_ACCESS_ERROR_CODES,
} from "./user-data-access";

/**
 * Check whether an SMS has already produced a transaction or transfer.
 */
export async function hasExistingSmsFingerprint(
  smsFingerprint: string,
  expectedUserId?: string
): Promise<boolean> {
  if (expectedUserId !== undefined) {
    await assertExpectedCurrentUser(expectedUserId);
  }
  const scope = await getCurrentUserDataScope();
  if (expectedUserId !== undefined && scope.userId !== expectedUserId) {
    throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
  }

  const [transactionCount, transferCount] = await Promise.all([
    scope
      .queryOwned(
        database.get<Transaction>("transactions"),
        Q.where("sms_fingerprint", smsFingerprint),
        Q.where("deleted", Q.notEq(true))
      )
      .fetchCount(),
    scope
      .queryOwned(
        database.get<Transfer>("transfers"),
        Q.where("sms_fingerprint", smsFingerprint),
        Q.where("deleted", Q.notEq(true))
      )
      .fetchCount(),
  ]);
  if (expectedUserId !== undefined) {
    await assertExpectedCurrentUser(expectedUserId);
  }

  return transactionCount > 0 || transferCount > 0;
}
