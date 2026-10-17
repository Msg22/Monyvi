/**
 * Add-only private capture proof from the EXISTING foundation prepared
 * postimages. Runs under the original guarded SQLite writer. No network I/O,
 * new schema, or independent public action/recovery entrypoint.
 */
import type { Database, Model } from "@nozbe/watermelondb";
import type { Account, CurrencyType } from "@monyvi/db";
import {
  getCurrencyPrecision,
  toMinorUnits,
  serializeDecimal,
  SUPPORTED_CURRENCIES,
} from "@monyvi/logic";
import { hashFinancialActionEnvelope } from "../../../packages/logic/src/financial-actions";
import { validateAccountCreateDefaultPayload } from "../../../packages/logic/src/financial-actions/account-create-default";
import {
  ACCOUNT_PHYSICAL_COLUMNS,
  type AccountCreateDefaultLocalSaveSnapshot,
} from "../../../packages/logic/src/financial-actions/account-create-default-local-recovery";
import {
  hashAccountReviewLocalPostimage,
  physicalRawField,
  physicalText,
  physicalBoolean,
  physicalDate,
} from "./account-review-local-snapshot-postimages";
import { createAccountReviewFinancialRegistry } from "./account-review-financial-command-service";
import type {
  FinancialActionLinkedOperationPlan,
  FinancialActionLinkedOperationPostimage,
} from "./financial-action-foundation-contracts";
import type { AccountDefaultPreparedCommand } from "./account-default-intent-command";
import type { AccountDefaultPlanDependencies } from "./account-default-intent-plan";
import { normalizeCardLast4ForStorage } from "./card-last4-normalizer";
import { readCompleteDefaultCreatorMembership } from "./account-default-intent-snapshot";

const CURRENCY_SET: ReadonlySet<string> = new Set(
  SUPPORTED_CURRENCIES.map((c) => c.code)
);
function validateCurrency(val: string): CurrencyType {
  if (!CURRENCY_SET.has(val)) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  return val as CurrencyType;
}
function validateRevision(val: string): string {
  if (!/^(?:0|[1-9][0-9]*)$/.test(val))
    fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  return val;
}

export const ACCOUNT_DEFAULT_WRITER_ERRORS = {
  AUTH: "account_default_writer_auth_scope_changed",
  STALE: "account_default_stale_default_snapshot",
  ABSENT: "account_default_writer_create_id_collision",
  INVALID_PLAN: "account_default_writer_invalid_plan",
} as const;
function fail(code: string): never {
  throw new Error(code);
}
function isRecord(raw: unknown): raw is Readonly<Record<string, unknown>> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}
function property(raw: unknown, key: string): unknown {
  if (!isRecord(raw)) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  return raw[key];
}
function expectedModelKeys(
  input: AccountDefaultPreparedCommand
): readonly string[] {
  return [
    "accounts:" + input.accountId,
    ...(input.bankDetailId ? ["bank_details:" + input.bankDetailId] : []),
    ...input.senders.map((sender) => "account_sms_senders:" + sender.id),
    ...(input.effectId ? ["account_financial_effects:" + input.effectId] : []),
    ...(input.snapshot.defaultAccount &&
    (input.form.defaultIntent === true ||
      input.snapshot.activeAccountIds.length === 0)
      ? ["accounts:" + input.snapshot.defaultAccount.accountId]
      : []),
  ].sort();
}
export function verifyPreparedAccountDefaultModels(
  input: AccountDefaultPreparedCommand,
  items: readonly FinancialActionLinkedOperationPostimage[]
): void {
  const expected = expectedModelKeys(input);
  const actual = items.map((row) => row.table + ":" + row.id).sort();
  if (
    expected.length !== actual.length ||
    expected.some((id, index) => actual[index] !== id)
  )
    fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  for (const row of items) {
    if (row.table === "accounts" && row.id === input.accountId) {
      if (
        row.kind !== "create" ||
        property(row.raw, "user_id") !== input.ownerId ||
        property(row.raw, "balance") !== input.openingBalance ||
        property(row.raw, "financial_revision") !==
          (input.effectId ? "1" : "0") ||
        property(row.raw, "is_default") !==
          (input.form.defaultIntent === true ||
            input.snapshot.activeAccountIds.length === 0) ||
        property(row.raw, "currency") !== input.form.currency ||
        property(row.raw, "deleted") !== false
      )
        fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    } else if (
      row.table === "accounts" &&
      row.id === input.snapshot.defaultAccount?.accountId
    ) {
      if (
        row.kind !== "update" ||
        property(row.raw, "user_id") !== input.ownerId ||
        property(row.raw, "is_default") !== false
      )
        fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    } else if (row.table === "account_financial_effects") {
      if (
        row.kind !== "create" ||
        row.id !== input.effectId ||
        property(row.raw, "action_id") !== input.envelope.actionId ||
        property(row.raw, "user_id") !== input.ownerId ||
        property(row.raw, "amount_minor_units") !== input.openingMinorUnits ||
        property(row.raw, "account_id") !== input.accountId ||
        property(row.raw, "accepted_account_revision") !== "1" ||
        property(row.raw, "is_effective") !== true
      )
        fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    } else if (
      (row.table === "bank_details" || row.table === "account_sms_senders") &&
      (row.kind !== "create" ||
        property(row.raw, "account_id") !== input.accountId)
    ) {
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    }
  }
}

/**
 * Do not trust a manually maintained allowlist as schema authority: compare
 * it to the exact physical Watermelon table's column registry (plus id).
 * Any schema drift fails closed until both capture and compensation are
 * independently reviewed for that new field.
 */
function assertActualAccountPhysicalColumns(db: Database): void {
  const table = db.schema.tables.accounts;
  if (!table) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  const declared = new Set(["id", ...Object.keys(table.columns)]);
  if (
    declared.size !== ACCOUNT_PHYSICAL_COLUMNS.size ||
    [...declared].some((column) => !ACCOUNT_PHYSICAL_COLUMNS.has(column))
  )
    fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
}

function assertCreatedPhysicalRecord(
  post: FinancialActionLinkedOperationPostimage,
  table: string,
  occurredAt: string,
  domainCreate = true
): void {
  if (
    post.table !== table ||
    post.kind !== "create" ||
    post.raw._status !== "created" ||
    physicalBoolean(post.raw, "deleted") !== false
  )
    fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  const createdAt = physicalDate(post.raw, "created_at");
  if (domainCreate && createdAt !== occurredAt)
    fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  // Device timestamps are part of each immutable physical hash and must
  // be genuine safe persisted milliseconds, not inferred from the form.
  physicalDate(post.raw, "updated_at");
}

function assertOnlyPriorDefaultChanged(
  original: Readonly<Model["_raw"]>,
  prepared: Readonly<Model["_raw"]>
): void {
  for (const key of Object.keys(original)) {
    if (
      key === "is_default" ||
      key === "_changed" ||
      key === "_status" ||
      key === "updated_at"
    )
      continue;
    if (physicalRawField(original, key) !== physicalRawField(prepared, key))
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  }
  for (const key of Object.keys(prepared)) {
    if (
      !(key in original) &&
      key !== "_changed" &&
      key !== "_status" &&
      key !== "updated_at"
    )
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  }
  physicalDate(original, "created_at");
  physicalDate(original, "updated_at");
  physicalDate(prepared, "created_at");
  physicalDate(prepared, "updated_at");
}

/** Compare authorized domain fields before retaining their full physical hashes. */
function assertPreparedCreateAuthority(
  payload: ReturnType<typeof validateAccountCreateDefaultPayload>,
  prepared: readonly FinancialActionLinkedOperationPostimage[],
  ownerId: string
): void {
  for (const mutation of payload.domainMutation.records) {
    if (mutation.mode !== "create") continue;
    const table =
      mutation.entity === "account"
        ? "accounts"
        : mutation.entity === "bank_details"
          ? "bank_details"
          : "account_sms_senders";
    const matches = prepared.filter(
      (post) =>
        post.kind === "create" &&
        post.table === table &&
        post.id === mutation.after.id
    );
    const post = matches[0];
    if (matches.length !== 1 || !post)
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    if (
      physicalText(post.raw, "id") !== mutation.after.id ||
      physicalBoolean(post.raw, "deleted") !== mutation.after.deleted ||
      physicalDate(post.raw, "created_at") !== mutation.after.createdAt
    )
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);

    const expectedFields: Readonly<Record<string, unknown>> =
      mutation.entity === "account"
        ? {
            user_id: ownerId,
            name: mutation.after.name,
            type: mutation.after.type,
            currency: mutation.after.currency,
            institution_id: mutation.after.institutionId,
            provider_display_name: mutation.after.providerDisplayName,
            is_default: mutation.after.isDefault,
          }
        : mutation.entity === "bank_details"
          ? {
              account_id: mutation.after.accountId,
              account_number: mutation.after.accountNumber,
              // Public cardLast4 is a validated four-digit string ("0042"); the
              // existing BankDetails writer stores card_last_4 as number (42).
              // An absent optional card is a physical null, never an invented key.
              card_last_4:
                normalizeCardLast4ForStorage(mutation.after.cardLast4) ?? null,
            }
          : {
              account_id: mutation.after.accountId,
              sender_name: mutation.after.senderName,
              normalized_sender_name: mutation.after.normalizedSenderName,
            };
    if (
      Object.entries(expectedFields).some(
        ([column, expected]) => physicalRawField(post.raw, column) !== expected
      )
    )
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);

    if (mutation.entity === "account") {
      const balance = physicalRawField(post.raw, "balance");
      if (
        typeof balance !== "number" ||
        !Number.isFinite(balance) ||
        toMinorUnits(
          serializeDecimal(String(balance)),
          getCurrencyPrecision(mutation.after.currency)
        ) !== mutation.after.openingBalanceMinorUnits ||
        physicalText(post.raw, "financial_revision") !==
          (mutation.after.openingBalanceMinorUnits === "0" ? "0" : "1")
      )
        fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    }
  }
}

type CaptureEvidence = Parameters<
  NonNullable<FinancialActionLinkedOperationPlan["buildLocalRecoverySnapshot"]>
>[0];

/** The original twelve-key private snapshot, not a new data carrier. */
export async function captureAccountDefaultLocalSnapshot(
  input: AccountDefaultPreparedCommand,
  dep: AccountDefaultPlanDependencies,
  accounts: readonly Account[],
  previous: Account | undefined,
  evidence: CaptureEvidence
): Promise<AccountCreateDefaultLocalSaveSnapshot> {
  const hashProvider = dep.hashProvider ?? input.hashProvider;
  if (!hashProvider) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);

  const payloadHash = evidence.payloadHash;
  if (!payloadHash || evidence.userId !== input.ownerId)
    fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  assertActualAccountPhysicalColumns(dep.database);
  verifyPreparedAccountDefaultModels(input, evidence.preparedPostimages);
  // Recompute original immutable public authority independently of
  // the private builder. Do not trust a supplied snapshot/hash alone.
  const registry = createAccountReviewFinancialRegistry();
  const canonical = await hashFinancialActionEnvelope(
    input.envelope,
    hashProvider,
    registry
  );
  if (
    canonical.payloadHash !== payloadHash ||
    input.envelope.actionId === input.accountId ||
    input.envelope.userId !== input.ownerId ||
    input.envelope.domain !== "accounts" ||
    input.envelope.kind !== "create_with_default" ||
    input.envelope.domainReferenceId !== input.accountId ||
    input.envelope.payloadVersion !== "account.create-default/v1"
  )
    fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  const publicPayload = validateAccountCreateDefaultPayload(
    input.envelope.payload
  );
  if (
    JSON.stringify(publicPayload.expectedDefaultSnapshot) !==
      JSON.stringify(input.snapshot) ||
    publicPayload.accountEffects.length !== (input.effectId ? 1 : 0) ||
    publicPayload.accountEffects.some(
      (effect) =>
        effect.effectId !== input.effectId ||
        effect.accountId !== input.accountId ||
        effect.amountMinorUnits !== input.openingMinorUnits ||
        effect.currency !== input.form.currency
    ) ||
    input.envelope.accountGuards.length !== (input.effectId ? 1 : 0) ||
    input.envelope.accountGuards.some(
      (guard) =>
        guard.accountId !== input.accountId || guard.expectedRevision !== "0"
    )
  )
    fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  const createRecords = publicPayload.domainMutation.records.filter(
    (record) => record.mode === "create"
  );
  const stagedCreates = evidence.preparedPostimages.filter(
    (row) => row.kind === "create"
  );
  if (
    stagedCreates.length !== createRecords.length + (input.effectId ? 1 : 0) ||
    createRecords.some(
      (record) =>
        !stagedCreates.some(
          (post) =>
            post.id === record.after.id &&
            post.table ===
              (record.entity === "account"
                ? "accounts"
                : record.entity === "bank_details"
                  ? "bank_details"
                  : "account_sms_senders")
        )
    )
  )
    fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  assertPreparedCreateAuthority(
    publicPayload,
    evidence.preparedPostimages,
    input.ownerId
  );
  // No invented predecessor: check the original creator ancestry again
  // against actual owned immutable roots while this same writer is held.
  const scope = await dep.getCurrentUserDataScope();
  if (scope.userId !== input.ownerId) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.AUTH);
  const completeAtWriter = await readCompleteDefaultCreatorMembership(
    dep.database,
    scope,
    input.snapshot,
    hashProvider
  );
  const capturedCreatorRoots = input.dependencyRoots ?? [];
  const originalUnresolvedIds = new Set(input.dependencyActionIds);
  const sameCreatorRoots = (
    candidate: ReadonlyArray<{
      readonly actionId: string;
      readonly payloadHash: string;
    }>
  ): boolean =>
    candidate.length === capturedCreatorRoots.length &&
    candidate.every(
      (creator, index) =>
        creator.actionId === capturedCreatorRoots[index]?.actionId &&
        creator.payloadHash === capturedCreatorRoots[index]?.payloadHash
    );
  if (
    // The entire ORIGINAL creator set, not only pending creators, is
    // immutable through prepare->commit and subsequent local recovery.
    !sameCreatorRoots(completeAtWriter.dependencyRoots) ||
    input.dependencyActionIds.some(
      (id) => !capturedCreatorRoots.some((creator) => creator.actionId === id)
    ) ||
    // An unresolved creator may legitimately accept while B is waiting;
    // a newly unresolved prior-accepted creator may NOT be silently
    // substituted into the original push-order authority.
    completeAtWriter.unresolvedActionIds.some(
      (id) => !originalUnresolvedIds.has(id)
    )
  )
    fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  await dep.assertExpectedCurrentUser(input.ownerId);

  const accountPost = evidence.preparedPostimages.find(
    (p) => p.table === "accounts" && p.id === input.accountId
  );
  if (!accountPost) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  assertCreatedPhysicalRecord(
    accountPost,
    "accounts",
    input.envelope.occurredAt
  );

  const postUserId = physicalText(accountPost.raw, "user_id");
  if (postUserId !== input.ownerId)
    fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  const postCurrency = validateCurrency(
    physicalText(accountPost.raw, "currency")
  );
  const postBalanceNumber = physicalRawField(accountPost.raw, "balance");
  if (
    typeof postBalanceNumber !== "number" ||
    !Number.isFinite(postBalanceNumber)
  ) {
    fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  }
  const postPlaces = getCurrencyPrecision(postCurrency);
  const postBalanceMinorUnits = toMinorUnits(
    serializeDecimal(String(postBalanceNumber)),
    postPlaces
  );
  const postFinancialRevision = validateRevision(
    physicalText(accountPost.raw, "financial_revision")
  );
  const isDefault = physicalBoolean(accountPost.raw, "is_default");
  const postDeleted = physicalBoolean(accountPost.raw, "deleted");
  if (postDeleted !== false) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);

  const accountPostimageHash = await hashAccountReviewLocalPostimage({
    table: "accounts",
    id: input.accountId,
    raw: accountPost.raw,
    hashProvider,
  });

  const createdAccount: AccountCreateDefaultLocalSaveSnapshot["createdAccount"] =
    {
      accountId: input.accountId,
      preimage: null,
      postimage: {
        userId: postUserId,
        currency: postCurrency,
        balanceMinorUnits: postBalanceMinorUnits,
        financialRevision: postFinancialRevision,
        isDefault,
        deleted: false,
      },
      expectedPostimageHash: accountPostimageHash,
    };

  const bankDetailsPost = input.bankDetailId
    ? evidence.preparedPostimages.find(
        (p) => p.table === "bank_details" && p.id === input.bankDetailId
      )
    : null;

  if (bankDetailsPost)
    assertCreatedPhysicalRecord(
      bankDetailsPost,
      "bank_details",
      input.envelope.occurredAt
    );

  const senderPosts = input.senders.map((sender) => {
    const found = evidence.preparedPostimages.find(
      (p) => p.table === "account_sms_senders" && p.id === sender.id
    );
    if (!found) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    assertCreatedPhysicalRecord(
      found,
      "account_sms_senders",
      input.envelope.occurredAt
    );
    return found;
  });

  const createdChildren: AccountCreateDefaultLocalSaveSnapshot["createdChildren"] =
    await Promise.all([
      ...(bankDetailsPost
        ? [
            (async () => {
              const childAccountId = physicalText(
                bankDetailsPost.raw,
                "account_id"
              );
              if (childAccountId !== input.accountId) {
                fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
              }
              return {
                entity: "bank_details" as const,
                id: bankDetailsPost.id,
                accountId: input.accountId,
                preimage: null,
                expectedPostimageHash: await hashAccountReviewLocalPostimage({
                  table: "bank_details",
                  id: bankDetailsPost.id,
                  raw: bankDetailsPost.raw,
                  hashProvider,
                }),
              };
            })(),
          ]
        : []),
      ...senderPosts.map(async (senderPost) => {
        const childAccountId = physicalText(senderPost.raw, "account_id");
        if (childAccountId !== input.accountId) {
          fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
        }
        return {
          entity: "account_sms_sender" as const,
          id: senderPost.id,
          accountId: input.accountId,
          preimage: null,
          expectedPostimageHash: await hashAccountReviewLocalPostimage({
            table: "account_sms_senders",
            id: senderPost.id,
            raw: senderPost.raw,
            hashProvider,
          }),
        };
      }),
    ]);

  createdChildren.sort((a, b) => {
    const left = a.entity + ":" + a.id;
    const right = b.entity + ":" + b.id;
    return left < right ? -1 : left > right ? 1 : 0;
  });

  let openingEffect: AccountCreateDefaultLocalSaveSnapshot["openingEffect"] =
    null;
  if (input.effectId !== null) {
    const effectPost = evidence.preparedPostimages.find(
      (p) => p.table === "account_financial_effects" && p.id === input.effectId
    );
    if (!effectPost) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    assertCreatedPhysicalRecord(
      effectPost,
      "account_financial_effects",
      input.envelope.occurredAt,
      false
    );
    if (
      physicalRawField(effectPost.raw, "compensated_at") !== null ||
      physicalRawField(effectPost.raw, "reverses_effect_id") !== null
    )
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);

    const effectUserId = physicalText(effectPost.raw, "user_id");
    if (effectUserId !== input.ownerId)
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    const effectAccountId = physicalText(effectPost.raw, "account_id");
    if (effectAccountId !== input.accountId)
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    const effectActionId = physicalText(effectPost.raw, "action_id");
    if (effectActionId !== input.envelope.actionId)
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    const effectCurrency = validateCurrency(
      physicalText(effectPost.raw, "currency")
    );
    const effectAmount = physicalText(effectPost.raw, "amount_minor_units");
    if (!/^(?:0|[1-9][0-9]*)$/.test(effectAmount))
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    const effectRevision = physicalText(
      effectPost.raw,
      "accepted_account_revision"
    );
    if (effectRevision !== "1")
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    const effectDomain = physicalText(effectPost.raw, "domain");
    if (effectDomain !== "accounts")
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    const effectKind = physicalText(effectPost.raw, "kind");
    if (effectKind !== "account.create-default")
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    const effectIsEffective = physicalBoolean(effectPost.raw, "is_effective");
    if (!effectIsEffective) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    const effectDeleted = physicalBoolean(effectPost.raw, "deleted");
    if (effectDeleted !== false)
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);

    openingEffect = {
      effectId: input.effectId,
      accountId: input.accountId,
      userId: input.ownerId,
      actionId: input.envelope.actionId,
      preimage: null,
      postimage: {
        amountMinorUnits: effectAmount,
        currency: effectCurrency,
        acceptedAccountRevision: "1",
        domain: "accounts",
        kind: "account.create-default",
        isEffective: true,
        deleted: false,
        compensatedAt: null,
        reversesEffectId: null,
      },
      expectedPostimageHash: await hashAccountReviewLocalPostimage({
        table: "account_financial_effects",
        id: input.effectId,
        raw: effectPost.raw,
        hashProvider,
      }),
    };
  }

  let priorDefault: AccountCreateDefaultLocalSaveSnapshot["priorDefault"] =
    null;
  if (previous && input.form.defaultIntent === true) {
    const priorPre = evidence.cachedPreimages.find(
      (p) => p.table === "accounts" && p.id === previous.id
    );
    const priorPost = evidence.preparedPostimages.find(
      (p) => p.table === "accounts" && p.id === previous.id
    );
    if (
      !priorPre ||
      !priorPost ||
      priorPre.kind !== "update" ||
      priorPost.kind !== "update"
    ) {
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    }
    assertOnlyPriorDefaultChanged(priorPre.raw, priorPost.raw);

    const rawStatus = (
      raw: Readonly<Model["_raw"]>
    ): "created" | "updated" | "synced" => {
      const status = raw._status;
      if (status !== "created" && status !== "updated" && status !== "synced") {
        fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
      }
      return status;
    };

    const rawChanged = (raw: Readonly<Model["_raw"]>): string[] => {
      const cols = raw._changed
        ? raw._changed.split(",").filter(Boolean).sort()
        : [];
      if (
        new Set(cols).size !== cols.length ||
        cols.some((col) => !ACCOUNT_PHYSICAL_COLUMNS.has(col))
      )
        fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
      return cols;
    };

    const transportPreimage = {
      status: rawStatus(priorPre.raw),
      changedColumns: rawChanged(priorPre.raw),
    };
    const transportPostimage = {
      status: rawStatus(priorPost.raw),
      changedColumns: rawChanged(priorPost.raw),
    };

    const priorUserId = physicalText(priorPre.raw, "user_id");
    if (priorUserId !== input.ownerId)
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    const currency = validateCurrency(physicalText(priorPre.raw, "currency"));
    const balance = physicalRawField(priorPre.raw, "balance");
    if (typeof balance !== "number" || !Number.isFinite(balance)) {
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    }
    const places = getCurrencyPrecision(currency);
    const balanceMinorUnits = toMinorUnits(
      serializeDecimal(String(balance)),
      places
    );
    const financialRevision = validateRevision(
      physicalText(priorPre.raw, "financial_revision")
    );
    const priorPreIsDefault = physicalBoolean(priorPre.raw, "is_default");
    if (!priorPreIsDefault) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    const priorPreDeleted = physicalBoolean(priorPre.raw, "deleted");
    if (priorPreDeleted !== false)
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);

    const priorPostIsDefault = physicalBoolean(priorPost.raw, "is_default");
    if (priorPostIsDefault !== false)
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    const priorPostDeleted = physicalBoolean(priorPost.raw, "deleted");
    if (priorPostDeleted !== false)
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);

    const preimageHash = await hashAccountReviewLocalPostimage({
      table: "accounts",
      id: previous.id,
      raw: priorPre.raw,
      hashProvider,
    });

    const expectedPostimageHash = await hashAccountReviewLocalPostimage({
      table: "accounts",
      id: previous.id,
      raw: priorPost.raw,
      hashProvider,
    });

    priorDefault = {
      accountId: previous.id,
      userId: input.ownerId,
      preimage: {
        currency,
        balanceMinorUnits,
        financialRevision,
        isDefault: true,
        deleted: false,
      },
      postimage: {
        currency,
        balanceMinorUnits,
        financialRevision,
        isDefault: false,
        deleted: false,
      },
      preimageHash,
      expectedPostimageHash,
      transportPreimage,
      transportPostimage,
    };
  }

  // Re-read after all awaited physical hashes while this same writer
  // owns the original prepared group. Frozen hashes are copied from B's
  // original command, never replaced with a later acceptance-state guess.
  const afterPostimageProof = await readCompleteDefaultCreatorMembership(
    dep.database,
    scope,
    input.snapshot,
    hashProvider
  );
  if (
    !sameCreatorRoots(afterPostimageProof.dependencyRoots) ||
    afterPostimageProof.unresolvedActionIds.some(
      (id) => !originalUnresolvedIds.has(id)
    )
  )
    fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  await dep.assertExpectedCurrentUser(input.ownerId);
  // Zod's existing 12-key device-private carrier accepts a mutable
  // array of records. Clone the original immutable command bindings into
  // that exact schema shape; never mutate the original command or re-read
  // hashes from a creator whose acceptance changed during this writer.
  const dependencyRoots: AccountCreateDefaultLocalSaveSnapshot["dependencyRoots"] =
    capturedCreatorRoots.map((creator) => ({
      actionId: creator.actionId,
      payloadHash: creator.payloadHash,
    }));

  // Complete owned active account set overlaid with genuine prepared account/default mutations
  const preparedActiveAccountIds = [
    ...accounts.filter((a) => !a.deleted).map((a) => a.id),
    input.accountId,
  ].sort();

  let preparedDefaultAccount: {
    readonly accountId: string;
    readonly isDefault: true;
  } | null = null;
  if (isDefault) {
    preparedDefaultAccount = {
      accountId: input.accountId,
      isDefault: true as const,
    };
  } else {
    const existingDefault = accounts.find((a) => !a.deleted && a.isDefault);
    if (existingDefault) {
      const existingPost = evidence.preparedPostimages.find(
        (p) => p.table === "accounts" && p.id === existingDefault.id
      );
      const remainsDefault = existingPost
        ? physicalBoolean(existingPost.raw, "is_default")
        : existingDefault.isDefault;
      if (remainsDefault) {
        preparedDefaultAccount = {
          accountId: existingDefault.id,
          isDefault: true as const,
        };
      }
    }
  }

  const preparedDefaultSnapshot = {
    activeAccountIds: preparedActiveAccountIds,
    defaultAccount: preparedDefaultAccount,
  };

  const expectedDefaultSnapshot = {
    activeAccountIds: [...input.snapshot.activeAccountIds].sort(),
    defaultAccount: input.snapshot.defaultAccount
      ? {
          accountId: input.snapshot.defaultAccount.accountId,
          isDefault: true as const,
        }
      : null,
  };

  const rootBinding = {
    domain: "accounts" as const,
    kind: "create_with_default" as const,
    domainReferenceId: input.accountId,
    payloadVersion: "account.create-default/v1" as const,
  };

  return {
    version: "account-create-default-local-save/v1",
    actionId: input.envelope.actionId,
    ownerId: input.ownerId,
    rootBinding,
    payloadHash,
    expectedDefaultSnapshot,
    preparedDefaultSnapshot,
    dependencyRoots,
    createdAccount,
    createdChildren,
    openingEffect,
    priorDefault,
  };
}
