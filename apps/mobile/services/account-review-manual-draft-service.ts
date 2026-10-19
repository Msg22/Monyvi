import * as Crypto from "expo-crypto";
import type { Sha256Provider } from "@monyvi/logic";
import { deriveManualRowAccountReviewGroupIdentity } from "../../../packages/logic/src/account-review/identity";
import type {
  AccountReviewCommand,
  AccountReviewRow,
  AccountReviewSession,
} from "../../../packages/logic/src/account-review/review-schemas";

type ManualDraftCommand = Extract<
  AccountReviewCommand,
  { kind: "create_row_account_draft" }
>;
const sha256: Sha256Provider = {
  digestUtf8: (input: string): Promise<string> =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input),
};
export interface PrepareManualSourceDraftInput {
  readonly session: AccountReviewSession;
  readonly row: AccountReviewRow;
  readonly identity: ManualDraftCommand["identity"];
  readonly role: ManualDraftCommand["role"];
}
export async function prepareAccountReviewManualSourceDraft(
  input: PrepareManualSourceDraftInput
): Promise<ManualDraftCommand["manualDraft"]> {
  if (
    input.row.source !== input.session.source ||
    input.row.currency.state !== "known" ||
    (input.role === "source"
      ? input.row.assignment.state !== "unresolved" ||
        (input.session.source === "SMS" && input.identity.type === "CASH")
      : input.row.source !== "SMS" ||
        input.row.transaction.isAtmWithdrawal !== true ||
        input.row.toAssignment?.state !== "unresolved" ||
        input.identity.type !== "CASH")
  )
    throw new Error("account_review_manual_draft_not_eligible");
  const nonce = Crypto.randomUUID();
  const identity = await deriveManualRowAccountReviewGroupIdentity({
    ownerId: input.session.ownerId,
    sessionId: input.session.sessionId,
    source: input.session.source,
    rowId: input.row.rowId,
    role: input.role,
    nonce,
    identity: { ...input.identity, currency: input.row.currency.code },
    hashProvider: sha256,
  });
  return { nonce, ...identity };
}
