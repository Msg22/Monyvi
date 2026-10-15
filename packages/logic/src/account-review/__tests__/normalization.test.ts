/**
 * #395 T014-P — tests-first pure normalization contract.
 * Future source: packages/logic/src/account-review/normalization.ts.
 * The missing implementation is the intentional root-observed creation Red.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  accountReviewSessionSchema,
  type AccountReviewRow,
  type AccountReviewSession,
} from "../schemas";
import { normalizeAccountReviewParserResult } from "../normalization";
import {
  NORMALIZATION_IDS,
  makeCashVoiceInput,
  makeTwoIdenticalVoiceInput,
  makeTwoIdenticalVoiceWithExtraInput,
  makeOwnedContext,
  makeParsedSms,
  makeSmsInput,
  makeTwoCurrenciesInput,
  makeTwoSmsInput,
  makeUsdAmountInput,
  makeVoiceInput,
  syntheticHashProvider,
} from "./normalization-fixtures";
import {
  REVIEW_SMS_BODY,
  REVIEW_WIRE_IDS,
} from "./fixtures";

async function canonical(
  input: Parameters<typeof normalizeAccountReviewParserResult>[0]
): Promise<AccountReviewSession> {
  const value = await normalizeAccountReviewParserResult(input);
  return accountReviewSessionSchema.parse(value);
}

function requireRow(session: AccountReviewSession, index = 0): AccountReviewRow {
  const row = session.rows[index];
  if (!row) throw new Error("Missing normalized financial row");
  return row;
}

function expectBlocked(row: AccountReviewRow): void {
  expect(row.assignment.state).toBe("unresolved");
  expect(row.selected).toBe(false);
  expect(row.hasUserAccountOverride).toBe(false);
  expect(row.hasUserCurrencyOverride).toBe(false);
}

function expectNewSession(session: AccountReviewSession): void {
  expect(session.ownerId).toBe(NORMALIZATION_IDS.owner);
  expect(session.sessionId).toBe(NORMALIZATION_IDS.session);
  expect(session.sourceRevision).toBe("0");
  expect(session.revision).toBe("0");
  expect(session.operationGeneration).toBe("0");
  expect(session.removedEvidenceKeys).toEqual([]);
  expect(session.filter).toBe("all");
  expect(session.saveIntent).toBeNull();
}

describe("#395 T014-P — canonical pure first-session normalization", () => {
  it("is confined to packages/logic without mobile, DB runtime or platform imports", () => {
    const source = readFileSync(join(__dirname, "../normalization.ts"), "utf8");
    expect(source).not.toMatch(/from ["'][^"']*(?:apps\/mobile|@\/|@monyvi\/db)["']/);
    expect(source).not.toMatch(/(?:from|require\() ["'](?:expo-|react|@nozbe\/)/);
    expect(source).not.toMatch(/from ["'][^"']*(?:ai-voice-parser|ai-sms-parser|sms-parser-orchestrator)/);
    expect(source).not.toMatch(/database\.|Deno\.env|process\.env|createHash\(/);
  });

  it("materializes a full grounded Voice session and one reciprocal pending BANK group", async () => {
    const session = await canonical(makeVoiceInput());
    expectNewSession(session);
    expect(session.source).toBe("VOICE");
    expect(session.rows).toHaveLength(1);
    expect(session.groups).toHaveLength(1);
    const row = requireRow(session);
    const group = session.groups[0];
    if (!group) throw new Error("Missing shared identity group");
    expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.foodCategory);
    expect(row.transaction.amount).toBe(50);
    expect(row.amountDecimal).toBe("50");
    expect(row.sourceFingerprint).toBeNull();
    expect(row.accountEvidence.evidenceSpans[0]?.text).toBe("QNB");
    expect(row.currency).toEqual({ state: "known", code: "EGP", origin: "explicit" });
    expect(group).toMatchObject({
      name: "QNB", type: "BANK", currency: "EGP", status: "pending",
      revision: "0", confirmedIdentityRevision: null,
    });
    expect(group.linkedRowIds).toEqual([row.rowId]);
    expect(row.assignment).toMatchObject({
      state: "suggested", groupId: group.groupId,
      groupRevision: "0", confirmation: "pending",
    });
    expect(group.evidenceKey).toMatch(/^[a-f0-9]{64}$/);
    expect(row.selected).toBe(false);
  });

  it("keeps explicit grounded Voice CASH without recasting it to legacy SMS BANK", async () => {
    const session = await canonical(makeCashVoiceInput());
    expect(session.source).toBe("VOICE");
    expect(session.rows).toHaveLength(1);
    const row = requireRow(session);
    expect(row.accountEvidence.type).toBe("CASH");
    expect(row.accountEvidence.name).toBe("Cash");
    if (row.source !== "VOICE") throw new Error("Expected a Voice row");
    expect(row.transaction.originalTranscript).toContain("Cash");
    expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.foodCategory);
    expect(row.currency).toEqual({ state: "known", code: "EGP", origin: "explicit" });
    expect(row.toAssignment).toBeNull();
    expect(row.selected).toBe(false);
  });

  it("validates SMS body/sender, canonical category UUID and exact original fingerprint", async () => {
    const session = await canonical(makeSmsInput());
    expectNewSession(session);
    expect(session.source).toBe("SMS");
    expect(session.rows).toHaveLength(1);
    const row = requireRow(session);
    expect(row.sourceRef).toBe(REVIEW_WIRE_IDS.smsRowRef);
    expect(row.sourceFingerprint).toBe(NORMALIZATION_IDS.smsFingerprint);
    expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.shoppingCategory);
    if (row.source !== "SMS") throw new Error("Expected an SMS row");
    expect(row.transaction.smsFingerprint).toBe(NORMALIZATION_IDS.smsFingerprint);
    expect(row.transaction.rawSmsBody).toBe(REVIEW_SMS_BODY);
    expect(row.transaction.amount).toBe(50);
    expect(row.accountEvidence.evidenceSpans[0]?.text).toBe("QNB");
    expect(row.currency).toEqual({ state: "known", code: "EGP", origin: "explicit" });
    expect(session.groups).toHaveLength(1);
    expect(row.assignment.state).toBe("suggested");
    expect(row.selected).toBe(false);
  });

  it("groups two separately grounded same-account SMS members once, pending and reciprocal", async () => {
    const session = await canonical(makeTwoSmsInput());
    expect(session.rows).toHaveLength(2);
    expect(session.groups).toHaveLength(1);
    const group = session.groups[0];
    if (!group) throw new Error("Missing reciprocal group");
    expect(group.status).toBe("pending");
    expect(group.linkedRowIds).toEqual(expect.arrayContaining(
      session.rows.map((row) => row.rowId)
    ));
    expect(new Set(group.linkedRowIds).size).toBe(2);
    expect(group.suggestionRefs).toContain(REVIEW_WIRE_IDS.suggestionRef);
    for (const row of session.rows) {
      expect(row.assignment).toMatchObject({
        state: "suggested", groupId: group.groupId,
        groupRevision: group.revision, confirmation: "pending",
      });
      expect(row.currency.state).toBe("known");
      expect(row.selected).toBe(false);
    }
  });

  it("recognizes only proven v2 omission as preferred, never inferred from display currency", async () => {
    const input = makeSmsInput();
    const original = input.providerResponse.transactions[0];
    const absent = {
      state: "absent" as const, name: null, type: null,
      institutionId: null, providerDisplayName: null, cardLast4: null,
      evidenceSpans: [], candidateAccountIds: [],
    };
    const row = {
      ...original, currency: null, suggestionRef: null,
      accountEvidence: absent,
      currencyEvidence: {
        state: "omitted" as const,
        statedCode: null, candidateCodes: [], evidenceSpans: [],
      },
    };
    const session = await canonical({
      ...input,
      financialRows: [row],
      providerResponse: {
        ...input.providerResponse, transactions: [row], suggestedAccounts: [],
      },
    });
    expect(requireRow(session).currency).toEqual({
      state: "known", code: "EGP", origin: "preferred_omission",
    });
    expect(requireRow(session).assignment.state).toBe("unresolved");
    expect(session.groups).toEqual([]);
  });

  it.each(["ambiguous", "conflicting", "unsupported", "unknown"] as const)(
    "preserves v2 %s currency as unconfirmed and blocks account/group",
    async (state) => {
      const input = makeSmsInput();
      const raw = input.providerResponse.transactions[0];
      const details = {
        state,
        statedCode: state === "unsupported" ? "ZZZ" : null,
        candidateCodes: state === "ambiguous" || state === "conflicting"
          ? ["EGP", "USD"] as const : [],
        evidenceSpans: [],
      };
      const changed = {
        ...raw, currency: null, suggestionRef: null,
        accountEvidence: {
          state: "absent" as const,
          name: null, type: null, institutionId: null,
          providerDisplayName: null, cardLast4: null,
          evidenceSpans: [], candidateAccountIds: [],
        },
        currencyEvidence: details,
      };
      const session = await canonical({
        ...input, financialRows: [changed],
        providerResponse: {
          ...input.providerResponse, transactions: [changed], suggestedAccounts: [],
        },
      });
      const row = requireRow(session);
      expect(row.currency.state).toBe("unconfirmed");
      expectBlocked(row);
      expect(row.reviewReasons).toContain("currency_confirmation_needed");
      expect(session.groups).toEqual([]);
    }
  );

  it("keeps v1 financial content while marking currency legacy_unknown with no group", async () => {
    const input = makeVoiceInput();
    const session = await canonical({ ...input, providerResponse: null });
    const row = requireRow(session);
    expect(row.transaction.amount).toBe(50);
    expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.foodCategory);
    expect(row.currency).toMatchObject({
      state: "unconfirmed", reason: "legacy_unknown",
    });
    expectBlocked(row);
    expect(session.groups).toEqual([]);
  });

  it("keeps v1 SMS finance but never invents omitted currency or a group", async () => {
    const input = makeSmsInput();
    const session = await canonical({ ...input, providerResponse: null });
    expect(session.source).toBe("SMS");
    const row = requireRow(session);
    expect(row.transaction.amount).toBe(50);
    expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.shoppingCategory);
    expect(row.sourceFingerprint).toBe(NORMALIZATION_IDS.smsFingerprint);
    expect(row.currency).toMatchObject({
      state: "unconfirmed", reason: "legacy_unknown",
    });
    expectBlocked(row);
    expect(session.groups).toEqual([]);
  });

  it("does not resolve an owned Cash default for absent Voice account evidence", async () => {
    const input = makeVoiceInput();
    const original = input.providerResponse.transactions[0];
    const anonymous = {
      ...original, suggestionRef: null,
      accountEvidence: {
        state: "absent" as const, name: null, type: null,
        institutionId: null, providerDisplayName: null, cardLast4: null,
        evidenceSpans: [], candidateAccountIds: [],
      },
    };
    const session = await canonical({
      ...input, providerResponse: {
        ...input.providerResponse,
        transactions: [anonymous], suggestedAccounts: [],
      },
    });
    const row = requireRow(session);
    expect(row.currency.state).toBe("known");
    expect(row.assignment.state).toBe("unresolved");
    expect(row.selected).toBe(false);
    expect(session.groups).toEqual([]);
  });

  it("retains a good mapped financial row if v2 advisory has unknown private fields", async () => {
    const input = makeSmsInput();
    const session = await canonical({
      ...input,
      providerResponse: { ...input.providerResponse, privateAccountNumber: "123" },
    });
    const row = requireRow(session);
    expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.shoppingCategory);
    expect(row.transaction.amount).toBe(50);
    expect(row.reviewReasons).toContain("account_evidence_invalid");
    expectBlocked(row);
    expect(session.groups).toEqual([]);
  });

  it("rejects forged Voice UTF-16 spans without losing the valid financial category", async () => {
    const input = makeVoiceInput();
    const first = input.providerResponse.transactions[0];
    const invalid = {
      ...first,
      accountEvidence: {
        ...first.accountEvidence,
        evidenceSpans: [{
          ...first.accountEvidence.evidenceSpans[0], text: "not in transcript",
        }],
      },
    };
    const session = await canonical({
      ...input,
      providerResponse: { ...input.providerResponse, transactions: [invalid] },
    });
    const row = requireRow(session);
    expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.foodCategory);
    expect(row.reviewReasons).toContain("account_evidence_invalid");
    expectBlocked(row);
    expect(session.groups).toEqual([]);
  });

  it("rejects wrong submitted SMS sender span even when model evidence is syntactically valid", async () => {
    const input = makeSmsInput();
    const raw = input.providerResponse.transactions[0];
    const altered = {
      ...raw,
      accountEvidence: {
        ...raw.accountEvidence,
        evidenceSpans: [{
          sourceRef: REVIEW_WIRE_IDS.smsMessageId,
          field: "sender" as const, start: 0, end: 3, text: "QNB",
        }],
      },
    };
    const session = await canonical({
      ...input, providerResponse: { ...input.providerResponse, transactions: [altered] },
      submittedMessages: [{
        ...input.submittedMessages[0], sender: "CIB",
      }],
    });
    const row = requireRow(session);
    expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.shoppingCategory);
    expect(row.reviewReasons).toContain("account_evidence_invalid");
    expectBlocked(row);
    expect(session.groups).toEqual([]);
  });

  it("rejects forged SMS body evidence and does not reinterpret it as absent", async () => {
    const input = makeSmsInput();
    const raw = input.providerResponse.transactions[0];
    const altered = {
      ...raw,
      accountEvidence: {
        ...raw.accountEvidence,
        evidenceSpans: [{
          sourceRef: REVIEW_WIRE_IDS.smsMessageId,
          field: "body" as const, start: 0, end: 3, text: "CIB",
        }],
      },
    };
    const session = await canonical({
      ...input, providerResponse: { ...input.providerResponse, transactions: [altered] },
    });
    const row = requireRow(session);
    expect(row.accountEvidence.state).not.toBe("absent");
    expect(row.reviewReasons).toContain("account_evidence_invalid");
    expectBlocked(row);
    expect(session.groups).toEqual([]);
  });

  it("rejects owner-snapshot mismatches and invalid canonical session UUIDs", async () => {
    const input = makeSmsInput();
    await expect(normalizeAccountReviewParserResult({
      ...input,
      reviewAccountSnapshots: {
        ...makeOwnedContext(), ownerId: NORMALIZATION_IDS.foreignOwner,
      },
    })).rejects.toThrow();
    await expect(normalizeAccountReviewParserResult({
      ...input, sessionId: "not-a-uuid",
    })).rejects.toThrow();
  });

  it("rejects foreign/unsubmitted SMS IDs and category identities before session materialization", async () => {
    const input = makeSmsInput();
    const financial = {
      ...input.financialRows[0], messageId: "foreign-message",
    };
    await expect(normalizeAccountReviewParserResult({
      ...input, financialRows: [financial],
      providerResponse: {
        ...input.providerResponse, transactions: [financial],
      },
    })).rejects.toThrow();
    await expect(normalizeAccountReviewParserResult({
      ...input,
      mappedTransactions: [{
        ...makeParsedSms(), categoryId: "category-not-a-uuid",
      }],
    })).rejects.toThrow();
    await expect(normalizeAccountReviewParserResult({
      ...input,
      mappedTransactions: [{
        ...makeParsedSms(), categoryId: "00000000-0000-4000-8000-000000000209",
      }],
    })).rejects.toThrow();
  });

  it.each([
    { name: "currency", patch: { currency: "USD" } },
    { name: "type", patch: { type: "DIGITAL_WALLET" } },
    { name: "card", patch: { cardLast4: "9999" } },
    { name: "institution", patch: { institutionId: "different-bank" } },
  ])("rejects incompatible $name provider suggestion without losing valid finance", async ({ patch }) => {
    const input = makeSmsInput();
    const changed = {
      ...input.providerResponse,
      suggestedAccounts: [{
        ...input.providerResponse.suggestedAccounts[0], ...patch,
      }],
    };
    const session = await canonical({ ...input, providerResponse: changed });
    const row = requireRow(session);
    expect(row.transaction.amount).toBe(50);
    expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.shoppingCategory);
    expectBlocked(row);
    expect(session.groups).toEqual([]);
  });

  it("does not infer account identity from merchant/counterparty with absent evidence", async () => {
    const input = makeSmsInput();
    const original = input.providerResponse.transactions[0];
    const row = {
      ...original, counterparty: "QNB", suggestionRef: null,
      accountEvidence: {
        state: "absent" as const,
        name: null, type: null, institutionId: null,
        providerDisplayName: null, cardLast4: null,
        evidenceSpans: [], candidateAccountIds: [],
      },
    };
    const session = await canonical({
      ...input,
      financialRows: [row],
      providerResponse: {
        ...input.providerResponse,
        transactions: [row], suggestedAccounts: [],
      },
    });
    expectBlocked(requireRow(session));
    expect(session.groups).toEqual([]);
  });

  it("does not convert the amount when source currency differs from preferred", async () => {
    const session = await canonical(makeUsdAmountInput());
    const result = requireRow(session);
    expect(result.amountDecimal).toBe("50.75");
    expect(result.transaction.amount).toBe(50.75);
    expect(result.transaction.currency).toBe("USD");
    expect(result.currency).toEqual({
      state: "known", code: "USD", origin: "explicit",
    });
    expect(result).not.toHaveProperty("convertedAmount");
  });

  it("does not merge different-currency identities even when their nickname matches", async () => {
    const session = await canonical(makeTwoCurrenciesInput());
    expect(session.rows).toHaveLength(2);
    expect(session.groups.every((group) => group.linkedRowIds.length === 1)).toBe(true);
    expect(requireRow(session, 0).currency.state).toBe("known");
    expect(requireRow(session, 1).currency).toEqual({
      state: "known", code: "USD", origin: "explicit",
    });
    const first = requireRow(session, 0).assignment;
    const second = requireRow(session, 1).assignment;
    if (first.state === "suggested" && second.state === "suggested") {
      expect(first.groupId).not.toBe(second.groupId);
    }
  });

  it("is deterministic through re-chunking, but isolates owner and session identity", async () => {
    const base = makeSmsInput();
    const original = await canonical(base);
    const rechunked = await canonical({ ...makeSmsInput(), requestKey: "synthetic-chunk-retry" });
    expect(requireRow(rechunked).rowId).toBe(requireRow(original).rowId);
    expect(rechunked.groups[0]?.groupId).toBe(original.groups[0]?.groupId);
    expect(rechunked.groups[0]?.evidenceKey).toBe(original.groups[0]?.evidenceKey);

    const alternate = await canonical({
      ...makeSmsInput(), sessionId: NORMALIZATION_IDS.alternateSession,
    });
    expect(requireRow(alternate).rowId).not.toBe(requireRow(original).rowId);
    expect(alternate.groups[0]?.evidenceKey).not.toBe(original.groups[0]?.evidenceKey);
    const foreign = await normalizeAccountReviewParserResult({
      ...makeSmsInput(), ownerId: NORMALIZATION_IDS.foreignOwner,
      reviewAccountSnapshots: {
        ...makeOwnedContext(), ownerId: NORMALIZATION_IDS.foreignOwner,
      },
    });
    expect(requireRow(accountReviewSessionSchema.parse(foreign)).rowId).not.toBe(
      requireRow(original).rowId
    );
  });

  it("retains stable scoped rows/group evidence when accepted SMS members reorder", async () => {
    const input = makeTwoSmsInput();
    const first = await canonical(input);
    const reversed = await canonical({
      ...input,
      financialRows: [...input.financialRows].reverse(),
      mappedTransactions: [...input.mappedTransactions].reverse(),
      submittedMessages: [...input.submittedMessages].reverse(),
      providerResponse: {
        ...input.providerResponse,
        transactions: [...input.providerResponse.transactions].reverse(),
      },
    });
    expect(reversed.rows.map((row) => row.rowId).sort()).toEqual(
      first.rows.map((row) => row.rowId).sort()
    );
    expect(reversed.groups).toHaveLength(1);
    expect(reversed.groups[0]?.evidenceKey).toBe(first.groups[0]?.evidenceKey);
    expect(reversed.groups[0]?.groupId).toBe(first.groups[0]?.groupId);
  });

  it("uses injected approved SHA-256 boundary for group identities and no raw-body hash", async () => {
    const digest = jest.fn(syntheticHashProvider.digestUtf8);
    const session = await canonical({
      ...makeSmsInput(), hashProvider: { digestUtf8: digest },
    });
    const evidenceKey = session.groups[0]?.evidenceKey;
    expect(evidenceKey).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toHaveBeenCalled();
    const messages = digest.mock.calls.map(([value]) => value);
    expect(messages.some((value) => value.includes(NORMALIZATION_IDS.owner))).toBe(true);
    expect(messages.some((value) => value.includes(NORMALIZATION_IDS.session))).toBe(true);
    expect(messages.some((value) => value.includes("EGP"))).toBe(true);
    expect(messages.every((value) => !value.includes(REVIEW_SMS_BODY))).toBe(true);
  });

  it("rejects duplicate response-local alias collisions before authorizing shared groups", async () => {
    const input = makeTwoSmsInput();
    const first = input.providerResponse.transactions[0];
    const second = {
      ...input.providerResponse.transactions[1],
      transactionRef: first.transactionRef,
    };
    const session = await canonical({
      ...input,
      providerResponse: {
        ...input.providerResponse,
        transactions: [first, second],
      },
    });
    expect(session.rows).toHaveLength(2);
    expect(session.groups).toEqual([]);
    for (const row of session.rows) expectBlocked(row);
  });

  it("does not trust suggested membership when evidence card or sender conflicts", async () => {
    const input = makeTwoSmsInput();
    const suggestion = input.providerResponse.suggestedAccounts[0];
    const changed = {
      ...suggestion, cardLast4: "1111", senderNames: ["CIB"],
    };
    const session = await canonical({
      ...input,
      providerResponse: {
        ...input.providerResponse, suggestedAccounts: [changed],
      },
    });
    expect(session.rows).toHaveLength(2);
    expect(session.groups).toEqual([]);
    expect(session.rows.every((row) => row.assignment.state === "unresolved")).toBe(true);
  });


  it("keeps two identical, explicitly spoken Voice expenses as distinct unselected rows", async () => {
    const session = await canonical(makeTwoIdenticalVoiceInput());
    expect(session.source).toBe("VOICE");
    expect(session.rows).toHaveLength(2);
    expect(new Set(session.rows.map((row) => row.rowId)).size).toBe(2);
    expect(session.rows.map((row) => row.amountDecimal)).toEqual(["50", "50"]);
    expect(session.rows.map((row) => row.transaction.categoryId)).toEqual([
      NORMALIZATION_IDS.foodCategory,
      NORMALIZATION_IDS.foodCategory,
    ]);
    expect(session.rows.every((row) => row.sourceFingerprint === null)).toBe(true);
    expect(session.rows.every((row) => !row.selected)).toBe(true);
    expect(session.groups).toHaveLength(1);
    const group = session.groups[0];
    if (!group) throw new Error("Missing shared Voice account group");
    expect(group.status).toBe("pending");
    expect([...group.linkedRowIds].sort()).toEqual(
      session.rows.map((row) => row.rowId).sort()
    );
    for (const row of session.rows) {
      expect(row.assignment).toMatchObject({
        state: "suggested", groupId: group.groupId, confirmation: "pending",
      });
    }
  });

  it("keeps the duplicate Voice row-ID set across reordered retry aliases and partial chunks", async () => {
    const input = makeTwoIdenticalVoiceInput();
    const initial = await canonical(input);
    const alternateRef = "retry-suggested-qnb";
    const retryRows = input.providerResponse.transactions.map((row, index) => ({
      ...row,
      transactionRef: index === 0 ? "retry-b" : "retry-a",
      suggestionRef: alternateRef,
    }));
    const retry = await canonical({
      ...input,
      financialRows: [...retryRows].reverse(),
      mappedTransactions: [...input.mappedTransactions].reverse(),
      providerResponse: {
        ...input.providerResponse,
        transactions: [...retryRows].reverse(),
        suggestedAccounts: input.providerResponse.suggestedAccounts.map((group) => ({
          ...group,
          suggestionRef: alternateRef,
          transactionRefs: retryRows.map((row) => row.transactionRef),
        })),
      },
    });
    expect(retry.rows.map((row) => row.rowId).sort()).toEqual(
      initial.rows.map((row) => row.rowId).sort()
    );
    expect(retry.groups[0]?.evidenceKey).toBe(initial.groups[0]?.evidenceKey);
    expect(retry.groups[0]?.groupId).toBe(initial.groups[0]?.groupId);

    const first = input.providerResponse.transactions[0];
    const firstMapped = input.mappedTransactions[0];
    const group = input.providerResponse.suggestedAccounts[0];
    if (!first || !firstMapped || !group) throw new Error("Missing partial fixture");
    const partial = await canonical({
      ...input,
      financialRows: [first],
      mappedTransactions: [firstMapped],
      providerResponse: {
        ...input.providerResponse,
        transactions: [first],
        suggestedAccounts: [{ ...group, transactionRefs: [first.transactionRef] }],
      },
    });
    expect(initial.rows.map((row) => row.rowId)).toContain(partial.rows[0]?.rowId);
    expect(partial.groups[0]?.groupId).toBe(initial.groups[0]?.groupId);
  });

  it("preserves duplicate occurrence IDs when a distinct later Voice entry joins", async () => {
    const initial = await canonical(makeTwoIdenticalVoiceInput());
    const extended = await canonical(makeTwoIdenticalVoiceWithExtraInput());
    expect(extended.rows).toHaveLength(3);
    expect(extended.rows.filter((row) => row.amountDecimal === "50")).toHaveLength(2);
    expect(extended.rows.filter((row) => row.amountDecimal === "25")).toHaveLength(1);
    expect(extended.rows.filter((row) => row.amountDecimal === "50")
      .map((row) => row.rowId).sort()).toEqual(
      initial.rows.map((row) => row.rowId).sort()
    );
    expect(extended.groups).toHaveLength(1);
    expect(extended.groups[0]?.evidenceKey).toBe(initial.groups[0]?.evidenceKey);
    expect(extended.groups[0]?.linkedRowIds).toHaveLength(3);
  });

  it("distinguishes another logical Voice recording without changing account group identity", async () => {
    const input = makeTwoIdenticalVoiceInput();
    const first = await canonical(input);
    const logicalRequestKey = "voice-logical-request-2";
    const transactions = input.providerResponse.transactions.map((row) => ({
      ...row,
      accountEvidence: {
        ...row.accountEvidence,
        evidenceSpans: row.accountEvidence.evidenceSpans.map((span) => ({
          ...span, sourceRef: logicalRequestKey,
        })),
      },
      currencyEvidence: {
        ...row.currencyEvidence,
        evidenceSpans: row.currencyEvidence.evidenceSpans.map((span) => ({
          ...span, sourceRef: logicalRequestKey,
        })),
      },
    }));
    const second = await canonical({
      ...input,
      requestKey: logicalRequestKey,
      financialRows: transactions,
      providerResponse: { ...input.providerResponse, transactions },
    });
    expect(second.rows).toHaveLength(2);
    expect(second.rows.every((row) =>
      !first.rows.some((original) => original.rowId === row.rowId)
    )).toBe(true);
    expect(second.groups[0]?.evidenceKey).toBe(first.groups[0]?.evidenceKey);
  });

  it("uses the frozen ordered v1 group preimage and deterministic UUIDv8 projection", async () => {
    const group = (await canonical(makeVoiceInput())).groups[0];
    if (!group) throw new Error("Missing canonical group");
    const preimage = JSON.stringify([
      "monyvi.account-review.group-identity", "v1",
      NORMALIZATION_IDS.owner, NORMALIZATION_IDS.session, "VOICE",
      "qnb", "BANK", "EGP", null, "qnb", null, ["qnb"],
    ]);
    const digest = await syntheticHashProvider.digestUtf8(preimage);
    expect(group.evidenceKey).toBe(digest);
    const bytes = digest.slice(0, 32).split("");
    bytes[12] = "8";
    bytes[16] = (((parseInt(bytes[16] ?? "0", 16) & 3) | 8)).toString(16);
    const hex = bytes.join("");
    expect(group.groupId).toBe(
      [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
        hex.slice(16, 20), hex.slice(20)].join("-")
    );
  });


  it("canonicalizes grounded group-name and sender-alias case/whitespace", async () => {
    const input = makeVoiceInput();
    const base = await canonical(input);
    const suggestion = input.providerResponse.suggestedAccounts[0];
    if (!suggestion) throw new Error("Missing synthetic suggested account");
    const variant = await canonical({
      ...input,
      providerResponse: {
        ...input.providerResponse,
        suggestedAccounts: [{
          ...suggestion,
          name: "  QnB  ",
          providerDisplayName: suggestion.providerDisplayName,
          senderNames: ["  QNB  "],
        }],
      },
    });
    expect(variant.groups).toHaveLength(1);
    expect(variant.groups[0]?.evidenceKey).toBe(base.groups[0]?.evidenceKey);
    expect(variant.groups[0]?.groupId).toBe(base.groups[0]?.groupId);
  });
});
