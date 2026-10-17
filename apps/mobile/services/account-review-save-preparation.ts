/** #395 T048: immutable selected intent, before any asynchronous read. */
import {
  accountReviewSaveIntentSchema,
  accountReviewSessionSchema,
  type AccountReviewGroup,
  type AccountReviewRow,
  type AccountReviewSaveIntent,
  type AccountReviewSession,
  type Sha256Provider,
} from "@monyvi/logic";
import { uuidV8FromSha256 } from "../../../packages/logic/src/account-review/identity";
import { normalizeAccountSmsSender } from "./account-sms-sender-service";

export interface ReviewSaveInput {
  readonly session: AccountReviewSession;
  readonly intent: AccountReviewSaveIntent;
}

export interface FrozenReviewSave {
  readonly session: AccountReviewSession;
  readonly intent: AccountReviewSaveIntent;
  readonly selectedRows: readonly AccountReviewRow[];
  readonly neededGroups: readonly AccountReviewGroup[];
}

function reject(reason: string): never {
  throw new Error("account_review_save_" + reason);
}

function referencedGroupId(row: AccountReviewRow): readonly string[] {
  const ids: string[] = [];
  if (row.assignment.state === "suggested") ids.push(row.assignment.groupId);
  if (row.toAssignment?.state === "suggested")
    ids.push(row.toAssignment.groupId);
  return ids;
}

function assertSelectedRows(
  selected: readonly AccountReviewRow[],
  intent: AccountReviewSaveIntent
): void {
  if (selected.length !== intent.selectedRows.length)
    reject("selection_changed");
  const chosen = new Map(
    intent.selectedRows.map((row) => [row.rowId, row.revision])
  );
  for (const row of selected) {
    if (
      chosen.get(row.rowId) !== row.revision ||
      row.currency.state !== "known" ||
      row.assignment.state === "unresolved" ||
      (row.source === "SMS" &&
        row.transaction.isAtmWithdrawal === true &&
        (row.toAssignment === null || row.toAssignment.state === "unresolved"))
    ) {
      reject("selected_row_unresolved");
    }
  }
}

function neededConfirmedGroups(
  session: AccountReviewSession,
  intent: AccountReviewSaveIntent,
  selected: readonly AccountReviewRow[]
): readonly AccountReviewGroup[] {
  const ids = new Set(selected.flatMap(referencedGroupId));
  const expected = new Map(
    intent.confirmedGroups.map((group) => [group.groupId, group])
  );
  if (ids.size !== expected.size) reject("confirmed_groups_changed");
  return [...ids].map((id) => {
    const group = session.groups.find((item) => item.groupId === id);
    const frozen = expected.get(id);
    if (
      !group ||
      !frozen ||
      group.status !== "confirmed" ||
      group.type === null ||
      group.revision !== frozen.revision ||
      group.evidenceKey !== frozen.evidenceKey
    )
      reject("group_not_confirmed");
    return group;
  });
}

function assertFrozenPlan(
  intent: AccountReviewSaveIntent,
  selected: readonly AccountReviewRow[],
  groups: readonly AccountReviewGroup[]
): void {
  const planned = intent.plannedEntityIds;
  const financial = planned.filter(
    (item) => item.entity === "transaction" || item.entity === "transfer"
  );
  const accounts = planned.filter((item) => item.entity === "account");
  if (
    financial.length !== selected.length ||
    accounts.length !== groups.length
  ) {
    reject("planned_members_changed");
  }
  for (const row of selected) {
    const entity =
      row.source === "SMS" && row.transaction.isAtmWithdrawal === true
        ? "transfer"
        : "transaction";
    if (
      financial.filter(
        (item) => item.entity === entity && item.localRef === row.rowId
      ).length !== 1
    ) {
      reject("planned_financial_identity");
    }
  }
  for (const group of groups) {
    if (
      accounts.filter((item) => item.localRef === group.groupId).length !== 1
    ) {
      reject("planned_account_identity");
    }
  }
}

export function freezeSelectedAccountReview(
  input: ReviewSaveInput
): FrozenReviewSave {
  const session = accountReviewSessionSchema.parse(input.session);
  const intent = accountReviewSaveIntentSchema.parse(input.intent);
  if (
    session.saveIntent === null ||
    JSON.stringify(session.saveIntent) !== JSON.stringify(intent) ||
    session.ownerId !== intent.ownerId ||
    session.sessionId !== intent.sessionId ||
    session.source !== intent.source ||
    session.revision !== intent.expectedReviewRevision ||
    session.operationGeneration !== intent.expectedOperationGeneration
  ) {
    reject("intent_stale");
  }
  const selected = session.rows.filter((row) => row.selected);
  assertSelectedRows(selected, intent);
  const groups = neededConfirmedGroups(session, intent, selected);
  assertFrozenPlan(intent, selected, groups);
  return Object.freeze({
    session,
    intent,
    selectedRows: selected,
    neededGroups: groups,
  });
}

type PlannedAlias = Pick<
  AccountReviewSaveIntent["plannedEntityIds"][number],
  "entity" | "localRef"
>;

function uniqueSenderAliases(names: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  for (const name of names) {
    const normalized = normalizeAccountSmsSender(
      name.trim().replace(/\s+/g, " ")
    );
    if (normalized) seen.add(normalized);
  }
  return [...seen];
}

async function childLocalRef(
  ownerId: string,
  sessionId: string,
  groupId: string,
  entity: "bank_details" | "account_sms_sender",
  hashProvider: Sha256Provider,
  sender?: string
): Promise<string> {
  const parts = [
    "account-review-localref/v1",
    ownerId,
    sessionId,
    groupId,
    entity,
  ];
  if (sender !== undefined) parts.push(sender);
  return uuidV8FromSha256(await hashProvider.digestUtf8(JSON.stringify(parts)));
}

/** Exact shared child aliases; reused by capture and frozen Save verification. */
export async function plannedAccountReviewGroupAliases(input: {
  readonly ownerId: string;
  readonly sessionId: string;
  readonly group: AccountReviewGroup;
  readonly hashProvider: Sha256Provider;
}): Promise<readonly PlannedAlias[]> {
  const { ownerId, sessionId, group, hashProvider } = input;
  if (group.type === null) reject("planned_account_type_missing");
  const aliases: PlannedAlias[] = [
    { entity: "account", localRef: group.groupId },
  ];
  if (group.type === "CASH") return aliases;
  if (group.type === "BANK") {
    aliases.push({
      entity: "bank_details",
      localRef: await childLocalRef(
        ownerId,
        sessionId,
        group.groupId,
        "bank_details",
        hashProvider
      ),
    });
  }
  for (const sender of uniqueSenderAliases(group.senderNames)) {
    aliases.push({
      entity: "account_sms_sender",
      localRef: await childLocalRef(
        ownerId,
        sessionId,
        group.groupId,
        "account_sms_sender",
        hashProvider,
        sender
      ),
    });
  }
  return aliases;
}

/** Validate the COMPLETE frozen original plan, not the post-dedup mutation. */
export async function assertCompleteFrozenReviewPlan(
  frozen: FrozenReviewSave,
  hashProvider: Sha256Provider
): Promise<void> {
  const expected: PlannedAlias[] = frozen.selectedRows.map((row) => ({
    entity:
      row.source === "SMS" && row.transaction.isAtmWithdrawal === true
        ? "transfer"
        : "transaction",
    localRef: row.rowId,
  }));
  for (const group of frozen.neededGroups) {
    expected.push(
      ...(await plannedAccountReviewGroupAliases({
        ownerId: frozen.intent.ownerId,
        sessionId: frozen.intent.sessionId,
        group,
        hashProvider,
      }))
    );
  }
  const planned = frozen.intent.plannedEntityIds;
  if (
    expected.length !== planned.length ||
    expected.some(
      (alias) =>
        planned.filter(
          (item) =>
            item.entity === alias.entity && item.localRef === alias.localRef
        ).length !== 1
    )
  ) {
    reject("planned_members_incomplete");
  }
}

export function assertCurrentReviewSession(
  frozen: FrozenReviewSave,
  current: AccountReviewSession
): void {
  const parsed = accountReviewSessionSchema.parse(current);
  if (
    parsed.ownerId !== frozen.intent.ownerId ||
    parsed.sessionId !== frozen.intent.sessionId ||
    parsed.source !== frozen.intent.source ||
    parsed.sourceRevision !== frozen.session.sourceRevision ||
    parsed.revision !== frozen.session.revision ||
    parsed.operationGeneration !== frozen.session.operationGeneration ||
    JSON.stringify(parsed.saveIntent) !== JSON.stringify(frozen.intent) ||
    JSON.stringify(parsed.rows) !== JSON.stringify(frozen.session.rows) ||
    JSON.stringify(parsed.groups) !== JSON.stringify(frozen.session.groups)
  ) {
    reject("current_session_changed");
  }
}

export function requiredPlannedEntity(
  frozen: FrozenReviewSave,
  entity: AccountReviewSaveIntent["plannedEntityIds"][number]["entity"],
  localRef: string
): AccountReviewSaveIntent["plannedEntityIds"][number] {
  const matches = frozen.intent.plannedEntityIds.filter(
    (item) => item.entity === entity && item.localRef === localRef
  );
  if (matches.length !== 1 || !matches[0]) reject("planned_alias_missing");
  return matches[0];
}
