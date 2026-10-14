import {
  accountReviewRequestContextSchema,
  accountReviewEvidenceSpanSchema,
  accountReviewAccountEvidenceSchema,
  accountReviewCurrencyEvidenceSchema,
  accountReviewSuggestedAccountSchema,
  accountReviewVoiceResponseV2Schema,
  accountReviewSmsResponseV2Schema,
  accountReviewCurrencySchema,
  accountReviewAssignmentSchema,
  accountReviewGroupSchema,
} from "../schemas";
import {
  makeAccountEvidence,
  makeCurrencyEvidence,
  makeEvidenceSpan,
  makeRequestAccountContext,
  makeReviewRequestContext,
  makeSmsV1Response,
  makeSmsV2Response,
  makeSuggestedAccount,
  makeVoiceV1Response,
  makeVoiceV2Response,
  REVIEW_SMS_BODY,
  REVIEW_VOICE_TRANSCRIPT,
  REVIEW_WIRE_IDS,
} from "./fixtures";

describe("#395 T005 — canonical account-review parser contract", () => {
  describe("request context: generated domain values and privacy", () => {
    it("accepts owned opaque account context, distinct CASH and BANK, and the card suffix with leading zeroes", () => {
      const parsed = accountReviewRequestContextSchema.safeParse(
        makeReviewRequestContext()
      );
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.accounts).toHaveLength(2);
      expect(parsed.data.accounts[0].cardLast4).toBe("0007");
      expect(parsed.data.accounts[1].type).toBe("CASH");
      expect(parsed.data.reviewContractVersion).toBe("account-review/v2");
    });

    it.each([
      ["account balance", { ...makeRequestAccountContext(), balance: 900 }],
      ["full account number", { ...makeRequestAccountContext(), accountNumber: "123456789" }],
      ["raw SMS text", { ...makeRequestAccountContext(), smsBody: "sensitive" }],
      ["full card number", { ...makeRequestAccountContext(), cardNumber: "4111111111111111" }],
    ])("rejects a %s in provider account context", (_label, unsafeAccount) => {
      expect(
        accountReviewRequestContextSchema.safeParse({
          ...makeReviewRequestContext(),
          accounts: [unsafeAccount],
        }).success
      ).toBe(false);
    });

    it.each(["7", "007", "00007", "A007", "000٧"])(
      "rejects malformed card suffix %s without silently normalizing it",
      (cardLast4) => {
        expect(
          accountReviewRequestContextSchema.safeParse({
            ...makeReviewRequestContext(),
            accounts: [{ ...makeRequestAccountContext(), cardLast4 }],
          }).success
        ).toBe(false);
      }
    );

    it("refuses duplicate account IDs, a foreign-shaped ID, invalid currency and unknown request keys", () => {
      const good = makeReviewRequestContext();
      expect(
        accountReviewRequestContextSchema.safeParse({
          ...good,
          accounts: [good.accounts[0], good.accounts[0]],
        }).success
      ).toBe(false);
      expect(
        accountReviewRequestContextSchema.safeParse({
          ...good,
          accounts: [{ ...makeRequestAccountContext(), id: "not-a-uuid" }],
        }).success
      ).toBe(false);
      expect(
        accountReviewRequestContextSchema.safeParse({
          ...good,
          preferredCurrency: "XYZ",
        }).success
      ).toBe(false);
      expect(
        accountReviewRequestContextSchema.safeParse({
          ...good,
          debuggingRawTranscript: REVIEW_VOICE_TRANSCRIPT,
        }).success
      ).toBe(false);
    });

    it("requires nullable identity fields rather than missing, blank or arbitrary provider names", () => {
      const { institutionId: _institutionId, ...missing } =
        makeRequestAccountContext();
      expect(
        accountReviewRequestContextSchema.safeParse({
          ...makeReviewRequestContext(),
          accounts: [missing],
        }).success
      ).toBe(false);
      expect(
        accountReviewRequestContextSchema.safeParse({
          ...makeReviewRequestContext(),
          accounts: [{ ...makeRequestAccountContext(), name: " " }],
        }).success
      ).toBe(false);
      expect(
        accountReviewRequestContextSchema.safeParse({
          ...makeReviewRequestContext(),
          accounts: [{ ...makeRequestAccountContext(), senderNames: ["QNB", "QNB"] }],
        }).success
      ).toBe(false);
    });
  });

  describe("evidence grammar and UTF-16 source fidelity", () => {
    it("accepts a span after a surrogate-pair emoji at its exact JavaScript UTF-16 indices", () => {
      const span = makeEvidenceSpan(
        REVIEW_WIRE_IDS.voiceRequestKey,
        "transcript",
        REVIEW_VOICE_TRANSCRIPT,
        "QNB"
      );
      expect(span.start).toBe(REVIEW_VOICE_TRANSCRIPT.indexOf("QNB"));
      expect(span.start).toBeGreaterThan(2);
      expect(
        REVIEW_VOICE_TRANSCRIPT.slice(span.start, span.end)
      ).toBe(span.text);
      expect(accountReviewEvidenceSpanSchema.safeParse(span).success).toBe(true);
      expect(
        accountReviewVoiceResponseV2Schema.safeParse(makeVoiceV2Response()).success
      ).toBe(true);
    });

    it.each([
      { start: -1, end: 3, text: "QNB" },
      { start: 3, end: 3, text: "" },
      { start: 3.5, end: 6, text: "QNB" },
      { start: 3, end: 2, text: "QNB" },
      { start: 3, end: 6, text: "" },
    ])("rejects invalid evidence span geometry %#", (patch) => {
      const good = makeEvidenceSpan(
        REVIEW_WIRE_IDS.voiceRequestKey,
        "transcript",
        REVIEW_VOICE_TRANSCRIPT,
        "QNB"
      );
      expect(
        accountReviewEvidenceSpanSchema.safeParse({ ...good, ...patch }).success
      ).toBe(false);
    });

    it("rejects a forged original-transcript substring and a one-code-unit offset", () => {
      const valid = makeVoiceV2Response();
      const evidence = makeAccountEvidence();
      const span = evidence.evidenceSpans[0];
      for (const badSpan of [
        { ...span, text: "CIB" },
        { ...span, start: span.start - 1, end: span.end - 1 },
      ]) {
        expect(
          accountReviewVoiceResponseV2Schema.safeParse({
            ...valid,
            transactions: [{
              ...valid.transactions[0],
              accountEvidence: { ...evidence, evidenceSpans: [badSpan] },
            }],
          }).success
        ).toBe(false);
      }
    });

    it("does not permit fabricated source fields, missing source refs or private raw payloads", () => {
      const span = makeEvidenceSpan(
        REVIEW_WIRE_IDS.smsMessageId,
        "body",
        REVIEW_SMS_BODY,
        "QNB"
      );
      expect(accountReviewEvidenceSpanSchema.safeParse(span).success).toBe(true);
      expect(accountReviewEvidenceSpanSchema.safeParse({ ...span, sourceRef: "" }).success).toBe(false);
      expect(accountReviewEvidenceSpanSchema.safeParse({ ...span, field: "audio" }).success).toBe(false);
      expect(accountReviewEvidenceSpanSchema.safeParse({ ...span, rawBody: REVIEW_SMS_BODY }).success).toBe(false);
    });
  });

  describe("account identity evidence remains advisory", () => {
    it("accepts explicit evidence with nullable typed identity, including canonical BANK/CASH", () => {
      expect(accountReviewAccountEvidenceSchema.safeParse(makeAccountEvidence()).success).toBe(true);
      expect(accountReviewAccountEvidenceSchema.safeParse({
        ...makeAccountEvidence(),
        type: "CASH",
        cardLast4: null,
      }).success).toBe(true);
    });

    it("requires absent evidence to have no identity, candidate or source span", () => {
      const absent = {
        state: "absent",
        name: null,
        type: null,
        institutionId: null,
        providerDisplayName: null,
        cardLast4: null,
        evidenceSpans: [],
        candidateAccountIds: [],
      };
      expect(accountReviewAccountEvidenceSchema.safeParse(absent).success).toBe(true);
      expect(accountReviewAccountEvidenceSchema.safeParse({ ...absent, name: "QNB" }).success).toBe(false);
      expect(accountReviewAccountEvidenceSchema.safeParse({
        ...absent, candidateAccountIds: [REVIEW_WIRE_IDS.bankAccountId],
      }).success).toBe(false);
      expect(accountReviewAccountEvidenceSchema.safeParse({
        ...absent, evidenceSpans: makeAccountEvidence().evidenceSpans,
      }).success).toBe(false);
    });

    it("does not accept an ungrounded explicit/contextual identity or duplicate candidate IDs", () => {
      const evidence = makeAccountEvidence();
      for (const state of ["explicit", "contextual"]) {
        expect(accountReviewAccountEvidenceSchema.safeParse({
          ...evidence, state, evidenceSpans: [],
        }).success).toBe(false);
      }
      expect(accountReviewAccountEvidenceSchema.safeParse({
        ...evidence,
        candidateAccountIds: [REVIEW_WIRE_IDS.bankAccountId, REVIEW_WIRE_IDS.bankAccountId],
      }).success).toBe(false);
      expect(accountReviewAccountEvidenceSchema.safeParse({
        ...evidence,
        cardLast4: "00O7",
      }).success).toBe(false);
      expect(accountReviewAccountEvidenceSchema.safeParse({
        ...evidence, guessedAccountId: REVIEW_WIRE_IDS.bankAccountId,
      }).success).toBe(false);
    });
  });

  describe("currency evidence: omission is provably different from uncertainty", () => {
    it("accepts only true v2 omission with null code, empty candidates and spans", () => {
      const omitted = {
        state: "omitted",
        statedCode: null,
        candidateCodes: [],
        evidenceSpans: [],
      };
      expect(accountReviewCurrencyEvidenceSchema.safeParse(omitted).success).toBe(true);
      expect(accountReviewCurrencyEvidenceSchema.safeParse({
        ...omitted, statedCode: "EGP",
      }).success).toBe(false);
      expect(accountReviewCurrencyEvidenceSchema.safeParse({
        ...omitted, candidateCodes: ["EGP"],
      }).success).toBe(false);
      expect(accountReviewCurrencyEvidenceSchema.safeParse({
        ...omitted, evidenceSpans: makeCurrencyEvidence().evidenceSpans,
      }).success).toBe(false);
    });

    it("validates explicit supported code, sole matching candidate and grounded evidence", () => {
      const explicit = makeCurrencyEvidence();
      expect(accountReviewCurrencyEvidenceSchema.safeParse(explicit).success).toBe(true);
      expect(accountReviewCurrencyEvidenceSchema.safeParse({
        ...explicit, statedCode: "USD",
      }).success).toBe(false);
      expect(accountReviewCurrencyEvidenceSchema.safeParse({
        ...explicit, candidateCodes: ["EGP", "USD"],
      }).success).toBe(false);
      expect(accountReviewCurrencyEvidenceSchema.safeParse({
        ...explicit, evidenceSpans: [],
      }).success).toBe(false);
    });

    it("preserves ambiguous/conflicting/unsupported/unknown states instead of converting them to omitted", () => {
      for (const evidence of [
        { state: "ambiguous", statedCode: null, candidateCodes: ["EGP", "USD"], evidenceSpans: [] },
        { state: "conflicting", statedCode: null, candidateCodes: ["EGP", "USD"], evidenceSpans: [] },
        { state: "unsupported", statedCode: "XYZ", candidateCodes: [], evidenceSpans: [] },
        { state: "unknown", statedCode: null, candidateCodes: [], evidenceSpans: [] },
      ]) {
        const result = accountReviewCurrencyEvidenceSchema.safeParse(evidence);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.state).toBe(evidence.state);
      }
    });

    it("rejects duplicate candidate currencies, unknown supported candidates and invented keys", () => {
      const unknown = {
        state: "unknown",
        statedCode: null,
        candidateCodes: [],
        evidenceSpans: [],
      };
      expect(accountReviewCurrencyEvidenceSchema.safeParse({
        ...unknown, candidateCodes: ["EGP", "EGP"],
      }).success).toBe(false);
      expect(accountReviewCurrencyEvidenceSchema.safeParse({
        ...unknown, candidateCodes: ["XYZ"],
      }).success).toBe(false);
      expect(accountReviewCurrencyEvidenceSchema.safeParse({
        ...unknown, assumedPreferred: "EGP",
      }).success).toBe(false);
    });
  });

  describe("review state discriminators and durable group identity", () => {
    it("accepts a known currency only with its provenance, and unconfirmed only with a stable uncertainty reason", () => {
      expect(accountReviewCurrencySchema.safeParse({
        state: "known", code: "EGP", origin: "preferred_omission",
      }).success).toBe(true);
      expect(accountReviewCurrencySchema.safeParse({
        state: "unconfirmed", reason: "legacy_unknown",
        candidateCodes: [], statedCode: null, evidenceSpans: [],
      }).success).toBe(true);
      expect(accountReviewCurrencySchema.safeParse({
        state: "unconfirmed", reason: "ambiguous",
        candidateCodes: ["EGP", "USD"], statedCode: null, evidenceSpans: [],
      }).success).toBe(true);
      expect(accountReviewCurrencySchema.safeParse({
        state: "known", code: "XYZ", origin: "explicit",
      }).success).toBe(false);
      expect(accountReviewCurrencySchema.safeParse({
        state: "known", code: "EGP", origin: "guessed",
      }).success).toBe(false);
    });

    it("never uses an empty ID to mean unresolved and does not allow an invented default source", () => {
      const unresolved = {
        state: "unresolved",
        accountId: null,
        reasonCode: "account_identity_uncertain",
        candidateAccountIds: [],
      };
      const existing = {
        state: "existing",
        accountId: REVIEW_WIRE_IDS.bankAccountId,
        origin: "user",
        currency: "EGP",
        identityRevision: "0",
      };
      const suggested = {
        state: "suggested",
        accountId: null,
        groupId: "00000000-0000-4000-8000-000000000104",
        groupRevision: "1",
        confirmation: "pending",
      };
      expect(accountReviewAssignmentSchema.safeParse(unresolved).success).toBe(true);
      expect(accountReviewAssignmentSchema.safeParse(existing).success).toBe(true);
      expect(accountReviewAssignmentSchema.safeParse(suggested).success).toBe(true);
      expect(accountReviewAssignmentSchema.safeParse({
        ...unresolved, accountId: "",
      }).success).toBe(false);
      expect(accountReviewAssignmentSchema.safeParse({
        ...existing, origin: "model_inferred",
      }).success).toBe(false);
      expect(accountReviewAssignmentSchema.safeParse({
        ...suggested, groupRevision: "01",
      }).success).toBe(false);
    });

    it("keeps linked group identities unique, with exact hash/revision and no unconstrained metadata", () => {
      const group = {
        groupId: "00000000-0000-4000-8000-000000000104",
        evidenceKey: "e".repeat(64),
        suggestionRefs: [REVIEW_WIRE_IDS.suggestionRef],
        name: "QNB",
        type: "BANK",
        currency: "EGP",
        institutionId: null,
        providerDisplayName: "QNB",
        cardLast4: null,
        senderNames: ["QNB"],
        linkedRowIds: ["00000000-0000-4000-8000-000000000105"],
        status: "pending",
        revision: "0",
        confirmedIdentityRevision: null,
      };
      expect(accountReviewGroupSchema.safeParse(group).success).toBe(true);
      expect(accountReviewGroupSchema.safeParse({
        ...group, linkedRowIds: [group.linkedRowIds[0], group.linkedRowIds[0]],
      }).success).toBe(false);
      expect(accountReviewGroupSchema.safeParse({
        ...group, evidenceKey: "bad",
      }).success).toBe(false);
      expect(accountReviewGroupSchema.safeParse({
        ...group, confidenceFromModel: 1,
      }).success).toBe(false);
    });

    it("requires reciprocal source membership inputs to be nonempty and duplicate-free", () => {
      const suggestion = makeSuggestedAccount();
      expect(accountReviewSuggestedAccountSchema.safeParse(suggestion).success).toBe(true);
      expect(accountReviewSuggestedAccountSchema.safeParse({
        ...suggestion, suggestionRef: "",
      }).success).toBe(false);
      expect(accountReviewSuggestedAccountSchema.safeParse({
        ...suggestion, transactionRefs: [REVIEW_WIRE_IDS.voiceRowRef, REVIEW_WIRE_IDS.voiceRowRef],
      }).success).toBe(false);
      expect(accountReviewSuggestedAccountSchema.safeParse({
        ...suggestion, cardLast4: "7",
      }).success).toBe(false);
    });
  });

  describe("v2 response references, source boundaries and compatibility", () => {
    it("accepts a reciprocal single-row/suggestion Voice and SMS review response", () => {
      const voice = accountReviewVoiceResponseV2Schema.safeParse(makeVoiceV2Response());
      const sms = accountReviewSmsResponseV2Schema.safeParse(makeSmsV2Response());
      expect(voice.success).toBe(true);
      expect(sms.success).toBe(true);
      if (voice.success) {
        expect(voice.data.transactions[0].transactionRef).toBe(REVIEW_WIRE_IDS.voiceRowRef);
        expect(voice.data.suggestedAccounts[0].transactionRefs).toEqual([REVIEW_WIRE_IDS.voiceRowRef]);
      }
      if (sms.success) {
        expect(sms.data.transactions[0].messageId).toBe(REVIEW_WIRE_IDS.smsMessageId);
        expect(sms.data.completionStatus).toBe("complete");
      }
    });

    it("does not misinterpret a v1/old-server response as v2 evidence", () => {
      expect(accountReviewVoiceResponseV2Schema.safeParse(makeVoiceV1Response()).success).toBe(false);
      expect(accountReviewSmsResponseV2Schema.safeParse(makeSmsV1Response()).success).toBe(false);
    });

    it("rejects duplicate transaction and suggestion refs", () => {
      const voice = makeVoiceV2Response();
      expect(accountReviewVoiceResponseV2Schema.safeParse({
        ...voice, transactions: [voice.transactions[0], voice.transactions[0]],
      }).success).toBe(false);
      expect(accountReviewVoiceResponseV2Schema.safeParse({
        ...voice, suggestedAccounts: [voice.suggestedAccounts[0], voice.suggestedAccounts[0]],
      }).success).toBe(false);
    });

    it("rejects a dangling row suggestion, missing reciprocal membership and a double-link", () => {
      const voice = makeVoiceV2Response();
      expect(accountReviewVoiceResponseV2Schema.safeParse({
        ...voice,
        transactions: [{ ...voice.transactions[0], suggestionRef: "nonexistent-suggestion" }],
      }).success).toBe(false);
      expect(accountReviewVoiceResponseV2Schema.safeParse({
        ...voice,
        suggestedAccounts: [{ ...makeSuggestedAccount(), transactionRefs: [] }],
      }).success).toBe(false);
      expect(accountReviewVoiceResponseV2Schema.safeParse({
        ...voice,
        suggestedAccounts: [
          makeSuggestedAccount(),
          { ...makeSuggestedAccount(), suggestionRef: "second-suggestion" },
        ],
      }).success).toBe(false);
    });

    it("rejects a conflicting linked currency/provider/card without dropping the financial row", () => {
      const sms = makeSmsV2Response();
      expect(accountReviewSmsResponseV2Schema.safeParse({
        ...sms,
        suggestedAccounts: [{ ...sms.suggestedAccounts[0], currency: "USD" }],
      }).success).toBe(false);
      expect(accountReviewSmsResponseV2Schema.safeParse({
        ...sms,
        suggestedAccounts: [{ ...sms.suggestedAccounts[0], cardLast4: "1111" }],
      }).success).toBe(false);
      // The adapter retains the individually valid financial row as unresolved;
      // the strict schema itself must not claim the malformed advisory link valid.
      expect(sms.transactions[0].amount).toBe(50);
      expect(sms.transactions[0].categorySystemName).toBe("shopping");
    });

    it("keeps ordinary SMS endpoint evidence null and allows explicit Voice CASH", () => {
      const sms = makeSmsV2Response();
      expect(accountReviewSmsResponseV2Schema.safeParse({
        ...sms,
        transactions: [{ ...sms.transactions[0], toAccountEvidence: makeAccountEvidence("SMS") }],
      }).success).toBe(false);
      expect(accountReviewSmsResponseV2Schema.safeParse({
        ...sms,
        suggestedAccounts: [{
          ...sms.suggestedAccounts[0], type: "CASH", senderNames: [],
        }],
      }).success).toBe(false);
      const voice = makeVoiceV2Response();
      const cash = {
        ...voice,
        transactions: [{
          ...voice.transactions[0],
          accountEvidence: { ...voice.transactions[0].accountEvidence, type: "CASH" },
        }],
        suggestedAccounts: [{
          ...voice.suggestedAccounts[0], type: "CASH", senderNames: [],
        }],
      };
      expect(accountReviewVoiceResponseV2Schema.safeParse(cash).success).toBe(true);
    });

    it("requires a valid financial row, rejects missing/null category, non-finite amount and new raw transcript leakage", () => {
      const voice = makeVoiceV2Response();
      for (const broken of [
        { ...voice.transactions[0], amount: Number.POSITIVE_INFINITY },
        { ...voice.transactions[0], amount: 0 },
        { ...voice.transactions[0], categorySystemName: null },
        { ...voice.transactions[0], date: "2026-02-30" },
      ]) {
        expect(accountReviewVoiceResponseV2Schema.safeParse({
          ...voice, transactions: [broken],
        }).success).toBe(false);
      }
      expect(accountReviewSmsResponseV2Schema.safeParse({
        ...makeSmsV2Response(), rawMessages: [REVIEW_SMS_BODY],
      }).success).toBe(false);
    });

    it("retains valid financial v2 omissions with genuinely unknown account/currency", () => {
      const voice = makeVoiceV2Response();
      const absent = {
        state: "absent",
        name: null,
        type: null,
        institutionId: null,
        providerDisplayName: null,
        cardLast4: null,
        evidenceSpans: [],
        candidateAccountIds: [],
      };
      const noMention = {
        ...voice,
        transactions: [{
          ...voice.transactions[0],
          suggestionRef: null,
          accountEvidence: absent,
          currency: null,
          currencyEvidence: {
            state: "omitted", statedCode: null, candidateCodes: [], evidenceSpans: [],
          },
        }],
        suggestedAccounts: [],
      };
      const omission = accountReviewVoiceResponseV2Schema.safeParse(noMention);
      expect(omission.success).toBe(true);
      const unknown = accountReviewVoiceResponseV2Schema.safeParse({
        ...noMention,
        transactions: [{
          ...noMention.transactions[0],
          currencyEvidence: {
            state: "unknown", statedCode: null, candidateCodes: [], evidenceSpans: [],
          },
        }],
      });
      expect(unknown.success).toBe(true);
      if (unknown.success) expect(unknown.data.transactions[0].currencyEvidence.state).toBe("unknown");
    });

    it("rejects unknown versions instead of silently interpreting provenance as omission", () => {
      for (const contract of ["account-review/v3", "", null]) {
        expect(accountReviewVoiceResponseV2Schema.safeParse({
          ...makeVoiceV2Response(), reviewContractVersion: contract,
        }).success).toBe(false);
        expect(accountReviewSmsResponseV2Schema.safeParse({
          ...makeSmsV2Response(), reviewContractVersion: contract,
        }).success).toBe(false);
      }
    });
  });
});
