const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;
const MAX_YEARLESS_DATE_FUTURE_MS = 24 * 60 * 60 * 1000;

function isValidDateParts(
  date: Date,
  year: number,
  month: number,
  day: number
): boolean {
  return (
    date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
  );
}

function parseSlashDate(
  day: number,
  month: number,
  explicitYear: number | null,
  hour: number,
  minute: number,
  receivedAtMs: number
): Date | null {
  const received = new Date(receivedAtMs);
  let year = explicitYear ?? received.getFullYear();
  let parsed = new Date(year, month, day, hour, minute);

  if (
    explicitYear === null &&
    parsed.getTime() > receivedAtMs + MAX_YEARLESS_DATE_FUTURE_MS
  ) {
    year -= 1;
    parsed = new Date(year, month, day, hour, minute);
  }

  return !Number.isNaN(parsed.getTime()) &&
    isValidDateParts(parsed, year, month, day)
    ? parsed
    : null;
}

export function isValidLocalSmsTransactionDate(
  value: string,
  receivedAtMs: number
): boolean {
  const match =
    /^(?<day>\d{1,2})\/(?<month>\d{1,2})(?:\/(?<year>\d{4}))?$/.exec(value);
  if (match?.groups === undefined) return false;

  return (
    parseSlashDate(
      Number(match.groups.day),
      Number(match.groups.month) - 1,
      match.groups.year === undefined ? null : Number(match.groups.year),
      0,
      0,
      receivedAtMs
    ) !== null
  );
}

export function parseLocalSmsMessageDate(
  body: string,
  receivedAtMs: number
): Date {
  const received = new Date(receivedAtMs);
  const slashMatch =
    /(?:on\s+)?(?<day>\d{1,2})\/(?<month>\d{1,2})(?:\/(?<year>\d{4}))?(?:\s+(?:at\s+)?(?<hour>\d{1,2}):(?<minute>\d{2})(?:\s*(?<meridiem>AM|PM))?)?/i.exec(
      body
    );

  if (slashMatch?.groups) {
    const day = Number(slashMatch.groups.day);
    const month = Number(slashMatch.groups.month) - 1;
    const explicitYear = slashMatch.groups.year
      ? Number(slashMatch.groups.year)
      : null;
    const parsedHour = slashMatch.groups.hour
      ? Number(slashMatch.groups.hour)
      : 0;
    const meridiem = slashMatch.groups.meridiem?.toUpperCase();
    const hour =
      meridiem === "AM"
        ? parsedHour % 12
        : meridiem === "PM"
          ? (parsedHour % 12) + 12
          : parsedHour;
    const minute = slashMatch.groups.minute
      ? Number(slashMatch.groups.minute)
      : 0;
    const parsed = parseSlashDate(
      day,
      month,
      explicitYear,
      hour,
      minute,
      receivedAtMs
    );

    if (parsed !== null) return parsed;
  }

  const monthMatch = /(?<day>\d{1,2})-(?<month>[A-Z]{3})-(?<year>\d{4})/i.exec(
    body
  );

  if (monthMatch?.groups) {
    const monthIndex = MONTH_NAMES.indexOf(
      monthMatch.groups.month.toUpperCase() as (typeof MONTH_NAMES)[number]
    );

    if (monthIndex >= 0) {
      const day = Number(monthMatch.groups.day);
      const year = Number(monthMatch.groups.year);
      const parsed = new Date(year, monthIndex, day);

      if (
        !Number.isNaN(parsed.getTime()) &&
        isValidDateParts(parsed, year, monthIndex, day)
      ) {
        return parsed;
      }
    }
  }

  return received;
}
