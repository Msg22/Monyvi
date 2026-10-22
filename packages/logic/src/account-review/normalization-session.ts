/** Pure composition of admitted original SMS chunks; no queue or edit reducer. */
import type { ParsedSmsTransaction } from "../types";
import { normalizeAccountReviewParserResult } from "./normalization";
import {
  accountReviewSmsFinancialRowSchema,
  accountReviewSmsResponseV2Schema,
} from "./parser-schemas";
import {
  accountReviewSessionSchema,
  type AccountReviewGroup,
  type AccountReviewRow,
  type AccountReviewSession,
} from "./review-schemas";
import type {
  SmsReviewNormalizationInput,
  SubmittedSmsReviewSource,
} from "./normalization-types";

import { normalizeGroundedIdentity } from "./identity";

type SmsRow = Extract<AccountReviewRow, { source: "SMS" }>;
export type AcceptedSmsReviewChunk = Pick<
  SmsReviewNormalizationInput,
  | "requestKey"
  | "financialRows"
  | "mappedTransactions"
  | "submittedMessages"
  | "providerResponse"
>;

export interface CompleteSmsReviewNormalizationInput extends Pick<
  SmsReviewNormalizationInput,
  | "ownerId"
  | "sessionId"
  | "sourceRevision"
  | "reviewAccountSnapshots"
  | "hashProvider"
> {
  readonly acceptedReviewChunks: readonly AcceptedSmsReviewChunk[];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The closed SMS v2 validator compares suggested provider display spelling
 * verbatim with the linked row's evidence. Admit cosmetic case variants only
 * when every referenced row independently asserts the same normalized
 * provider identity; canonical reparse must approve the *entire* response.
 *
 * Neither financial records nor actual account evidence are modified.
 * Unrelated invalid v2 envelopes remain rejected by the existing parser.
 */
function admitCosmeticSmsProviderCase(raw: unknown): unknown {
  if (accountReviewSmsResponseV2Schema.safeParse(raw).success) return raw;
  if (
    !isRecord(raw) ||
    !Array.isArray(raw.transactions) ||
    !Array.isArray(raw.suggestedAccounts)
  ) {
    return raw;
  }
  const transactions: readonly unknown[] = raw.transactions;
  const suggestedAccounts: readonly unknown[] = raw.suggestedAccounts;
  const suggestions = suggestedAccounts.map((item): unknown => {
    if (
      !isRecord(item) ||
      typeof item.suggestionRef !== "string" ||
      !Array.isArray(item.transactionRefs) ||
      typeof item.providerDisplayName !== "string" ||
      !item.providerDisplayName.trim()
    ) {
      return item;
    }
    const refs: readonly unknown[] = item.transactionRefs;
    const linked = transactions.filter(
      (row) =>
        isRecord(row) &&
        row.suggestionRef === item.suggestionRef &&
        typeof row.transactionRef === "string" &&
        refs.includes(row.transactionRef)
    );
    if (linked.length === 0 || linked.length !== refs.length) return item;
    const providers = linked.map((row): string | null => {
      if (!isRecord(row) || !isRecord(row.accountEvidence)) return null;
      const provider = row.accountEvidence.providerDisplayName;
      return typeof provider === "string" ? provider : null;
    });
    const first = providers[0];
    if (
      !first ||
      !first.trim() ||
      providers.some((provider) => provider !== first) ||
      normalizeGroundedIdentity(first) !==
        normalizeGroundedIdentity(item.providerDisplayName)
    ) {
      return item;
    }
    return { ...item, providerDisplayName: first };
  });
  const corrected = { ...raw, suggestedAccounts: suggestions };
  return accountReviewSmsResponseV2Schema.safeParse(corrected).success
    ? corrected
    : raw;
}

function categoryIds(
  chunk: AcceptedSmsReviewChunk
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const row of chunk.financialRows) {
    const source = chunk.submittedMessages.find(
      (message) => message.id === row.messageId
    );
    const mapped = chunk.mappedTransactions.find(
      (item) => item.smsFingerprint === source?.smsFingerprint
    );
    if (!mapped) throw new Error("account_review_sms_mapping_missing");
    const previous = result.get(row.categorySystemName);
    if (previous !== undefined && previous !== mapped.categoryId) {
      throw new Error("account_review_sms_category_mapping_conflict");
    }
    result.set(row.categorySystemName, mapped.categoryId);
  }
  return result;
}

function projectAcceptedAdvisory(
  raw: unknown,
  ids: ReadonlySet<string>
): unknown {
  const original = accountReviewSmsResponseV2Schema.safeParse(raw);
  if (!original.success) return raw;
  const transactions = original.data.transactions.filter((row) =>
    ids.has(row.messageId)
  );
  const refs = new Set(transactions.map((row) => row.transactionRef));
  const suggestedAccounts = original.data.suggestedAccounts.flatMap(
    (suggestion) => {
      const transactionRefs = suggestion.transactionRefs.filter((ref) =>
        refs.has(ref)
      );
      return transactionRefs.length === 0
        ? []
        : [{ ...suggestion, transactionRefs }];
    }
  );
  return { ...original.data, transactions, suggestedAccounts };
}

/** A final outer selection may discard AI duplicates in favor of trusted rows. */
export function selectAcceptedSmsReviewChunks(
  chunks: readonly AcceptedSmsReviewChunk[],
  transactions: readonly ParsedSmsTransaction[]
): AcceptedSmsReviewChunk[] {
  const accepted = new Set(transactions);
  return chunks.flatMap((chunk) => {
    const mappedTransactions = chunk.mappedTransactions.filter((row) =>
      accepted.has(row)
    );
    if (mappedTransactions.length === 0) return [];
    const fingerprints = new Set(
      mappedTransactions.map((row) => row.smsFingerprint)
    );
    const submittedMessages = chunk.submittedMessages.filter((row) =>
      fingerprints.has(row.smsFingerprint)
    );
    const ids = new Set(submittedMessages.map((row) => row.id));
    return [
      {
        ...chunk,
        mappedTransactions,
        submittedMessages,
        financialRows: chunk.financialRows.filter((row) =>
          ids.has(row.messageId)
        ),
        providerResponse: projectAcceptedAdvisory(chunk.providerResponse, ids),
      },
    ];
  });
}

function requireOriginalLocalSource(
  transaction: ParsedSmsTransaction,
  sources: readonly SubmittedSmsReviewSource[]
): SubmittedSmsReviewSource {
  const matches = sources.filter(
    (source) =>
      source.smsFingerprint === transaction.smsFingerprint &&
      source.body === transaction.rawSmsBody &&
      source.sender === transaction.senderDisplayName
  );
  const source = matches[0];
  if (matches.length !== 1 || !source)
    throw new Error("account_review_local_source_ambiguous");
  return source;
}

/** Local finance is preserved as supplied; absence of AI proof stays unconfirmed. */
export function createLocalSmsReviewChunk(input: {
  readonly transaction: ParsedSmsTransaction;
  readonly sources: readonly SubmittedSmsReviewSource[];
  readonly categorySystemNamesById: ReadonlyMap<string, string>;
}): AcceptedSmsReviewChunk {
  const transaction = input.transaction;
  const source = requireOriginalLocalSource(transaction, input.sources);
  const categorySystemName = input.categorySystemNamesById.get(
    transaction.categoryId
  );
  if (
    !categorySystemName ||
    !(transaction.date instanceof Date) ||
    !Number.isFinite(transaction.date.getTime())
  ) {
    throw new Error("account_review_local_finance_incomplete");
  }
  const financial = accountReviewSmsFinancialRowSchema.parse({
    messageId: source.id,
    amount: transaction.amount,
    currency: transaction.currency,
    type: transaction.type,
    counterparty: transaction.counterparty ?? "",
    date: transaction.date.toISOString(),
    categorySystemName,
    isAtmWithdrawal: transaction.isAtmWithdrawal === true,
    ...(transaction.cardLast4 === undefined
      ? {}
      : { cardLast4: transaction.cardLast4 }),
    confidenceScore: transaction.confidence,
    isTrusted: false,
  });
  return {
    requestKey: `local:${source.id}`,
    financialRows: [financial],
    mappedTransactions: [transaction],
    submittedMessages: [source],
    providerResponse: null,
  };
}

async function namespaceAliases(
  session: AccountReviewSession,
  chunk: AcceptedSmsReviewChunk,
  input: CompleteSmsReviewNormalizationInput
): Promise<AccountReviewSession> {
  if (chunk.providerResponse === null) return session;
  const sourceKeys = chunk.submittedMessages
    .map((source) => [source.id, source.smsFingerprint])
    .sort((left, right) => {
      const a = JSON.stringify(left);
      const b = JSON.stringify(right);
      return a < b ? -1 : a > b ? 1 : 0;
    });
  const prefix = await input.hashProvider.digestUtf8(
    JSON.stringify(["monyvi.account-review.sms-chunk-alias.v1", sourceKeys])
  );
  return {
    ...session,
    rows: session.rows.map((row) => ({
      ...row,
      sourceRef: `${prefix}:${row.sourceRef}`,
    })),
    groups: session.groups.map((group) => ({
      ...group,
      suggestionRefs: group.suggestionRefs.map((ref) => `${prefix}:${ref}`),
    })),
  };
}

function rowComparison(row: SmsRow): string {
  // Provider aliases are chunk-local labels, not financial/source identity.
  return JSON.stringify({ ...row, sourceRef: null });
}

function collectRows(sessions: readonly AccountReviewSession[]): SmsRow[] {
  const rows = new Map<string, SmsRow>();
  for (const session of sessions) {
    for (const row of session.rows) {
      if (row.source !== "SMS")
        throw new Error("account_review_sms_session_source_mismatch");
      const previous = rows.get(row.sourceFingerprint);
      if (previous && rowComparison(previous) !== rowComparison(row)) {
        throw new Error("account_review_sms_conflicting_original");
      }
      if (!previous) rows.set(row.sourceFingerprint, row);
    }
  }
  return [...rows.values()];
}

function groupComparison(group: AccountReviewGroup): string {
  // Mirror the identity hash's *cosmetic-only* normalization. Do not broaden
  // currency/type/institution/card/provider identity or revision equivalence.
  return JSON.stringify({
    ...group,
    name: normalizeGroundedIdentity(group.name),
    providerDisplayName:
      group.providerDisplayName === null
        ? null
        : normalizeGroundedIdentity(group.providerDisplayName),
    senderNames: [
      ...new Set(group.senderNames.map(normalizeGroundedIdentity)),
    ].sort(),
    suggestionRefs: [],
    linkedRowIds: [],
  });
}

function deterministicRepresentative(
  first: AccountReviewGroup,
  second: AccountReviewGroup
): AccountReviewGroup {
  // Select a stable user-facing original spelling, not arrival order.
  const display = (group: AccountReviewGroup): string =>
    JSON.stringify([group.name, group.providerDisplayName, group.senderNames]);
  return display(first) <= display(second) ? first : second;
}

function collectGroups(
  sessions: readonly AccountReviewSession[]
): AccountReviewGroup[] {
  const groups = new Map<string, AccountReviewGroup>();
  for (const session of sessions) {
    for (const group of session.groups) {
      const previous = groups.get(group.groupId);
      if (previous && groupComparison(previous) !== groupComparison(group)) {
        throw new Error("account_review_sms_group_identity_conflict");
      }
      const representative = previous
        ? deterministicRepresentative(previous, group)
        : group;
      groups.set(
        group.groupId,
        previous
          ? {
              ...representative,
              suggestionRefs: [
                ...new Set([
                  ...previous.suggestionRefs,
                  ...group.suggestionRefs,
                ]),
              ].sort(),
              linkedRowIds: [
                ...new Set([...previous.linkedRowIds, ...group.linkedRowIds]),
              ].sort(),
            }
          : group
      );
    }
  }
  return [...groups.values()].sort((a, b) =>
    a.groupId < b.groupId ? -1 : a.groupId > b.groupId ? 1 : 0
  );
}

/** Each original chunk is validated independently before initial union. */
export async function normalizeCompleteSmsReviewSession(
  input: CompleteSmsReviewNormalizationInput
): Promise<AccountReviewSession> {
  const sessions: AccountReviewSession[] = [];
  for (const chunk of input.acceptedReviewChunks) {
    if (chunk.financialRows.length === 0) continue;
    const session = await normalizeAccountReviewParserResult({
      ...chunk,
      ownerId: input.ownerId,
      sessionId: input.sessionId,
      source: "SMS",
      sourceRevision: input.sourceRevision,
      reviewAccountSnapshots: input.reviewAccountSnapshots,
      categoryIdsBySystemName: categoryIds(chunk),
      hashProvider: input.hashProvider,
      providerResponse: admitCosmeticSmsProviderCase(chunk.providerResponse),
    });
    sessions.push(await namespaceAliases(session, chunk, input));
  }
  const first = sessions[0];
  if (!first) throw new Error("account_review_sms_no_accepted_rows");
  return accountReviewSessionSchema.parse({
    ...first,
    rows: collectRows(sessions),
    groups: collectGroups(sessions),
  });
}

export function prepareInitialSmsReviewChunks(input: {
  readonly chunks: readonly AcceptedSmsReviewChunk[];
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly sources: readonly SubmittedSmsReviewSource[];
  readonly categorySystemNamesById: ReadonlyMap<string, string>;
  readonly allowLocalSources: boolean;
  readonly allowedLocalTransactions: readonly ParsedSmsTransaction[];
}): AcceptedSmsReviewChunk[] {
  const selected = selectAcceptedSmsReviewChunks(
    input.chunks,
    input.transactions
  );
  const covered = new Set(
    selected.flatMap((chunk) => chunk.mappedTransactions)
  );
  const localTransactions = input.transactions.filter(
    (row) => !covered.has(row)
  );
  const allowedLocal = new Set(input.allowedLocalTransactions);
  if (
    localTransactions.some(
      (row) => !input.allowLocalSources || !allowedLocal.has(row)
    )
  ) {
    throw new Error("account_review_original_ai_finance_missing");
  }
  return [
    ...selected,
    ...localTransactions.map((transaction) =>
      createLocalSmsReviewChunk({
        transaction,
        sources: input.sources,
        categorySystemNamesById: input.categorySystemNamesById,
      })
    ),
  ];
}
