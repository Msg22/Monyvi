/** Real records matching pinned T010 context; no invented sender/card evidence. */
import type { CategoryTreeSource } from "@monyvi/logic";
import type { Database } from "@nozbe/watermelondb";
import type { Account, Category, Profile } from "@monyvi/db";
import {
  makeOwnedContext,
  NORMALIZATION_IDS,
} from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";

type CapturedContext = ReturnType<typeof makeOwnedContext>;

export const SMS_REVIEW_OTHER_CATEGORY_ID =
  "00000000-0000-4000-8000-000000000206";

/** Real fallback category: shared by parser context and owned SQLite fixtures. */
export function smsReviewFixtureCategories(): readonly CategoryTreeSource[] {
  return [
    {
      id: NORMALIZATION_IDS.shoppingCategory,
      systemName: "shopping",
      displayName: "Shopping",
      level: 1,
      type: "EXPENSE",
      isSystem: true,
    },
    {
      id: SMS_REVIEW_OTHER_CATEGORY_ID,
      systemName: "other",
      displayName: "Other",
      level: 1,
      type: "EXPENSE",
      isSystem: true,
    },
  ];
}

function prepareProfile(
  database: Database,
  captured: CapturedContext,
  now: Date
): Profile {
  return database.get<Profile>("profiles").prepareCreate((record): void => {
    record.userId = captured.ownerId;
    record.preferredCurrency = captured.preferredCurrency;
    record.preferredLanguage = "en";
    record.theme = "SYSTEM";
    record.deleted = false;
    record.onboardingCompleted = true;
    record.setupGuideCompleted = true;
    record.smsDetectionEnabled = true;
    record.updatedAt = now;
  });
}

function prepareAccounts(
  database: Database,
  captured: CapturedContext,
  now: Date
): Account[] {
  return captured.accounts.map((account) =>
    database.get<Account>("accounts").prepareCreate((record): void => {
      record._raw.id = account.id;
      record.userId = captured.ownerId;
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
}

function prepareCategory(
  database: Database,
  category: CategoryTreeSource,
  now: Date
): Category {
  return database.get<Category>("categories").prepareCreate((record): void => {
    record._raw.id = category.id;
    record.displayName = category.displayName;
    record.systemName = category.systemName;
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
  });
}

export async function seedCapturedSmsReviewContext(
  database: Database,
  ownerId: string
): Promise<void> {
  const captured = makeOwnedContext();
  if (captured.ownerId !== ownerId)
    throw new Error("Synthetic captured SMS context has another owner");
  const now = new Date("2026-10-14T12:00:00.000Z");
  await database.write(async (): Promise<void> => {
    await database.batch(
      prepareProfile(database, captured, now),
      ...prepareAccounts(database, captured, now),
      ...smsReviewFixtureCategories().map((category) =>
        prepareCategory(database, category, now)
      )
    );
  });
}
