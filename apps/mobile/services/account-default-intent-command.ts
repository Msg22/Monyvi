/**
 * #395 T068 canonical Add command preparation — no Watermelon reads or writes.
 * Only one immutable command may cross an asynchronous writer boundary.
 */
import type { AccountFormData } from "../validation/account-validation";
import {
  fromMinorUnits,
  getCurrencyPrecision,
  roundDecimal,
  serializeDecimal,
  toMinorUnits,
  type FinancialActionEnvelopeV1,
} from "@monyvi/logic";
import {
  validateAccountCreateDefaultPayload,
  type AccountCreateDefaultPayload,
  type AccountDefaultSnapshot,
} from "../../../packages/logic/src/financial-actions/account-create-default";
import { createAccountCreateDefaultDefinitions } from
  "../../../packages/logic/src/financial-actions/account-create-default-registration";

interface CapturedSender {
  readonly id: string;
  readonly senderName: string;
  readonly normalizedSenderName: string;
}
export interface AccountDefaultPreparedCommand {
  readonly ownerId: string;
  readonly form: Readonly<AccountFormData>;
  readonly snapshot: AccountDefaultSnapshot;
  readonly dependencyActionIds: readonly string[];
  readonly accountId: string;
  readonly bankDetailId: string | null;
  readonly senders: readonly CapturedSender[];
  readonly effectId: string | null;
  readonly openingMinorUnits: string;
  readonly openingBalance: number;
  readonly envelope: FinancialActionEnvelopeV1;
}

export interface PrepareAccountDefaultCommandInput {
  readonly ownerId: string;
  readonly form: Readonly<AccountFormData>;
  readonly snapshot: AccountDefaultSnapshot;
  readonly dependencyActionIds: readonly string[];
  readonly createId: () => string;
  readonly occurredAt: string;
}
const MAX_SIGNED_MINOR_UNITS = 9223372036854775807n;

function reject(code: string): never {
  throw new Error("account_default_command_" + code);
}
function ascii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function normalizedSenderName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
function normalizeSenders(
  accountType: AccountFormData["accountType"],
  names: readonly string[],
  createId: () => string
): readonly CapturedSender[] {
  if (accountType === "CASH") return Object.freeze([]);
  const seen = new Set<string>();
  const result: CapturedSender[] = [];
  for (const raw of names) {
    const senderName = raw.trim().replace(/\s+/g, " ");
    const normalized = normalizedSenderName(senderName);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(Object.freeze({
      id: createId(),
      senderName,
      normalizedSenderName: normalized,
    }));
  }
  return Object.freeze(result);
}
function exactOpening(form: Readonly<AccountFormData>): {
  readonly minorUnits: string;
  readonly amount: number;
} {
  const places = getCurrencyPrecision(form.currency);
  // Existing exact money helper supplies half-even final precision.
  if (form.balance.startsWith("-")) reject("negative_opening");
  const canonical = roundDecimal(form.balance, places);
  const minorUnits = toMinorUnits(canonical, places);
  if (BigInt(minorUnits) > MAX_SIGNED_MINOR_UNITS)
    reject("opening_out_of_range");
  const normalized = fromMinorUnits(minorUnits, places);
  const amount = Number(normalized);
  if (!Number.isFinite(amount) ||
      serializeDecimal(String(amount)) !== serializeDecimal(normalized))
    reject("opening_not_exact_number");
  return { minorUnits, amount };
}
function freezeRecursive(value: unknown): void {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) freezeRecursive(nested);
    Object.freeze(value);
  }
}
export function prepareAccountDefaultCommand(
  input: PrepareAccountDefaultCommandInput
): AccountDefaultPreparedCommand {
  // Clone first with canonical mutable inferred types, then freeze recursively
  // at runtime; readonly outward typing does not change the Zod wire model.
  const form: AccountFormData = {
    ...input.form,
    senderNames: [...(input.form.senderNames ?? [])],
  };
  const snapshot: AccountDefaultSnapshot = {
    activeAccountIds: [...input.snapshot.activeAccountIds],
    defaultAccount: input.snapshot.defaultAccount === null
      ? null
      : { ...input.snapshot.defaultAccount },
  };
  freezeRecursive(form);
  freezeRecursive(snapshot);
  const opening = exactOpening(form);
  const actionId = input.createId();
  const accountId = input.createId();
  const bankDetailId = form.accountType === "BANK" ? input.createId() : null;
  const senders = normalizeSenders(
    form.accountType,
    form.senderNames ?? [],
    input.createId
  );
  const effectId = opening.minorUnits === "0" ? null : input.createId();
  const isDefault =
    form.defaultIntent === true || snapshot.activeAccountIds.length === 0;
  const previousDefaultId = isDefault
    ? snapshot.defaultAccount?.accountId ?? null
    : null;
  const createdAt = input.occurredAt;
  const records: AccountCreateDefaultPayload["domainMutation"]["records"] = [{
    entity: "account",
    mode: "create",
    expectedUpdatedAt: null,
    after: {
      id: accountId,
      name: form.name.trim(),
      type: form.accountType,
      currency: form.currency,
      institutionId: form.institutionId ?? null,
      providerDisplayName:
        form.providerDisplayName?.trim() || form.bankName?.trim() || null,
      isDefault,
      createdAt,
      deleted: false,
      openingBalanceMinorUnits: opening.minorUnits,
      targetBalanceMinorUnits: null,
    },
  }];
  if (previousDefaultId !== null) {
    records.push({
      entity: "account_default",
      mode: "update",
      expectedIsDefault: true,
      after: { id: previousDefaultId, isDefault: false },
    });
  }
  for (const sender of senders) {
    records.push({
      entity: "account_sms_sender",
      mode: "create",
      expectedUpdatedAt: null,
      after: {
        id: sender.id,
        accountId,
        senderName: sender.senderName,
        normalizedSenderName: sender.normalizedSenderName,
        createdAt,
        deleted: false,
      },
    });
  }
  if (bankDetailId !== null) {
    records.push({
      entity: "bank_details",
      mode: "create",
      expectedUpdatedAt: null,
      after: {
        id: bankDetailId,
        accountId,
        accountNumber: form.accountNumber?.trim() || null,
        cardLast4: form.cardLast4?.trim() || null,
        createdAt,
        deleted: false,
      },
    });
  }
  records.sort((a,b) => ascii(a.entity + ":" + a.after.id,b.entity+":"+b.after.id));
  const createGuards: AccountCreateDefaultPayload["createGuards"] = [];
  for (const record of records) {
    if (record.mode === "create") {
      createGuards.push({
        entity: record.entity,
        id: record.after.id,
        expectedAbsent: true,
      });
    }
  }
  const domainRecordRefs = records.map((r) => r.after.id).sort(ascii);
  const accountEffects: AccountCreateDefaultPayload["accountEffects"] =
    effectId === null ? [] : [{
      accountId,
      amountMinorUnits: opening.minorUnits,
      currency: form.currency,
      effectId,
    }];
  const payload = validateAccountCreateDefaultPayload({
    schemaVersion: "account.create-default/v1",
    operationCode: "account.create-default",
    defaultIntent: form.defaultIntent ?? false,
    expectedDefaultSnapshot: snapshot,
    createGuards,
    accountEffects,
    domainRecordRefs,
    domainMutation: { records },
  });
  const definition = createAccountCreateDefaultDefinitions(
    "account_create_default_invalid_payload"
  )[0];
  if (!definition) reject("unregistered_definition");
  const envelope: FinancialActionEnvelopeV1 = {
    actionId,
    accountGuards: effectId === null
      ? [] : [{ accountId, expectedRevision: "0" }],
    domain: "accounts",
    domainReferenceId: accountId,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "create_with_default",
    occurredAt: createdAt,
    payload: definition.validatePayload(payload),
    payloadVersion: "account.create-default/v1",
    userId: input.ownerId,
  };
  const ids = [
    ...domainRecordRefs,
    actionId,
    ...(effectId === null ? [] : [effectId]),
  ];
  if (ids.length !== new Set(ids).size ||
      snapshot.activeAccountIds.some((id) => ids.includes(id)))
    reject("duplicate_planned_identity");
  const dependencies = [...input.dependencyActionIds].sort(ascii);
  if (new Set(dependencies).size !== dependencies.length ||
      dependencies.includes(actionId))
    reject("duplicate_predecessor");
  freezeRecursive(envelope);
  return Object.freeze({
    ownerId: input.ownerId,
    form,
    snapshot,
    dependencyActionIds: Object.freeze(dependencies),
    accountId,
    bankDetailId,
    senders,
    effectId,
    openingMinorUnits: opening.minorUnits,
    openingBalance: opening.amount,
    envelope,
  });
}
