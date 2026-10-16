/** Device-only hashes of REAL prepared physical records; never public payloads. */
import type { Model } from "@nozbe/watermelondb";
import type { Sha256Provider } from "@monyvi/logic";
import type {
  AccountReviewLocalSaveSnapshot,
} from "../../../packages/logic/src/financial-actions/review-local-recovery";
import type {
  ReviewBatchSavePayload,
  ReviewMutation,
} from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import type {
  FinancialActionLinkedOperationPostimage,
} from "./financial-action-foundation-contracts";

type CreatedRef = AccountReviewLocalSaveSnapshot["createdEntityRefs"][number];
type PhysicalRaw = Readonly<Model["_raw"]>;
const TABLES: Readonly<Record<ReviewMutation["entity"], string>> = {
  account: "accounts",
  account_sms_sender: "account_sms_senders",
  bank_details: "bank_details",
  transaction: "transactions",
  transfer: "transfers",
};

function fail(reason: string): never {
  throw new Error("account_review_local_snapshot_" + reason);
}
function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Tag primitive types so the text "1" cannot collide with physical number 1. */
function canonicalPhysicalScalar(value: unknown): readonly unknown[] {
  if (value === null) return ["null"];
  if (typeof value === "string") return ["string", value];
  if (typeof value === "boolean") return ["boolean", value];
  if (typeof value === "number" && Number.isFinite(value))
    return ["number", String(value)];
  return fail("unsupported_physical_field");
}

export function physicalRawField(raw: PhysicalRaw, key: string): unknown {
  const pair = Object.entries(raw).find(([name]) => name === key);
  if (!pair) return fail("missing_physical_field");
  const value: unknown = pair[1];
  return value;
}
export function physicalText(raw: PhysicalRaw, key: string): string {
  const value = physicalRawField(raw, key);
  if (typeof value !== "string" || value.length === 0)
    return fail("invalid_physical_text");
  return value;
}
export function physicalBoolean(raw: PhysicalRaw, key: string): boolean {
  const value = physicalRawField(raw, key);
  if (typeof value !== "boolean") return fail("invalid_physical_boolean");
  return value;
}
export function physicalDate(raw: PhysicalRaw, key: string): string {
  const millis = physicalRawField(raw, key);
  if (typeof millis !== "number" || !Number.isSafeInteger(millis))
    return fail("invalid_physical_timestamp");
  const date = new Date(millis);
  if (!Number.isFinite(date.getTime()))
    return fail("invalid_physical_timestamp");
  return date.toISOString();
}
export function physicalUnsigned(raw: PhysicalRaw, key: string): string {
  const value = physicalRawField(raw, key);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    return fail("unsafe_physical_unsigned");
  return String(value);
}

/** Domain excludes mutable transport metadata; device-only SMS retains it. */
export async function hashAccountReviewLocalPostimage(input: {
  readonly table: string;
  readonly id: string;
  readonly raw: PhysicalRaw;
  readonly hashProvider: Sha256Provider;
}): Promise<string> {
  const isDeviceOnly = input.table.startsWith("sms_review_");
  const fields = Object.entries(input.raw)
    .filter(([key]) => isDeviceOnly || (key !== "_status" && key !== "_changed"))
    .sort(([left], [right]) => compareAscii(left, right))
    .map(([key, value]) => [key, canonicalPhysicalScalar(value)]);
  return input.hashProvider.digestUtf8(
    JSON.stringify(["account-review-physical-postimage/v1", input.table,
      input.id, fields])
  );
}

export function requiredPreparedPostimage(
  prepared: readonly FinancialActionLinkedOperationPostimage[],
  table: string,
  id: string
): FinancialActionLinkedOperationPostimage {
  const found = prepared.filter((item) => item.table === table && item.id === id);
  if (found.length !== 1 || !found[0])
    return fail("missing_or_duplicate_prepared_postimage");
  return found[0];
}

/** Domain refs are the actual created accounts, children and financial rows. */
export async function captureCreatedReviewRefs(input: {
  readonly payload: ReviewBatchSavePayload;
  readonly prepared: readonly FinancialActionLinkedOperationPostimage[];
  readonly hashProvider: Sha256Provider;
}): Promise<CreatedRef[]> {
  const refs = await Promise.all(input.payload.domainMutation.records.map(
    async (mutation): Promise<CreatedRef> => {
      const table = TABLES[mutation.entity];
      const post = requiredPreparedPostimage(input.prepared, table, mutation.after.id);
      if (post.kind !== "create") return fail("domain_not_created");
      return {
        entity: mutation.entity,
        id: mutation.after.id,
        expectedPostimageHash: await hashAccountReviewLocalPostimage({
          ...post, hashProvider: input.hashProvider,
        }),
      };
    }
  ));
  return refs.sort((a, b) =>
    compareAscii(a.entity + ":" + a.id, b.entity + ":" + b.id)
  );
}

/** Effects have no permitted createdEntityRef kind; prove their membership. */
export function assertPreparedReviewEffects(
  payload: ReviewBatchSavePayload,
  prepared: readonly FinancialActionLinkedOperationPostimage[],
  actionId: string,
  ownerId: string
): void {
  const effects = prepared.filter((row) =>
    row.table === "account_financial_effects");
  if (effects.length !== payload.accountEffects.length)
    fail("effect_membership_mismatch");
  for (const effect of payload.accountEffects) {
    const post = requiredPreparedPostimage(
      effects, "account_financial_effects", effect.effectId
    );
    if (post.kind !== "create" ||
      physicalText(post.raw, "user_id") !== ownerId ||
      physicalText(post.raw, "action_id") !== actionId ||
      physicalText(post.raw, "account_id") !== effect.accountId ||
      physicalText(post.raw, "amount_minor_units") !== effect.amountMinorUnits ||
      physicalText(post.raw, "currency") !== effect.currency ||
      !physicalBoolean(post.raw, "is_effective"))
      fail("effect_postimage_mismatch");
  }
}
