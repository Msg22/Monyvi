/**
 * #395 T064 — frozen Add default-intent payload fixtures, not a second DTO.
 * Types derive from the new inactive canonical financial-actions module.
 * Test fixtures are not a separate production DTO or business implementation.
 */
import type { AccountCreateDefaultPayload } from "../account-create-default";

export const ADD_DEFAULT_IDS = {
  owner: "018f0c7a-1234-4abc-8def-000000000001",
  foreignOwner: "018f0c7a-1234-4abc-8def-000000000002",
  previous: "018f0c7a-1234-4abc-8def-000000000010",
  other: "018f0c7a-1234-4abc-8def-000000000011",
  newAccount: "018f0c7a-1234-4abc-8def-000000000020",
  bankDetails: "018f0c7a-1234-4abc-8def-000000000021",
  sender: "018f0c7a-1234-4abc-8def-000000000022",
  effect: "018f0c7a-1234-4abc-8def-000000000023",
  action: "018f0c7a-1234-4abc-8def-000000000024",
};

export const ADD_DEFAULT_CREATED_AT = "2026-10-16T09:00:00.000Z";

type AddMutation = AccountCreateDefaultPayload["domainMutation"]["records"][number];
type AccountAfter = Extract<AddMutation, { readonly entity: "account" }>["after"];

export interface AddDefaultFixtureOptions {
  readonly accountId?: string;
  readonly accountType?: AccountAfter["type"];
  readonly activeAccountIds?: readonly string[];
  readonly currentDefaultId?: string | null;
  readonly defaultIntent?: boolean;
  readonly createdIsDefault?: boolean;
  readonly openingMinorUnits?: string;
  readonly withBankDetails?: boolean;
  readonly withSender?: boolean;
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function mutationKey(mutation: AddMutation): string {
  return mutation.entity + ":" + mutation.after.id;
}

/** Valid, closed action for account creation and at most one captured default clear. */
export function makeAccountCreateDefaultPayload(
  options: AddDefaultFixtureOptions = {}
): AccountCreateDefaultPayload {
  const ids = ADD_DEFAULT_IDS;
  const accountId = options.accountId ?? ids.newAccount;
  const accountType = options.accountType ?? "BANK";
  const activeAccountIds = [
    ...(options.activeAccountIds ?? [ids.previous]),
  ].sort(asciiCompare);
  const currentDefaultId = options.currentDefaultId === undefined
    ? ids.previous
    : options.currentDefaultId;
  const defaultIntent = options.defaultIntent ?? true;
  const isDefault = options.createdIsDefault ??
    (defaultIntent || activeAccountIds.length === 0);
  const openingMinorUnits = options.openingMinorUnits ?? "0";
  const withBankDetails = options.withBankDetails ?? (accountType === "BANK");
  const withSender = options.withSender ?? (accountType !== "CASH");
  const mutations: AddMutation[] = [{
    entity: "account",
    mode: "create",
    expectedUpdatedAt: null,
    after: {
      id: accountId,
      name: "New CIB Account",
      type: accountType,
      currency: "EGP",
      institutionId: accountType === "BANK" ? "cib" : null,
      providerDisplayName: accountType === "BANK" ? "CIB" : null,
      isDefault,
      createdAt: ADD_DEFAULT_CREATED_AT,
      deleted: false,
      openingBalanceMinorUnits: openingMinorUnits,
      targetBalanceMinorUnits: null,
    },
  }];

  if (withBankDetails) {
    mutations.push({
      entity: "bank_details",
      mode: "create",
      expectedUpdatedAt: null,
      after: {
        id: ids.bankDetails,
        accountId,
        accountNumber: null,
        cardLast4: "1234",
        createdAt: ADD_DEFAULT_CREATED_AT,
        deleted: false,
      },
    });
  }
  if (withSender) {
    mutations.push({
      entity: "account_sms_sender",
      mode: "create",
      expectedUpdatedAt: null,
      after: {
        id: ids.sender,
        accountId,
        senderName: "CIBEGYPT",
        normalizedSenderName: "cibegypt",
        createdAt: ADD_DEFAULT_CREATED_AT,
        deleted: false,
      },
    });
  }
  if (isDefault && currentDefaultId !== null && activeAccountIds.length !== 0) {
    mutations.push({
      entity: "account_default",
      mode: "update",
      expectedIsDefault: true,
      after: { id: currentDefaultId, isDefault: false },
    });
  }

  mutations.sort((left, right): number =>
    asciiCompare(mutationKey(left), mutationKey(right))
  );
  const createGuards: AccountCreateDefaultPayload["createGuards"] = [];
  for (const mutation of mutations) {
    if (mutation.mode === "create") {
      createGuards.push({
        entity: mutation.entity,
        id: mutation.after.id,
        expectedAbsent: true,
      });
    }
  }
  createGuards.sort((left, right): number => asciiCompare(
    left.entity + ":" + left.id,
    right.entity + ":" + right.id
  ));

  return {
    schemaVersion: "account.create-default/v1",
    operationCode: "account.create-default",
    defaultIntent,
    expectedDefaultSnapshot: {
      activeAccountIds,
      defaultAccount: currentDefaultId === null
        ? null
        : { accountId: currentDefaultId, isDefault: true },
    },
    createGuards,
    accountEffects: openingMinorUnits === "0" ? [] : [{
      accountId,
      amountMinorUnits: openingMinorUnits,
      currency: "EGP",
      effectId: ids.effect,
    }],
    domainRecordRefs: mutations
      .map((mutation) => mutation.after.id)
      .sort(asciiCompare),
    domainMutation: { records: mutations },
  };
}

/** Strict plain JSON mutation without casts or a copied financial DTO. */
export function replaceRootKey(
  source: object,
  key: string,
  replacement: unknown
): Record<string, unknown> {
  return { ...source, [key]: replacement };
}

export function omitRootKey(
  source: Readonly<Record<string, unknown>>,
  key: string
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(source).filter(([candidate]) => candidate !== key)
  );
}

export function firstAccountPayload(
  defaultIntent = false
): AccountCreateDefaultPayload {
  return makeAccountCreateDefaultPayload({
    activeAccountIds: [],
    currentDefaultId: null,
    defaultIntent,
    accountType: "CASH",
    withBankDetails: false,
    withSender: false,
  });
}
