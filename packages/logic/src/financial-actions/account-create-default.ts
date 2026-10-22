/**
 * #395 T067 — inactive pure account.create-default/v1 validation.
 *
 * No registration with DEFAULT_FINANCIAL_ACTION_REGISTRY, no mobile/DB
 * imports or writer activation. The existing accounts/create balance-effects
 * tuple and the separate review.batch-save tuple remain unchanged.
 */
import {
  accountCreateDefaultWireSchema,
  type AccountCreateDefaultPayload,
} from "./account-create-default-shapes";
import { validateAccountCreateDefaultIntegrity } from "./account-create-default-integrity";

export { accountDefaultSnapshotSchema } from "./review-batch-save-shapes";
export type {
  AccountCreateDefaultPayload,
  AccountDefaultSnapshot,
} from "./account-create-default-shapes";

export const ACCOUNT_CREATE_DEFAULT_TUPLE = Object.freeze({
  domain: "accounts",
  kind: "create_with_default",
  payloadVersion: "account.create-default/v1",
});

/**
 * Root, nested mutation, default, financial effect and create-guard validation
 * all run without I/O. Current ownership, absent IDs, action/revision CAS,
 * predecessor dependencies and failure rollback belong to the guarded writer.
 */
export const accountCreateDefaultPayloadSchema =
  accountCreateDefaultWireSchema.superRefine((payload, ctx) => {
    const reason = validateAccountCreateDefaultIntegrity(payload);
    if (reason !== null) {
      ctx.addIssue({
        code: "custom",
        message: reason,
      });
    }
  });

export function validateAccountCreateDefaultPayload(
  value: unknown
): AccountCreateDefaultPayload {
  return accountCreateDefaultPayloadSchema.parse(value);
}
