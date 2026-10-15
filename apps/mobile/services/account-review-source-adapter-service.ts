/**
 * #395 T014-M — the single mobile entrypoint for canonical first-session review.
 * Parser transport supplies the original immutable normalization input; only
 * current actor and owner scope are rechecked before publication.
 * No parsing, matching, persistence, provider calls or stateful merge here.
 */
import {
  normalizeAccountReviewParserResult,
  type AccountReviewNormalizationInput,
  type AccountReviewSession,
  type SmsReviewNormalizationInput,
  type VoiceReviewNormalizationInput,
} from "@monyvi/logic";
import { loadAccountReviewAccountSnapshots } from "./account-review-read-model-service";
import { assertExpectedCurrentUser } from "./user-data-access";

/**
 * Recheck the authenticated current owner without resampling captured provider
 * evidence, preference, account metadata or the injected SHA-256 boundary.
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
  // Fresh metadata or unrelated account changes never invalidate original
  // finance. Resolver/Save must separately recheck current account eligibility.
  if (current.ownerId !== input.ownerId) {
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
