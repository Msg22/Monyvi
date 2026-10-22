/** Shared closed canonical-account outcome decoder; no DB dependencies. */
import {
  FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES,
  type CanonicalAccountSnapshot,
  type CanonicalEffectSnapshot,
} from "./financial-action-reconciliation-service";

function fail(): never {
  throw new Error(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[]
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function readString(
  value: Readonly<Record<string, unknown>>,
  key: string
): string {
  const candidate = value[key];
  if (typeof candidate !== "string") fail();
  return candidate;
}

function parseCanonicalEffect(value: unknown): CanonicalEffectSnapshot {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "acceptedRevision",
      "actionId",
      "amountMinorUnits",
      "effectEvidenceHash",
      "effectId",
      "kind",
    ])
  ) {
    fail();
  }
  return Object.freeze({
    acceptedRevision: readString(value, "acceptedRevision"),
    actionId: readString(value, "actionId"),
    amountMinorUnits: readString(value, "amountMinorUnits"),
    effectEvidenceHash: readString(value, "effectEvidenceHash"),
    effectId: readString(value, "effectId"),
    kind: readString(value, "kind"),
  });
}

function parseCanonicalAccount(value: unknown): CanonicalAccountSnapshot {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "accountId",
      "balanceMinorUnits",
      "canonicalActionId",
      "canonicalEvidenceHash",
      "canonicalRevision",
      "currency",
      "effectChain",
    ]) ||
    !Array.isArray(value.effectChain) ||
    !(
      value.canonicalActionId === null ||
      typeof value.canonicalActionId === "string"
    )
  ) {
    fail();
  }
  return Object.freeze({
    accountId: readString(value, "accountId"),
    balanceMinorUnits: readString(value, "balanceMinorUnits"),
    canonicalActionId: value.canonicalActionId,
    canonicalEvidenceHash: readString(value, "canonicalEvidenceHash"),
    canonicalRevision: readString(value, "canonicalRevision"),
    currency: readString(value, "currency"),
    effectChain: Object.freeze(value.effectChain.map(parseCanonicalEffect)),
  });
}

export function parseCanonicalAccountsFromOutcomeJson(
  outcomeJson: string | null
): readonly CanonicalAccountSnapshot[] | undefined {
  if (outcomeJson === null) return undefined;
  let outcome: unknown;
  try {
    outcome = JSON.parse(outcomeJson);
  } catch {
    fail();
  }
  if (!isObject(outcome)) fail();
  if (outcome.canonicalAccounts === undefined) return undefined;
  if (!Array.isArray(outcome.canonicalAccounts)) fail();
  return Object.freeze(outcome.canonicalAccounts.map(parseCanonicalAccount));
}
