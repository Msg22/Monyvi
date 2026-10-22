/**
 * #395 review transcript fixtures — catalog registry.
 *
 * Read-only lookups over the fixed scenario list plus derived prerequisite
 * roles. No DB, provider, or navigation concerns live here.
 *
 * @module review-transcript-fixtures/catalog
 */

import type { AccountType, CurrencyType } from "@monyvi/db";

import {
  REVIEW_TRANSCRIPT_FIXTURE_SCENARIOS,
  type ReviewTranscriptFixtureAccountRole,
  type ReviewTranscriptFixtureScenario,
  type ReviewTranscriptFixtureTransaction,
} from "./scenarios";

export type { ReviewTranscriptFixtureScenario };

/** Only the identity fields role matching needs; owned snapshots fit. */
export interface ReviewTranscriptFixtureAccountIdentity {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  readonly currency: CurrencyType;
  readonly providerDisplayName: string | null;
  readonly cardLast4: string | null;
}

export interface ReviewTranscriptFixtureRoleInspection {
  readonly role: ReviewTranscriptFixtureAccountRole;
  readonly accountId: string | null;
}

function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").toLowerCase();
}

/**
 * A role is satisfied only by the exact type, currency, grounded provider/name
 * identity, AND the role's card suffix when one is declared. Ignoring the
 * suffix would let a sibling card of the same provider masquerade as this role.
 */
export function findRoleAccountId(
  role: ReviewTranscriptFixtureAccountRole,
  accounts: readonly ReviewTranscriptFixtureAccountIdentity[]
): string | null {
  const expectedProvider = normalizeIdentity(role.providerDisplayName);
  const expectedCard = role.cardLast4?.trim() || null;
  const match = accounts.find((account) => {
    if (
      account.type !== role.accountType ||
      account.currency !== role.currency
    ) {
      return false;
    }
    if (expectedCard !== null && (account.cardLast4 ?? null) !== expectedCard) {
      return false;
    }
    return (
      normalizeIdentity(account.providerDisplayName) === expectedProvider ||
      normalizeIdentity(account.name) === expectedProvider
    );
  });
  return match?.id ?? null;
}

export function inspectReviewTranscriptFixtureRoles(
  roles: readonly ReviewTranscriptFixtureAccountRole[],
  accounts: readonly ReviewTranscriptFixtureAccountIdentity[]
): readonly ReviewTranscriptFixtureRoleInspection[] {
  return roles.map((role) => ({
    role,
    accountId: findRoleAccountId(role, accounts),
  }));
}

export const REVIEW_TRANSCRIPT_FIXTURE_SCENARIO_IDS: readonly string[] =
  Object.freeze(
    REVIEW_TRANSCRIPT_FIXTURE_SCENARIOS.map((scenario) => scenario.id)
  );

export function listReviewTranscriptFixtureScenarios(): readonly ReviewTranscriptFixtureScenario[] {
  return REVIEW_TRANSCRIPT_FIXTURE_SCENARIOS;
}

export function getReviewTranscriptFixtureScenario(
  scenarioId: string
): ReviewTranscriptFixtureScenario | null {
  return (
    REVIEW_TRANSCRIPT_FIXTURE_SCENARIOS.find(
      (scenario) => scenario.id === scenarioId
    ) ?? null
  );
}

/** The complete first transaction of a single-row scenario, if any. */
export function getPrimaryTransaction(
  scenario: ReviewTranscriptFixtureScenario
): ReviewTranscriptFixtureTransaction | null {
  return scenario.transactions[0] ?? null;
}

function roleKey(role: ReviewTranscriptFixtureAccountRole): string {
  return [role.accountType, role.currency, role.key].join("|");
}

/**
 * Union of every prepared prerequisite role across the given scenarios, in
 * stable order, with duplicates removed by role key. Draft-group scenarios
 * never contribute roles: account drafts are created only through review.
 */
export function collectRequiredAccountRoles(
  scenarios: readonly ReviewTranscriptFixtureScenario[] = REVIEW_TRANSCRIPT_FIXTURE_SCENARIOS
): readonly ReviewTranscriptFixtureAccountRole[] {
  const seen = new Set<string>();
  const roles: ReviewTranscriptFixtureAccountRole[] = [];
  for (const scenario of scenarios) {
    for (const role of scenario.requiredAccountRoles) {
      const key = roleKey(role);
      if (seen.has(key)) continue;
      seen.add(key);
      roles.push(role);
    }
  }
  return roles;
}

/** Human-readable dev label for a scenario, never a persisted field. */
export function describeReviewTranscriptFixtureScenario(
  scenario: ReviewTranscriptFixtureScenario
): string {
  return scenario.label;
}
