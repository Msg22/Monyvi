/**
 * WatermelonDB Database Configuration
 * Complete database setup with all models
 */

import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";

// Import all models
import { Account } from "./models/Account";
import { AccountSmsSender } from "./models/AccountSmsSender";
import { Asset } from "./models/Asset";
import { AssetMetal } from "./models/AssetMetal";
import { BankDetails } from "./models/BankDetails";
import { Budget } from "./models/Budget";
import { Category } from "./models/Category";
import { DailySnapshotAssets } from "./models/DailySnapshotAssets";
import { DailySnapshotBalance } from "./models/DailySnapshotBalance";
import { DailySnapshotNetWorth } from "./models/DailySnapshotNetWorth";
import { DismissedSmsFingerprint } from "./models/DismissedSmsFingerprint";
import { Debt } from "./models/Debt";
import { FinancialActionGroup } from "./models/FinancialActionGroup";
import { MarketRate } from "./models/MarketRate";
import { MarketRateObservation } from "./models/MarketRateObservation";
import { MetalActionEvidence } from "./models/MetalActionEvidence";
import { MetalHoldingState } from "./models/MetalHoldingState";
import { MetalLifecycleEvent } from "./models/MetalLifecycleEvent";
import { MetalRateReference } from "./models/MetalRateReference";
import { Profile } from "./models/Profile";
import { RecurringPayment } from "./models/RecurringPayment";
import { SmsAiNegativeOutcome } from "./models/SmsAiNegativeOutcome";
import { SmsReviewDraftItem } from "./models/SmsReviewDraftItem";
import { SmsReviewQueue } from "./models/SmsReviewQueue";
import { Transaction } from "./models/Transaction";
import { Transfer } from "./models/Transfer";
import { UserCategorySettings } from "./models/UserCategorySettings";
import { migrations } from "./migrations";
import { schema } from "./schema";

// =============================================================================
// UUID Generator for Supabase Compatibility
// =============================================================================

/**
 * Generate UUID v4 strings for database IDs
 * Supabase requires UUID format, so we override WatermelonDB's default
 */
function getHighResolutionTime(): number {
  const performanceLike = globalThis as {
    readonly performance?: { readonly now?: () => number };
  };

  return performanceLike.performance?.now?.() ?? 0;
}

function generateUUID(): string {
  let d = new Date().getTime();
  let d2 = getHighResolutionTime() * 1000;

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    let r = Math.random() * 16;

    if (d > 0) {
      // eslint-disable-next-line no-bitwise
      r = ((d + r) % 16) | 0;
      d = Math.floor(d / 16);
    } else {
      // eslint-disable-next-line no-bitwise
      r = ((d2 + r) % 16) | 0;
      d2 = Math.floor(d2 / 16);
    }

    // eslint-disable-next-line no-bitwise
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Set the global ID generator BEFORE creating the database
setGenerator(generateUUID);

// TODO: WatermelonDB 0.28 does not support React Native Bridgeless Mode, which
// is enabled via `newArchEnabled: true` in apps/mobile/app.json. At runtime the
// JSI adapter cannot attach and WatermelonDB silently falls back to the slower
// async bridge path — you'll see this warning in logcat:
//   [🍉] JSI SQLiteAdapter not available… falling back to asynchronous operation
// The `jsi: true` we pass below is therefore aspirational, not effective, and
// the try/catch fallback below never runs (construction succeeds; the fallback
// happens deeper inside WatermelonDB). Revisit when any of these land:
//   1. WatermelonDB releases a version with bridgeless support
//      (tracking: https://github.com/Nozbe/WatermelonDB/issues/1769)
//   2. We decide to turn off the new architecture (newArchEnabled: false)
// Impact: DB reads/writes go through the async bridge instead of synchronous
// JSI — functionally correct, but noticeably slower on list-heavy screens.
let adapter: SQLiteAdapter;
try {
  adapter = new SQLiteAdapter({
    schema,
    migrations,
    jsi: true,
    onSetUpError: (error) => console.error("Database setup error:", error),
  });
} catch (error) {
  console.error("Failed to create SQLite adapter:", error);
  adapter = new SQLiteAdapter({
    schema,
    migrations,
    jsi: false,
    onSetUpError: (error) => console.error("Database setup error:", error),
  });
}

export const database = new Database({
  adapter,
  modelClasses: [
    Profile,
    Account,
    AccountSmsSender,
    BankDetails,
    Asset,
    AssetMetal,
    Category,
    UserCategorySettings,
    Debt,
    FinancialActionGroup,
    MetalActionEvidence,
    MetalHoldingState,
    MetalLifecycleEvent,
    MetalRateReference,
    RecurringPayment,
    SmsAiNegativeOutcome,
    SmsReviewQueue,
    SmsReviewDraftItem,
    DismissedSmsFingerprint,
    Transaction,
    Transfer,
    Budget,
    MarketRate,
    MarketRateObservation,
    DailySnapshotAssets,
    DailySnapshotBalance,
    DailySnapshotNetWorth,
  ],
});
