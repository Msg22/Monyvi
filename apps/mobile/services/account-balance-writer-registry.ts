export const ACCOUNT_BALANCE_WRITER_STATUSES = {
  BLOCKED: "blocked",
  GUARDED: "guarded",
} as const;

export type AccountBalanceWriterStatus =
  (typeof ACCOUNT_BALANCE_WRITER_STATUSES)[keyof typeof ACCOUNT_BALANCE_WRITER_STATUSES];

export interface AccountBalanceWriterRegistration {
  readonly writerId: string;
  readonly status: AccountBalanceWriterStatus;
}

export const ACCOUNT_BALANCE_WRITER_REGISTRY = Object.freeze([
  { writerId: "account.cash.create-within-writer", status: "guarded" },
  { writerId: "account.cash.prepare", status: "blocked" },
  { writerId: "account.cash.prepare-named", status: "blocked" },
  { writerId: "account.create", status: "blocked" },
  { writerId: "account.pending.prepare", status: "blocked" },
  { writerId: "account.edit-balance", status: "blocked" },
  { writerId: "transaction.create", status: "guarded" },
  { writerId: "transaction.update", status: "blocked" },
  { writerId: "transaction.delete", status: "blocked" },
  { writerId: "transaction.convert-to-transfer", status: "blocked" },
  { writerId: "transaction.batch-delete", status: "blocked" },
  { writerId: "transfer.create", status: "blocked" },
  { writerId: "transfer.update", status: "blocked" },
  { writerId: "transfer.delete", status: "blocked" },
  { writerId: "transfer.convert-to-transaction", status: "blocked" },
  { writerId: "transaction.batch-import", status: "blocked" },
  { writerId: "recurring.pay-now", status: "guarded" },
  { writerId: "sms.review-durable", status: "blocked" },
  { writerId: "sms.review-legacy", status: "blocked" },
  { writerId: "sms.live-foreground", status: "blocked" },
  { writerId: "sms.live-background", status: "blocked" },
  { writerId: "sms.live-headless", status: "blocked" },
  { writerId: "sms.live-auto-confirm", status: "blocked" },
  { writerId: "sms.notification-confirm", status: "blocked" },
  { writerId: "sms.live-atm", status: "blocked" },
  { writerId: "debt.no-active-writer", status: "guarded" },
  { writerId: "sync.accounts.push-full-row", status: "guarded" },
  { writerId: "sync.accounts.pull-full-row", status: "guarded" },
  { writerId: "remote.accounts.authenticated-update", status: "blocked" },
  { writerId: "fixture.accounts.upsert", status: "blocked" },
  { writerId: "fixture.accounts.restore", status: "blocked" },
  { writerId: "repair.accounts.recalculate-all", status: "blocked" },
] as const satisfies readonly AccountBalanceWriterRegistration[]);

const ACCOUNT_BALANCE_WRITER_BY_ID: ReadonlyMap<
  string,
  AccountBalanceWriterRegistration
> = new Map(
  ACCOUNT_BALANCE_WRITER_REGISTRY.map((registration) => [
    registration.writerId,
    registration,
  ])
);

export function requireGuardedAccountBalanceWriter(writerId: string): void {
  const registration = ACCOUNT_BALANCE_WRITER_BY_ID.get(writerId);
  if (registration?.status !== ACCOUNT_BALANCE_WRITER_STATUSES.GUARDED) {
    throw new Error(`account_balance_writer_blocked:${writerId}`);
  }
}
