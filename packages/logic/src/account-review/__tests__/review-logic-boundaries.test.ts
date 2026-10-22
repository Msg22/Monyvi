/**
 * #395 logic-boundaries tests-first Red.
 *
 * Uses the current pure source normalizers, owned-context contract, resolver,
 * canonical reducer and existing synthetic provider/financial fixtures.
 * No business-service mocks, network requests or source-text assertions.
 */
import {
  accountReviewSessionSchema,
  type AccountReviewAccountEvidence,
  type AccountReviewSession,
} from "../schemas";
import type { AccountReviewOwnedContext } from "../normalization-types";
import { normalizeAccountReviewParserResult } from "../normalization";
import {
  normalizeCompleteSmsReviewSession,
  type AcceptedSmsReviewChunk,
  type CompleteSmsReviewNormalizationInput,
} from "../normalization-session";
import { resolveAccountReviewSession } from "../resolution";
import { reduceAccountReviewCommand } from "../reducer";
import {
  makeOwnedContext,
  makeSmsInput,
  makeTwoCurrenciesInput,
  makeTwoSmsInput,
  makeVoiceInput,
  syntheticHashProvider,
} from "./normalization-fixtures";
import { makeEvidenceSpan, REVIEW_WIRE_IDS } from "./fixtures";

type OwnedAccount = AccountReviewOwnedContext["accounts"][number];

const SECOND_BANK_ID = "00000000-0000-4000-8000-000000000311";

const ABSENT_ACCOUNT: AccountReviewAccountEvidence = {
  state: "absent",
  name: null,
  type: null,
  institutionId: null,
  providerDisplayName: null,
  cardLast4: null,
  evidenceSpans: [],
  candidateAccountIds: [],
};

function requireAccount(type: OwnedAccount["type"]): OwnedAccount {
  const account = makeOwnedContext().accounts.find(
    (item) => item.type === type
  );
  if (!account) throw new Error("missing_canonical_test_owned_account");
  return account;
}

/** Mirror the real request projection on every *new* owned snapshot. */
function ownedContext(
  accounts: readonly OwnedAccount[]
): AccountReviewOwnedContext {
  const original = makeOwnedContext();
  return {
    ownerId: original.ownerId,
    preferredCurrency: original.preferredCurrency,
    accounts,
    providerContext: {
      reviewContractVersion: "account-review/v2",
      preferredCurrency: original.preferredCurrency,
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        currency: account.currency,
        type: account.type,
        institutionId: account.institutionId,
        providerDisplayName: account.providerDisplayName,
        cardLast4: account.cardLast4,
        senderNames: [...account.senderNames],
      })),
    },
  };
}

function twoBankSnapshots(defaultId: string): AccountReviewOwnedContext {
  const first = requireAccount("BANK");
  const second: OwnedAccount = {
    ...first,
    id: SECOND_BANK_ID,
    name: "Separate Bank B",
    providerDisplayName: "B Provider",
    senderNames: ["B Alert"],
  };
  return ownedContext([
    { ...first, isDefault: defaultId === first.id },
    { ...second, isDefault: defaultId === second.id },
    { ...requireAccount("CASH"), isDefault: false },
  ]);
}

function requireRow(
  session: AccountReviewSession
): AccountReviewSession["rows"][number] {
  const row = session.rows[0];
  if (!row) throw new Error("missing_genuine_review_row");
  return row;
}

function refreshed(
  session: AccountReviewSession,
  accounts: AccountReviewOwnedContext
): AccountReviewSession {
  return resolveAccountReviewSession({
    session: accountReviewSessionSchema.parse(session),
    accountSnapshots: accounts,
  });
}

/**
 * Genuine ATM source has absent source-account evidence and independent
 * absent Cash-destination proof. Financial and original-message bodies agree.
 */
async function initialAtm(
  accounts: AccountReviewOwnedContext
): Promise<AccountReviewSession> {
  const input = makeSmsInput();
  const original = input.providerResponse.transactions[0];
  const mapped = input.mappedTransactions[0];
  const message = input.submittedMessages[0];
  if (!original || !mapped || !message)
    throw new Error("missing_atm_source_fixture");

  const body = "ATM withdrawal EGP 50";
  const advisory = {
    ...original,
    isAtmWithdrawal: true,
    counterparty: "ATM",
    suggestionRef: null,
    accountEvidence: ABSENT_ACCOUNT,
    toAccountEvidence: null,
    currencyEvidence: {
      ...original.currencyEvidence,
      evidenceSpans: [makeEvidenceSpan(message.id, "body", body, "EGP")],
    },
  };
  const normalized = await normalizeAccountReviewParserResult({
    ...input,
    reviewAccountSnapshots: accounts,
    financialRows: [advisory],
    providerResponse: {
      ...input.providerResponse,
      transactions: [advisory],
      suggestedAccounts: [],
    },
    mappedTransactions: [
      {
        ...mapped,
        counterparty: "ATM",
        originLabel: "ATM notification",
        isAtmWithdrawal: true,
        rawSmsBody: body,
        senderDisplayName: "ATM-NOTIFY",
      },
    ],
    submittedMessages: [
      {
        ...message,
        sender: "ATM-NOTIFY",
        body,
      },
    ],
  });
  expect(normalized.groups).toEqual([]);
  expect(normalized.rows).toHaveLength(1);
  expect(requireRow(normalized).accountEvidence.state).toBe("absent");
  return refreshed(normalized, accounts);
}

function chooseAccount(
  session: AccountReviewSession,
  accounts: AccountReviewOwnedContext,
  accountId: string
): ReturnType<typeof reduceAccountReviewCommand> {
  const row = requireRow(session);
  return reduceAccountReviewCommand({
    state: session,
    command: {
      kind: "choose_row_account",
      ownerId: session.ownerId,
      sessionId: session.sessionId,
      expectedReviewRevision: session.revision,
      expectedOperationGeneration: session.operationGeneration,
      rowId: row.rowId,
      expectedRowRevision: row.revision,
      accountId,
    },
    accountSnapshots: accounts,
    nextUndoToken: null,
    undo: null,
  });
}

function qnbSnapshots(): AccountReviewOwnedContext {
  const qnb: OwnedAccount = {
    ...requireAccount("BANK"),
    name: "QNB Salary",
    providerDisplayName: "QNB",
    senderNames: ["QNB"],
    isDefault: false,
  };
  return ownedContext([qnb, { ...requireAccount("CASH"), isDefault: true }]);
}

/** The submitted sender and evidence span agree; the advisory may lie. */
function smsClaim(
  sender: string,
  candidateAccountIds: string[]
): ReturnType<typeof makeSmsInput> {
  const original = makeSmsInput();
  const message = original.submittedMessages[0];
  const advisory = original.providerResponse.transactions[0];
  const mapped = original.mappedTransactions[0];
  if (!message || !advisory || !mapped)
    throw new Error("missing_sms_claim_fixture");
  const body = sender + " purchase EGP 50";
  const claimed = {
    ...advisory,
    suggestionRef: null,
    accountEvidence: {
      ...advisory.accountEvidence,
      // This is the REAL original sender's text, not the model's claimed QNB.
      evidenceSpans: [makeEvidenceSpan(message.id, "sender", sender, sender)],
      candidateAccountIds,
    },
    currencyEvidence: {
      ...advisory.currencyEvidence,
      evidenceSpans: [makeEvidenceSpan(message.id, "body", body, "EGP")],
    },
  };
  return {
    ...original,
    reviewAccountSnapshots: qnbSnapshots(),
    financialRows: [claimed],
    providerResponse: {
      ...original.providerResponse,
      transactions: [claimed],
      suggestedAccounts: [],
    },
    mappedTransactions: [
      {
        ...mapped,
        rawSmsBody: body,
        senderDisplayName: sender,
      },
    ],
    submittedMessages: [{ ...message, sender, body }],
  };
}

async function normalizedAndResolvedSms(
  input: ReturnType<typeof makeSmsInput>
): Promise<{
  readonly normalized: AccountReviewSession;
  readonly resolved: AccountReviewSession;
}> {
  const normalized = accountReviewSessionSchema.parse(
    await normalizeAccountReviewParserResult(input)
  );
  return {
    normalized,
    resolved: refreshed(normalized, input.reviewAccountSnapshots),
  };
}

function splitAcceptedChunks(
  source: ReturnType<typeof makeTwoSmsInput>,
  secondCaseVariant: boolean
): AcceptedSmsReviewChunk[] {
  return source.providerResponse.transactions.map((advisory, index) => {
    const message = source.submittedMessages.find(
      (item) => item.id === advisory.messageId
    );
    const mapped = source.mappedTransactions.find(
      (item) => item.smsFingerprint === message?.smsFingerprint
    );
    const financial = source.financialRows.find(
      (item) => item.messageId === advisory.messageId
    );
    const suggestion = source.providerResponse.suggestedAccounts.find((item) =>
      item.transactionRefs.includes(advisory.transactionRef)
    );
    if (!message || !mapped || !financial || !suggestion)
      throw new Error("missing_independent_sms_chunk_fixture");
    const cosmetic = secondCaseVariant && index === 1;
    return {
      requestKey: "independent-sms-chunk-" + String(index),
      financialRows: [financial],
      mappedTransactions: [mapped],
      submittedMessages: [message],
      providerResponse: {
        ...source.providerResponse,
        transactions: [advisory],
        suggestedAccounts: [
          {
            ...suggestion,
            transactionRefs: [advisory.transactionRef],
            name: cosmetic ? "qnb" : suggestion.name,
            providerDisplayName: cosmetic
              ? "qnb"
              : suggestion.providerDisplayName,
            senderNames: cosmetic ? ["qnb"] : suggestion.senderNames,
          },
        ],
      },
    };
  });
}

function completeInput(
  chunks: readonly AcceptedSmsReviewChunk[],
  source: ReturnType<typeof makeTwoSmsInput> = makeTwoSmsInput()
): CompleteSmsReviewNormalizationInput {
  return {
    ownerId: source.ownerId,
    sessionId: source.sessionId,
    sourceRevision: source.sourceRevision,
    reviewAccountSnapshots: source.reviewAccountSnapshots,
    hashProvider: syntheticHashProvider,
    acceptedReviewChunks: chunks,
  };
}

function assertReciprocalGroup(session: AccountReviewSession): void {
  const group = session.groups[0];
  if (!group) throw new Error("missing_complete_shared_group");
  expect(group.status).toBe("pending");
  expect(group.linkedRowIds).toHaveLength(2);
  expect(new Set(group.linkedRowIds).size).toBe(2);
  expect(session.rows).toHaveLength(2);
  expect(group.suggestionRefs).toHaveLength(2);
  for (const row of session.rows) {
    expect(group.linkedRowIds).toContain(row.rowId);
    expect(row.assignment).toMatchObject({
      state: "suggested",
      groupId: group.groupId,
      groupRevision: group.revision,
      confirmation: "pending",
    });
    expect(row.selected).toBe(false);
  }
}

describe("#395 L1 — ATM destination choice cannot freeze default source", () => {
  it("L1-RED default A follows new eligible default B after Cash-only choice C", async () => {
    const first = twoBankSnapshots(REVIEW_WIRE_IDS.bankAccountId);
    const initial = await initialAtm(first);
    const initialRow = requireRow(initial);
    expect(initialRow.assignment).toMatchObject({
      state: "existing",
      origin: "default",
      accountId: REVIEW_WIRE_IDS.bankAccountId,
    });

    const destinationChoice = chooseAccount(
      initial,
      first,
      REVIEW_WIRE_IDS.cashAccountId
    );
    expect(destinationChoice.reasonCodes).toEqual([]);
    expect(destinationChoice.affectedRowIds).toEqual([initialRow.rowId]);
    const cashChosen = requireRow(destinationChoice.state);
    expect(cashChosen.assignment).toMatchObject({
      state: "existing",
      origin: "default",
      accountId: REVIEW_WIRE_IDS.bankAccountId,
    });
    expect(cashChosen.toAssignment).toMatchObject({
      state: "existing",
      origin: "user",
      accountId: REVIEW_WIRE_IDS.cashAccountId,
    });

    const updated = refreshed(
      destinationChoice.state,
      twoBankSnapshots(SECOND_BANK_ID)
    );
    expect(requireRow(updated).assignment).toMatchObject({
      state: "existing",
      origin: "default",
      accountId: SECOND_BANK_ID,
    });
    expect(requireRow(updated).toAssignment).toMatchObject({
      state: "existing",
      origin: "user",
      accountId: REVIEW_WIRE_IDS.cashAccountId,
    });
    expect(requireRow(updated).sourceFingerprint).toBe(
      initialRow.sourceFingerprint
    );
    expect(requireRow(updated).amountDecimal).toBe("50");
    expect(requireRow(updated).selected).toBe(false);
  });

  it("L1-CONTROL explicit Bank A source survives the same default switch", async () => {
    const first = twoBankSnapshots(REVIEW_WIRE_IDS.bankAccountId);
    const initial = await initialAtm(first);
    const chosenSource = chooseAccount(
      initial,
      first,
      REVIEW_WIRE_IDS.bankAccountId
    );
    expect(chosenSource.reasonCodes).toEqual([]);
    expect(requireRow(chosenSource.state).assignment).toMatchObject({
      state: "existing",
      origin: "user",
      accountId: REVIEW_WIRE_IDS.bankAccountId,
    });
    const updated = refreshed(
      chosenSource.state,
      twoBankSnapshots(SECOND_BANK_ID)
    );
    expect(requireRow(updated).assignment).toMatchObject({
      state: "existing",
      origin: "user",
      accountId: REVIEW_WIRE_IDS.bankAccountId,
    });
    expect(requireRow(updated).toAssignment?.state).toBe("existing");
  });
});

describe("#395 L2 — original SMS sender proof independent of candidate list", () => {
  it.each([
    {
      label: "empty advisory candidate list",
      candidateAccountIds: [],
    },
    {
      label: "advisory QNB candidate supplied",
      candidateAccountIds: [REVIEW_WIRE_IDS.bankAccountId],
    },
  ])(
    "L2-RED rejects CIB sender/QNB claim with $label",
    async ({ candidateAccountIds }) => {
      const { normalized, resolved } = await normalizedAndResolvedSms(
        smsClaim("CIB", candidateAccountIds)
      );
      const original = requireRow(normalized);
      const resolvedRow = requireRow(resolved);
      expect(original.sourceFingerprint).toBe(
        makeSmsInput().mappedTransactions[0]?.smsFingerprint
      );
      expect(original.transaction.source).toBe("SMS");
      if (original.transaction.source !== "SMS")
        throw new Error("missing_real_sms_original");
      expect(original.transaction.rawSmsBody).toBe("CIB purchase EGP 50");
      expect(original.transaction.senderDisplayName).toBe("CIB");
      expect(original.accountEvidence.state).toBe("uncertain");
      expect(original.reviewReasons).toContain("account_evidence_invalid");
      expect(normalized.groups).toEqual([]);
      expect(resolvedRow.assignment.state).toBe("unresolved");
      expect(resolvedRow.assignment).not.toMatchObject({
        state: "existing",
        accountId: REVIEW_WIRE_IDS.bankAccountId,
      });
      expect(resolvedRow.selected).toBe(false);
    }
  );

  it("L2-CONTROL honest QNB sender/span still matches a unique owned Bank", async () => {
    const { normalized, resolved } = await normalizedAndResolvedSms(
      smsClaim("QNB", [])
    );
    expect(requireRow(normalized).accountEvidence.state).toBe("explicit");
    expect(requireRow(normalized).reviewReasons).not.toContain(
      "account_evidence_invalid"
    );
    expect(requireRow(resolved).assignment).toMatchObject({
      state: "existing",
      accountId: REVIEW_WIRE_IDS.bankAccountId,
      origin: "exact",
    });
    expect(requireRow(resolved).toAssignment).toBeNull();
  });

  it("L2-CONTROL genuinely unmatched named sender remains a pending draft", async () => {
    const input = smsClaim("CIB", []);
    const row = input.providerResponse.transactions[0];
    const suggestion = makeSmsInput().providerResponse.suggestedAccounts[0];
    if (!row || !suggestion) throw new Error("missing_cib_draft_fixture");
    const advisory = {
      ...row,
      suggestionRef: suggestion.suggestionRef,
      accountEvidence: {
        ...row.accountEvidence,
        name: "CIB",
        providerDisplayName: "CIB",
      },
    };
    const source = {
      ...input,
      financialRows: [advisory],
      providerResponse: {
        ...input.providerResponse,
        transactions: [advisory],
        suggestedAccounts: [
          {
            ...suggestion,
            name: "CIB",
            providerDisplayName: "CIB",
            senderNames: ["CIB"],
          },
        ],
      },
    };
    const { normalized, resolved } = await normalizedAndResolvedSms(source);
    expect(requireRow(normalized).accountEvidence.state).toBe("explicit");
    expect(normalized.groups).toHaveLength(1);
    expect(normalized.groups[0]?.status).toBe("pending");
    expect(normalized.groups[0]?.linkedRowIds).toEqual([
      requireRow(normalized).rowId,
    ]);
    expect(requireRow(resolved).assignment.state).toBe("suggested");
    expect(requireRow(resolved).assignment).not.toMatchObject({
      state: "existing",
      accountId: REVIEW_WIRE_IDS.bankAccountId,
    });
  });

  it("L2-CONTROL unrelated name span cannot ground a conflicting provider", async () => {
    const input = smsClaim("CIB", []);
    const row = input.providerResponse.transactions[0];
    if (!row) throw new Error("missing_provider_conflict_fixture");
    const advisory = {
      ...row,
      accountEvidence: {
        ...row.accountEvidence,
        name: "CIB",
        providerDisplayName: "QNB",
      },
    };
    const { normalized, resolved } = await normalizedAndResolvedSms({
      ...input,
      financialRows: [advisory],
      providerResponse: {
        ...input.providerResponse,
        transactions: [advisory],
      },
    });
    expect(requireRow(normalized).accountEvidence.state).toBe("uncertain");
    expect(requireRow(normalized).reviewReasons).toContain(
      "account_evidence_invalid"
    );
    expect(normalized.groups).toEqual([]);
    expect(requireRow(resolved).assignment.state).toBe("unresolved");
    expect(requireRow(resolved).selected).toBe(false);
  });

  it("L2-CONTROL grounded ordinary Voice QNB does not require SMS sender", async () => {
    const input = makeVoiceInput();
    const first = input.providerResponse.transactions[0];
    if (!first) throw new Error("missing_voice_advisory");
    const advisory = { ...first, suggestionRef: null };
    const normalized = await normalizeAccountReviewParserResult({
      ...input,
      reviewAccountSnapshots: qnbSnapshots(),
      financialRows: [advisory],
      providerResponse: {
        ...input.providerResponse,
        transactions: [advisory],
        suggestedAccounts: [],
      },
    });
    expect(requireRow(normalized).accountEvidence.state).toBe("explicit");
    expect(
      requireRow(refreshed(normalized, qnbSnapshots())).assignment
    ).toMatchObject({
      state: "existing",
      accountId: REVIEW_WIRE_IDS.bankAccountId,
      origin: "exact",
    });
  });
});

describe("#395 L3 — accepted independent SMS chunks with cosmetic group identity", () => {
  it("L3-CONTROL exactly matching QNB chunks coalesce with two source members", async () => {
    const source = makeTwoSmsInput();
    const combined = await normalizeCompleteSmsReviewSession(
      completeInput(splitAcceptedChunks(source, false), source)
    );
    expect(combined.groups).toHaveLength(1);
    assertReciprocalGroup(combined);
  });

  it("L3-RED QNB/qnb display variants coalesce deterministically, preserving both sources", async () => {
    const source = makeTwoSmsInput();
    const chunks = splitAcceptedChunks(source, true);
    expect(chunks).toHaveLength(2);
    const forward = await normalizeCompleteSmsReviewSession(
      completeInput(chunks, source)
    );
    const reverse = await normalizeCompleteSmsReviewSession(
      completeInput([...chunks].reverse(), source)
    );
    expect(forward.groups).toHaveLength(1);
    assertReciprocalGroup(forward);
    assertReciprocalGroup(reverse);
    expect(forward.groups).toEqual(reverse.groups);
    expect(forward.rows.map((row) => row.sourceFingerprint).sort()).toEqual(
      source.mappedTransactions.map((row) => row.smsFingerprint).sort()
    );
  });

  it("L3-CONTROL materially different EGP/USD identities do not merge", async () => {
    const source = makeTwoCurrenciesInput();
    const chunks = splitAcceptedChunks(source, false);
    const combined = await normalizeCompleteSmsReviewSession(
      completeInput(chunks, source)
    );
    expect(combined.rows).toHaveLength(2);
    expect(combined.groups).toHaveLength(2);
    expect(new Set(combined.groups.map((group) => group.groupId)).size).toBe(2);
    expect(combined.groups.map((group) => group.currency).sort()).toEqual([
      "EGP",
      "USD",
    ]);
  });
});
