import type { AccountReviewSuggestedAccount } from "./parser-schemas";
import type {
  AccountReviewGroup,
  AccountReviewRow,
  AccountReviewSession,
} from "./review-schemas";
import type { AccountReviewNormalizationInput } from "./normalization-types";
import {
  deriveAccountReviewGroupIdentity,
  normalizeGroundedIdentity,
} from "./identity";
import type { NormalizedRowEvidence } from "./normalization-evidence";

export interface PendingReviewRow {
  readonly row: AccountReviewRow;
  readonly evidence: NormalizedRowEvidence;
}

function sameOptionalIdentity(
  left: string | null,
  right: string | null
): boolean {
  return left === right;
}

function isProvenAlias(
  candidate: string,
  evidence: NormalizedRowEvidence,
  input: AccountReviewNormalizationInput,
  row: AccountReviewRow
): boolean {
  const alias = normalizeGroundedIdentity(candidate);
  if (input.source === "VOICE" && row.source === "VOICE") {
    return (
      evidence.accountEvidence.name !== null &&
      evidence.accountEvidence.name.trim().length > 0 &&
      alias === normalizeGroundedIdentity(evidence.accountEvidence.name)
    );
  }
  if (input.source === "SMS" && row.source === "SMS") {
    const originalMessageId = evidence.sourceMessageId;
    const originalFingerprint = row.sourceFingerprint;
    const original = input.submittedMessages.find(
      (item) =>
        item.id === originalMessageId &&
        item.smsFingerprint === originalFingerprint
    );
    return (
      original !== undefined &&
      original.sender.trim().length > 0 &&
      alias === normalizeGroundedIdentity(original.sender)
    );
  }
  return false;
}

function hasGroundedIdentity(
  evidence: NormalizedRowEvidence,
  suggestion: AccountReviewSuggestedAccount
): boolean {
  const account = evidence.accountEvidence;
  const name = account.name;
  if (
    !evidence.isAccountEvidenceValid ||
    (account.state !== "explicit" && account.state !== "contextual") ||
    name === null ||
    !name.trim() ||
    account.type === null ||
    suggestion.type === null ||
    (account.providerDisplayName !== null &&
      !account.providerDisplayName.trim()) ||
    (suggestion.providerDisplayName !== null &&
      !suggestion.providerDisplayName.trim()) ||
    (suggestion.institutionId !== null && !suggestion.institutionId.trim()) ||
    !sameOptionalIdentity(account.institutionId, suggestion.institutionId) ||
    !sameOptionalIdentity(account.cardLast4, suggestion.cardLast4) ||
    (account.providerDisplayName === null) !==
      (suggestion.providerDisplayName === null)
  )
    return false;
  return (
    account.type === suggestion.type &&
    normalizeGroundedIdentity(name) ===
      normalizeGroundedIdentity(suggestion.name) &&
    (account.providerDisplayName === null ||
      normalizeGroundedIdentity(account.providerDisplayName) ===
        normalizeGroundedIdentity(suggestion.providerDisplayName ?? ""))
  );
}

function compatibleSuggestion(
  input: AccountReviewNormalizationInput,
  row: PendingReviewRow,
  suggestion: AccountReviewSuggestedAccount
): boolean {
  const currency = row.evidence.currency;
  if (
    currency.state !== "known" ||
    !hasGroundedIdentity(row.evidence, suggestion) ||
    (suggestion.currency !== currency.code &&
      !(
        suggestion.currency === null && currency.origin === "preferred_omission"
      )) ||
    (input.source === "SMS" && suggestion.type === "CASH")
  )
    return false;
  return suggestion.senderNames.every((alias) =>
    isProvenAlias(alias, row.evidence, input, row.row)
  );
}

function eligibleMembers(
  input: AccountReviewNormalizationInput,
  rows: readonly PendingReviewRow[],
  suggestion: AccountReviewSuggestedAccount
): PendingReviewRow[] | null {
  const members = rows.filter(
    (entry) =>
      suggestion.transactionRefs.includes(entry.evidence.sourceRef) &&
      entry.evidence.suggestionRef === suggestion.suggestionRef
  );
  if (
    members.length !== suggestion.transactionRefs.length ||
    members.length === 0 ||
    !members.every((member) => compatibleSuggestion(input, member, suggestion))
  )
    return null;
  return members;
}

function attachGroup(
  rows: AccountReviewRow[],
  rowIds: readonly string[],
  group: AccountReviewGroup
): AccountReviewRow[] {
  const members = new Set(rowIds);
  return rows.map((row): AccountReviewRow => {
    if (!members.has(row.rowId)) return row;
    const reasons = row.reviewReasons.filter(
      (reason) =>
        reason !== "account_needed" &&
        reason !== "account_identity_uncertain" &&
        reason !== "account_group_unconfirmed"
    );
    const assignment: AccountReviewRow["assignment"] = {
      state: "suggested",
      accountId: null,
      groupId: group.groupId,
      groupRevision: group.revision,
      confirmation: "pending",
    };
    const reviewReasons: AccountReviewRow["reviewReasons"] = [
      ...reasons,
      "account_group_unconfirmed",
    ];
    return { ...row, assignment, reviewReasons };
  });
}

function joinGroup(
  previous: AccountReviewGroup | undefined,
  created: AccountReviewGroup
): AccountReviewGroup {
  if (!previous) return created;
  return {
    ...previous,
    suggestionRefs: [
      ...new Set([...previous.suggestionRefs, ...created.suggestionRefs]),
    ].sort(),
    linkedRowIds: [
      ...new Set([...previous.linkedRowIds, ...created.linkedRowIds]),
    ].sort(),
  };
}

async function materializeGroup(
  input: AccountReviewNormalizationInput,
  suggestion: AccountReviewSuggestedAccount,
  members: readonly PendingReviewRow[]
): Promise<AccountReviewGroup> {
  const first = members[0];
  if (
    !first ||
    suggestion.type === null ||
    first.evidence.currency.state !== "known"
  ) {
    throw new Error("account_review_group_missing_grounded_currency");
  }
  const currency = first.evidence.currency.code;
  const identity = await deriveAccountReviewGroupIdentity({
    ownerId: input.ownerId,
    sessionId: input.sessionId,
    source: input.source,
    identity: {
      name: suggestion.name,
      type: suggestion.type,
      currency,
      institutionId: suggestion.institutionId,
      providerDisplayName: suggestion.providerDisplayName,
      cardLast4: suggestion.cardLast4,
      senderNames: suggestion.senderNames,
    },
    hashProvider: input.hashProvider,
  });
  return {
    ...identity,
    suggestionRefs: [suggestion.suggestionRef],
    name: suggestion.name,
    type: suggestion.type,
    currency,
    institutionId: suggestion.institutionId,
    providerDisplayName: suggestion.providerDisplayName,
    cardLast4: suggestion.cardLast4,
    senderNames: suggestion.senderNames,
    linkedRowIds: members.map((entry) => entry.row.rowId).sort(),
    status: "pending",
    revision: "0",
    confirmedIdentityRevision: null,
  };
}

function markUnattachedProposals(
  rows: readonly AccountReviewRow[],
  entries: readonly PendingReviewRow[],
  groups: readonly AccountReviewGroup[]
): AccountReviewRow[] {
  const attached = new Set(groups.flatMap((group) => group.linkedRowIds));
  return rows.map((row): AccountReviewRow => {
    const proposal = entries.find((entry) => entry.row.rowId === row.rowId);
    if (attached.has(row.rowId) || !proposal?.evidence.suggestionRef)
      return row;
    const assignment: AccountReviewRow["assignment"] = {
      state: "unresolved",
      accountId: null,
      reasonCode: "account_evidence_invalid",
      candidateAccountIds: [],
    };
    const reviewReasons: AccountReviewRow["reviewReasons"] = [
      ...new Set<AccountReviewRow["reviewReasons"][number]>([
        ...row.reviewReasons,
        "account_evidence_invalid",
      ]),
    ];
    return { ...row, assignment, reviewReasons };
  });
}

/** Confirmation and selection are later commands; this builds pending groups only. */
export async function createPendingReviewGroups(
  input: AccountReviewNormalizationInput,
  entries: readonly PendingReviewRow[],
  suggestions: readonly AccountReviewSuggestedAccount[]
): Promise<Pick<AccountReviewSession, "rows" | "groups">> {
  let rows = entries.map((entry) => entry.row);
  const groupsById = new Map<string, AccountReviewGroup>();
  for (const suggestion of suggestions) {
    const members = eligibleMembers(input, entries, suggestion);
    if (
      !members ||
      suggestion.type === null ||
      members[0]?.evidence.currency.state !== "known"
    )
      continue;
    const created = await materializeGroup(input, suggestion, members);
    const group = joinGroup(groupsById.get(created.groupId), created);
    groupsById.set(created.groupId, group);
    rows = attachGroup(rows, created.linkedRowIds, group);
  }
  const groups = [...groupsById.values()].sort((a, b) =>
    a.groupId < b.groupId ? -1 : a.groupId > b.groupId ? 1 : 0
  );
  return { rows: markUnattachedProposals(rows, entries, groups), groups };
}
