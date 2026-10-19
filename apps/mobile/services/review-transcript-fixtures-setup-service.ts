/**
 * #395 review transcript fixtures — explicit prerequisite setup service.
 *
 * Creates ONLY the missing labeled bank/wallet prerequisites a fixture needs,
 * through the existing guarded Add-account writer (`createAccountForUser`).
 * Nothing here runs automatically on page entry or fixture tap; the route
 * exposes an explicit "prepare test accounts" action.
 *
 * Invariants:
 * - refuses to prepare when the profile has no account at all (first-ever
 *   account would silently become the default);
 * - never touches the default/preferred flags, never resets or deletes;
 * - idempotent: an existing matching account is reported, never duplicated;
 * - all accounts open at balance 0 with no default intent.
 *
 * @module review-transcript-fixtures-setup-service
 */

import { assertExpectedCurrentUser } from "./user-data-access";
import {
  createAccountForUser,
  CREATE_ACCOUNT_ERROR_CODES,
} from "./account-service";
import { isReviewTranscriptFixturesRuntimeAvailable } from "./review-transcript-fixtures-launcher-service";
import { loadReviewTranscriptFixturesContext } from "./review-transcript-fixtures-context-service";
import {
  collectRequiredAccountRoles,
  findRoleAccountId,
} from "@/dev/review-transcript-fixtures/catalog";
import type { ReviewTranscriptFixtureAccountRole } from "@/dev/review-transcript-fixtures/scenarios";
import type { AccountFormData } from "@/validation/account-validation";

export type ReviewTranscriptFixtureSetupStatus = "prepared" | "blocked";

export type ReviewTranscriptFixtureSetupBlockReason =
  | "runtime_unavailable"
  | "already_preparing"
  | "no_primary_account"
  | "owner_changed"
  | "creation_failed";

export type ReviewTranscriptFixtureSetupRoleStatus =
  | "existing"
  | "created"
  | "failed";

export interface ReviewTranscriptFixtureSetupRoleResult {
  readonly roleKey: string;
  readonly label: string;
  readonly status: ReviewTranscriptFixtureSetupRoleStatus;
  readonly accountId: string | null;
  readonly errorCode: string | null;
}

export interface ReviewTranscriptFixtureSetupResult {
  readonly status: ReviewTranscriptFixtureSetupStatus;
  readonly reason: ReviewTranscriptFixtureSetupBlockReason | null;
  readonly roles: readonly ReviewTranscriptFixtureSetupRoleResult[];
}

function buildRoleFormData(
  role: ReviewTranscriptFixtureAccountRole
): AccountFormData {
  const base: AccountFormData = {
    name: role.label,
    accountType: role.accountType,
    currency: role.currency,
    balance: "0",
    providerDisplayName: role.providerDisplayName,
    senderNames: [],
    defaultIntent: false,
  };
  if (role.accountType !== "BANK") return base;
  return {
    ...base,
    bankName: role.providerDisplayName,
    cardLast4: role.cardLast4 ?? "",
  };
}

/** Synchronous admission: a second tap cannot start a parallel preparation. */
let isPreparingAccounts = false;

/** Prepare missing roles in stable order; never partial-auto on failure. */
export async function prepareReviewTranscriptFixtureAccounts(): Promise<ReviewTranscriptFixtureSetupResult> {
  if (!isReviewTranscriptFixturesRuntimeAvailable()) {
    return { status: "blocked", reason: "runtime_unavailable", roles: [] };
  }
  if (isPreparingAccounts) {
    return { status: "blocked", reason: "already_preparing", roles: [] };
  }
  isPreparingAccounts = true;

  try {
    const initial = await loadReviewTranscriptFixturesContext();
    if (initial.accounts.length === 0) {
      return { status: "blocked", reason: "no_primary_account", roles: [] };
    }

    const ownerId = initial.ownerId;
    let accounts = initial.accounts;
    const results: ReviewTranscriptFixtureSetupRoleResult[] = [];
    let blockReason: ReviewTranscriptFixtureSetupBlockReason | null = null;

    for (const role of collectRequiredAccountRoles()) {
      if (blockReason !== null) break;
      // Reuse the SAME identity helper as the catalogue, including card suffix.
      const existingId = findRoleAccountId(role, accounts);
      if (existingId !== null) {
        results.push({
          roleKey: role.key,
          label: role.label,
          status: "existing",
          accountId: existingId,
          errorCode: null,
        });
        continue;
      }

      try {
        await assertExpectedCurrentUser(ownerId);
      } catch {
        blockReason = "owner_changed";
        break;
      }

      try {
        const created = await createAccountForUser(
          ownerId,
          buildRoleFormData(role)
        );
        if (!created.success || !created.accountId) {
          results.push({
            roleKey: role.key,
            label: role.label,
            status: "failed",
            accountId: null,
            errorCode:
              created.error ?? CREATE_ACCOUNT_ERROR_CODES.VALIDATION_FAILED,
          });
          blockReason = "creation_failed";
          continue;
        }
        results.push({
          roleKey: role.key,
          label: role.label,
          status: "created",
          accountId: created.accountId,
          errorCode: null,
        });
        // Requery real owned identities so later roles cannot duplicate a
        // sibling card and a rerun sees the account that now exists.
        const refreshed = await loadReviewTranscriptFixturesContext();
        if (refreshed.ownerId !== ownerId) {
          blockReason = "owner_changed";
          break;
        }
        accounts = refreshed.accounts;
      } catch {
        results.push({
          roleKey: role.key,
          label: role.label,
          status: "failed",
          accountId: null,
          errorCode: CREATE_ACCOUNT_ERROR_CODES.VALIDATION_FAILED,
        });
        blockReason = "creation_failed";
      }
    }

    return {
      status: blockReason === null ? "prepared" : "blocked",
      reason: blockReason,
      roles: results,
    };
  } catch {
    return { status: "blocked", reason: "creation_failed", roles: [] };
  } finally {
    isPreparingAccounts = false;
  }
}
