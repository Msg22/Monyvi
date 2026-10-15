/**
 * #395 T014-M — the single mobile entrypoint for canonical first-session review.
 * Parser transport supplies the original immutable normalization input; only
 * current actor and owned-account freshness are rechecked before publication.
 * No parsing, matching, persistence, provider calls or stateful merge here.
 */
import {
  normalizeAccountReviewParserResult,
  type AccountReviewNormalizationInput,
  type AccountReviewOwnedContext,
  type AccountReviewSession,
  type SmsReviewNormalizationInput,
  type VoiceReviewNormalizationInput,
} from "@monyvi/logic";
import { loadAccountReviewAccountSnapshots } from "./account-review-read-model-service";
import { assertExpectedCurrentUser } from "./user-data-access";

type OwnedAccount = AccountReviewOwnedContext["accounts"][number];

/** Compare aliases as an immutable multiset; never mutate captured evidence. */
function sameSenderNames(
  captured: readonly string[],
  current: readonly string[]
): boolean {
  if (captured.length !== current.length) return false;
  const first = [...captured].sort();
  const second = [...current].sort();
  return first.every((name, index) => name === second[index]);
}

function sameAccount(
  captured: OwnedAccount,
  current: OwnedAccount
): boolean {
  return captured.id === current.id &&
    captured.name === current.name &&
    captured.type === current.type &&
    captured.currency === current.currency &&
    captured.institutionId === current.institutionId &&
    captured.providerDisplayName === current.providerDisplayName &&
    captured.cardLast4 === current.cardLast4 &&
    captured.isDefault === current.isDefault &&
    sameSenderNames(captured.senderNames, current.senderNames);
}

function sameOwnedAccounts(
  captured: AccountReviewOwnedContext["accounts"],
  current: AccountReviewOwnedContext["accounts"]
): boolean {
  if (captured.length !== current.length) return false;
  const currentById = new Map<string, OwnedAccount>();
  for (const account of current) {
    if (currentById.has(account.id)) return false;
    currentById.set(account.id, account);
  }
  return captured.every((account) => {
    const latest = currentById.get(account.id);
    return latest !== undefined && sameAccount(account, latest);
  });
}

/**
 * Recheck active current-owner accounts without replacing pinned provenance,
 * preference, category UUID mappings or the caller's injected SHA-256 boundary.
 */
async function createAccountReviewSession(
  input: AccountReviewNormalizationInput
): Promise<AccountReviewSession> {
  await assertExpectedCurrentUser(input.ownerId);
  if (input.reviewAccountSnapshots.ownerId !== input.ownerId) {
    throw new Error("account_review_source_owner_mismatch");
  }

  const current = await loadAccountReviewAccountSnapshots();
  await assertExpectedCurrentUser(input.ownerId);
  if (current.ownerId !== input.ownerId ||
      !sameOwnedAccounts(input.reviewAccountSnapshots.accounts, current.accounts)) {
    throw new Error("account_review_owned_snapshot_changed");
  }

  // Pure logic validates captured provider-context parity, financial identity,
  // category UUID mapping and original Voice/SMS evidence with injected hash.
  const result = await normalizeAccountReviewParserResult(input);
  await assertExpectedCurrentUser(input.ownerId);
  if (result.ownerId !== input.ownerId ||
      result.sessionId !== input.sessionId || result.source !== input.source) {
    throw new Error("account_review_session_identity_changed");
  }
  return result;
}

/** Core T012 opts in with this complete, pinned Voice normalization input. */
export function createVoiceAccountReviewSession(
  input: VoiceReviewNormalizationInput
): Promise<AccountReviewSession> {
  return createAccountReviewSession(input);
}

/** T013/T014-M uses one complete accepted SMS session, not a partial chunk. */
export function createSmsAccountReviewSession(
  input: SmsReviewNormalizationInput
): Promise<AccountReviewSession> {
  return createAccountReviewSession(input);
}
