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
    /(?:on\s+)?(?<day>\d{1,2})\/(?<month>\d{1,2})(?:\/(?<year>\d{4}))?(?:\s+(?<hour>\d{1,2}):(?<minute>\d{2}))?/i.exec(
      body
    );

  if (slashMatch?.groups) {
    const day = Number(slashMatch.groups.day);
    const month = Number(slashMatch.groups.month) - 1;
    const year = slashMatch.groups.year
      ? Number(slashMatch.groups.year)
      : received.getFullYear();
    const hour = slashMatch.groups.hour ? Number(slashMatch.groups.hour) : 0;
    const minute = slashMatch.groups.minute
      ? Number(slashMatch.groups.minute)
      : 0;
    const parsed = new Date(year, month, day, hour, minute);

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
