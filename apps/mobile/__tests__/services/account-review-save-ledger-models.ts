/**
 * #395 T043 isolated real WatermelonDB model registry.
 * Import this before fixture/services in Jest's @monyvi/db mock factory.
 * No app services, save fixtures, database singleton or circular test harness.
 */
import type { Model } from "@nozbe/watermelondb";
import { Account } from "../../../../packages/db/src/models/Account";
import { AccountFinancialEffect } from "../../../../packages/db/src/models/AccountFinancialEffect";
import { AccountSmsSender } from "../../../../packages/db/src/models/AccountSmsSender";
import { BankDetails } from "../../../../packages/db/src/models/BankDetails";
import { Category } from "../../../../packages/db/src/models/Category";
import { FinancialActionGroup } from "../../../../packages/db/src/models/FinancialActionGroup";
import { Transaction } from "../../../../packages/db/src/models/Transaction";
import { Transfer } from "../../../../packages/db/src/models/Transfer";
import { SmsReviewQueue } from "../../../../packages/db/src/models/SmsReviewQueue";
import { SmsReviewDraftItem } from "../../../../packages/db/src/models/SmsReviewDraftItem";
import { DismissedSmsFingerprint } from "../../../../packages/db/src/models/DismissedSmsFingerprint";

export {
  Account,
  AccountFinancialEffect,
  AccountSmsSender,
  BankDetails,
  Category,
  FinancialActionGroup,
  Transaction,
  Transfer,
  SmsReviewQueue,
  SmsReviewDraftItem,
  DismissedSmsFingerprint,
};

export const LEDGER_MODEL_CLASSES: Array<typeof Model> = [
  Account,
  AccountFinancialEffect,
  AccountSmsSender,
  BankDetails,
  Category,
  FinancialActionGroup,
  Transaction,
  Transfer,
  SmsReviewQueue,
  SmsReviewDraftItem,
  DismissedSmsFingerprint,
];
