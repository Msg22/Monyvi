/**
 * #395 T014-P date-parity controls over the REAL pure normalizer.
 * Source rows reuse canonical schemas and existing synthetic financial inputs.
 */
import {
  accountReviewSmsResponseV2Schema,
  accountReviewVoiceResponseV2Schema,
} from "../schemas";
import type {
  SmsReviewNormalizationInput,
  VoiceReviewNormalizationInput,
} from "../normalization-types";
import { makeSmsInput, makeVoiceInput } from "./normalization-fixtures";

export interface CalendarZoneExample {
  readonly label: string;
  readonly zone: string;
  readonly localMidnight: string;
  readonly utcInstant: string;
}

export const CALENDAR_ZONE_EXAMPLES: readonly CalendarZoneExample[] = [
  {
    label: "Cairo positive UTC+03",
    zone: "Africa/Cairo",
    localMidnight: "2026-10-14T00:00:00+03:00",
    utcInstant: "2026-10-13T21:00:00.000Z",
  },
  {
    label: "New York negative UTC-04",
    zone: "America/New_York",
    localMidnight: "2026-10-14T00:00:00-04:00",
    utcInstant: "2026-10-14T04:00:00.000Z",
  },
  {
    label: "UTC zero offset",
    zone: "UTC",
    localMidnight: "2026-10-14T00:00:00Z",
    utcInstant: "2026-10-14T00:00:00.000Z",
  },
];

/** Date-only UTC timezone interpretation is not a substitute for local YMD. */
export function calendarDayInZone(date: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const fields = new Map(parts.map(({ type, value }) => [type, value]));
  return [fields.get("year"), fields.get("month"), fields.get("day")].join("-");
}

export function makeVoiceDateInput(
  sourceDate: string,
  mappedDate: Date
): ReturnType<typeof makeVoiceInput> {
  const input = makeVoiceInput();
  const original = input.providerResponse.transactions[0];
  if (!original) throw new Error("Missing original canonical Voice finance");
  const financial = { ...original, date: sourceDate };
  return {
    ...input,
    financialRows: [financial],
    mappedTransactions: input.mappedTransactions.map((mapped) => ({
      ...mapped,
      date: mappedDate,
    })),
    providerResponse: {
      ...input.providerResponse,
      transactions: [financial],
    },
  };
}

export function makeSmsDateInput(
  sourceDate: string,
  mappedDate: Date
): ReturnType<typeof makeSmsInput> {
  const input = makeSmsInput();
  const original = input.providerResponse.transactions[0];
  if (!original) throw new Error("Missing original canonical SMS finance");
  const financial = { ...original, date: sourceDate };
  return {
    ...input,
    financialRows: [financial],
    mappedTransactions: input.mappedTransactions.map((mapped) => ({
      ...mapped,
      date: mappedDate,
    })),
    providerResponse: {
      ...input.providerResponse,
      transactions: [financial],
    },
  };
}

export function canonicalVoiceDate(
  sourceDate: string,
  mappedDate: Date
): VoiceReviewNormalizationInput {
  const input = makeVoiceDateInput(sourceDate, mappedDate);
  if (
    !accountReviewVoiceResponseV2Schema.safeParse(input.providerResponse)
      .success
  ) {
    throw new Error("Invalid requested canonical Voice date fixture");
  }
  return input;
}

export function canonicalSmsDate(
  sourceDate: string,
  mappedDate: Date
): SmsReviewNormalizationInput {
  const input = makeSmsDateInput(sourceDate, mappedDate);
  if (
    !accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success
  ) {
    throw new Error("Invalid requested canonical SMS date fixture");
  }
  return input;
}
