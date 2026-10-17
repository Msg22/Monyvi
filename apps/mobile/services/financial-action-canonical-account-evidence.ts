/**
 * #395 T069: shared canonical *financial evidence* proof, not inverse
 * compensation or account-state installation. Callers independently decide
 * whether the authenticated canonical graph authorizes their operation.
 *
 * Reuses the original legacy reconciliation SHA-256 and bounded signed-money,
 * revision, chain ordering and head checks. Add passes the complete SQL091
 * server-owned active ID set; legacy passes its actual loaded local account IDs
 * and currencies. Neither caller may invent a local financial row.
 */
import {
  SUPPORTED_CURRENCIES,
  serializeCanonicalJsonValue,
  type CanonicalJsonValue,
  type Sha256Provider,
} from "@monyvi/logic";
import type { CanonicalAccountSnapshot } from "./financial-action-reconciliation-service";

const INVALID = "financial_action_reconciliation_invalid_evidence";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_SIGNED = 9223372036854775807n;
const CURRENCIES: ReadonlySet<string> = new Set(
  SUPPORTED_CURRENCIES.map(({ code }) => code)
);
function refuse(): never {
  throw new Error(INVALID);
}
function signedMinor(value: string): boolean {
  if (!/^-?(0|[1-9]\d*)$/.test(value)) return false;
  const minor = BigInt(value);
  return minor >= -MAX_SIGNED && minor <= MAX_SIGNED;
}
function revision(value: string): boolean {
  return /^(0|[1-9]\d*)$/.test(value) && BigInt(value) <= MAX_SIGNED;
}
function ascii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export interface CanonicalFinancialAccountEvidenceInput {
  readonly canonicalAccounts: readonly CanonicalAccountSnapshot[];
  /** Complete expected set, rather than a subset of present financial guards. */
  readonly expectedAccountIds: readonly string[];
  /** Legacy local-account currency CAS only; Add has remote-only graph members. */
  readonly expectedCurrencies?: ReadonlyMap<string, string>;
  readonly ownerId: string;
  readonly hashProvider: Sha256Provider;
  /** SQL091 stale may legitimately describe an empty entire active graph. */
  readonly allowEmpty?: boolean;
}

/**
 * Complete structural and SHA-256 proof of every canonical server account.
 * Does NOT decide whether the server graph matches the original Add default
 * intent, and never constructs replacement balances, effects or user intent.
 */
export async function verifyCanonicalFinancialAccountEvidence(
  input: CanonicalFinancialAccountEvidenceInput
): Promise<void> {
  const {
    canonicalAccounts,
    expectedAccountIds,
    expectedCurrencies,
    ownerId,
    hashProvider,
  } = input;
  if (
    !UUID.test(ownerId) ||
    (canonicalAccounts.length === 0 && input.allowEmpty !== true)
  )
    refuse();
  const expectedIds = [...expectedAccountIds].sort(ascii);
  const actualIds = canonicalAccounts
    .map((account) => account.accountId)
    .sort(ascii);
  if (
    expectedIds.length !== new Set(expectedIds).size ||
    expectedIds.some((id) => !UUID.test(id)) ||
    actualIds.length !== expectedIds.length ||
    actualIds.some((id, index) => id !== expectedIds[index])
  )
    refuse();

  for (const canonical of canonicalAccounts) {
    if (
      !UUID.test(canonical.accountId) ||
      !revision(canonical.canonicalRevision) ||
      !signedMinor(canonical.balanceMinorUnits) ||
      !CURRENCIES.has(canonical.currency) ||
      (expectedCurrencies !== undefined &&
        expectedCurrencies.get(canonical.accountId) !== canonical.currency) ||
      !SHA256.test(canonical.canonicalEvidenceHash)
    )
      refuse();

    const effects = canonical.effectChain;
    const effectIds = new Set(effects.map((effect) => effect.effectId));
    const hasCanonicalHead = effects.some(
      (effect) =>
        effect.actionId === canonical.canonicalActionId &&
        effect.acceptedRevision === canonical.canonicalRevision
    );
    if (
      effectIds.size !== effects.length ||
      effects.some((effect, index) => {
        const previous = effects[index - 1];
        const ordered =
          !previous ||
          (revision(previous.acceptedRevision) &&
            (BigInt(previous.acceptedRevision) <
              BigInt(effect.acceptedRevision) ||
              (previous.acceptedRevision === effect.acceptedRevision &&
                previous.actionId.localeCompare(effect.actionId) <= 0)));
        return (
          !revision(effect.acceptedRevision) ||
          !UUID.test(effect.actionId) ||
          !signedMinor(effect.amountMinorUnits) ||
          !SHA256.test(effect.effectEvidenceHash) ||
          !UUID.test(effect.effectId) ||
          effect.kind.length === 0 ||
          !ordered
        );
      }) ||
      (effects.length === 0
        ? canonical.canonicalActionId !== null
        : !canonical.canonicalActionId ||
          !UUID.test(canonical.canonicalActionId) ||
          !hasCanonicalHead)
    )
      refuse();

    for (const effect of effects) {
      const effectBody: Readonly<Record<string, CanonicalJsonValue>> = {
        acceptedRevision: effect.acceptedRevision,
        actionId: effect.actionId,
        amountMinorUnits: effect.amountMinorUnits,
        effectId: effect.effectId,
        kind: effect.kind,
      };
      const digest = await hashProvider.digestUtf8(
        serializeCanonicalJsonValue(effectBody)
      );
      if (digest !== effect.effectEvidenceHash) refuse();
    }

    const accountBody: Readonly<Record<string, CanonicalJsonValue>> = {
      accountId: canonical.accountId,
      balanceMinorUnits: canonical.balanceMinorUnits,
      canonicalActionId: canonical.canonicalActionId,
      canonicalRevision: canonical.canonicalRevision,
      currency: canonical.currency,
      effectChain: effects.map((effect) => ({
        acceptedRevision: effect.acceptedRevision,
        actionId: effect.actionId,
        amountMinorUnits: effect.amountMinorUnits,
        effectEvidenceHash: effect.effectEvidenceHash,
        effectId: effect.effectId,
        kind: effect.kind,
      })),
      userId: ownerId,
    };
    const digest = await hashProvider.digestUtf8(
      serializeCanonicalJsonValue(accountBody)
    );
    if (digest !== canonical.canonicalEvidenceHash) refuse();
  }
}
