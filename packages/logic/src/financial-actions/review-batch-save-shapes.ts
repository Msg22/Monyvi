/**
 * #395 T046 closed review.batch-save/v1 wire shapes.
 * All persisted monetary data is canonical integer minor-unit text. No domain
 * models, untrusted provider evidence or snapshot preimages are serialized.
 */
import { z } from "zod";
import type { AccountType, CurrencyType } from "@monyvi/db";
import { SUPPORTED_CURRENCIES } from "../utils/currency-data";
import { VALID_TYPES } from "../utils/ai-parser-utils";
import { parseCanonicalUnsignedIntegerString } from "./canonical-unsigned-revision";

const MAX_MINOR_UNITS = 9223372036854775807n;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MINOR_UNITS = /^-?(?:0|[1-9][0-9]*)$/;
const CURRENCY_CODES: ReadonlySet<string> = new Set(
  SUPPORTED_CURRENCIES.map(({ code }) => code)
);
const ACCOUNT_TYPES: ReadonlySet<string> = new Set<AccountType>([
  "BANK",
  "CASH",
  "DIGITAL_WALLET",
]);

export const uuidSchema = z.string().regex(UUID);
export const timestampSchema = z
  .string()
  .regex(TIMESTAMP)
  .refine(
    (value) =>
      value.slice(0, 4) !== "0000" &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value
  );
export const calendarDateSchema = z
  .string()
  .regex(CALENDAR_DATE)
  .refine(
    (value) =>
      value.slice(0, 4) !== "0000" &&
      Number.isFinite(Date.parse(value + "T00:00:00.000Z")) &&
      new Date(value + "T00:00:00.000Z").toISOString().slice(0, 10) === value
  );
export const revisionSchema = z.string().refine((value) => {
  try {
    parseCanonicalUnsignedIntegerString(value);
    return true;
  } catch {
    return false;
  }
});
export const minorUnitsSchema = z
  .string()
  .regex(MINOR_UNITS)
  .refine(
    (value) =>
      value.length <= 20 &&
      MINOR_UNITS.test(value) &&
      value !== "-0" &&
      BigInt(value) >= -MAX_MINOR_UNITS &&
      BigInt(value) <= MAX_MINOR_UNITS
  );
const positiveMinorUnitsSchema = minorUnitsSchema.refine(
  (value) => BigInt(value) > 0n
);
const nonBlankSchema = z.string().refine((value) => value.trim().length > 0);
const currencySchema = z.custom<CurrencyType>(
  (value) => typeof value === "string" && CURRENCY_CODES.has(value)
);
const accountTypeSchema = z.custom<AccountType>(
  (value) => typeof value === "string" && ACCOUNT_TYPES.has(value)
);
const transactionTypeSchema = z
  .string()
  .refine((value) => VALID_TYPES.has(value));
const cardSuffixSchema = z
  .string()
  .regex(/^[0-9]{4}$/)
  .nullable();
const nullableStringSchema = z.string().nullable();
const fingerprintSchema = nonBlankSchema.nullable();

export const selectedSourceRefSchema = z.strictObject({
  rowId: uuidSchema,
  recordId: uuidSchema,
  sourceFingerprint: fingerprintSchema,
});
export const confirmedGroupRefSchema = z.strictObject({
  groupId: uuidSchema,
  revision: revisionSchema,
  accountId: uuidSchema,
});
export const createGuardSchema = z.strictObject({
  entity: z.enum([
    "account",
    "account_sms_sender",
    "bank_details",
    "transaction",
    "transfer",
  ]),
  id: uuidSchema,
  expectedAbsent: z.literal(true),
});
export const accountEffectSchema = z.strictObject({
  accountId: uuidSchema,
  amountMinorUnits: minorUnitsSchema,
  currency: currencySchema,
  effectId: uuidSchema,
});
export const localSmsBookkeepingSchema = z.strictObject({
  draftId: uuidSchema,
  queueId: uuidSchema,
  snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
  expectedReviewRevision: revisionSchema,
  operation: z.enum(["delete_saved", "rebind_remaining"]),
});
const defaultAccountSchema = z.strictObject({
  accountId: uuidSchema,
  isDefault: z.literal(true),
});
export const accountDefaultSnapshotSchema = z.strictObject({
  activeAccountIds: z.array(uuidSchema),
  defaultAccount: defaultAccountSchema.nullable(),
});

const accountAfterSchema = z.strictObject({
  id: uuidSchema,
  name: nonBlankSchema,
  type: accountTypeSchema,
  currency: currencySchema,
  institutionId: nullableStringSchema,
  providerDisplayName: nullableStringSchema,
  isDefault: z.boolean(),
  createdAt: timestampSchema,
  deleted: z.literal(false),
  openingBalanceMinorUnits: minorUnitsSchema,
  targetBalanceMinorUnits: z.null(),
});
const smsSenderAfterSchema = z.strictObject({
  id: uuidSchema,
  accountId: uuidSchema,
  senderName: nonBlankSchema,
  normalizedSenderName: nonBlankSchema,
  createdAt: timestampSchema,
  deleted: z.literal(false),
});
const bankDetailsAfterSchema = z.strictObject({
  id: uuidSchema,
  accountId: uuidSchema,
  accountNumber: z.null(),
  cardLast4: cardSuffixSchema,
  createdAt: timestampSchema,
  deleted: z.literal(false),
});
const transactionAfterSchema = z.strictObject({
  id: uuidSchema,
  accountId: uuidSchema,
  amountMinorUnits: positiveMinorUnitsSchema,
  currency: currencySchema,
  type: transactionTypeSchema,
  categoryId: uuidSchema,
  counterparty: nullableStringSchema,
  note: nullableStringSchema,
  date: calendarDateSchema,
  source: z.enum(["VOICE", "SMS"]),
  smsFingerprint: fingerprintSchema,
  isDraft: z.literal(false),
  linkedAssetId: z.null(),
  linkedDebtId: z.null(),
  linkedRecurringId: z.null(),
  createdAt: timestampSchema,
  deleted: z.literal(false),
});
const transferAfterSchema = z.strictObject({
  id: uuidSchema,
  fromAccountId: uuidSchema,
  toAccountId: uuidSchema,
  amountMinorUnits: positiveMinorUnitsSchema,
  convertedAmountMinorUnits: positiveMinorUnitsSchema.nullable(),
  exchangeRate: z
    .string()
    .regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/)
    .nullable(),
  currency: currencySchema,
  date: calendarDateSchema,
  notes: nullableStringSchema,
  smsFingerprint: fingerprintSchema,
  createdAt: timestampSchema,
  deleted: z.literal(false),
});

const mutation = <TEntity extends string, TAfter extends z.ZodType>(
  entity: TEntity,
  after: TAfter
): z.ZodObject<
  {
    entity: z.ZodLiteral<TEntity>;
    mode: z.ZodLiteral<"create">;
    expectedUpdatedAt: z.ZodNull;
    after: TAfter;
  },
  z.core.$strict
> =>
  z.strictObject({
    entity: z.literal(entity),
    mode: z.literal("create"),
    expectedUpdatedAt: z.null(),
    after,
  });

export const reviewMutationSchema = z.discriminatedUnion("entity", [
  mutation("account", accountAfterSchema),
  mutation("account_sms_sender", smsSenderAfterSchema),
  mutation("bank_details", bankDetailsAfterSchema),
  mutation("transaction", transactionAfterSchema),
  mutation("transfer", transferAfterSchema),
]);
export const reviewBatchSaveWireSchema = z.strictObject({
  schemaVersion: z.literal("review.batch-save/v1"),
  operationCode: z.literal("review.batch-save"),
  source: z.enum(["VOICE", "SMS"]),
  sessionId: uuidSchema,
  frozenIntentDigest: z.string().regex(/^[0-9a-f]{64}$/),
  selectedSourceRefs: z.array(selectedSourceRefSchema).min(1),
  confirmedGroupRefs: z.array(confirmedGroupRefSchema),
  createGuards: z.array(createGuardSchema).min(1),
  accountEffects: z.array(accountEffectSchema).min(1),
  domainRecordRefs: z.array(uuidSchema).min(1),
  domainMutation: z.strictObject({
    records: z.array(reviewMutationSchema).min(1),
  }),
  localSmsBookkeeping: z.array(localSmsBookkeepingSchema),
  creationDefaultSnapshot: accountDefaultSnapshotSchema.optional(),
});

export type ReviewBatchSavePayload = z.infer<typeof reviewBatchSaveWireSchema>;
export type ReviewMutation =
  ReviewBatchSavePayload["domainMutation"]["records"][number];
export type ReviewFinancialRecord = Extract<
  ReviewMutation,
  { readonly entity: "transaction" | "transfer" }
>;
export type ReviewNewAccount = Extract<
  ReviewMutation,
  { readonly entity: "account" }
>;
