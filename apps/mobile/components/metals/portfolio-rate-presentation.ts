function copyValidDate(value: Date | null): Date | null {
  if (value === null || !Number.isFinite(value.getTime())) return null;
  return new Date(value.getTime());
}

function resolveDateLocale(language: string | undefined): string {
  return language?.startsWith("ar") ? "ar-EG-u-nu-latn" : "en-GB";
}

function normalizeEnglishDayPeriod(value: string): string {
  return value.replace(/\bam\b/giu, "AM").replace(/\bpm\b/giu, "PM");
}

export interface PortfolioRateUpdatedParts {
  readonly date: string;
  readonly time: string;
}

export function formatPortfolioRateUpdatedParts(
  providerObservedAt: Date | null,
  language: string | undefined
): PortfolioRateUpdatedParts | null {
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

  return {
    date,
    time: isArabic
      ? localizedTime
      : normalizeEnglishDayPeriod(localizedTime),
  };
}

export type PortfolioRateTrustState = "fresh" | "stale" | "unknown" | "missing";

export interface PortfolioRateAccessibilityCopy {
  readonly key: string;
  readonly values?: Readonly<Record<string, string>>;
}

// Resolves the trusted rate state into friendly, localized copy. Both the
// visible portfolio rate line and the spoken total use this single source so
// they can never disagree. Fresh rates announce a current rate; stale or
// unknown rates announce the last-updated information (falling back to a short
// state label when there is no observation timestamp); a missing required rate
// announces unavailable even if a stale/invalid observation retained a
// timestamp. No customer-facing age threshold is reintroduced.
export function getPortfolioRateAccessibilityCopy(
  state: PortfolioRateTrustState,
  providerObservedAt: Date | null,
  language: string | undefined
): PortfolioRateAccessibilityCopy {
  switch (state) {
    case "fresh":
      return { key: "portfolio.current_rate" };
    case "stale":
    case "unknown": {
      const parts = formatPortfolioRateUpdatedParts(
        providerObservedAt,
        language
      );
      return parts
        ? { key: "portfolio.rates_updated", values: { ...parts } }
        : { key: `rate.${state}` };
    }
    case "missing":
      return { key: "rate.missing" };
  }
}
