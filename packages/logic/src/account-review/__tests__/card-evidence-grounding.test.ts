/**
 * #395 T014/T019 card-evidence Red: real canonical parser normalization,
 * original submitted source spans, owned two-card context and pure resolver.
 * No mocked normalizer, resolver, provider, database or selection result.
 */
import {
  accountReviewSmsResponseV2Schema,
  accountReviewVoiceResponseV2Schema,
  type AccountReviewSession,
} from "../schemas";
import { normalizeAccountReviewParserResult } from "../normalization";
import { resolveAccountReviewSession } from "../resolution";
import type { AccountReviewNormalizationInput } from "../normalization-types";
import type { AccountReviewEvidenceSpan } from "../parser-schemas";
import { hasSourceCardSuffixSpan } from "../normalization-card-grounding";
import {
  CARD_PROOF_IDS,
  smsCardFixture,
  voiceCardFixture,
  type CardEvidenceVariant,
  type GroundedCardFixture,
} from "./card-evidence-grounding-fixtures";

const sources = ["SMS", "VOICE"] as const;
type Source = (typeof sources)[number];

function fixtureFor(
  source: Source,
  variant: CardEvidenceVariant,
  withSuggestion = false
): GroundedCardFixture {
  return source === "SMS"
    ? smsCardFixture(variant, withSuggestion)
    : voiceCardFixture(variant, withSuggestion);
}

function acceptedWire(input: AccountReviewNormalizationInput): boolean {
  return input.source === "SMS"
    ? accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success
    : accountReviewVoiceResponseV2Schema.safeParse(input.providerResponse)
        .success;
}

function onlyRow(
  session: AccountReviewSession
): AccountReviewSession["rows"][number] {
  const row = session.rows[0];
  if (!row || session.rows.length !== 1) {
    throw new Error("Expected the retained one-row canonical finance");
  }
  return row;
}

async function normalizeAndResolve(fixture: GroundedCardFixture): Promise<{
  readonly normalized: AccountReviewSession;
  readonly resolved: AccountReviewSession;
}> {
  const normalized = await normalizeAccountReviewParserResult(fixture.input);
  const resolved = resolveAccountReviewSession({
    session: normalized,
    accountSnapshots: fixture.input.reviewAccountSnapshots,
  });
  return { normalized, resolved };
}

type ReviewCurrencyExpectation = "known" | "unconfirmed";

function expectFinancialPreserved(
  fixture: GroundedCardFixture,
  normalized: AccountReviewSession,
  reviewCurrency: ReviewCurrencyExpectation = "known"
): void {
  const row = onlyRow(normalized);
  expect(row.transaction.source).toBe(fixture.input.source);
  expect(row.transaction.amount).toBe(fixture.amount);
  expect(row.transaction.currency).toBe("EGP");
  expect(fixture.input.financialRows[0]?.currency).toBe("EGP");
  expect(row.amountDecimal).toBe(String(fixture.amount));
  if (reviewCurrency === "known") {
    expect(row.currency).toMatchObject({ state: "known", code: "EGP" });
  } else {
    // Invalid advisory cannot establish review currency provenance.
    // It does not erase EGP from the validated original financial source.
    expect(row.currency).toMatchObject({
      state: "unconfirmed",
      reason: "legacy_unknown",
    });
  }
  expect(row.selected).toBe(false);
  expect(normalized.saveIntent).toBeNull();
}

function expectNoUnprovenCardChoice(
  fixture: GroundedCardFixture,
  normalized: AccountReviewSession,
  resolved: AccountReviewSession,
  reviewCurrency: ReviewCurrencyExpectation = "known"
): void {
  expectFinancialPreserved(fixture, normalized, reviewCurrency);
  expect(fixture.input.reviewAccountSnapshots.accounts).toHaveLength(2);
  expect(
    fixture.input.reviewAccountSnapshots.accounts.every(
      (account) => account.isDefault === false
    )
  ).toBe(true);
  expect(
    fixture.input.reviewAccountSnapshots.accounts.map(
      (account) => account.cardLast4
    )
  ).toEqual([CARD_PROOF_IDS.firstSuffix, CARD_PROOF_IDS.secondSuffix]);
  // A model-only suffix must not become a proven card-specific shared group.
  expect(
    normalized.groups.some((group) => group.cardLast4 === fixture.claimedSuffix)
  ).toBe(false);
  const row = onlyRow(resolved);
  expect(
    row.assignment.state === "existing" &&
      row.assignment.accountId === fixture.expectedAccountId
  ).toBe(false);
  expect(row.selected).toBe(false);
  expect(row.reviewReasons.length).toBeGreaterThan(0);
}

describe("#395 T014/T019 exact submitted card evidence — two owned QNB cards", () => {
  it.each(sources)(
    "%s: bank-only evidence cannot use provider's owned card suffix to resolve one card",
    async (source) => {
      const fixture = fixtureFor(source, "bank_only");
      // The original closed schema accepts this adversarial but well-formed
      // envelope. Trust must therefore be enforced at source grounding.
      expect(acceptedWire(fixture.input)).toBe(true);
      const { normalized, resolved } = await normalizeAndResolve(fixture);
      expectNoUnprovenCardChoice(fixture, normalized, resolved);
    }
  );

  it.each(sources)(
    "%s: a matched suggestion/candidate ID does not prove the model's suffix",
    async (source) => {
      const fixture = fixtureFor(source, "bank_only", true);
      expect(acceptedWire(fixture.input)).toBe(true);
      const { normalized, resolved } = await normalizeAndResolve(fixture);
      expectNoUnprovenCardChoice(fixture, normalized, resolved);
    }
  );

  it.each(sources)(
    "%s: independently submitted bank and card-ending spans resolve only the right owned card",
    async (source) => {
      const fixture = fixtureFor(source, "card_context");
      expect(acceptedWire(fixture.input)).toBe(true);
      const { normalized, resolved } = await normalizeAndResolve(fixture);
      expectFinancialPreserved(fixture, normalized);
      const row = onlyRow(resolved);
      expect(row.assignment).toMatchObject({
        state: "existing",
        origin: "exact",
        accountId: CARD_PROOF_IDS.first,
        currency: "EGP",
      });
      expect(row.reviewReasons).toEqual([]);
      expect(row.selected).toBe(false);
      expect(normalized.groups).toHaveLength(0);
    }
  );

  it.each(sources)(
    "%s: real card-ending proof may keep one pending suggested identity, without selecting it",
    async (source) => {
      const fixture = fixtureFor(source, "card_context", true);
      expect(acceptedWire(fixture.input)).toBe(true);
      const { normalized, resolved } = await normalizeAndResolve(fixture);
      expectFinancialPreserved(fixture, normalized);
      expect(normalized.groups).toHaveLength(1);
      const group = normalized.groups[0];
      expect(group).toMatchObject({
        type: "BANK",
        currency: "EGP",
        cardLast4: CARD_PROOF_IDS.firstSuffix,
        status: "pending",
      });
      const row = onlyRow(resolved);
      expect(row.assignment).toMatchObject({
        state: "suggested",
        groupId: group?.groupId,
        confirmation: "pending",
      });
      expect(row.selected).toBe(false);
    }
  );

  it.each(["masked_english", "masked_arabic", "ending_arabic"] as const)(
    "%s original masked/card-ending phrase keeps an independently grounded choice",
    async (variant) => {
      for (const source of sources) {
        const fixture = fixtureFor(source, variant);
        expect(acceptedWire(fixture.input)).toBe(true);
        const { normalized, resolved } = await normalizeAndResolve(fixture);
        expectFinancialPreserved(fixture, normalized);
        expect(onlyRow(resolved).assignment).toMatchObject({
          state: "existing",
          origin: "exact",
          accountId: CARD_PROOF_IDS.first,
          currency: "EGP",
        });
        expect(onlyRow(resolved).reviewReasons).toEqual([]);
        expect(onlyRow(resolved).selected).toBe(false);
        expect(normalized.groups).toHaveLength(0);
      }
    }
  );

  // Each evidence span ends exactly at the FIRST group, but the immutable
  // original source continues with more card-number digits beyond that span.
  it.each([
    ["card number 0007 1234", "card number 0007"],
    ["card number 0007-1234", "card number 0007"],
    ["بطاقة رقم ٠٠٠٧ ١٢٣٤", "بطاقة رقم ٠٠٠٧"],
    ["بطاقة رقم ٠٠٠٧-١٢٣٤", "بطاقة رقم ٠٠٠٧"],
  ] as const)(
    "%s: a clipped UTF-16 evidence span cannot hide continued source digits",
    (original, fragment) => {
      const start = original.indexOf(fragment);
      const span: AccountReviewEvidenceSpan = {
        sourceRef: "synthetic-original-record",
        field: "body",
        start,
        end: start + fragment.length,
        text: fragment,
      };
      expect(original.slice(span.start, span.end)).toBe(span.text);
      expect(hasSourceCardSuffixSpan(original, span, "0007")).toBe(false);
    }
  );

  it.each([
    "continued_space",
    "continued_hyphen",
    "continued_arabic_space",
    "continued_arabic_hyphen",
  ] as const)(
    "%s: complete SMS/Voice source rejects first grouped digits despite valid clipped span and candidate",
    async (variant) => {
      for (const source of sources) {
        for (const withSuggestion of [false, true]) {
          const fixture = fixtureFor(source, variant, withSuggestion);
          expect(acceptedWire(fixture.input)).toBe(true);
          const { normalized, resolved } = await normalizeAndResolve(fixture);
          expectNoUnprovenCardChoice(fixture, normalized, resolved);
        }
      }
    }
  );

  // The matched UTF-16 evidence can end at four digits although an untrusted
  // longer/grouped original card number continues through Unicode punctuation.
  it.each([
    ["card number 0007 (1234)", "card number 0007"],
    ["card number 0007 [1234]", "card number 0007"],
    ["بطاقة رقم ٠٠٠٧ (١٢٣٤)", "بطاقة رقم ٠٠٠٧"],
    ["بطاقة رقم ٠٠٠٧ [١٢٣٤]", "بطاقة رقم ٠٠٠٧"],
    ["card number 0007\u200e(1234)", "card number 0007"],
    ["بطاقة رقم ٠٠٠٧\u200f[١٢٣٤]", "بطاقة رقم ٠٠٠٧"],
  ] as const)(
    "%s: original-source punctuation/formatting cannot hide the next numeric group",
    (original, fragment) => {
      const start = original.indexOf(fragment);
      const span: AccountReviewEvidenceSpan = {
        sourceRef: "synthetic-original-record",
        field: "body",
        start,
        end: start + fragment.length,
        text: fragment,
      };
      expect(start).toBeGreaterThanOrEqual(0);
      expect(original.slice(span.start, span.end)).toBe(span.text);
      expect(hasSourceCardSuffixSpan(original, span, "0007")).toBe(false);
    }
  );

  it.each([
    ["card ending 0007. Payment completed", "card ending 0007"],
    ["بطاقتك المنتهية بـ ٠٠٠٧، تم الخصم", "بطاقتك المنتهية بـ ٠٠٠٧"],
  ] as const)(
    "%s: punctuation followed by independent words preserves genuine last-four proof",
    (original, fragment) => {
      const start = original.indexOf(fragment);
      const span: AccountReviewEvidenceSpan = {
        sourceRef: "synthetic-original-record",
        field: "body",
        start,
        end: start + fragment.length,
        text: fragment,
      };
      expect(original.slice(span.start, span.end)).toBe(span.text);
      expect(hasSourceCardSuffixSpan(original, span, "0007")).toBe(true);
    }
  );

  it.each([
    "continued_parenthesis",
    "continued_bracket",
    "continued_arabic_parenthesis",
    "continued_arabic_bracket",
    "continued_arabic_rtl_format",
  ] as const)(
    "%s: SMS/Voice never resolves clipped grouped card digits with/without suggestion",
    async (variant) => {
      for (const source of sources) {
        for (const withSuggestion of [false, true]) {
          const fixture = fixtureFor(source, variant, withSuggestion);
          expect(acceptedWire(fixture.input)).toBe(true);
          const { normalized, resolved } = await normalizeAndResolve(fixture);
          expectNoUnprovenCardChoice(fixture, normalized, resolved);
        }
      }
    }
  );

  // The original source can continue directly with a DIFFERENT Unicode
  // numeric script, even when the provider clips a truthful ASCII/Arabic span.
  it.each([
    ["QNB card number 0007１２３４", "card number 0007"],
    ["QNB card number 0007۱۲۳۴", "card number 0007"],
    ["بطاقة رقم ٠٠٠٧१२३४", "بطاقة رقم ٠٠٠٧"],
  ] as const)(
    "%s: immediately adjacent Unicode digits cannot be an asserted last4",
    (original, fragment) => {
      const start = original.indexOf(fragment);
      const span: AccountReviewEvidenceSpan = {
        sourceRef: "synthetic-original-record",
        field: "body",
        start,
        end: start + fragment.length,
        text: fragment,
      };
      expect(start).toBeGreaterThanOrEqual(0);
      expect(original.slice(span.start, span.end)).toBe(span.text);
      expect(hasSourceCardSuffixSpan(original, span, "0007")).toBe(false);
    }
  );

  it.each(["continued_adjacent_fullwidth"] as const)(
    "%s: real SMS/Voice never resolves claimed card from clipped adjacent Unicode digits",
    async (variant) => {
      for (const source of sources) {
        for (const withSuggestion of [false, true]) {
          const fixture = fixtureFor(source, variant, withSuggestion);
          expect(acceptedWire(fixture.input)).toBe(true);
          const { normalized, resolved } = await normalizeAndResolve(fixture);
          expectNoUnprovenCardChoice(fixture, normalized, resolved);
        }
      }
    }
  );

  it.each(["reference_digits", "amount_digits", "phone_digits"] as const)(
    "bank+numeric %s must not pass as independent card proof in SMS or Voice",
    async (variant) => {
      for (const source of sources) {
        const fixture = fixtureFor(source, variant);
        // Correct offsets alone do not prove *what* the digits identify.
        expect(acceptedWire(fixture.input)).toBe(true);
        const { normalized, resolved } = await normalizeAndResolve(fixture);
        expectNoUnprovenCardChoice(fixture, normalized, resolved);
      }
    }
  );

  it.each(["wrong_span", "other_message", "foreign_suffix"] as const)(
    "%s cannot ground a claimed card or drop valid SMS/Voice finance",
    async (variant) => {
      for (const source of sources) {
        const fixture = fixtureFor(source, variant, true);
        const { normalized, resolved } = await normalizeAndResolve(fixture);
        expectNoUnprovenCardChoice(
          fixture,
          normalized,
          resolved,
          variant === "foreign_suffix" ||
            (variant === "wrong_span" && source === "SMS") ||
            (variant === "other_message" && source === "VOICE")
            ? "known"
            : "unconfirmed"
        );
      }
    }
  );
});
