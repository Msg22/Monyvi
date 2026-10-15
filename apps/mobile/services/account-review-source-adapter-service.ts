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
import type { CompleteSmsAccountReviewSessionInput } from "./sms-review-namespace-source-adapter";
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
  if (
    result.ownerId !== input.ownerId ||
    result.sessionId !== input.sessionId ||
    result.source !== input.source
  ) {
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

type SmsReviewSourceAdapterRuntime = Pick<
  typeof import("./sms-review-namespace-source-adapter"),
  "createCompleteSmsAccountReviewSession"
>;

function isSmsReviewSourceAdapterRuntime(
  value: unknown
): value is SmsReviewSourceAdapterRuntime {
  return (
    typeof value === "object" &&
    value !== null &&
    "createCompleteSmsAccountReviewSession" in value &&
    typeof value.createCompleteSmsAccountReviewSession === "function"
  );
}

function loadSmsReviewSourceAdapter(): SmsReviewSourceAdapterRuntime {
  // Like the existing fixture-parser loader: a literal, call-time require keeps
  // SMS storage lazy in Metro and in Jest without a VM-module import callback.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded: unknown = require("./sms-review-namespace-source-adapter");
  if (!isSmsReviewSourceAdapterRuntime(loaded)) {
    throw new Error("sms_review_source_adapter_unavailable");
  }
  return loaded;
}

/** Load the owned-queue runtime only for a complete opted-in SMS session. */
export async function createCompleteSmsAccountReviewSession(
  input: CompleteSmsAccountReviewSessionInput
): Promise<AccountReviewSession> {
  const { createCompleteSmsAccountReviewSession: assemble } =
    loadSmsReviewSourceAdapter();
  return assemble(input);
}
