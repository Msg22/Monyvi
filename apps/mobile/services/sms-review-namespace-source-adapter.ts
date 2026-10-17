/** SMS-only runtime leaf; snapshot-driven Voice imports never load this module. */
import * as Crypto from "expo-crypto";
import type { AccountReviewSession } from "../../../packages/logic/src/account-review/review-schemas";
import type { SmsReviewNormalizationInput } from "../../../packages/logic/src/account-review/normalization-types";
import {
  normalizeCompleteSmsReviewSession,
  type AcceptedSmsReviewChunk,
} from "../../../packages/logic/src/account-review/normalization-session";
import { loadAccountReviewAccountSnapshots } from "./account-review-read-model-service";
import {
  assertOwnedSmsReviewQueueNamespaceCurrent,
  assertSmsReviewNamespaceHashCurrent,
  type OwnedSmsReviewQueueLease,
} from "./sms-review-namespace-lease-service";

export interface CompleteSmsAccountReviewSessionInput {
  readonly reviewAccountSnapshots: SmsReviewNormalizationInput["reviewAccountSnapshots"];
  readonly acceptedReviewChunks: readonly AcceptedSmsReviewChunk[];
  readonly sourceRevision: AccountReviewSession["sourceRevision"];
  readonly namespaceLease: OwnedSmsReviewQueueLease;
}

function ownedSmsHashProvider(
  lease: OwnedSmsReviewQueueLease
): SmsReviewNormalizationInput["hashProvider"] {
  return {
    digestUtf8: async (value: string): Promise<string> => {
      await assertSmsReviewNamespaceHashCurrent(lease);
      const digest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        value
      );
      await assertSmsReviewNamespaceHashCurrent(lease);
      return digest;
    },
  };
}

/** Initial complete SMS candidate only; no durable edit/selection reconciliation. */
export async function createCompleteSmsAccountReviewSession(
  input: CompleteSmsAccountReviewSessionInput
): Promise<AccountReviewSession> {
  const lease = input.namespaceLease;
  await assertOwnedSmsReviewQueueNamespaceCurrent({ lease });
  if (input.reviewAccountSnapshots.ownerId !== lease.expectedUserId) {
    throw new Error("account_review_source_owner_mismatch");
  }
  const current = await loadAccountReviewAccountSnapshots();
  await assertOwnedSmsReviewQueueNamespaceCurrent({ lease });
  if (current.ownerId !== lease.expectedUserId) {
    throw new Error("account_review_owned_snapshot_changed");
  }
  const result = await normalizeCompleteSmsReviewSession({
    ownerId: lease.expectedUserId,
    sessionId: lease.sessionId,
    sourceRevision: input.sourceRevision,
    reviewAccountSnapshots: input.reviewAccountSnapshots,
    acceptedReviewChunks: input.acceptedReviewChunks,
    hashProvider: ownedSmsHashProvider(lease),
  });
  await assertOwnedSmsReviewQueueNamespaceCurrent({ lease });
  return result;
}
