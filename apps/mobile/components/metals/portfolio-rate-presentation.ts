function copyValidDate(value: Date | null): Date | null {
  if (value === null || !Number.isFinite(value.getTime())) return null;
  return new Date(value.getTime());
}

function resolveDateLocale(language: string | undefined): string {
  return language?.startsWith("ar") ? "ar-EG-u-nu-latn" : "en-GB";
}

function normalizeEnglishDayPeriod(value: string): string {
  return value.replace(/\bam\b/iu, "AM").replace(/\bpm\b/iu, "PM");
}

export function formatPortfolioRateUpdated(
  providerObservedAt: Date | null,
  language: string | undefined
): string | null {
  const observedAt = copyValidDate(providerObservedAt);
  if (observedAt === null) return null;

  const isArabic = language?.startsWith("ar") ?? false;
  const locale = resolveDateLocale(language);
  const date = observedAt.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const localizedTime = observedAt.toLocaleTimeString(locale, {
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
  });
  const time = isArabic
    ? localizedTime
    : normalizeEnglishDayPeriod(localizedTime);

  return isArabic
    ? `آخر تحديث للأسعار: ${date}، ${time}. قد تكون تغيّرت بعد ذلك.`
    : `Prices last updated ${date} at ${time}. They may have changed since then.`;
}
