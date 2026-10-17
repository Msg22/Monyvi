/**
 * #395 frozen-intent: referenced confirmed group provenance + exact original
 * planned physical membership. No app imports, database access or fake IDs.
 */
import type {
  AccountReviewAssignment,
  AccountReviewGroup,
  AccountReviewRow,
  AccountReviewSaveIntent,
  AccountReviewSession,
} from "../account-review/review-schemas";
import { uuidV8FromSha256 } from "../account-review/identity";
import type { Sha256Provider } from "./action-contracts";
import type { CanonicalJsonValue } from "./action-registry";
import { selectedGroupReferences } from "./review-intent-digest-rows";

type Group = AccountReviewGroup;
type Row = AccountReviewRow;
type Intent = AccountReviewSaveIntent;
type Member = Intent["plannedEntityIds"][number];

export interface ConfirmedIntentGroups {
  readonly groups: readonly Group[];
  readonly projected: readonly CanonicalJsonValue[];
}

function refuse(reason: string): never {
  throw new Error("account_review_intent_digest_" + reason);
}

function ascii(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

interface SenderDefinition {
  readonly normalized: string;
  readonly label: string;
}

/** Must mirror existing mobile normalizeAccountSmsSender/first surviving label. */
function senderDefinitions(group: Group): readonly SenderDefinition[] {
  const seen = new Set<string>();
  const result: SenderDefinition[] = [];
  for (const original of group.senderNames) {
    const label = original.trim().replace(/\s+/g, " ");
    const normalized = label.toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push({ normalized, label });
  }
  return result.sort((a, b) => ascii(a.normalized, b.normalized));
}

function selectedGroupRoles(
  group: Group,
  rows: readonly Row[]
): readonly CanonicalJsonValue[] {
  return rows
    .flatMap((row) => selectedGroupReferences(row))
    .filter((reference) => reference.groupId === group.groupId)
    .sort((a, b) => ascii(a.rowId + ":" + a.role, b.rowId + ":" + b.role))
    .map(
      (reference): CanonicalJsonValue => ({
        rowId: reference.rowId,
        role: reference.role,
      })
    );
}

function validatedGroup(
  group: Group,
  selectedRows: readonly Row[],
  source: AccountReviewSession["source"]
): void {
  if (
    group.status !== "confirmed" ||
    group.type === null ||
    group.confirmedIdentityRevision !== group.revision
  ) {
    refuse("group_unconfirmed");
  }
  for (const row of selectedRows) {
    for (const ref of selectedGroupReferences(row).filter(
      (r) => r.groupId === group.groupId
    )) {
      if (
        !group.linkedRowIds.includes(row.rowId) ||
        row.currency.state !== "known" ||
        row.currency.code !== group.currency
      ) {
        refuse("group_member_mismatch");
      }
      if (
        (source === "SMS" && ref.role === "source" && group.type === "CASH") ||
        (ref.role === "destination" &&
          (source !== "SMS" ||
            row.transaction.source !== "SMS" ||
            row.transaction.isAtmWithdrawal !== true ||
            group.type !== "CASH"))
      ) {
        refuse("group_endpoint_type");
      }
    }
  }
}

function projectGroup(
  group: Group,
  selectedRows: readonly Row[]
): CanonicalJsonValue {
  return {
    groupId: group.groupId,
    evidenceKey: group.evidenceKey,
    revision: group.revision,
    type: group.type,
    currency: group.currency,
    name: group.name,
    institutionId: group.institutionId,
    providerDisplayName: group.providerDisplayName,
    cardLast4: group.cardLast4,
    senderDefinitions: senderDefinitions(group).map((s) => ({
      normalized: s.normalized,
      label: s.label,
    })),
    selectedEndpoints: selectedGroupRoles(group, selectedRows),
  };
}

/** Selected source/destination references and frozen confirmed-intent entries coincide. */
export function originalConfirmedGroups(
  session: AccountReviewSession,
  intent: Intent,
  selectedRows: readonly Row[]
): ConfirmedIntentGroups {
  const references = selectedRows.flatMap(selectedGroupReferences);
  const ids = [...new Set(references.map((r) => r.groupId))].sort(ascii);
  if (ids.length !== intent.confirmedGroups.length)
    refuse("group_count_changed");
  const groups = ids.map((id) => {
    const group = session.groups.find((item) => item.groupId === id);
    const stated = intent.confirmedGroups.find((item) => item.groupId === id);
    if (
      !group ||
      !stated ||
      group.revision !== stated.revision ||
      group.evidenceKey !== stated.evidenceKey
    ) {
      return refuse("group_original_evidence_changed");
    }
    validatedGroup(group, selectedRows, session.source);
    return group;
  });
  return {
    groups,
    projected: groups.map((group) => projectGroup(group, selectedRows)),
  };
}

async function childLocalRef(
  session: AccountReviewSession,
  groupId: string,
  entity: "bank_details" | "account_sms_sender",
  hashProvider: Sha256Provider,
  normalized?: string
): Promise<string> {
  const preimage = [
    "account-review-localref/v1",
    session.ownerId,
    session.sessionId,
    groupId,
    entity,
  ];
  if (normalized !== undefined) preimage.push(normalized);
  const digest = await hashProvider.digestUtf8(JSON.stringify(preimage));
  return uuidV8FromSha256(digest);
}

function requireUniqueMember(
  members: readonly Member[],
  entity: Member["entity"],
  ref: string
): Member {
  const matches = members.filter(
    (item) => item.entity === entity && item.localRef === ref
  );
  if (matches.length !== 1 || !matches[0]) refuse("planned_alias_mismatch");
  return matches[0];
}

async function groupMemberKeys(
  session: AccountReviewSession,
  group: Group,
  provider: Sha256Provider
): Promise<readonly string[]> {
  const refs = ["account:" + group.groupId];
  if (group.type === "BANK") {
    const bankAlias = await childLocalRef(
      session,
      group.groupId,
      "bank_details",
      provider
    );
    refs.push("bank_details:" + bankAlias);
  }
  if (group.type !== "CASH") {
    for (const sender of senderDefinitions(group)) {
      const senderAlias = await childLocalRef(
        session,
        group.groupId,
        "account_sms_sender",
        provider,
        sender.normalized
      );
      refs.push("account_sms_sender:" + senderAlias);
    }
  }
  return refs;
}

function endpointAccountId(
  assignment: AccountReviewAssignment,
  members: readonly Member[]
): string {
  if (assignment.state === "existing") return assignment.accountId;
  if (assignment.state === "suggested") {
    return requireUniqueMember(members, "account", assignment.groupId).id;
  }
  return refuse("unresolved_selected_assignment");
}

function validateAtmDistinctEndpoints(
  selectedRows: readonly Row[],
  members: readonly Member[]
): void {
  for (const row of selectedRows) {
    if (row.source !== "SMS" || row.transaction.isAtmWithdrawal !== true)
      continue;
    if (
      !row.toAssignment ||
      row.toAssignment.state === "unresolved" ||
      endpointAccountId(row.assignment, members) ===
        endpointAccountId(row.toAssignment, members)
    ) {
      refuse("atm_endpoints_not_distinct");
    }
  }
}

/**
 * Exact ORIGINAL physical plan: includes legitimate later-deduplicated rows,
 * but never invents which of these identities will be posted.
 */
export async function completeOriginalPlannedMembers(
  session: AccountReviewSession,
  intent: Intent,
  selectedRows: readonly Row[],
  groups: readonly Group[],
  provider: Sha256Provider
): Promise<readonly CanonicalJsonValue[]> {
  const expected: string[] = [];
  for (const row of selectedRows) {
    const entity =
      row.source === "SMS" && row.transaction.isAtmWithdrawal === true
        ? "transfer"
        : "transaction";
    expected.push(entity + ":" + row.rowId);
  }
  for (const group of groups) {
    expected.push(...(await groupMemberKeys(session, group, provider)));
  }
  const members = intent.plannedEntityIds;
  if (
    expected.length !== members.length ||
    new Set(expected).size !== expected.length
  ) {
    return refuse("planned_member_count_changed");
  }
  for (const key of expected) {
    const index = key.indexOf(":");
    const entity = key.slice(0, index);
    const alias = key.slice(index + 1);
    const matches = members.filter(
      (m) => m.entity === entity && m.localRef === alias
    );
    if (matches.length !== 1) refuse("planned_member_mismatch");
  }
  validateAtmDistinctEndpoints(selectedRows, members);
  return [...members]
    .sort((a, b) =>
      ascii(
        a.entity + ":" + a.localRef + ":" + a.id,
        b.entity + ":" + b.localRef + ":" + b.id
      )
    )
    .map((member) => ({
      entity: member.entity,
      localRef: member.localRef,
      id: member.id,
    }));
}
