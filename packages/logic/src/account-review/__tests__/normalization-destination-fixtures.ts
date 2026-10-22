/**
 * #395 I1 pure-producer fixtures; exact SMS body/sender UTF-16 provenance.
 * All types reuse canonical parser evidence and the existing mapped SMS model.
 */
import {
  type AccountReviewAccountContext,
  type AccountReviewAccountEvidence,
  type AccountReviewSmsResponseV2,
} from "../schemas";
import type { AccountReviewOwnedContext } from "../normalization-types";
import type { normalizeAccountReviewParserResult } from "../normalization";
import { makeEvidenceSpan, REVIEW_WIRE_IDS } from "./fixtures";
import { NORMALIZATION_IDS, makeSmsInput } from "./normalization-fixtures";

type AtmSmsInput = ReturnType<typeof makeSmsInput>;
export type InvalidDestinationKind =
  | "foreign"
  | "wrong_currency"
  | "wrong_type"
  | "wrong_card"
  | "wrong_provider"
  | "wrong_body"
  | "cross_message";

export const REVIEW_ATM_BODY = "QNB ATM withdrawal EGP 50 to Cash";

function destinationEvidence(
  body: string,
  name: string,
  candidateIds: readonly string[]
): AccountReviewAccountEvidence {
  return {
    state: "explicit",
    name,
    type: "CASH",
    institutionId: null,
    providerDisplayName: null,
    cardLast4: null,
    evidenceSpans: [
      makeEvidenceSpan(REVIEW_WIRE_IDS.smsMessageId, "body", body, name),
    ],
    candidateAccountIds: [...candidateIds],
  };
}

function baseAtmSms(
  body: string,
  destination: AccountReviewAccountEvidence | null
): AtmSmsInput {
  const input = makeSmsInput();
  const financial = input.providerResponse.transactions[0];
  const mapped = input.mappedTransactions[0];
  const submitted = input.submittedMessages[0];
  if (!financial || !mapped || !submitted) {
    throw new Error("Incomplete synthetic ATM input");
  }
  const row: AccountReviewSmsResponseV2["transactions"][number] = {
    ...financial,
    isAtmWithdrawal: true,
    toAccountEvidence: destination,
    accountEvidence: {
      ...financial.accountEvidence,
      evidenceSpans: [
        makeEvidenceSpan(submitted.id, "body", body, "QNB"),
        makeEvidenceSpan(submitted.id, "sender", submitted.sender, "QNB"),
      ],
    },
    currencyEvidence: {
      ...financial.currencyEvidence,
      evidenceSpans: [makeEvidenceSpan(submitted.id, "body", body, "EGP")],
    },
  };
  return {
    ...input,
    financialRows: [row],
    mappedTransactions: [
      { ...mapped, rawSmsBody: body, isAtmWithdrawal: true },
    ],
    submittedMessages: [{ ...submitted, body }],
    providerResponse: {
      ...input.providerResponse,
      transactions: [row],
    },
  };
}

export function makeGroundedAtmSms(): AtmSmsInput {
  return baseAtmSms(
    REVIEW_ATM_BODY,
    destinationEvidence(REVIEW_ATM_BODY, "Cash", [
      REVIEW_WIRE_IDS.cashAccountId,
    ])
  );
}

export function replaceAtmDestination(
  input: AtmSmsInput,
  destination: AccountReviewAccountEvidence | null
): AtmSmsInput {
  const source = input.providerResponse.transactions[0];
  if (!source) throw new Error("Missing ATM financial row");
  const row = { ...source, toAccountEvidence: destination };
  return {
    ...input,
    financialRows: [row],
    providerResponse: { ...input.providerResponse, transactions: [row] },
  };
}

export function makeUnmatchedAtmSms(): AtmSmsInput {
  const body = "QNB ATM withdrawal EGP 50 to Office Cash";
  return baseAtmSms(body, destinationEvidence(body, "Office Cash", []));
}

export function makeUncertainAtmSms(): AtmSmsInput {
  const input = makeGroundedAtmSms();
  const destination: AccountReviewAccountEvidence = {
    state: "uncertain",
    name: "Cash",
    type: "CASH",
    institutionId: null,
    providerDisplayName: null,
    cardLast4: null,
    evidenceSpans: [
      makeEvidenceSpan(
        REVIEW_WIRE_IDS.smsMessageId,
        "body",
        REVIEW_ATM_BODY,
        "Cash"
      ),
    ],
    candidateAccountIds: [],
  };
  return replaceAtmDestination(input, destination);
}

export function makeAbsentAtmSms(): AtmSmsInput {
  return replaceAtmDestination(makeGroundedAtmSms(), {
    state: "absent",
    name: null,
    type: null,
    institutionId: null,
    providerDisplayName: null,
    cardLast4: null,
    evidenceSpans: [],
    candidateAccountIds: [],
  });
}

function withCashCurrencyUsd(input: AtmSmsInput): AtmSmsInput {
  const original = input.reviewAccountSnapshots;
  const rewriteLocal = (
    account: AccountReviewOwnedContext["accounts"][number]
  ): AccountReviewOwnedContext["accounts"][number] =>
    account.id === REVIEW_WIRE_IDS.cashAccountId
      ? { ...account, currency: "USD" }
      : account;
  const rewriteProvider = (
    account: AccountReviewAccountContext
  ): AccountReviewAccountContext =>
    account.id === REVIEW_WIRE_IDS.cashAccountId
      ? { ...account, currency: "USD" }
      : account;
  return {
    ...input,
    reviewAccountSnapshots: {
      ...original,
      accounts: original.accounts.map(rewriteLocal),
      providerContext: {
        ...original.providerContext,
        accounts: original.providerContext.accounts.map(rewriteProvider),
      },
    },
  };
}

function changeAtmDestination(
  input: AtmSmsInput,
  kind: InvalidDestinationKind
): AtmSmsInput {
  const evidence = input.providerResponse.transactions[0]?.toAccountEvidence;
  if (!evidence) throw new Error("Expected canonical Cash destination proof");
  if (kind === "foreign")
    return replaceAtmDestination(input, {
      ...evidence,
      candidateAccountIds: [NORMALIZATION_IDS.foreignOwner],
    });
  if (kind === "wrong_currency") return withCashCurrencyUsd(input);
  if (kind === "wrong_type")
    return replaceAtmDestination(input, {
      ...evidence,
      type: "BANK",
    });
  if (kind === "wrong_card")
    return replaceAtmDestination(input, {
      ...evidence,
      cardLast4: "9999",
    });
  if (kind === "wrong_provider")
    return replaceAtmDestination(input, {
      ...evidence,
      providerDisplayName: "Not Cash",
    });
  return input;
}

export function makeInvalidAtmDestination(
  kind: InvalidDestinationKind
): AtmSmsInput {
  const input = makeGroundedAtmSms();
  if (kind !== "wrong_body" && kind !== "cross_message") {
    return changeAtmDestination(input, kind);
  }
  const evidence = input.providerResponse.transactions[0]?.toAccountEvidence;
  if (!evidence) throw new Error("Missing Cash destination evidence");
  if (kind === "wrong_body")
    return replaceAtmDestination(input, {
      ...evidence,
      evidenceSpans: [
        makeEvidenceSpan(REVIEW_WIRE_IDS.smsMessageId, "body", "Cash", "Cash"),
      ],
    });
  return makeCrossMessageDestination(input, evidence);
}

function makeCrossMessageDestination(
  input: AtmSmsInput,
  proof: AccountReviewAccountEvidence
): AtmSmsInput {
  const body = "CIB withdrawal Cash EGP 25";
  const wrong = replaceAtmDestination(input, {
    ...proof,
    evidenceSpans: [
      makeEvidenceSpan(
        NORMALIZATION_IDS.secondSmsMessageId,
        "body",
        body,
        "Cash"
      ),
    ],
  });
  return {
    ...wrong,
    submittedMessages: [
      ...wrong.submittedMessages,
      {
        id: NORMALIZATION_IDS.secondSmsMessageId,
        body,
        sender: "CIB",
        smsFingerprint: NORMALIZATION_IDS.secondSmsFingerprint,
      },
    ],
  };
}

export function makeAtmWithAmbiguousCurrency(): AtmSmsInput {
  const input = makeGroundedAtmSms();
  const financial = input.providerResponse.transactions[0];
  if (!financial) throw new Error("Missing synthetic ATM finance");
  const row: AccountReviewSmsResponseV2["transactions"][number] = {
    ...financial,
    currency: null,
    currencyEvidence: {
      state: "ambiguous",
      statedCode: null,
      candidateCodes: ["EGP", "USD"],
      evidenceSpans: [],
    },
  };
  return {
    ...input,
    financialRows: [row],
    providerResponse: { ...input.providerResponse, transactions: [row] },
  };
}

export function makeAtmWithLegacyDestinationId(): AtmSmsInput {
  const input = replaceAtmDestination(makeGroundedAtmSms(), null);
  return {
    ...input,
    mappedTransactions: input.mappedTransactions.map((transaction) => ({
      ...transaction,
      toAccountId: REVIEW_WIRE_IDS.cashAccountId,
    })),
  };
}

export function makeAtmV1Input(): Parameters<
  typeof normalizeAccountReviewParserResult
>[0] {
  return { ...makeGroundedAtmSms(), providerResponse: null };
}

function ownedQnbBankSnapshots(
  input: AtmSmsInput
): AtmSmsInput["reviewAccountSnapshots"] {
  const snapshots = input.reviewAccountSnapshots;
  const bankId = REVIEW_WIRE_IDS.bankAccountId;
  return {
    ...snapshots,
    accounts: snapshots.accounts.map((account) =>
      account.id === bankId
        ? {
            ...account,
            name: "QNB",
            providerDisplayName: "QNB",
            senderNames: ["QNB"],
          }
        : account
    ),
    providerContext: {
      ...snapshots.providerContext,
      accounts: snapshots.providerContext.accounts.map((account) =>
        account.id === bankId
          ? {
              ...account,
              name: "QNB",
              providerDisplayName: "QNB",
              senderNames: ["QNB"],
            }
          : account
      ),
    },
  };
}

/**
 * Original ATM source proof is valid QNB BANK. Null destination type is
 * permissible without owned candidates, but does not prove BANK as Cash.
 */
export function makeNullHintAtmDestination(
  withBankCandidate: boolean
): AtmSmsInput {
  const input = makeGroundedAtmSms();
  const sourceRow = input.providerResponse.transactions[0];
  if (!sourceRow || !sourceRow.toAccountEvidence) {
    throw new Error("Missing original ATM source and destination proof");
  }
  const destination: AccountReviewAccountEvidence = withBankCandidate
    ? {
        ...sourceRow.accountEvidence,
        type: null,
        candidateAccountIds: [REVIEW_WIRE_IDS.bankAccountId],
      }
    : {
        ...sourceRow.toAccountEvidence,
        type: null,
        candidateAccountIds: [],
      };
  const updated = replaceAtmDestination(input, destination);
  return {
    ...updated,
    reviewAccountSnapshots: withBankCandidate
      ? ownedQnbBankSnapshots(input)
      : input.reviewAccountSnapshots,
  };
}
