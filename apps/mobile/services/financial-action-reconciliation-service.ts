import {
  CURRENCY_PRECISION,
  DEFAULT_PRECISION,
  fromMinorUnits,
  parseCanonicalDecimal,
  parseFinancialActionEnvelopeJson,
  serializeCanonicalJsonValue,
  serializeDecimal,
  type CanonicalJsonValue,
  type Sha256Provider,
} from "@monyvi/logic";

export const FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES = {
  INCOMPLETE: "financial_action_reconciliation_incomplete",
  INVALID_EVIDENCE: "financial_action_reconciliation_invalid_evidence",
  REVISION_STALE: "financial_action_reconciliation_revision_stale",
} as const;

export interface ReconciliationAccountSnapshot {
  readonly accountId: string;
  readonly balance: number;
  readonly currency: string;
  readonly financialRevision: string;
}

export interface ReconciliationEffectSnapshot {
  readonly acceptedAccountRevision: string;
  readonly accountId: string;
  readonly actionId: string;
  readonly amountMinorUnits: string;
  readonly currency: string;
  readonly effectId: string;
  readonly isEffective: boolean;
  readonly reversesEffectId: string | null;
}

export interface FinancialActionReconciliationBundle {
  readonly accounts: readonly ReconciliationAccountSnapshot[];
  readonly actionId: string;
  readonly canonicalAccounts?: readonly CanonicalAccountSnapshot[];
  readonly domain: string;
  readonly effects: readonly ReconciliationEffectSnapshot[];
  /** Device-local recovery evidence; never serialize into the action outbox. */
  readonly localSmsReviewDraftSnapshot: Readonly<
    Record<string, CanonicalJsonValue>
  > | null;
  readonly payloadJson: string;
  readonly state: string;
  readonly userId: string;
}

export interface CanonicalEffectSnapshot {
  readonly acceptedRevision: string;
  readonly actionId: string;
  readonly amountMinorUnits: string;
  readonly effectEvidenceHash: string;
  readonly effectId: string;
  readonly kind: string;
}

export interface CanonicalAccountSnapshot {
  readonly accountId: string;
  readonly balanceMinorUnits: string;
  readonly canonicalActionId: string | null;
  readonly canonicalEvidenceHash: string;
  readonly canonicalRevision: string;
  readonly currency: string;
  readonly effectChain: readonly CanonicalEffectSnapshot[];
}

export interface InstallCanonicalAccountSnapshotInput {
  readonly actionId: string;
  readonly canonicalAccounts: readonly CanonicalAccountSnapshot[];
  readonly expectedAccounts: readonly ReconciliationAccountSnapshot[];
  readonly losingEffects: readonly ReconciliationEffectSnapshot[];
  readonly userId: string;
}

export interface SmsReviewDraftRestoreMutation {
  readonly createdAt: string;
  readonly draftId: string;
  readonly parsedAt: string;
  readonly payloadJson: string;
  readonly payloadVersion: number;
  readonly position: number;
  readonly queueId: string;
  readonly selectionOverride: boolean | null;
  readonly smsFingerprint: string;
  readonly updatedAt: string;
}

export interface CompensationAccountMutation {
  readonly accountId: string;
  readonly expectedRevision: string;
  readonly nextBalance: number;
  readonly nextRevision: string;
}

export interface CompensationEffectMutation {
  readonly acceptedAccountRevision: string;
  readonly accountId: string;
  readonly amountMinorUnits: string;
  readonly currency: string;
  readonly originalEffectId: string;
}

export interface CommitFinancialActionCompensationInput {
  readonly accountMutations: readonly CompensationAccountMutation[];
  readonly actionId: string;
  readonly effectMutations: readonly CompensationEffectMutation[];
  readonly smsReviewDraftRestore: SmsReviewDraftRestoreMutation | null;
  readonly userId: string;
}

export interface FinancialActionReconciliationDependencies {
  readonly commitCompensationAtomically: (
    input: CommitFinancialActionCompensationInput
  ) => Promise<void>;
  readonly loadReconciliationBundle: (
    actionId: string
  ) => Promise<FinancialActionReconciliationBundle>;
  readonly hashProvider: Sha256Provider;
  readonly installCanonicalSnapshotAtomically?: (
    input: InstallCanonicalAccountSnapshotInput
  ) => Promise<void>;
}

export interface FinancialActionReconciliationService {
  readonly reconcileRejectedAction: (
    actionId: string
  ) => Promise<"reconciled" | "replay">;
}

function fail(code: string): never {
  throw new Error(code);
}

function isObject(
  value: CanonicalJsonValue | undefined
): value is Readonly<Record<string, CanonicalJsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArray(
  value: CanonicalJsonValue | undefined
): value is readonly CanonicalJsonValue[] {
  return Array.isArray(value);
}

function readSafeUnsignedInteger(value: CanonicalJsonValue): number {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
  }
  return parsed;
}

async function readSmsReviewDraftRestore(
  bundle: FinancialActionReconciliationBundle,
  hashProvider: Sha256Provider
): Promise<SmsReviewDraftRestoreMutation | null> {
  if (bundle.domain !== "sms") return null;
  let envelope: ReturnType<typeof parseFinancialActionEnvelopeJson>;
  try {
    envelope = parseFinancialActionEnvelopeJson(bundle.payloadJson);
  } catch {
    fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
  }
  if (
    envelope.actionId !== bundle.actionId ||
    envelope.userId !== bundle.userId ||
    envelope.domain !== "sms" ||
    envelope.kind !== "review_confirm" ||
    envelope.payload.operationCode !== "sms.review-durable"
  ) {
    fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
  }
  const mutation = envelope.payload.domainMutation;
  if (!isObject(mutation) || !isArray(mutation.records)) {
    fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
  }
  const draftRecords = mutation.records.filter(
    (record) => isObject(record) && record.entity === "sms_review_draft_item"
  );
  const draftRecord = draftRecords[0];
  if (
    draftRecords.length !== 1 ||
    !isObject(draftRecord) ||
    draftRecord.mode !== "delete" ||
    !isObject(draftRecord.after)
  ) {
    fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
  }
  const descriptor = draftRecord.after;
  const snapshot = bundle.localSmsReviewDraftSnapshot;
  if (
    !snapshot ||
    snapshot.userId !== bundle.userId ||
    snapshot.id !== descriptor.id ||
    snapshot.queueId !== descriptor.queueId ||
    snapshot.smsFingerprint !== descriptor.smsFingerprint
  ) {
    fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
  }
  const canonicalSnapshot = {
    createdAt: snapshot.createdAt,
    id: snapshot.id,
    parsedAt: snapshot.parsedAt,
    payloadJson: snapshot.payloadJson,
    payloadVersion: snapshot.payloadVersion,
    position: snapshot.position,
    queueId: snapshot.queueId,
    selectionOverride: snapshot.selectionOverride,
    smsFingerprint: snapshot.smsFingerprint,
    updatedAt: snapshot.updatedAt,
    userId: snapshot.userId,
  };
  const computedHash = await hashProvider.digestUtf8(
    JSON.stringify(canonicalSnapshot)
  );
  if (computedHash !== descriptor.snapshotHash) {
    fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
  }
  if (
    typeof snapshot.createdAt !== "string" ||
    typeof snapshot.id !== "string" ||
    typeof snapshot.parsedAt !== "string" ||
    typeof snapshot.payloadJson !== "string" ||
    typeof snapshot.queueId !== "string" ||
    !(
      typeof snapshot.selectionOverride === "boolean" ||
      snapshot.selectionOverride === null
    ) ||
    typeof snapshot.smsFingerprint !== "string" ||
    typeof snapshot.updatedAt !== "string"
  ) {
    fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
  }
  return {
    createdAt: snapshot.createdAt,
    draftId: snapshot.id,
    parsedAt: snapshot.parsedAt,
    payloadJson: snapshot.payloadJson,
    payloadVersion: readSafeUnsignedInteger(snapshot.payloadVersion),
    position: readSafeUnsignedInteger(snapshot.position),
    queueId: snapshot.queueId,
    selectionOverride: snapshot.selectionOverride,
    smsFingerprint: snapshot.smsFingerprint,
    updatedAt: snapshot.updatedAt,
  };
}

function currencyPlaces(currency: string): number {
  return (
    CURRENCY_PRECISION[currency as keyof typeof CURRENCY_PRECISION] ??
    DEFAULT_PRECISION
  );
}

function addMinorUnits(
  balance: number,
  amountMinorUnits: string,
  currency: string
): number {
  const exact = serializeDecimal(
    parseCanonicalDecimal(String(balance)).plus(
      fromMinorUnits(amountMinorUnits, currencyPlaces(currency))
    )
  );
  const result = Number(exact);
  if (!Number.isFinite(result) || serializeDecimal(String(result)) !== exact) {
    fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
  }
  return result;
}

async function buildCompensation(
  bundle: FinancialActionReconciliationBundle,
  hashProvider: Sha256Provider
): Promise<CommitFinancialActionCompensationInput | null> {
  if (
    bundle.state === "reconciled" &&
    bundle.effects.every((effect) => !effect.isEffective)
  ) {
    return null;
  }
  if (
    bundle.state !== "rejected_compensating" ||
    bundle.effects.length === 0 ||
    bundle.effects.some(
      (effect) =>
        !effect.isEffective ||
        effect.reversesEffectId !== null ||
        effect.actionId !== bundle.actionId
    )
  )
    fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);

  const effectsByAccount = new Map<string, ReconciliationEffectSnapshot>();
  bundle.effects.forEach((effect) => {
    if (effectsByAccount.has(effect.accountId)) {
      fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
    }
    effectsByAccount.set(effect.accountId, effect);
  });
  const sortedAccounts = [...bundle.accounts].sort((left, right) =>
    left.accountId.localeCompare(right.accountId)
  );
  if (
    sortedAccounts.length !== effectsByAccount.size ||
    sortedAccounts.some((account) => !effectsByAccount.has(account.accountId))
  )
    fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);

  const accountMutations: CompensationAccountMutation[] = [];
  const effectMutations: CompensationEffectMutation[] = [];
  sortedAccounts.forEach((account) => {
    const effect = effectsByAccount.get(account.accountId);
    if (!effect || effect.currency !== account.currency) {
      fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
    }
    const nextRevision = BigInt(account.financialRevision) + 1n;
    if (nextRevision > 9223372036854775807n) {
      fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
    }
    const reversedAmount = (-BigInt(effect.amountMinorUnits)).toString();
    accountMutations.push({
      accountId: account.accountId,
      expectedRevision: account.financialRevision,
      nextBalance: addMinorUnits(
        account.balance,
        reversedAmount,
        account.currency
      ),
      nextRevision: nextRevision.toString(),
    });
    effectMutations.push({
      acceptedAccountRevision: nextRevision.toString(),
      accountId: account.accountId,
      amountMinorUnits: reversedAmount,
      currency: account.currency,
      originalEffectId: effect.effectId,
    });
  });
  return {
    accountMutations: Object.freeze(accountMutations),
    actionId: bundle.actionId,
    effectMutations: Object.freeze(effectMutations),
    smsReviewDraftRestore: await readSmsReviewDraftRestore(
      bundle,
      hashProvider
    ),
    userId: bundle.userId,
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_SIGNED_BIGINT = 9223372036854775807n;

function isCanonicalSignedBigint(value: string): boolean {
  if (!/^-?(0|[1-9]\d*)$/.test(value)) return false;
  const parsed = BigInt(value);
  return parsed >= -MAX_SIGNED_BIGINT && parsed <= MAX_SIGNED_BIGINT;
}

function isCanonicalRevision(value: string): boolean {
  if (!/^(0|[1-9]\d*)$/.test(value)) return false;
  return BigInt(value) <= MAX_SIGNED_BIGINT;
}

function assertCanonicalAccounts(
  bundle: FinancialActionReconciliationBundle
): readonly CanonicalAccountSnapshot[] | null {
  const canonicalAccounts = bundle.canonicalAccounts;
  if (canonicalAccounts === undefined) return null;
  const localAccounts = new Map(
    bundle.accounts.map((account) => [account.accountId, account])
  );
  if (
    canonicalAccounts.length === 0 ||
    canonicalAccounts.length !== localAccounts.size ||
    canonicalAccounts.some((canonical) => {
      const local = localAccounts.get(canonical.accountId);
      const effectIds = new Set(canonical.effectChain.map((effect) => effect.effectId));
      const hasCanonicalHead = canonical.effectChain.some(
        (effect) =>
          effect.actionId === canonical.canonicalActionId &&
          effect.acceptedRevision === canonical.canonicalRevision
      );
      return (
        !local ||
        local.currency !== canonical.currency ||
        !UUID_PATTERN.test(canonical.accountId) ||
        !isCanonicalRevision(canonical.canonicalRevision) ||
        !isCanonicalSignedBigint(canonical.balanceMinorUnits) ||
        !SHA256_PATTERN.test(canonical.canonicalEvidenceHash) ||
        effectIds.size !== canonical.effectChain.length ||
        canonical.effectChain.some(
          (effect, index) => {
            const previous = canonical.effectChain[index - 1];
            const isOrdered =
              !previous ||
              BigInt(previous.acceptedRevision) < BigInt(effect.acceptedRevision) ||
              (previous.acceptedRevision === effect.acceptedRevision &&
                previous.actionId.localeCompare(effect.actionId) <= 0);
            return (
              !isCanonicalRevision(effect.acceptedRevision) ||
              !UUID_PATTERN.test(effect.actionId) ||
              !isCanonicalSignedBigint(effect.amountMinorUnits) ||
              !SHA256_PATTERN.test(effect.effectEvidenceHash) ||
              !UUID_PATTERN.test(effect.effectId) ||
              effect.kind.length === 0 ||
              !isOrdered
            );
          }
        ) ||
        (canonical.effectChain.length === 0
          ? canonical.canonicalActionId !== null
          : !canonical.canonicalActionId ||
            !UUID_PATTERN.test(canonical.canonicalActionId) ||
            !hasCanonicalHead)
      );
    })
  ) {
    fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
  }
  return canonicalAccounts;
}

async function verifyCanonicalAccounts(
  bundle: FinancialActionReconciliationBundle,
  hashProvider: Sha256Provider
): Promise<readonly CanonicalAccountSnapshot[] | null> {
  const canonicalAccounts = assertCanonicalAccounts(bundle);
  if (!canonicalAccounts) return null;
  for (const canonical of canonicalAccounts) {
    for (const effect of canonical.effectChain) {
      const effectBody: Readonly<Record<string, CanonicalJsonValue>> = {
        acceptedRevision: effect.acceptedRevision,
        actionId: effect.actionId,
        amountMinorUnits: effect.amountMinorUnits,
        effectId: effect.effectId,
        kind: effect.kind,
      };
      const effectHash = await hashProvider.digestUtf8(
        serializeCanonicalJsonValue(effectBody)
      );
      if (effectHash !== effect.effectEvidenceHash) {
        fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
      }
    }
    const accountBody: Readonly<Record<string, CanonicalJsonValue>> = {
      accountId: canonical.accountId,
      balanceMinorUnits: canonical.balanceMinorUnits,
      canonicalActionId: canonical.canonicalActionId,
      canonicalRevision: canonical.canonicalRevision,
      currency: canonical.currency,
      effectChain: canonical.effectChain.map((effect) => ({
        acceptedRevision: effect.acceptedRevision,
        actionId: effect.actionId,
        amountMinorUnits: effect.amountMinorUnits,
        effectEvidenceHash: effect.effectEvidenceHash,
        effectId: effect.effectId,
        kind: effect.kind,
      })),
      userId: bundle.userId,
    };
    const accountHash = await hashProvider.digestUtf8(
      serializeCanonicalJsonValue(accountBody)
    );
    if (accountHash !== canonical.canonicalEvidenceHash) {
      fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
    }
  }
  return canonicalAccounts;
}

export function createFinancialActionReconciliationService(
  dependencies: FinancialActionReconciliationDependencies
): FinancialActionReconciliationService {
  return {
    reconcileRejectedAction: async (
      actionId: string
    ): Promise<"reconciled" | "replay"> => {
      const bundle = await dependencies.loadReconciliationBundle(actionId);
      if (bundle.actionId !== actionId) {
        fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
      }
      const canonicalAccounts = await verifyCanonicalAccounts(
        bundle,
        dependencies.hashProvider
      );
      if (canonicalAccounts) {
        if (!dependencies.installCanonicalSnapshotAtomically) {
          fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INCOMPLETE);
        }
        await dependencies.installCanonicalSnapshotAtomically({
          actionId,
          canonicalAccounts,
          expectedAccounts: bundle.accounts,
          losingEffects: bundle.effects,
          userId: bundle.userId,
        });
        return "reconciled";
      }
      const input = await buildCompensation(bundle, dependencies.hashProvider);
      if (!input) return "replay";
      await dependencies.commitCompensationAtomically(input);
      return "reconciled";
    },
  };
}
