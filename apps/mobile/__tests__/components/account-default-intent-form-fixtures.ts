/**
 * #395 T065 test-only real Watermelon/SQLite account form fixture.
 * No financial DTO, UI facade implementation, source screen mocks or cast.
 */
import { Database, type Model } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { schema } from "../../../../packages/db/src/schema";
import { Profile } from "../../../../packages/db/src/models/Profile";
import {
  Account,
  AccountSmsSender,
  BankDetails,
  LEDGER_MODEL_CLASSES,
} from "../services/account-review-save-ledger-models";

export const DEFAULT_FORM_OWNER = "018f0c7a-1234-4abc-8def-000000000001";
export const DEFAULT_FORM_A = "018f0c7a-1234-4abc-8def-000000000101";
export const DEFAULT_FORM_B = "018f0c7a-1234-4abc-8def-000000000102";

export const APPROVED_DEFAULT_COPY = {
  en: {
    label: "Default account",
    bankHelper:
      "Used for new transactions and voice or SMS entries when no account is mentioned and the currency matches.",
    cashHelper:
      "Used for new transactions and voice entries when no account is mentioned and the currency matches.",
    cashRestriction: "SMS entries use bank or wallet accounts.",
    first: "Your first account is the default.",
    replace: "Saving will replace Cash as your default.",
  },
  ar: {
    label: "الحساب الافتراضي",
    bankHelper:
      "يُستخدم للمعاملات الجديدة ومعاملات الصوت والرسائل عندما لا يُذكر حساب وتطابق العملة عملة الحساب.",
    cashHelper:
      "يُستخدم للمعاملات الجديدة ومعاملات الصوت عندما لا يُذكر حساب وتطابق العملة عملة الحساب.",
    cashRestriction: "معاملات الرسائل تستخدم حسابًا بنكيًا أو محفظة إلكترونية.",
    first: "حسابك الأول هو الحساب الافتراضي.",
    replace: "عند الحفظ، سيصبح هذا الحساب افتراضيًا بدلًا من كاش.",
  },
};

export interface DefaultFormLedger {
  readonly database: Database;
  readonly adapter: SQLiteAdapter;
}

export function createDefaultFormLedger(): DefaultFormLedger {
  const adapter = new SQLiteAdapter({ schema });
  const classes: Array<typeof Model> = [...LEDGER_MODEL_CLASSES, Profile];
  return {
    adapter,
    database: new Database({ adapter, modelClasses: classes }),
  };
}

export const DEFAULT_FORM_MODEL_CLASSES: ReadonlyArray<typeof Model> = [
  ...LEDGER_MODEL_CLASSES,
  Profile,
];

export async function resetDefaultFormLedger(
  database: Database
): Promise<void> {
  await database.write(async (): Promise<void> => {
    await database.unsafeResetDatabase();
  });
  await database.write(async (): Promise<void> => {
    const profile = database
      .get<Profile>("profiles")
      .prepareCreate((row): void => {
        row._raw.id = DEFAULT_FORM_OWNER;
        row.userId = DEFAULT_FORM_OWNER;
        row.deleted = false;
        row.preferredCurrency = "EGP";
        row.preferredLanguage = "en";
        row.onboardingCompleted = true;
        row.setupGuideCompleted = true;
        row.smsDetectionEnabled = true;
        row.theme = "SYSTEM";
      });
    await database.batch(profile);
  });
}

export interface DefaultFormAccountSeed {
  readonly id: string;
  readonly type?: "BANK" | "CASH" | "DIGITAL_WALLET";
  readonly default: boolean;
  readonly owner?: string;
  readonly deleted?: boolean;
  readonly name?: string;
  readonly balance?: number;
}

export async function seedDefaultFormAccount(
  database: Database,
  input: DefaultFormAccountSeed
): Promise<Account> {
  const model = database
    .get<Account>("accounts")
    .prepareCreate((account): void => {
      account._raw.id = input.id;
      account.userId = input.owner ?? DEFAULT_FORM_OWNER;
      account.name = input.name ?? "Cash";
      account.type = input.type ?? "BANK";
      account.currency = "EGP";
      account.balance = input.balance ?? 100;
      account.financialRevision = "3";
      account.institutionId = input.type === "CASH" ? undefined : "cib";
      account.providerDisplayName = input.type === "CASH" ? undefined : "CIB";
      account.deleted = input.deleted ?? false;
      account.isDefault = input.default;
    });
  await database.write(async (): Promise<void> => {
    await database.batch(model);
  });
  return model;
}

export async function seedDefaultFormBankChildren(
  database: Database,
  accountId: string
): Promise<void> {
  const details = database
    .get<BankDetails>("bank_details")
    .prepareCreate((row): void => {
      row._raw.id = "018f0c7a-1234-4abc-8def-000000000111";
      row.accountId = accountId;
      row.cardLast4 = 1234;
      row.deleted = false;
    });
  const sender = database
    .get<AccountSmsSender>("account_sms_senders")
    .prepareCreate((row): void => {
      row._raw.id = "018f0c7a-1234-4abc-8def-000000000112";
      row.accountId = accountId;
      row.senderName = "CIBEGYPT";
      row.normalizedSenderName = "cibegypt";
      row.deleted = false;
    });
  await database.write(async (): Promise<void> => {
    await database.batch(details, sender);
  });
}

export interface DeferredResult<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
}

export function createDeferredResult<T>(): DeferredResult<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, resolve, reject };
}
