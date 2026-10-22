/** Legacy push-suite fixtures: real owner-scoped Q.where reads and registered
 * account-effect envelopes. Metal RPC tests deliberately retain their deployed
 * legacy payload shape; this helper never fakes financial decisions or ACKs.
 */
import { createHash } from "node:crypto";
import type { Database } from "@nozbe/watermelondb";
import {
  serializeCanonicalJsonValue,
  serializeFinancialActionEnvelope,
} from "@monyvi/logic";

type Row = Readonly<Record<string, unknown>>;
type Tables = Readonly<Record<string, readonly Row[]>>;

function read(row: Row, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  return row[
    key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
  ];
}

function matches(row: Row, condition: unknown): boolean {
  if (
    typeof condition !== "object" ||
    condition === null ||
    !("type" in condition) ||
    condition.type !== "where" ||
    !("left" in condition) ||
    typeof condition.left !== "string" ||
    !("comparison" in condition) ||
    !condition.comparison ||
    typeof condition.comparison !== "object"
  )
    return true;
  const comparison = condition.comparison as Readonly<Record<string, unknown>>;
  const right: unknown = comparison.right;
  if (typeof right !== "object" || right === null) return false;
  const value = read(row, condition.left);
  if (comparison.operator === "eq" && "value" in right)
    return value === right.value;
  if (
    comparison.operator === "oneOf" &&
    "values" in right &&
    Array.isArray(right.values)
  )
    return right.values.includes(value);
  return false;
}

/** Actual Q.where predicates are respected, including actor and terminal
 * status; an unrelated foreign root is never returned by an owned read.
 */
export function legacyPushDatabase(
  tables: Tables = {},
  onFetch?: (table: string) => void
): {
  readonly database: Database;
  readonly getMock: jest.Mock;
  readonly queryArgs: unknown[][];
} {
  const queryArgs: unknown[][] = [];
  const getMock = jest.fn((table: string) => ({
    query: jest.fn((...conditions: readonly unknown[]) => {
      queryArgs.push([...conditions]);
      const getRecords = (): Row[] =>
        [...(tables[table] ?? [])].filter((row) =>
          conditions.every((clause) => matches(row, clause))
        );
      return {
        fetch: jest.fn((): Promise<Row[]> => {
          onFetch?.(table);
          return Promise.resolve(getRecords());
        }),
        fetchCount: jest.fn(
          (): Promise<number> => Promise.resolve(getRecords().length)
        ),
      };
    }),
  }));
  return {
    database: { get: getMock } as unknown as Database,
    getMock,
    queryArgs,
  };
}

export const CANONICAL_ACCOUNT_PUSH_OWNER =
  "11111111-1111-4111-8111-111111111111";

/** Construct the same closed legacy account edit contract used by the
 * registered account-balance-effects schema; no synthetic accepted receipt.
 */
export function canonicalLegacyAccountEdit(input: {
  readonly actionId: string;
  readonly accountId: string;
  readonly effectId: string;
  readonly transactionId?: string;
  readonly ownerId?: string;
  readonly state?: "local_complete" | "rejected_compensating";
}): {
  readonly payloadJson: string;
  readonly payloadHash: string;
  readonly rootRaw: Row;
  readonly localRoot: Row;
  readonly accountRaw: Row;
  readonly effectRaw: Row;
  readonly transactionRaw: Row | null;
} {
  const userId = input.ownerId ?? CANONICAL_ACCOUNT_PUSH_OWNER;
  const timestamp = "2026-09-01T12:00:00.000Z";
  const mutations: Array<Record<string, unknown>> = [
    {
      entity: "account",
      mode: "update",
      expectedUpdatedAt: "2026-08-31T12:00:00.000Z",
      after: {
        id: input.accountId,
        name: "Cash",
        type: "CASH",
        currency: "EGP",
        institutionId: null,
        providerDisplayName: null,
        isDefault: true,
        createdAt: "2026-08-01T12:00:00.000Z",
        deleted: false,
        openingBalanceMinorUnits: null,
        targetBalanceMinorUnits: "12500",
      },
    },
  ];
  const transactionRaw: Row | null = input.transactionId
    ? {
        id: input.transactionId,
        user_id: userId,
        account_id: input.accountId,
        amount_minor_units: "2500",
        currency: "EGP",
        deleted: false,
      }
    : null;
  if (input.transactionId)
    mutations.push({
      entity: "transaction",
      mode: "create",
      expectedUpdatedAt: null,
      after: {
        id: input.transactionId,
        accountId: input.accountId,
        amountMinorUnits: "2500",
        categoryId: "00000000-0000-0000-0001-000000000200",
        counterparty: null,
        createdAt: "2026-09-18T12:00:00.000Z",
        currency: "EGP",
        date: "2026-09-18",
        deleted: false,
        isDraft: false,
        linkedAssetId: null,
        linkedDebtId: null,
        linkedRecurringId: null,
        note: "Balance adjustment: 100 to 125",
        smsFingerprint: null,
        source: "MANUAL",
        type: "INCOME",
      },
    });
  const envelope = {
    accountGuards: [{ accountId: input.accountId, expectedRevision: "7" }],
    actionId: input.actionId,
    domain: "accounts",
    domainReferenceId: input.accountId,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "edit_balance",
    occurredAt: timestamp,
    payload: {
      accountEffects: [
        {
          accountId: input.accountId,
          amountMinorUnits: "2500",
          currency: "EGP",
          effectId: input.effectId,
        },
      ],
      domainMutation: { records: mutations },
      domainRecordRefs: [
        input.accountId,
        ...(input.transactionId ? [input.transactionId] : []),
      ].sort(),
      operationCode: "account.edit-balance",
      schemaVersion: "account.balance-effects/v1",
    },
    payloadVersion: "account.balance-effects/v1",
    userId,
  };
  const payloadJson = serializeFinancialActionEnvelope(envelope);
  const payloadHash = createHash("sha256")
    .update(payloadJson, "utf8")
    .digest("hex");
  const state = input.state ?? "local_complete";
  const serverOutcome = state === "rejected_compensating" ? "stale" : null;
  // Actual financial state evidence requires stable lower-case codes and
  // canonical sorted JSON. A noncanonical stale outcome cannot authorize ACK.
  const rejectionCode = serverOutcome ? "revision_stale" : null;
  const outcomeJson =
    state === "rejected_compensating"
      ? serializeCanonicalJsonValue({
          actionId: input.actionId,
          code: "revision_stale",
          status: "stale",
        })
      : null;
  const rootRaw: Row = {
    id: input.actionId,
    action_id: input.actionId,
    domain: "accounts",
    domain_reference_id: input.accountId,
    kind: "edit_balance",
    user_id: userId,
    account_guards_json: JSON.stringify(envelope.accountGuards),
    payload_json: payloadJson,
    payload_hash: payloadHash,
    state,
    server_outcome: serverOutcome,
    outcome_json: outcomeJson,
    rejection_code: rejectionCode,
    deleted: false,
  };
  const localRoot: Row = {
    id: input.actionId,
    actionId: input.actionId,
    domain: "accounts",
    domainReferenceId: input.accountId,
    kind: "edit_balance",
    userId,
    accountGuardsJson: JSON.stringify(envelope.accountGuards),
    payloadJson,
    payloadHash,
    state,
    serverOutcome,
    outcomeJson,
    rejectionCode,
    localRecoverySnapshotJson: null,
    deleted: false,
  };
  return {
    payloadJson,
    payloadHash,
    rootRaw,
    localRoot,
    accountRaw: {
      id: input.accountId,
      user_id: userId,
      balance: 125,
      financial_revision: "8",
      deleted: false,
    },
    effectRaw: {
      id: input.effectId,
      user_id: userId,
      action_id: input.actionId,
      account_id: input.accountId,
      amount_minor_units: "2500",
      currency: "EGP",
      deleted: false,
    },
    transactionRaw,
  };
}
