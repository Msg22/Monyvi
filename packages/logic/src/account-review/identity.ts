import type { Sha256Provider } from "../financial-actions/action-contracts";
import type {
  AccountReviewGroup,
  AccountReviewRow,
  AccountReviewSession,
} from "./review-schemas";
import {
  accountType,
  canonicalUuid,
  cardSuffix,
  currencyCode,
  hash,
  reviewSource,
} from "./schema-primitives";

const GROUP_DOMAIN = "monyvi.account-review.group-identity";
const ROW_DOMAIN = "monyvi.account-review.row-identity";
const IDENTITY_VERSION = "v1";

/** Domain-specific bytes only. Never log/hash raw SMS/transcripts. */
export function normalizeGroundedIdentity(value: string): string {
  const normalized = value
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
  if (!normalized) throw new Error("account_review_identity_blank");
  return normalized;
}

export function uuidV8FromSha256(digest: string): string {
  const canonicalDigest = hash.parse(digest);
  const bytes = canonicalDigest.slice(0, 32).split("");
  bytes[12] = "8";
  bytes[16] = ((parseInt(bytes[16] ?? "0", 16) % 4) + 8).toString(16);
  const hex = bytes.join("");
  return canonicalUuid.parse(
    [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-")
  );
}

export interface AccountReviewGroupIdentityInput {
  readonly ownerId: AccountReviewSession["ownerId"];
  readonly sessionId: AccountReviewSession["sessionId"];
  readonly source: AccountReviewSession["source"];
  readonly identity: Pick<
    AccountReviewGroup,
    | "name"
    | "type"
    | "currency"
    | "institutionId"
    | "providerDisplayName"
    | "cardLast4"
    | "senderNames"
  >;
  readonly hashProvider: Sha256Provider;
}

export async function deriveAccountReviewGroupIdentity(
  input: AccountReviewGroupIdentityInput
): Promise<Pick<AccountReviewGroup, "evidenceKey" | "groupId">> {
  const { identity } = input;
  canonicalUuid.parse(input.ownerId);
  canonicalUuid.parse(input.sessionId);
  reviewSource.parse(input.source);
  if (identity.type === null)
    throw new Error("account_review_group_type_unknown");
  if (identity.institutionId !== null && !identity.institutionId.trim()) {
    throw new Error("account_review_group_institution_invalid");
  }
  accountType.parse(identity.type);
  currencyCode.parse(identity.currency);
  if (identity.cardLast4 !== null) cardSuffix.parse(identity.cardLast4);
  const aliases = [
    ...new Set(identity.senderNames.map(normalizeGroundedIdentity)),
  ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const preimage = JSON.stringify([
    GROUP_DOMAIN,
    IDENTITY_VERSION,
    input.ownerId,
    input.sessionId,
    input.source,
    normalizeGroundedIdentity(identity.name),
    identity.type,
    identity.currency,
    identity.institutionId,
    identity.providerDisplayName === null
      ? null
      : normalizeGroundedIdentity(identity.providerDisplayName),
    identity.cardLast4,
    aliases,
  ]);
  const evidenceKey = hash.parse(await input.hashProvider.digestUtf8(preimage));
  return { evidenceKey, groupId: uuidV8FromSha256(evidenceKey) };
}

export interface AccountReviewRowIdentityInput {
  readonly ownerId: AccountReviewSession["ownerId"];
  readonly sessionId: AccountReviewSession["sessionId"];
  readonly source: AccountReviewSession["source"];
  readonly sourceRecordKey: readonly string[];
  readonly sourceFinancialKey: readonly string[];
  readonly occurrence: number;
  readonly hashProvider: Sha256Provider;
}

export async function deriveAccountReviewRowIdentity(
  input: AccountReviewRowIdentityInput
): Promise<AccountReviewSession["rows"][number]["rowId"]> {
  canonicalUuid.parse(input.ownerId);
  canonicalUuid.parse(input.sessionId);
  reviewSource.parse(input.source);
  if (!Number.isSafeInteger(input.occurrence) || input.occurrence < 0) {
    throw new Error("account_review_occurrence_invalid");
  }
  const preimage = JSON.stringify([
    ROW_DOMAIN,
    IDENTITY_VERSION,
    input.ownerId,
    input.sessionId,
    input.source,
    input.sourceRecordKey,
    input.sourceFinancialKey,
    input.occurrence,
  ]);
  return uuidV8FromSha256(await input.hashProvider.digestUtf8(preimage));
}

/** Manually named row drafts cannot alias parser-derived group evidence. */
const MANUAL_ROW_DRAFT_DOMAIN = "monyvi.account-review.manual-row-account";
export function manualRowAccountDraftRef(rowId: string, nonce: string): string {
  return [
    "manual-row-account/v1",
    canonicalUuid.parse(rowId),
    canonicalUuid.parse(nonce),
  ].join(":");
}

export interface ManualRowAccountReviewGroupIdentityInput {
  readonly ownerId: AccountReviewSession["ownerId"];
  readonly sessionId: AccountReviewSession["sessionId"];
  readonly source: AccountReviewSession["source"];
  readonly rowId: AccountReviewRow["rowId"];
  readonly nonce: string;
  readonly role: "source" | "destination";
  readonly identity: {
    readonly name: AccountReviewGroup["name"];
    readonly type: NonNullable<AccountReviewGroup["type"]>;
    readonly currency: AccountReviewGroup["currency"];
  };
  readonly hashProvider: Sha256Provider;
}

/** Domain-separated local SHA-256, including explicit row/currency and nonce. */
export async function deriveManualRowAccountReviewGroupIdentity(
  input: ManualRowAccountReviewGroupIdentityInput
): Promise<Pick<AccountReviewGroup, "groupId" | "evidenceKey">> {
  const preimage = JSON.stringify([
    MANUAL_ROW_DRAFT_DOMAIN,
    IDENTITY_VERSION,
    canonicalUuid.parse(input.ownerId),
    canonicalUuid.parse(input.sessionId),
    reviewSource.parse(input.source),
    canonicalUuid.parse(input.rowId),
    input.role,
    canonicalUuid.parse(input.nonce),
    normalizeGroundedIdentity(input.identity.name),
    accountType.parse(input.identity.type),
    currencyCode.parse(input.identity.currency),
  ]);
  const evidenceKey = hash.parse(await input.hashProvider.digestUtf8(preimage));
  return { evidenceKey, groupId: uuidV8FromSha256(evidenceKey) };
}
