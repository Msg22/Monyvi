/**
 * #395 Add-only private local recovery snapshot schema & parser.
 * Device-only storage format: version "account-create-default-local-save/v1".
 *
 * Never serialize this value to financial-action payloads, Supabase, outbox,
 * analytics or diagnostics. Physical postimages, account effects and prior default
 * must be verified by the authenticated recovery writer before any compensation.
 */
import { z } from "zod";
import type { CurrencyType } from "@monyvi/db";
import { SUPPORTED_CURRENCIES } from "../utils/currency-data";
import {
  minorUnitsSchema,
  revisionSchema,
  uuidSchema,
} from "./review-batch-save-shapes";
import {
  accountDefaultSnapshotSchema,
  type AccountDefaultSnapshot,
} from "./account-create-default";
import {
  parseFinancialActionEvidenceJson,
  serializeCanonicalJsonValue,
} from "./action-contracts";
import type { CanonicalJsonValue } from "./action-registry";

export const ACCOUNT_PHYSICAL_COLUMNS: ReadonlySet<string> = new Set([
  "id",
  "balance",
  "created_at",
  "currency",
  "deleted",
  "financial_revision",
  "institution_id",
  "is_default",
  "name",
  "provider_display_name",
  "type",
  "updated_at",
  "user_id",
]);

const POSTIMAGE_HASH = /^[0-9a-f]{64}$/;
const postimageHashSchema = z.string().regex(POSTIMAGE_HASH);

const CURRENCY_CODES: ReadonlySet<string> = new Set(
  SUPPORTED_CURRENCIES.map(({ code }) => code)
);

const currencySchema = z.custom<CurrencyType>(
  (value) => typeof value === "string" && CURRENCY_CODES.has(value)
);

function areDistinct(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function areSortedAndDistinct(values: readonly string[]): boolean {
  return values.every(
    (value, index) => index === 0 || values[index - 1] < value
  );
}

export const accountCreateDefaultLocalRootBindingSchema = z.strictObject({
  domain: z.literal("accounts"),
  kind: z.literal("create_with_default"),
  domainReferenceId: uuidSchema,
  payloadVersion: z.literal("account.create-default/v1"),
});

export const accountCreateDefaultDependencyRootSchema = z.strictObject({
  actionId: uuidSchema,
  payloadHash: postimageHashSchema,
});

export const accountCreateDefaultCreatedAccountPostimageSchema = z.strictObject(
  {
    userId: uuidSchema,
    currency: currencySchema,
    balanceMinorUnits: minorUnitsSchema,
    financialRevision: revisionSchema,
    isDefault: z.boolean(),
    deleted: z.literal(false),
  }
);

export const accountCreateDefaultCreatedAccountSchema = z.strictObject({
  accountId: uuidSchema,
  preimage: z.null(),
  postimage: accountCreateDefaultCreatedAccountPostimageSchema,
  expectedPostimageHash: postimageHashSchema,
});

export const accountCreateDefaultCreatedChildSchema = z.strictObject({
  entity: z.enum(["bank_details", "account_sms_sender"]),
  id: uuidSchema,
  accountId: uuidSchema,
  preimage: z.null(),
  expectedPostimageHash: postimageHashSchema,
});

export const accountCreateDefaultOpeningEffectPostimageSchema = z.strictObject({
  amountMinorUnits: minorUnitsSchema,
  currency: currencySchema,
  acceptedAccountRevision: z.literal("1"),
  domain: z.literal("accounts"),
  kind: z.literal("account.create-default"),
  isEffective: z.literal(true),
  deleted: z.literal(false),
  compensatedAt: z.null(),
  reversesEffectId: z.null(),
});

export const accountCreateDefaultOpeningEffectSchema = z.strictObject({
  effectId: uuidSchema,
  accountId: uuidSchema,
  userId: uuidSchema,
  actionId: uuidSchema,
  preimage: z.null(),
  postimage: accountCreateDefaultOpeningEffectPostimageSchema,
  expectedPostimageHash: postimageHashSchema,
});

export const accountCreateDefaultPriorDefaultPreimageSchema = z.strictObject({
  currency: currencySchema,
  balanceMinorUnits: minorUnitsSchema,
  financialRevision: revisionSchema,
  isDefault: z.literal(true),
  deleted: z.literal(false),
});

export const accountCreateDefaultPriorDefaultPostimageSchema = z.strictObject({
  currency: currencySchema,
  balanceMinorUnits: minorUnitsSchema,
  financialRevision: revisionSchema,
  isDefault: z.literal(false),
  deleted: z.literal(false),
});

export const accountCreateDefaultTransportStateSchema = z.strictObject({
  status: z.enum(["created", "updated", "synced"]),
  changedColumns: z.array(z.string()),
});

export const accountCreateDefaultPriorDefaultSchema = z.strictObject({
  accountId: uuidSchema,
  userId: uuidSchema,
  preimage: accountCreateDefaultPriorDefaultPreimageSchema,
  postimage: accountCreateDefaultPriorDefaultPostimageSchema,
  preimageHash: postimageHashSchema,
  expectedPostimageHash: postimageHashSchema,
  transportPreimage: accountCreateDefaultTransportStateSchema,
  transportPostimage: accountCreateDefaultTransportStateSchema,
});

/**
 * Closed 12-key Add recovery snapshot schema.
 * Version: "account-create-default-local-save/v1".
 */
export const accountCreateDefaultLocalRecoverySnapshotSchema = z
  .strictObject({
    version: z.literal("account-create-default-local-save/v1"),
    actionId: uuidSchema,
    ownerId: uuidSchema,
    rootBinding: accountCreateDefaultLocalRootBindingSchema,
    payloadHash: postimageHashSchema,
    expectedDefaultSnapshot: accountDefaultSnapshotSchema,
    preparedDefaultSnapshot: accountDefaultSnapshotSchema,
    dependencyRoots: z.array(accountCreateDefaultDependencyRootSchema),
    createdAccount: accountCreateDefaultCreatedAccountSchema,
    createdChildren: z.array(accountCreateDefaultCreatedChildSchema),
    openingEffect: accountCreateDefaultOpeningEffectSchema.nullable(),
    priorDefault: accountCreateDefaultPriorDefaultSchema.nullable(),
  })
  .superRefine((snapshot, context) => {
    if (
      snapshot.rootBinding.domainReferenceId !==
      snapshot.createdAccount.accountId
    ) {
      context.addIssue({
        code: "custom",
        path: ["rootBinding", "domainReferenceId"],
        message: "root_binding_account_id_mismatch",
      });
    }
    if (snapshot.createdAccount.postimage.userId !== snapshot.ownerId) {
      context.addIssue({
        code: "custom",
        path: ["createdAccount", "postimage", "userId"],
        message: "created_account_user_id_mismatch",
      });
    }

    if (
      !areSortedAndDistinct(snapshot.expectedDefaultSnapshot.activeAccountIds)
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedDefaultSnapshot", "activeAccountIds"],
        message: "unsorted_or_duplicate_expected_active_accounts",
      });
    }
    if (
      !areSortedAndDistinct(snapshot.preparedDefaultSnapshot.activeAccountIds)
    ) {
      context.addIssue({
        code: "custom",
        path: ["preparedDefaultSnapshot", "activeAccountIds"],
        message: "unsorted_or_duplicate_prepared_active_accounts",
      });
    }

    if (
      snapshot.expectedDefaultSnapshot.activeAccountIds.includes(
        snapshot.createdAccount.accountId
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedDefaultSnapshot", "activeAccountIds"],
        message: "created_account_present_in_expected_snapshot",
      });
    }
    if (
      !snapshot.preparedDefaultSnapshot.activeAccountIds.includes(
        snapshot.createdAccount.accountId
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["preparedDefaultSnapshot", "activeAccountIds"],
        message: "created_account_missing_from_prepared_snapshot",
      });
    }

    const expectedPreparedActiveIds = [
      ...snapshot.expectedDefaultSnapshot.activeAccountIds,
      snapshot.createdAccount.accountId,
    ].sort();
    if (
      snapshot.preparedDefaultSnapshot.activeAccountIds.length !==
        expectedPreparedActiveIds.length ||
      snapshot.preparedDefaultSnapshot.activeAccountIds.some(
        (id, index) => id !== expectedPreparedActiveIds[index]
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["preparedDefaultSnapshot", "activeAccountIds"],
        message: "prepared_active_accounts_mismatch",
      });
    }

    const memberIds = [
      snapshot.createdAccount.accountId,
      ...snapshot.createdChildren.map((child) => child.id),
      ...(snapshot.openingEffect ? [snapshot.openingEffect.effectId] : []),
    ];
    if (!areDistinct(memberIds)) {
      context.addIssue({
        code: "custom",
        message: "duplicate_member_id",
      });
    }

    const childIds = snapshot.createdChildren.map((child) => child.id);
    if (!areDistinct(childIds)) {
      context.addIssue({
        code: "custom",
        path: ["createdChildren"],
        message: "duplicate_child_id",
      });
    }
    const childSortKeys = snapshot.createdChildren.map(
      (child) => `${child.entity}:${child.id}`
    );
    if (!areSortedAndDistinct(childSortKeys)) {
      context.addIssue({
        code: "custom",
        path: ["createdChildren"],
        message: "unsorted_or_duplicate_children",
      });
    }
    for (const [index, child] of snapshot.createdChildren.entries()) {
      if (child.accountId !== snapshot.createdAccount.accountId) {
        context.addIssue({
          code: "custom",
          path: ["createdChildren", index, "accountId"],
          message: "child_account_id_mismatch",
        });
      }
    }

    const dependencyActionIds = snapshot.dependencyRoots.map(
      (root) => root.actionId
    );
    if (!areSortedAndDistinct(dependencyActionIds)) {
      context.addIssue({
        code: "custom",
        path: ["dependencyRoots"],
        message: "unsorted_or_duplicate_dependency_roots",
      });
    }
    if (dependencyActionIds.includes(snapshot.actionId)) {
      context.addIssue({
        code: "custom",
        path: ["dependencyRoots"],
        message: "self_dependency",
      });
    }

    if (snapshot.openingEffect === null) {
      if (
        snapshot.createdAccount.postimage.balanceMinorUnits !== "0" ||
        snapshot.createdAccount.postimage.financialRevision !== "0"
      ) {
        context.addIssue({
          code: "custom",
          path: ["createdAccount", "postimage"],
          message: "zero_opening_effect_requires_zero_balance_and_revision",
        });
      }
    } else {
      if (
        snapshot.openingEffect.accountId !== snapshot.createdAccount.accountId
      ) {
        context.addIssue({
          code: "custom",
          path: ["openingEffect", "accountId"],
          message: "opening_effect_account_id_mismatch",
        });
      }
      if (snapshot.openingEffect.userId !== snapshot.ownerId) {
        context.addIssue({
          code: "custom",
          path: ["openingEffect", "userId"],
          message: "opening_effect_user_id_mismatch",
        });
      }
      if (snapshot.openingEffect.actionId !== snapshot.actionId) {
        context.addIssue({
          code: "custom",
          path: ["openingEffect", "actionId"],
          message: "opening_effect_action_id_mismatch",
        });
      }
      if (
        snapshot.openingEffect.postimage.currency !==
        snapshot.createdAccount.postimage.currency
      ) {
        context.addIssue({
          code: "custom",
          path: ["openingEffect", "postimage", "currency"],
          message: "opening_effect_currency_mismatch",
        });
      }
      if (
        snapshot.openingEffect.postimage.amountMinorUnits === "0" ||
        snapshot.openingEffect.postimage.amountMinorUnits !==
          snapshot.createdAccount.postimage.balanceMinorUnits
      ) {
        context.addIssue({
          code: "custom",
          path: ["openingEffect", "postimage", "amountMinorUnits"],
          message: "opening_effect_amount_mismatch",
        });
      }
      if (snapshot.createdAccount.postimage.financialRevision !== "1") {
        context.addIssue({
          code: "custom",
          path: ["createdAccount", "postimage", "financialRevision"],
          message: "nonzero_opening_effect_requires_revision_1",
        });
      }
    }

    if (snapshot.priorDefault !== null) {
      if (snapshot.priorDefault.userId !== snapshot.ownerId) {
        context.addIssue({
          code: "custom",
          path: ["priorDefault", "userId"],
          message: "prior_default_user_id_mismatch",
        });
      }
      if (
        snapshot.priorDefault.accountId === snapshot.createdAccount.accountId
      ) {
        context.addIssue({
          code: "custom",
          path: ["priorDefault", "accountId"],
          message: "prior_default_account_id_collision_with_created",
        });
      }
      if (
        snapshot.expectedDefaultSnapshot.defaultAccount === null ||
        snapshot.expectedDefaultSnapshot.defaultAccount.accountId !==
          snapshot.priorDefault.accountId
      ) {
        context.addIssue({
          code: "custom",
          path: ["priorDefault", "accountId"],
          message: "prior_default_not_in_expected_snapshot",
        });
      }
      if (
        snapshot.priorDefault.preimage.currency !==
          snapshot.priorDefault.postimage.currency ||
        snapshot.priorDefault.preimage.balanceMinorUnits !==
          snapshot.priorDefault.postimage.balanceMinorUnits ||
        snapshot.priorDefault.preimage.financialRevision !==
          snapshot.priorDefault.postimage.financialRevision
      ) {
        context.addIssue({
          code: "custom",
          path: ["priorDefault"],
          message: "prior_default_financial_values_must_be_preserved",
        });
      }
      if (
        !areSortedAndDistinct(
          snapshot.priorDefault.transportPreimage.changedColumns
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["priorDefault", "transportPreimage", "changedColumns"],
          message: "unsorted_or_duplicate_transport_columns",
        });
      }
      for (const col of snapshot.priorDefault.transportPreimage
        .changedColumns) {
        if (!ACCOUNT_PHYSICAL_COLUMNS.has(col)) {
          context.addIssue({
            code: "custom",
            path: ["priorDefault", "transportPreimage", "changedColumns"],
            message: "invalid_transport_column",
          });
        }
      }
      if (
        !areSortedAndDistinct(
          snapshot.priorDefault.transportPostimage.changedColumns
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["priorDefault", "transportPostimage", "changedColumns"],
          message: "unsorted_or_duplicate_transport_columns",
        });
      }
      for (const col of snapshot.priorDefault.transportPostimage
        .changedColumns) {
        if (!ACCOUNT_PHYSICAL_COLUMNS.has(col)) {
          context.addIssue({
            code: "custom",
            path: ["priorDefault", "transportPostimage", "changedColumns"],
            message: "invalid_transport_column",
          });
        }
      }
    }

    // The only allowed prior-default UPDATE accompanies a newly created
    // default and an ACTUAL previous default. A non-default Add must never
    // clear anything; a first active account must become default.
    const createdDefault = snapshot.createdAccount.postimage.isDefault;
    const oldDefault = snapshot.expectedDefaultSnapshot.defaultAccount;
    const shouldClear = createdDefault && oldDefault !== null;
    if ((snapshot.priorDefault !== null) !== shouldClear) {
      context.addIssue({
        code: "custom",
        path: ["priorDefault"],
        message: "prior_default_iff_actual_clear",
      });
    }
    if (
      snapshot.expectedDefaultSnapshot.activeAccountIds.length === 0 &&
      !createdDefault
    ) {
      context.addIssue({
        code: "custom",
        path: ["createdAccount", "postimage", "isDefault"],
        message: "first_account_must_be_default",
      });
    }
    const requiredPreparedDefaultId = createdDefault
      ? snapshot.createdAccount.accountId
      : (oldDefault?.accountId ?? null);
    const preparedDefaultId =
      snapshot.preparedDefaultSnapshot.defaultAccount?.accountId ?? null;
    if (preparedDefaultId !== requiredPreparedDefaultId) {
      context.addIssue({
        code: "custom",
        path: ["preparedDefaultSnapshot", "defaultAccount"],
        message: "prepared_default_account_mismatch",
      });
    }
  });

/**
 * Convert only recursively valid JSON primitives into canonical JSON values.
 * The Add snapshot contains only strings, booleans, arrays, objects and null.
 * Numeric/undefined fields must never be hidden by an unsafe double cast.
 */
function requireCanonicalJsonValue(value: unknown): CanonicalJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (Array.isArray(value)) return value.map(requireCanonicalJsonValue);
  if (typeof value !== "object") {
    throw new Error("account_create_default_invalid_canonical_value");
  }
  const result: Record<string, CanonicalJsonValue> = {};
  for (const [key, member] of Object.entries(value)) {
    result[key] = requireCanonicalJsonValue(member);
  }
  return result;
}

/** Structural inspection only; never authorizes compensation without a root. */
export function inspectAccountCreateDefaultLocalRecoverySnapshot(
  value: unknown
): AccountCreateDefaultLocalRecoverySnapshot {
  return accountCreateDefaultLocalRecoverySnapshotSchema.parse(value);
}

/** Strict canonical bytes, suitable for the existing device-private carrier. */
export function serializeAccountCreateDefaultLocalRecoverySnapshotJson(
  value: unknown
): string {
  const snapshot = inspectAccountCreateDefaultLocalRecoverySnapshot(value);
  return serializeCanonicalJsonValue(requireCanonicalJsonValue(snapshot));
}

export type AccountCreateDefaultLocalRecoverySnapshot = z.infer<
  typeof accountCreateDefaultLocalRecoverySnapshotSchema
>;

export const accountCreateDefaultLocalSaveSnapshotSchema =
  accountCreateDefaultLocalRecoverySnapshotSchema;

export type AccountCreateDefaultLocalSaveSnapshot =
  AccountCreateDefaultLocalRecoverySnapshot;

export interface ExpectedOwnedAddRoot {
  readonly actionId: string;
  readonly ownerId: string;
  readonly domainReferenceId: string;
  readonly payloadHash: string;
  readonly expectedDefaultSnapshot: AccountDefaultSnapshot;
}

/**
 * Authoritative parser. All FIVE external root bindings are mandatory;
 * callers needing an unbound display/inspection must use the separate
 * structural-only API and cannot treat that result as recovery authority.
 */
export function parseAccountCreateDefaultLocalRecoverySnapshotJson(input: {
  readonly json: string;
  readonly expectedRoot: ExpectedOwnedAddRoot;
}): AccountCreateDefaultLocalRecoverySnapshot {
  const raw = parseFinancialActionEvidenceJson(input.json);
  const snapshot = inspectAccountCreateDefaultLocalRecoverySnapshot(raw);
  if (
    serializeAccountCreateDefaultLocalRecoverySnapshotJson(snapshot) !==
    input.json
  ) {
    throw new Error("account_create_default_recovery_not_canonical_json");
  }

  const expectedRoot = input.expectedRoot;
  if (snapshot.actionId !== expectedRoot.actionId)
    throw new Error("account_create_default_recovery_action_id_mismatch");
  if (snapshot.ownerId !== expectedRoot.ownerId)
    throw new Error("account_create_default_recovery_owner_mismatch");
  if (snapshot.rootBinding.domainReferenceId !== expectedRoot.domainReferenceId)
    throw new Error(
      "account_create_default_recovery_domain_reference_mismatch"
    );
  if (snapshot.payloadHash !== expectedRoot.payloadHash)
    throw new Error("account_create_default_recovery_payload_hash_mismatch");

  const expectedGraph = accountDefaultSnapshotSchema.parse(
    expectedRoot.expectedDefaultSnapshot
  );
  const actualGraph = snapshot.expectedDefaultSnapshot;
  if (
    expectedGraph.activeAccountIds.length !==
      actualGraph.activeAccountIds.length ||
    expectedGraph.activeAccountIds.some(
      (id, index) => actualGraph.activeAccountIds[index] !== id
    ) ||
    (expectedGraph.defaultAccount?.accountId ?? null) !==
      (actualGraph.defaultAccount?.accountId ?? null)
  ) {
    throw new Error(
      "account_create_default_recovery_expected_snapshot_mismatch"
    );
  }
  return snapshot;
}

export const parseAccountCreateDefaultLocalSaveSnapshot =
  parseAccountCreateDefaultLocalRecoverySnapshotJson;
