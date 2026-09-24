import { Account, AccountSmsSender, database } from "@monyvi/db";
import type { Model } from "@nozbe/watermelondb";

import { queryChildrenOfOwnedParent } from "./user-data-access";

export function normalizeAccountSmsSender(senderName: string): string {
  return collapseAccountSmsSenderWhitespace(senderName).toLowerCase();
}

function collapseAccountSmsSenderWhitespace(senderName: string): string {
  return senderName.trim().replace(/\s+/g, " ");
}

function uniqueTrimmedSenderNames(
  senderNames: readonly string[]
): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const senderName of senderNames) {
    const displayName = collapseAccountSmsSenderWhitespace(senderName);
    const normalized = normalizeAccountSmsSender(displayName);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(displayName);
  }

  return result;
}

export interface PreparedSmsSenderWrites {
  readonly preparedCreates: readonly Model[];
  readonly existingOperations: ReadonlyArray<{
    readonly kind: "update";
    readonly model: Model;
    readonly update: (model: Model) => void;
  }>;
}

function emptyPreparedWrites(): PreparedSmsSenderWrites {
  return Object.freeze({ preparedCreates: [], existingOperations: [] });
}

export function prepareCreateAccountSmsSenders(
  accountId: string,
  senderNames: readonly string[]
): PreparedSmsSenderWrites {
  const creates = uniqueTrimmedSenderNames(senderNames).map((senderName) =>
    database
      .get<AccountSmsSender>("account_sms_senders")
      .prepareCreate((sender) => {
        sender.accountId = accountId;
        sender.senderName = senderName;
        sender.normalizedSenderName = normalizeAccountSmsSender(senderName);
        sender.deleted = false;
      })
  );
  return Object.freeze({ preparedCreates: creates, existingOperations: [] });
}

export async function prepareReplaceAccountSmsSenders(
  account: Account,
  currentUserId: string,
  senderNames: readonly string[]
): Promise<PreparedSmsSenderWrites> {
  const desiredSenderNames = uniqueTrimmedSenderNames(senderNames);
  const desiredByNormalizedSender = new Map<string, string>();
  for (const senderName of desiredSenderNames) {
    desiredByNormalizedSender.set(
      normalizeAccountSmsSender(senderName),
      senderName
    );
  }

  const existingSenders = await queryChildrenOfOwnedParent(
    database.get<AccountSmsSender>("account_sms_senders"),
    account,
    currentUserId,
    "account_id"
  ).fetch();

  const existingByNormalizedSender = new Map<string, AccountSmsSender>();
  for (const sender of existingSenders) {
    const normalized = normalizeAccountSmsSender(sender.senderName);
    const current = existingByNormalizedSender.get(normalized);
    if (!current || (current.deleted && !sender.deleted)) {
      existingByNormalizedSender.set(normalized, sender);
    }
  }

  const preparedCreates: Model[] = [];
  const existingOperations: Array<{
    readonly kind: "update";
    readonly model: Model;
    readonly update: (model: Model) => void;
  }> = [];
  for (const sender of existingSenders) {
    if (sender.deleted) {
      continue;
    }
    const normalized = normalizeAccountSmsSender(sender.senderName);
    if (!desiredByNormalizedSender.has(normalized)) {
      const model = sender;
      existingOperations.push({
        kind: "update",
        model,
        update: (target): void => {
          (target as AccountSmsSender).deleted = true;
        },
      });
      continue;
    }
  }

  for (const [normalized, senderName] of desiredByNormalizedSender) {
    const existingSender = existingByNormalizedSender.get(normalized);
    if (existingSender) {
      if (existingSender.deleted || existingSender.senderName !== senderName) {
        const model = existingSender;
        existingOperations.push({
          kind: "update",
          model,
          update: (target): void => {
            const draft = target as AccountSmsSender;
            draft.senderName = senderName;
            draft.normalizedSenderName = normalized;
            draft.deleted = false;
          },
        });
      }
      continue;
    }
    preparedCreates.push(
      database
        .get<AccountSmsSender>("account_sms_senders")
        .prepareCreate((sender) => {
          sender.accountId = account.id;
          sender.senderName = senderName;
          sender.normalizedSenderName = normalized;
          sender.deleted = false;
        })
    );
  }
  if (preparedCreates.length === 0 && existingOperations.length === 0) {
    return emptyPreparedWrites();
  }
  return Object.freeze({
    preparedCreates: Object.freeze([...preparedCreates]),
    existingOperations: Object.freeze([...existingOperations]),
  });
}

export async function createAccountSmsSendersWithinWriter(
  accountId: string,
  senderNames: readonly string[]
): Promise<void> {
  const uniqueSenderNames = uniqueTrimmedSenderNames(senderNames);

  for (const senderName of uniqueSenderNames) {
    await database
      .get<AccountSmsSender>("account_sms_senders")
      .create((sender) => {
        sender.accountId = accountId;
        sender.senderName = senderName;
        sender.normalizedSenderName = normalizeAccountSmsSender(senderName);
        sender.deleted = false;
      });
  }
}

export async function replaceAccountSmsSendersWithinWriter(
  account: Account,
  currentUserId: string,
  senderNames: readonly string[]
): Promise<void> {
  const desiredSenderNames = uniqueTrimmedSenderNames(senderNames);
  const desiredByNormalizedSender = new Map<string, string>();
  for (const senderName of desiredSenderNames) {
    desiredByNormalizedSender.set(
      normalizeAccountSmsSender(senderName),
      senderName
    );
  }

  const existingSenders = await queryChildrenOfOwnedParent(
    database.get<AccountSmsSender>("account_sms_senders"),
    account,
    currentUserId,
    "account_id"
  ).fetch();

  const existingByNormalizedSender = new Map<string, AccountSmsSender>();
  for (const sender of existingSenders) {
    const normalized = normalizeAccountSmsSender(sender.senderName);
    const current = existingByNormalizedSender.get(normalized);
    if (!current || (current.deleted && !sender.deleted)) {
      existingByNormalizedSender.set(normalized, sender);
    }
  }

  for (const sender of existingSenders) {
    if (sender.deleted) {
      continue;
    }

    const normalized = normalizeAccountSmsSender(sender.senderName);
    const desiredSenderName = desiredByNormalizedSender.get(normalized);

    if (desiredSenderName === undefined) {
      await sender.update((draft) => {
        draft.deleted = true;
      });
      continue;
    }

    if (sender.senderName !== desiredSenderName) {
      await sender.update((draft) => {
        draft.senderName = desiredSenderName;
        draft.normalizedSenderName = normalized;
      });
    }
  }

  for (const [normalized, senderName] of desiredByNormalizedSender) {
    const existingSender = existingByNormalizedSender.get(normalized);
    if (existingSender) {
      if (existingSender.deleted || existingSender.senderName !== senderName) {
        await existingSender.update((draft) => {
          draft.senderName = senderName;
          draft.normalizedSenderName = normalized;
          draft.deleted = false;
        });
      }
      continue;
    }

    await database
      .get<AccountSmsSender>("account_sms_senders")
      .create((sender) => {
        sender.accountId = account.id;
        sender.senderName = senderName;
        sender.normalizedSenderName = normalized;
        sender.deleted = false;
      });
  }
}
