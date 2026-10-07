export function formatRateAge(
  ageMs: number | null,
  locale: string
): string | null {
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) return null;
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
      -minutes,
      "minute"
    );
  }
  const hours = Math.floor(ageMs / 3_600_000);
  if (hours < 24) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(
      -hours,
      "hour"
    );
  }
  const days = Math.floor(hours / 24);
  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(
    -Math.max(1, days),
    "day"
  );
}
