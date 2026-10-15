import {
  accountReviewCurrencySchema,
  accountReviewAssignmentSchema,
  accountReviewGroupSchema,
  accountReviewSuggestedAccountSchema,
  accountReviewRowSchema,
  accountReviewSessionSchema,
  accountReviewCommandSchema,
  accountReviewSaveIntentSchema,
  type AccountReviewReason,
  type AccountReviewRow,
  type AccountReviewSession,
  type AccountReviewGroup,
} from "../schemas";
import type { ParsedSmsTransaction, ParsedVoiceTransaction } from "../../types";
import {
  makeAccountEvidence,
  makeSuggestedAccount,
  REVIEW_WIRE_IDS,
  REVIEW_VOICE_TRANSCRIPT,
  REVIEW_SMS_BODY,
} from "./fixtures";

describe("#395 T005 — review state integrity and H1/H3/H4 regressions", () => {
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

  describe("closed review row, session, command and immutable save-intent shapes", () => {
    const rowId = "00000000-0000-4000-8000-000000000105";
    const sessionId = "00000000-0000-4000-8000-000000000106";
    const groupId = "00000000-0000-4000-8000-000000000107";

    function validVoiceRow(): Extract<AccountReviewRow, { source: "VOICE" }> {
      return {
        rowId,
        source: "VOICE",
        sourceRef: REVIEW_WIRE_IDS.voiceRowRef,
        sourceFingerprint: null,
        transaction: {
          amount: 50,
          currency: "EGP",
          type: "EXPENSE",
          date: new Date("2026-10-14T12:00:00.000Z"),
          categoryId: "00000000-0000-4000-8000-000000000108",
          categoryDisplayName: "Food",
          confidence: 0.95,
          originLabel: "Voice",
          source: "VOICE",
          note: "Lunch",
          originalTranscript: REVIEW_VOICE_TRANSCRIPT,
          detectedLanguage: "en",
          aiDetectedCurrency: "EGP",
        },
        amountDecimal: "50",
        accountEvidence: makeAccountEvidence(),
        currency: { state: "known", code: "EGP", origin: "explicit" },
        assignment: {
          state: "unresolved",
          accountId: null,
          reasonCode: "account_needed",
          candidateAccountIds: [],
        },
        toAccountEvidence: null,
        toAssignment: null,
        reviewReasons: ["account_needed"],
        selected: false,
        revision: "0",
        hasUserAccountOverride: false,
        hasUserCurrencyOverride: false,
      };
    }

    function validSession(): AccountReviewSession {
      return {
        ownerId: REVIEW_WIRE_IDS.ownerId,
        source: "VOICE",
        sessionId,
        sourceRevision: "0",
        preferredCurrency: "EGP",
        rows: [validVoiceRow()],
        groups: [],
        removedEvidenceKeys: [],
        filter: "all",
        revision: "0",
        operationGeneration: "0",
        saveIntent: null,
      };
    }

    function activeVoiceSession(): AccountReviewSession {
      const row: Extract<AccountReviewRow, { source: "VOICE" }> = {
        ...validVoiceRow(),
        assignment: {
          state: "suggested", accountId: null,
          groupId, groupRevision: "0", confirmation: "pending",
        },
      };
      const group: AccountReviewGroup = {
        groupId,
        evidenceKey: "e".repeat(64),
        suggestionRefs: [REVIEW_WIRE_IDS.suggestionRef],
        name: "QNB",
        type: "BANK",
        currency: "EGP",
        institutionId: null,
        providerDisplayName: "QNB",
        cardLast4: null,
        senderNames: ["QNB"],
        linkedRowIds: [rowId],
        status: "pending",
        revision: "0",
        confirmedIdentityRevision: null,
      };
      return { ...validSession(), rows: [row], groups: [group] };
    }

    function validSmsRow(): Extract<AccountReviewRow, { source: "SMS" }> {
      const smsFingerprint = "synthetic-sms-fingerprint";
      return {
        rowId,
        source: "SMS",
        sourceRef: REVIEW_WIRE_IDS.smsRowRef,
        sourceFingerprint: smsFingerprint,
        transaction: {
          amount: 50,
          currency: "EGP",
          type: "EXPENSE",
          date: new Date("2026-10-14T12:00:00.000Z"),
          categoryId: "00000000-0000-4000-8000-000000000108",
          categoryDisplayName: "Shopping",
          confidence: 0.92,
          originLabel: "QNB",
          source: "SMS",
          smsFingerprint,
          senderDisplayName: "QNB",
          rawSmsBody: REVIEW_SMS_BODY,
          isAtmWithdrawal: false,
        },
        amountDecimal: "50",
        accountEvidence: makeAccountEvidence("SMS"),
        currency: { state: "known", code: "EGP", origin: "explicit" },
        assignment: {
          state: "existing", accountId: REVIEW_WIRE_IDS.bankAccountId,
          origin: "exact", currency: "EGP", identityRevision: "0",
        },
        toAccountEvidence: null,
        toAssignment: null,
        reviewReasons: [],
        selected: false,
        revision: "0",
        hasUserAccountOverride: false,
        hasUserCurrencyOverride: false,
      };
    }

    type RequiredKeys<T> = {
      [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? never : K;
    }[keyof T];
    type OptionalKeys<T> = Exclude<keyof T, RequiredKeys<T>>;
    type DriftKeys<Snapshot, Existing> = {
      [K in keyof Existing]-?:
        K extends keyof Snapshot
          ? K extends RequiredKeys<Existing>
            ? K extends RequiredKeys<Snapshot>
              ? Snapshot[K] extends Existing[K] ? never : K
              : K
            : K extends OptionalKeys<Snapshot>
              ? Snapshot[K] extends Existing[K] ? never : K
              : K
          : K;
    }[keyof Existing];
    type NoSourceDrift<Snapshot, Existing> =
      [DriftKeys<Snapshot, Existing>] extends [never] ? true : false;

    it("M4 preserves full legacy source assignability and required/optional field drift guards", () => {
      type VoiceSnapshot = Extract<AccountReviewRow, { source: "VOICE" }>["transaction"];
      type SmsSnapshot = Extract<AccountReviewRow, { source: "SMS" }>["transaction"];
      type VoiceConforms = VoiceSnapshot extends ParsedVoiceTransaction ? true : false;
      type SmsConforms = SmsSnapshot extends ParsedSmsTransaction ? true : false;
      type LegacyVoiceReasons = NonNullable<ParsedVoiceTransaction["reviewReasons"]>[number];
      type LegacySmsReasons = NonNullable<ParsedSmsTransaction["reviewReasons"]>[number];
      type VoiceReasonsCompatible =
        Exclude<LegacyVoiceReasons, AccountReviewReason> extends never
          ? true
          : false;
      type SmsReasonsCompatible =
        Exclude<LegacySmsReasons, AccountReviewReason> extends never
          ? true
          : false;
      const typeOnlyConformance: readonly [VoiceConforms, SmsConforms] = [true, true];
      const driftGuards: readonly [
        NoSourceDrift<VoiceSnapshot, ParsedVoiceTransaction>,
        NoSourceDrift<SmsSnapshot, ParsedSmsTransaction>,
        VoiceReasonsCompatible,
        SmsReasonsCompatible,
      ] = [true, true, true, true];
      expect(typeOnlyConformance).toEqual([true, true]);
      expect(driftGuards).toEqual([true, true, true, true]);
      expect(accountReviewRowSchema.safeParse(validVoiceRow()).success).toBe(true);
      expect(accountReviewRowSchema.safeParse(validSmsRow()).success).toBe(true);
    });

    it("M4 keeps parser snapshot reasons legacy-only while allowing new row review reasons", () => {
      const voice = validVoiceRow();
      const sms = validSmsRow();
      expect(accountReviewRowSchema.safeParse({
        ...voice,
        transaction: { ...voice.transaction, reviewReasons: ["currency_confirmation_needed"] },
      }).success).toBe(false);
      expect(accountReviewRowSchema.safeParse({
        ...sms,
        transaction: { ...sms.transaction, reviewReasons: ["account_evidence_invalid"] },
      }).success).toBe(false);
      expect(accountReviewRowSchema.safeParse({
        ...voice,
        transaction: { ...voice.transaction, reviewReasons: ["account_needed"] },
        reviewReasons: ["currency_confirmation_needed"],
      }).success).toBe(true);
      expect(accountReviewRowSchema.safeParse({
        ...sms,
        transaction: { ...sms.transaction, reviewReasons: ["low_confidence"] },
        reviewReasons: ["account_evidence_invalid"],
      }).success).toBe(true);
    });

    it("H3 accepts a current reciprocal pending group and matching confirmed group", () => {
      const active = activeVoiceSession();
      expect(accountReviewSessionSchema.safeParse(active).success).toBe(true);
      expect(accountReviewSessionSchema.safeParse({
        ...active,
        rows: [{
          ...active.rows[0],
          assignment: {
            state: "suggested", accountId: null,
            groupId, groupRevision: "0", confirmation: "confirmed",
          },
        }],
        groups: [{
          ...active.groups[0], status: "confirmed",
          confirmedIdentityRevision: "0",
        }],
      }).success).toBe(true);
    });

    it("H3 rejects an active group listing an unrelated unresolved row", () => {
      const active = activeVoiceSession();
      const extraId = "00000000-0000-4000-8000-000000000112";
      const extra = {
        ...validVoiceRow(), rowId: extraId, sourceRef: "voice-extra",
      };
      expect(accountReviewSessionSchema.safeParse({
        ...active,
        rows: [...active.rows, extra],
        groups: [{
          ...active.groups[0], linkedRowIds: [rowId, extraId],
        }],
      }).success).toBe(false);
    });

    it("H3 rejects two active groups claiming one identical row", () => {
      const active = activeVoiceSession();
      const extraGroup: AccountReviewGroup = {
        ...active.groups[0],
        groupId: "00000000-0000-4000-8000-000000000113",
        evidenceKey: "f".repeat(64),
        suggestionRefs: ["other-suggestion"],
      };
      expect(accountReviewSessionSchema.safeParse({
        ...active, groups: [...active.groups, extraGroup],
      }).success).toBe(false);
    });

    it("H3 rejects active group currency inconsistent with linked known review currency", () => {
      const active = activeVoiceSession();
      expect(accountReviewSessionSchema.safeParse({
        ...active, groups: [{ ...active.groups[0], currency: "USD" }],
      }).success).toBe(false);
    });

    it("H3 keeps removed-group tombstones inert when rows detach or belong to another live group", () => {
      const active = activeVoiceSession();
      const removed: AccountReviewGroup = {
        ...active.groups[0], status: "removed",
        confirmedIdentityRevision: "0",
      };
      expect(accountReviewSessionSchema.safeParse({
        ...active, rows: [validVoiceRow()], groups: [removed],
        removedEvidenceKeys: [removed.evidenceKey],
      }).success).toBe(true);
      expect(accountReviewSessionSchema.safeParse({
        ...active,
        groups: [
          active.groups[0],
          {
            ...removed,
            groupId: "00000000-0000-4000-8000-000000000114",
            evidenceKey: "a".repeat(64),
          },
        ],
        removedEvidenceKeys: ["a".repeat(64)],
      }).success).toBe(true);
    });

    it("H4 ordinary Voice and non-ATM SMS rows reject any non-null destination assignment", () => {
      const destination = {
        state: "existing",
        accountId: REVIEW_WIRE_IDS.cashAccountId,
        origin: "user",
        currency: "EGP",
        identityRevision: "0",
      };
      expect(accountReviewRowSchema.safeParse({
        ...validVoiceRow(), toAssignment: destination,
      }).success).toBe(false);
      expect(accountReviewRowSchema.safeParse({
        ...validSmsRow(), toAssignment: destination,
      }).success).toBe(false);
      expect(accountReviewRowSchema.safeParse(validVoiceRow()).success).toBe(true);
      expect(accountReviewRowSchema.safeParse(validSmsRow()).success).toBe(true);
    });

    it("H4 allows only known-currency and distinct account destination for ATM transfer", () => {
      const ordinary = validSmsRow();
      const atm: Extract<AccountReviewRow, { source: "SMS" }> = {
        ...ordinary,
        transaction: { ...ordinary.transaction, isAtmWithdrawal: true },
        toAssignment: {
          state: "existing", accountId: REVIEW_WIRE_IDS.cashAccountId,
          origin: "user", currency: "EGP", identityRevision: "0",
        },
      };
      expect(accountReviewRowSchema.safeParse(atm).success).toBe(true);
      expect(accountReviewRowSchema.safeParse({
        ...atm,
        toAssignment: {
          state: "existing", accountId: REVIEW_WIRE_IDS.bankAccountId,
          origin: "user", currency: "EGP", identityRevision: "0",
        },
      }).success).toBe(false);
      expect(accountReviewRowSchema.safeParse({
        ...atm,
        toAssignment: {
          state: "existing", accountId: REVIEW_WIRE_IDS.cashAccountId,
          origin: "user", currency: "USD", identityRevision: "0",
        },
      }).success).toBe(false);
      expect(accountReviewRowSchema.safeParse({
        ...atm,
        currency: {
          state: "unconfirmed", reason: "ambiguous",
          candidateCodes: ["EGP", "USD"],
          statedCode: null, evidenceSpans: [],
        },
        assignment: {
          state: "unresolved", accountId: null,
          reasonCode: "account_needed", candidateAccountIds: [],
        },
      }).success).toBe(false);
    });

    it("accepts a full locally parsed voice row with required persisted category and scope", () => {
      expect(accountReviewRowSchema.safeParse(validVoiceRow()).success).toBe(true);
      expect(accountReviewSessionSchema.safeParse(validSession()).success).toBe(true);
      expect(accountReviewRowSchema.safeParse({
        ...validVoiceRow(), sourceFingerprint: "not-null",
      }).success).toBe(false);
    });

    it.each(["01", "1.0", "1e3", "-0", "Infinity", "0", "-5"])(
      "rejects noncanonical or nonpositive review amount %s", (amountDecimal) => {
        expect(accountReviewRowSchema.safeParse({
          ...validVoiceRow(), amountDecimal,
        }).success).toBe(false);
      }
    );

    it("requires category identity and rejects invented transaction/reason metadata", () => {
      const row = validVoiceRow();
      expect(accountReviewRowSchema.safeParse({
        ...row, transaction: { ...row.transaction, categoryId: "" },
      }).success).toBe(false);
      expect(accountReviewRowSchema.safeParse({
        ...row, reviewReasons: ["provider_unverified_account"],
      }).success).toBe(false);
      expect(accountReviewRowSchema.safeParse({
        ...row, modelScore: 0.99,
      }).success).toBe(false);
    });

    it("fails closed when a row tries to select an account with unconfirmed currency", () => {
      const row = validVoiceRow();
      expect(accountReviewRowSchema.safeParse({
        ...row,
        currency: {
          state: "unconfirmed",
          reason: "ambiguous",
          candidateCodes: ["EGP", "USD"],
          statedCode: null,
          evidenceSpans: [],
        },
        assignment: {
          state: "existing",
          accountId: REVIEW_WIRE_IDS.bankAccountId,
          origin: "exact",
          currency: "EGP",
          identityRevision: "0",
        },
      }).success).toBe(false);
    });

    it("rejects duplicate review rows, foreign-source rows and dangling group assignments", () => {
      const session = validSession();
      expect(accountReviewSessionSchema.safeParse({
        ...session, rows: [session.rows[0], session.rows[0]],
      }).success).toBe(false);
      expect(accountReviewSessionSchema.safeParse({
        ...session, source: "SMS",
      }).success).toBe(false);
      expect(accountReviewSessionSchema.safeParse({
        ...session,
        rows: [{
          ...session.rows[0],
          assignment: {
            state: "suggested",
            accountId: null,
            groupId,
            groupRevision: "0",
            confirmation: "pending",
          },
        }],
      }).success).toBe(false);
    });

    it("requires explicit shared disclosure and exact stale-prevention revision pairs", () => {
      const common = {
        ownerId: REVIEW_WIRE_IDS.ownerId,
        sessionId,
        expectedReviewRevision: "0",
        expectedOperationGeneration: "0",
      };
      const ungrouped = {
        ...common,
        kind: "select_row",
        rowId,
        expectedRowRevision: "0",
        groupId: null,
        expectedGroupRevision: null,
        hasSharedConfirmationDisclosure: false,
      };
      expect(accountReviewCommandSchema.safeParse(ungrouped).success).toBe(true);
      expect(accountReviewCommandSchema.safeParse({
        ...ungrouped,
        groupId,
        expectedGroupRevision: "1",
        hasSharedConfirmationDisclosure: false,
      }).success).toBe(false);
      expect(accountReviewCommandSchema.safeParse({
        ...ungrouped,
        groupId,
        expectedGroupRevision: null,
        hasSharedConfirmationDisclosure: true,
      }).success).toBe(false);
      expect(accountReviewCommandSchema.safeParse({
        ...ungrouped,
        groupId,
        expectedGroupRevision: "1",
        hasSharedConfirmationDisclosure: true,
      }).success).toBe(true);
      expect(accountReviewCommandSchema.safeParse({
        ...common,
        kind: "set_row_selected",
        rowId,
        expectedRowRevision: "0",
        selected: true,
      }).success).toBe(false);
    });

    it("freezes only canonical save IDs, UTC time and unique selected/group refs", () => {
      const intent = {
        actionId: "00000000-0000-4000-8000-000000000109",
        ownerId: REVIEW_WIRE_IDS.ownerId,
        source: "VOICE",
        sessionId,
        expectedReviewRevision: "0",
        expectedOperationGeneration: "0",
        selectedRows: [{ rowId, revision: "0" }],
        confirmedGroups: [],
        plannedEntityIds: [{
          entity: "transaction",
          localRef: "00000000-0000-4000-8000-000000000110",
          id: "00000000-0000-4000-8000-000000000111",
        }],
        occurredAt: "2026-10-14T12:00:00.000Z",
      };
      expect(accountReviewSaveIntentSchema.safeParse(intent).success).toBe(true);
      expect(accountReviewSaveIntentSchema.safeParse({
        ...intent, selectedRows: [intent.selectedRows[0], intent.selectedRows[0]],
      }).success).toBe(false);
      expect(accountReviewSaveIntentSchema.safeParse({
        ...intent, occurredAt: "2026-10-14T12:00:00.000123Z",
      }).success).toBe(false);
      expect(accountReviewSaveIntentSchema.safeParse({
        ...intent, rawTranscript: REVIEW_VOICE_TRANSCRIPT,
      }).success).toBe(false);
    });
  });
});
