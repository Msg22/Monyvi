/**
 * #395 T014-P tests-first date parity. Real parseAiDate and pure normalizer:
 * calendar source YYYY-MM-DD is local; strict UTC timestamp is an instant.
 * Run the host-local tests under Africa/Cairo, America/New_York and UTC in
 * Root's TZ matrix; the explicit offset examples remain timezone independent.
 */
import type { ParsedVoiceTransaction } from "../../types";
import { parseAiDate } from "../../utils/ai-parser-utils";
import {
  accountReviewSmsFinancialRowSchema,
  accountReviewVoiceFinancialRowSchema,
  accountReviewVoiceResponseV2Schema,
} from "../parser-schemas";
import {
  calendarDate, sourceDate, strictUtcTimestamp,
} from "../schema-primitives";
import { normalizeAccountReviewParserResult } from "../normalization";
import { NORMALIZATION_IDS } from "./normalization-fixtures";
import {
  CALENDAR_ZONE_EXAMPLES,
  calendarDayInZone,
  canonicalSmsDate,
  canonicalVoiceDate,
  makeSmsDateInput,
  makeVoiceDateInput,
} from "./normalization-date-fixtures";

describe("#395 date-only local calendar mapping", () => {
  it("preserves original Voice YYYY-MM-DD through real parseAiDate local midnight", async () => {
    const expectedDay = "2026-10-14";
    const localMidnight = parseAiDate(expectedDay);
    expect(localMidnight.getFullYear()).toBe(2026);
    expect(localMidnight.getMonth()).toBe(9);
    expect(localMidnight.getDate()).toBe(14);
    expect(localMidnight.getHours()).toBe(0);
    expect(localMidnight.getMinutes()).toBe(0);
    expect(calendarDate.safeParse(expectedDay).success).toBe(true);
    const input = canonicalVoiceDate(expectedDay, localMidnight);
    expect(accountReviewVoiceResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);

    const session = await normalizeAccountReviewParserResult(input);
    expect(session.rows).toHaveLength(1);
    const row = session.rows[0];
    if (!row || row.source !== "VOICE") throw new Error("Missing Voice day row");
    expect(row.transaction.date.getTime()).toBe(localMidnight.getTime());
    expect(row.transaction.date.getDate()).toBe(14);
    expect(row.transaction.amount).toBe(50);
    expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.foodCategory);
    expect(row.selected).toBe(false);
  });

  it("uses identical local calendar semantics for an SMS date-only financial row", async () => {
    const localMidnight = parseAiDate("2026-10-14");
    const input = canonicalSmsDate("2026-10-14", localMidnight);
    const session = await normalizeAccountReviewParserResult(input);
    const row = session.rows[0];
    if (!row || row.source !== "SMS") throw new Error("Missing SMS day row");
    expect(row.transaction.date.getTime()).toBe(localMidnight.getTime());
    expect(row.transaction.date.getDate()).toBe(14);
    expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.shoppingCategory);
    expect(row.transaction.amount).toBe(50);
    expect(row.sourceFingerprint).toBe(NORMALIZATION_IDS.smsFingerprint);
  });

  it.each(CALENDAR_ZONE_EXAMPLES)(
    "$label midnight has the original calendar day despite its UTC offset",
    ({ zone, localMidnight, utcInstant }) => {
      const mapped = parseAiDate(localMidnight);
      expect(mapped.toISOString()).toBe(utcInstant);
      expect(calendarDayInZone(mapped, zone)).toBe("2026-10-14");
      expect(calendarDate.safeParse("2026-10-14").success).toBe(true);
      if (zone === "Africa/Cairo") {
        expect(mapped.toISOString().slice(0, 10)).toBe("2026-10-13");
      }
    }
  );

  it("rejects a different local calendar day even when both source dates are valid", async () => {
    const input = canonicalVoiceDate("2026-10-14", parseAiDate("2026-10-15"));
    await expect(normalizeAccountReviewParserResult(input))
      .rejects.toThrow("account_review_voice_mapping_missing");
  });

  it("rejects an SMS mapped date from the wrong calendar day", async () => {
    const input = canonicalSmsDate("2026-10-14", parseAiDate("2026-10-15"));
    await expect(normalizeAccountReviewParserResult(input))
      .rejects.toThrow("account_review_financial_date_mismatch");
  });
});

describe("#395 canonical ISO timestamps are exact instants, not calendar days", () => {
  it.each(CALENDAR_ZONE_EXAMPLES)(
    "accepts the exact same $label instant represented with its local offset",
    async ({ zone, localMidnight, utcInstant }) => {
      const input = canonicalVoiceDate(utcInstant, parseAiDate(localMidnight));
      expect(strictUtcTimestamp.safeParse(utcInstant).success).toBe(true);
      const session = await normalizeAccountReviewParserResult(input);
      const row = session.rows[0];
      if (!row || row.source !== "VOICE") throw new Error("Missing Voice instant");
      expect(row.transaction.date.toISOString()).toBe(utcInstant);
      expect(calendarDayInZone(row.transaction.date, zone)).toBe("2026-10-14");
      expect(row.transaction.amount).toBe(50);
      expect(row.currency.state).toBe("known");
    }
  );

  it("rejects two different instants on the SAME UTC calendar day", async () => {
    const canonical = "2026-10-14T08:30:00.000Z";
    const changedInstant = new Date("2026-10-14T15:45:00.000Z");
    expect(canonical.slice(0, 10)).toBe(changedInstant.toISOString().slice(0, 10));
    const input = canonicalVoiceDate(canonical, changedInstant);
    await expect(normalizeAccountReviewParserResult(input))
      .rejects.toThrow("account_review_voice_mapping_missing");
  });

  it("rejects a different SMS instant even when UTC date is unchanged", async () => {
    const input = canonicalSmsDate(
      "2026-10-14T10:00:00.000Z",
      new Date("2026-10-14T10:00:00.001Z")
    );
    await expect(normalizeAccountReviewParserResult(input))
      .rejects.toThrow("account_review_financial_date_mismatch");
  });

  it("accepts exact strict UTC milliseconds but not offset or truncated timestamp source", () => {
    expect(sourceDate.safeParse("2026-10-14T23:59:59.999Z").success).toBe(true);
    expect(sourceDate.safeParse("2026-10-14T23:59:59Z").success).toBe(false);
    expect(sourceDate.safeParse("2026-10-14T23:59:59.999+03:00").success).toBe(false);
  });
});

describe("#395 date errors must not weaken existing financial identity", () => {
  it("rejects unreal calendar dates before normalization accepts them", async () => {
    const source = "2026-02-30";
    const input = makeVoiceDateInput(source, parseAiDate("2026-02-28"));
    expect(calendarDate.safeParse(source).success).toBe(false);
    expect(accountReviewVoiceFinancialRowSchema.safeParse(input.financialRows[0]).success)
      .toBe(false);
    await expect(normalizeAccountReviewParserResult(input)).rejects.toThrow();
  });

  it("rejects invalid canonical SMS financial dates without a fallback", async () => {
    const input = makeSmsDateInput("2026-10-14T10:00:00Z", new Date());
    expect(sourceDate.safeParse(input.financialRows[0]?.date).success).toBe(false);
    expect(accountReviewSmsFinancialRowSchema.safeParse(input.financialRows[0]).success)
      .toBe(false);
    await expect(normalizeAccountReviewParserResult(input)).rejects.toThrow();
  });

  it("rejects an invalid mapped Date even for valid source YYYY-MM-DD", async () => {
    const input = canonicalSmsDate("2026-10-14", new Date(Number.NaN));
    await expect(normalizeAccountReviewParserResult(input))
      .rejects.toThrow("account_review_financial_date_mismatch");
  });

  it("continues rejecting amount, category, type, currency, name and note mismatches", async () => {
    const input = canonicalVoiceDate("2026-10-14", parseAiDate("2026-10-14"));
    const original = input.mappedTransactions[0];
    if (!original) throw new Error("Missing original mapped Voice finance");
    const wrong: readonly ParsedVoiceTransaction[] = [
      { ...original, amount: 51 },
      { ...original, categoryId: NORMALIZATION_IDS.shoppingCategory },
      { ...original, type: "INCOME" },
      { ...original, currency: "USD" },
      { ...original, counterparty: "Different merchant" },
      { ...original, note: "Different description" },
    ];
    for (const mapped of wrong) {
      await expect(normalizeAccountReviewParserResult({
        ...input, mappedTransactions: [mapped],
      })).rejects.toThrow("account_review_voice_mapping_missing");
    }
  });
});
