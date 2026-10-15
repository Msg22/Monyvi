/**
 * Real SQLite records corresponding exactly to the captured T010 review
 * context. The synthetic context intentionally has no sender/card children:
 * BankDetails and AccountSmsSender models are registered by each harness, but
 * no invented evidence is seeded into their tables.
 */
import type { Database } from "@nozbe/watermelondb";
import type { Account, Category, Profile } from "@monyvi/db";
import {
  makeOwnedContext,
  NORMALIZATION_IDS,
} from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";

export async function seedCapturedSmsReviewContext(
  database: Database,
  ownerId: string
): Promise<void> {
  const captured = makeOwnedContext();
  if (captured.ownerId !== ownerId) {
    throw new Error("Synthetic captured SMS context has another owner");
  }
  const now = new Date("2026-10-14T12:00:00.000Z");
  await database.write(async (): Promise<void> => {
    const profile = database.get<Profile>("profiles").prepareCreate((record) => {
      record.userId = ownerId;
      record.preferredCurrency = captured.preferredCurrency;
      record.preferredLanguage = "en";
      record.theme = "SYSTEM";
      record.deleted = false;
      record.onboardingCompleted = true;
      record.setupGuideCompleted = true;
      record.smsDetectionEnabled = true;
      record.updatedAt = now;
    });
    const accounts = captured.accounts.map((account) =>
      database.get<Account>("accounts").prepareCreate((record) => {
        record._raw.id = account.id;
        record.userId = ownerId;
        record.name = account.name;
        record.type = account.type;
        record.currency = account.currency;
        record.institutionId = account.institutionId ?? undefined;
        record.providerDisplayName = account.providerDisplayName ?? undefined;
        record.balance = 0;
        record.financialRevision = "0";
        record.deleted = false;
        record.isDefault = account.isDefault;
        record.updatedAt = now;
      })
    );
    const category = database.get<Category>("categories").prepareCreate(
      (record) => {
        record._raw.id = NORMALIZATION_IDS.shoppingCategory;
        record.displayName = "Shopping";
        record.systemName = "shopping";
        record.icon = "cart-outline";
        record.iconLibrary = "Ionicons";
        record.type = "EXPENSE";
        record.level = 1;
        record.isSystem = true;
        record.isInternal = false;
        record.isHidden = false;
        record.usageCount = 0;
        record.deleted = false;
        record.updatedAt = now;
      }
    );
    await database.batch(profile, ...accounts, category);
  });
}
