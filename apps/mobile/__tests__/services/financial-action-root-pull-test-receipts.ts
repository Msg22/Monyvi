/** #395 T053 SQL090 acceptance transport fixtures. Registered actual immutable
 * Review envelopes only; never replaces the SDK, SQL, root pull or Save. */
import type { FinancialActionGroup } from "@monyvi/db";
import { parseFinancialActionEnvelopeJson } from "../../../../packages/logic/src/financial-actions/action-contracts";
import { reviewBatchSaveWireSchema } from "../../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import { createAccountReviewFinancialRegistry } from "../../services/account-review-financial-command-service";
import { testUuid } from "./account-review-save-test-fixtures";

const SQL090_ACCEPTED_AT = "2026-10-16T14:00:00.000Z";
export interface ReviewAcceptanceFixture extends Readonly<
  Record<string, unknown>
> {
  readonly accountRevisions: ReadonlyArray<
    Readonly<{
      accountId: string;
      revision: string;
    }>
  >;
  readonly actionId: string;
  readonly effectiveEventId: null;
  readonly holdingRevision: null;
  readonly serverAcceptedAt: string;
  readonly status: "accepted" | "idempotent";
}

/** SQL090's real six-field review receipt from the already registered,
 * immutable physical action envelope. Server transport is the only stub. */
export function sql090ReviewAcceptedReceipt(
  root: FinancialActionGroup,
  status: "accepted" | "idempotent" = "accepted"
): ReviewAcceptanceFixture {
  const envelope = parseFinancialActionEnvelopeJson(
    root.payloadJson,
    createAccountReviewFinancialRegistry()
  );
  if (
    envelope.domain !== "transactions" ||
    envelope.kind !== "review_batch_save" ||
    envelope.payloadVersion !== "review.batch-save/v1"
  ) {
    throw new Error("test_requires_registered_review_envelope");
  }
  const payload = reviewBatchSaveWireSchema.parse(envelope.payload);
  const createdIds = new Set(
    payload.domainMutation.records
      .filter((entry) => entry.entity === "account")
      .map((entry) => entry.after.id)
  );
  const accountRevisions = envelope.accountGuards.map((guard) => ({
    accountId: guard.accountId,
    revision: createdIds.has(guard.accountId)
      ? "1"
      : (BigInt(guard.expectedRevision) + 1n).toString(),
  }));
  if (
    accountRevisions.length !== payload.accountEffects.length ||
    accountRevisions.some(
      (entry, index) =>
        entry.accountId !== payload.accountEffects[index]?.accountId
    )
  ) {
    throw new Error("test_review_receipt_does_not_match_registered_effects");
  }
  return {
    accountRevisions,
    actionId: envelope.actionId,
    effectiveEventId: null,
    holdingRevision: null,
    serverAcceptedAt: SQL090_ACCEPTED_AT,
    status,
  };
}
/** Preserve exact network JSON source bytes: JSON.stringify(object) cannot
 * represent duplicate keys or an oversized whitespace-only prefix. */
export function rawAcceptedReviewTransport(
  outcome: string,
  status: "accepted" | "idempotent" = "accepted"
): Readonly<Record<string, unknown>> {
  return {
    state: "accepted",
    server_outcome: status,
    outcome_json: outcome,
    outcome_json_text: outcome,
    rejection_code: null,
  };
}
export function acceptedReviewTransport(
  receipt: Readonly<Record<string, unknown>>,
  status: "accepted" | "idempotent" = "accepted"
): Readonly<Record<string, unknown>> {
  return rawAcceptedReviewTransport(JSON.stringify(receipt), status);
}
function replaceOneRawReceiptFragment(
  raw: string,
  original: string,
  replacement: string
): string {
  const parts = raw.split(original);
  if (parts.length !== 2) {
    throw new Error("missing_unique_original_raw_receipt_fragment");
  }
  return parts[0] + replacement + parts[1];
}
interface InvalidRawReceiptCase {
  readonly name: string;
  readonly raw: (valid: ReviewAcceptanceFixture) => string;
}
export const invalidRawReceipts: readonly InvalidRawReceiptCase[] = [
  {
    name: "duplicate top-level status rejected then accepted",
    raw: (valid) =>
      replaceOneRawReceiptFragment(
        JSON.stringify(valid),
        '"status":"accepted"',
        '"status":"rejected","status":"accepted"'
      ),
  },
  {
    name: "duplicate nested account revision wrong then correct",
    raw: (valid: ReviewAcceptanceFixture): string => {
      const current = valid.accountRevisions[0];
      if (!current) throw new Error("missing_registered_account_revision");
      return replaceOneRawReceiptFragment(
        JSON.stringify(valid),
        '"revision":"' + current.revision + '"',
        '"revision":"0","revision":"' + current.revision + '"'
      );
    },
  },
  {
    name: "oversized original whitespace before an otherwise valid receipt",
    raw: (valid) => " ".repeat(65536) + JSON.stringify(valid),
  },
];

interface InvalidReviewReceiptCase {
  readonly name: string;
  readonly tamper: (
    valid: ReviewAcceptanceFixture
  ) => Readonly<Record<string, unknown>>;
}
export const badReviewReceipts: readonly InvalidReviewReceiptCase[] = [
  {
    name: "incomplete accepted state-only JSON",
    tamper: () => ({ status: "accepted" }),
  },
  {
    name: "missing sixth SQL090 member",
    tamper: (valid) =>
      Object.fromEntries(
        Object.entries(valid).filter(([key]) => key !== "serverAcceptedAt")
      ),
  },
  {
    name: "wrong original action",
    tamper: (valid) => ({ ...valid, actionId: testUuid(997) }),
  },
  {
    name: "rejected receipt status in an accepted root",
    tamper: (valid) => ({ ...valid, status: "rejected" }),
  },
  {
    name: "invalid UTC-millisecond timestamp",
    tamper: (valid) => ({
      ...valid,
      serverAcceptedAt: "2026-02-30T14:00:00.000Z",
    }),
  },
  {
    name: "metal event ID leaked into Review receipt",
    tamper: (valid) => ({ ...valid, effectiveEventId: testUuid(900) }),
  },
  {
    name: "metal holding revision leaked into Review receipt",
    tamper: (valid) => ({ ...valid, holdingRevision: "1" }),
  },
  {
    name: "missing affected account membership",
    tamper: (valid) => ({ ...valid, accountRevisions: [] }),
  },
  {
    name: "wrong account membership",
    tamper: (valid) => ({
      ...valid,
      accountRevisions: valid.accountRevisions.map((row, index) =>
        index === 0 ? { ...row, accountId: testUuid(999) } : row
      ),
    }),
  },
  {
    name: "duplicate account revisions",
    tamper: (valid) => ({
      ...valid,
      accountRevisions: [
        ...valid.accountRevisions,
        ...valid.accountRevisions.slice(0, 1),
      ],
    }),
  },
  {
    name: "account revision beyond signed BIGINT",
    tamper: (valid) => ({
      ...valid,
      accountRevisions: valid.accountRevisions.map((row, index) =>
        index === 0 ? { ...row, revision: "9223372036854775808" } : row
      ),
    }),
  },
  {
    name: "wrong guarded account revision",
    tamper: (valid) => ({
      ...valid,
      accountRevisions: valid.accountRevisions.map((row, index) =>
        index === 0 ? { ...row, revision: "0" } : row
      ),
    }),
  },
  {
    name: "unexpected seventh top-level field",
    tamper: (valid) => ({ ...valid, isTrusted: true }),
  },
  {
    name: "unexpected nested account-revision field",
    tamper: (valid) => ({
      ...valid,
      accountRevisions: valid.accountRevisions.map((row, index) =>
        index === 0 ? { ...row, optimistic: true } : row
      ),
    }),
  },
];
