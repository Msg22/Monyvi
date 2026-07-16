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
    let year = slashMatch.groups.year
      ? Number(slashMatch.groups.year)
      : received.getFullYear();
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
    let parsed = new Date(year, month, day, hour, minute);

    if (
      !slashMatch.groups.year &&
      parsed.getTime() > receivedAtMs + MAX_YEARLESS_DATE_FUTURE_MS
    ) {
      year -= 1;
      parsed = new Date(year, month, day, hour, minute);
    }

    if (
      !Number.isNaN(parsed.getTime()) &&
      isValidDateParts(parsed, year, month, day)
    ) {
      return parsed;
    }
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
