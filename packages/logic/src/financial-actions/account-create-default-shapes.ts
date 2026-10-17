/**
 * #395 T067 — inactive, Add-only account.create-default/v1 closed wire.
 *
 * Reuse the existing canonical review mutation/guard/effect schemas rather
 * than defining a second account/child financial vocabulary. Add extends only
 * the Bank details accountNumber field and adds the narrow prior-default clear.
 * No registry, runtime or server activation happens in this module.
 */
import { z } from "zod";
import {
  accountDefaultSnapshotSchema,
  accountEffectSchema,
  createGuardSchema,
  reviewMutationSchema,
  uuidSchema,
} from "./review-batch-save-shapes";

// The first three canonical review alternatives are the account and its two
// child creates. Future changes to that schema must update this explicit
// scoped derivation and its complete-coverage tests together.
const [
  accountCreateMutationSchema,
  smsSenderCreateMutationSchema,
  reviewBankDetailsMutationSchema,
] = reviewMutationSchema.options;

/** Add retains the form's optional account number; Review creates use null. */
const bankDetailsCreateMutationSchema = reviewBankDetailsMutationSchema.extend({
  after: reviewBankDetailsMutationSchema.shape.after.extend({
    accountNumber: z.string().nullable(),
  }),
});

const previousDefaultClearMutationSchema = z.strictObject({
  entity: z.literal("account_default"),
  mode: z.literal("update"),
  expectedIsDefault: z.literal(true),
  after: z.strictObject({
    id: uuidSchema,
    isDefault: z.literal(false),
  }),
});

export const accountCreateDefaultMutationSchema = z.discriminatedUnion(
  "entity",
  [
    accountCreateMutationSchema,
    smsSenderCreateMutationSchema,
    bankDetailsCreateMutationSchema,
    previousDefaultClearMutationSchema,
  ]
);

export const accountCreateDefaultWireSchema = z.strictObject({
  schemaVersion: z.literal("account.create-default/v1"),
  operationCode: z.literal("account.create-default"),
  defaultIntent: z.boolean(),
  expectedDefaultSnapshot: accountDefaultSnapshotSchema,
  createGuards: z.array(createGuardSchema),
  accountEffects: z.array(accountEffectSchema),
  domainRecordRefs: z.array(uuidSchema).min(1),
  domainMutation: z.strictObject({
    records: z.array(accountCreateDefaultMutationSchema).min(1),
  }),
});

export type AccountDefaultSnapshot = z.infer<
  typeof accountDefaultSnapshotSchema
>;
export type AccountCreateDefaultPayload = z.infer<
  typeof accountCreateDefaultWireSchema
>;
export type AccountCreateDefaultMutation =
  AccountCreateDefaultPayload["domainMutation"]["records"][number];
export type AccountCreateDefaultRecord = Extract<
  AccountCreateDefaultMutation,
  { readonly entity: "account" }
>;
